export function setStatus(msg: string) {
  const el = document.getElementById('status');
  if (el) el.textContent = msg;
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
