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
const commentToken = '#'; // fixed CloudWatch Logs comment token

// Relative time state
let relativeValue = 1;
let relativeUnit = 'hours'; // 'minutes', 'hours', 'days'

// Tab management state
let tabs = [];
let activeTabId = null;
let nextTabId = 1;
let runningQueryTabId = null; // Track which tab is running a query

// Tab structure:
// {
//   id: number,
//   name: string,
//   timestamp: number,
//   query: string,
//   logGroups: string[],
//   region: string,
//   timeRange: { start: number, end: number },
//   results: object,
//   searchQuery: string,
//   searchIndex: number,
//   columnFilters: object,
//   expandedRows: Set,
//   scrollPosition: number
// }

// Event listeners
document.getElementById('runBtn').addEventListener('click', () => {
    const btn = document.getElementById('runBtn');
    const state = btn?.getAttribute('data-state');
    if (state === 'running') {
        // Cancel/abort running query
        vscode.postMessage({ type: 'abortQuery' });
        if (btn) {
            btn.setAttribute('data-state', 'aborting');
            btn.disabled = true;
            const label = btn.querySelector('.run-btn-label');
            if (label) label.textContent = 'Cancelling Query...';
        }
        setStatus('⏸ Cancelling query...');
    } else {
        // Start new query
        runQuery();
    }
});
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

// Relative time controls
const relativeValueInput = document.getElementById('relativeValue');

// Quick value buttons
document.querySelectorAll('.relative-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // Update active state
        document.querySelectorAll('.relative-quick-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update value
        relativeValue = parseInt(btn.dataset.value, 10);
        relativeValueInput.value = ''; // Clear custom input
        relativeValueInput.classList.remove('active'); // Remove highlight from custom input
    });
});

// Custom input field
relativeValueInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    if (val && val >= 1) {
        relativeValue = val;
        // Deactivate quick buttons when using custom value
        document.querySelectorAll('.relative-quick-btn').forEach(b => b.classList.remove('active'));
        // Highlight the custom input
        relativeValueInput.classList.add('active');
    } else {
        // Remove highlight if field is empty
        relativeValueInput.classList.remove('active');
    }
});

// Auto-select content when clicking on the custom field
relativeValueInput.addEventListener('click', (e) => {
    e.target.select();
});

// Also select on focus for keyboard navigation
relativeValueInput.addEventListener('focus', (e) => {
    e.target.select();
});

document.querySelectorAll('.unit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        relativeUnit = btn.dataset.unit;
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
queryEditor.addEventListener('input', (e) => {
    updateSyntaxHighlighting();
    schedulePersistLastQuery();
});
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

// Tab management
document.getElementById('newTabBtn').addEventListener('click', createNewTab);

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
    
    // Tab navigation shortcuts
    if ((e.ctrlKey || e.metaKey) && e.key === 't' && !e.shiftKey) {
        e.preventDefault();
        createNewTab();
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key === 'w' && !e.shiftKey) {
        e.preventDefault();
        if (activeTabId) {
            closeTab(activeTabId);
        }
    }
    
    // Ctrl/Cmd+Tab for next tab, Ctrl/Cmd+Shift+Tab for previous tab
    if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
        e.preventDefault();
        if (tabs.length > 1) {
            const currentIndex = tabs.findIndex(t => t.id === activeTabId);
            if (currentIndex !== -1) {
                const nextIndex = e.shiftKey 
                    ? (currentIndex - 1 + tabs.length) % tabs.length
                    : (currentIndex + 1) % tabs.length;
                switchToTab(tabs[nextIndex].id);
            }
        }
    }
});
// Messages from extension
window.addEventListener('message', (event) => {
    const msg = event.data || {};
    if (msg.type === 'toggleComment') {
        toggleCommentInQueryEditor();
    } else if (msg.type === 'lastQuery') {
        if (typeof msg.query === 'string' && msg.query.trim()) {
            setQueryText(msg.query);
        }
    }
});
function toggleCommentInQueryEditor() {
    const editor = queryEditor;
    if (!editor) return;
    const text = editor.value;
    let selStart = editor.selectionStart;
    let selEnd = editor.selectionEnd;
    if (selStart === selEnd) {
        selStart = text.lastIndexOf('\n', selStart - 1) + 1;
        const next = text.indexOf('\n', selEnd);
        selEnd = next === -1 ? text.length : next;
    } else {
        selStart = text.lastIndexOf('\n', selStart - 1) + 1;
        const after = text.indexOf('\n', selEnd);
        selEnd = after === -1 ? text.length : after;
    }
    const block = text.slice(selStart, selEnd);
    const lines = block.split('\n');
    const nonEmpty = lines.filter(l => l.trim() !== '');
    // A line is considered commented if, after leading indentation, it begins with the token.
    const isCommented = (l) => {
        const indentMatch = /^[\t ]*/.exec(l) || [''];
        const afterIndent = l.slice(indentMatch[0].length);
        return afterIndent.startsWith(commentToken);
    };
    const allCommented = nonEmpty.length > 0 && nonEmpty.every(isCommented);
    const out = lines.map(line => {
        if (line.trim() === '') return line;
        const indentMatch = /^[\t ]*/.exec(line) || [''];
        const indent = indentMatch[0];
        const afterIndent = line.slice(indent.length);
        if (allCommented) {
            if (afterIndent.startsWith(commentToken)) {
                // Remove token and a single following space if present, but preserve additional spacing beyond one
                let remainder = afterIndent.slice(commentToken.length);
                if (remainder.startsWith(' ')) remainder = remainder.slice(1); // only remove one space
                return indent + remainder;
            }
            return line;
        } else {
            // Comment path: don't double comment
            if (afterIndent.startsWith(commentToken)) return line;
            const spacer = commentToken.endsWith(' ') ? '' : ' ';
            return indent + commentToken + spacer + afterIndent;
        }
    }).join('\n');
    editor.value = text.slice(0, selStart) + out + text.slice(selEnd);
    editor.selectionStart = selStart;
    editor.selectionEnd = selStart + out.length;
    updateSyntaxHighlighting();
}
function escapeForRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

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

// --- Paste-to-parse absolute time helpers ---
// Allow user to paste a date/time string (various common formats) into either
// the date or time input and we attempt to parse and populate both fields.
// Supported examples:
//   2025-10-21T14:33:05Z
//   2025-10-21T14:33:05.123Z
//   2025-10-21 14:33:05
//   2025-10-21 14:33 (assumes seconds 00)
//   2025/10/21 14:33:05
//   10/21/2025 2:33 PM   (US)
//   21/10/2025 14:33:05  (day-first if first component > 12)
//   10/21/2025           (defaults time 00:00:00)
//   1697896205           (epoch seconds)
//   1697896205000        (epoch milliseconds)
//   2025-10-21T10:33:05-04:00 (offset)
// If timezone/offset omitted we assume UTC.

function attachDatePasteHandlers() {
    ['start', 'end'].forEach(which => {
        const dateEl = document.getElementById(which + 'Date');
        const timeEl = document.getElementById(which + 'Time');
        if (dateEl) dateEl.addEventListener('paste', (e) => handleDatePaste(e, which));
        if (timeEl) timeEl.addEventListener('paste', (e) => handleDatePaste(e, which));
    });
}

function handleDatePaste(e, which) {
    const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
    if (!text.trim()) return; // let default behavior
    const parsed = parsePastedDate(text.trim());
    if (!parsed) {
        // Try tolerant fallback: Date.parse
        const fallback = new Date(text.trim());
        if (isNaN(fallback.getTime())) return; // allow native paste
        setParsedDate(which, fallback);
        e.preventDefault();
        return;
    }
    setParsedDate(which, parsed);
    e.preventDefault(); // prevent raw text from entering field
}

function setParsedDate(which, dateObj) {
    const dateEl = document.getElementById(which + 'Date');
    const timeEl = document.getElementById(which + 'Time');
    if (!dateEl || !timeEl) return;
    dateEl.value = formatDateUTC(dateObj);
    timeEl.value = formatTimeUTC(dateObj);
    setStatus('✓ Parsed pasted date/time');
}

function formatDateUTC(d) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
function formatTimeUTC(d) {
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

function parsePastedDate(str) {
    let s = str.trim();
    if (!s) return null;
    // Strip surrounding quotes/backticks
    s = s.replace(/^["'`]|["'`]$/g, '');
    // Epoch seconds (10 digits) or ms (13 digits)
    if (/^\d{10}$/.test(s)) {
        const secs = parseInt(s, 10);
        return new Date(secs * 1000);
    }
    if (/^\d{13}$/.test(s)) {
        const ms = parseInt(s, 10);
        return new Date(ms);
    }
    // ISO with T (timezone optional)
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
        // If no timezone specified append Z
        if (!/[Zz]|[+-]\d{2}:?\d{2}$/.test(s)) {
            s += 'Z';
        }
        // Normalize offset -0400 => -04:00
        s = s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
        const d = new Date(s);
        if (!isNaN(d.getTime())) return d;
    }
    // Date + space time (YYYY-MM-DD HH:mm[:ss])
    if (/^\d{4}-\d{2}-\d{2} /.test(s)) {
        let iso = s.replace(' ', 'T');
        if (!/[Zz]|[+-]\d{2}:?\d{2}$/.test(iso)) iso += 'Z';
        iso = iso.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
        const d = new Date(iso);
        if (!isNaN(d.getTime())) return d;
    }
    // YYYY/MM/DD formats
    if (/^\d{4}[/-]\d{1,2}[/-]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/.test(s)) {
        const parts = s.split(/[ T]/);
        const datePart = parts[0];
        const [y, m, dDay] = datePart.split(/[/-]/).map(x => parseInt(x, 10));
        let hour = 0, min = 0, sec = 0;
        if (parts[1]) {
            const timeParts = parts[1].split(':').map(x => parseInt(x, 10));
            hour = timeParts[0] || 0; min = timeParts[1] || 0; sec = timeParts[2] || 0;
        }
        if (m>=1 && m<=12 && dDay>=1 && dDay<=31) {
            return new Date(Date.UTC(y, m-1, dDay, hour, min, sec));
        }
    }
    // Slash dates mm/dd/yyyy or dd/mm/yyyy (optional time & AM/PM)
    const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM|am|pm))?)?$/);
    if (slash) {
        let a = parseInt(slash[1], 10); // first
        let b = parseInt(slash[2], 10); // second
        const year = parseInt(slash[3], 10);
        let hour = slash[4] ? parseInt(slash[4], 10) : 0;
        const minute = slash[5] ? parseInt(slash[5], 10) : 0;
        const second = slash[6] ? parseInt(slash[6], 10) : 0;
        const ampm = slash[7];
        let month, day;
        if (a > 12) { day = a; month = b; } // day-first
        else if (b > 12) { month = a; day = b; } // month-first
        else { month = a; day = b; } // ambiguous -> assume month/day
        if (ampm) {
            const upper = ampm.toUpperCase();
            if (upper === 'PM' && hour < 12) hour += 12;
            if (upper === 'AM' && hour === 12) hour = 0;
        }
        if (month>=1 && month<=12 && day>=1 && day<=31) {
            return new Date(Date.UTC(year, month-1, day, hour, minute, second));
        }
    }
    // Fallback generic parse
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
    return null;
}

// Attach handlers once DOM is ready (file executes after elements exist)
attachDatePasteHandlers();

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
        
        // Validate that all absolute time fields are filled
        if (!startDate || !startTime) {
            throw new Error('Start date and time are required for absolute time range');
        }
        if (!endDate || !endTime) {
            throw new Error('End date and time are required for absolute time range');
        }
        
        const startStr = `${startDate}T${startTime}Z`;
        const endStr = `${endDate}T${endTime}Z`;
        const startMs = new Date(startStr).getTime();
        const endMs = new Date(endStr).getTime();
        
        // Validate that the dates are valid
        if (isNaN(startMs)) {
            throw new Error('Invalid start date/time format');
        }
        if (isNaN(endMs)) {
            throw new Error('Invalid end date/time format');
        }
        
        // Validate that start is before end
        if (startMs >= endMs) {
            throw new Error('Start time must be before end time');
        }
        
        return {
            start: startMs,
            end: endMs
        };
    } else {
        // Calculate milliseconds from relative value and unit
        const unitMultipliers = {
            minutes: 60 * 1000,
            hours: 60 * 60 * 1000,
            days: 24 * 60 * 60 * 1000
        };
        const ms = relativeValue * (unitMultipliers[relativeUnit] || unitMultipliers.hours);
        return { start: Date.now() - ms, end: Date.now() };
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

// JSON syntax highlight (simple, aligns with existing token colors) for expanded log row details
function jsonToHighlightedHtml(obj) {
    let jsonStr;
    try { jsonStr = JSON.stringify(obj, null, 2); } catch { jsonStr = String(obj); }
    const esc = escapeHtml(jsonStr);
    // Regex based tokenization: keys, strings, numbers, booleans, null
    return esc
        .replace(/(&quot;.*?&quot;)(?=\s*:)/g, '<span class="token-field">$1</span>') // keys
        .replace(/:&nbsp;?(&quot;.*?&quot;)/g, ': <span class="token-string">$1</span>')
        .replace(/(&quot;.*?&quot;)/g, '<span class="token-string">$1</span>') // any remaining strings
        .replace(/\b(true|false)\b/g, '<span class="token-operator">$1</span>')
        .replace(/\b(null)\b/g, '<span class="token-operator">$1</span>')
        .replace(/(-?\b\d+(?:\.\d+)?\b)/g, '<span class="token-number">$1</span>');
}

// Basic JSON -> YAML converter (no anchors, handles objects/arrays/primitives)
function jsonToYaml(root) {
    const lines = [];
    const quoteIfNeeded = (s) => {
        if (s === '') return '""';
        if (/^(?:true|false|null|[-+]?[0-9]+(?:\.[0-9]+)?)$/i.test(s)) return '"' + s + '"';
        if (/[:\-?&*!|>'"@`{}#%\n\t]/.test(s)) return JSON.stringify(s);
        return s;
    };
    const indent = (lvl) => '  '.repeat(lvl);
    const emit = (lvl, text) => lines.push(indent(lvl) + text);
    const isScalar = (v) => v === null || ['string','number','boolean'].includes(typeof v);
    function walk(val, lvl) {
        if (val === null) { emit(lvl, 'null'); return; }
        if (Array.isArray(val)) {
            if (!val.length) { emit(lvl, '[]'); return; }
            val.forEach(item => {
                if (isScalar(item)) {
                    if (typeof item === 'string' && /\n/.test(item)) {
                        emit(lvl, '- |');
                        item.split('\n').forEach(l => emit(lvl + 1, l));
                    } else {
                        emit(lvl, '- ' + (typeof item === 'string' ? quoteIfNeeded(item) : String(item)));
                    }
                } else {
                    // complex value
                    emit(lvl, '-');
                    walk(item, lvl + 1);
                }
            });
            return;
        }
        if (typeof val === 'object') {
            const keys = Object.keys(val);
            if (!keys.length) { emit(lvl, '{}'); return; }
            keys.forEach(k => {
                const v = val[k];
                if (isScalar(v)) {
                    if (typeof v === 'string' && /\n/.test(v)) {
                        emit(lvl, k + ': |');
                        v.split('\n').forEach(l => emit(lvl + 1, l));
                    } else {
                        emit(lvl, k + ': ' + (typeof v === 'string' ? quoteIfNeeded(v) : String(v)));
                    }
                } else if (Array.isArray(v)) {
                    if (!v.length) { emit(lvl, k + ': []'); }
                    else {
                        emit(lvl, k + ':');
                        walk(v, lvl + 1);
                    }
                } else { // object
                    const childKeys = Object.keys(v);
                    if (!childKeys.length) { emit(lvl, k + ': {}'); }
                    else {
                        emit(lvl, k + ':');
                        walk(v, lvl + 1);
                    }
                }
            });
            return;
        }
        if (typeof val === 'string') {
            if (/\n/.test(val)) {
                emit(lvl, '|');
                val.split('\n').forEach(l => emit(lvl + 1, l));
            } else {
                emit(lvl, quoteIfNeeded(val));
            }
            return;
        }
        if (typeof val === 'number' || typeof val === 'boolean') { emit(lvl, String(val)); return; }
        emit(lvl, JSON.stringify(val));
    }
    walk(root, 0);
    return lines.join('\n');
}

function highlightYaml(yamlText) {
    // Avoid highlighting inside block scalars (lines after a | or > until dedent)
    const lines = yamlText.split('\n');
    const result = [];
    let inBlock = false;
    let blockIndent = 0;
    for (const line of lines) {
        if (!inBlock) {
            const trimmed = line.trimEnd();
            // Detect block scalar start: key: |, key: >, '|', '>', '- |', '- >'
            if (/^\s*[^:#]+:\s*[|>][-+]?\s*$/.test(trimmed) || /^\s*[|>][-+]?\s*$/.test(trimmed) || /^\s*-\s*[|>][-+]?\s*$/.test(trimmed)) {
                inBlock = true;
                // Indent baseline: next lines must be more indented than current line
                blockIndent = (/^\s*/.exec(line)?.[0].length || 0) + 1; // allow 1-space deeper
                result.push(escapeHtml(line));
                continue; // skip normal highlighting for block indicator line
            }
            // Highlight keys and scalars on this line only if not a pure block indicator
            let hl = escapeHtml(line)
                .replace(/^(\s*)([^\s][^:]*?):/g, (m, indent, key) => `${indent}<span class="token-field">${escapeHtml(key)}</span>:`)
                .replace(/\b(true|false|null)\b/g, '<span class="token-operator">$1</span>')
                .replace(/(-?\b\d+(?:\.\d+)?\b)/g, '<span class="token-number">$1</span>')
                .replace(/(&quot;.*?&quot;)/g, '<span class="token-string">$1</span>');
            result.push(hl);
        } else {
            // Inside block scalar – escape only
            result.push(escapeHtml(line));
            const currentIndent = /^\s*/.exec(line)?.[0].length || 0;
            if (line.trim() === '' || currentIndent < blockIndent) {
                // Dedent ends block
                inBlock = false;
            }
        }
    }
    return result.join('\n');
}

function buildRowDetailObject(rowData) {
    const obj = {};
    // rowData.fields : [{ field, value }]
    rowData.fields.forEach(f => { if (f.field !== '@ptr') obj[f.field] = f.value; });
    return obj;
}

function toggleRowDetails(tr, rowData) {
    const already = tr.nextSibling && tr.nextSibling.classList && tr.nextSibling.classList.contains('detail-row');
    const expandBtn = tr.querySelector('.expand-btn');
    if (already) {
        tr.parentNode.removeChild(tr.nextSibling);
        if (expandBtn) { expandBtn.textContent = '›'; expandBtn.title = 'Show details'; }
        return;
    }
    // Build detail row
    const detailTr = document.createElement('tr');
    detailTr.className = 'detail-row';
    const td = document.createElement('td');
    td.colSpan = tr.children.length; // span across all columns
    const pre = document.createElement('pre');
    pre.className = 'detail-json';
    // Only show the @message field content (raw) for clarity
    const messageField = rowData.fields.find(f => f.field === '@message');
    const messageValue = messageField ? messageField.value : '(no @message)';
    // Detect JSON structure (object or array). Parse once, then convert to YAML for compact view.
    if (messageValue && /^(\s*[\[{])/.test(messageValue)) {
        try {
            const parsed = JSON.parse(messageValue);
            const yaml = jsonToYaml(parsed);
            pre.innerHTML = highlightYaml(yaml);
        } catch (_) {
            // Fallback to raw text if parse fails
            pre.textContent = messageValue || '';
        }
    } else {
        pre.textContent = messageValue || '';
    }
    td.appendChild(pre);
    detailTr.appendChild(td);
    tr.parentNode.insertBefore(detailTr, tr.nextSibling);
    if (expandBtn) { expandBtn.textContent = '⌄'; expandBtn.title = 'Hide details'; }
}

// Collapse detail row (if present) for a given main data row
function collapseRowDetail(tr) {
    if (!tr || !tr.parentNode) return;
    const expandBtn = tr.querySelector('.expand-btn');
    const next = tr.nextSibling;
    if (next && next.classList && next.classList.contains('detail-row')) {
        tr.parentNode.removeChild(next);
        if (expandBtn) { expandBtn.textContent = '›'; expandBtn.title = 'Show details'; }
    }
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

// Debounced persistence of last edited query to extension
let persistTimer = null;
function schedulePersistLastQuery() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
        try {
            const q = getQueryText();
            vscode.postMessage({ type: 'updateLastQuery', query: q });
        } catch (_) { /* ignore */ }
    }, 400); // 400ms debounce
}

// ========== TAB MANAGEMENT ==========

function createTab(options = {}) {
    const tab = {
        id: nextTabId++,
        name: options.name || 'Results',
        isCustomName: options.isCustomName || false,
        timestamp: Date.now(),
        query: options.query || '',
        logGroups: options.logGroups || [],
        region: options.region || '',
        timeRange: options.timeRange || { start: 0, end: 0 },
        results: options.results || null,
        searchQuery: '',
        searchIndex: -1,
        columnFilters: {},
        expandedRows: new Set(),
        scrollPosition: 0,
        isStreaming: options.isStreaming || false
    };
    tabs.push(tab);
    return tab;
}

function formatTimestamp(timestamp) {
    const d = new Date(timestamp);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

function getActiveTab() {
    return tabs.find(t => t.id === activeTabId);
}

function getRowCountText() {
    const activeTab = getActiveTab();
    if (!activeTab || !activeTab.results || !activeTab.results.rows) {
        return '';
    }
    
    const totalRows = activeTab.results.rows.length;
    
    // Check if there are active filters
    if (activeTab.columnFilters && Object.keys(activeTab.columnFilters).length > 0) {
        // Count visible rows based on filters
        let visibleRows = 0;
        for (let i = 0; i < activeTab.results.rows.length; i++) {
            const row = activeTab.results.rows[i];
            let shouldShow = true;
            
            for (const [fieldName, allowedValues] of Object.entries(activeTab.columnFilters)) {
                if (allowedValues.size === 0) {
                    shouldShow = false;
                    break;
                }
                
                const fieldObj = row.fields.find(f => f.field === fieldName);
                const value = fieldObj ? fieldObj.value : '';
                
                if (!allowedValues.has(value)) {
                    shouldShow = false;
                    break;
                }
            }
            
            if (shouldShow) visibleRows++;
        }
        
        return ` (${visibleRows} of ${totalRows} rows)`;
    }
    
    return ` (${totalRows} rows)`;
}

function saveCurrentTabState() {
    const tab = getActiveTab();
    if (!tab) return;
    
    // Save current results
    tab.results = currentResults;
    
    // Save search state
    const searchInput = document.getElementById('searchInput');
    tab.searchQuery = searchInput ? searchInput.value : '';
    tab.searchIndex = currentSearchMatchIndex || -1;
    
    // Save column filters (deep clone the Sets)
    tab.columnFilters = {};
    for (const [fieldName, allowedValues] of Object.entries(activeFilters)) {
        tab.columnFilters[fieldName] = new Set(allowedValues);
    }
    
    // Save scroll position
    const resultsDiv = document.getElementById('results');
    tab.scrollPosition = resultsDiv ? resultsDiv.scrollTop : 0;
    
    // Save expanded rows
    const table = resultsDiv ? resultsDiv.querySelector('table tbody') : null;
    if (table) {
        tab.expandedRows = new Set();
        table.querySelectorAll('tr[data-row-index]').forEach(tr => {
            const next = tr.nextSibling;
            if (next && next.classList && next.classList.contains('detail-row')) {
                tab.expandedRows.add(tr.dataset.rowIndex);
            }
        });
    }
}

function restoreTabState(tab) {
    if (!tab) return;
    
    // Restore results
    currentResults = tab.results;
    if (tab.results) {
        renderResults(tab.results, true); // Skip clearing filters during restore
        
        // Restore column filters only if we have results (deep clone the Sets)
        activeFilters = {};
        if (tab.columnFilters) {
            for (const [fieldName, allowedValues] of Object.entries(tab.columnFilters)) {
                activeFilters[fieldName] = new Set(allowedValues);
            }
        }
        applyColumnFilters();
        updateFilterIndicators(); // Update column header filter button states
    } else {
        const resultsDiv = document.getElementById('results');
        if (resultsDiv) resultsDiv.innerHTML = '';
        
        // Clear filters when no results
        activeFilters = {};
    }
    
    // Restore search state
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = tab.searchQuery || '';
        if (tab.searchQuery && tab.results) {
            searchResults();
        }
    }
    
    // Restore scroll position and expanded rows only if we have results
    if (tab.results) {
        setTimeout(() => {
            const resultsDiv = document.getElementById('results');
            if (resultsDiv) resultsDiv.scrollTop = tab.scrollPosition || 0;
            
            // Restore expanded rows
            if (tab.expandedRows && tab.expandedRows.size > 0) {
                const table = resultsDiv ? resultsDiv.querySelector('table tbody') : null;
                if (table) {
                    tab.expandedRows.forEach(rowIndex => {
                        const tr = table.querySelector(`tr[data-row-index="${rowIndex}"]`);
                        if (tr && tab.results && tab.results.rows) {
                            const rowData = tab.results.rows[parseInt(rowIndex)];
                            if (rowData) {
                                toggleRowDetail(tr, rowData);
                            }
                        }
                    });
                }
            }
        }, 50);
    }
}

function switchToTab(tabId) {
    if (activeTabId === tabId) return;
    
    // Save current tab state
    saveCurrentTabState();
    
    // Switch active tab
    activeTabId = tabId;
    
    // Restore new tab state
    const tab = getActiveTab();
    restoreTabState(tab);
    
    // Update UI
    renderTabs();
}

function renderTabs() {
    const tabList = document.getElementById('tabList');
    if (!tabList) return;
    
    tabList.innerHTML = '';
    
    tabs.forEach(tab => {
        const tabItem = document.createElement('div');
        tabItem.className = 'tab-item';
        tabItem.dataset.tabId = tab.id;
        if (tab.id === activeTabId) tabItem.classList.add('active');
        if (tab.isStreaming) tabItem.classList.add('streaming');
        
        const tabContent = document.createElement('div');
        tabContent.className = 'tab-content';
        
        const tabName = document.createElement('div');
        tabName.className = 'tab-name';
        tabName.textContent = tab.name;
        tabName.title = tab.name;
        
        const tabInfo = document.createElement('div');
        tabInfo.className = 'tab-info';
        
        // Calculate row count from results, considering filters
        if (tab.results && tab.results.rows) {
            const totalRows = tab.results.rows.length;
            
            // Check if this tab has active column filters
            if (tab.columnFilters && Object.keys(tab.columnFilters).length > 0) {
                // Calculate visible rows based on filters
                let visibleRows = 0;
                for (let i = 0; i < tab.results.rows.length; i++) {
                    const row = tab.results.rows[i];
                    let shouldShow = true;
                    
                    // Check each active filter
                    for (const [fieldName, allowedValues] of Object.entries(tab.columnFilters)) {
                        if (allowedValues.size === 0) {
                            shouldShow = false;
                            break;
                        }
                        
                        // Find the field value in the row
                        const fieldObj = row.fields.find(f => f.field === fieldName);
                        const value = fieldObj ? fieldObj.value : '';
                        
                        if (!allowedValues.has(value)) {
                            shouldShow = false;
                            break;
                        }
                    }
                    
                    if (shouldShow) visibleRows++;
                }
                
                tabInfo.textContent = `${visibleRows} of ${totalRows} rows`;
            } else {
                tabInfo.textContent = `${totalRows} rows`;
            }
        } else {
            tabInfo.textContent = 'No data';
        }
        
        tabContent.appendChild(tabName);
        tabContent.appendChild(tabInfo);
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'tab-close-btn';
        closeBtn.innerHTML = '×';
        closeBtn.title = 'Close tab';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeTab(tab.id);
        });
        
        tabItem.appendChild(tabContent);
        tabItem.appendChild(closeBtn);
        
        tabItem.addEventListener('click', () => switchToTab(tab.id));
        
        // Double-click to rename
        tabContent.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            renameTab(tab.id);
        });
        
        // Right-click context menu
        tabItem.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showTabContextMenu(e, tab.id);
        });
        
        tabList.appendChild(tabItem);
    });
}

function closeTab(tabId) {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    
    const tabIndex = tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;
    
    // Remove tab
    tabs.splice(tabIndex, 1);
    
    // If this was the active tab, switch to another
    if (activeTabId === tabId) {
        if (tabs.length > 0) {
            // Switch to the tab at the same index, or the last tab if out of bounds
            const newIndex = Math.min(tabIndex, tabs.length - 1);
            switchToTab(tabs[newIndex].id);
        } else {
            // No tabs left, create a new one
            const newTab = createTab();
            activeTabId = newTab.id;
            renderTabs();
            restoreTabState(newTab);
        }
    } else {
        renderTabs();
    }
}

function createNewTab() {
    // Save current tab state
    saveCurrentTabState();
    
    // Create new tab
    const newTab = createTab();
    activeTabId = newTab.id;
    
    // Clear results and restore empty state
    restoreTabState(newTab);
    renderTabs();
}

function renameTab(tabId) {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    
    const tabItem = document.querySelector(`.tab-item[data-tab-id="${tabId}"]`);
    if (!tabItem) return;
    
    const tabNameDiv = tabItem.querySelector('.tab-name');
    if (!tabNameDiv) return;
    
    // Create input for renaming
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tab-rename-input';
    input.value = tab.name;
    
    // Replace the tab name with the input
    const originalText = tabNameDiv.textContent;
    tabNameDiv.textContent = '';
    tabNameDiv.appendChild(input);
    
    // Focus and select all text
    input.focus();
    input.select();
    
    const finishRename = (save) => {
        if (save && input.value.trim()) {
            tab.name = input.value.trim();
            tab.isCustomName = true; // Mark as custom name
        }
        renderTabs();
    };
    
    // Handle keyboard events
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            finishRename(true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            finishRename(false);
        }
        e.stopPropagation();
    });
    
    // Save on blur
    input.addEventListener('blur', () => {
        finishRename(true);
    });
    
    // Prevent click from bubbling to tab switch
    input.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

function showTabContextMenu(event, tabId) {
    // Remove any existing context menu
    const existingMenu = document.querySelector('.tab-context-menu');
    if (existingMenu) existingMenu.remove();
    
    // Create context menu
    const menu = document.createElement('div');
    menu.className = 'tab-context-menu';
    menu.style.left = event.pageX + 'px';
    menu.style.top = event.pageY + 'px';
    
    // Rename option
    const renameItem = document.createElement('div');
    renameItem.className = 'context-menu-item';
    renameItem.textContent = 'Rename';
    renameItem.addEventListener('click', () => {
        menu.remove();
        renameTab(tabId);
    });
    
    menu.appendChild(renameItem);
    document.body.appendChild(menu);
    
    // Close menu when clicking outside
    const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        }
    };
    
    // Delay adding the click listener to prevent immediate closing
    setTimeout(() => {
        document.addEventListener('click', closeMenu);
    }, 0);
}

function setTabStreaming(tabId, isStreaming) {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
        tab.isStreaming = isStreaming;
        renderTabs();
    }
}

function updateTabName(tabId, name) {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
        tab.name = name;
        tab.isCustomName = true; // Mark as custom name when explicitly updated
        renderTabs();
    }
}

// ========== END TAB MANAGEMENT ==========

function runQuery() {
    let start, end;
    try {
        const timeRange = currentTimeRange();
        start = timeRange.start;
        end = timeRange.end;
    } catch (error) {
        setStatus(`⚠ ${error.message}`);
        // Highlight the absolute time controls to draw attention
        const absoluteTime = document.querySelector('.absolute-time');
        if (absoluteTime) {
            absoluteTime.classList.remove('cwlv-pulse-attention');
            void absoluteTime.offsetWidth; // Force reflow
            absoluteTime.classList.add('cwlv-pulse-attention');
            setTimeout(() => absoluteTime.classList.remove('cwlv-pulse-attention'), 1400);
        }
        return;
    }
    
    const logGroups = getSelectedLogGroups();
    const region = document.getElementById('region').value.trim() || 'us-east-2';
    const query = getQueryText();
    const runBtn = document.getElementById('runBtn');
    if (!logGroups.length) {
        setStatus('⚠ Select at least one log group');
        pulseLogGroupsAttention();
        return;
    }
    if (!query.trim()) {
        setStatus('⚠ Query string is empty');
        return;
    }
    
    // Tab logic: always overwrite current tab with new query results
    const currentTab = getActiveTab();
    let targetTab;
    
    if (!currentTab || tabs.length === 0) {
        // No tabs exist, create first one
        targetTab = createTab({
            name: `Query ${formatTimestamp(Date.now())}`,
            query,
            logGroups,
            region,
            timeRange: { start, end },
            isStreaming: true
        });
        activeTabId = targetTab.id;
    } else {
        // Overwrite current tab with new query
        targetTab = currentTab;
        // Only update name if it wasn't manually set by user
        if (!targetTab.isCustomName) {
            targetTab.name = `Query ${formatTimestamp(Date.now())}`;
        }
        targetTab.query = query;
        targetTab.logGroups = logGroups;
        targetTab.region = region;
        targetTab.timeRange = { start, end };
        targetTab.results = null;
        targetTab.isStreaming = true;
        targetTab.searchQuery = '';
        targetTab.searchIndex = -1;
        targetTab.columnFilters = {};
        targetTab.expandedRows = new Set();
        targetTab.scrollPosition = 0;
        
        // Clear current results display
        const resultsDiv = document.getElementById('results');
        if (resultsDiv) resultsDiv.innerHTML = '';
        currentResults = null;
    }
    
    renderTabs();
    
    // Track which tab is running the query
    runningQueryTabId = targetTab.id;
    
    setStatus('Running query...');
    if (runBtn) {
        runBtn.setAttribute('data-state', 'running');
        runBtn.disabled = false; // Keep enabled so user can abort
        const label = runBtn.querySelector('.run-btn-label');
        if (label) label.textContent = 'Cancel Query';
    }
    vscode.postMessage({ type: 'runQuery', data: { logGroups, region, query, startTime: start, endTime: end } });
}

function setStatus(msg) {
    document.getElementById('status').textContent = msg;
}

// Briefly pulse-highlight the log groups panel to draw user attention when required selection missing
function pulseLogGroupsAttention() {
    try {
        const panel = document.querySelector('.log-groups-panel');
        if (!panel) return;
        // If already pulsing restart the animation by cloning (css animations don't always restart when class re-added quickly)
        panel.classList.remove('cwlv-pulse-attention');
        // Force reflow to allow animation restart
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        void panel.offsetWidth;
        panel.classList.add('cwlv-pulse-attention');
    // Remove class after single animation completes (~1.1s + buffer)
    setTimeout(() => panel.classList.remove('cwlv-pulse-attention'), 1400);
    } catch (_) { /* ignore */ }
}

function appendPartialResults(partialPayload) {
    // Merge new rows into currentResults
    if (!currentResults || !currentResults.rows) {
        currentResults = { rows: [], fieldOrder: partialPayload.fieldOrder || [], hiddenFields: partialPayload.hiddenFields || ['@ptr'] };
    }
    
    const startIdx = currentResults.rows.length;
    currentResults.rows.push(...partialPayload.rows);
    currentResults.fieldOrder = partialPayload.fieldOrder || currentResults.fieldOrder;
    currentResults.hiddenFields = partialPayload.hiddenFields || currentResults.hiddenFields;
    
    const container = document.getElementById('results');
    let table = container.querySelector('table');
    let tbody = table ? table.querySelector('tbody') : null;
    
    // Filter out hidden fields
    const hidden = Array.isArray(currentResults.hiddenFields) ? currentResults.hiddenFields : ['@ptr'];
    const fields = currentResults.fieldOrder.filter(f => !hidden.includes(f));
    
    // Create table if first batch
    if (!table) {
        invalidateRowCache();
        clearAllFilters();
        
        table = document.createElement('table');
        const head = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        const expandHeader = document.createElement('th');
        expandHeader.className = 'expand-col-header';
        expandHeader.style.width = '34px';
        headerRow.appendChild(expandHeader);
        
        fields.forEach((f) => {
            const th = document.createElement('th');
            th.style.position = 'relative';
            th.dataset.field = f;
            const headerContent = document.createElement('div');
            headerContent.className = 'th-content';
            const span = document.createElement('span');
            span.textContent = f;
            headerContent.appendChild(span);
            const filterBtn = document.createElement('button');
            filterBtn.type = 'button';
            filterBtn.className = 'column-filter-btn';
            filterBtn.title = `Filter ${f}`;
            filterBtn.innerHTML = '⋮';
            filterBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showColumnFilter(f, filterBtn);
            });
            headerContent.appendChild(filterBtn);
            th.appendChild(headerContent);
            headerRow.appendChild(th);
        });
        
        head.appendChild(headerRow);
        table.appendChild(head);
        tbody = document.createElement('tbody');
        table.appendChild(tbody);
        container.innerHTML = '';
        container.appendChild(table);
    }
    
    // Append new rows to tbody
    partialPayload.rows.forEach((row, idx) => {
        const tr = document.createElement('tr');
        tr.dataset.rowIndex = String(startIdx + idx);
        
        const expandCell = document.createElement('td');
        expandCell.className = 'expand-cell';
        const expandBtn = document.createElement('button');
        expandBtn.type = 'button';
        expandBtn.className = 'expand-btn';
        expandBtn.innerHTML = '▶';
        expandBtn.addEventListener('click', () => toggleRowDetail(tr, row));
        expandCell.appendChild(expandBtn);
        tr.appendChild(expandCell);
        
        fields.forEach(f => {
            const val = row.fields.find(x => x.field === f)?.value || '';
            const td = document.createElement('td');
            td.textContent = val;
            td.title = val;
            tr.appendChild(td);
        });
        
        tbody.appendChild(tr);
    });
    
    invalidateRowCache();
    // Update tab to show current row count during streaming
    const activeTab = getActiveTab();
    if (activeTab) {
        activeTab.results = currentResults;
    }
    renderTabs();
}

function renderResults(payload, skipClearFilters = false) {
    currentResults = payload;
    const container = document.getElementById('results');
    container.innerHTML = '';
    // Results changed – invalidate any cached row references used by search
    invalidateRowCache();
    // Clear column filters when new results are loaded (unless restoring tab state)
    if (!skipClearFilters) {
        clearAllFilters();
    }

    // Safety check
    if (!payload || !payload.fieldOrder || !payload.rows) {
        container.textContent = 'No results.';
        return;
    }

    // Filter out hidden fields (server can send metadata) default to @ptr only
    const hidden = Array.isArray(payload.hiddenFields) ? payload.hiddenFields : ['@ptr'];
    const fields = payload.fieldOrder.filter(f => !hidden.includes(f));

    if (!payload.rows.length) {
        container.textContent = 'No results.';
        return;
    }

    const table = document.createElement('table');
    const head = document.createElement('thead');
    const headerRow = document.createElement('tr');
    // Expand column header (blank)
    const expandHeader = document.createElement('th');
    expandHeader.className = 'expand-col-header';
    expandHeader.style.width = '34px';
    headerRow.appendChild(expandHeader);
    fields.forEach((f, index) => {
        const th = document.createElement('th');
        th.style.position = 'relative';
        th.dataset.field = f;

        const headerContent = document.createElement('div');
        headerContent.className = 'th-content';

        const span = document.createElement('span');
        span.textContent = f;
        headerContent.appendChild(span);

        // Add filter button
        const filterBtn = document.createElement('button');
        filterBtn.type = 'button';
        filterBtn.className = 'column-filter-btn';
        filterBtn.title = `Filter ${f}`;
        filterBtn.innerHTML = '⋮';
        filterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showColumnFilter(f, filterBtn);
        });
        headerContent.appendChild(filterBtn);

        th.appendChild(headerContent);

        // Add resize handle (not on last column; account for extra expand column)
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

        // Expand cell
        const expandCell = document.createElement('td');
        expandCell.className = 'expand-cell';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'expand-btn';
        btn.title = 'Show details';
        btn.textContent = '›';
        btn.addEventListener('click', () => toggleRowDetails(tr, r));
        expandCell.appendChild(btn);
        tr.appendChild(expandCell);

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

// Column filtering functionality
let activeFilters = {}; // { fieldName: Set(selectedValues) }
let currentFilterModal = null;

function showColumnFilter(fieldName, buttonElement) {
    // Close existing modal if any
    if (currentFilterModal) {
        currentFilterModal.remove();
        currentFilterModal = null;
        return;
    }

    // Get all distinct values from this column
    const valueCountMap = getColumnValueCounts(fieldName);
    
    // Sort by count descending
    const sortedValues = Array.from(valueCountMap.entries())
        .sort((a, b) => b[1] - a[1]);

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'column-filter-modal';
    currentFilterModal = modal;

    // Position modal near the button
    const rect = buttonElement.getBoundingClientRect();
    modal.style.position = 'fixed';
    modal.style.top = `${rect.bottom + 5}px`;
    modal.style.left = `${rect.left - 150}px`; // offset to align better

    // Modal content
    const header = document.createElement('div');
    header.className = 'filter-modal-header';
    header.textContent = `Filter: ${fieldName}`;
    modal.appendChild(header);

    // Search input for filtering the values list
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'filter-search-input';
    searchInput.placeholder = 'Search values...';
    modal.appendChild(searchInput);

    // Values list container
    const valuesList = document.createElement('div');
    valuesList.className = 'filter-values-list';
    
    const renderValuesList = (filterText = '') => {
        valuesList.innerHTML = '';
        const lowerFilter = filterText.toLowerCase();
        const filtered = sortedValues.filter(([value]) => 
            value.toLowerCase().includes(lowerFilter)
        );

        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'filter-value-empty';
            empty.textContent = 'No matching values';
            valuesList.appendChild(empty);
            return;
        }

        filtered.forEach(([value, count]) => {
            const item = document.createElement('div');
            item.className = 'filter-value-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `filter-${fieldName}-${value}`;
            
            // Check if this value is currently filtered
            const fieldFilters = activeFilters[fieldName];
            checkbox.checked = !fieldFilters || fieldFilters.has(value);
            
            checkbox.addEventListener('change', () => {
                toggleFilterValue(fieldName, value);
            });

            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.className = 'filter-value-label';
            
            const valueSpan = document.createElement('span');
            valueSpan.className = 'filter-value-text';
            valueSpan.textContent = value || '(empty)';
            
            const countSpan = document.createElement('span');
            countSpan.className = 'filter-value-count';
            countSpan.textContent = count;

            label.appendChild(valueSpan);
            label.appendChild(countSpan);

            item.appendChild(checkbox);
            item.appendChild(label);
            valuesList.appendChild(item);
        });
    };

    renderValuesList();
    searchInput.addEventListener('input', (e) => {
        renderValuesList(e.target.value);
    });

    modal.appendChild(valuesList);

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'filter-modal-actions';

    const selectAllBtn = document.createElement('button');
    selectAllBtn.textContent = 'Select All';
    selectAllBtn.className = 'filter-action-btn';
    selectAllBtn.addEventListener('click', () => {
        delete activeFilters[fieldName];
        renderValuesList(searchInput.value);
        applyColumnFilters();
        updateFilterIndicators();
    });

    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.className = 'filter-action-btn';
    clearBtn.addEventListener('click', () => {
        activeFilters[fieldName] = new Set();
        renderValuesList(searchInput.value);
        applyColumnFilters();
        updateFilterIndicators();
    });

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.className = 'filter-action-btn filter-close-btn';
    closeBtn.addEventListener('click', () => {
        modal.remove();
        currentFilterModal = null;
    });

    actions.appendChild(selectAllBtn);
    actions.appendChild(clearBtn);
    actions.appendChild(closeBtn);
    modal.appendChild(actions);

    document.body.appendChild(modal);

    // Close modal when clicking outside
    setTimeout(() => {
        document.addEventListener('click', handleOutsideClick);
    }, 0);

    function handleOutsideClick(e) {
        if (!modal.contains(e.target) && !buttonElement.contains(e.target)) {
            modal.remove();
            currentFilterModal = null;
            document.removeEventListener('click', handleOutsideClick);
        }
    }

    searchInput.focus();
}

function getColumnValueCounts(fieldName) {
    const valueCountMap = new Map();
    const rows = document.querySelectorAll('#results tbody tr:not(.detail-row)');
    
    rows.forEach(row => {
        const cell = row.querySelector(`td[data-field="${fieldName}"]`);
        if (cell) {
            const value = cell.textContent.trim();
            valueCountMap.set(value, (valueCountMap.get(value) || 0) + 1);
        }
    });

    return valueCountMap;
}

function toggleFilterValue(fieldName, value) {
    if (!activeFilters[fieldName]) {
        // First filter on this column - start with all values except this one
        const allValues = new Set();
        const rows = document.querySelectorAll('#results tbody tr:not(.detail-row)');
        rows.forEach(row => {
            const cell = row.querySelector(`td[data-field="${fieldName}"]`);
            if (cell) {
                allValues.add(cell.textContent.trim());
            }
        });
        activeFilters[fieldName] = allValues;
    }

    const fieldFilters = activeFilters[fieldName];
    if (fieldFilters.has(value)) {
        fieldFilters.delete(value);
    } else {
        fieldFilters.add(value);
    }

    // If all values are selected, remove the filter
    const totalValues = getColumnValueCounts(fieldName).size;
    if (fieldFilters.size === totalValues) {
        delete activeFilters[fieldName];
    }

    applyColumnFilters();
    updateFilterIndicators();
}

function applyColumnFilters() {
    const rows = document.querySelectorAll('#results tbody tr:not(.detail-row)');
    
    rows.forEach(row => {
        let shouldShow = true;

        // Check each active filter
        for (const [fieldName, allowedValues] of Object.entries(activeFilters)) {
            if (allowedValues.size === 0) {
                shouldShow = false;
                break;
            }

            const cell = row.querySelector(`td[data-field="${fieldName}"]`);
            if (cell) {
                const value = cell.textContent.trim();
                if (!allowedValues.has(value)) {
                    shouldShow = false;
                    break;
                }
            }
        }

        if (shouldShow) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
            // Also hide associated detail row if expanded
            const detailRow = row.nextElementSibling;
            if (detailRow && detailRow.classList.contains('detail-row')) {
                detailRow.style.display = 'none';
            }
        }
    });

    // Update the active tab's column filters (deep clone the Sets)
    const activeTab = getActiveTab();
    if (activeTab) {
        activeTab.columnFilters = {};
        for (const [fieldName, allowedValues] of Object.entries(activeFilters)) {
            activeTab.columnFilters[fieldName] = new Set(allowedValues);
        }
    }

    updateFilteredRowCount();
    renderTabs(); // Update tab info to show filtered row count
    
    // Update status to reflect filtered row count
    const rowCountText = getRowCountText();
    if (rowCountText) {
        setStatus(`✓ Query Complete${rowCountText}`);
    }
}

function updateFilterIndicators() {
    const headers = document.querySelectorAll('#results thead th[data-field]');
    
    headers.forEach(th => {
        const fieldName = th.dataset.field;
        const filterBtn = th.querySelector('.column-filter-btn');
        
        if (filterBtn) {
            if (activeFilters[fieldName]) {
                filterBtn.classList.add('active');
            } else {
                filterBtn.classList.remove('active');
            }
        }
    });
}

function updateFilteredRowCount() {
    // This function is now deprecated as row counts are shown in tabs
    // Kept for backwards compatibility - renderTabs() handles the count display
}

function clearAllFilters() {
    activeFilters = {};
    applyColumnFilters();
    updateFilterIndicators();
}

function loadLogGroups() {
    const region = document.getElementById('region').value.trim() || 'us-east-2';
    const prefix = document.getElementById('lgFilter').value.trim();
    setStatus('Loading log groups...');
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
    rowCache = Array.from(rows)
        .filter(row => !row.classList.contains('detail-row')) // exclude expanded JSON detail rows from search indexing
        .map(row => {
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
                if (hideNonMatching && rowEl.classList.contains('row-hidden')) collapseRowDetail(rowEl); // ensure detail collapses when hidden
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
        if (shouldHide) collapseRowDetail(entry.rowEl);
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
                if (btn) {
                    btn.setAttribute('data-state', 'running');
                    btn.disabled = false;
                    const label = btn.querySelector('.run-btn-label');
                    if (label) label.textContent = 'Cancel Query';
                }
                // Clear results container when starting new query
                const container = document.getElementById('results');
                if (container) container.innerHTML = '';
                currentResults = { rows: [], fieldOrder: [], status: 'Running' };
                invalidateRowCache();
                clearAllFilters();
            } else if (msg.data.status === 'Aborted') {
                const btn = document.getElementById('runBtn');
                if (btn) {
                    btn.setAttribute('data-state', 'idle');
                    btn.disabled = false;
                    const label = btn.querySelector('.run-btn-label');
                    if (label) label.textContent = 'Run Query';
                }
                setStatus('⏹ Query aborted');
                // Mark the query tab as no longer streaming
                if (runningQueryTabId) {
                    setTabStreaming(runningQueryTabId, false);
                    runningQueryTabId = null;
                }
            }
            break;
        case 'queryPartialResult':
            // Append partial results incrementally to the tab that initiated the query
            if (runningQueryTabId && activeTabId === runningQueryTabId) {
                // Only update if we're viewing the tab that's running the query
                appendPartialResults(msg.data);
                // Update status with current row count
                const rowCount = currentResults.rows ? currentResults.rows.length : 0;
                setStatus(`Running query... (${rowCount} rows)`);
            } else if (runningQueryTabId) {
                // Save to the background tab
                const queryTab = tabs.find(t => t.id === runningQueryTabId);
                if (queryTab) {
                    if (!queryTab.results || !queryTab.results.rows) {
                        queryTab.results = { rows: [], fieldOrder: msg.data.fieldOrder || [], hiddenFields: msg.data.hiddenFields || ['@ptr'] };
                    }
                    queryTab.results.rows.push(...msg.data.rows);
                    queryTab.results.fieldOrder = msg.data.fieldOrder || queryTab.results.fieldOrder;
                    queryTab.results.hiddenFields = msg.data.hiddenFields || queryTab.results.hiddenFields;
                    // Update tabs to show streaming row count
                    renderTabs();
                    // Update status with background tab row count
                    const rowCount = queryTab.results.rows.length;
                    setStatus(`Running query in background tab... (${rowCount} rows)`);
                }
            }
            break;
        case 'queryResult':
            {
                const btn = document.getElementById('runBtn');
                if (btn) {
                    btn.setAttribute('data-state', 'idle');
                    btn.disabled = false;
                    const label = btn.querySelector('.run-btn-label');
                    if (label) label.textContent = 'Run Query';
                }
                
                // Apply results to the tab that ran the query
                const queryTab = runningQueryTabId ? tabs.find(t => t.id === runningQueryTabId) : null;
                if (queryTab) {
                    queryTab.results = msg.data;
                    setTabStreaming(queryTab.id, false);
                    
                    // Update status with row count
                    const rowCount = msg.data.rows ? msg.data.rows.length : 0;
                    setStatus(`✓ Query ${msg.data.status} (${rowCount} rows)`);
                    
                    // If we're viewing this tab, render the results
                    if (activeTabId === runningQueryTabId) {
                        renderResults(msg.data);
                    }
                }
                
                runningQueryTabId = null;
            }
            break;
        case 'queryError':
            setStatus('❌ Error: ' + msg.error);
            {
                const btn = document.getElementById('runBtn');
                if (btn) {
                    btn.setAttribute('data-state', 'idle');
                    btn.disabled = false;
                    const label = btn.querySelector('.run-btn-label');
                    if (label) label.textContent = 'Run Query';
                }
                // Mark the query tab as no longer streaming
                if (runningQueryTabId) {
                    setTabStreaming(runningQueryTabId, false);
                    runningQueryTabId = null;
                }
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

// Initialize tabs - create first tab
if (tabs.length === 0) {
    const firstTab = createTab({ name: 'Results' });
    activeTabId = firstTab.id;
    renderTabs();
}

// Note: Previous logic collapsed log groups via a button id (lgCollapseBtn) that no longer exists.
// Cleaned up to avoid accessing null elements.

