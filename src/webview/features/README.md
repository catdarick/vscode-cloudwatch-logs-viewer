# Features Guide

**Last Updated:** October 22, 2025

## Overview

Each directory in `src/webview/features/` represents a self-contained feature of the webview. Features are organized by domain concern rather than technical layer.

## Feature Catalog

### Tabs (`tabs/`)
Multi-tab result management system inspired by DataGrip.

**Key Files:**
- `model.ts` - Tab state operations (create, switch, close)
- `events.ts` - Tab interaction handlers (clicks, switching)
- `render.ts` - Tab bar rendering

**State:**
- Tab list in `AppState.tabs`
- Active tab ID in `AppState.activeTabId`
- Running query tab ID in `AppState.runningQueryTabId`

**Usage:**
```typescript
import { createNewTab, switchToTab, closeTab } from './features/tabs/model';

const tab = createNewTab('My Results');
switchToTab(tab.id);
closeTab(tab.id);
```

**Features:**
- Create unlimited tabs
- Switch between tabs without losing results
- Background query execution (query runs in tab even when not active)
- Custom tab names (or auto-generated timestamps)
- Close tabs with confirmation

---

### Query (`query/`)
Query editor and execution management.

**Key Files:**
- `editor.ts` - Query text editor operations
- `execution.ts` - Query run/abort logic

**Messages:**
- Sends: `runQuery`, `abortQuery`
- Receives: `queryResult`, `queryError`, `queryStatus`

**Usage:**
```typescript
import { runQuery, abortQuery } from './features/query/execution';
import { getQueryText, setQueryText } from './features/query/editor';

const query = getQueryText();
runQuery(); // Execute current query
abortQuery(); // Cancel running query
```

**Features:**
- CloudWatch Insights query syntax
- Query text persistence per tab
- Comment toggling (`--` syntax)
- Validation (log groups, time range, query text)

---

### Results (`results/`)
Results table rendering, interaction, and management.

**Key Files:**
- `render.ts` - Table rendering coordinator
- `builders/TableBuilder.ts` - Pure DOM table construction
- `builders/EventBinder.ts` - Event delegation for table
- `details.ts` - Row detail expansion
- `filters.ts` - Column filtering UI
- `columnResize.ts` - Column width adjustment (⚠️ performance-critical)

**Performance Notes:**
- ⚠️ **DO NOT MODIFY** column resize algorithm without testing
- Table uses event delegation for scalability (thousands of rows)
- Virtual scrolling not implemented (not needed for typical datasets)
- Streaming append for partial results (no full rebuild)

**State:**
- Results stored per-tab in `TabState.results`
- Column filters in `TabState.columnFilters`
- Expanded rows in `TabState.expandedRows`

**Usage:**
```typescript
import { renderResults, appendPartialResults } from './features/results/render';

renderResults(queryResults); // Render complete results
appendPartialResults(partialResults); // Append streaming batch
```

**Features:**
- Sortable columns (click header)
- Resizable columns (drag resize handle)
- Row expansion for full field details
- Column filtering with multi-select
- Streaming results (incremental append)

---

### Search (`search/`)
In-results search with highlighting and navigation.

**Key Files:**
- `search.ts` - Main search logic (⚠️ performance-critical caching)
- `types.ts` - Search state definition

**Performance:**
- ⚠️ **DO NOT MODIFY** caching algorithm without performance testing
- Row cache built lazily on first search (DOM-based)
- Debounced based on dataset size (larger datasets = longer delay)
- Incremental scanning with time budgets (avoids UI freezes)
- Cache invalidated only when results change

**State:**
- Search term, matches, active index in `AppState.search`
- Search token for cancelling stale searches

**Usage:**
```typescript
import { searchResults, clearSearch, navigateSearchNext, navigateSearchPrev } from './features/search/search';

searchResults(); // Execute search with current term
navigateSearchNext(); // Go to next match
navigateSearchPrev(); // Go to previous match
clearSearch(); // Clear search highlights
```

**Features:**
- Case-insensitive substring search
- Highlight all matches
- Navigate through matches (F3/Shift+F3)
- Search across all fields
- Match counter (e.g., "Match 5/23")
- Performance-tuned for large datasets

---

### Filters (`results/filters.ts`)
Column-based filtering with multi-select values.

**Key Files:**
- `filters.ts` - Filter UI and logic

**State:**
- Filters stored per-tab in `TabState.columnFilters`
- Format: `Record<string, Set<string>>` (column → allowed values)

**Usage:**
```typescript
import { showColumnFilter, clearAllFilters } from './features/results/filters';

showColumnFilter('@message', buttonElement); // Show filter popup
clearAllFilters(); // Clear all active filters
```

**Features:**
- Click column header "⋮" to filter
- Multi-select values (checkboxes)
- "Select All" / "Deselect All" shortcuts
- Filter applied immediately (hides rows)
- Filter state persisted per-tab
- Row count updates dynamically

---

### Saved Queries (`savedQueries/`)
AWS Query Definitions with local fallback storage.

**Key Files:**
- `savedQueries.ts` - Management UI and logic
- `types.ts` - Query definition type

**Messages:**
- Sends: `getSavedQueries`, `saveQuery`, `deleteQuery`, `updateQuery`
- Receives: `savedQueries`

**State:**
- `AppState.savedQueries` - List of saved queries
- `AppState.savedQueriesSource` - 'aws' or 'local'

**Usage:**
```typescript
import { renderSavedQueries } from './features/savedQueries/savedQueries';

renderSavedQueries(queries); // Render saved queries list
```

**Features:**
- Load from AWS Query Definitions (if available)
- Fallback to local storage
- Create new saved queries
- Update existing queries
- Delete queries
- Quick-load into editor

---

### Favorites (`favorites/`)
Quick-access starred log groups.

**Key Files:**
- `favorites.ts` - Star/unstar functionality
- `types.ts` - Favorite definition

**Messages:**
- Sends: `toggleFavorite`
- Receives: `favorites`

**State:**
- `AppState.favorites` - List of favorited log groups

**Usage:**
```typescript
import { renderFavorites, updateStarButtons } from './features/favorites/favorites';

renderFavorites(favorites); // Render favorites list
updateStarButtons(); // Update star button states
```

**Features:**
- Star/unstar log groups
- Persisted in extension storage
- Quick selection from favorites panel
- Region-specific favorites

---

### Log Groups (`logGroups/`)
Log group selection UI with search and filtering.

**Key Files:**
- `logGroups.ts` - Selection list and search

**Messages:**
- Sends: `listLogGroups`, `refreshLogGroups`
- Receives: `logGroups`

**State:**
- `AppState.logGroups` - Available log groups in region

**Usage:**
```typescript
import { renderLogGroups } from './features/logGroups/logGroups';

renderLogGroups(logGroups); // Render log groups list
```

**Features:**
- Search log groups by name
- Multi-select with checkboxes
- Select All / Deselect All
- Refresh log groups list
- Visual indication of favorites (star icon)

---

### Time Range (`timeRange/`)
Time range selector with relative and absolute modes.

**Key Files:**
- `timeRange.ts` - Time picker UI and parsing

**State:**
- `AppState.timeMode` - 'relative' or 'absolute'
- `AppState.relative` - Relative time spec (e.g., { value: 1, unit: 'hours' })
- `AppState.absolute` - Absolute time range (start/end timestamps)

**Usage:**
```typescript
import { currentTimeRange } from './features/timeRange/timeRange';

const range = currentTimeRange(); // Get current time range
// Returns: { start: number, end: number } (Unix timestamps in milliseconds)
```

**Features:**
- Relative presets (15m, 1h, 3h, 6h, 12h, 1d, 3d, 7d)
- Custom relative time (value + unit)
- Absolute time range (start + end date/time)
- Smart date parsing
- Validation with error messages

---

## Adding a New Feature

### 1. Create Directory Structure

```bash
mkdir -p src/webview/features/myFeature
cd src/webview/features/myFeature
```

### 2. Define Types (if needed)

`types.ts`:
```typescript
export interface MyFeatureState {
  // Feature-specific state
}

export const INITIAL_MY_FEATURE_STATE: MyFeatureState = {
  // Default values
};
```

### 3. Implement Logic

`myFeature.ts`:
```typescript
import { getState, updateTab } from '../../core/state';
import { send } from '../../core/messaging';

export function initMyFeature() {
  // Setup event listeners, etc.
}

export function doSomething() {
  // Feature action
  const s = getState();
  // ... logic ...
}
```

### 4. Add State (if needed)

`src/webview/types/state.ts`:
```typescript
import { MyFeatureState } from '../features/myFeature/types';

export interface AppState {
  // ... existing properties ...
  myFeature: MyFeatureState;
}
```

### 5. Wire Up in Bootstrap

`src/webview/bootstrap.ts`:
```typescript
import { initMyFeature } from './features/myFeature/myFeature';

function init() {
  // ... existing initialization ...
  initMyFeature();
}
```

### 6. Add Messages (if needed)

`src/webview/types/messages.ts`:
```typescript
export type ExtensionToWebviewMessage =
  | ... existing types ...
  | { type: 'myFeatureData'; data: MyData };

export type WebviewToExtensionMessage =
  | ... existing types ...
  | { type: 'myFeatureRequest'; data: MyRequest };
```

### 7. Register Handlers

```typescript
import { on } from '../../core/messaging';

on('myFeatureData', (msg) => {
  handleMyFeatureData(msg.data);
});
```

### 8. Document

- Add to this README
- Update `ARCHITECTURE.md` if architectural changes
- Add examples to `EXAMPLES.md`

---

## Feature Communication

### Via State (Shared Access)

Features read shared state:
```typescript
import { getState, getActiveTab } from '../../core/state';

const state = getState();
const activeTab = getActiveTab();
```

### Via Direct Imports

Features can import each other:
```typescript
import { renderTabs } from '../tabs/render';

// Trigger tab re-render after state change
renderTabs();
```

### Via Events (Loose Coupling)

For decoupled communication:
```typescript
// Dispatch
window.dispatchEvent(new CustomEvent('cwlv:myEvent', { 
  detail: { data } 
}));

// Listen
window.addEventListener('cwlv:myEvent', (e: any) => {
  handleEvent(e.detail);
});
```

---

## Testing Features

Each feature should be testable in isolation:

```typescript
// myFeature.test.ts
import { doSomething } from './myFeature';
import { createInitialAppState } from '../../types/state';

describe('myFeature', () => {
  it('should do something', () => {
    const state = createInitialAppState();
    // Test logic
  });
});
```

---

## Performance Guidelines

### For Table-Heavy Features

- Use event delegation (not per-row listeners)
- Batch DOM updates when possible
- Profile with Chrome DevTools for datasets > 1000 rows

### For Search/Filter Features

- Debounce user input (especially for large datasets)
- Cache expensive computations
- Use incremental processing for large operations

### For State Updates

- Use state actions (already optimized)
- Batch multiple updates when possible
- Avoid unnecessary re-renders

---

## Common Patterns

### State + Render Pattern

```typescript
export function updateMyFeature(newData: MyData) {
  const s = getState();
  
  // 1. Update state via action
  updateTab(s, s.activeTabId!, { myProperty: newData });
  
  // 2. Re-render affected UI
  renderMyFeature();
}
```

### Message Handler Pattern

```typescript
import { on } from '../../core/messaging';

export function initMyFeatureHandlers() {
  on('myMessage', (msg) => {
    try {
      handleMyMessage(msg.data);
    } catch (e) {
      console.error('Handler error:', e);
      setStatus(`Error: ${e.message}`);
    }
  });
}
```

### Event Delegation Pattern

```typescript
export function initMyFeatureEvents() {
  const container = document.getElementById('myContainer');
  if (!container) return;
  
  container.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    
    if (target.matches('.my-button')) {
      handleButtonClick(target);
    }
  });
}
```

---

**Need help?** Check `ARCHITECTURE.md` for overall patterns or `EXAMPLES.md` for code recipes.
