import { getState } from '../../core/state';
import { setTabName } from '../../core/stateActions';

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

    const tabContent = document.createElement('div');
    tabContent.className = 'tab-content';
    const tabName = document.createElement('div');
    tabName.className = 'tab-name';
    tabName.textContent = tab.name;
    tabName.title = tab.name;
    
    // Click handler to prevent tab switching when clicking on tab name
    tabName.addEventListener('click', (e: Event) => {
      e.stopPropagation();
    });
    
    // Double-click to rename
    tabName.addEventListener('dblclick', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      startRenaming(tab.id, tabName);
    });
    
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
    
    // Context menu
    tabItem.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      showContextMenu(e, tab.id);
    });
    
    tabItem.addEventListener('click', () => {
      const evt = new CustomEvent('cwlv:switch-tab', { detail: { id: tab.id } });
      window.dispatchEvent(evt);
    });
    tabList.appendChild(tabItem);
  });
}

function startRenaming(tabId: number, tabNameElement: HTMLElement) {
  const currentName = tabNameElement.textContent || '';
  
  // Create input field
  const input = document.createElement('input') as any;
  input.type = 'text';
  input.className = 'tab-name-input';
  input.value = currentName;
  
  // Replace tab name with input
  tabNameElement.style.display = 'none';
  if (tabNameElement.parentElement) {
    (tabNameElement.parentElement as any).insertBefore(input, tabNameElement);
  }
  
  // Focus and select all text
  input.focus();
  input.select();
  
  const finishRename = (save: boolean) => {
    if (save && input.value.trim() && input.value !== currentName) {
      const state = getState();
      setTabName(state, tabId, input.value.trim(), true);
    }
    
    // Restore tab name element
    tabNameElement.style.display = '';
    input.remove();
    
    // Re-render to show updated name
    if (save) {
      renderTabs();
    }
  };
  
  // Save on Enter, cancel on Escape
  input.addEventListener('keydown', (e: any) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finishRename(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finishRename(false);
    }
  });
  
  // Save on blur
  input.addEventListener('blur', () => {
    finishRename(true);
  });
}

function showContextMenu(e: MouseEvent, tabId: number) {
  // Remove existing context menus
  document.querySelectorAll('.tab-context-menu').forEach((el: Element) => el.remove());
  
  // Create context menu
  const menu = document.createElement('div');
  menu.className = 'tab-context-menu';
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;
  
  // Rename option
  const renameItem = document.createElement('div');
  renameItem.className = 'tab-context-menu-item';
  renameItem.textContent = 'Rename Tab';
  renameItem.addEventListener('click', () => {
    menu.remove();
    // Find the tab name element
    const tabItem = document.querySelector(`[data-tab-id="${tabId}"]`);
    const tabNameElement = tabItem?.querySelector('.tab-name') as HTMLElement;
    if (tabNameElement) {
      startRenaming(tabId, tabNameElement);
    }
  });
  
  menu.appendChild(renameItem);
  document.body.appendChild(menu);
  
  // Close menu on click outside
  const closeMenu = (event: MouseEvent) => {
    if (!menu.contains(event.target as Node)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }
  };
  
  // Delay to avoid immediate closure from the same click event
  setTimeout(() => {
    document.addEventListener('click', closeMenu);
  }, 0);
}

export function activateResultsContainer(tabId: number) {
  const containers = document.querySelectorAll('.results');
  containers.forEach((c: any) => c.classList.remove('active'));
  const target = document.getElementById(`results-${tabId}`);
  if (target) target.classList.add('active');
}
