let statusHideTimer: any = null;

function setStatus(msg: string, autohide = true, delay = 3000, type: 'info' | 'warning' | 'error' = 'info') {
  const el = document.getElementById('status');
  if (!el) return;
  
  // Clear any existing timer
  if (statusHideTimer) {
    clearTimeout(statusHideTimer);
    statusHideTimer = null;
  }
  
  // If message is empty, just hide the status bar
  if (!msg) {
    el.classList.add('status-hidden');
    el.classList.remove('status-warning', 'status-error');
    setTimeout(() => {
      if (el.classList.contains('status-hidden')) {
        el.textContent = '';
      }
    }, 800);
    return;
  }
  
  // Apply appropriate styling based on type
  el.classList.remove('status-warning', 'status-error');
  if (type === 'warning') {
    el.classList.add('status-warning');
  } else if (type === 'error') {
    el.classList.add('status-error');
  }
  
  // Set the message and show
  el.textContent = msg;
  el.classList.remove('status-hidden');
  
  // Auto-hide after delay if enabled
  if (autohide) {
    statusHideTimer = setTimeout(() => {
      el.classList.add('status-hidden');
      // Clear content after animation completes (0.5s fade + 0.3s collapse)
      setTimeout(() => {
        if (el.classList.contains('status-hidden')) {
          el.textContent = '';
          el.classList.remove('status-warning', 'status-error');
        }
      }, 800);
      statusHideTimer = null;
    }, delay);
  }
}

export function notifyInfo(msg: string, autohide = true, delay = 3000) {
  setStatus(msg, autohide, delay, 'info');
}

export function notifyWarning(msg: string, autohide = true, delay = 5000) {
  setStatus(msg, autohide, delay, 'warning');
}

export function notifyError(msg: string, autohide = true, delay = 8000) {
  setStatus(msg, autohide, delay, 'error');
}


export function pulseLogGroupsAttention() {
  try {
    const panel = document.querySelector('.log-groups-panel');
    if (!panel) return;
    panel.classList.remove('cwlv-pulse-attention');
    void (panel as HTMLElement).offsetWidth; // reflow to restart animation
    panel.classList.add('cwlv-pulse-attention');
    setTimeout(() => panel.classList.remove('cwlv-pulse-attention'), 1400);
  } catch (_) { /* ignore */ }
}
