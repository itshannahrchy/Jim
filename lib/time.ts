// Time-zone helpers without extra libraries. All timestamps are stored in UTC;
// "today", "this morning" etc. are worked out in the user's own time zone.

export const FALLBACK_TZ = "Asia/Kolkata";

export function isValidTz(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function parts(date: Date, tz: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const x of dtf.formatToParts(date)) p[x.type] = x.value;
  return p;
}

/** Minutes the zone is ahead of UTC at the given instant. */
function offsetMinutes(date: Date, tz: string): number {
  const p = parts(date, tz);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/**
 * Converts "YYYY-MM-DD", "YYYY-MM-DDTHH:mm" or "YYYY-MM-DDTHH:mm:ss" in the
 * user's zone to a UTC Date. Strings that already carry "Z" or an offset are
 * parsed as-is. Returns null for anything unparseable.
 */
export function localToUtc(input: string, tz: string): Date | null {
  const s = input.trim();
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  let utc = guess - offsetMinutes(new Date(guess), tz) * 60000;
  const second = guess - offsetMinutes(new Date(utc), tz) * 60000;
  if (second !== utc) utc = second; // daylight-saving edge
  return new Date(utc);
}

/** "YYYY-MM-DD" for the instant in the given zone. */
export function localDate(date: Date, tz: string): string {
  const p = parts(date, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** UTC range [start, end) covering local calendar day(s). */
export function dayRangeUtc(dateStr: string, tz: string, days = 1) {
  return {
    start: localToUtc(`${dateStr}T00:00`, tz)!,
    end: localToUtc(`${addDays(dateStr, days)}T00:00`, tz)!,
  };
}

export function formatLocal(date: Date | string, tz: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...opts }).format(new Date(date));
}

/** e.g. "Mon 29 Sep 08:10" */
export function shortStamp(date: Date | string, tz: string): string {
  return formatLocal(date, tz, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).replace(",", "");
}

/** Monday of the week containing dateStr. */
export function weekStart(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(dateStr, -((dow + 6) % 7));
}
