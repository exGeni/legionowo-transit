// First timetable parser: walks the DOM of a stop page.
import * as cheerio from 'cheerio';
import { clean } from './site.mjs';

const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca',
  'sierpnia', 'września', 'października', 'listopada', 'grudnia'];

export function parseValidFrom(text) {
  const m = clean(text).match(/Obowiązuje:?\s*od\s*(\d{1,2})\s+(\p{L}+)\s+(\d{4})/u);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
  if (!month) return null;
  return `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export function parseStopPage(html) {
  const $ = cheerio.load(html);
  // Usually the timetable sits in div.rozklad1; a few pages put it straight into the
  // page body. Either way its parent holds the "kierunek / Linia" heading.
  let block = $('div.rozklad1').filter((_, el) => /Linia/.test($(el).text())).first();
  if (!block.length) block = $('p').filter((_, el) => /kierunek:[\s\S]*Linia/.test($(el).text())).first().parent();
  if (!block.length) throw new Error('stop page: no timetable block');

  // Direction and line are bold, outside the tables and the side stop list.
  const strongs = block.find('strong')
    .filter((_, e) => !$(e).closest('table, .slupek').length)
    .toArray()
    .map((e) => clean($(e).text()))
    .filter(Boolean);
  const line = strongs.find((s) => /^D\dE?$/i.test(s));
  const headsign = strongs.find((s) => s !== line);

  const days = [];
  block
    .find('table')
    .filter((_, t) => $(t).find('table').length === 0)
    .each((_, table) => {
      const rows = $(table)
        .find('tr')
        .toArray()
        .map((tr) => $(tr).children('td,th').toArray().map((td) => clean($(td).text())));
      const header = rows.findIndex((r) => /^godz/i.test(r[0] ?? ''));
      if (header < 0) return;
      if (header === 0) throw new Error('stop page: a day table without a label');
      const label = clean(rows.slice(0, header).map((r) => r.join(' ')).join(' '));
      const times = [];
      for (const [hour, minutes, ...extra] of rows.slice(header + 1)) {
        if (!/^\d{1,2}$/.test(hour ?? '') || !minutes) continue;
        if (extra.some(Boolean)) throw new Error(`stop page: unexpected extra cells at hour ${hour}`);
        if (!/^(\d{2}[\s,]*)+$/.test(minutes)) {
          throw new Error(`stop page: unreadable minutes "${minutes}" at hour ${hour}`);
        }
        for (const mm of minutes.match(/\d{2}/g)) times.push(`${hour.padStart(2, '0')}:${mm}`);
      }
      days.push({ label, times: times.sort() });
    });
  if (!days.length || days.every((d) => !d.times.length)) throw new Error('stop page: no times');

  const crumb = $('body').text().match(/Przystanek:\s*([^\n\r|]+)/);
  return {
    line: line?.toUpperCase(),
    headsign,
    stopName: crumb ? clean(crumb[1]) : null,
    validFrom: parseValidFrom(block.text()),
    days,
  };
}
