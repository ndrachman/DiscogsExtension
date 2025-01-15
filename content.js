function log(message) {
    console.log(`[Discogs Filter] ${message}`);
}

// Store the current filter state
let currentFilter = {
    country: '',
    totalItems: 0,
    currentPage: 1
};

function createShipsFromFilter() {
    log('Extension script starting...');
    
    waitForElement('.table_block.mpitems', (table) => {
        log('Found marketplace table');
        waitForElement('.seller_info', (cell) => {
            log('Found seller info cells, injecting filter...');
            injectFilter();
            
            // Check URL for existing filter
            const urlParams = new URLSearchParams(window.location.search);
            const savedCountry = urlParams.get('ships_from');
            if (savedCountry) {
                const select = document.getElementById('shipsFromSelect');
                if (select) {
                    select.value = savedCountry;
                    filterTableByCountry({ target: select });
                }
            }
        });
    });
}

function waitForElement(selector, callback, maxTries = 30) {
    let tries = 0;
    const interval = setInterval(() => {
        const element = document.querySelector(selector);
        tries++;
        
        if (element) {
            clearInterval(interval);
            callback(element);
            log(`Found element ${selector} after ${tries} tries`);
        } else if (tries >= maxTries) {
            clearInterval(interval);
            log(`Failed to find element ${selector} after ${tries} tries`);
        }
    }, 500);
}

function injectFilter() {
    if (document.querySelector('.ships-from-filter')) {
        log('Filter already exists, skipping injection');
        return;
    }

    const filterContainer = document.createElement('div');
    filterContainer.className = 'ships-from-filter';
    
    const countries = getUniqueCountries();
    log(`Found ${countries.length} unique countries: ${countries.join(', ')}`);
    
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
    
    const marketplaceHeader = document.querySelector('.marketplace_filters_container, .pagination.top');
    if (marketplaceHeader) {
        log('Found marketplace header, inserting filter');
        marketplaceHeader.style.marginBottom = '10px';
        marketplaceHeader.parentNode.insertBefore(filterContainer, marketplaceHeader.nextSibling);
    }
    
    // Add event listener
    const select = document.getElementById('shipsFromSelect');
    select.addEventListener('change', filterTableByCountry);
    
    // Update pagination links
    updatePaginationLinks();
}

function getUniqueCountries() {
    const sellerCells = document.querySelectorAll('.seller_info');
    const countries = new Set();
    
    sellerCells.forEach(cell => {
        const shipsFromLine = Array.from(cell.querySelectorAll('li')).find(li => 
            li.textContent.includes('Ships From:')
        );
        if (shipsFromLine) {
            const country = shipsFromLine.textContent.replace('Ships From:', '').trim();
            if (country) {
                countries.add(country);
            }
        }
    });
    
    return Array.from(countries).sort();
}

function updatePaginationLinks() {
    const links = document.querySelectorAll('.pagination a');
    links.forEach(link => {
        if (!currentFilter.country) return;
        
        const url = new URL(link.href);
        url.searchParams.set('ships_from', currentFilter.country);
        link.href = url.toString();
    });
}

function updatePaginationNumbers(visibleCount, totalCount) {
    const paginationTotal = document.querySelector('.pagination_total');
    if (paginationTotal) {
        const showDropdown = document.querySelector('select[name="limit"]');
        const itemsPerPage = showDropdown ? parseInt(showDropdown.value) : 250;
        
        // Get current page from URL or default to 1
        const urlParams = new URLSearchParams(window.location.search);
        const currentPage = parseInt(urlParams.get('page')) || 1;
        
        const startItem = ((currentPage - 1) * itemsPerPage) + 1;
        const endItem = Math.min(startItem + itemsPerPage - 1, totalCount);
        
        const newText = totalCount === 0 ? 
            "0 results" : 
            `${startItem} - ${endItem} of ${totalCount}`;
        paginationTotal.textContent = newText;
    }
}

function filterTableByCountry(event) {
    const selectedCountry = event.target.value;
    currentFilter.country = selectedCountry;
    log(`Filtering for country: ${selectedCountry}`);
    
    const rows = document.querySelectorAll('.table_block.mpitems tbody tr');
    let visibleCount = 0;
    
    rows.forEach(row => {
        const sellerInfo = row.querySelector('.seller_info');
        if (sellerInfo) {
            const shipsFromLine = Array.from(sellerInfo.querySelectorAll('li')).find(li => 
                li.textContent.includes('Ships From:')
            );
            let showRow = true;
            
            if (selectedCountry && shipsFromLine) {
                const country = shipsFromLine.textContent.replace('Ships From:', '').trim();
                showRow = country === selectedCountry;
            }
            
            row.style.display = showRow ? '' : 'none';
            if (showRow) visibleCount++;
        }
    });
    
    // Get the total unfiltered count from pagination
    const paginationText = document.querySelector('.pagination_total');
    if (paginationText) {
        const match = paginationText.textContent.match(/of ([\d,]+)/);
        if (match) {
            currentFilter.totalItems = parseInt(match[1].replace(/,/g, ''));
        } else {
            currentFilter.totalItems = 4070; // Default total
        }
    }
    
    // Always keep the total count, just update the visible count
    updatePaginationNumbers(visibleCount, currentFilter.totalItems);
    
    updatePaginationNumbers(visibleCount, currentFilter.totalItems);
    updatePaginationLinks();
    
    // Update URL to persist filter
    const url = new URL(window.location.href);
    if (selectedCountry) {
        url.searchParams.set('ships_from', selectedCountry);
    } else {
        url.searchParams.delete('ships_from');
    }
    history.replaceState(null, '', url);
    
    log(`Showing ${visibleCount} items on current page, estimated total: ${currentFilter.totalItems}`);
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