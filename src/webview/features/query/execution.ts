import { send } from '../../core/messaging';
import { notifyInfo, notifyWarning, pulseLogGroupsAttention } from '../../components/status';
import { getState, setRunningQueryTab, resetTabForNewQuery, setTabName } from '../../core/state';
import { renderTabs } from '../tabs/render';
import { currentTimeRange } from '../timeRange/timeRange';
import { getQueryText } from './editor';
import { RunButton, RegionInput } from '../../components/controls';

function getSelectedLogGroups(): string[] {
  const container = document.getElementById('lgList');
  if (!container) return [];
  return Array.from(container.querySelectorAll('.lg-item.selected')).map(item => (item as HTMLElement).dataset.name || '').filter(Boolean);
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function abortQuery() {
  send({ type: 'abortQuery' });
  notifyInfo('Cancelling query...', true, 2000);
  
  const runButton = new RunButton();
  runButton.setAborting();
}

export function runQuery() {
  let range: { start: number; end: number };
  try { range = currentTimeRange(); } catch (e: any) {
    notifyWarning(e.message || 'Invalid time range');
    const absPanel = document.querySelector('.absolute-time');
    if (absPanel) {
      absPanel.classList.remove('cwlv-pulse-attention');
      void (absPanel as HTMLElement).offsetWidth;
      absPanel.classList.add('cwlv-pulse-attention');
      setTimeout(() => absPanel.classList.remove('cwlv-pulse-attention'), 1400);
    }
    return;
  }
  const logGroups = getSelectedLogGroups();
  const regionInput = new RegionInput();
  const region = regionInput.getValue();
  const query = getQueryText();
  
  if (!logGroups.length) { notifyWarning('Select at least one log group'); pulseLogGroupsAttention(); return; }
  if (!query.trim()) { notifyWarning('Query string is empty'); return; }

  const s = getState();
  const active = s.activeTabId != null ? s.tabs.find(t => t.id === s.activeTabId) : undefined;
  const nowName = `Query ${formatTimestamp(Date.now())}`;
  if (!active) {
    // Should have been created already by tabs init; fallback: do nothing
    notifyWarning('No active tab');
    return;
  }
  
  // Use state actions for all mutations
  if (!active.isCustomName) {
    setTabName(s, active.id, nowName, false);
  }
  resetTabForNewQuery(s, active.id, query, logGroups, region, { start: range.start, end: range.end });
  
  renderTabs();
  setRunningQueryTab(active.id);
  
  const runButton = new RunButton();
  runButton.setRunning();
  
  send({ type: 'runQuery', data: { logGroups, region, query, startTime: range.start, endTime: range.end } });
}

export function initQueryButtons() {
  const runBtn = document.getElementById('runBtn');
  if (runBtn && !runBtn.hasAttribute('data-query-bound')) {
    runBtn.setAttribute('data-query-bound', 'true');
    runBtn.addEventListener('click', () => {
      const state = runBtn.getAttribute('data-state');
      if (state === 'running') abortQuery(); else runQuery();
    });
  }
}
