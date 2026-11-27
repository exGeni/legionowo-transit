// When to leave home. All clock times are Warsaw times, whatever the phone is set to.
import calendar from './calendar.json';
import type { Timetable } from './types';

export const SAFETY_MINUTES = 2;
const TZ = 'Europe/Warsaw';
const MINUTE = 60_000;
const SEARCH_DAYS = 8;

// Dates for which the city's pages give no rule (public holidays, New Year's Eve) live
// next to the validity date in calendar.json, so renewing one means looking at the other.
export const UNCONFIRMED_DATES = new Set(calendar.unconfirmed);

const parts = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function wall(instant: number) {
  const p = Object.fromEntries(parts.formatToParts(instant).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    asUtc: Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!),
  };
}

export const warsawDate = (instant: number) => wall(instant).date;

/** The instant at which a Warsaw clock shows `time` on `date`. */
export function warsawInstant(date: string, time: string): number {
  const naive = Date.parse(`${date}T${time}:00Z`);
  const offset = (at: number) => wall(at).asUtc - Math.floor(at / 1000) * 1000;
  const first = naive - offset(naive);
  return naive - offset(first);
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** 1 = Monday ... 7 = Sunday. */
export const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay() || 7;

export interface Departure {
  line: string;
  headsign: string;
  date: string;
  time: string;
  at: number;
  suspect?: boolean;
}

export interface Search {
  departures: Departure[];
  /** Set when the search had to stop at a date the city gives no rule for. */
  unconfirmed: string | null;
}

/** Upcoming departures from one platform, including those you can no longer reach. */
export function upcoming(
  table: Timetable, stop: string, now: number,
  { line, towards, count = 6 }: { line?: string | null; towards?: string | null; count?: number } = {},
): Search {
  const today = warsawDate(now);
  const found: Departure[] = [];
  for (let i = 0; i < SEARCH_DAYS && found.length < count; i++) {
    const date = addDays(today, i);
    if (UNCONFIRMED_DATES.has(date)) return { departures: found.slice(0, count), unconfirmed: date };
    const day = String(weekday(date));
    const ofDay: Departure[] = [];
    for (const l of table.lines) {
      if (line && l.id !== line) continue;
      for (const direction of l.directions) {
        if (towards && direction.headsign !== towards) continue;
        for (const entry of direction.stops) {
          if (entry.stop !== stop || !entry.days) continue;
          for (const [days, times] of Object.entries(entry.days)) {
            if (!days.includes(day)) continue;
            for (const time of times) {
              const at = warsawInstant(date, time);
              if (at >= now) ofDay.push({ line: l.id, headsign: direction.headsign, date, time, at, suspect: entry.suspect });
            }
          }
        }
      }
    }
    found.push(...ofDay.sort((a, b) => a.at - b.at || a.line.localeCompare(b.line)));
  }
  return { departures: found.slice(0, count), unconfirmed: null };
}

export type Advice =
  | { kind: 'in'; minutes: number }
  | { kind: 'now' }
  | { kind: 'tight' }
  | { kind: 'later-day' };

/** Walking alone still gets you there: otherwise the departure is missed. */
export const reachable = (dep: Departure, now: number, walk: number) => now <= dep.at - walk * MINUTE;

export function advice(dep: Departure, now: number, walk: number): Advice {
  if (dep.date !== warsawDate(now)) return { kind: 'later-day' };
  const left = dep.at - (walk + SAFETY_MINUTES) * MINUTE - now;
  if (left >= MINUTE) return { kind: 'in', minutes: Math.floor(left / MINUTE) };
  if (left >= 0) return { kind: 'now' };
  return { kind: 'tight' };
}

export function plan(table: Timetable, stop: string, now: number, walk: number, line?: string | null, towards?: string | null) {
  const { departures, unconfirmed } = upcoming(table, stop, now, { line, towards, count: 40 });
  const next = departures.find((d) => reachable(d, now, walk)) ?? null;
  const missed = departures.filter((d) => !reachable(d, now, walk) && d.date === warsawDate(now));
  const list = departures.filter((d) => reachable(d, now, walk)).slice(1, 5);
  return { next, missed: missed.at(-1) ?? null, list, unconfirmed };
}

export const isExpired = (table: Timetable, now: number) => warsawDate(now) > table.validUntil;
export const expiresSoon = (table: Timetable, now: number) =>
  !isExpired(table, now) && addDays(warsawDate(now), 14) >= table.validUntil;
