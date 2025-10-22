/**
 * Saved Queries Module
 * Manages saved queries - display, load, save, and delete
 */

import { send } from '../../core/messaging';
import { getQueryText, setQueryText } from '../query/editor';
import { SavedQuery } from './types';

let savedQueries: SavedQuery[] = [];
let savedQueriesSource: 'aws' | 'local' = 'aws';

/**
 * Get selected log groups
 */
function getSelectedLogGroups(): string[] {
  const container = document.getElementById('lgList');
  if (!container) return [];
  return Array.from<Element>(container.querySelectorAll('.lg-item.selected'))
    .map(item => (item as HTMLElement).dataset.name || '')
    .filter(Boolean);
}

/**
 * Render saved queries dropdown
 */
export function renderSavedQueries(list: SavedQuery[], source?: 'aws' | 'local', error?: string) {
  savedQueries = list;
  if (source) savedQueriesSource = source;
  
  const select = document.getElementById('savedSelect') as HTMLSelectElement | null;
  if (!select) return;
  
  const header = source === 'aws' ? '-- Saved Queries --' : '-- Load Local Saved Query --';
  select.innerHTML = `<option value="">${header}</option>`;
  
  list.forEach((item, idx) => {
    const opt = document.createElement('option') as HTMLOptionElement;
    opt.value = String(idx);
    opt.textContent = item.name;
    select.appendChild(opt);
  });
  
  if (error) {
    // Optionally set a status message
    const statusEl = document.getElementById('status');
    if (statusEl) statusEl.textContent = `⚠ Saved queries fallback (${error})`;
  }
}

/**
 * Load selected saved query into query input
 */
export function loadSavedQuery() {
  const select = document.getElementById('savedSelect') as HTMLSelectElement | null;
  if (!select) return;
  
  const idx = parseInt(select.value, 10);
  if (isNaN(idx)) return;
  
  const query = savedQueries[idx];
  if (query) {
    setQueryText(query.query);
    // Optionally select log groups if they match
    // (This would require log groups to be loaded first)
  }
}

/**
 * Save current query
 */
export function saveCurrentQuery() {
  const query = getQueryText();
  const logGroups = getSelectedLogGroups();

  // Auto-generate name from timestamp
  const now = new Date();
  const name = `Query ${now.toISOString().slice(0, 19).replace('T', ' ')}`;

  let existingId: string | undefined = undefined;
  const select = document.getElementById('savedSelect') as HTMLSelectElement | null;
  const selectIdx = parseInt(select?.value || '', 10);
  
  if (!isNaN(selectIdx) && savedQueries[selectIdx]) {
    existingId = savedQueries[selectIdx].id; // update existing
  }
  
  send({ 
    type: 'saveQuery', 
    data: { 
      id: existingId || Date.now().toString(), 
      name, 
      query, 
      logGroups 
    } 
  });
}

/**
 * Delete selected saved query
 */
export function deleteSelectedSaved() {
  const select = document.getElementById('savedSelect') as HTMLSelectElement | null;
  if (!select) return;
  
  const idx = parseInt(select.value, 10);
  if (isNaN(idx)) return;
  
  const query = savedQueries[idx];
  if (query && confirm(`Delete saved query "${query.name}"?`)) {
    send({ type: 'deleteQuery', id: query.id });
  }
}

/**
 * Initialize saved queries UI event listeners
 */
export function initSavedQueriesUI() {
  const loadBtn = document.getElementById('loadSavedBtn');
  const saveBtn = document.getElementById('saveQueryBtn');
  const deleteBtn = document.getElementById('deleteSavedBtn');
  const select = document.getElementById('savedSelect');
  
  if (loadBtn) {
    loadBtn.addEventListener('click', loadSavedQuery);
  }
  
  if (saveBtn) {
    saveBtn.addEventListener('click', saveCurrentQuery);
  }
  
  if (deleteBtn) {
    deleteBtn.addEventListener('click', deleteSelectedSaved);
  }
  
  if (select) {
    select.addEventListener('change', loadSavedQuery);
  }
}
