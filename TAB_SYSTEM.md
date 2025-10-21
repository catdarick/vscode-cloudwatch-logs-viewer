# CloudWatch Logs Viewer - Tab System

## Overview

The extension now includes a **DataGrip-style tab system** for managing multiple query results. This allows you to keep previous query results open while running new queries, making it easier to compare results and maintain your workflow.

## Features

### 📑 Tab Management

- **Multiple Result Tabs**: Keep multiple query results open simultaneously
- **Tab Bar**: Visual tab interface above the results panel
- **New Tab Button**: Create empty tabs on demand (+ New Tab)

### 🎯 Query Execution Behavior

The system is designed to be simple and intuitive:

1. **Running a query always overwrites the current tab** with new results
2. **Want to preserve results?** Click "+ New Tab" before running a new query
3. **Compare results**: Open multiple tabs with different query results and switch between them

### 💾 Tab State Preservation

Each tab maintains its own complete state:

- **Query Results**: Full result set with all rows
- **Search Query**: Active search terms and current match position
- **Column Filters**: Applied filters with selected values
- **Expanded Rows**: Which detail rows are expanded
- **Scroll Position**: Vertical scroll position in results

When you switch between tabs, all state is automatically saved and restored.

### 🎨 Visual Feedback

- **Active Tab**: Highlighted with distinct background color
- **Streaming Indicator**: Animated progress bar on tabs receiving results
- **Tab Names**: Automatically named with timestamp (HH:mm:ss format)
- **Hover Effects**: Smooth transitions on tab hover

### ⌨️ Keyboard Shortcuts

- **Ctrl/Cmd + T**: Create new tab
- **Ctrl/Cmd + W**: Close current tab
- **Ctrl/Cmd + Tab**: Switch to next tab
- **Ctrl/Cmd + Shift + Tab**: Switch to previous tab

### ❌ Closing Tabs

- Click the × button on any tab to close it
- When closing the active tab, automatically switches to an adjacent tab
- If all tabs are closed, a new empty tab is automatically created
- The last tab can always be closed (new one will be created)

## Usage Examples

### Example 1: Comparing Query Results

1. Run your first query → Results appear in current tab
2. Click "+ New Tab" to create a new empty tab
3. Modify your query and run again → Results appear in the new tab
4. Switch between tabs to compare results

### Example 2: Quick Iteration

1. Run a query → Results appear in current tab
2. Modify query and run again → Results overwrite current tab
3. Iterate quickly without creating multiple tabs

### Example 3: Multiple Parallel Investigations

1. Run query for error logs → Tab shows "Query 14:30:15"
2. Click "+ New Tab" → New empty tab created
3. Run query for warning logs → Tab shows "Query 14:32:45"
4. Click "+ New Tab" → Another new tab
5. Run query for info logs → Tab shows "Query 14:35:20"
6. Use Ctrl/Cmd+Tab to navigate between all three result sets

## Workflow Comparison

### Before (No Tabs)
- Run query → See results
- Run another query → **Previous results lost**
- Can't compare different queries

### After (With Tabs)
- Run query → See results in Tab 1
- Click "+ New Tab" → Create Tab 2
- Run another query → See new results in Tab 2
- **Switch between tabs to compare both sets of results**

## Technical Implementation

### Data Structure

Each tab stores:
```javascript
{
  id: number,              // Unique identifier
  name: string,            // Display name (e.g., "Query 14:32:15")
  timestamp: number,       // Creation timestamp
  query: string,           // Query text
  logGroups: string[],     // Selected log groups
  region: string,          // AWS region
  timeRange: { start, end }, // Query time range
  results: object,         // Full results payload
  searchQuery: string,     // Active search
  searchIndex: number,     // Current match index
  columnFilters: object,   // Active filters
  expandedRows: Set,       // Expanded row indices
  scrollPosition: number,  // Scroll offset
  isStreaming: boolean     // Receiving results
}
```

### State Management

- **Global State**: `tabs[]` array, `activeTabId`, `nextTabId`
- **Save on Switch**: Current tab state saved before switching
- **Restore on Switch**: New tab state fully restored after switching
- **Auto-initialization**: First tab created on extension load

## Best Practices

1. **Preserve Important Results**: Click "+ New Tab" before running a query if you want to keep current results
2. **Quick Iteration**: If you don't need to keep results, just run queries directly - they'll overwrite the current tab
3. **Clean Up**: Close tabs you no longer need to keep the interface clean
4. **Keyboard Navigation**: Use Ctrl/Cmd+Tab for quick switching between tabs
5. **Streaming Indicator**: Watch for the animated bar to know when results are still loading

## Design Philosophy

This tab system follows a **simple and explicit** approach:
- Running a query **always** overwrites the current tab (predictable behavior)
- You **explicitly** create new tabs when needed (via button or Ctrl+T)
- No hidden "pin" state or complex rules to remember
- Clear visual feedback for what's happening

---

**Note**: This design prioritizes simplicity and explicit user control over automatic behavior, making it easy to understand and use.

