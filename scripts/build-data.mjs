// Reads the city's stop pages, cross-checks two independently written parsers and
// writes public/data/timetable.json and public/data/sources.json.
// Run: npm run data   (writes nothing when any page disagrees or cannot be read)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { assemble } from './lib/assemble.mjs';
import { collectAll, daySet, isArrivalPage } from './lib/collect.mjs';
import { SITE } from './lib/site.mjs';
import { missingHolidays, undated } from './lib/renewal.mjs';
import { parseStopPage as parseB } from './lib/parse-b.mjs';

// Measured on https://legionowo.pl/dkmlegionowo; D2 gets dark text for contrast.
const COLORS = {
  D1: ['#168FD0', '#FFFFFF'], D2: ['#F39A00', '#1A1A1A'], D3: ['#3B9D3B', '#FFFFFF'],
  D4: ['#273B83', '#FFFFFF'], D5E: ['#BD1522', '#FFFFFF'],
};
// Validity and the dates without a rule are kept together; see src/schedule.ts.
const calendar = JSON.parse(readFileSync('src/calendar.json', 'utf8'));
const VALID_UNTIL = calendar.validUntil;
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(new Date());
if (VALID_UNTIL < today) {
  console.error(`src/calendar.json: validUntil ${VALID_UNTIL} is already past; nothing written.`);
  process.exit(1);
}
const holidays = missingHolidays(calendar, today);
if (holidays.length) {
  console.error(`src/calendar.json: public holidays not listed as unconfirmed: ${holidays.join(', ')}; nothing written.`);
  process.exit(1);
}

const disagreements = [];
const timesOf = (page) =>
  JSON.stringify([page.line, page.validFrom, isArrivalPage(page),
    page.days.map((d) => [daySet(d.label), [...d.times].sort()]).sort()]);

const collected = await collectAll({
  onPage: (url, html, a) => {
    let b;
    try {
      b = parseB(html);
    } catch (err) {
      disagreements.push(`${url}: second parser failed: ${err.message}`);
      return;
    }
    if (timesOf(a) !== timesOf(b)) disagreements.push(`${url}: parsers disagree`);
  },
});

const { stops, lines, suspects, notes, departures } = assemble(collected, COLORS);

if (disagreements.length) {
  console.error(disagreements.join('\n'));
  console.error(`\n${disagreements.length} disagreement(s); nothing written.`);
  process.exit(1);
}

const unreadable = collected.flatMap((c) => undated(c.pages));
if (unreadable.length) {
  console.error(unreadable.slice(0, 5).join('\n'));
  console.error(`\n${unreadable.length} page(s) without a readable validity date; nothing written.`);
  process.exit(1);
}
// A timetable published early must not replace the one in force today.
const early = collected.flatMap((c) =>
  [...c.pages].filter(([, p]) => p.validFrom > today).map(([url, p]) => `${url}: valid from ${p.validFrom}`));
if (early.length) {
  console.error(early.slice(0, 5).join('\n'));
  console.error(`\n${early.length} page(s) are not in force yet; nothing written.`);
  process.exit(1);
}
const verifiedAt = new Date().toISOString();
const timetable = {
  schema: 1,
  source: { name: 'Urząd Miasta Legionowo', url: `${SITE}/dkmlegionowo` },
  obtainedAt: today,
  verifiedAgainstSite: today,
  verifiedAt,
  validUntil: VALID_UNTIL,
  processing:
    'Godziny odczytane skryptem ze stron przystanków, porównane drugim niezależnym odczytem i zapisane jako JSON. Godzin nie wyliczano ani nie poprawiano. "validFrom" to data "Obowiązuje od" ze strony.',
  dayKeys: 'Klucze "days" to numery dni tygodnia: 1 = poniedziałek ... 7 = niedziela.',
  stops,
  lines,
};
const sources = {
  verifiedAgainstSite: today,
  verifiedAt,
  lines: Object.fromEntries(collected.map((c) => [c.line, c.prints])),
};

mkdirSync('public/data', { recursive: true });
// Indented so that a change can be reviewed line by line before merging.
writeFileSync('public/data/timetable.json', `${JSON.stringify(timetable, null, 1)}\n`);
writeFileSync('public/data/sources.json', `${JSON.stringify(sources, null, 1)}\n`);

const pageCount = collected.reduce((n, c) => n + c.pages.size, 0);
console.log(`pages=${pageCount} stops=${Object.keys(stops).length} departures=${departures} disagreements=0`);
if (suspects.length) {
  console.log(`contradictions in the city's tables (${suspects.length}):`);
  for (const text of suspects) console.log(`  ${text}`);
}
if (notes.length) console.log(`notes (${notes.length}):\n  ${notes.join('\n  ')}`);
