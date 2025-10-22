# Webview Architecture Guide

**Last Updated:** October 22, 2025  
**Status:** Active

## Overview

This document describes the architecture of the CloudWatch Logs Viewer webview. The webview is built with vanilla TypeScript and follows a modular, feature-based architecture designed for maintainability, type safety, and performance.

## Core Principles

1. **Type Safety First**: Leverage TypeScript's type system to catch errors at compile time
2. **Separation of Concerns**: Features are self-contained modules with clear responsibilities
3. **Centralized State Management**: Single source of truth via action-based mutations
4. **Performance Optimized**: Carefully tuned caching and rendering for large datasets
5. **Maintainability**: Clear code organization, comprehensive documentation, and testable design

## Directory Structure

```
src/webview/
├── bootstrap.ts              # Entry point, initialization
├── core/                     # Framework-level concerns
│   ├── messaging.ts          # VS Code webview message bus
│   ├── state.ts              # Central state management & selectors
│   ├── stateActions.ts       # State mutation functions (ONLY way to mutate state)
│   └── queryHandlers.ts      # Message handlers for query lifecycle
├── features/                 # Domain features (self-contained modules)
│   ├── tabs/                 # Multi-tab result management
│   │   ├── model.ts          # Tab state operations
│   │   ├── events.ts         # Tab interaction handlers
│   │   └── render.ts         # Tab bar rendering
│   ├── query/                # Query execution & editor
│   │   ├── editor.ts         # Query text editor
│   │   └── execution.ts      # Query run/abort logic
│   ├── results/              # Results table & rendering
│   │   ├── render.ts         # Rendering coordinator
│   │   ├── details.ts        # Row detail expansion
│   │   ├── filters.ts        # Column filtering
│   │   ├── columnResize.ts   # Column width adjustment (⚠️ performance-critical)
│   │   └── builders/         # DOM construction classes
│   │       ├── TableBuilder.ts   # Pure DOM table construction
│   │       └── EventBinder.ts    # Event delegation for table
│   ├── search/               # In-results search with highlighting
│   │   ├── search.ts         # Main search logic (⚠️ performance-critical caching)
│   │   └── types.ts          # Search state definition
│   ├── filters/              # (covered in results/filters.ts)
│   ├── savedQueries/         # AWS Query Definitions management
│   │   ├── savedQueries.ts   # Management UI
│   │   └── types.ts          # Query definition type
│   ├── favorites/            # Quick-access log groups
│   │   ├── favorites.ts      # Star/unstar functionality
│   │   └── types.ts          # Favorite definition
│   ├── logGroups/            # Log group selection
│   │   └── logGroups.ts      # Selection list UI
│   └── timeRange/            # Time range selector
│       └── timeRange.ts      # Relative & absolute time picker
├── components/               # Reusable UI components
│   ├── status.ts             # Status bar component
│   └── controls/             # Form control wrappers
│       ├── RunButton.ts      # Query run/cancel button
│       ├── SearchInput.ts    # Search input field
│       ├── RegionInput.ts    # AWS region selector
│       └── index.ts          # Export aggregator
├── types/                    # TypeScript type definitions
│   ├── domain.ts             # Business entities (QueryResults, TimeRange, etc.)
│   ├── state.ts              # State shape definitions (AppState, TabState, etc.)
│   └── messages.ts           # Message contracts (ExtensionToWebview, WebviewToExtension)
└── lib/                      # Pure utility functions
    ├── html.ts               # HTML utilities (escaping, etc.)
    ├── dom.ts                # Type-safe DOM helpers
    └── yaml.ts               # YAML parsing
```

## Architecture Patterns

### 1. State Management (Action-Based)

**Rule:** ALL state mutations MUST go through action functions in `core/stateActions.ts`.

**Why:** Centralized mutations ensure consistency, make debugging easier, and provide a single source of truth for state transitions.

**Example:**
```typescript
// ❌ WRONG - Direct mutation
tab.status = 'Complete';
tab.isStreaming = false;

// ✅ CORRECT - Via action
import { updateTab } from '../../core/state';
const s = getState();
updateTab(s, tabId, { status: 'Complete', isStreaming: false });
```

**Available Actions:**
- `updateTab()` - Update one or more tab properties
- `resetTabForNewQuery()` - Atomic reset for new query execution
- `completeTabQuery()` - Mark query complete with results
- `setTabError()` - Set tab to error state
- `setTabStatus()` - Update status message
- `updateSearchState()` - Update search state
- `setTabColumnFilters()` - Set column filters for tab
- And more... (see `stateActions.ts`)

###  2. Component Wrappers (DOM Abstraction)

**Rule:** Use component wrapper classes instead of direct DOM manipulation with type assertions.

**Why:** Eliminates `as HTMLElement` casts, centralizes element access, improves testability.

**Example:**
```typescript
// ❌ WRONG - Direct DOM with type assertions
const btn = document.getElementById('runBtn') as HTMLButtonElement | null;
if (btn) {
  btn.setAttribute('data-state', 'running');
  btn.disabled = false;
  const label = btn.querySelector('.run-btn-label');
  if (label) label.textContent = 'Cancel Query';
}

// ✅ CORRECT - Component wrapper
import { RunButton } from '../../components/controls';
const runButton = new RunButton();
runButton.setRunning();
```

**Available Components:**
- `RunButton` - Query run/cancel button with states (idle, running, aborting)
- `SearchInput` - Search input field
- `RegionInput` - AWS region selector

### 3. Rendering Architecture (Builder Pattern)

**Rule:** Separate DOM construction from event binding and business logic.

**Why:** Single Responsibility Principle - each class has one job. Makes code testable and maintainable.

**Example:**
```typescript
// Build table structure (pure DOM construction)
const builder = new TableBuilder(queryResults, ['@ptr']);
const table = builder.build();
container.appendChild(table);

// Bind events (event delegation)
const eventBinder = new TableEventBinder(container);
eventBinder.bindAll();
```

**Classes:**
- `TableBuilder` - Pure DOM construction (no events, no state)
- `TableEventBinder` - Event delegation for expand, filter, resize

### 4. Type-Safe DOM Access

**Rule:** Use type-safe DOM utilities from `lib/dom.ts`.

**Example:**
```typescript
import { getElement } from '../lib/dom';

// Type-safe element access (returns correct type or null)
const input = getElement('searchInput', 'input'); // Type: HTMLInputElement | null
if (input) {
  input.value = 'test'; // No type assertion needed!
}
```

## Data Flow

### Message Flow (Extension ↔ Webview)

```
Extension                    Webview
    |                           |
    |--- ExtensionToWebview --->|
    |    (queryResult)          |
    |                           |
    |                    messaging.on('queryResult')
    |                           |
    |                    State updated via actions
    |                           |
    |                    UI re-rendered
    |                           |
    |<-- WebviewToExtension ----|
         (runQuery)
```

### State Update Flow

```
User Action / Message Received
    ↓
Action Function (stateActions.ts)
    ↓
State Updated (state.ts)
    ↓
Render Function Called
    ↓
DOM Updated
```

### Query Execution Flow

```
1. User clicks "Run Query" → RunButton.onClick
2. execution.ts validates inputs (log groups, query, time range)
3. resetTabForNewQuery() called (atomic state reset)
4. send({ type: 'runQuery', ... }) to extension
5. Extension executes query
6. Final results → on('queryResult') → renderResults()
7. completeTabQuery() marks query complete
8. RunButton.setIdle() resets button
```

## Performance Considerations

### ⚠️ Search Caching (DO NOT MODIFY without performance testing)

Location: `features/search/search.ts`

The search feature uses a sophisticated DOM-based row cache optimized for large result sets (10k+ rows):

- **Row cache** built lazily on first search
- **Invalidated** only when results change
- **Debounced** search execution based on dataset size
- **Incremental scanning** with time budgets to avoid UI freezes

**Critical performance paths:**
- Cache building: `buildRowCache()`
- Search execution: `searchResults()`
- Highlighting: Cell-by-cell with escape handling

### ⚠️ Column Resizing (DO NOT MODIFY without performance testing)

Location: `features/results/columnResize.ts`

Uses direct style manipulation for smooth resizing:

```typescript
// Direct style updates (fastest approach)
resizingColumn.style.width = newWidth + 'px';
resizingColumn.style.minWidth = newWidth + 'px';
resizingColumn.style.maxWidth = newWidth + 'px';
```

### Table Rendering Optimization

- **Event delegation** instead of per-element listeners
- **Lazy rendering** for inactive tabs (state updated, DOM rendered on switch)

## Feature Module Pattern

Each feature follows this structure:

```
features/myFeature/
├── myFeature.ts          # Main logic & initialization
├── types.ts              # Feature-specific types
├── render.ts             # DOM rendering (if needed)
└── events.ts             # Event handlers (if needed)
```

**Exports:**
- Initialization function (e.g., `initMyFeature()`)
- Public API functions
- Types (if needed by other features)

**Example: Search Feature**

```typescript
// search/search.ts
export function initSearchEvents() { ... }
export function clearSearch() { ... }
export function navigateSearchNext() { ... }
export function invalidateRowCache() { ... }

// search/types.ts
export interface SearchState { 
  term: string;
  matches: Match[];
  activeIndex: number;
  token: number;
}
```

## Message Contracts (Type-Safe)

Messages are type-safe discriminated unions defined in `types/messages.ts`.

**Sending:**
```typescript
import { send } from './core/messaging';
send({ type: 'runQuery', data: { logGroups, region, query, ... } });
```

**Receiving:**
```typescript
import { on } from './core/messaging';
on('queryResult', (msg) => {
  // msg.data is automatically typed as QueryResults
  renderResults(msg.data);
});
```

### Adding New Messages

1. Define in `types/messages.ts`:
```typescript
export type ExtensionToWebviewMessage =
  | ... existing types ...
  | { type: 'myNewMessage'; data: MyData };
```

2. Register handler:
```typescript
on('myNewMessage', (msg) => {
  console.log(msg.data); // Typed as MyData
});
```

3. Implement in extension side

## State Shape

```typescript
AppState
├── tabs: TabState[]              // All tabs
├── activeTabId: number | null    // Currently visible tab
├── runningQueryTabId: number | null // Tab executing query
├── nextTabId: number              // Auto-increment counter
├── favorites: Favorite[]          // Starred log groups
├── savedQueries: SavedQuery[]     // Saved query definitions
├── logGroups: string[]            // Available log groups
├── search: SearchState            // Global search state
├── timeMode: 'relative' | 'absolute'
├── relative: RelativeTimeSpec
└── absolute?: TimeRange

TabState (per tab)
├── id: number
├── name: string
├── isCustomName: boolean
├── timestamp: number
├── query: string
├── logGroups: string[]
├── region: string
├── timeRange: TimeRange
├── results: QueryResults | null
├── searchQuery: string
├── searchIndex: number
├── columnFilters: Record<string, Set<string>>
├── expandedRows: Set<number>
├── scrollPosition: number
└── status: string
```

## Common Patterns

### Safe Element Access

```typescript
import { getElement } from '../lib/dom';

const input = getElement('searchInput', 'input');
if (input) {
  input.value = 'test'; // Type: HTMLInputElement
}
```

### Event Delegation for Dynamic Content

```typescript
container.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target.matches('.my-button')) {
    handleClick(target);
  }
});
```

### Lazy DOM Operations

```typescript
// Don't render hidden tabs to DOM
const shouldRender = targetTabId === activeTabId;
if (!shouldRender) {
  // Just update state, skip DOM
  return;
}
```

## Testing Strategy

### Unit Tests
- State actions (`stateActions.ts`)
- Pure utilities (`lib/*`)
- Component classes (`components/controls/*`)
- Message type narrowing

### Integration Tests
- Feature initialization
- Message handling end-to-end
- State + render coordination

### Manual Testing Checklist
- Large datasets (10k+ rows)
- All user interactions (query, search, filter, expand)
- Error scenarios (network failures, invalid queries)
- Tab switching with active queries
- Column resizing smoothness

## Debugging Tips

### Enable Debug Logging

Some features have debug logging. Search for `debugLog` in the codebase.

### State Inspection

Add to browser console:
```typescript
window.__getState = () => getState();
```

Then in DevTools:
```javascript
__getState() // View entire state tree
```

### Performance Profiling

Use Chrome DevTools Performance tab:
1. Start recording
2. Perform action (search, render, etc.)
3. Stop recording
4. Analyze flame chart for hotspots

## Migration Notes

This architecture was refactored from a monolithic `webview.js` file in October 2025.

**Key improvements:**
1. ✅ Type-safe message handling (discriminated unions)
2. ✅ Centralized state management (action-based)
3. ✅ Feature-based organization (domain-driven)
4. ✅ Reusable UI components (wrapper classes)
5. ✅ Better testability (separation of concerns)
6. ✅ Preserved performance optimizations (search caching, column resize)

**Legacy patterns to avoid:**
- ❌ Global variables in module scope
- ❌ Direct DOM manipulation in message handlers
- ❌ Untyped message data (`any` types)
- ❌ Direct state property mutations

## Contributing Guidelines

### Before Adding Features

1. Determine which feature module it belongs to
2. Check if it needs new state (add to `types/state.ts`)
3. Check if it needs new messages (add to `types/messages.ts`)
4. Plan state actions needed (add to `stateActions.ts`)

### Code Style

- Use action functions for ALL state mutations
- Use component wrappers for UI elements
- Use event delegation for dynamic content
- Document performance-critical code with ⚠️
- Add JSDoc comments to public functions
- Follow existing module patterns

### Performance

- Benchmark before/after for rendering changes
- Test with large datasets (10k+ rows)
- Use Chrome DevTools Performance profiler
- Don't modify search caching or column resize without testing

## Additional Resources

- `features/README.md` - Feature catalog and examples
- `EXAMPLES.md` - Code recipes and patterns
- `TAB_SYSTEM.md` - Tab system design
- Extension source code in `src/extension.ts`

---

**Questions?** Check `EXAMPLES.md` or review existing feature implementations.
