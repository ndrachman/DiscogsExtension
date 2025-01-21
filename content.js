(function() {
function log(message) {
    console.log(`[Discogs Filter] ${message}`);
}

// Add loading indicator
function showLoadingIndicator() {
    const existing = document.querySelector('.ships-from-loading');
    if (existing) return;

    const loader = document.createElement('div');
    loader.className = 'ships-from-loading';
    loader.innerHTML = `
        <div style="
            padding: 10px;
            margin: 10px 0;
            background-color: #f0f0f0;
            border-radius: 4px;
            text-align: center;
        ">
            Loading country filter... This may take a minute as we analyze all available items.
        </div>
    `;
    
    const marketplaceHeader = document.querySelector('.marketplace_filters_container, .pagination.top');
    if (marketplaceHeader) {
        marketplaceHeader.parentNode.insertBefore(loader, marketplaceHeader.nextSibling);
    }
}

function hideLoadingIndicator() {
    const loader = document.querySelector('.ships-from-loading');
    if (loader) {
        loader.remove();
    }
}

// Add new state management for all items
let allItems = [];
let currentFilter = {
    country: '',
    totalItems: 0,
    currentPage: 1,
    itemsPerPage: 25
};


// Also modify fetchAllItems to include more logging

async function fetchAllItems() {

    // Gets total number of pages from pagination
    // Fetches items from all pages (250 items per page)
    // Combines current page items with items from other pages
    // Returns array of all items with their shipping countries

    log('Starting fetchAllItems');
    
    const paginationText = document.querySelector('.pagination_total');
    if (!paginationText) {
        log('ERROR: Could not find pagination total element');
        return [];
    }
    
    let totalItems = 0;
    const match = paginationText.textContent.match(/of ([\d,]+)/);
    if (match) {
        totalItems = parseInt(match[1].replace(/,/g, ''));
        log(`Found total items: ${totalItems}`);
    } else {
        log('ERROR: Could not parse total items from pagination text');
        return [];
    }
    
    // Get current URL and base parameters
    const baseUrl = new URL(window.location.href);
    const itemsPerPage = 250; // Maximum items per page on Discogs
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    allItems = [];
    
    // Fetch first page (current page)
    const currentPageItems = parseCurrentPage();
    allItems = allItems.concat(currentPageItems);
    
    // Fetch remaining pages
    const fetchPromises = [];
    for (let page = 1; page <= totalPages; page++) {
        if (page === currentFilter.currentPage) continue;
        
        const pageUrl = new URL(baseUrl);
        pageUrl.searchParams.set('limit', itemsPerPage);
        pageUrl.searchParams.set('page', page);
        
        fetchPromises.push(
            fetch(pageUrl)
                .then(response => response.text())
                .then(html => {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, 'text/html');
                    return parseItemsFromDocument(doc);
                })
                .catch(error => {
                    log(`Error fetching page ${page}: ${error}`);
                    return [];
                })
        );
    }
    
    const additionalItems = await Promise.all(fetchPromises);
    allItems = allItems.concat(...additionalItems);
    
    log(`Fetched total of ${allItems.length} items`);
    return allItems;
}

function parseCurrentPage() {
    return parseItemsFromDocument(document);
}

function parseItemsFromDocument(doc) {
    const items = [];
    const rows = doc.querySelectorAll('.table_block.mpitems tbody tr');
    
    rows.forEach(row => {
        const sellerInfo = row.querySelector('.seller_info');
        if (sellerInfo) {
            const shipsFromLine = Array.from(sellerInfo.querySelectorAll('li'))
                .find(li => li.textContent.includes('Ships From:'));
            
            if (shipsFromLine) {
                const country = shipsFromLine.textContent.replace('Ships From:', '').trim();
                items.push({
                    element: row.cloneNode(true),
                    country: country
                });
            }
        }
    });
    
    return items;
}

async function injectFilter() {
    log('Starting injectFilter function');
    
    if (document.querySelector('.ships-from-filter')) {
        log('Filter already exists, skipping injection');
        return;
    }

    showLoadingIndicator();
    log('Loading indicator shown');

    try {
        log('Attempting to fetch all items...');
        const items = await fetchAllItems();
        log(`Successfully fetched ${items.length} items`);
        
        const filterContainer = document.createElement('div');
        filterContainer.className = 'ships-from-filter';
        filterContainer.style.padding = '10px';
        filterContainer.style.backgroundColor = '#f5f5f5';
        filterContainer.style.marginBottom = '15px';
        
        const countries = getUniqueCountries();
        log(`Found ${countries.length} unique countries`);
        
        const filterContent = document.createElement('div');
        filterContent.innerHTML = `
            <span style="margin-right: 8px;">Filter by Ships From:</span>
            <select id="shipsFromSelect" style="padding: 4px; border-radius: 3px;">
                <option value="">All Countries</option>
                ${countries.map(country => `
                    <option value="${country}">${country}</option>
                `).join('')}
            </select>
        `;
        
        filterContainer.appendChild(filterContent);
        
        // Try multiple potential insertion points
        let inserted = false;
        const insertionPoints = [
            '.marketplace_filters_container',
            '.pagination.top',
            '.table_block.mpitems'
        ];
        
        for (const selector of insertionPoints) {
            const target = document.querySelector(selector);
            if (target) {
                log(`Found insertion point: ${selector}`);
                target.parentNode.insertBefore(filterContainer, target.nextSibling);
                inserted = true;
                break;
            }
        }
        
        if (!inserted) {
            log('ERROR: Could not find any valid insertion point');
            throw new Error('No valid insertion point found');
        }
        
        const select = document.getElementById('shipsFromSelect');
        select.addEventListener('change', filterTableByCountry);
        
        log('Filter successfully injected');
        hideLoadingIndicator();
    } catch (error) {
        log(`Error in injectFilter: ${error.toString()}`);
        console.error('Full error:', error);
        hideLoadingIndicator();
    }
}



function getUniqueCountries() {
    // Use allItems instead of current page
    const countries = new Set(allItems.map(item => item.country));
    return Array.from(countries).sort();
}





function filterTableByCountry(event) {
    const selectedCountry = event.target.value;
    currentFilter.country = selectedCountry;
    log(`Filtering for country: ${selectedCountry}`);
    
    // Only reset page when changing filters (not during pagination or dropdown changes)
    if (!event.isPageChange) {
        currentFilter.currentPage = 1;
    }
    
    // Get current items per page from Discogs' native dropdown
    const showDropdown = document.querySelector('select[name="limit"]');
    currentFilter.itemsPerPage = showDropdown ? parseInt(showDropdown.value) : 25;
    
    // Filter items
    const filteredItems = selectedCountry ? 
        allItems.filter(item => item.country === selectedCountry) :
        allItems;
    
    // Update pagination info without replacing the structure
    currentFilter.totalItems = filteredItems.length;
    
    // Calculate page items
    const startIndex = (currentFilter.currentPage - 1) * currentFilter.itemsPerPage;
    const endIndex = startIndex + currentFilter.itemsPerPage;
    const pageItems = filteredItems.slice(startIndex, endIndex);
    
    // Update table content only
    const tableBody = document.querySelector('.table_block.mpitems tbody');
    if (tableBody) {
        tableBody.innerHTML = '';
        pageItems.forEach(item => {
            tableBody.appendChild(item.element.cloneNode(true));
        });
    }
    
    // Update both top and bottom pagination texts
    const paginationTexts = document.querySelectorAll('.pagination_total');
    paginationTexts.forEach(paginationText => {
        paginationText.textContent = `${startIndex + 1} - ${startIndex + pageItems.length} of ${filteredItems.length.toLocaleString()}`;
    });

    // Update the page numbers in the URL without reloading
    const url = new URL(window.location.href);
    url.searchParams.set('page', currentFilter.currentPage);
    window.history.replaceState({}, '', url);
}




function setupNativePaginationHandling() {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                const paginationLinks = document.querySelectorAll('.pagination.top a, .pagination.bottom a');
                paginationLinks.forEach(link => {
                    if (link.dataset.handledByFilter) return;
                    link.dataset.handledByFilter = 'true';
                    
                    link.addEventListener('click', (e) => {
                        const select = document.getElementById('shipsFromSelect');
                        if (select?.value) {
                            e.preventDefault();
                            
                            // Handle "Prev" and "Next" links
                            if (link.textContent.includes('Prev')) {
                                currentFilter.currentPage = Math.max(1, currentFilter.currentPage - 1);
                            } else if (link.textContent.includes('Next')) {
                                currentFilter.currentPage++;
                            } else {
                                // Handle numbered page links
                                const pageMatch = link.href.match(/page=(\d+)/);
                                if (pageMatch) {
                                    currentFilter.currentPage = parseInt(pageMatch[1]);
                                }
                            }
                            
                            // Pass an event-like object to filterTableByCountry
                            filterTableByCountry({ 
                                target: select,
                                isPageChange: true  // Add this flag
                            });
                        }
                    });
                });
            }
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}



function handleInitialUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const page = urlParams.get('page');
    if (page) {
        currentFilter.currentPage = parseInt(page);
    }
}

async function createShipsFromFilter() {
    log('Extension script starting...');
    
    await waitForElement('.table_block.mpitems');
    log('Found marketplace table');
    
    await waitForElement('.seller_info');
    log('Found seller info cells, injecting filter...');
    
    handleInitialUrlParams();
    await injectFilter();
}

setupNativePaginationHandling();


function waitForElement(selector, maxTries = 30) {
    return new Promise((resolve, reject) => {
        let tries = 0;
        const interval = setInterval(() => {
            const element = document.querySelector(selector);
            tries++;
            
            if (element) {
                clearInterval(interval);
                log(`Found element ${selector} after ${tries} tries`);
                resolve(element);
            } else if (tries >= maxTries) {
                clearInterval(interval);
                log(`Failed to find element ${selector} after ${tries} tries`);
                reject(new Error(`Element ${selector} not found`));
            }
        }, 500);
    });
}

// Run when page loads
log('Setting up extension...');
createShipsFromFilter();

// Handle Discogs' dynamic page loading
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        log('URL changed, re-initializing filter...');
        setTimeout(createShipsFromFilter, 1000);
    }
}).observe(document, {subtree: true, childList: true});
})();