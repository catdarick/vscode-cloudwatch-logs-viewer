import { getState } from '../../core/state';
import { getActiveTab } from './model';

export function renderTabs() {
  const tabList = document.getElementById('tabList');
  if (!tabList) return;
  const state = getState();
  tabList.innerHTML = '';
  state.tabs.forEach(tab => {
    const tabItem = document.createElement('div');
    tabItem.className = 'tab-item';
    tabItem.dataset.tabId = String(tab.id);
    if (tab.id === state.activeTabId) tabItem.classList.add('active');
    if (tab.isStreaming) tabItem.classList.add('streaming');

    const tabContent = document.createElement('div');
    tabContent.className = 'tab-content';
    const tabName = document.createElement('div');
    tabName.className = 'tab-name';
    tabName.textContent = tab.name;
    tabName.title = tab.name;
    const tabInfo = document.createElement('div');
    tabInfo.className = 'tab-info';
    if (tab.results?.rows) {
      const total = tab.results.rows.length;
      if (tab.columnFilters && Object.keys(tab.columnFilters).length) {
        let visible = 0;
        tab.results.rows.forEach(r => {
          let ok = true;
          for (const [field, allowed] of Object.entries(tab.columnFilters)) {
            const val = r.fields.find(f => f.field === field)?.value || '';
            if (!allowed.has(val)) { ok = false; break; }
          }
          if (ok) visible++;
        });
        tabInfo.textContent = `${visible} of ${total} rows`;
      } else {
        tabInfo.textContent = `${total} rows`;
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
    closeBtn.addEventListener('click', (e: any) => {
      e.stopPropagation();
      const id = tab.id;
      const evt = new CustomEvent('cwlv:close-tab', { detail: { id } });
      window.dispatchEvent(evt);
    });
    tabItem.appendChild(tabContent);
    tabItem.appendChild(closeBtn);
  tabItem.addEventListener('click', () => {
      const evt = new CustomEvent('cwlv:switch-tab', { detail: { id: tab.id } });
      window.dispatchEvent(evt);
    });
    tabList.appendChild(tabItem);
  });
}

export function activateResultsContainer(tabId: number) {
  const containers = document.querySelectorAll('.results');
  containers.forEach((c: any) => c.classList.remove('active'));
  const target = document.getElementById(`results-${tabId}`);
  if (target) target.classList.add('active');
}
