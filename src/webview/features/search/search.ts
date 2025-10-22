import { getState, updateTab } from '../../core/state';
import { setStatus } from '../../components/status';
import { send } from '../../core/messaging';
import { escapeHtml } from '../../lib/html';
import type { DomRowCacheEntry, SearchMatch } from '../../types/state';

// Module-level state for search execution control only
let prevSearchTerm = '';
let prevHideNonMatching = true;
let prevRowCount = 0;
let activeSearchToken = 0;
let searchDebounceTimer: any = null;
let lastKeyTime = 0;

function debugLog(message: string) {
  try { send({ type: 'debugLog', message }); } catch { /* ignore */ }
}

// Helper to get active tab
function getActiveTab() {
  const s = getState();
  if (s.activeTabId == null) return null;
  return s.tabs.find(t => t.id === s.activeTabId) || null;
}

export function invalidateRowCache() {
  const s = getState();
  if (s.activeTabId == null) return;
  const tab = s.tabs.find(t => t.id === s.activeTabId);
  if (tab) {
    tab.rowCache = undefined;
    tab.previousMatchedRowIndices = undefined;
    tab.searchMatches = undefined;
  }
  prevSearchTerm = ''; 
}

function buildRowCache(): DomRowCacheEntry[] {
  const s = getState();
  if (s.activeTabId == null) return [];
  const tab = s.tabs.find(t => t.id === s.activeTabId);
  if (!tab) return [];
  
  // Return cached version if it exists
  if (tab.rowCache) return tab.rowCache;
  
  const container = document.getElementById(`results-${s.activeTabId}`);
  if (!container) return [];
  const rows = Array.from(container.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
  const cache = rows
    .filter(r => !r.classList.contains('detail-row'))
    .map(r => {
  const tdEls = Array.from(r.querySelectorAll('td')) as HTMLTableCellElement[];
  const filteredTdEls = tdEls.filter((td: HTMLTableCellElement) => !td.classList.contains('expand-cell'));
  const cells = filteredTdEls.map(td => {
        const original = td.dataset.originalText || td.textContent || '';
        if (!td.dataset.originalText) td.dataset.originalText = original;
        return { el: td, original, lower: original.toLowerCase() };
      });
      const combinedLower = cells.map(c => c.lower).join('\u0001');
      return { rowEl: r as HTMLTableRowElement, cells, combinedLower, lastMatched: true };
    });
  
  // Store cache in tab state
  tab.rowCache = cache;
  prevRowCount = cache.length;
  return cache;
}

function ensureSpinner() { return document.getElementById('searchSpinner'); }
function setSearchBusy(busy: boolean) { const el = ensureSpinner(); if (!el) return; if (busy) el.classList.add('active'); else el.classList.remove('active'); }

function computeSearchDelay(): number {
  const input = document.getElementById('searchInput') as HTMLInputElement | HTMLTextAreaElement | null;
  const term = input?.value.trim() || '';
  const len = term.length;
  const s = getState();
  const tab = s.activeTabId != null ? s.tabs.find(t => t.id === s.activeTabId) : null;
  const cacheLen = tab?.rowCache ? tab.rowCache.length : 0;
  const rowFactor = Math.min(300, cacheLen / 50);
  const now = Date.now();
  const typingFast = (now - lastKeyTime) < 150; lastKeyTime = now;
  if (len === 0) return 0;
  if (len < 3) return 200 + rowFactor;
  if (typingFast) return 140 + rowFactor / 2;
  return 60 + rowFactor / 3;
}

export function clearSearch() {
  const input = document.getElementById('searchInput') as HTMLInputElement | null;
  if (input) input.value = '';
  searchResults();
}

export function navigateSearchNext() {
  const s = getState();
  if (s.activeTabId == null) return;
  const tab = s.tabs.find(t => t.id === s.activeTabId);
  if (!tab || !tab.searchMatches || !tab.searchMatches.length) return;
  
  tab.searchIndex = (tab.searchIndex + 1) % tab.searchMatches.length;
  highlightCurrentMatch();
}

export function navigateSearchPrev() {
  const s = getState();
  if (s.activeTabId == null) return;
  const tab = s.tabs.find(t => t.id === s.activeTabId);
  if (!tab || !tab.searchMatches || !tab.searchMatches.length) return;
  
  tab.searchIndex = (tab.searchIndex - 1 + tab.searchMatches.length) % tab.searchMatches.length;
  highlightCurrentMatch();
}
export function toggleHideNonMatching() {
  const hide = (document.getElementById('searchHideNonMatching') as HTMLInputElement | null)?.checked || false;
  const tab = getActiveTab();
  if (!tab?.rowCache || !prevSearchTerm) { searchResults(false, true); return; }
  let activeMatchRow: HTMLTableRowElement | null = null;
  if (tab.searchIndex >= 0 && tab.searchMatches?.[tab.searchIndex]) {
    activeMatchRow = tab.searchMatches[tab.searchIndex].row;
  }
  tab.rowCache.forEach((entry: DomRowCacheEntry) => {
    const shouldHide = hide && !entry.lastMatched;
    entry.rowEl.classList.toggle('row-hidden', shouldHide);
    if (shouldHide) collapseDetailIfPresent(entry.rowEl);
  });
  if (activeMatchRow && activeMatchRow.classList.contains('row-hidden')) activeMatchRow.classList.remove('row-hidden');
  if (activeMatchRow) requestAnimationFrame(() => { try { activeMatchRow!.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {} });
}

function collapseDetailIfPresent(row: HTMLTableRowElement) {
  const next = row.nextElementSibling;
  if (next && next.classList.contains('detail-row')) next.remove();
}

function highlightCurrentMatch() {
  document.querySelectorAll('mark.search-highlight').forEach((m: Element) => m.classList.remove('current-match'));
  
  const s = getState();
  const tab = s.activeTabId != null ? s.tabs.find(t => t.id === s.activeTabId) : null;
  if (!tab || !tab.searchMatches || tab.searchMatches.length === 0 || tab.searchIndex < 0) return;
  
  const match = tab.searchMatches[tab.searchIndex];
  match.mark.classList.add('current-match');
  match.mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
  
  const statusText = `🔍 Match ${tab.searchIndex + 1}/${tab.searchMatches.length}`;
  setStatus(statusText);
  
  updateTab(s, s.activeTabId!, { status: statusText });
}

export function searchResults(preservePosition = false, force = false, restoreIndex?: number) {
  const perf = (typeof performance !== 'undefined' ? performance : { now: () => Date.now() });
  const t0 = perf.now();
  const input = document.getElementById('searchInput') as HTMLInputElement | null;
  const termRaw = input?.value.trim() || '';
  const term = termRaw;
  const lowerTerm = term.toLowerCase();
  const hideNonMatching = (document.getElementById('searchHideNonMatching') as HTMLInputElement | null)?.checked || false;
  
  console.log('[search] searchResults called:', { term, force, preservePosition, restoreIndex, inputElement: input });
  
  const cacheBuildStart = perf.now();
  const s2 = getState();
  const tab2 = s2.activeTabId != null ? s2.tabs.find(t => t.id === s2.activeTabId) : null;
  const existingCacheRef = tab2?.rowCache;
  const cache = buildRowCache();
  const cacheBuildMs = perf.now() - cacheBuildStart;
  
  console.log('[search] cache built:', { cacheLength: cache.length, term, prevSearchTerm });
  
  if (!force && term === prevSearchTerm && hideNonMatching === prevHideNonMatching && cache.length === prevRowCount) {
    console.log('[search] skipping - no changes');
    return;
  }
  const termChanged = term !== prevSearchTerm;
  const narrowing = termChanged && term.startsWith(prevSearchTerm) && prevSearchTerm.length > 0;
  prevHideNonMatching = hideNonMatching;
  prevRowCount = cache.length;
  
  // Get the current tab's searchIndex for preserving position
  const currentTabIndex = tab2?.searchIndex ?? -1;
  // Use restoreIndex if provided, otherwise use current tab index if preservePosition is true
  const savedIndex = restoreIndex !== undefined ? restoreIndex : (preservePosition ? currentTabIndex : -1);
  
  const token = ++activeSearchToken;
  if (termChanged) {
  document.querySelectorAll('mark.search-highlight').forEach((mark: Element) => {
      const cell = mark.parentElement?.closest('td');
      if (cell && cell instanceof HTMLTableCellElement && cell.dataset.originalText) cell.textContent = cell.dataset.originalText;
    });
  }
  if (!term) {
    cache.forEach(entry => {
      entry.rowEl.classList.remove('row-hidden');
      entry.cells.forEach(c => { if (c.el.textContent !== c.original) c.el.textContent = c.original; });
      entry.lastMatched = true;
    });
    setStatus(''); setSearchBusy(false); prevSearchTerm = term; 
    const s3 = getState();
    const tab3 = s3.activeTabId != null ? s3.tabs.find(t => t.id === s3.activeTabId) : null;
    if (tab3) {
      tab3.previousMatchedRowIndices = undefined;
      tab3.searchMatches = [];
      updateTab(s3, s3.activeTabId!, { searchIndex: -1 });
    }
    return;
  }
  setSearchBusy(true); setStatus('🔍 Searching...');
  let scanIndices: number[];
  const s4 = getState();
  const tab4 = s4.activeTabId != null ? s4.tabs.find(t => t.id === s4.activeTabId) : null;
  const previousMatchedRowIndices = tab4?.previousMatchedRowIndices;
  if (!term || !previousMatchedRowIndices || !narrowing) scanIndices = cache.map((_, i) => i); else scanIndices = previousMatchedRowIndices;
  const newMatched: number[] = []; let matchedRowCount = 0; let highlightCells = 0; let highlightTimeMs = 0;
  const scanStart = perf.now(); let processed = 0; let cpuTimeMs = 0; let timeBudgetMs = 10;
  const escalationCheckCount = Math.min(400, scanIndices.length);
  function processSlice() {
    if (token !== activeSearchToken) return;
    const sliceStartWall = perf.now(); let sliceCpuStart = sliceStartWall;
    while (processed < scanIndices.length) {
      const i = scanIndices[processed++]; const entry = cache[i]; const { rowEl, cells, combinedLower } = entry;
      if (!combinedLower.includes(lowerTerm)) {
        rowEl.classList.toggle('row-hidden', hideNonMatching);
        if (hideNonMatching && rowEl.classList.contains('row-hidden')) collapseDetailIfPresent(rowEl);
        cells.forEach(c => { if (c.el.querySelector && c.el.querySelector('mark.search-highlight')) c.el.textContent = c.original; });
        entry.lastMatched = false;
      } else {
        matchedRowCount++; newMatched.push(i); rowEl.classList.remove('row-hidden'); entry.lastMatched = true;
        for (const cell of cells) {
          if (!cell.lower.includes(lowerTerm)) continue;
          const hStart = perf.now(); const original = cell.original; const lowerOriginal = cell.lower;
          let resultHtml = ''; let startIdx = 0; let searchIdx: number;
          while ((searchIdx = lowerOriginal.indexOf(lowerTerm, startIdx)) !== -1) {
            resultHtml += escapeHtml(original.slice(startIdx, searchIdx)) + `<mark class="search-highlight">${escapeHtml(original.slice(searchIdx, searchIdx + term.length))}</mark>`;
            startIdx = searchIdx + term.length;
          }
          resultHtml += escapeHtml(original.slice(startIdx)); cell.el.innerHTML = resultHtml; highlightCells++; highlightTimeMs += (perf.now() - hStart);
        }
      }
      if (processed === escalationCheckCount) {
        const ratio = matchedRowCount / processed; if (ratio > 0.5) timeBudgetMs = 22; else if (ratio > 0.2) timeBudgetMs = 16;
      }
      if ((perf.now() - sliceStartWall) >= timeBudgetMs) break;
    }
    cpuTimeMs += (perf.now() - sliceCpuStart);
    if (processed < scanIndices.length) setTimeout(processSlice, 0); else {
      if (token !== activeSearchToken) return;
      
      // Build searchMatches array from all highlighted marks
      const newSearchMatches: SearchMatch[] = [];
      document.querySelectorAll('mark.search-highlight').forEach((mark: Element) => { 
        const row = mark.closest('tr'); 
        if (row) newSearchMatches.push({ row: row as HTMLTableRowElement, mark: mark as HTMLElement }); 
      });
      
      // Store search matches in tab state
      const s5 = getState();
      const tab5 = s5.activeTabId != null ? s5.tabs.find(t => t.id === s5.activeTabId) : null;
      if (tab5) {
        tab5.searchMatches = newSearchMatches;
        tab5.previousMatchedRowIndices = newMatched;
        
        if (newSearchMatches.length) { 
          // Restore saved index if preservePosition was true, otherwise start at 0
          const newIndex = (savedIndex >= 0 && savedIndex < newSearchMatches.length) ? savedIndex : 0;
          updateTab(s5, s5.activeTabId!, { searchIndex: newIndex });
          highlightCurrentMatch(); 
        } else {
          updateTab(s5, s5.activeTabId!, { searchIndex: -1 });
        }
        
        const statusText = `🔍 ${newSearchMatches.length} matches in ${matchedRowCount} rows`;
        setStatus(statusText);
        updateTab(s5, s5.activeTabId!, { status: statusText });
      }
      
      setSearchBusy(false); 
      const tEnd = perf.now(); const wallScanMs = tEnd - scanStart; const totalMs = tEnd - t0;
      debugLog(`[search] term="${term}" rows=${cache.length} scanned=${scanIndices.length} matchedRows=${matchedRowCount} matches=${newSearchMatches.length} highlightCells=${highlightCells} cacheReused=${existingCacheRef? 'yes':'no'} cacheBuildMs=${cacheBuildMs.toFixed(1)} wallScanMs=${wallScanMs.toFixed(1)} cpuScanMs=${cpuTimeMs.toFixed(1)} highlightMs=${highlightTimeMs.toFixed(1)} totalMs=${totalMs.toFixed(1)} budget=${timeBudgetMs}`);
      prevSearchTerm = term;
    }
  }
  processSlice();
  prevSearchTerm = term;
}

export function scheduleSearchRerun() {
  const input = document.getElementById('searchInput') as HTMLInputElement | null;
  if (input && input.value.trim()) setTimeout(() => searchResults(false, true), 0);
}

export function initSearchEvents() {
  const input = document.getElementById('searchInput');
  console.log('[search] initSearchEvents - input element:', input);
  if (input && !input.hasAttribute('data-search-bound')) {
    input.setAttribute('data-search-bound', 'true');
    input.addEventListener('input', () => {
      console.log('[search] input event fired, value:', (input as HTMLInputElement).value);
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      const delay = computeSearchDelay();
      searchDebounceTimer = setTimeout(() => searchResults(), delay);
    });
  }
  const clearBtn = document.getElementById('searchClearBtn');
  if (clearBtn && !clearBtn.hasAttribute('data-search-bound')) {
    clearBtn.setAttribute('data-search-bound', 'true');
    clearBtn.addEventListener('click', clearSearch);
  }
  const prevBtn = document.getElementById('searchPrevBtn');
  if (prevBtn && !prevBtn.hasAttribute('data-search-bound')) {
    prevBtn.setAttribute('data-search-bound', 'true');
    prevBtn.addEventListener('click', navigateSearchPrev);
  }
  const nextBtn = document.getElementById('searchNextBtn');
  if (nextBtn && !nextBtn.hasAttribute('data-search-bound')) {
    nextBtn.setAttribute('data-search-bound', 'true');
    nextBtn.addEventListener('click', navigateSearchNext);
  }
  const hideChk = document.getElementById('searchHideNonMatching');
  if (hideChk && !hideChk.hasAttribute('data-search-bound')) {
    hideChk.setAttribute('data-search-bound', 'true');
    hideChk.addEventListener('change', toggleHideNonMatching);
  }
}
