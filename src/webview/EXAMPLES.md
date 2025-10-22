# Code Examples & Recipes

**Last Updated:** October 22, 2025

This document provides practical code examples for common tasks in the webview codebase.

## Table of Contents

1. [State Management](#state-management)
2. [DOM Access](#dom-access)
3. [Message Handling](#message-handling)
4. [UI Components](#ui-components)
5. [Rendering](#rendering)
6. [Event Handling](#event-handling)
7. [Testing](#testing)

---

## State Management

### Update Tab State

```typescript
import { updateTab, getState } from '../../core/state';

function setTabLoading(tabId: number) {
  const s = getState();
  updateTab(s, tabId, {
    status: 'Loading...'
  });
}
```

### Reset Tab for New Query

```typescript
import { resetTabForNewQuery, getState } from '../../core/state';

function startNewQuery(query: string, logGroups: string[], region: string) {
  const s = getState();
  const activeTabId = s.activeTabId;
  
  if (activeTabId) {
    resetTabForNewQuery(
      s,
      activeTabId,
      query,
      logGroups,
      region,
      { start: Date.now() - 3600000, end: Date.now() }
    );
  }
}
```

### Complete Query with Results

```typescript
import { completeTabQuery, getState } from '../../core/state';

function finishQuery(results: QueryResults) {
  const s = getState();
  const tabId = s.runningQueryTabId || s.activeTabId;
  
  if (tabId) {
    completeTabQuery(s, tabId, results);
  }
}
```

### Set Error State

```typescript
import { setTabError, getState } from '../../core/state';

function handleQueryError(error: string) {
  const s = getState();
  const tabId = s.runningQueryTabId || s.activeTabId;
  
  if (tabId) {
    setTabError(s, tabId, error);
  }
}
```

### Update Search State

```typescript
import { updateSearchState, getState } from '../../core/state';

function setSearchTerm(term: string) {
  const s = getState();
  updateSearchState(s, { 
    term,
    matches: [],
    activeIndex: -1
  });
}
```

---

## DOM Access

### Type-Safe Element Access

```typescript
import { getElement } from '../lib/dom';

// Get input element (type-safe)
const searchInput = getElement('searchInput', 'input');
if (searchInput) {
  searchInput.value = 'test'; // Type: HTMLInputElement
  searchInput.focus();
}

// Get button element
const button = getElement('runBtn', 'button');
if (button) {
  button.disabled = true; // Type: HTMLButtonElement
}
```

### Query Selector with Type Safety

```typescript
import { querySelector, querySelectorAll } from '../lib/dom';

// Single element
const header = querySelector('.table-header', 'div');

// Multiple elements
const buttons = querySelectorAll('.action-btn', 'button');
buttons.forEach(btn => {
  btn.addEventListener('click', handleClick);
});
```

### Generic Element Access

```typescript
import { getElementById, queryElement } from '../lib/dom';

const container = getElementById('results-container');
if (container) {
  container.innerHTML = '';
}

const panel = queryElement('.settings-panel');
if (panel) {
  panel.classList.add('visible');
}
```

---

## Message Handling

### Send Message to Extension

```typescript
import { send } from '../../core/messaging';

// Run query
send({ 
  type: 'runQuery', 
  data: { 
    logGroups: ['/aws/lambda/myFunction'],
    region: 'us-east-1',
    query: 'fields @timestamp, @message | limit 20',
    startTime: Date.now() - 3600000,
    endTime: Date.now()
  }
});

// Abort query
send({ type: 'abortQuery' });

// Toggle favorite
send({ 
  type: 'toggleFavorite', 
  data: { name: '/aws/lambda/myFunction', region: 'us-east-1' }
});
```

### Receive Message from Extension

```typescript
import { on } from '../../core/messaging';

// Handle query results
on('queryResult', (msg) => {
  // msg.data is typed as QueryResults
  console.log(`Received ${msg.data.rows.length} rows`);
  renderResults(msg.data);
});

// Handle error
on('queryError', (msg) => {
  console.error(msg.error);
  setStatus(`Error: ${msg.error}`);
});

// Handle favorites
on('favorites', (msg) => {
  // msg.data is typed as Favorite[]
  renderFavorites(msg.data);
});
```

### Add New Message Type

1. Define in `types/messages.ts`:
```typescript
export type ExtensionToWebviewMessage =
  | ... existing ...
  | { type: 'newMessage'; data: { value: string } };
```

2. Register handler:
```typescript
on('newMessage', (msg) => {
  console.log(msg.data.value); // Typed automatically
});
```

---

## UI Components

### Use RunButton Component

```typescript
import { RunButton } from '../../components/controls';

// Create instance
const runButton = new RunButton();

// Check if exists
if (runButton.exists()) {
  // Set states
  runButton.setRunning();   // Shows "Cancel Query"
  runButton.setIdle();      // Shows "Run Query"
  runButton.setAborting();  // Shows "Cancelling Query..."
  
  // Check state
  const state = runButton.getState(); // 'idle' | 'running' | 'aborting' | null
  
  // Attach handler
  runButton.onClick(() => {
    if (runButton.getState() === 'running') {
      abortQuery();
    } else {
      runQuery();
    }
  });
}
```

### Use SearchInput Component

```typescript
import { SearchInput } from '../../components/controls';

const searchInput = new SearchInput();

// Get value
const term = searchInput.getValue(); // Trimmed

// Set value
searchInput.setValue('error');

// Clear
searchInput.clear();

// Focus
searchInput.focus();

// Attach handlers
searchInput.onInput((value) => {
  console.log('Input:', value);
  performSearch(value);
});

searchInput.onKeyDown((e) => {
  if (e.key === 'Enter') {
    navigateToNextMatch();
  }
});
```

### Use RegionInput Component

```typescript
import { RegionInput } from '../../components/controls';

const regionInput = new RegionInput();

// Get value (defaults to 'us-east-2' if empty)
const region = regionInput.getValue();

// Set value
regionInput.setValue('us-west-2');

// Listen for changes
regionInput.onChange((value) => {
  console.log('Region changed to:', value);
  refreshLogGroups(value);
});
```

---

## Rendering

### Render Results Table

```typescript
import { renderResults } from '../../features/results/render';

// Render to active tab
renderResults(queryResults);

// Render to specific tab
renderResults(queryResults, false, tabId);

// Render without clearing filters
renderResults(queryResults, true);
```

### Render Tabs

```typescript
import { renderTabs } from '../../features/tabs/render';

// Re-render tab bar (call after state changes)
renderTabs();
```

### Build Custom Table

```typescript
import { TableBuilder } from '../../features/results/builders/TableBuilder';
import { TableEventBinder } from '../../features/results/builders/EventBinder';

// Build table DOM
const builder = new TableBuilder(queryResults, ['@ptr']); // Hide @ptr field
const table = builder.build();

// Add to container
const container = document.getElementById('my-container');
container.innerHTML = '';
container.appendChild(table);

// Bind events
const eventBinder = new TableEventBinder(container);
eventBinder.bindAll();
```

---

## Event Handling

### Event Delegation

```typescript
// Good: One listener for many elements
container.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  
  if (target.classList.contains('expand-btn')) {
    const row = target.closest('tr') as HTMLTableRowElement;
    handleExpandClick(row);
  }
  
  if (target.classList.contains('filter-btn')) {
    const field = target.dataset.field;
    if (field) handleFilterClick(field, target);
  }
});

// Bad: Listener per element
rows.forEach(row => {
  const btn = row.querySelector('.expand-btn');
  btn?.addEventListener('click', () => handleExpandClick(row));
});
```

### Custom Events

```typescript
// Dispatch custom event
window.dispatchEvent(new CustomEvent('cwlv:tabSwitched', {
  detail: { tabId: 5 }
}));

// Listen for custom event
window.addEventListener('cwlv:tabSwitched', (e: any) => {
  console.log('Switched to tab:', e.detail.tabId);
  updateUI(e.detail.tabId);
});
```

### Keyboard Shortcuts

```typescript
document.addEventListener('keydown', (e) => {
  // F3: Next search result
  if (e.key === 'F3') {
    e.preventDefault();
    if (e.shiftKey) {
      navigateSearchPrev();
    } else {
      navigateSearchNext();
    }
  }
  
  // Ctrl+Enter: Run query
  if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault();
    runQuery();
  }
});
```

---

## Testing

### Test State Actions

```typescript
import { createInitialAppState, createInitialTab } from '../../types/state';
import { updateTab, resetTabForNewQuery } from '../../core/stateActions';

describe('State Actions', () => {
  it('updates tab status', () => {
    const state = createInitialAppState();
    const tab = createInitialTab(1);
    state.tabs = [tab];
    
    const result = updateTab(state, 1, { status: 'Loading...' });
    
    expect(result).toBe(true);
    expect(state.tabs[0].status).toBe('Loading...');
  });
  
  it('resets tab for new query', () => {
    const state = createInitialAppState();
    const tab = createInitialTab(1);
    tab.results = { rows: [], fieldOrder: [] };
    state.tabs = [tab];
    
    resetTabForNewQuery(
      state,
      1,
      'fields @timestamp',
      ['/aws/lambda/fn'],
      'us-east-1',
      { start: 0, end: 1000 }
    );
    
    expect(tab.query).toBe('fields @timestamp');
    expect(tab.results).toBeNull();
    expect(tab.query).toBe(query);
  });
});
```

### Test UI Components

```typescript
import { RunButton } from '../../components/controls/RunButton';

describe('RunButton', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="runBtn">
        <span class="run-btn-label">Run Query</span>
      </button>
    `;
  });
  
  it('sets running state', () => {
    const btn = new RunButton();
    btn.setRunning();
    
    const element = document.getElementById('runBtn');
    expect(element?.getAttribute('data-state')).toBe('running');
    
    const label = element?.querySelector('.run-btn-label');
    expect(label?.textContent).toBe('Cancel Query');
  });
  
  it('returns current state', () => {
    const btn = new RunButton();
    btn.setRunning();
    
    expect(btn.getState()).toBe('running');
  });
});
```

### Test Message Handlers

```typescript
import { on, initMessageListener } from '../../core/messaging';

describe('Message Handlers', () => {
  it('handles queryResult message', () => {
    let receivedData: any = null;
    
    on('queryResult', (msg) => {
      receivedData = msg.data;
    });
    
    initMessageListener();
    
    window.postMessage({
      type: 'queryResult',
      data: { rows: [], fieldOrder: [] }
    }, '*');
    
    // Wait for message to process
    setTimeout(() => {
      expect(receivedData).not.toBeNull();
      expect(receivedData.rows).toEqual([]);
    }, 0);
  });
});
```

---

## Performance Patterns

### Debounce User Input

```typescript
let searchTimeout: number | null = null;

function handleSearchInput(value: string) {
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }
  
  const delay = value.length < 3 ? 300 : 100;
  
  searchTimeout = window.setTimeout(() => {
    performSearch(value);
  }, delay);
}
```

### Batch DOM Updates

```typescript
// Good: Batch updates
function updateMultipleRows(updates: RowUpdate[]) {
  const fragment = document.createDocumentFragment();
  
  updates.forEach(update => {
    const row = createRow(update);
    fragment.appendChild(row);
  });
  
  tbody.appendChild(fragment);
}

// Bad: Individual updates
function updateMultipleRowsBad(updates: RowUpdate[]) {
  updates.forEach(update => {
    const row = createRow(update);
    tbody.appendChild(row); // Triggers reflow each time
  });
}
```

### Lazy Rendering

```typescript
function renderResultsToTab(tabId: number, results: QueryResults) {
  // Only render to DOM if tab is active
  const s = getState();
  if (tabId !== s.activeTabId) {
    // Just store in state, don't render
    return;
  }
  
  // Render to DOM
  const container = document.getElementById(`results-${tabId}`);
  if (container) {
    renderTable(container, results);
  }
}
```

---

## Common Pitfalls

### ❌ Direct State Mutation

```typescript
// DON'T DO THIS
const tab = getActiveTab();
if (tab) {
  tab.status = 'Loading...';  // Direct mutation!
}
```

```typescript
// DO THIS INSTEAD
const s = getState();
if (s.activeTabId) {
  updateTab(s, s.activeTabId, { status: 'Loading...' });
}
```

### ❌ Type Assertions Everywhere

```typescript
// DON'T DO THIS
const btn = document.getElementById('runBtn') as HTMLButtonElement;
btn.disabled = true;
```

```typescript
// DO THIS INSTEAD
import { RunButton } from '../../components/controls';
const runButton = new RunButton();
runButton.setIdle();
```

### ❌ Individual Event Listeners

```typescript
// DON'T DO THIS (performance issue with many rows)
rows.forEach(row => {
  row.addEventListener('click', handleRowClick);
});
```

```typescript
// DO THIS INSTEAD (event delegation)
tbody.addEventListener('click', (e) => {
  const row = (e.target as HTMLElement).closest('tr');
  if (row) handleRowClick(row);
});
```

---

## Quick Reference

### State Actions
- `updateTab()` - Update tab properties
- `resetTabForNewQuery()` - Reset tab for new query
- `completeTabQuery()` - Mark query complete
- `setTabError()` - Set error state
- `updateSearchState()` - Update search state

### UI Components
- `RunButton` - Query run/cancel button
- `SearchInput` - Search input field
- `RegionInput` - Region selector

### DOM Utilities
- `getElement()` - Type-safe getElementById
- `querySelector()` - Type-safe querySelector
- `querySelectorAll()` - Type-safe querySelectorAll

### Messaging
- `send()` - Send message to extension
- `on()` - Register message handler

### Rendering
- `renderResults()` - Render complete results
- `renderTabs()` - Re-render tab bar
- `TableBuilder` - Build table DOM
- `TableEventBinder` - Bind table events

---

**Need more help?** Check `ARCHITECTURE.md` for overall patterns or `features/README.md` for feature-specific documentation.

```
