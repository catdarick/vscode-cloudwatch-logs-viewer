/**
 * Log Groups Module
 * Manages log groups list - loading, rendering, filtering, and selection
 */

import { send } from '../../core/messaging';
import { updateFavoritesCheckboxes, toggleFavorite, getCurrentFavorites } from '../favorites/favorites';
import { notifyInfo } from '../../components/status';

/**
 * Load log groups from AWS
 */
export function loadLogGroups() {
  const regionEl = document.getElementById('region') as HTMLInputElement | null;
  const filterEl = document.getElementById('lgFilter') as HTMLInputElement | null;
  
  const region = regionEl?.value.trim() || 'us-east-2';
  const prefix = filterEl?.value.trim() || '';
  
  notifyInfo('Loading log groups...');
  send({ type: 'listLogGroups', region, prefix });
}

/**
 * Render log groups list
 */
export function renderLogGroups(groups: string[]) {
  const container = document.getElementById('lgList');
  if (!container) return;
  
  // Preserve current selection before clearing
  const previouslySelected = getSelectedLogGroups();
  
  container.innerHTML = '';
  
  if (!groups.length) {
    container.innerHTML = '<div class="empty-state">No log groups found</div>';
    updateSelectedCount();
    return;
  }
  
  const regionEl = document.getElementById('region') as HTMLInputElement | null;
  const region = regionEl?.value.trim() || 'us-east-2';
  const favorites = getCurrentFavorites();
  
  groups.forEach(g => {
    const isFav = favorites.some(f => f.name === g && f.region === region);
    const isSelected = previouslySelected.includes(g);

    const wrapper = document.createElement('div');
    wrapper.className = 'lg-item';
    wrapper.dataset.name = g;
    wrapper.dataset.region = region;
    if (isSelected) {
      wrapper.classList.add('selected');
    }

    const btn = document.createElement('button');
    btn.className = 'lg-btn';
    btn.title = isSelected ? 'Click to deselect' : 'Click to select';
    btn.addEventListener('click', () => {
      const currentlySelected = wrapper.classList.contains('selected');
      if (currentlySelected) {
        wrapper.classList.remove('selected');
      } else {
        wrapper.classList.add('selected');
      }
      updateSelectedCount();
      updateFavoritesCheckboxes();
    });

    // Checkmark indicator
    const checkmark = document.createElement('span');
    checkmark.className = 'lg-checkmark';
    checkmark.textContent = '✓';

    // Text content
    const text = document.createElement('span');
    text.className = 'lg-text';
    text.textContent = g;

    btn.appendChild(checkmark);
    btn.appendChild(text);

    const starBtn = document.createElement('button');
    starBtn.className = 'star-btn' + (isFav ? ' active' : '');
    starBtn.textContent = isFav ? '★' : '☆';
    starBtn.title = isFav ? 'Remove from favorites' : 'Add to favorites';
    starBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(g, region);
    });

    wrapper.appendChild(btn);
    wrapper.appendChild(starBtn);
    container.appendChild(wrapper);
  });
  
  updateSelectedCount();
  updateFavoritesCheckboxes();
}

/**
 * Filter log groups based on search input
 */
export function filterLogGroups() {
  const filterEl = document.getElementById('lgFilter') as HTMLInputElement | null;
  const filter = filterEl?.value.trim().toLowerCase() || '';
  const items = Array.from<Element>(document.querySelectorAll('.lg-item'));
  
  items.forEach(item => {
    const name = ((item as HTMLElement).dataset.name || '').toLowerCase();
    (item as HTMLElement).style.display = name.includes(filter) ? 'flex' : 'none';
  });
}

/**
 * Update selected count display
 */
export function updateSelectedCount() {
  const count = getSelectedLogGroups().length;
  const countEl = document.getElementById('lgSelectedCount');
  if (countEl) {
    countEl.textContent = `${count} selected`;
  }
}

/**
 * Get selected log groups
 */
export function getSelectedLogGroups(): string[] {
  const container = document.getElementById('lgList');
  if (!container) return [];
  return Array.from<Element>(container.querySelectorAll('.lg-item.selected'))
    .map(item => (item as HTMLElement).dataset.name || '')
    .filter(Boolean);
}

/**
 * Toggle "Other Groups" section visibility
 */
export function toggleOtherGroupsSection() {
  const content = document.getElementById('lgSectionContent');
  const btn = document.getElementById('otherGroupsBtn');
  
  if (!content || !btn) return;
  
  const isCollapsed = content.classList.toggle('collapsed');
  btn.textContent = isCollapsed ? '▶ Other Groups' : '▼ Other Groups';
}

/**
 * Initialize log groups UI event listeners
 */
export function initLogGroupsUI() {
  const refreshBtn = document.getElementById('lgRefreshBtn');
  const filterInput = document.getElementById('lgFilter');
  const otherGroupsBtn = document.getElementById('otherGroupsBtn');
  
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadLogGroups);
  }
  
  if (filterInput) {
    filterInput.addEventListener('input', filterLogGroups);
  }
  
  if (otherGroupsBtn) {
    otherGroupsBtn.addEventListener('click', toggleOtherGroupsSection);
  }
  
  // Auto-load on startup
  loadLogGroups();
}
