import { createNewTab, switchToTab, closeTab } from './model';
import { renderTabs, activateResultsContainer } from './render';
import { getState } from '../../core/state';
import { updateTab } from '../../core/stateActions';
import { renderResults } from '../results/render';
import { searchResults, clearSearch } from '../search/search';
import { syncSearchBarVisibility } from '../search/searchBar';

export function initTabsEvents() {
  const newBtn = document.getElementById('newTabBtn');
  if (newBtn) newBtn.addEventListener('click', () => {
    // Save current tab's search state before creating new tab
    const s = getState();
    if (s.activeTabId != null) {
      const searchInput = document.getElementById('searchInput') as HTMLInputElement | null;
      const hideCheckbox = document.getElementById('searchHideNonMatching') as HTMLInputElement | null;
      if (searchInput) {
        updateTab(s, s.activeTabId, { 
          searchQuery: searchInput.value.trim(),
          searchHideNonMatching: hideCheckbox?.checked || false
        });
      }
    }
    
    createNewTab();
    renderTabs();
    const s2 = getState();
    
    // Clear search input and checkbox for new tab
    const searchInput = document.getElementById('searchInput') as HTMLInputElement | null;
    const hideCheckbox = document.getElementById('searchHideNonMatching') as HTMLInputElement | null;
    if (searchInput) {
      searchInput.value = '';
      if (hideCheckbox) hideCheckbox.checked = false;
      clearSearch();
    }
    
    if (s2.activeTabId) activateResultsContainer(s2.activeTabId);
  });

  window.addEventListener('cwlv:switch-tab', (e: any) => {
    const targetTabId = e.detail.id;
    const s = getState();
    
    // Save current tab's search state before switching
    if (s.activeTabId != null) {
      const searchInput = document.getElementById('searchInput') as HTMLInputElement | null;
      const hideCheckbox = document.getElementById('searchHideNonMatching') as HTMLInputElement | null;
      if (searchInput) {
        updateTab(s, s.activeTabId, { 
          searchQuery: searchInput.value.trim(),
          searchHideNonMatching: hideCheckbox?.checked || false
        });
      }
    }
    
    switchToTab(targetTabId);
    renderTabs();
    activateResultsContainer(targetTabId);
    
    // Sync search bar visibility for the new active tab
    syncSearchBarVisibility();
    
    // Restore new tab's search state
    const tab = s.tabs.find(t => t.id === targetTabId);
    const searchInput = document.getElementById('searchInput') as HTMLInputElement | null;
    const hideCheckbox = document.getElementById('searchHideNonMatching') as HTMLInputElement | null;
    
    if (tab && searchInput) {
      // Restore search input value and checkbox
      searchInput.value = tab.searchQuery || '';
      if (hideCheckbox) {
        hideCheckbox.checked = tab.searchHideNonMatching || false;
      }
      
      // If tab has results, re-run search to restore highlights
      if (tab.results && tab.results.rows.length > 0) {
        if (tab.searchQuery && tab.searchQuery.trim()) {
          // Re-run search to rebuild matches and highlights, restoring the saved index
          setTimeout(() => {
            searchResults(false, true, tab.searchIndex >= 0 ? tab.searchIndex : undefined);
          }, 0);
        } else {
          // Clear any existing search highlights
          clearSearch();
        }
      }
    }
    
    // Check if tab has results but they haven't been rendered yet
    // (this happens when a query completes in a background tab)
    const targetResults = document.getElementById(`results-${targetTabId}`);
    const hasTable = targetResults && targetResults.querySelector('table');
    
    if (tab && tab.results && targetResults && !hasTable) {
      // Render results for the first time (background query completed)
      // Pass targetTabId explicitly to force rendering to this tab
      renderResults(tab.results, true, targetTabId);
    }
  });

  window.addEventListener('cwlv:close-tab', (e: any) => {
    closeTab(e.detail.id);
    renderTabs();
    const s = getState();
    if (s.activeTabId) activateResultsContainer(s.activeTabId);
  });
}
