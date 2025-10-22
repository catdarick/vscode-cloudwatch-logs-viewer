import { on } from './messaging';
import { appendPartialResults, renderResults } from '../features/results/render';
import { scheduleSearchRerun } from '../features/search/search';
import { initFiltersForNewResults } from '../features/results/filters';
import { notifyInfo, notifyError } from '../components/status';
import { getState, setRunningQueryTab, setTabError, setTabStatus } from './state';
import { renderFavorites, updateStarButtons } from '../features/favorites/favorites';
import { renderSavedQueries } from '../features/savedQueries/savedQueries';
import { renderLogGroups } from '../features/logGroups/logGroups';
import { toggleCommentInQueryEditor, setQueryText } from '../features/query/editor';
import { renderTabs } from '../features/tabs/render';
import { RunButton } from '../components/controls';

export function initQueryHandlers() {
  on('queryPartialResult', (msg) => {
    appendPartialResults(msg.data);
    // Update tab UI to show streaming state
    renderTabs();
  });
  
  on('queryResult', (msg) => {
    renderResults(msg.data);
    initFiltersForNewResults();
    scheduleSearchRerun();
    
    // Clear running query tab tracking
    setRunningQueryTab(null);
    
    // Update tab UI to show final results and clear streaming state
    renderTabs();
    
    // Reset run button after final results
    const runButton = new RunButton();
    runButton.setIdle();
  });
  
  on('queryError', (msg) => {
    notifyError(msg.error);
    const s = getState();
    // Update the tab that owns the running query using state action
    const targetTabId = s.runningQueryTabId ?? s.activeTabId;
    if (targetTabId != null) {
      setTabError(s, targetTabId, msg.error);
    }
    
    // Clear running query tab tracking
    setRunningQueryTab(null);
    
    // Update tab UI to show error state
    renderTabs();
    
    const runButton = new RunButton();
    runButton.setIdle();
  });
  
  on('queryStatus', (msg) => {
    notifyInfo(msg.data.status);
    const s = getState();
    // Update the tab that owns the running query using state action
    const targetTabId = s.runningQueryTabId ?? s.activeTabId;
    if (targetTabId != null) {
      setTabStatus(s, targetTabId, msg.data.status);
    }
    
    // Reset button on completion or cancellation
    if (/Complete|Cancel|Abort|Stop/i.test(msg.data.status)) {
      // Clear running query tab tracking
      setRunningQueryTab(null);
      
      // Update tab UI
      renderTabs();
      
      const runButton = new RunButton();
      runButton.setIdle();
    }
  });
  
  // Favorites and saved queries handlers
  on('favorites', (msg) => {
    renderFavorites(msg.data);
    updateStarButtons();
  });
  
  on('savedQueries', (msg) => {
    renderSavedQueries(msg.data, msg.source, msg.error);
  });
  
  // Log groups handlers
  on('logGroupsList', (msg) => {
    renderLogGroups(msg.data);
  });
  
  on('logGroupsListError', (msg) => {
    notifyError(msg.error);
  });
  
  // Toggle comment handler
  on('toggleComment', () => {
    toggleCommentInQueryEditor();
  });
  
  // Last query restoration
  on('lastQuery', (msg) => {
    if (msg.query) {
      setQueryText(msg.query);
    }
  });
}
