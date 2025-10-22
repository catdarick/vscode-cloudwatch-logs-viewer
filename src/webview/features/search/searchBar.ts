/**
 * Search Bar Controller
 * Manages the floating search bar visibility, keyboard shortcuts, and interactions
 */

import { clearSearch, navigateSearchNext, navigateSearchPrev } from './search';
import { getState, updateTab } from '../../core/state';

/**
 * Show the floating search bar and focus the input
 */
export function showSearchBar() {
  const s = getState();
  if (s.activeTabId == null) return;
  
  const searchBar = document.getElementById('searchBar');
  const searchInput = document.getElementById('searchInput') as HTMLInputElement | null;
  
  if (!searchBar) return;
  
  // Show the search bar
  searchBar.removeAttribute('hidden');
  
  // Update tab state
  updateTab(s, s.activeTabId, { searchBarOpen: true });
  
  // Focus the input field
  if (searchInput) {
    searchInput.focus();
    searchInput.select(); // Select existing text if any
  }
}

/**
 * Hide the floating search bar and clear search highlights
 */
export function hideSearchBar() {
  const s = getState();
  if (s.activeTabId == null) return;
  
  const searchBar = document.getElementById('searchBar');
  
  if (!searchBar) return;
  
  searchBar.setAttribute('hidden', '');
  
  // Update tab state
  updateTab(s, s.activeTabId, { searchBarOpen: false });
  
  // Clear the search when closing the bar
  clearSearch();
}

/**
 * Toggle the search bar visibility
 */
export function toggleSearchBar() {
  const s = getState();
  if (s.activeTabId == null) return;
  
  const tab = s.tabs.find(t => t.id === s.activeTabId);
  if (!tab) return;
  
  if (tab.searchBarOpen) {
    hideSearchBar();
  } else {
    showSearchBar();
  }
}

/**
 * Check if search bar is currently visible for the active tab
 */
export function isSearchBarOpen(): boolean {
  const s = getState();
  if (s.activeTabId == null) return false;
  
  const tab = s.tabs.find(t => t.id === s.activeTabId);
  return tab?.searchBarOpen ?? false;
}

/**
 * Sync the search bar visibility with the active tab's state
 * Called when switching tabs
 */
export function syncSearchBarVisibility() {
  const s = getState();
  if (s.activeTabId == null) return;
  
  const tab = s.tabs.find(t => t.id === s.activeTabId);
  if (!tab) return;
  
  const searchBar = document.getElementById('searchBar');
  if (!searchBar) return;
  
  if (tab.searchBarOpen) {
    searchBar.removeAttribute('hidden');
  } else {
    searchBar.setAttribute('hidden', '');
  }
}

/**
 * Update the match counter display
 */
export function updateMatchCounter(current: number, total: number) {
  const counter = document.getElementById('searchMatchCounter');
  if (!counter) return;
  
  if (total === 0) {
    counter.textContent = 'No matches';
  } else if (current >= 0) {
    counter.textContent = `${current + 1}/${total}`;
  } else {
    counter.textContent = `${total} matches`;
  }
}

/**
 * Clear the match counter display
 */
export function clearMatchCounter() {
  const counter = document.getElementById('searchMatchCounter');
  if (counter) {
    counter.textContent = '';
  }
}

/**
 * Initialize search bar event handlers
 */
export function initSearchBarEvents() {
  // Close button
  const closeBtn = document.getElementById('searchCloseBtn');
  if (closeBtn && !closeBtn.hasAttribute('data-searchbar-bound')) {
    closeBtn.setAttribute('data-searchbar-bound', 'true');
    closeBtn.addEventListener('click', () => {
      hideSearchBar(); // This now clears search automatically
    });
  }
  
  // Search input - handle Enter/Shift+Enter for navigation
  const searchInput = document.getElementById('searchInput');
  if (searchInput && !searchInput.hasAttribute('data-searchbar-nav-bound')) {
    searchInput.setAttribute('data-searchbar-nav-bound', 'true');
    searchInput.addEventListener('keydown', (e: Event) => {
      const keyEvent = e as KeyboardEvent;
      
      if (keyEvent.key === 'Enter') {
        e.preventDefault();
        if (keyEvent.shiftKey) {
          navigateSearchPrev();
        } else {
          navigateSearchNext();
        }
      } else if (keyEvent.key === 'Escape') {
        e.preventDefault();
        hideSearchBar();
      }
    });
  }
}

/**
 * Initialize global keyboard shortcuts for search
 */
export function initSearchKeyboardShortcuts() {
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    // Cmd+F (Mac) or Ctrl+F (Windows/Linux) to open search
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      // Check if we're not in an input/textarea (except the search input itself)
      const target = e.target as HTMLElement;
      const isSearchInput = target.id === 'searchInput';
      const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      
      // Only prevent default and show search if we're not in another input
      // OR if we're already in the search input (let it work there too)
      if (!isInputField || isSearchInput) {
        e.preventDefault();
        showSearchBar();
      }
    }
    
    // Escape to close search bar (when search input is focused)
    if (e.key === 'Escape' && isSearchBarOpen()) {
      const target = e.target as HTMLElement;
      if (target.id === 'searchInput') {
        e.preventDefault();
        hideSearchBar();
      }
    }
  });
}
