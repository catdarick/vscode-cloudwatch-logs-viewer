/**
 * Time Range Module
 * Manages time range selection (relative vs absolute) and validation
 */

export interface TimeRange {
  start: number;
  end: number;
}

type TimeMode = 'relative' | 'absolute';
type TimeUnit = 'minutes' | 'hours' | 'days';

let relativeValue = 1;
let relativeUnit: TimeUnit = 'hours';

/**
 * Get the current time range based on active mode and inputs
 */
export function currentTimeRange(): TimeRange {
  const activeBtn = document.querySelector('.mode-btn.active');
  const mode: TimeMode = activeBtn ? (activeBtn as HTMLElement).dataset.mode as TimeMode : 'relative';
  
  if (mode === 'absolute') {
    return getAbsoluteTimeRange();
  } else {
    return getRelativeTimeRange();
  }
}

function getAbsoluteTimeRange(): TimeRange {
  const startDate = (document.getElementById('startDate') as HTMLInputElement)?.value;
  const startTime = (document.getElementById('startTime') as HTMLInputElement)?.value;
  const endDate = (document.getElementById('endDate') as HTMLInputElement)?.value;
  const endTime = (document.getElementById('endTime') as HTMLInputElement)?.value;
  
  // Validate that all absolute time fields are filled
  if (!startDate || !startTime) {
    throw new Error('Start date and time are required for absolute time range');
  }
  if (!endDate || !endTime) {
    throw new Error('End date and time are required for absolute time range');
  }
  
  const startStr = `${startDate}T${startTime}Z`;
  const endStr = `${endDate}T${endTime}Z`;
  const startMs = new Date(startStr).getTime();
  const endMs = new Date(endStr).getTime();
  
  // Validate that the dates are valid
  if (isNaN(startMs)) {
    throw new Error('Invalid start date/time format');
  }
  if (isNaN(endMs)) {
    throw new Error('Invalid end date/time format');
  }
  
  // Validate that start is before end
  if (startMs >= endMs) {
    throw new Error('Start time must be before end time');
  }
  
  return {
    start: startMs,
    end: endMs
  };
}

function getRelativeTimeRange(): TimeRange {
  const unitMultipliers: Record<TimeUnit, number> = {
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000
  };
  const ms = relativeValue * (unitMultipliers[relativeUnit] || unitMultipliers.hours);
  return { start: Date.now() - ms, end: Date.now() };
}

/**
 * Toggle visibility of relative vs absolute time controls
 */
export function toggleTimeMode() {
  const activeBtn = document.querySelector('.mode-btn.active');
  const mode: TimeMode = activeBtn ? (activeBtn as HTMLElement).dataset.mode as TimeMode : 'relative';
  const relativeInputs = Array.from<Element>(document.querySelectorAll('.relative-time'));
  const absoluteInputs = Array.from<Element>(document.querySelectorAll('.absolute-time'));

  if (mode === 'relative') {
    relativeInputs.forEach(el => (el as HTMLElement).style.display = '');
    absoluteInputs.forEach(el => (el as HTMLElement).style.display = 'none');
  } else {
    relativeInputs.forEach(el => (el as HTMLElement).style.display = 'none');
    absoluteInputs.forEach(el => (el as HTMLElement).style.display = '');
  }
}

/**
 * Set date/time inputs to current time
 */
export function setDateTimeToNow(which: 'start' | 'end') {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const timeStr = now.toISOString().slice(11, 19); // HH:mm:ss

  if (which === 'start') {
    const startDateEl = document.getElementById('startDate') as HTMLInputElement;
    const startTimeEl = document.getElementById('startTime') as HTMLInputElement;
    if (startDateEl) startDateEl.value = dateStr;
    if (startTimeEl) startTimeEl.value = timeStr;
  } else {
    const endDateEl = document.getElementById('endDate') as HTMLInputElement;
    const endTimeEl = document.getElementById('endTime') as HTMLInputElement;
    if (endDateEl) endDateEl.value = dateStr;
    if (endTimeEl) endTimeEl.value = timeStr;
  }
}

/**
 * Copy start date/time to end fields
 */
export function copyStartToEnd() {
  const startDate = (document.getElementById('startDate') as HTMLInputElement)?.value;
  const startTime = (document.getElementById('startTime') as HTMLInputElement)?.value;
  const endDateEl = document.getElementById('endDate') as HTMLInputElement;
  const endTimeEl = document.getElementById('endTime') as HTMLInputElement;
  if (endDateEl) endDateEl.value = startDate;
  if (endTimeEl) endTimeEl.value = startTime;
}

/**
 * Set max date/time to prevent future dates
 */
export function updateDateTimeMax() {
  const now = new Date();
  const maxDate = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const maxTime = now.toISOString().slice(11, 19); // HH:mm:ss

  const startDateEl = document.getElementById('startDate') as HTMLInputElement;
  const endDateEl = document.getElementById('endDate') as HTMLInputElement;
  const startTimeEl = document.getElementById('startTime') as HTMLInputElement;
  const endTimeEl = document.getElementById('endTime') as HTMLInputElement;
  
  if (startDateEl) startDateEl.max = maxDate;
  if (endDateEl) endDateEl.max = maxDate;
  if (startTimeEl) startTimeEl.max = maxTime;
  if (endTimeEl) endTimeEl.max = maxTime;
}

/**
 * Parse a pasted date string in various formats
 */
function parsePastedDate(str: string): Date | null {
  let s = str.trim();
  if (!s) return null;
  // Strip surrounding quotes/backticks
  s = s.replace(/^["'`]|["'`]$/g, '');
  
  // Epoch seconds (10 digits) or ms (13 digits)
  if (/^\d{10}$/.test(s)) {
    const secs = parseInt(s, 10);
    return new Date(secs * 1000);
  }
  if (/^\d{13}$/.test(s)) {
    const ms = parseInt(s, 10);
    return new Date(ms);
  }
  
  // ISO with T (timezone optional)
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    // If no timezone specified append Z
    if (!/[Zz]|[+-]\d{2}:?\d{2}$/.test(s)) {
      s += 'Z';
    }
    // Normalize offset -0400 => -04:00
    s = s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }
  
  // Date + space time (YYYY-MM-DD HH:mm[:ss])
  if (/^\d{4}-\d{2}-\d{2} /.test(s)) {
    let iso = s.replace(' ', 'T');
    if (!/[Zz]|[+-]\d{2}:?\d{2}$/.test(iso)) iso += 'Z';
    iso = iso.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return d;
  }
  
  // YYYY/MM/DD formats
  if (/^\d{4}[/-]\d{1,2}[/-]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/.test(s)) {
    const parts = s.split(/[ T]/);
    const datePart = parts[0];
    const [y, m, dDay] = datePart.split(/[/-]/).map(x => parseInt(x, 10));
    let hour = 0, min = 0, sec = 0;
    if (parts[1]) {
      const timeParts = parts[1].split(':').map(x => parseInt(x, 10));
      hour = timeParts[0] || 0; min = timeParts[1] || 0; sec = timeParts[2] || 0;
    }
    if (m >= 1 && m <= 12 && dDay >= 1 && dDay <= 31) {
      return new Date(Date.UTC(y, m - 1, dDay, hour, min, sec));
    }
  }
  
  // Slash dates mm/dd/yyyy or dd/mm/yyyy (optional time & AM/PM)
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM|am|pm))?)?$/);
  if (slash) {
    let a = parseInt(slash[1], 10); // first
    let b = parseInt(slash[2], 10); // second
    const year = parseInt(slash[3], 10);
    let hour = slash[4] ? parseInt(slash[4], 10) : 0;
    const minute = slash[5] ? parseInt(slash[5], 10) : 0;
    const second = slash[6] ? parseInt(slash[6], 10) : 0;
    const ampm = slash[7];
    let month, day;
    if (a > 12) { day = a; month = b; } // day-first
    else if (b > 12) { month = a; day = b; } // month-first
    else { month = a; day = b; } // ambiguous -> assume month/day
    if (ampm) {
      const upper = ampm.toUpperCase();
      if (upper === 'PM' && hour < 12) hour += 12;
      if (upper === 'AM' && hour === 12) hour = 0;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    }
  }
  
  // Fallback generic parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  return null;
}

/**
 * Format date object to YYYY-MM-DD in UTC
 */
function formatDateUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Format date object to HH:mm:ss in UTC
 */
function formatTimeUTC(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/**
 * Set parsed date into date/time inputs
 */
function setParsedDate(which: 'start' | 'end', dateObj: Date) {
  const dateEl = document.getElementById(which + 'Date') as HTMLInputElement;
  const timeEl = document.getElementById(which + 'Time') as HTMLInputElement;
  if (!dateEl || !timeEl) return;
  dateEl.value = formatDateUTC(dateObj);
  timeEl.value = formatTimeUTC(dateObj);
}

/**
 * Handle paste events on date/time inputs
 */
function handleDatePaste(e: ClipboardEvent, which: 'start' | 'end') {
  const text = e.clipboardData?.getData('text') || '';
  if (!text.trim()) return; // let default behavior
  const parsed = parsePastedDate(text.trim());
  if (!parsed) {
    // Try tolerant fallback: Date.parse
    const fallback = new Date(text.trim());
    if (isNaN(fallback.getTime())) return; // allow native paste
    setParsedDate(which, fallback);
    e.preventDefault();
    return;
  }
  setParsedDate(which, parsed);
  e.preventDefault(); // prevent raw text from entering field
}

/**
 * Attach paste handlers to date/time inputs
 */
function attachDatePasteHandlers() {
  (['start', 'end'] as const).forEach(which => {
    const dateEl = document.getElementById(which + 'Date');
    const timeEl = document.getElementById(which + 'Time');
    if (dateEl) dateEl.addEventListener('paste', (e) => handleDatePaste(e as ClipboardEvent, which));
    if (timeEl) timeEl.addEventListener('paste', (e) => handleDatePaste(e as ClipboardEvent, which));
  });
}

/**
 * Initialize time range UI event listeners
 */
export function initTimeRangeUI() {
  // Mode toggle buttons (relative vs absolute)
  Array.from<Element>(document.querySelectorAll('.mode-btn')).forEach(btn => {
    btn.addEventListener('click', () => {
      Array.from<Element>(document.querySelectorAll('.mode-btn')).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      toggleTimeMode();
    });
  });

  // Relative time quick value buttons
  const relativeValueInput = document.getElementById('relativeValue') as HTMLInputElement;
  
  Array.from<Element>(document.querySelectorAll('.relative-quick-btn')).forEach(btn => {
    btn.addEventListener('click', () => {
      // Update active state
      Array.from<Element>(document.querySelectorAll('.relative-quick-btn')).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Update value
      relativeValue = parseInt((btn as HTMLElement).dataset.value || '1', 10);
      if (relativeValueInput) {
        relativeValueInput.value = ''; // Clear custom input
        relativeValueInput.classList.remove('active');
      }
    });
  });

  // Custom relative value input
  if (relativeValueInput) {
    relativeValueInput.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      if (val && val >= 1) {
        relativeValue = val;
        // Deactivate quick buttons when using custom value
        Array.from<Element>(document.querySelectorAll('.relative-quick-btn')).forEach(b => b.classList.remove('active'));
        relativeValueInput.classList.add('active');
      } else {
        relativeValueInput.classList.remove('active');
      }
    });

    // Auto-select on click/focus
    relativeValueInput.addEventListener('click', (e) => {
      (e.target as HTMLInputElement).select();
    });
    relativeValueInput.addEventListener('focus', (e) => {
      (e.target as HTMLInputElement).select();
    });
  }

  // Time unit buttons (minutes, hours, days)
  Array.from<Element>(document.querySelectorAll('.unit-btn')).forEach(btn => {
    btn.addEventListener('click', () => {
      Array.from<Element>(document.querySelectorAll('.unit-btn')).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      relativeUnit = (btn as HTMLElement).dataset.unit as TimeUnit;
    });
  });

  // "Now" buttons for absolute time
  const startNowBtn = document.getElementById('startNowBtn');
  const endNowBtn = document.getElementById('endNowBtn');
  if (startNowBtn) {
    startNowBtn.addEventListener('click', () => setDateTimeToNow('start'));
  }
  if (endNowBtn) {
    endNowBtn.addEventListener('click', () => setDateTimeToNow('end'));
  }

  // Copy start to end button
  const copyBtn = document.getElementById('copyStartToEnd');
  if (copyBtn) {
    copyBtn.addEventListener('click', copyStartToEnd);
  }

  // Attach paste handlers for smart date parsing
  attachDatePasteHandlers();

  // Set max date/time constraints and update periodically
  updateDateTimeMax();
  
  // Initialize mode
  toggleTimeMode();
}
