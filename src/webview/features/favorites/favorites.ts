/**
 * Favorites Module
 * Manages favorite log groups - display, selection, and messaging
 */

import { send } from '../../core/messaging';
import { updateSelectedCount } from '../logGroups/logGroups';
import { Favorite } from './types';

let currentFavorites: Favorite[] = [];

/**
 * Check if a log group is currently selected in the UI
 */
function isLogGroupSelected(name: string, region: string): boolean {
  const currentRegion = (document.getElementById('region') as HTMLInputElement)?.value.trim() || 'us-east-2';
  if (region !== currentRegion) return false;

  const lgList = document.getElementById('lgList');
  if (!lgList) return false;
  
  const selected = Array.from<Element>(lgList.querySelectorAll('.lg-item.selected'));
  return selected.some(item => (item as HTMLElement).dataset.name === name);
}

/**
 * Toggle favorite status for a log group
 */
export function toggleFavorite(name: string, region: string) {
  const isFav = currentFavorites.some(f => f.name === name && f.region === region);
  if (isFav) {
    send({ type: 'removeFavorite', name, region });
  } else {
    send({ type: 'addFavorite', data: { name, region } });
  }
}

/**
 * Render favorites list
 */
export function renderFavorites(favs: Favorite[]) {
  currentFavorites = favs;
  const container = document.getElementById('favList');
  const countEl = document.getElementById('favCount');
  
  if (!container) return;
  
  container.innerHTML = '';
  if (countEl) countEl.textContent = String(favs.length);

  if (!favs.length) {
    container.innerHTML = '<div class="empty-state">No favorites yet. Click ★ next to a log group.</div>';
    return;
  }

  favs.forEach(f => {
    const isSelected = isLogGroupSelected(f.name, f.region);

    const wrapper = document.createElement('div');
    wrapper.className = 'fav-item';
    wrapper.dataset.name = f.name;
    wrapper.dataset.region = f.region;
    if (isSelected) {
      wrapper.classList.add('selected');
    }

    const btn = document.createElement('button');
    btn.className = 'fav-btn';
    btn.title = isSelected ? 'Click to deselect' : 'Click to select';
    btn.addEventListener('click', () => {
      // Get current state dynamically instead of using captured value
      const currentlySelected = isLogGroupSelected(f.name, f.region);
      toggleFavoriteSelection(f, !currentlySelected);
    });

    // Checkmark indicator
    const checkmark = document.createElement('span');
    checkmark.className = 'fav-checkmark';
    checkmark.textContent = '✓';

    // Text content
    const text = document.createElement('span');
    text.className = 'fav-text';
    text.textContent = `${f.name} (${f.region})`;

    btn.appendChild(checkmark);
    btn.appendChild(text);

    wrapper.appendChild(btn);
    container.appendChild(wrapper);
  });
}

/**
 * Update checkmarks for favorites based on current selection state
 */
export function updateFavoritesCheckboxes() {
  const favItems = Array.from<Element>(document.querySelectorAll('.fav-item'));
  favItems.forEach(item => {
    const name = (item as HTMLElement).dataset.name;
    const region = (item as HTMLElement).dataset.region;
    if (name && region) {
      const isSelected = isLogGroupSelected(name, region);
      const btn = item.querySelector('.fav-btn');

      if (isSelected) {
        item.classList.add('selected');
      } else {
        item.classList.remove('selected');
      }

      if (btn) {
        (btn as HTMLElement).title = isSelected ? 'Click to deselect' : 'Click to select';
      }
    }
  });
}

/**
 * Toggle favorite selection in log groups list
 */
function toggleFavoriteSelection(fav: Favorite, shouldSelect: boolean) {
  const currentRegion = (document.getElementById('region') as HTMLInputElement)?.value.trim() || 'us-east-2';

  // If different region, switch to favorite's region first
  if (fav.region !== currentRegion) {
    const regionEl = document.getElementById('region') as HTMLInputElement;
    if (regionEl) regionEl.value = fav.region;
    
    // Trigger loadLogGroups (assuming it's available globally or will be called by region change handler)
    send({ type: 'listLogGroups', region: fav.region });
    
    // Wait for log groups to load, then select
    setTimeout(() => {
      setLogGroupCheckbox(fav.name, shouldSelect);
    }, 500);
  } else {
    setLogGroupCheckbox(fav.name, shouldSelect);
  }
}

/**
 * Set checkbox state for a specific log group
 */
function setLogGroupCheckbox(name: string, checked: boolean) {
  const items = Array.from<Element>(document.querySelectorAll('.lg-item'));
  items.forEach(item => {
    if ((item as HTMLElement).dataset.name === name) {
      if (checked) {
        item.classList.add('selected');
      } else {
        item.classList.remove('selected');
      }
      updateSelectedCount();
      updateFavoritesCheckboxes();
    }
  });
}

/**
 * Update star buttons in log groups list based on favorites
 */
export function updateStarButtons() {
  const regionEl = document.getElementById('region') as HTMLInputElement;
  const region = regionEl?.value.trim() || 'us-east-2';
  const items = Array.from<Element>(document.querySelectorAll('.lg-item'));
  
  items.forEach(item => {
    const name = (item as HTMLElement).dataset.name;
    const starBtn = item.querySelector('.star-btn');
    if (starBtn && name) {
      const isFav = currentFavorites.some(f => f.name === name && f.region === region);
      starBtn.textContent = isFav ? '★' : '☆';
      (starBtn as HTMLElement).title = isFav ? 'Remove from favorites' : 'Add to favorites';
      if (isFav) {
        starBtn.classList.add('active');
      } else {
        starBtn.classList.remove('active');
      }
    }
  });
}

/**
 * Get current favorites list
 */
export function getCurrentFavorites(): Favorite[] {
  return currentFavorites;
}
