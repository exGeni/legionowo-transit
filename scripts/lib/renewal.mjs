// What must hold before a timetable is published for a new validity period.
import { isArrivalPage } from './collect.mjs';

const iso = (date) => date.toISOString().slice(0, 10);
const day = (year, month, number) => iso(new Date(Date.UTC(year, month - 1, number)));

/** Easter Sunday (Gregorian), as a UTC date. */
function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const h = (19 * a + b - Math.floor(b / 4) - Math.floor((b - Math.floor((b + 8) / 25) + 1) / 3) + 15) % 30;
  const l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - (c % 4)) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  return new Date(Date.UTC(year, month - 1, ((h + l - 7 * m + 114) % 31) + 1));
}

/** Polish public holidays of a year. */
export function publicHolidays(year) {
  const sunday = easter(year);
  const after = (days) => iso(new Date(sunday.getTime() + days * 86_400_000));
  return [
    day(year, 1, 1), day(year, 1, 6), after(0), after(1), day(year, 5, 1), day(year, 5, 3), after(49), after(60),
    day(year, 8, 15), day(year, 11, 1), day(year, 11, 11), day(year, 12, 24), day(year, 12, 25), day(year, 12, 26),
  ].sort();
}

/** Holidays between today and the validity date that the calendar does not list. */
export function missingHolidays({ validUntil, unconfirmed }, today) {
  const out = [];
  for (let year = Number(today.slice(0, 4)); year <= Number(validUntil.slice(0, 4)); year++) {
    // The town's pages give no rule for New Year's Eve either.
    out.push(...[...publicHolidays(year), `${year}-12-31`]
      .filter((d) => d >= today && d <= validUntil && !unconfirmed.includes(d)));
  }
  return out;
}

/** Pages with departures whose "Obowiązuje od" date cannot be read. */
export const undated = (pages) =>
  [...pages].filter(([, p]) => !p.validFrom && !isArrivalPage(p)).map(([url]) => `${url}: no validity date`);
