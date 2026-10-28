/**
 * Time zones without moment: what Grafana's dateTimeFormat, dateTimeForTimeZone, dateMath and
 * timeZoneAbbrevation did for the page, on top of Intl.
 *
 * A time zone is "utc", "browser" (the machine's zone) or an IANA name such as "Europe/Moscow".
 */
export type TimeZone = string;

/** The IANA name, or undefined for the machine's own zone. */
function zoneOf(timeZone: TimeZone): string | undefined {
  if (!timeZone || timeZone === 'browser' || timeZone === 'default') {
    return undefined;
  }
  return timeZone === 'utc' ? 'UTC' : timeZone;
}

const partFormatters = new Map<string, Intl.DateTimeFormat>();

function partFormatter(zone: string): Intl.DateTimeFormat {
  let f = partFormatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    partFormatters.set(zone, f);
  }
  return f;
}

// Offsets change on whole hours (or half hours, a handful of zones): one lookup per half hour.
const BUCKET = 30 * 60 * 1000;
const offsetCache = new Map<string, Map<number, number>>();

/** Offset of `zone` from UTC at `ms`, in millis (Moscow: +3h). */
function zoneOffset(ms: number, zone: string): number {
  if (zone === 'UTC') {
    return 0;
  }
  let cache = offsetCache.get(zone);
  if (!cache) {
    cache = new Map();
    offsetCache.set(zone, cache);
  }
  const bucket = Math.floor(ms / BUCKET);
  let offset = cache.get(bucket);
  if (offset === undefined) {
    const at = bucket * BUCKET;
    const p: Record<string, number> = {};
    for (const part of partFormatter(zone).formatToParts(at)) {
      if (part.type !== 'literal') {
        p[part.type] = Number(part.value);
      }
    }
    offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - at;
    if (cache.size > 5000) {
      cache.clear();
    }
    cache.set(bucket, offset);
  }
  return offset;
}

export interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

/** The wall-clock time in `timeZone` at `ms`. */
export function wallTime(ms: number, timeZone: TimeZone): WallTime {
  const zone = zoneOf(timeZone);
  if (zone === undefined) {
    const d = new Date(ms);
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
      hour: d.getHours(),
      minute: d.getMinutes(),
      second: d.getSeconds(),
      millisecond: d.getMilliseconds(),
    };
  }
  const d = new Date(ms + zoneOffset(ms, zone));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    millisecond: d.getUTCMilliseconds(),
  };
}

/** Wall-clock time in `timeZone` → epoch millis; undefined for a date that does not exist (Feb 30). */
export function fromWallTime(timeZone: TimeZone, t: WallTime): number | undefined {
  const asUtc = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second, t.millisecond);
  const check = new Date(asUtc);
  if (Number.isNaN(asUtc) || check.getUTCDate() !== t.day || check.getUTCMonth() !== t.month - 1) {
    return undefined;
  }
  const zone = zoneOf(timeZone);
  if (zone === undefined) {
    const d = new Date(t.year, t.month - 1, t.day, t.hour, t.minute, t.second, t.millisecond);
    d.setFullYear(t.year);
    return d.getTime();
  }
  let ms = asUtc - zoneOffset(asUtc, zone);
  // Around a DST change the offset at the result can differ from the first guess.
  const second = asUtc - zoneOffset(ms, zone);
  if (second !== ms) {
    ms = second;
  }
  return ms;
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** Formats with YYYY, MM, DD, HH, mm, ss and SSS, e.g. "YYYY-MM-DD HH:mm:ss". */
export function dateTimeFormat(ms: number, timeZone: TimeZone, format: string): string {
  if (!Number.isFinite(ms)) {
    return '';
  }
  const t = wallTime(ms, timeZone);
  return format.replace(/YYYY|MM|DD|HH|mm|ss|SSS/g, (token) => {
    switch (token) {
      case 'YYYY':
        return pad(t.year, 4);
      case 'MM':
        return pad(t.month);
      case 'DD':
        return pad(t.day);
      case 'HH':
        return pad(t.hour);
      case 'mm':
        return pad(t.minute);
      case 'ss':
        return pad(t.second);
      default:
        return pad(t.millisecond, 3);
    }
  });
}

const nameFormatters = new Map<string, Intl.DateTimeFormat>();

/** A short name for the zone at that moment: "UTC", "GMT+3", "PST". */
export function timeZoneAbbreviation(ms: number, timeZone: TimeZone): string {
  const zone = zoneOf(timeZone);
  if (zone === 'UTC') {
    return 'UTC';
  }
  const key = zone ?? '';
  let f = nameFormatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' });
    nameFormatters.set(key, f);
  }
  return f.formatToParts(ms).find((p) => p.type === 'timeZoneName')?.value ?? key;
}

/** "UTC+03:00" for a zone at a moment. */
export function formatOffset(ms: number, timeZone: TimeZone): string {
  const zone = zoneOf(timeZone);
  const offset = zone === undefined ? -new Date(ms).getTimezoneOffset() * 60000 : zoneOffset(ms, zone);
  const minutes = Math.round(Math.abs(offset) / 60000);
  return `UTC${offset < 0 ? '-' : '+'}${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** The machine's own zone, e.g. "Europe/Moscow". */
export function browserZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Every IANA zone the runtime knows. */
export function allTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  return intl.supportedValuesOf?.('timeZone') ?? ['UTC'];
}

const UNIT_MS: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };

/**
 * Grafana's date math: now, now-5m, now-1h/h, now/d. Units s, m, h, d, w, M and y; "/unit" rounds
 * down to the start of the unit in the zone (or up to its end with roundUp).
 */
export function parseDateMath(text: string, roundUp: boolean, timeZone: TimeZone, now = Date.now()): number | undefined {
  const m = /^now(.*)$/.exec(text.trim());
  if (!m) {
    return undefined;
  }
  let ms = now;
  const ops = m[1].replace(/\s+/g, '');
  const re = /([+-])(\d+)([smhdwMy])|\/([smhdwMy])/gy;
  let pos = 0;
  while (pos < ops.length) {
    re.lastIndex = pos;
    const op = re.exec(ops);
    if (!op) {
      return undefined;
    }
    pos = re.lastIndex;
    if (op[4]) {
      ms = roundTo(ms, op[4], roundUp, timeZone);
      continue;
    }
    const amount = Number(op[2]) * (op[1] === '-' ? -1 : 1);
    const unit = op[3];
    if (unit === 'M' || unit === 'y') {
      const t = wallTime(ms, timeZone);
      const months = t.month - 1 + amount * (unit === 'y' ? 12 : 1);
      const year = t.year + Math.floor(months / 12);
      const month = (((months % 12) + 12) % 12) + 1;
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      ms = fromWallTime(timeZone, { ...t, year, month, day: Math.min(t.day, lastDay) }) ?? ms;
    } else {
      ms += amount * UNIT_MS[unit];
    }
  }
  return ms;
}

function roundTo(ms: number, unit: string, up: boolean, timeZone: TimeZone): number {
  const t = wallTime(ms, timeZone);
  const start: WallTime = { ...t, millisecond: 0 };
  switch (unit) {
    case 'y':
      start.month = 1;
    // falls through
    case 'M':
      start.day = 1;
    // falls through
    case 'd':
      start.hour = 0;
    // falls through
    case 'h':
      start.minute = 0;
    // falls through
    case 'm':
      start.second = 0;
      break;
    case 'w': {
      // Weeks start on Monday, as in Grafana's ISO weeks.
      const weekday = (new Date(Date.UTC(t.year, t.month - 1, t.day)).getUTCDay() + 6) % 7;
      const monday = new Date(Date.UTC(t.year, t.month - 1, t.day - weekday));
      Object.assign(start, {
        year: monday.getUTCFullYear(),
        month: monday.getUTCMonth() + 1,
        day: monday.getUTCDate(),
        hour: 0,
        minute: 0,
        second: 0,
      });
      break;
    }
  }
  const from = fromWallTime(timeZone, start) ?? ms;
  if (!up) {
    return from;
  }
  const next = parseDateMath(`now+1${unit}`, false, timeZone, from) ?? from;
  return next - 1;
}
