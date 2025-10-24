"use strict";
(() => {
  // src/webview/core/messaging.ts
  var vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;
  var handlers = {};
  function send(message) {
    try {
      vscode?.postMessage(message);
    } catch (e) {
      console.warn("[messaging] postMessage failed", e);
    }
  }
  function on(type, handler) {
    if (!handlers[type]) handlers[type] = [];
    handlers[type].push(handler);
  }
  function initMessageListener() {
    window.addEventListener("message", (event) => {
      const msg = event.data;
      if (!msg || typeof msg !== "object" || !msg.type) return;
      const list = handlers[msg.type];
      if (list) {
        list.forEach((h) => {
          try {
            h(msg);
          } catch (e) {
            console.error("handler error", e);
          }
        });
      }
    });
  }

  // src/webview/types/state.ts
  function createInitialTab(id) {
    return {
      id,
      name: "Results",
      isCustomName: false,
      timestamp: Date.now(),
      query: "",
      logGroups: [],
      region: "",
      timeRange: { start: 0, end: 0 },
      results: null,
      searchQuery: "",
      searchIndex: -1,
      searchHideNonMatching: false,
      searchBarOpen: false,
      columnFilters: {},
      expandedRows: /* @__PURE__ */ new Set(),
      scrollPosition: 0,
      status: ""
    };
  }
  function createInitialAppState() {
    return {
      tabs: [],
      activeTabId: null,
      nextTabId: 1,
      favorites: [],
      savedQueries: [],
      savedQueriesSource: "aws",
      logGroups: [],
      timeMode: "relative",
      relative: { value: 1, unit: "hours" }
    };
  }

  // src/webview/core/stateActions.ts
  function updateTab(state2, tabId, updates) {
    const tab = state2.tabs.find((t) => t.id === tabId);
    if (!tab) return false;
    Object.assign(tab, updates);
    return true;
  }
  function resetTabForNewQuery(state2, tabId, query, logGroups, region, timeRange) {
    const tab = state2.tabs.find((t) => t.id === tabId);
    if (!tab) return false;
    tab.query = query;
    tab.logGroups = logGroups;
    tab.region = region;
    tab.timeRange = timeRange;
    tab.results = null;
    tab.searchQuery = "";
    tab.searchIndex = -1;
    tab.columnFilters = {};
    tab.expandedRows = /* @__PURE__ */ new Set();
    tab.scrollPosition = 0;
    tab.status = "Running query...";
    return true;
  }
  function completeTabQuery(state2, tabId, results) {
    const tab = state2.tabs.find((t) => t.id === tabId);
    if (!tab) return false;
    tab.results = results;
    tab.status = `\u2713 Query Complete (${results.rows.length} rows)`;
    return true;
  }
  function setTabError(state2, tabId, error) {
    const tab = state2.tabs.find((t) => t.id === tabId);
    if (!tab) return false;
    tab.status = `Error: ${error}`;
    return true;
  }
  function setTabStatus(state2, tabId, status) {
    const tab = state2.tabs.find((t) => t.id === tabId);
    if (!tab) return false;
    tab.status = status;
    return true;
  }
  function setTabName(state2, tabId, name, isCustomName = true) {
    const tab = state2.tabs.find((t) => t.id === tabId);
    if (!tab) return false;
    tab.name = name;
    tab.isCustomName = isCustomName;
    return true;
  }
  function setTabColumnFilters(state2, tabId, columnFilters) {
    const tab = state2.tabs.find((t) => t.id === tabId);
    if (!tab) return false;
    tab.columnFilters = columnFilters;
    return true;
  }

  // src/webview/core/state.ts
  var state = createInitialAppState();
  function ensureFirstTab() {
    if (state.tabs.length === 0) {
      const tab = createInitialTab(state.nextTabId++);
      state.tabs.push(tab);
      state.activeTabId = tab.id;
      return tab;
    }
    return getActiveTab() || state.tabs[0];
  }
  function createTab(name = "Results") {
    const tab = createInitialTab(state.nextTabId++);
    tab.name = name;
    state.tabs.push(tab);
    state.activeTabId = tab.id;
    return tab;
  }
  function getActiveTab() {
    return state.tabs.find((t) => t.id === state.activeTabId);
  }
  function switchToTab(id) {
    if (!state.tabs.some((t) => t.id === id)) return void 0;
    state.activeTabId = id;
    return getActiveTab();
  }
  function closeTab(id) {
    const idx = state.tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    state.tabs.splice(idx, 1);
    if (state.activeTabId === id) {
      state.activeTabId = state.tabs.length ? state.tabs[Math.max(0, idx - 1)].id : null;
    }
  }
  function getState() {
    return state;
  }

  // src/webview/features/tabs/model.ts
  function createTabResultsContainer(tabId) {
    const container = document.getElementById("results-container");
    if (!container) return;
    const resultsDiv = document.createElement("div");
    resultsDiv.id = `results-${tabId}`;
    resultsDiv.className = "results";
    resultsDiv.dataset.tabId = String(tabId);
    container.appendChild(resultsDiv);
  }
  function createNewTab(name) {
    const tab = createTab(name);
    createTabResultsContainer(tab.id);
    return tab;
  }
  function switchToTab2(id) {
    return switchToTab(id);
  }
  function closeTab2(id) {
    closeTab(id);
  }
  function initTabsModel() {
    ensureFirstTab();
  }

  // src/webview/features/tabs/render.ts
  function renderTabs() {
    const tabList = document.getElementById("tabList");
    if (!tabList) return;
    const state2 = getState();
    tabList.innerHTML = "";
    state2.tabs.forEach((tab) => {
      const tabItem = document.createElement("div");
      tabItem.className = "tab-item";
      tabItem.dataset.tabId = String(tab.id);
      if (tab.id === state2.activeTabId) tabItem.classList.add("active");
      const tabContent = document.createElement("div");
      tabContent.className = "tab-content";
      const tabName = document.createElement("div");
      tabName.className = "tab-name";
      tabName.textContent = tab.name;
      tabName.title = tab.name;
      const tabInfo = document.createElement("div");
      tabInfo.className = "tab-info";
      if (tab.results?.rows) {
        const total = tab.results.rows.length;
        if (tab.columnFilters && Object.keys(tab.columnFilters).length) {
          let visible = 0;
          tab.results.rows.forEach((r) => {
            let ok = true;
            for (const [field, allowed] of Object.entries(tab.columnFilters)) {
              const val = r.fields.find((f) => f.field === field)?.value || "";
              if (!allowed.has(val)) {
                ok = false;
                break;
              }
            }
            if (ok) visible++;
          });
          tabInfo.textContent = `${visible} of ${total} rows`;
        } else {
          tabInfo.textContent = `${total} rows`;
        }
      } else {
        tabInfo.textContent = "No data";
      }
      tabContent.appendChild(tabName);
      tabContent.appendChild(tabInfo);
      const closeBtn = document.createElement("button");
      closeBtn.className = "tab-close-btn";
      closeBtn.innerHTML = "\xD7";
      closeBtn.title = "Close tab";
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = tab.id;
        const evt = new CustomEvent("cwlv:close-tab", { detail: { id } });
        window.dispatchEvent(evt);
      });
      tabItem.appendChild(tabContent);
      tabItem.appendChild(closeBtn);
      tabItem.addEventListener("click", (e) => {
        if (e.detail === 1) {
          const evt = new CustomEvent("cwlv:switch-tab", { detail: { id: tab.id } });
          window.dispatchEvent(evt);
        }
      });
      tabItem.addEventListener("dblclick", (e) => {
        const currentState = getState();
        if (tab.id === currentState.activeTabId) {
          e.preventDefault();
          startRenaming(tab.id, tabName);
        }
      });
      tabItem.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(e, tab.id);
      });
      tabItem.addEventListener("click", (e) => {
        if (e.detail !== 2) {
          const evt = new CustomEvent("cwlv:switch-tab", { detail: { id: tab.id } });
          window.dispatchEvent(evt);
        }
      });
      tabList.appendChild(tabItem);
    });
  }
  function startRenaming(tabId, tabNameElement) {
    const currentName = tabNameElement.textContent || "";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "tab-name-input";
    input.value = currentName;
    tabNameElement.style.display = "none";
    if (tabNameElement.parentElement) {
      tabNameElement.parentElement.insertBefore(input, tabNameElement);
    }
    input.focus();
    input.select();
    const finishRename = (save) => {
      if (save && input.value.trim() && input.value !== currentName) {
        const state2 = getState();
        setTabName(state2, tabId, input.value.trim(), true);
      }
      tabNameElement.style.display = "";
      input.remove();
      if (save) {
        renderTabs();
      }
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finishRename(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        finishRename(false);
      }
    });
    input.addEventListener("blur", () => {
      finishRename(true);
    });
  }
  function showContextMenu(e, tabId) {
    document.querySelectorAll(".tab-context-menu").forEach((el) => el.remove());
    const menu = document.createElement("div");
    menu.className = "tab-context-menu";
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    const renameItem = document.createElement("div");
    renameItem.className = "tab-context-menu-item";
    renameItem.textContent = "Rename Tab";
    renameItem.addEventListener("click", () => {
      menu.remove();
      const tabItem = document.querySelector(`[data-tab-id="${tabId}"]`);
      const tabNameElement = tabItem?.querySelector(".tab-name");
      if (tabNameElement) {
        startRenaming(tabId, tabNameElement);
      }
    });
    menu.appendChild(renameItem);
    document.body.appendChild(menu);
    const closeMenu = (event) => {
      if (!menu.contains(event.target)) {
        menu.remove();
        document.removeEventListener("click", closeMenu);
      }
    };
    setTimeout(() => {
      document.addEventListener("click", closeMenu);
    }, 0);
  }
  function activateResultsContainer(tabId) {
    const containers = document.querySelectorAll(".results");
    containers.forEach((c) => c.classList.remove("active"));
    const target = document.getElementById(`results-${tabId}`);
    if (target) target.classList.add("active");
  }

  // src/webview/components/status.ts
  var statusHideTimer = null;
  function setStatus(msg, autohide = true, delay = 3e3, type = "info") {
    const el = document.getElementById("status");
    if (!el) return;
    if (statusHideTimer) {
      clearTimeout(statusHideTimer);
      statusHideTimer = null;
    }
    if (!msg) {
      el.classList.add("status-hidden");
      el.classList.remove("status-warning", "status-error");
      setTimeout(() => {
        if (el.classList.contains("status-hidden")) {
          el.textContent = "";
        }
      }, 800);
      return;
    }
    el.classList.remove("status-warning", "status-error");
    if (type === "warning") {
      el.classList.add("status-warning");
    } else if (type === "error") {
      el.classList.add("status-error");
    }
    el.textContent = msg;
    el.classList.remove("status-hidden");
    if (autohide) {
      statusHideTimer = setTimeout(() => {
        el.classList.add("status-hidden");
        setTimeout(() => {
          if (el.classList.contains("status-hidden")) {
            el.textContent = "";
            el.classList.remove("status-warning", "status-error");
          }
        }, 800);
        statusHideTimer = null;
      }, delay);
    }
  }
  function notifyInfo(msg, autohide = true, delay = 3e3) {
    setStatus(msg, autohide, delay, "info");
  }
  function notifyWarning(msg, autohide = true, delay = 5e3) {
    setStatus(msg, autohide, delay, "warning");
  }
  function notifyError(msg, autohide = true, delay = 8e3) {
    setStatus(msg, autohide, delay, "error");
  }
  function pulseLogGroupsAttention() {
    try {
      const panel = document.querySelector(".log-groups-panel");
      if (!panel) return;
      panel.classList.remove("cwlv-pulse-attention");
      void panel.offsetWidth;
      panel.classList.add("cwlv-pulse-attention");
      setTimeout(() => panel.classList.remove("cwlv-pulse-attention"), 1400);
    } catch (_) {
    }
  }

  // src/webview/lib/html.ts
  function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  // src/webview/features/search/searchBar.ts
  function showSearchBar() {
    const s = getState();
    if (s.activeTabId == null) return;
    const searchBar = document.getElementById("searchBar");
    const searchInput = document.getElementById("searchInput");
    if (!searchBar) return;
    searchBar.removeAttribute("hidden");
    updateTab(s, s.activeTabId, { searchBarOpen: true });
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }
  function hideSearchBar() {
    const s = getState();
    if (s.activeTabId == null) return;
    const searchBar = document.getElementById("searchBar");
    if (!searchBar) return;
    searchBar.setAttribute("hidden", "");
    updateTab(s, s.activeTabId, { searchBarOpen: false });
    clearSearch();
  }
  function isSearchBarOpen() {
    const s = getState();
    if (s.activeTabId == null) return false;
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab?.searchBarOpen ?? false;
  }
  function syncSearchBarVisibility() {
    const s = getState();
    if (s.activeTabId == null) return;
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    if (!tab) return;
    const searchBar = document.getElementById("searchBar");
    if (!searchBar) return;
    if (tab.searchBarOpen) {
      searchBar.removeAttribute("hidden");
    } else {
      searchBar.setAttribute("hidden", "");
    }
  }
  function updateMatchCounter(current, total) {
    const counter = document.getElementById("searchMatchCounter");
    if (!counter) return;
    if (total === 0) {
      counter.textContent = "No matches";
    } else if (current >= 0) {
      counter.textContent = `${current + 1}/${total}`;
    } else {
      counter.textContent = `${total} matches`;
    }
  }
  function clearMatchCounter() {
    const counter = document.getElementById("searchMatchCounter");
    if (counter) {
      counter.textContent = "";
    }
  }
  function initSearchBarEvents() {
    const closeBtn = document.getElementById("searchCloseBtn");
    if (closeBtn && !closeBtn.hasAttribute("data-searchbar-bound")) {
      closeBtn.setAttribute("data-searchbar-bound", "true");
      closeBtn.addEventListener("click", () => {
        hideSearchBar();
      });
    }
    const searchInput = document.getElementById("searchInput");
    if (searchInput && !searchInput.hasAttribute("data-searchbar-nav-bound")) {
      searchInput.setAttribute("data-searchbar-nav-bound", "true");
      searchInput.addEventListener("keydown", (e) => {
        const keyEvent = e;
        if (keyEvent.key === "Enter") {
          e.preventDefault();
          if (keyEvent.shiftKey) {
            navigateSearchPrev();
          } else {
            navigateSearchNext();
          }
        } else if (keyEvent.key === "Escape") {
          e.preventDefault();
          hideSearchBar();
        }
      });
    }
  }
  function initSearchKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        const target = e.target;
        const isSearchInput = target.id === "searchInput";
        const isInputField = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
        if (!isInputField || isSearchInput) {
          e.preventDefault();
          showSearchBar();
        }
      }
      if (e.key === "Escape" && isSearchBarOpen()) {
        const target = e.target;
        if (target.id === "searchInput") {
          e.preventDefault();
          hideSearchBar();
        }
      }
    });
  }

  // src/webview/features/search/search.ts
  var prevSearchTerm = "";
  var prevHideNonMatching = true;
  var prevRowCount = 0;
  var activeSearchToken = 0;
  var searchDebounceTimer = null;
  var lastKeyTime = 0;
  function debugLog(message) {
    try {
      send({ type: "debugLog", message });
    } catch {
    }
  }
  function getActiveTab2() {
    const s = getState();
    if (s.activeTabId == null) return null;
    return s.tabs.find((t) => t.id === s.activeTabId) || null;
  }
  function invalidateRowCache() {
    const s = getState();
    if (s.activeTabId == null) return;
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    if (tab) {
      tab.rowCache = void 0;
      tab.previousMatchedRowIndices = void 0;
      tab.searchMatches = void 0;
    }
    prevSearchTerm = "";
  }
  function buildRowCache() {
    const s = getState();
    if (s.activeTabId == null) return [];
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    if (!tab) return [];
    if (tab.rowCache) return tab.rowCache;
    const container = document.getElementById(`results-${s.activeTabId}`);
    if (!container) return [];
    const rows = Array.from(container.querySelectorAll("tbody tr"));
    const cache = rows.filter((r) => !r.classList.contains("detail-row")).map((r) => {
      const tdEls = Array.from(r.querySelectorAll("td"));
      const filteredTdEls = tdEls.filter((td) => !td.classList.contains("expand-cell"));
      const cells = filteredTdEls.map((td) => {
        const original = td.dataset.originalText || td.textContent || "";
        if (!td.dataset.originalText) td.dataset.originalText = original;
        return { el: td, original, lower: original.toLowerCase() };
      });
      const combinedLower = cells.map((c) => c.lower).join("");
      return { rowEl: r, cells, combinedLower, lastMatched: true };
    });
    tab.rowCache = cache;
    prevRowCount = cache.length;
    return cache;
  }
  function ensureSpinner() {
    return document.getElementById("searchSpinner");
  }
  function setSearchBusy(busy) {
    const el = ensureSpinner();
    if (!el) return;
    if (busy) el.classList.add("active");
    else el.classList.remove("active");
  }
  function computeSearchDelay() {
    const input = document.getElementById("searchInput");
    const term = input?.value.trim() || "";
    const len = term.length;
    const s = getState();
    const tab = s.activeTabId != null ? s.tabs.find((t) => t.id === s.activeTabId) : null;
    const cacheLen = tab?.rowCache ? tab.rowCache.length : 0;
    const rowFactor = Math.min(300, cacheLen / 50);
    const now = Date.now();
    const typingFast = now - lastKeyTime < 150;
    lastKeyTime = now;
    if (len === 0) return 0;
    if (len < 3) return 200 + rowFactor;
    if (typingFast) return 140 + rowFactor / 2;
    return 60 + rowFactor / 3;
  }
  function clearSearch() {
    const input = document.getElementById("searchInput");
    if (input) input.value = "";
    clearMatchCounter();
    searchResults();
  }
  function navigateSearchNext() {
    const s = getState();
    if (s.activeTabId == null) return;
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    if (!tab || !tab.searchMatches || !tab.searchMatches.length) return;
    tab.searchIndex = (tab.searchIndex + 1) % tab.searchMatches.length;
    highlightCurrentMatch();
  }
  function navigateSearchPrev() {
    const s = getState();
    if (s.activeTabId == null) return;
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    if (!tab || !tab.searchMatches || !tab.searchMatches.length) return;
    tab.searchIndex = (tab.searchIndex - 1 + tab.searchMatches.length) % tab.searchMatches.length;
    highlightCurrentMatch();
  }
  function toggleHideNonMatching() {
    const hide = document.getElementById("searchHideNonMatching")?.checked || false;
    const tab = getActiveTab2();
    if (!tab?.rowCache || !prevSearchTerm) {
      searchResults(false, true);
      return;
    }
    let activeMatchRow = null;
    if (tab.searchIndex >= 0 && tab.searchMatches?.[tab.searchIndex]) {
      activeMatchRow = tab.searchMatches[tab.searchIndex].row;
    }
    tab.rowCache.forEach((entry) => {
      const shouldHide = hide && !entry.lastMatched;
      entry.rowEl.classList.toggle("row-hidden", shouldHide);
      if (shouldHide) collapseDetailIfPresent(entry.rowEl);
    });
    if (activeMatchRow && activeMatchRow.classList.contains("row-hidden")) activeMatchRow.classList.remove("row-hidden");
    if (activeMatchRow) requestAnimationFrame(() => {
      try {
        activeMatchRow.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {
      }
    });
  }
  function collapseDetailIfPresent(row) {
    const next = row.nextElementSibling;
    if (next && next.classList.contains("detail-row")) next.remove();
  }
  function highlightCurrentMatch() {
    document.querySelectorAll("mark.search-highlight").forEach((m) => m.classList.remove("current-match"));
    const s = getState();
    const tab = s.activeTabId != null ? s.tabs.find((t) => t.id === s.activeTabId) : null;
    if (!tab || !tab.searchMatches || tab.searchMatches.length === 0 || tab.searchIndex < 0) return;
    const match = tab.searchMatches[tab.searchIndex];
    match.mark.classList.add("current-match");
    match.mark.scrollIntoView({ behavior: "smooth", block: "center" });
    updateMatchCounter(tab.searchIndex, tab.searchMatches.length);
    const statusText = `\u{1F50D} Match ${tab.searchIndex + 1}/${tab.searchMatches.length}`;
    updateTab(s, s.activeTabId, { status: statusText });
  }
  function searchResults(preservePosition = false, force = false, restoreIndex) {
    const perf = typeof performance !== "undefined" ? performance : { now: () => Date.now() };
    const t0 = perf.now();
    const input = document.getElementById("searchInput");
    const termRaw = input?.value.trim() || "";
    const term = termRaw;
    const lowerTerm = term.toLowerCase();
    const hideNonMatching = document.getElementById("searchHideNonMatching")?.checked || false;
    console.log("[search] searchResults called:", { term, force, preservePosition, restoreIndex, inputElement: input });
    const cacheBuildStart = perf.now();
    const s2 = getState();
    const tab2 = s2.activeTabId != null ? s2.tabs.find((t) => t.id === s2.activeTabId) : null;
    const existingCacheRef = tab2?.rowCache;
    const cache = buildRowCache();
    const cacheBuildMs = perf.now() - cacheBuildStart;
    console.log("[search] cache built:", { cacheLength: cache.length, term, prevSearchTerm });
    if (!force && term === prevSearchTerm && hideNonMatching === prevHideNonMatching && cache.length === prevRowCount) {
      console.log("[search] skipping - no changes");
      return;
    }
    const termChanged = term !== prevSearchTerm;
    const narrowing = termChanged && term.startsWith(prevSearchTerm) && prevSearchTerm.length > 0;
    prevHideNonMatching = hideNonMatching;
    prevRowCount = cache.length;
    const currentTabIndex = tab2?.searchIndex ?? -1;
    const savedIndex = restoreIndex !== void 0 ? restoreIndex : preservePosition ? currentTabIndex : -1;
    const token = ++activeSearchToken;
    if (termChanged) {
      document.querySelectorAll("mark.search-highlight").forEach((mark) => {
        const cell = mark.parentElement?.closest("td");
        if (cell && cell instanceof HTMLTableCellElement && cell.dataset.originalText) cell.textContent = cell.dataset.originalText;
      });
    }
    if (!term) {
      cache.forEach((entry) => {
        entry.rowEl.classList.remove("row-hidden");
        entry.cells.forEach((c) => {
          if (c.el.textContent !== c.original) c.el.textContent = c.original;
        });
        entry.lastMatched = true;
      });
      setSearchBusy(false);
      prevSearchTerm = term;
      const s3 = getState();
      const tab3 = s3.activeTabId != null ? s3.tabs.find((t) => t.id === s3.activeTabId) : null;
      if (tab3) {
        tab3.previousMatchedRowIndices = void 0;
        tab3.searchMatches = [];
        updateTab(s3, s3.activeTabId, { searchIndex: -1 });
      }
      clearMatchCounter();
      return;
    }
    setSearchBusy(true);
    let scanIndices;
    const s4 = getState();
    const tab4 = s4.activeTabId != null ? s4.tabs.find((t) => t.id === s4.activeTabId) : null;
    const previousMatchedRowIndices = tab4?.previousMatchedRowIndices;
    if (!term || !previousMatchedRowIndices || !narrowing) scanIndices = cache.map((_, i) => i);
    else scanIndices = previousMatchedRowIndices;
    const newMatched = [];
    let matchedRowCount = 0;
    let highlightCells = 0;
    let highlightTimeMs = 0;
    const scanStart = perf.now();
    let processed = 0;
    let cpuTimeMs = 0;
    let timeBudgetMs = 10;
    const escalationCheckCount = Math.min(400, scanIndices.length);
    function processSlice() {
      if (token !== activeSearchToken) return;
      const sliceStartWall = perf.now();
      let sliceCpuStart = sliceStartWall;
      while (processed < scanIndices.length) {
        const i = scanIndices[processed++];
        const entry = cache[i];
        const { rowEl, cells, combinedLower } = entry;
        if (!combinedLower.includes(lowerTerm)) {
          rowEl.classList.toggle("row-hidden", hideNonMatching);
          if (hideNonMatching && rowEl.classList.contains("row-hidden")) collapseDetailIfPresent(rowEl);
          cells.forEach((c) => {
            if (c.el.querySelector && c.el.querySelector("mark.search-highlight")) c.el.textContent = c.original;
          });
          entry.lastMatched = false;
        } else {
          matchedRowCount++;
          newMatched.push(i);
          rowEl.classList.remove("row-hidden");
          entry.lastMatched = true;
          for (const cell of cells) {
            if (!cell.lower.includes(lowerTerm)) continue;
            const hStart = perf.now();
            const original = cell.original;
            const lowerOriginal = cell.lower;
            let resultHtml = "";
            let startIdx = 0;
            let searchIdx;
            while ((searchIdx = lowerOriginal.indexOf(lowerTerm, startIdx)) !== -1) {
              resultHtml += escapeHtml(original.slice(startIdx, searchIdx)) + `<mark class="search-highlight">${escapeHtml(original.slice(searchIdx, searchIdx + term.length))}</mark>`;
              startIdx = searchIdx + term.length;
            }
            resultHtml += escapeHtml(original.slice(startIdx));
            cell.el.innerHTML = resultHtml;
            highlightCells++;
            highlightTimeMs += perf.now() - hStart;
          }
        }
        if (processed === escalationCheckCount) {
          const ratio = matchedRowCount / processed;
          if (ratio > 0.5) timeBudgetMs = 22;
          else if (ratio > 0.2) timeBudgetMs = 16;
        }
        if (perf.now() - sliceStartWall >= timeBudgetMs) break;
      }
      cpuTimeMs += perf.now() - sliceCpuStart;
      if (processed < scanIndices.length) setTimeout(processSlice, 0);
      else {
        if (token !== activeSearchToken) return;
        const newSearchMatches = [];
        document.querySelectorAll("mark.search-highlight").forEach((mark) => {
          const row = mark.closest("tr");
          if (row) newSearchMatches.push({ row, mark });
        });
        const s5 = getState();
        const tab5 = s5.activeTabId != null ? s5.tabs.find((t) => t.id === s5.activeTabId) : null;
        if (tab5) {
          tab5.searchMatches = newSearchMatches;
          tab5.previousMatchedRowIndices = newMatched;
          if (newSearchMatches.length) {
            const newIndex = savedIndex >= 0 && savedIndex < newSearchMatches.length ? savedIndex : 0;
            updateTab(s5, s5.activeTabId, { searchIndex: newIndex });
            highlightCurrentMatch();
          } else {
            updateTab(s5, s5.activeTabId, { searchIndex: -1 });
            updateMatchCounter(0, 0);
          }
          const statusText = `\u{1F50D} ${newSearchMatches.length} matches in ${matchedRowCount} rows`;
          updateTab(s5, s5.activeTabId, { status: statusText });
        }
        setSearchBusy(false);
        const tEnd = perf.now();
        const wallScanMs = tEnd - scanStart;
        const totalMs = tEnd - t0;
        debugLog(`[search] term="${term}" rows=${cache.length} scanned=${scanIndices.length} matchedRows=${matchedRowCount} matches=${newSearchMatches.length} highlightCells=${highlightCells} cacheReused=${existingCacheRef ? "yes" : "no"} cacheBuildMs=${cacheBuildMs.toFixed(1)} wallScanMs=${wallScanMs.toFixed(1)} cpuScanMs=${cpuTimeMs.toFixed(1)} highlightMs=${highlightTimeMs.toFixed(1)} totalMs=${totalMs.toFixed(1)} budget=${timeBudgetMs}`);
        prevSearchTerm = term;
      }
    }
    processSlice();
    prevSearchTerm = term;
  }
  function scheduleSearchRerun() {
    const input = document.getElementById("searchInput");
    if (input && input.value.trim()) setTimeout(() => searchResults(false, true), 0);
  }
  function initSearchEvents() {
    const input = document.getElementById("searchInput");
    console.log("[search] initSearchEvents - input element:", input);
    if (input && !input.hasAttribute("data-search-bound")) {
      input.setAttribute("data-search-bound", "true");
      input.addEventListener("input", () => {
        console.log("[search] input event fired, value:", input.value);
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        const delay = computeSearchDelay();
        searchDebounceTimer = setTimeout(() => searchResults(), delay);
      });
    }
    const prevBtn = document.getElementById("searchPrevBtn");
    if (prevBtn && !prevBtn.hasAttribute("data-search-bound")) {
      prevBtn.setAttribute("data-search-bound", "true");
      prevBtn.addEventListener("click", navigateSearchPrev);
    }
    const nextBtn = document.getElementById("searchNextBtn");
    if (nextBtn && !nextBtn.hasAttribute("data-search-bound")) {
      nextBtn.setAttribute("data-search-bound", "true");
      nextBtn.addEventListener("click", navigateSearchNext);
    }
    const hideChk = document.getElementById("searchHideNonMatching");
    if (hideChk && !hideChk.hasAttribute("data-search-bound")) {
      hideChk.setAttribute("data-search-bound", "true");
      hideChk.addEventListener("change", toggleHideNonMatching);
    }
  }

  // src/webview/features/results/filters.ts
  var activeFilters = {};
  var currentFilterModal = null;
  function getActiveResultsContainer() {
    const s = getState();
    if (s.activeTabId == null) return null;
    return document.getElementById(`results-${s.activeTabId}`);
  }
  function clearAllFilters() {
    activeFilters = {};
    applyColumnFilters();
    updateFilterIndicators();
  }
  function collapseDetailIfHidden(row) {
    const detailRow = row.nextElementSibling;
    if (detailRow && detailRow.classList.contains("detail-row")) detailRow.classList.add("row-hidden");
  }
  function getColumnValueCounts(fieldName) {
    const valueCountMap = /* @__PURE__ */ new Map();
    const container = getActiveResultsContainer();
    if (!container) return valueCountMap;
    const rows = Array.from(container.querySelectorAll("tbody tr:not(.detail-row)"));
    rows.forEach((row) => {
      const cell = row.querySelector(`td[data-field="${fieldName}"]`);
      if (cell) {
        const value = (cell.textContent || "").trim();
        valueCountMap.set(value, (valueCountMap.get(value) || 0) + 1);
      }
    });
    return valueCountMap;
  }
  function showColumnFilter(fieldName, buttonElement) {
    if (currentFilterModal) {
      currentFilterModal.remove();
      currentFilterModal = null;
      return;
    }
    const valueCountMap = getColumnValueCounts(fieldName);
    const sortedValues = Array.from(valueCountMap.entries()).sort((a, b) => b[1] - a[1]);
    const modal = document.createElement("div");
    modal.className = "column-filter-modal";
    currentFilterModal = modal;
    const rect = buttonElement.getBoundingClientRect();
    modal.style.position = "fixed";
    modal.style.top = `${rect.bottom + 5}px`;
    modal.style.left = `${rect.left - 150}px`;
    const header = document.createElement("div");
    header.className = "filter-modal-header";
    header.textContent = `Filter: ${fieldName}`;
    modal.appendChild(header);
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "filter-search-input";
    searchInput.placeholder = "Search values...";
    modal.appendChild(searchInput);
    const valuesList = document.createElement("div");
    valuesList.className = "filter-values-list";
    function renderValuesList(filterText = "") {
      valuesList.innerHTML = "";
      const lower = filterText.toLowerCase();
      const filtered = sortedValues.filter(([value]) => value.toLowerCase().includes(lower));
      if (!filtered.length) {
        const empty = document.createElement("div");
        empty.className = "filter-value-empty";
        empty.textContent = "No matching values";
        valuesList.appendChild(empty);
        return;
      }
      filtered.forEach(([value, count]) => {
        const item = document.createElement("div");
        item.className = "filter-value-item";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = `filter-${fieldName}-${value}`;
        const fieldFilters = activeFilters[fieldName];
        checkbox.checked = !fieldFilters || fieldFilters.has(value);
        checkbox.addEventListener("change", () => toggleFilterValue(fieldName, value));
        const label = document.createElement("label");
        label.htmlFor = checkbox.id;
        label.className = "filter-value-label";
        const valueSpan = document.createElement("span");
        valueSpan.className = "filter-value-text";
        valueSpan.textContent = value || "(empty)";
        const countSpan = document.createElement("span");
        countSpan.className = "filter-value-count";
        countSpan.textContent = String(count);
        label.appendChild(valueSpan);
        label.appendChild(countSpan);
        item.appendChild(checkbox);
        item.appendChild(label);
        valuesList.appendChild(item);
      });
    }
    renderValuesList();
    searchInput.addEventListener("input", (e) => renderValuesList(e.target.value));
    modal.appendChild(valuesList);
    const actions = document.createElement("div");
    actions.className = "filter-modal-actions";
    const selectAllBtn = document.createElement("button");
    selectAllBtn.textContent = "Select All";
    selectAllBtn.className = "filter-action-btn";
    selectAllBtn.addEventListener("click", () => {
      delete activeFilters[fieldName];
      renderValuesList(searchInput.value);
      applyColumnFilters();
      updateFilterIndicators();
    });
    const clearBtn = document.createElement("button");
    clearBtn.textContent = "Clear";
    clearBtn.className = "filter-action-btn";
    clearBtn.addEventListener("click", () => {
      activeFilters[fieldName] = /* @__PURE__ */ new Set();
      renderValuesList(searchInput.value);
      applyColumnFilters();
      updateFilterIndicators();
    });
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.className = "filter-action-btn filter-close-btn";
    closeBtn.addEventListener("click", () => {
      modal.remove();
      currentFilterModal = null;
    });
    actions.appendChild(selectAllBtn);
    actions.appendChild(clearBtn);
    actions.appendChild(closeBtn);
    modal.appendChild(actions);
    document.body.appendChild(modal);
    setTimeout(() => {
      document.addEventListener("click", handleOutsideClick);
    }, 0);
    function handleOutsideClick(e) {
      if (!modal.contains(e.target) && !buttonElement.contains(e.target)) {
        modal.remove();
        currentFilterModal = null;
        document.removeEventListener("click", handleOutsideClick);
      }
    }
    searchInput.focus();
  }
  function toggleFilterValue(fieldName, value) {
    if (!activeFilters[fieldName]) {
      const allValues = /* @__PURE__ */ new Set();
      const container = getActiveResultsContainer();
      if (!container) return;
      const rows = Array.from(container.querySelectorAll("tbody tr:not(.detail-row)"));
      rows.forEach((row) => {
        const cell = row.querySelector(`td[data-field="${fieldName}"]`);
        if (cell) allValues.add((cell.textContent || "").trim());
      });
      activeFilters[fieldName] = allValues;
    }
    const fieldFilters = activeFilters[fieldName];
    if (fieldFilters.has(value)) fieldFilters.delete(value);
    else fieldFilters.add(value);
    const totalValues = getColumnValueCounts(fieldName).size;
    if (fieldFilters.size === totalValues) delete activeFilters[fieldName];
    applyColumnFilters();
    updateFilterIndicators();
  }
  function applyColumnFilters() {
    const container = getActiveResultsContainer();
    if (!container) return;
    const rows = Array.from(container.querySelectorAll("tbody tr:not(.detail-row)"));
    rows.forEach((row) => {
      let shouldShow = true;
      for (const [fname, allowed] of Object.entries(activeFilters)) {
        if (allowed.size === 0) {
          shouldShow = false;
          break;
        }
        const cell = row.querySelector(`td[data-field="${fname}"]`);
        if (cell) {
          const val = (cell.textContent || "").trim();
          if (!allowed.has(val)) {
            shouldShow = false;
            break;
          }
        }
      }
      if (shouldShow) {
        row.style.display = "";
      } else {
        row.style.display = "none";
        collapseDetailIfHidden(row);
      }
    });
    const s = getState();
    const activeTab = getActiveTab();
    if (activeTab && s.activeTabId) {
      const columnFilters = {};
      for (const [fieldName, allowedValues] of Object.entries(activeFilters)) {
        columnFilters[fieldName] = new Set(allowedValues);
      }
      setTabColumnFilters(s, s.activeTabId, columnFilters);
    }
    renderTabs();
    const rowCountText = buildRowCountStatus();
    if (rowCountText) {
      const statusText = `Query complete${rowCountText}`;
      notifyInfo(statusText);
      if (activeTab && s.activeTabId) {
        updateTab(s, s.activeTabId, { status: statusText });
      }
    }
  }
  function buildRowCountStatus() {
    const tab = getActiveTab();
    if (!tab || !tab.results || !tab.results.rows) return "";
    const totalRows = tab.results.rows.length;
    const container = getActiveResultsContainer();
    if (!container) return "";
    const visible = Array.from(container.querySelectorAll("tbody tr:not(.detail-row)")).filter((r) => r.style.display !== "none").length;
    if (!Object.keys(activeFilters).length) return ` (${totalRows} rows)`;
    return ` (${visible} of ${totalRows} rows)`;
  }
  function updateFilterIndicators() {
    const container = getActiveResultsContainer();
    if (!container) return;
    const headers = Array.from(container.querySelectorAll("thead th[data-field]"));
    headers.forEach((th) => {
      const fieldName = th.dataset.field || "";
      const btn = th.querySelector(".column-filter-btn");
      if (btn) btn.classList.toggle("active", !!activeFilters[fieldName]);
    });
  }
  function initFiltersForNewResults() {
    updateFilterIndicators();
  }

  // src/webview/features/results/builders/TableBuilder.ts
  var TableBuilder = class {
    constructor(results, hiddenFields = ["@ptr"]) {
      this.results = results;
      this.hiddenFields = hiddenFields;
      this.table = document.createElement("table");
    }
    /**
     * Build the complete table structure.
     */
    build() {
      this.buildHeader();
      this.buildBody();
      return this.table;
    }
    /**
     * Build table header with column names and filter buttons.
     */
    buildHeader() {
      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");
      headerRow.appendChild(this.createExpandHeader());
      const visibleFields = this.getVisibleFields();
      visibleFields.forEach((field, index) => {
        const th = this.createColumnHeader(field, index, visibleFields.length);
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      this.table.appendChild(thead);
    }
    /**
     * Build table body with data rows.
     */
    buildBody() {
      const tbody = document.createElement("tbody");
      const visibleFields = this.getVisibleFields();
      this.results.rows.forEach((row, rowIndex) => {
        const tr = this.createRow(row, rowIndex, visibleFields);
        tbody.appendChild(tr);
      });
      this.table.appendChild(tbody);
    }
    /**
     * Get list of fields that should be displayed (not hidden).
     */
    getVisibleFields() {
      return this.results.fieldOrder.filter(
        (f) => !this.hiddenFields.includes(f)
      );
    }
    /**
     * Create the expand column header.
     */
    createExpandHeader() {
      const th = document.createElement("th");
      th.className = "expand-col-header";
      th.style.width = "34px";
      return th;
    }
    /**
     * Create a column header with field name, filter button, and resizer.
     */
    createColumnHeader(field, index, totalColumns) {
      const th = document.createElement("th");
      th.style.position = "relative";
      th.dataset.field = field;
      const headerContent = document.createElement("div");
      headerContent.className = "th-content";
      const span = document.createElement("span");
      span.textContent = field;
      headerContent.appendChild(span);
      const filterBtn = this.createFilterButton(field);
      headerContent.appendChild(filterBtn);
      th.appendChild(headerContent);
      if (index < totalColumns - 1) {
        const resizer = this.createResizer();
        th.appendChild(resizer);
      }
      return th;
    }
    /**
     * Create a filter button for a column.
     */
    createFilterButton(field) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "column-filter-btn";
      btn.title = `Filter ${field}`;
      btn.innerHTML = "\u22EE";
      btn.dataset.field = field;
      return btn;
    }
    /**
     * Create a column resizer element.
     */
    createResizer() {
      const resizer = document.createElement("div");
      resizer.className = "column-resizer";
      return resizer;
    }
    /**
     * Create a data row with expand button and cells.
     */
    createRow(row, rowIndex, visibleFields) {
      const tr = document.createElement("tr");
      tr.dataset.rowIndex = String(rowIndex);
      const expandCell = this.createExpandCell();
      tr.appendChild(expandCell);
      visibleFields.forEach((field) => {
        const cell = this.createDataCell(row, field);
        tr.appendChild(cell);
      });
      return tr;
    }
    /**
     * Create expand/collapse cell for row details.
     */
    createExpandCell() {
      const td = document.createElement("td");
      td.className = "expand-cell";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "expand-btn";
      btn.title = "Show details";
      btn.textContent = "\u203A";
      td.appendChild(btn);
      return td;
    }
    /**
     * Create a data cell for a specific field.
     */
    createDataCell(row, field) {
      const td = document.createElement("td");
      const valObj = row.fields.find((x) => x.field === field);
      const val = valObj ? valObj.value : "";
      td.textContent = val;
      td.dataset.field = field;
      return td;
    }
  };

  // src/webview/lib/yaml.ts
  function jsonToYaml(root) {
    const lines = [];
    const quoteIfNeeded = (s) => {
      if (s === "") return '""';
      if (/^(?:true|false|null|[-+]?[0-9]+(?:\.[0-9]+)?)$/i.test(s)) return '"' + s + '"';
      if (/[:\-?&*!|>'"@`{}#%\n\t]/.test(s)) return JSON.stringify(s);
      return s;
    };
    const indent = (lvl) => "  ".repeat(lvl);
    const emit = (lvl, text) => lines.push(indent(lvl) + text);
    const isScalar = (v) => v === null || ["string", "number", "boolean"].includes(typeof v);
    function walk(val, lvl) {
      if (val === null) {
        emit(lvl, "null");
        return;
      }
      if (Array.isArray(val)) {
        if (!val.length) {
          emit(lvl, "[]");
          return;
        }
        val.forEach((item) => {
          if (isScalar(item)) {
            if (typeof item === "string" && /\n/.test(item)) {
              emit(lvl, "- |");
              item.split("\n").forEach((l) => emit(lvl + 1, l));
            } else {
              emit(lvl, "- " + (typeof item === "string" ? quoteIfNeeded(item) : String(item)));
            }
          } else {
            emit(lvl, "-");
            walk(item, lvl + 1);
          }
        });
        return;
      }
      if (typeof val === "object") {
        const keys = Object.keys(val);
        if (!keys.length) {
          emit(lvl, "{}");
          return;
        }
        keys.forEach((k) => {
          const v = val[k];
          if (isScalar(v)) {
            if (typeof v === "string" && /\n/.test(v)) {
              emit(lvl, k + ": |");
              v.split("\n").forEach((l) => emit(lvl + 1, l));
            } else {
              emit(lvl, k + ": " + (typeof v === "string" ? quoteIfNeeded(v) : String(v)));
            }
          } else if (Array.isArray(v)) {
            if (!v.length) emit(lvl, k + ": []");
            else {
              emit(lvl, k + ":");
              walk(v, lvl + 1);
            }
          } else {
            const childKeys = Object.keys(v);
            if (!childKeys.length) emit(lvl, k + ": {}");
            else {
              emit(lvl, k + ":");
              walk(v, lvl + 1);
            }
          }
        });
        return;
      }
      if (typeof val === "string") {
        if (/\n/.test(val)) {
          emit(lvl, "|");
          val.split("\n").forEach((l) => emit(lvl + 1, l));
        } else emit(lvl, quoteIfNeeded(val));
        return;
      }
      if (typeof val === "number" || typeof val === "boolean") {
        emit(lvl, String(val));
        return;
      }
      emit(lvl, JSON.stringify(val));
    }
    walk(root, 0);
    return lines.join("\n");
  }
  function highlightYaml(yamlText) {
    const lines = yamlText.split("\n");
    const result = [];
    let inBlock = false;
    let blockIndent = 0;
    for (const line of lines) {
      if (!inBlock) {
        const trimmed = line.trimEnd();
        if (/^\s*[^:#]+:\s*[|>][-+]?\s*$/.test(trimmed) || /^\s*[|>][-+]?\s*$/.test(trimmed) || /^\s*-\s*[|>][-+]?\s*$/.test(trimmed)) {
          inBlock = true;
          blockIndent = (/^\s*/.exec(line)?.[0].length || 0) + 1;
          result.push(escapeHtml(line));
          continue;
        }
        let hl = escapeHtml(line).replace(/^(\s*)([^\s][^:]*?):/g, (m, indent, key) => `${indent}<span class="token-field">${escapeHtml(key)}</span>:`).replace(/\b(true|false|null)\b/g, '<span class="token-operator">$1</span>').replace(/(-?\b\d+(?:\.\d+)?\b)/g, '<span class="token-number">$1</span>').replace(/(&quot;.*?&quot;)/g, '<span class="token-string">$1</span>');
        result.push(hl);
      } else {
        result.push(escapeHtml(line));
        const currentIndent = /^\s*/.exec(line)?.[0].length || 0;
        if (line.trim() === "" || currentIndent < blockIndent) inBlock = false;
      }
    }
    return result.join("\n");
  }

  // src/webview/features/results/details.ts
  function toggleRowDetails(tr, rowData) {
    const already = tr.nextSibling && tr.nextSibling.classList?.contains("detail-row");
    const expandBtn = tr.querySelector(".expand-btn");
    if (already) {
      tr.parentNode?.removeChild(tr.nextSibling);
      if (expandBtn) {
        expandBtn.textContent = "\u203A";
        expandBtn.title = "Show details";
      }
      return;
    }
    const detailTr = document.createElement("tr");
    detailTr.className = "detail-row";
    const td = document.createElement("td");
    td.colSpan = tr.children.length;
    const pre = document.createElement("pre");
    pre.className = "detail-json";
    const messageField = rowData.fields.find((f) => f.field === "@message");
    const messageValue = messageField ? messageField.value : "(no @message)";
    if (messageValue && /^(\s*[\[{])/.test(messageValue)) {
      try {
        const parsed = JSON.parse(messageValue);
        const yaml = jsonToYaml(parsed);
        pre.innerHTML = highlightYaml(yaml);
      } catch {
        pre.textContent = messageValue || "";
      }
    } else {
      pre.textContent = messageValue || "";
    }
    td.appendChild(pre);
    detailTr.appendChild(td);
    tr.parentNode?.insertBefore(detailTr, tr.nextSibling);
    if (expandBtn) {
      expandBtn.textContent = "\u2304";
      expandBtn.title = "Hide details";
    }
  }

  // src/webview/features/results/columnResize.ts
  var resizingColumn = null;
  var resizeStartX = 0;
  var resizeStartWidth = 0;
  function initColumnResize(e, th) {
    e.preventDefault();
    resizingColumn = th;
    resizeStartX = e.pageX;
    resizeStartWidth = th.offsetWidth;
    document.addEventListener("mousemove", handleColumnResize);
    document.addEventListener("mouseup", stopColumnResize);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }
  function handleColumnResize(e) {
    if (!resizingColumn) return;
    const diff = e.pageX - resizeStartX;
    const newWidth = Math.max(50, resizeStartWidth + diff);
    resizingColumn.style.width = newWidth + "px";
    resizingColumn.style.minWidth = newWidth + "px";
    resizingColumn.style.maxWidth = newWidth + "px";
  }
  function stopColumnResize() {
    resizingColumn = null;
    document.removeEventListener("mousemove", handleColumnResize);
    document.removeEventListener("mouseup", stopColumnResize);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  // src/webview/features/results/builders/EventBinder.ts
  var TableEventBinder = class {
    constructor(container) {
      this.container = container;
    }
    /**
     * Bind all table events (expand, filter, resize).
     */
    bindAll() {
      this.bindExpandButtons();
      this.bindFilterButtons();
      this.bindColumnResizers();
    }
    /**
     * Bind expand button clicks using event delegation.
     */
    bindExpandButtons() {
      this.container.addEventListener("click", (e) => {
        const target = e.target;
        if (target.classList.contains("expand-btn")) {
          const row = target.closest("tr");
          if (row) {
            this.handleExpandClick(row);
          }
        }
      });
    }
    /**
     * Bind filter button clicks using event delegation.
     */
    bindFilterButtons() {
      this.container.addEventListener("click", (e) => {
        const target = e.target;
        if (target.classList.contains("column-filter-btn")) {
          e.stopPropagation();
          const field = target.dataset.field;
          if (field) {
            this.handleFilterClick(field, target);
          }
        }
      });
    }
    /**
     * Bind column resizer mousedown using event delegation.
     */
    bindColumnResizers() {
      this.container.addEventListener("mousedown", (e) => {
        const target = e.target;
        if (target.classList.contains("column-resizer")) {
          const th = target.closest("th");
          if (th) {
            this.handleResizerMouseDown(e, th);
          }
        }
      });
    }
    /**
     * Handle expand button click to toggle row details.
     */
    handleExpandClick(row) {
      const rowIndex = parseInt(row.dataset.rowIndex || "0", 10);
      const s = getState();
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      if (tab?.results) {
        const rowData = tab.results.rows[rowIndex];
        toggleRowDetails(row, rowData);
      }
    }
    /**
     * Handle filter button click to show column filter menu.
     */
    handleFilterClick(field, button) {
      showColumnFilter(field, button);
    }
    /**
     * Handle column resizer mousedown to start resize operation.
     */
    handleResizerMouseDown(e, th) {
      initColumnResize(e, th);
    }
  };

  // src/webview/features/results/render.ts
  function getTabResultsContainer(tabId) {
    return document.getElementById(`results-${tabId}`);
  }
  var boundContainers = /* @__PURE__ */ new WeakSet();
  function renderResults(payload, skipClearFilters = false, forceTabId) {
    const s = getState();
    const targetTabId = forceTabId ?? s.activeTabId;
    if (targetTabId == null) return;
    if (!completeTabQuery(s, targetTabId, payload)) return;
    const container = getTabResultsContainer(targetTabId);
    if (!container) return;
    const isActiveTab = targetTabId === s.activeTabId;
    const shouldRenderToDOM = forceTabId !== void 0 || isActiveTab;
    if (!shouldRenderToDOM) {
      return;
    }
    container.innerHTML = "";
    invalidateRowCache();
    if (!skipClearFilters) clearAllFilters();
    if (!payload || !payload.fieldOrder || !payload.rows || !payload.rows.length) {
      container.textContent = "No results.";
      return;
    }
    const hidden = Array.isArray(payload.hiddenFields) ? payload.hiddenFields : ["@ptr"];
    const builder = new TableBuilder(payload, hidden);
    const table = builder.build();
    container.appendChild(table);
    if (!boundContainers.has(container)) {
      const eventBinder = new TableEventBinder(container);
      eventBinder.bindAll();
      boundContainers.add(container);
    }
    renderTabs();
    notifyInfo(`Query complete (${payload.rows.length} rows)`);
    initFiltersForNewResults();
    scheduleSearchRerun();
  }

  // src/webview/features/tabs/events.ts
  function initTabsEvents() {
    const newBtn = document.getElementById("newTabBtn");
    if (newBtn) newBtn.addEventListener("click", () => {
      const s = getState();
      if (s.activeTabId != null) {
        const searchInput2 = document.getElementById("searchInput");
        const hideCheckbox2 = document.getElementById("searchHideNonMatching");
        if (searchInput2) {
          updateTab(s, s.activeTabId, {
            searchQuery: searchInput2.value.trim(),
            searchHideNonMatching: hideCheckbox2?.checked || false
          });
        }
      }
      createNewTab();
      renderTabs();
      const s2 = getState();
      const searchInput = document.getElementById("searchInput");
      const hideCheckbox = document.getElementById("searchHideNonMatching");
      if (searchInput) {
        searchInput.value = "";
        if (hideCheckbox) hideCheckbox.checked = false;
        clearSearch();
      }
      if (s2.activeTabId) activateResultsContainer(s2.activeTabId);
    });
    window.addEventListener("cwlv:switch-tab", (e) => {
      const targetTabId = e.detail.id;
      const s = getState();
      if (s.activeTabId != null) {
        const searchInput2 = document.getElementById("searchInput");
        const hideCheckbox2 = document.getElementById("searchHideNonMatching");
        if (searchInput2) {
          updateTab(s, s.activeTabId, {
            searchQuery: searchInput2.value.trim(),
            searchHideNonMatching: hideCheckbox2?.checked || false
          });
        }
      }
      switchToTab2(targetTabId);
      renderTabs();
      activateResultsContainer(targetTabId);
      syncSearchBarVisibility();
      const tab = s.tabs.find((t) => t.id === targetTabId);
      const searchInput = document.getElementById("searchInput");
      const hideCheckbox = document.getElementById("searchHideNonMatching");
      if (tab && searchInput) {
        searchInput.value = tab.searchQuery || "";
        if (hideCheckbox) {
          hideCheckbox.checked = tab.searchHideNonMatching || false;
        }
        if (tab.results && tab.results.rows.length > 0) {
          if (tab.searchQuery && tab.searchQuery.trim()) {
            setTimeout(() => {
              searchResults(false, true, tab.searchIndex >= 0 ? tab.searchIndex : void 0);
            }, 0);
          } else {
            clearSearch();
          }
        }
      }
      const targetResults = document.getElementById(`results-${targetTabId}`);
      const hasTable = targetResults && targetResults.querySelector("table");
      if (tab && tab.results && targetResults && !hasTable) {
        renderResults(tab.results, true, targetTabId);
      }
    });
    window.addEventListener("cwlv:close-tab", (e) => {
      closeTab2(e.detail.id);
      renderTabs();
      const s = getState();
      if (s.activeTabId) activateResultsContainer(s.activeTabId);
    });
  }

  // src/webview/features/logGroups/logGroups.ts
  function loadLogGroups() {
    const regionEl = document.getElementById("region");
    const filterEl = document.getElementById("lgFilter");
    const region = regionEl?.value.trim() || "us-east-2";
    const prefix = filterEl?.value.trim() || "";
    notifyInfo("Loading log groups...");
    send({ type: "listLogGroups", region, prefix });
  }
  function renderLogGroups(groups) {
    const container = document.getElementById("lgList");
    if (!container) return;
    const previouslySelected = getSelectedLogGroups();
    container.innerHTML = "";
    if (!groups.length) {
      container.innerHTML = '<div class="empty-state">No log groups found</div>';
      updateSelectedCount();
      return;
    }
    const regionEl = document.getElementById("region");
    const region = regionEl?.value.trim() || "us-east-2";
    const favorites = getCurrentFavorites();
    groups.forEach((g) => {
      const isFav = favorites.some((f) => f.name === g && f.region === region);
      const isSelected = previouslySelected.includes(g);
      const wrapper = document.createElement("div");
      wrapper.className = "lg-item";
      wrapper.dataset.name = g;
      wrapper.dataset.region = region;
      if (isSelected) {
        wrapper.classList.add("selected");
      }
      const btn = document.createElement("button");
      btn.className = "lg-btn";
      btn.title = isSelected ? "Click to deselect" : "Click to select";
      btn.addEventListener("click", () => {
        const currentlySelected = wrapper.classList.contains("selected");
        if (currentlySelected) {
          wrapper.classList.remove("selected");
        } else {
          wrapper.classList.add("selected");
        }
        updateSelectedCount();
        updateFavoritesCheckboxes();
      });
      const checkmark = document.createElement("span");
      checkmark.className = "lg-checkmark";
      checkmark.textContent = "\u2713";
      const text = document.createElement("span");
      text.className = "lg-text";
      text.textContent = g;
      btn.appendChild(checkmark);
      btn.appendChild(text);
      const starBtn = document.createElement("button");
      starBtn.className = "star-btn" + (isFav ? " active" : "");
      starBtn.textContent = isFav ? "\u2605" : "\u2606";
      starBtn.title = isFav ? "Remove from favorites" : "Add to favorites";
      starBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFavorite(g, region);
      });
      wrapper.appendChild(btn);
      wrapper.appendChild(starBtn);
      container.appendChild(wrapper);
    });
    updateSelectedCount();
    updateFavoritesCheckboxes();
  }
  function filterLogGroups() {
    const filterEl = document.getElementById("lgFilter");
    const filter = filterEl?.value.trim().toLowerCase() || "";
    const items = Array.from(document.querySelectorAll(".lg-item"));
    items.forEach((item) => {
      const name = (item.dataset.name || "").toLowerCase();
      item.style.display = name.includes(filter) ? "flex" : "none";
    });
  }
  function updateSelectedCount() {
    const count = getSelectedLogGroups().length;
    const countEl = document.getElementById("lgSelectedCount");
    if (countEl) {
      countEl.textContent = `${count} selected`;
    }
  }
  function getSelectedLogGroups() {
    const container = document.getElementById("lgList");
    if (!container) return [];
    return Array.from(container.querySelectorAll(".lg-item.selected")).map((item) => item.dataset.name || "").filter(Boolean);
  }
  function toggleOtherGroupsSection() {
    const content = document.getElementById("lgSectionContent");
    const btn = document.getElementById("otherGroupsBtn");
    if (!content || !btn) return;
    const isCollapsed = content.classList.toggle("collapsed");
    btn.textContent = isCollapsed ? "\u25B6 Other Groups" : "\u25BC Other Groups";
  }
  function initLogGroupsUI() {
    const refreshBtn = document.getElementById("lgRefreshBtn");
    const filterInput = document.getElementById("lgFilter");
    const otherGroupsBtn = document.getElementById("otherGroupsBtn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", loadLogGroups);
    }
    if (filterInput) {
      filterInput.addEventListener("input", filterLogGroups);
    }
    if (otherGroupsBtn) {
      otherGroupsBtn.addEventListener("click", toggleOtherGroupsSection);
    }
    loadLogGroups();
  }

  // src/webview/features/favorites/favorites.ts
  var currentFavorites = [];
  function isLogGroupSelected(name, region) {
    const currentRegion = document.getElementById("region")?.value.trim() || "us-east-2";
    if (region !== currentRegion) return false;
    const lgList = document.getElementById("lgList");
    if (!lgList) return false;
    const selected = Array.from(lgList.querySelectorAll(".lg-item.selected"));
    return selected.some((item) => item.dataset.name === name);
  }
  function toggleFavorite(name, region) {
    const isFav = currentFavorites.some((f) => f.name === name && f.region === region);
    if (isFav) {
      send({ type: "removeFavorite", name, region });
    } else {
      send({ type: "addFavorite", data: { name, region } });
    }
  }
  function renderFavorites(favs) {
    currentFavorites = favs;
    const container = document.getElementById("favList");
    const countEl = document.getElementById("favCount");
    if (!container) return;
    container.innerHTML = "";
    if (countEl) countEl.textContent = String(favs.length);
    if (!favs.length) {
      container.innerHTML = '<div class="empty-state">No favorites yet. Click \u2605 next to a log group.</div>';
      return;
    }
    favs.forEach((f) => {
      const isSelected = isLogGroupSelected(f.name, f.region);
      const wrapper = document.createElement("div");
      wrapper.className = "fav-item";
      wrapper.dataset.name = f.name;
      wrapper.dataset.region = f.region;
      if (isSelected) {
        wrapper.classList.add("selected");
      }
      const btn = document.createElement("button");
      btn.className = "fav-btn";
      btn.title = isSelected ? "Click to deselect" : "Click to select";
      btn.addEventListener("click", () => {
        const currentlySelected = isLogGroupSelected(f.name, f.region);
        toggleFavoriteSelection(f, !currentlySelected);
      });
      const checkmark = document.createElement("span");
      checkmark.className = "fav-checkmark";
      checkmark.textContent = "\u2713";
      const text = document.createElement("span");
      text.className = "fav-text";
      text.textContent = `${f.name} (${f.region})`;
      btn.appendChild(checkmark);
      btn.appendChild(text);
      wrapper.appendChild(btn);
      container.appendChild(wrapper);
    });
  }
  function updateFavoritesCheckboxes() {
    const favItems = Array.from(document.querySelectorAll(".fav-item"));
    favItems.forEach((item) => {
      const name = item.dataset.name;
      const region = item.dataset.region;
      if (name && region) {
        const isSelected = isLogGroupSelected(name, region);
        const btn = item.querySelector(".fav-btn");
        if (isSelected) {
          item.classList.add("selected");
        } else {
          item.classList.remove("selected");
        }
        if (btn) {
          btn.title = isSelected ? "Click to deselect" : "Click to select";
        }
      }
    });
  }
  function toggleFavoriteSelection(fav, shouldSelect) {
    const currentRegion = document.getElementById("region")?.value.trim() || "us-east-2";
    if (fav.region !== currentRegion) {
      const regionEl = document.getElementById("region");
      if (regionEl) regionEl.value = fav.region;
      send({ type: "listLogGroups", region: fav.region });
      setTimeout(() => {
        setLogGroupCheckbox(fav.name, shouldSelect);
      }, 500);
    } else {
      setLogGroupCheckbox(fav.name, shouldSelect);
    }
  }
  function setLogGroupCheckbox(name, checked) {
    const items = Array.from(document.querySelectorAll(".lg-item"));
    items.forEach((item) => {
      if (item.dataset.name === name) {
        if (checked) {
          item.classList.add("selected");
        } else {
          item.classList.remove("selected");
        }
        updateSelectedCount();
        updateFavoritesCheckboxes();
      }
    });
  }
  function updateStarButtons() {
    const regionEl = document.getElementById("region");
    const region = regionEl?.value.trim() || "us-east-2";
    const items = Array.from(document.querySelectorAll(".lg-item"));
    items.forEach((item) => {
      const name = item.dataset.name;
      const starBtn = item.querySelector(".star-btn");
      if (starBtn && name) {
        const isFav = currentFavorites.some((f) => f.name === name && f.region === region);
        starBtn.textContent = isFav ? "\u2605" : "\u2606";
        starBtn.title = isFav ? "Remove from favorites" : "Add to favorites";
        if (isFav) {
          starBtn.classList.add("active");
        } else {
          starBtn.classList.remove("active");
        }
      }
    });
  }
  function getCurrentFavorites() {
    return currentFavorites;
  }

  // src/webview/features/query/editor.ts
  var KEYWORDS = ["fields", "filter", "sort", "stats", "limit", "display", "parse", "by", "as", "asc", "desc", "dedup", "head", "tail"];
  var FUNCTIONS = ["count", "sum", "avg", "min", "max", "earliest", "latest", "pct", "stddev", "concat", "strlen", "toupper", "tolower", "trim", "ltrim", "rtrim", "contains", "replace", "strcontains", "ispresent", "isblank", "isempty", "isnull", "coalesce", "bin", "diff", "floor", "ceil", "abs", "log", "sqrt", "exp"];
  var OPERATORS = ["like", "in", "and", "or", "not", "regex", "match"];
  var persistTimer = null;
  var commentToken = "#";
  function escapeHtml2(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function highlightLine(line) {
    if (!line) return "\n";
    let result = "";
    let i = 0;
    while (i < line.length) {
      if (/\s/.test(line[i])) {
        result += line[i];
        i++;
        continue;
      }
      if (line[i] === "#") {
        result += `<span class="token-comment">${escapeHtml2(line.slice(i))}</span>`;
        break;
      }
      if (line[i] === '"' || line[i] === "'") {
        const quote = line[i];
        let end = i + 1;
        while (end < line.length && line[end] !== quote) {
          if (line[end] === "\\") end++;
          end++;
        }
        if (end < line.length) end++;
        result += `<span class="token-string">${escapeHtml2(line.slice(i, end))}</span>`;
        i = end;
        continue;
      }
      if (line[i] === "/") {
        let end = i + 1;
        while (end < line.length && line[end] !== "/") {
          if (line[end] === "\\") end++;
          end++;
        }
        if (end < line.length) end++;
        result += `<span class="token-regex">${escapeHtml2(line.slice(i, end))}</span>`;
        i = end;
        continue;
      }
      if (/\d/.test(line[i])) {
        let end = i;
        while (end < line.length && /[\d.]/.test(line[end])) end++;
        result += `<span class="token-number">${escapeHtml2(line.slice(i, end))}</span>`;
        i = end;
        continue;
      }
      if (/[|=<>!+\-*/%(),\[\]]/.test(line[i])) {
        result += `<span class="token-operator">${escapeHtml2(line[i])}</span>`;
        i++;
        continue;
      }
      if (/[a-zA-Z_@]/.test(line[i])) {
        let end = i;
        while (end < line.length && /[a-zA-Z0-9_@.]/.test(line[end])) end++;
        const word = line.slice(i, end);
        const lowerWord = word.toLowerCase();
        if (KEYWORDS.includes(lowerWord)) {
          result += `<span class="token-keyword">${escapeHtml2(word)}</span>`;
        } else if (FUNCTIONS.includes(lowerWord)) {
          result += `<span class="token-function">${escapeHtml2(word)}</span>`;
        } else if (OPERATORS.includes(lowerWord)) {
          result += `<span class="token-operator">${escapeHtml2(word)}</span>`;
        } else if (word.startsWith("@")) {
          result += `<span class="token-field">${escapeHtml2(word)}</span>`;
        } else {
          result += escapeHtml2(word);
        }
        i = end;
        continue;
      }
      result += escapeHtml2(line[i]);
      i++;
    }
    return result;
  }
  function highlightQuery(text) {
    if (!text) return "";
    const lines = text.split("\n");
    return lines.map((line) => highlightLine(line)).join("\n");
  }
  function syncScroll() {
    const queryEditor = document.getElementById("query");
    const queryHighlight = document.getElementById("queryHighlight");
    if (queryEditor && queryHighlight) {
      queryHighlight.scrollTop = queryEditor.scrollTop;
      queryHighlight.scrollLeft = queryEditor.scrollLeft;
    }
  }
  function updateSyntaxHighlighting() {
    const queryEditor = document.getElementById("query");
    const queryHighlight = document.getElementById("queryHighlight");
    if (!queryEditor || !queryHighlight) return;
    const text = queryEditor.value;
    queryHighlight.innerHTML = highlightQuery(text);
    syncScroll();
  }
  function schedulePersistLastQuery() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
      try {
        const queryEditor = document.getElementById("query");
        const query = queryEditor?.value || "";
        send({ type: "updateLastQuery", query });
      } catch (_) {
      }
    }, 400);
  }
  function escapeForRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function toggleCommentInQueryEditor() {
    const editor = document.getElementById("query");
    if (!editor) return;
    const text = editor.value;
    let selStart = editor.selectionStart;
    let selEnd = editor.selectionEnd;
    if (selStart === selEnd) {
      selStart = text.lastIndexOf("\n", selStart - 1) + 1;
      const next = text.indexOf("\n", selEnd);
      selEnd = next === -1 ? text.length : next;
    } else {
      selStart = text.lastIndexOf("\n", selStart - 1) + 1;
      const after = text.indexOf("\n", selEnd);
      selEnd = after === -1 ? text.length : after;
    }
    const block = text.slice(selStart, selEnd);
    const lines = block.split("\n");
    const nonEmpty = lines.filter((l) => l.trim() !== "");
    const isCommented = (l) => {
      const indentMatch = /^[\t ]*/.exec(l) || [""];
      const afterIndent = l.slice(indentMatch[0].length);
      return afterIndent.startsWith(commentToken);
    };
    const allCommented = nonEmpty.length > 0 && nonEmpty.every(isCommented);
    const out = lines.map((line) => {
      if (line.trim() === "") return line;
      const indentMatch = /^[\t ]*/.exec(line) || [""];
      const indent = indentMatch[0];
      const afterIndent = line.slice(indent.length);
      if (allCommented) {
        const escapedToken = escapeForRegex(commentToken);
        const withSpace = new RegExp(`^${escapedToken} ?`);
        return indent + afterIndent.replace(withSpace, "");
      } else {
        return indent + commentToken + " " + afterIndent;
      }
    }).join("\n");
    editor.value = text.slice(0, selStart) + out + text.slice(selEnd);
    editor.selectionStart = selStart;
    editor.selectionEnd = selStart + out.length;
    updateSyntaxHighlighting();
  }
  function initQueryEditorUI() {
    const queryEditor = document.getElementById("query");
    if (!queryEditor) return;
    queryEditor.addEventListener("input", () => {
      updateSyntaxHighlighting();
      schedulePersistLastQuery();
    });
    queryEditor.addEventListener("scroll", syncScroll);
    updateSyntaxHighlighting();
  }
  function getQueryText() {
    const editor = document.getElementById("query");
    return editor?.value || "";
  }
  function setQueryText(text) {
    const editor = document.getElementById("query");
    if (editor) {
      editor.value = text;
      updateSyntaxHighlighting();
    }
  }

  // src/webview/features/savedQueries/savedQueries.ts
  var savedQueries = [];
  var savedQueriesSource = "aws";
  function getSelectedLogGroups2() {
    const container = document.getElementById("lgList");
    if (!container) return [];
    return Array.from(container.querySelectorAll(".lg-item.selected")).map((item) => item.dataset.name || "").filter(Boolean);
  }
  function renderSavedQueries(list, source, error) {
    savedQueries = list;
    if (source) savedQueriesSource = source;
    const select = document.getElementById("savedSelect");
    if (!select) return;
    const header = source === "aws" ? "-- Saved Queries --" : "-- Load Local Saved Query --";
    select.innerHTML = `<option value="">${header}</option>`;
    list.forEach((item, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = item.name;
      select.appendChild(opt);
    });
    if (error) {
      const statusEl = document.getElementById("status");
      if (statusEl) statusEl.textContent = `\u26A0 Saved queries fallback (${error})`;
    }
  }
  function loadSavedQuery() {
    const select = document.getElementById("savedSelect");
    if (!select) return;
    const idx = parseInt(select.value, 10);
    if (isNaN(idx)) return;
    const query = savedQueries[idx];
    if (query) {
      setQueryText(query.query);
    }
  }
  function saveCurrentQuery() {
    const query = getQueryText();
    const logGroups = getSelectedLogGroups2();
    const now = /* @__PURE__ */ new Date();
    const name = `Query ${now.toISOString().slice(0, 19).replace("T", " ")}`;
    let existingId = void 0;
    const select = document.getElementById("savedSelect");
    const selectIdx = parseInt(select?.value || "", 10);
    if (!isNaN(selectIdx) && savedQueries[selectIdx]) {
      existingId = savedQueries[selectIdx].id;
    }
    send({
      type: "saveQuery",
      data: {
        id: existingId || Date.now().toString(),
        name,
        query,
        logGroups
      }
    });
  }
  function deleteSelectedSaved() {
    const select = document.getElementById("savedSelect");
    if (!select) return;
    const idx = parseInt(select.value, 10);
    if (isNaN(idx)) return;
    const query = savedQueries[idx];
    if (query && confirm(`Delete saved query "${query.name}"?`)) {
      send({ type: "deleteQuery", id: query.id });
    }
  }
  function initSavedQueriesUI() {
    const loadBtn = document.getElementById("loadSavedBtn");
    const saveBtn = document.getElementById("saveQueryBtn");
    const deleteBtn = document.getElementById("deleteSavedBtn");
    const select = document.getElementById("savedSelect");
    if (loadBtn) {
      loadBtn.addEventListener("click", loadSavedQuery);
    }
    if (saveBtn) {
      saveBtn.addEventListener("click", saveCurrentQuery);
    }
    if (deleteBtn) {
      deleteBtn.addEventListener("click", deleteSelectedSaved);
    }
    if (select) {
      select.addEventListener("change", loadSavedQuery);
    }
  }

  // src/webview/components/controls/RunButton.ts
  var RunButton = class {
    constructor() {
      this.element = document.getElementById("runBtn");
      this.labelElement = this.element?.querySelector(".run-btn-label") ?? null;
    }
    /**
     * Set button to running state (shows "Cancel Query").
     */
    setRunning() {
      if (!this.element) return;
      this.element.setAttribute("data-state", "running");
      this.element.disabled = false;
      if (this.labelElement) {
        this.labelElement.textContent = "Cancel Query";
      }
    }
    /**
     * Set button to idle state (shows "Run Query").
     */
    setIdle() {
      if (!this.element) return;
      this.element.setAttribute("data-state", "");
      this.element.disabled = false;
      if (this.labelElement) {
        this.labelElement.textContent = "Run Query";
      }
    }
    /**
     * Set button to aborting state (disabled, shows "Cancelling Query...").
     */
    setAborting() {
      if (!this.element) return;
      this.element.setAttribute("data-state", "aborting");
      this.element.disabled = true;
      if (this.labelElement) {
        this.labelElement.textContent = "Cancelling Query...";
      }
    }
    /**
     * Attach a click handler.
     */
    onClick(handler) {
      this.element?.addEventListener("click", handler);
    }
    /**
     * Get the current state of the button.
     */
    getState() {
      if (!this.element) return null;
      const state2 = this.element.getAttribute("data-state");
      if (state2 === "running") return "running";
      if (state2 === "aborting") return "aborting";
      return "idle";
    }
    /**
     * Check if element exists in DOM.
     */
    exists() {
      return this.element !== null;
    }
  };

  // src/webview/components/controls/RegionInput.ts
  var RegionInput = class {
    constructor() {
      this.element = document.getElementById("region");
    }
    /**
     * Get the current region value (trimmed).
     */
    getValue() {
      return this.element?.value.trim() ?? "us-east-2";
    }
    /**
     * Set the region value.
     */
    setValue(value) {
      if (this.element) {
        this.element.value = value;
      }
    }
    /**
     * Attach a change event handler.
     */
    onChange(handler) {
      this.element?.addEventListener("change", (e) => {
        handler(e.target.value);
      });
    }
    /**
     * Check if element exists in DOM.
     */
    exists() {
      return this.element !== null;
    }
  };

  // src/webview/core/queryHandlers.ts
  function initQueryHandlers() {
    on("queryResult", (msg) => {
      renderResults(msg.data);
      initFiltersForNewResults();
      scheduleSearchRerun();
      renderTabs();
      const runButton = new RunButton();
      runButton.setIdle();
    });
    on("queryError", (msg) => {
      notifyError(msg.error);
      const s = getState();
      const targetTabId = s.activeTabId;
      if (targetTabId != null) {
        setTabError(s, targetTabId, msg.error);
      }
      renderTabs();
      const runButton = new RunButton();
      runButton.setIdle();
    });
    on("queryStatus", (msg) => {
      notifyInfo(msg.data.status);
      const s = getState();
      const targetTabId = s.activeTabId;
      if (targetTabId != null) {
        setTabStatus(s, targetTabId, msg.data.status);
      }
      if (/Complete|Cancel|Abort|Stop/i.test(msg.data.status)) {
        renderTabs();
        const runButton = new RunButton();
        runButton.setIdle();
      }
    });
    on("favorites", (msg) => {
      renderFavorites(msg.data);
      updateStarButtons();
    });
    on("savedQueries", (msg) => {
      renderSavedQueries(msg.data, msg.source, msg.error);
    });
    on("logGroupsList", (msg) => {
      renderLogGroups(msg.data);
    });
    on("logGroupsListError", (msg) => {
      notifyError(msg.error);
    });
    on("toggleComment", () => {
      toggleCommentInQueryEditor();
    });
    on("lastQuery", (msg) => {
      if (msg.query) {
        setQueryText(msg.query);
      }
    });
  }

  // src/webview/features/timeRange/timeRange.ts
  var relativeValue = 1;
  var relativeUnit = "hours";
  function currentTimeRange() {
    const activeBtn = document.querySelector(".mode-btn.active");
    const mode = activeBtn ? activeBtn.dataset.mode : "relative";
    if (mode === "absolute") {
      return getAbsoluteTimeRange();
    } else {
      return getRelativeTimeRange();
    }
  }
  function getAbsoluteTimeRange() {
    const startDate = document.getElementById("startDate")?.value;
    const startTime = document.getElementById("startTime")?.value;
    const endDate = document.getElementById("endDate")?.value;
    const endTime = document.getElementById("endTime")?.value;
    if (!startDate || !startTime) {
      throw new Error("Start date and time are required for absolute time range");
    }
    if (!endDate || !endTime) {
      throw new Error("End date and time are required for absolute time range");
    }
    const startStr = `${startDate}T${startTime}Z`;
    const endStr = `${endDate}T${endTime}Z`;
    const startMs = new Date(startStr).getTime();
    const endMs = new Date(endStr).getTime();
    if (isNaN(startMs)) {
      throw new Error("Invalid start date/time format");
    }
    if (isNaN(endMs)) {
      throw new Error("Invalid end date/time format");
    }
    if (startMs >= endMs) {
      throw new Error("Start time must be before end time");
    }
    return {
      start: startMs,
      end: endMs
    };
  }
  function getRelativeTimeRange() {
    const unitMultipliers = {
      minutes: 60 * 1e3,
      hours: 60 * 60 * 1e3,
      days: 24 * 60 * 60 * 1e3
    };
    const ms = relativeValue * (unitMultipliers[relativeUnit] || unitMultipliers.hours);
    return { start: Date.now() - ms, end: Date.now() };
  }
  function toggleTimeMode() {
    const activeBtn = document.querySelector(".mode-btn.active");
    const mode = activeBtn ? activeBtn.dataset.mode : "relative";
    const relativeInputs = Array.from(document.querySelectorAll(".relative-time"));
    const absoluteInputs = Array.from(document.querySelectorAll(".absolute-time"));
    if (mode === "relative") {
      relativeInputs.forEach((el) => el.style.display = "");
      absoluteInputs.forEach((el) => el.style.display = "none");
    } else {
      relativeInputs.forEach((el) => el.style.display = "none");
      absoluteInputs.forEach((el) => el.style.display = "");
    }
  }
  function setDateTimeToNow(which) {
    const now = /* @__PURE__ */ new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toISOString().slice(11, 19);
    if (which === "start") {
      const startDateEl = document.getElementById("startDate");
      const startTimeEl = document.getElementById("startTime");
      if (startDateEl) startDateEl.value = dateStr;
      if (startTimeEl) startTimeEl.value = timeStr;
    } else {
      const endDateEl = document.getElementById("endDate");
      const endTimeEl = document.getElementById("endTime");
      if (endDateEl) endDateEl.value = dateStr;
      if (endTimeEl) endTimeEl.value = timeStr;
    }
  }
  function copyStartToEnd() {
    const startDate = document.getElementById("startDate")?.value;
    const startTime = document.getElementById("startTime")?.value;
    const endDateEl = document.getElementById("endDate");
    const endTimeEl = document.getElementById("endTime");
    if (endDateEl) endDateEl.value = startDate;
    if (endTimeEl) endTimeEl.value = startTime;
  }
  function updateDateTimeMax() {
    const now = /* @__PURE__ */ new Date();
    const maxDate = now.toISOString().slice(0, 10);
    const maxTime = now.toISOString().slice(11, 19);
    const startDateEl = document.getElementById("startDate");
    const endDateEl = document.getElementById("endDate");
    const startTimeEl = document.getElementById("startTime");
    const endTimeEl = document.getElementById("endTime");
    if (startDateEl) startDateEl.max = maxDate;
    if (endDateEl) endDateEl.max = maxDate;
    if (startTimeEl) startTimeEl.max = maxTime;
    if (endTimeEl) endTimeEl.max = maxTime;
  }
  function parsePastedDate(str) {
    let s = str.trim();
    if (!s) return null;
    s = s.replace(/^["'`]|["'`]$/g, "");
    if (/^\d{10}$/.test(s)) {
      const secs = parseInt(s, 10);
      return new Date(secs * 1e3);
    }
    if (/^\d{13}$/.test(s)) {
      const ms = parseInt(s, 10);
      return new Date(ms);
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
      if (!/[Zz]|[+-]\d{2}:?\d{2}$/.test(s)) {
        s += "Z";
      }
      s = s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
      const d2 = new Date(s);
      if (!isNaN(d2.getTime())) return d2;
    }
    if (/^\d{4}-\d{2}-\d{2} /.test(s)) {
      let iso = s.replace(" ", "T");
      if (!/[Zz]|[+-]\d{2}:?\d{2}$/.test(iso)) iso += "Z";
      iso = iso.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
      const d2 = new Date(iso);
      if (!isNaN(d2.getTime())) return d2;
    }
    if (/^\d{4}[/-]\d{1,2}[/-]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/.test(s)) {
      const parts = s.split(/[ T]/);
      const datePart = parts[0];
      const [y, m, dDay] = datePart.split(/[/-]/).map((x) => parseInt(x, 10));
      let hour = 0, min = 0, sec = 0;
      if (parts[1]) {
        const timeParts = parts[1].split(":").map((x) => parseInt(x, 10));
        hour = timeParts[0] || 0;
        min = timeParts[1] || 0;
        sec = timeParts[2] || 0;
      }
      if (m >= 1 && m <= 12 && dDay >= 1 && dDay <= 31) {
        return new Date(Date.UTC(y, m - 1, dDay, hour, min, sec));
      }
    }
    const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM|am|pm))?)?$/);
    if (slash) {
      let a = parseInt(slash[1], 10);
      let b = parseInt(slash[2], 10);
      const year = parseInt(slash[3], 10);
      let hour = slash[4] ? parseInt(slash[4], 10) : 0;
      const minute = slash[5] ? parseInt(slash[5], 10) : 0;
      const second = slash[6] ? parseInt(slash[6], 10) : 0;
      const ampm = slash[7];
      let month, day;
      if (a > 12) {
        day = a;
        month = b;
      } else if (b > 12) {
        month = a;
        day = b;
      } else {
        month = a;
        day = b;
      }
      if (ampm) {
        const upper = ampm.toUpperCase();
        if (upper === "PM" && hour < 12) hour += 12;
        if (upper === "AM" && hour === 12) hour = 0;
      }
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
      }
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
    return null;
  }
  function formatDateUTC(d) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function formatTimeUTC(d) {
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    const ss = String(d.getUTCSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }
  function setParsedDate(which, dateObj) {
    const dateEl = document.getElementById(which + "Date");
    const timeEl = document.getElementById(which + "Time");
    if (!dateEl || !timeEl) return;
    dateEl.value = formatDateUTC(dateObj);
    timeEl.value = formatTimeUTC(dateObj);
  }
  function handleDatePaste(e, which) {
    const text = e.clipboardData?.getData("text") || "";
    if (!text.trim()) return;
    const parsed = parsePastedDate(text.trim());
    if (!parsed) {
      const fallback = new Date(text.trim());
      if (isNaN(fallback.getTime())) return;
      setParsedDate(which, fallback);
      e.preventDefault();
      return;
    }
    setParsedDate(which, parsed);
    e.preventDefault();
  }
  function attachDatePasteHandlers() {
    ["start", "end"].forEach((which) => {
      const dateEl = document.getElementById(which + "Date");
      const timeEl = document.getElementById(which + "Time");
      if (dateEl) dateEl.addEventListener("paste", (e) => handleDatePaste(e, which));
      if (timeEl) timeEl.addEventListener("paste", (e) => handleDatePaste(e, which));
    });
  }
  function initTimeRangeUI() {
    Array.from(document.querySelectorAll(".mode-btn")).forEach((btn) => {
      btn.addEventListener("click", () => {
        Array.from(document.querySelectorAll(".mode-btn")).forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        toggleTimeMode();
      });
    });
    const relativeValueInput = document.getElementById("relativeValue");
    Array.from(document.querySelectorAll(".relative-quick-btn")).forEach((btn) => {
      btn.addEventListener("click", () => {
        Array.from(document.querySelectorAll(".relative-quick-btn")).forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        relativeValue = parseInt(btn.dataset.value || "1", 10);
        if (relativeValueInput) {
          relativeValueInput.value = "";
          relativeValueInput.classList.remove("active");
        }
      });
    });
    if (relativeValueInput) {
      relativeValueInput.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        if (val && val >= 1) {
          relativeValue = val;
          Array.from(document.querySelectorAll(".relative-quick-btn")).forEach((b) => b.classList.remove("active"));
          relativeValueInput.classList.add("active");
        } else {
          relativeValueInput.classList.remove("active");
        }
      });
      relativeValueInput.addEventListener("click", (e) => {
        e.target.select();
      });
      relativeValueInput.addEventListener("focus", (e) => {
        e.target.select();
      });
    }
    Array.from(document.querySelectorAll(".unit-btn")).forEach((btn) => {
      btn.addEventListener("click", () => {
        Array.from(document.querySelectorAll(".unit-btn")).forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        relativeUnit = btn.dataset.unit;
      });
    });
    const startNowBtn = document.getElementById("startNowBtn");
    const endNowBtn = document.getElementById("endNowBtn");
    if (startNowBtn) {
      startNowBtn.addEventListener("click", () => setDateTimeToNow("start"));
    }
    if (endNowBtn) {
      endNowBtn.addEventListener("click", () => setDateTimeToNow("end"));
    }
    const copyBtn = document.getElementById("copyStartToEnd");
    if (copyBtn) {
      copyBtn.addEventListener("click", copyStartToEnd);
    }
    attachDatePasteHandlers();
    updateDateTimeMax();
    toggleTimeMode();
  }

  // src/webview/features/query/execution.ts
  function getSelectedLogGroups3() {
    const container = document.getElementById("lgList");
    if (!container) return [];
    return Array.from(container.querySelectorAll(".lg-item.selected")).map((item) => item.dataset.name || "").filter(Boolean);
  }
  function formatTimestamp(ts) {
    const d = new Date(ts);
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    const s = String(d.getSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }
  function abortQuery() {
    send({ type: "abortQuery" });
    notifyInfo("Cancelling query...", true, 2e3);
    const runButton = new RunButton();
    runButton.setAborting();
  }
  function runQuery() {
    let range;
    try {
      range = currentTimeRange();
    } catch (e) {
      notifyWarning(e.message || "Invalid time range");
      const absPanel = document.querySelector(".absolute-time");
      if (absPanel) {
        absPanel.classList.remove("cwlv-pulse-attention");
        void absPanel.offsetWidth;
        absPanel.classList.add("cwlv-pulse-attention");
        setTimeout(() => absPanel.classList.remove("cwlv-pulse-attention"), 1400);
      }
      return;
    }
    const logGroups = getSelectedLogGroups3();
    const regionInput = new RegionInput();
    const region = regionInput.getValue();
    const query = getQueryText();
    if (!logGroups.length) {
      notifyWarning("Select at least one log group");
      pulseLogGroupsAttention();
      return;
    }
    if (!query.trim()) {
      notifyWarning("Query string is empty");
      return;
    }
    const s = getState();
    const active = s.activeTabId != null ? s.tabs.find((t) => t.id === s.activeTabId) : void 0;
    const nowName = `Query ${formatTimestamp(Date.now())}`;
    if (!active) {
      notifyWarning("No active tab");
      return;
    }
    if (!active.isCustomName) {
      setTabName(s, active.id, nowName, false);
    }
    resetTabForNewQuery(s, active.id, query, logGroups, region, { start: range.start, end: range.end });
    renderTabs();
    const runButton = new RunButton();
    runButton.setRunning();
    send({ type: "runQuery", data: { logGroups, region, query, startTime: range.start, endTime: range.end } });
  }
  function initQueryButtons() {
    const runBtn = document.getElementById("runBtn");
    if (runBtn && !runBtn.hasAttribute("data-query-bound")) {
      runBtn.setAttribute("data-query-bound", "true");
      runBtn.addEventListener("click", () => {
        const state2 = runBtn.getAttribute("data-state");
        if (state2 === "running") abortQuery();
        else runQuery();
      });
    }
  }

  // src/webview/bootstrap.ts
  function init() {
    initMessageListener();
    initTabsModel();
    initTabsEvents();
    initQueryHandlers();
    initQueryButtons();
    initSearchEvents();
    initSearchBarEvents();
    initSearchKeyboardShortcuts();
    initTimeRangeUI();
    initSavedQueriesUI();
    initLogGroupsUI();
    initQueryEditorUI();
    clearAllFilters();
    const s = getState();
    if (s.activeTabId != null) {
      const resultsContainer = document.getElementById("results-container");
      if (resultsContainer) {
        const div = document.createElement("div");
        div.id = `results-${s.activeTabId}`;
        div.className = "results active";
        div.dataset.tabId = String(s.activeTabId);
        resultsContainer.appendChild(div);
      }
    }
    renderTabs();
    try {
      send({ type: "getSavedQueries" });
      send({ type: "getFavorites" });
    } catch {
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
