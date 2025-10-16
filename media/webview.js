/* global acquireVsCodeApi */
const vscode = acquireVsCodeApi();

// Global error reporting to surface issues that might disable button handlers
window.addEventListener('error', (e) => {
    try {
        const statusEl = document.getElementById('status');
        if (statusEl) statusEl.textContent = '⚠ Script error: ' + (e.message || e.error?.message || 'Unknown');
    } catch (_) { /* ignore */ }
});
window.addEventListener('unhandledrejection', (e) => {
    try {
        const statusEl = document.getElementById('status');
        if (statusEl) statusEl.textContent = '⚠ Promise rejection: ' + (e.reason?.message || e.reason || 'Unknown');
    } catch (_) { }
});

function debugLog(message) {
    try {
        // Allow disabling via localStorage flag
        if (typeof localStorage !== 'undefined' && localStorage.getItem('cwlv.debug') === 'off') return;
        vscode.postMessage({ type: 'debugLog', message });
    } catch (_) { /* ignore */ }
}

// State
let currentLogGroups = [];
let currentFavorites = [];
let currentResults = [];
let savedQueries = [];
let savedQueriesSource = 'aws';

// Time range options
const timeRangeSelect = document.getElementById('timeRange');
const ranges = [
    { label: 'Last 5 minutes', ms: 5 * 60 * 1000 },
    { label: 'Last 15 minutes', ms: 15 * 60 * 1000 },
    { label: 'Last 30 minutes', ms: 30 * 60 * 1000 },
    { label: 'Last 1 hour', ms: 60 * 60 * 1000 },
    { label: 'Last 3 hours', ms: 3 * 60 * 60 * 1000 },
    { label: 'Last 12 hours', ms: 12 * 60 * 60 * 1000 },
    { label: 'Last 24 hours', ms: 24 * 60 * 60 * 1000 },
    { label: 'Last 3 days', ms: 3 * 24 * 60 * 60 * 1000 },
    { label: 'Last 7 days', ms: 7 * 24 * 60 * 60 * 1000 },
    { label: 'Last 30 days', ms: 30 * 24 * 60 * 60 * 1000 }
];

ranges.forEach(r => {
    const opt = document.createElement('option');
    opt.value = String(r.ms);
    opt.textContent = r.label;
    timeRangeSelect.appendChild(opt);
});
timeRangeSelect.value = String(ranges[3].ms); // default 1h

// Event listeners
document.getElementById('runBtn').addEventListener('click', runQuery);
document.getElementById('lgRefreshBtn').addEventListener('click', loadLogGroups);
document.getElementById('lgFilter').addEventListener('input', filterLogGroups);
document.getElementById('savedSelect').addEventListener('change', loadSavedQuery);
// Debounced search input to avoid reprocessing entire table on every keystroke
const searchInputEl = document.getElementById('searchInput');
let searchDebounceTimer = null;
let lastKeyTime = 0;
function computeSearchDelay() {
    const term = searchInputEl.value.trim();
    const len = term.length;
    const base = 60; // fastest path
    const rowFactor = Math.min(300, (rowCache ? rowCache.length / 50 : 0)); // scale with rows up to +300ms
    // If user is typing quickly (<150ms between keys) increase debounce slightly to batch
    const now = Date.now();
    const typingFast = (now - lastKeyTime) < 150;
    lastKeyTime = now;
    if (len === 0) return 0; // clear immediate
    if (len < 3) return 200 + rowFactor; // short terms produce many false positives
    if (typingFast) return 140 + rowFactor / 2;
    // Longer stable term -> faster feedback
    return base + rowFactor / 3;
}
searchInputEl.addEventListener('input', () => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    const delay = computeSearchDelay();
    searchDebounceTimer = setTimeout(() => searchResults(), delay);
});
document.getElementById('searchClearBtn').addEventListener('click', clearSearch);
document.getElementById('searchPrevBtn').addEventListener('click', navigateSearchPrev);
document.getElementById('searchNextBtn').addEventListener('click', navigateSearchNext);
document.getElementById('searchHideNonMatching').addEventListener('change', toggleHideNonMatching);

// Absolute time helper buttons
document.getElementById('startNowBtn').addEventListener('click', () => setDateTimeToNow('start'));
document.getElementById('endNowBtn').addEventListener('click', () => setDateTimeToNow('end'));
document.getElementById('copyStartToEnd').addEventListener('click', copyStartToEnd);

// Time mode toggle - segmented control
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        toggleTimeMode();
    });
});

// Set max date/time to prevent future dates
function updateDateTimeMax() {
    const now = new Date();
    const maxDate = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const maxTime = now.toISOString().slice(11, 19); // HH:mm:ss

    document.getElementById('startDate').max = maxDate;
    document.getElementById('endDate').max = maxDate;
    document.getElementById('startTime').max = maxTime;
    document.getElementById('endTime').max = maxTime;
}

// Initialize and update max constraints
updateDateTimeMax();
// Update every minute to keep max time current
setInterval(updateDateTimeMax, 60000);

// Query editor with syntax highlighting overlay
const queryEditor = document.getElementById('query');
const queryHighlight = document.getElementById('queryHighlight');

// Update syntax highlighting on input
queryEditor.addEventListener('input', updateSyntaxHighlighting);
queryEditor.addEventListener('scroll', syncScroll);

function syncScroll() {
    queryHighlight.scrollTop = queryEditor.scrollTop;
    queryHighlight.scrollLeft = queryEditor.scrollLeft;
}

function updateSyntaxHighlighting() {
    const text = queryEditor.value;
    queryHighlight.innerHTML = highlightQuery(text);
    syncScroll();
}

// Log groups collapsible section
document.getElementById('otherGroupsBtn').addEventListener('click', toggleOtherGroupsSection);

// Favorites collapsible section - removed, favorites are always visible now

// Keyboard shortcuts
document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') clearSearch();
});

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        document.getElementById('searchInput').focus();
    }
});

// Functions
function setDateTimeToNow(which) {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const timeStr = now.toISOString().slice(11, 19); // HH:mm:ss

    if (which === 'start') {
        document.getElementById('startDate').value = dateStr;
        document.getElementById('startTime').value = timeStr;
    } else {
        document.getElementById('endDate').value = dateStr;
        document.getElementById('endTime').value = timeStr;
    }
}

function copyStartToEnd() {
    const startDate = document.getElementById('startDate').value;
    const startTime = document.getElementById('startTime').value;
    document.getElementById('endDate').value = startDate;
    document.getElementById('endTime').value = startTime;
}

function toggleTimeMode() {
    const activeBtn = document.querySelector('.mode-btn.active');
    const mode = activeBtn ? activeBtn.dataset.mode : 'relative';
    const relativeInputs = document.querySelectorAll('.relative-time');
    const absoluteInputs = document.querySelectorAll('.absolute-time');

    if (mode === 'relative') {
        relativeInputs.forEach(el => el.style.display = '');
        absoluteInputs.forEach(el => el.style.display = 'none');
    } else {
        relativeInputs.forEach(el => el.style.display = 'none');
        absoluteInputs.forEach(el => el.style.display = '');
    }
}

function currentTimeRange() {
    const activeBtn = document.querySelector('.mode-btn.active');
    const mode = activeBtn ? activeBtn.dataset.mode : 'relative';
    if (mode === 'absolute') {
        const startDate = document.getElementById('startDate').value;
        const startTime = document.getElementById('startTime').value;
        const endDate = document.getElementById('endDate').value;
        const endTime = document.getElementById('endTime').value;
        const startStr = startDate && startTime ? `${startDate}T${startTime}Z` : null;
        const endStr = endDate && endTime ? `${endDate}T${endTime}Z` : null;
        return {
            start: startStr ? new Date(startStr).getTime() : Date.now() - 60 * 60 * 1000,
            end: endStr ? new Date(endStr).getTime() : Date.now()
        };
    } else {
        const val = parseInt(timeRangeSelect.value, 10);
        return { start: Date.now() - val, end: Date.now() };
    }
}

function getSelectedLogGroups() {
    const container = document.getElementById('lgList');
    if (!container) return [];
    return Array.from(container.querySelectorAll('.lg-item.selected')).map(item => item.dataset.name).filter(Boolean);
}

function highlightQuery(text) {
    if (!text) return '';
    const lines = text.split('\n');
    return lines.map(line => highlightLine(line)).join('\n');
}

function highlightLine(line) {
    if (!line) return '\n';
    let result = '';
    let i = 0;
    while (i < line.length) {
        // Skip whitespace
        if (/\s/.test(line[i])) {
            result += line[i];
            i++;
            continue;
        }

        // Comments (# to end of line)
        if (line[i] === '#') {
            result += `<span class="token-comment">${escapeHtml(line.slice(i))}</span>`;
            break;
        }

        // Strings (single or double quoted)
        if (line[i] === '"' || line[i] === "'") {
            const quote = line[i];
            let end = i + 1;
            while (end < line.length && line[end] !== quote) {
                if (line[end] === '\\') end++;
                end++;
            }
            if (end < line.length) end++;
            result += `<span class="token-string">${escapeHtml(line.slice(i, end))}</span>`;
            i = end;
            continue;
        }

        // Regex patterns /pattern/
        if (line[i] === '/') {
            let end = i + 1;
            while (end < line.length && line[end] !== '/') {
                if (line[end] === '\\') end++;
                end++;
            }
            if (end < line.length) end++;
            result += `<span class="token-regex">${escapeHtml(line.slice(i, end))}</span>`;
            i = end;
            continue;
        }

        // Numbers
        if (/\d/.test(line[i])) {
            let end = i;
            while (end < line.length && /[\d.]/.test(line[end])) end++;
            result += `<span class="token-number">${escapeHtml(line.slice(i, end))}</span>`;
            i = end;
            continue;
        }

        // Operators and punctuation
        if (/[|=<>!+\-*/%(),\[\]]/.test(line[i])) {
            result += `<span class="token-operator">${escapeHtml(line[i])}</span>`;
            i++;
            continue;
        }

        // Words (keywords, functions, operators, identifiers)
        if (/[a-zA-Z_@]/.test(line[i])) {
            let end = i;
            while (end < line.length && /[a-zA-Z0-9_@.]/.test(line[end])) end++;
            const word = line.slice(i, end);
            const lowerWord = word.toLowerCase();

            if (KEYWORDS.includes(lowerWord)) {
                result += `<span class="token-keyword">${escapeHtml(word)}</span>`;
            } else if (FUNCTIONS.includes(lowerWord)) {
                result += `<span class="token-function">${escapeHtml(word)}</span>`;
            } else if (OPERATORS.includes(lowerWord)) {
                result += `<span class="token-operator">${escapeHtml(word)}</span>`;
            } else if (word.startsWith('@')) {
                result += `<span class="token-field">${escapeHtml(word)}</span>`;
            } else {
                result += `<span class="token-text">${escapeHtml(word)}</span>`;
            }
            i = end;
            continue;
        }

        // Default
        result += escapeHtml(line[i]);
        i++;
    }

    return result;
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Syntax highlighting for CloudWatch Logs Insights
const KEYWORDS = ['fields', 'filter', 'sort', 'stats', 'limit', 'display', 'parse', 'by', 'as', 'asc', 'desc', 'dedup', 'head', 'tail'];
const FUNCTIONS = ['count', 'sum', 'avg', 'min', 'max', 'earliest', 'latest', 'pct', 'stddev', 'concat', 'strlen', 'toupper', 'tolower', 'trim', 'ltrim', 'rtrim', 'contains', 'replace', 'strcontains', 'ispresent', 'isblank', 'isempty', 'isnull', 'coalesce', 'bin', 'diff', 'floor', 'ceil', 'abs', 'log', 'sqrt', 'exp'];
const OPERATORS = ['like', 'in', 'and', 'or', 'not', 'regex', 'match'];

function getQueryText() {
    const editor = document.getElementById('query');
    return editor.value || '';
}

function setQueryText(text) {
    const editor = document.getElementById('query');
    editor.value = text;
    updateSyntaxHighlighting();
}

function runQuery() {
    const { start, end } = currentTimeRange();
    const logGroups = getSelectedLogGroups();
    const region = document.getElementById('region').value.trim() || 'us-east-2';
    const query = getQueryText();
    const runBtn = document.getElementById('runBtn');
    if (!logGroups.length) {
        setStatus('⚠ Select at least one log group');
        return;
    }
    if (!query.trim()) {
        setStatus('⚠ Query string is empty');
        return;
    }
    setStatus('🔄 Running query...');
    if (runBtn) {
        runBtn.setAttribute('data-state', 'running');
        runBtn.disabled = true;
    }
    vscode.postMessage({ type: 'runQuery', data: { logGroups, region, query, startTime: start, endTime: end } });
}

function setStatus(msg) {
    document.getElementById('status').textContent = msg;
}

function renderResults(payload) {
    currentResults = payload;
    const container = document.getElementById('results');
    container.innerHTML = '';
    // Results changed – invalidate any cached row references used by search
    invalidateRowCache();

    // Filter out @ptr column
    const fields = payload.fieldOrder.filter(f => f !== '@ptr');

    if (!payload.rows.length) {
        container.textContent = 'No results.';
        document.getElementById('resultCount').textContent = '';
        return;
    }

    document.getElementById('resultCount').textContent = `(${payload.rows.length} rows)`;

    const table = document.createElement('table');
    const head = document.createElement('thead');
    const headerRow = document.createElement('tr');
    fields.forEach((f, index) => {
        const th = document.createElement('th');
        th.style.position = 'relative';

        const span = document.createElement('span');
        span.textContent = f;
        th.appendChild(span);

        // Add resize handle (not on last column)
        if (index < fields.length - 1) {
            const resizer = document.createElement('div');
            resizer.className = 'column-resizer';
            resizer.addEventListener('mousedown', (e) => initColumnResize(e, th));
            th.appendChild(resizer);
        }

        headerRow.appendChild(th);
    });
    head.appendChild(headerRow);
    table.appendChild(head);

    const body = document.createElement('tbody');
    payload.rows.forEach((r, idx) => {
        const tr = document.createElement('tr');
        tr.dataset.rowIndex = idx;
        fields.forEach(f => {
            const td = document.createElement('td');
            const valObj = r.fields.find(x => x.field === f);
            td.textContent = valObj ? valObj.value : '';
            td.dataset.field = f;
            tr.appendChild(td);
        });
        body.appendChild(tr);
    });
    table.appendChild(body);
    container.appendChild(table);
    // Re-run active search (if any term present) after rendering new results
    setTimeout(() => {
        if (document.getElementById('searchInput').value.trim()) {
            searchResults(false, true);
        }
    }, 0);
}

// Column resizing functionality
let resizingColumn = null;
let resizeStartX = 0;
let resizeStartWidth = 0;

function initColumnResize(e, th) {
    e.preventDefault();
    resizingColumn = th;
    resizeStartX = e.pageX;
    resizeStartWidth = th.offsetWidth;

    document.addEventListener('mousemove', handleColumnResize);
    document.addEventListener('mouseup', stopColumnResize);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
}

function handleColumnResize(e) {
    if (!resizingColumn) return;
    const diff = e.pageX - resizeStartX;
    const newWidth = Math.max(50, resizeStartWidth + diff); // minimum 50px
    resizingColumn.style.width = newWidth + 'px';
    resizingColumn.style.minWidth = newWidth + 'px';
    resizingColumn.style.maxWidth = newWidth + 'px';
}

function stopColumnResize() {
    resizingColumn = null;
    document.removeEventListener('mousemove', handleColumnResize);
    document.removeEventListener('mouseup', stopColumnResize);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
}

function loadLogGroups() {
    const region = document.getElementById('region').value.trim() || 'us-east-2';
    const prefix = document.getElementById('lgFilter').value.trim();
    setStatus('🔄 Loading log groups...');
    vscode.postMessage({ type: 'listLogGroups', region, prefix });
}

function renderLogGroups(groups) {
    currentLogGroups = groups;
    const container = document.getElementById('lgList');
    container.innerHTML = '';
    if (!groups.length) {
        container.innerHTML = '<div class="empty-state">No log groups found</div>';
        setStatus('');
        updateSelectedCount();
        return;
    }
    const region = document.getElementById('region').value.trim() || 'us-east-2';
    groups.forEach(g => {
        const isFav = currentFavorites.some(f => f.name === g && f.region === region);
        const isSelected = isLogGroupSelected(g, region);

        const wrapper = document.createElement('div');
        wrapper.className = 'lg-item';
        wrapper.dataset.name = g;
        wrapper.dataset.region = region;
        if (isSelected) {
            wrapper.classList.add('selected');
        }

        const btn = document.createElement('button');
        btn.className = 'lg-btn';
        btn.title = isSelected ? 'Click to deselect' : 'Click to select';
        btn.addEventListener('click', () => {
            const currentlySelected = wrapper.classList.contains('selected');
            if (currentlySelected) {
                wrapper.classList.remove('selected');
            } else {
                wrapper.classList.add('selected');
            }
            updateSelectedCount();
            updateFavoritesCheckboxes();
        });

        // Checkmark indicator
        const checkmark = document.createElement('span');
        checkmark.className = 'lg-checkmark';
        checkmark.textContent = '✓';

        // Text content
        const text = document.createElement('span');
        text.className = 'lg-text';
        text.textContent = g;

        btn.appendChild(checkmark);
        btn.appendChild(text);

        const starBtn = document.createElement('button');
        starBtn.className = 'star-btn' + (isFav ? ' active' : '');
        starBtn.textContent = isFav ? '★' : '☆';
        starBtn.title = isFav ? 'Remove from favorites' : 'Add to favorites';
        starBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(g, region);
        });

        wrapper.appendChild(btn);
        wrapper.appendChild(starBtn);
        container.appendChild(wrapper);
    });
    setStatus('');
    updateSelectedCount();
    updateFavoritesCheckboxes();
}

function filterLogGroups() {
    const filter = document.getElementById('lgFilter').value.trim().toLowerCase();
    const items = document.querySelectorAll('.lg-item');
    items.forEach(item => {
        const name = item.dataset.name.toLowerCase();
        item.style.display = name.includes(filter) ? 'flex' : 'none';
    });
}

function updateStarButtons() {
    const region = document.getElementById('region').value.trim() || 'us-east-2';
    const items = document.querySelectorAll('.lg-item');
    items.forEach(item => {
        const name = item.dataset.name;
        const starBtn = item.querySelector('.star-btn');
        if (starBtn && name) {
            const isFav = currentFavorites.some(f => f.name === name && f.region === region);
            starBtn.textContent = isFav ? '★' : '☆';
            starBtn.title = isFav ? 'Remove from favorites' : 'Add to favorites';
            if (isFav) {
                starBtn.classList.add('active');
            } else {
                starBtn.classList.remove('active');
            }
        }
    });
}

function toggleFavorite(name, region) {
    const isFav = currentFavorites.some(f => f.name === name && f.region === region);
    if (isFav) {
        vscode.postMessage({ type: 'removeFavorite', name, region });
    } else {
        vscode.postMessage({ type: 'addFavorite', data: { name, region } });
    }
}

function renderFavorites(favs) {
    currentFavorites = favs;
    const container = document.getElementById('favList');
    container.innerHTML = '';
    document.getElementById('favCount').textContent = favs.length;

    if (!favs.length) {
        container.innerHTML = '<div class="empty-state">No favorites yet. Click ★ next to a log group.</div>';
        return;
    }

    favs.forEach(f => {
        const isSelected = isLogGroupSelected(f.name, f.region);

        const wrapper = document.createElement('div');
        wrapper.className = 'fav-item';
        wrapper.dataset.name = f.name;
        wrapper.dataset.region = f.region;
        if (isSelected) {
            wrapper.classList.add('selected');
        }

        const btn = document.createElement('button');
        btn.className = 'fav-btn';
        btn.title = isSelected ? 'Click to deselect' : 'Click to select';
        btn.addEventListener('click', () => {
            // Get current state dynamically instead of using captured value
            const currentlySelected = isLogGroupSelected(f.name, f.region);
            toggleFavoriteSelection(f, !currentlySelected);
        });

        // Checkmark indicator
        const checkmark = document.createElement('span');
        checkmark.className = 'fav-checkmark';
        checkmark.textContent = '✓';

        // Text content
        const text = document.createElement('span');
        text.className = 'fav-text';
        text.textContent = `${f.name} (${f.region})`;

        btn.appendChild(checkmark);
        btn.appendChild(text);

        wrapper.appendChild(btn);
        container.appendChild(wrapper);
    });
}

function selectFavorite(fav) {
    document.getElementById('region').value = fav.region;
    loadLogGroups();
    setTimeout(() => {
        const items = document.querySelectorAll('.lg-item');
        items.forEach(item => {
            const cb = item.querySelector('input[type=checkbox]');
            if (cb.dataset.name === fav.name) {
                cb.checked = true;
                item.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    }, 500);
}

function saveCurrentQuery() {
    const query = getQueryText();
    const logGroups = getSelectedLogGroups();

    // Auto-generate name from timestamp
    const now = new Date();
    const name = `Query ${now.toISOString().slice(0, 19).replace('T', ' ')}`;

    let existingId = undefined;
    const selectIdx = parseInt(document.getElementById('savedSelect').value, 10);
    if (!isNaN(selectIdx) && savedQueries[selectIdx]) {
        existingId = savedQueries[selectIdx].id; // update existing
    }
    vscode.postMessage({ type: 'saveQuery', data: { id: existingId || Date.now().toString(), name, query, logGroups } });
}

function renderSavedQueries(list, source, error) {
    savedQueries = list;
    if (source) savedQueriesSource = source;
    const select = document.getElementById('savedSelect');
    const header = source === 'aws' ? '-- Saved Queries --' : '-- Load Local Saved Query --';
    select.innerHTML = `<option value="">${header}</option>`;
    list.forEach((item, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = item.name;
        select.appendChild(opt);
    });
    if (error) {
        setStatus(`⚠ Saved queries fallback (${error})`);
    }
}

function loadSavedQuery() {
    const idx = parseInt(document.getElementById('savedSelect').value, 10);
    if (isNaN(idx)) return;
    const query = savedQueries[idx];
    if (query) {
        setQueryText(query.query);
        // Optionally select log groups if they match
    }
}

function deleteSelectedSaved() {
    const idx = parseInt(document.getElementById('savedSelect').value, 10);
    if (isNaN(idx)) return;
    const query = savedQueries[idx];
    if (query && confirm(`Delete saved query "${query.name}"?`)) {
        vscode.postMessage({ type: 'deleteQuery', id: query.id });
    }
}

let currentSearchMatchIndex = -1;
let searchMatches = [];
let prevSearchTerm = '';
let prevHideNonMatching = true;
let prevRowCount = 0;
let activeSearchToken = 0; // cancellation token increment
let spinnerEl = null;
// Row cache to avoid repeatedly traversing the DOM structure for every search run.
// Each cache entry: { rowEl, cells: [{ el, original, lower }...], combinedLower }
let rowCache = null;
// Also reset previous narrowing state whenever cache invalidated
function resetSearchState() {
    previousMatchedRowIndices = null;
    prevSearchTerm = '';
}
function invalidateRowCache() { rowCache = null; resetSearchState(); }
function buildRowCache() {
    if (rowCache) return rowCache;
    const rows = document.querySelectorAll('#results tbody tr');
    rowCache = Array.from(rows).map(row => {
        const cells = Array.from(row.querySelectorAll('td')).map(td => {
            const original = td.dataset.originalText || td.textContent || '';
            if (!td.dataset.originalText) td.dataset.originalText = original; // persist for restore
            return { el: td, original, lower: original.toLowerCase() };
        });
        // Pre-concatenate row lowercase string for fast exclusion test
        const combinedLower = cells.map(c => c.lower).join('\u0001'); // unlikely separator
        return { rowEl: row, cells, combinedLower, lastMatched: false };
    });
    prevRowCount = rowCache.length; // sync row count baseline
    return rowCache;
}
function ensureSpinnerRef() {
    if (!spinnerEl) spinnerEl = document.getElementById('searchSpinner');
    return spinnerEl;
}
function setSearchBusy(busy) {
    const el = ensureSpinnerRef();
    if (!el) return;
    if (busy) el.classList.add('active'); else el.classList.remove('active');
}

let previousMatchedRowIndices = null; // null means unknown (full scan required)
function searchResults(preservePosition = false, force = false) {
    const DEBUG_SEARCH = true; // toggle instrumentation
    const perf = (typeof performance !== 'undefined' ? performance : { now: () => Date.now() });
    const t0 = perf.now();
    const termRaw = document.getElementById('searchInput').value.trim();
    const term = termRaw; // keep original for highlighting
    const lowerTerm = term.toLowerCase();
    const hideNonMatching = document.getElementById('searchHideNonMatching').checked;
    const cacheBuildStart = perf.now();
    const existingCacheRef = rowCache; // track if reused
    const cache = buildRowCache();
    const cacheBuildMs = perf.now() - cacheBuildStart;

    // Fast path: if nothing relevant changed and not forced, bail.
    if (!force && term === prevSearchTerm && hideNonMatching === prevHideNonMatching && cache.length === prevRowCount) {
        return;
    }
    const termChanged = term !== prevSearchTerm;
    const narrowing = termChanged && term.startsWith(prevSearchTerm) && prevSearchTerm.length > 0; // user added characters
    prevHideNonMatching = hideNonMatching;
    prevRowCount = cache.length;

    const savedIndex = preservePosition ? currentSearchMatchIndex : -1; // reserved for future use
    searchMatches = [];
    currentSearchMatchIndex = -1;
    const token = ++activeSearchToken;

    // Remove all previous highlights if term changed (ensures no stale marks linger)
    if (termChanged) {
        document.querySelectorAll('mark.search-highlight').forEach(mark => {
            const cell = mark.parentElement;
            if (!cell) return;
            // Restore original text from dataset if available
            const td = cell.closest('td');
            if (td && td.dataset.originalText) {
                td.textContent = td.dataset.originalText;
            }
        });
    }

    // If term empty -> fast restore without heavy loops
    if (!term) {
        cache.forEach(entry => {
            entry.rowEl.classList.remove('row-hidden');
            entry.cells.forEach(c => { if (c.el.textContent !== c.original) c.el.textContent = c.original; });
            entry.lastMatched = true; // everyone considered matched when no term
        });
        searchMatches = [];
        currentSearchMatchIndex = -1;
        setStatus('');
        setSearchBusy(false);
        prevSearchTerm = term; // update after processing
        previousMatchedRowIndices = null;
        return;
    }

    setSearchBusy(true);
    setStatus('🔍 Searching...');

    // Prepare regex once
    let regex = null;
    try { regex = new RegExp(`(${escapeRegex(term)})`, 'gi'); } catch (e) { /* invalid regex via user? treat as plain text */ regex = null; }

    // Decide scan set: if narrowing, only previously matched rows; else full set
    let scanIndices;
    if (!term || !previousMatchedRowIndices || !narrowing) {
        scanIndices = cache.map((_, i) => i);
    } else {
        scanIndices = previousMatchedRowIndices;
    }
    // Reset matched indices collection before processing
    const newMatched = [];
    let matchedRowCount = 0;
    let highlightCells = 0;
    let highlightTimeMs = 0;
    const scanStart = perf.now();
    let processed = 0;
    let cpuTimeMs = 0;
    let timeBudgetMs = 10; // initial budget
    const escalationCheckCount = Math.min(400, scanIndices.length);
    function processSlice() {
        if (token !== activeSearchToken) return;
        const sliceStartWall = perf.now();
        let sliceCpuStart = sliceStartWall;
        while (processed < scanIndices.length) {
            const i = scanIndices[processed];
            processed++;
            const entry = cache[i];
            const { rowEl, cells, combinedLower } = entry;
            if (!combinedLower.includes(lowerTerm)) {
                if (hideNonMatching) rowEl.classList.add('row-hidden'); else rowEl.classList.remove('row-hidden');
                entry.cells.forEach(c => { if (c.el.querySelector && c.el.querySelector('mark.search-highlight')) c.el.textContent = c.original; });
                entry.lastMatched = false;
            } else {
                matchedRowCount++;
                newMatched.push(i);
                rowEl.classList.remove('row-hidden');
                entry.lastMatched = true;
                for (const cell of cells) {
                    if (!cell.lower.includes(lowerTerm)) continue;
                    const hStart = perf.now();
                    const original = cell.original;
                    const lowerOriginal = cell.lower;
                    let resultHtml = '';
                    let startIdx = 0;
                    let searchIdx;
                    while ((searchIdx = lowerOriginal.indexOf(lowerTerm, startIdx)) !== -1) {
                        const segment = original.slice(startIdx, searchIdx);
                        resultHtml += escapeHtml(segment) + `<mark class=\"search-highlight\">${escapeHtml(original.slice(searchIdx, searchIdx + term.length))}</mark>`;
                        startIdx = searchIdx + term.length;
                    }
                    resultHtml += escapeHtml(original.slice(startIdx));
                    cell.el.innerHTML = resultHtml;
                    highlightCells++;
                    highlightTimeMs += (perf.now() - hStart);
                }
            }
            // Escalate budget if we observe very high match ratio early (avoid long wall time for broad terms)
            if (processed === escalationCheckCount) {
                const ratio = matchedRowCount / processed;
                if (ratio > 0.5) timeBudgetMs = 22; else if (ratio > 0.2) timeBudgetMs = 16;
            }
            if ((perf.now() - sliceStartWall) >= timeBudgetMs) break; // yield
        }
        cpuTimeMs += (perf.now() - sliceCpuStart);
        if (processed < scanIndices.length) {
            // Use setTimeout(0) to yield; requestIdleCallback stretches total wall time too much in this scenario
            setTimeout(processSlice, 0);
        } else {
            if (token !== activeSearchToken) return;
            document.querySelectorAll('mark.search-highlight').forEach(mark => {
                const row = mark.closest('tr');
                if (row) searchMatches.push({ row, mark });
            });
            if (searchMatches.length) {
                currentSearchMatchIndex = 0;
                highlightCurrentMatch();
            }
            setStatus(`🔍 ${searchMatches.length} matches in ${matchedRowCount} rows`);
            setSearchBusy(false);
            previousMatchedRowIndices = newMatched;
            const tEnd = perf.now();
            const wallScanMs = tEnd - scanStart;
            const totalMs = tEnd - t0;
            debugLog(`[search] term=\"${term}\" rows=${cache.length} scanned=${scanIndices.length} matchedRows=${matchedRowCount} matches=${searchMatches.length} highlightCells=${highlightCells} cacheReused=${existingCacheRef? 'yes':'no'} cacheBuildMs=${cacheBuildMs.toFixed(1)} wallScanMs=${wallScanMs.toFixed(1)} cpuScanMs=${cpuTimeMs.toFixed(1)} highlightMs=${highlightTimeMs.toFixed(1)} totalMs=${totalMs.toFixed(1)} budget=${timeBudgetMs}`);
        }
    }
    processSlice();
    prevSearchTerm = term; // commit term after scheduling batches
}

// Lightweight toggle to avoid re-searching when only the hide/show preference changes
function toggleHideNonMatching() {
    const hide = document.getElementById('searchHideNonMatching').checked;
    // If no active term or no cache yet, fallback to full search (ensures correctness)
    if (!rowCache || !prevSearchTerm) {
        searchResults(false, true);
        return;
    }
    // Capture the currently focused match element (if any)
    let activeMatchEl = null;
    if (currentSearchMatchIndex >= 0 && searchMatches[currentSearchMatchIndex]) {
        activeMatchEl = searchMatches[currentSearchMatchIndex].mark.closest('tr');
    }
    rowCache.forEach(entry => {
        const shouldHide = hide && !entry.lastMatched;
        if (shouldHide) entry.rowEl.classList.add('row-hidden'); else entry.rowEl.classList.remove('row-hidden');
    });
    // After applying visibility changes, if the active match row was hidden (shouldn't be if lastMatched), ensure it's shown and scrolled
    if (activeMatchEl && activeMatchEl.classList.contains('row-hidden')) {
        activeMatchEl.classList.remove('row-hidden');
    }
    if (activeMatchEl) {
        // Use requestAnimationFrame to let layout settle before scrolling
        requestAnimationFrame(() => {
            try { activeMatchEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) { /* ignore */ }
        });
    }
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightCurrentMatch() {
    // Remove previous current-match highlighting
    document.querySelectorAll('mark.search-highlight').forEach(mark => {
        mark.classList.remove('current-match');
    });

    if (searchMatches.length === 0 || currentSearchMatchIndex < 0) return;

    const match = searchMatches[currentSearchMatchIndex];
    match.mark.classList.add('current-match');
    match.mark.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setStatus(`🔍 Match ${currentSearchMatchIndex + 1}/${searchMatches.length}`);
}

function navigateSearchNext() {
    if (searchMatches.length === 0) return;
    currentSearchMatchIndex = (currentSearchMatchIndex + 1) % searchMatches.length;
    highlightCurrentMatch();
}

function navigateSearchPrev() {
    if (searchMatches.length === 0) return;
    currentSearchMatchIndex = (currentSearchMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    highlightCurrentMatch();
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    searchResults();
}

function toggleLogGroupsSection() {
    const content = document.getElementById('lgSectionContent');
    const btn = document.getElementById('lgCollapseBtn');
    const isCollapsed = content.classList.toggle('collapsed');
    btn.textContent = isCollapsed ? '▶' : '▼';
    btn.title = isCollapsed ? 'Expand' : 'Collapse';
}

function toggleFavoritesSection() {
    const content = document.getElementById('favSectionContent');
    const btn = document.getElementById('favCollapseBtn');
    const isCollapsed = content.classList.toggle('collapsed');
    btn.textContent = isCollapsed ? '▶' : '▼';
    btn.title = isCollapsed ? 'Expand' : 'Collapse';
}

function toggleOtherGroupsSection() {
    const content = document.getElementById('lgSectionContent');
    const btn = document.getElementById('otherGroupsBtn');
    const isCollapsed = content.classList.toggle('collapsed');
    btn.textContent = isCollapsed ? '▶ Other Groups' : '▼ Other Groups';
}

function updateSelectedCount() {
    const count = getSelectedLogGroups().length;
    document.getElementById('lgSelectedCount').textContent = `${count} selected`;
}

function isLogGroupSelected(name, region) {
    const currentRegion = document.getElementById('region').value.trim() || 'us-east-2';
    if (region !== currentRegion) return false;

    const selected = getSelectedLogGroups();
    return selected.includes(name);
}

function updateFavoritesCheckboxes() {
    const favItems = document.querySelectorAll('.fav-item');
    favItems.forEach(item => {
        const name = item.dataset.name;
        const region = item.dataset.region;
        if (name && region) {
            const isSelected = isLogGroupSelected(name, region);
            const btn = item.querySelector('.fav-btn');

            if (isSelected) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }

            if (btn) {
                btn.title = isSelected ? 'Click to deselect' : 'Click to select';
            }
        }
    });
}

function toggleFavoriteSelection(fav, shouldSelect) {
    const currentRegion = document.getElementById('region').value.trim() || 'us-east-2';

    // If different region, switch to favorite's region first
    if (fav.region !== currentRegion) {
        document.getElementById('region').value = fav.region;
        loadLogGroups();
        // Wait for log groups to load, then select
        setTimeout(() => {
            setLogGroupCheckbox(fav.name, shouldSelect);
        }, 500);
    } else {
        setLogGroupCheckbox(fav.name, shouldSelect);
    }
}

function setLogGroupCheckbox(name, checked) {
    const items = document.querySelectorAll('.lg-item');
    items.forEach(item => {
        if (item.dataset.name === name) {
            if (checked) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
            updateSelectedCount();
            updateFavoritesCheckboxes();
        }
    });
}

// Message handler
window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
        case 'queryStatus':
            setStatus(msg.data.status);
            if (msg.data.status === 'Running') {
                const btn = document.getElementById('runBtn');
                if (btn) { btn.setAttribute('data-state', 'running'); btn.disabled = true; }
            }
            break;
        case 'queryResult':
            setStatus(`✓ Query ${msg.data.status}`);
            renderResults(msg.data);
            {
                const btn = document.getElementById('runBtn');
                if (btn) { btn.setAttribute('data-state', 'idle'); btn.disabled = false; }
            }
            break;
        case 'queryError':
            setStatus('❌ Error: ' + msg.error);
            {
                const btn = document.getElementById('runBtn');
                if (btn) { btn.setAttribute('data-state', 'idle'); btn.disabled = false; }
            }
            break;
        case 'savedQueries':
            renderSavedQueries(msg.data, msg.source, msg.error);
            break;
        case 'logGroupsList':
            renderLogGroups(msg.data);
            break;
        case 'logGroupsListError':
            setStatus('❌ List error: ' + msg.error);
            break;
        case 'favorites':
            renderFavorites(msg.data);
            updateStarButtons();
            break;
    }
});

// Initial load
vscode.postMessage({ type: 'getSavedQueries' });
vscode.postMessage({ type: 'getFavorites' });
loadLogGroups(); // auto-load on startup
toggleTimeMode(); // initialize time mode visibility
updateSyntaxHighlighting(); // initialize syntax highlighting

// Note: Previous logic collapsed log groups via a button id (lgCollapseBtn) that no longer exists.
// Cleaned up to avoid accessing null elements.

