// Collects every line from the city site. Used by build-data (to publish) and by
// check (to compare with what was published).
import { createHash } from 'node:crypto';
import { LINES, NotATimetable, fetchPage, linePageUrl, parseLinePage, pool } from './site.mjs';
import { parseStopPage } from './parse-a.mjs';

const DAY_SETS = {
  'poniedziałek - piątek': '12345',
  'sobota': '6',
  'poniedziałek - sobota': '123456',
  'niedziela': '7',
  'niedziela i święta': '7',
};

export function daySet(label) {
  const key = label.toLowerCase().replace(/\s*[-–]\s*/g, ' - ').replace(/\s+/g, ' ').trim();
  if (!DAY_SETS[key]) throw new Error(`unknown day label "${label}"`);
  return DAY_SETS[key];
}

export const stopId = (name) =>
  name.toLowerCase().replace(/ - końcowy$/, '')
    // The city writes both "Os." and "Osiedle" for the same post.
    .replace(/\bosiedle\b/g, 'os.').replace(/ł/g, 'l').normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const fingerprint = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);

/** The page that marks a final stop carries arrival times, not departures. */
export const isArrivalPage = (page) => /przystanek końcowy/i.test(page.headsign ?? '');

/** A page that was fetched but no longer reads as before: the city changed something. */
export class Changed extends Error {}

const read = (url, fn) => {
  try {
    return fn();
  } catch (err) {
    // No timetable at all: the comparison could not be made, nothing is known to differ.
    if (err instanceof NotATimetable) throw new Error(`${url}: ${err.message}`);
    throw new Changed(`${url}: ${err.message}`);
  }
};

export async function collectLine(line, { onPage, publishedStopList } = {}) {
  const pageUrl = linePageUrl(line);
  const lineHtml = await fetchPage(pageUrl);
  const directions = read(pageUrl, () => parseLinePage(lineHtml));
  const stopLists = directions.map((d) => ({ headsign: d.headsign, stops: d.stops }));
  // Seen before any stop page is fetched: a new list is a change even if new pages fail.
  if (publishedStopList && fingerprint(stopLists) !== publishedStopList) {
    throw new Changed(`${pageUrl}: list of stops differs`);
  }
  const urls = [...new Set(directions.flatMap((d) => d.stops.map((s) => s.url)).filter(Boolean))];
  const pages = new Map(
    await pool(urls, 4, async (url) => {
      const html = await fetchPage(url);
      const page = read(url, () => parseStopPage(html));
      if (page.line !== line) throw new Changed(`${url}: page is for line ${page.line}, not ${line}`);
      onPage?.(url, html, page);
      return [url, page];
    }),
  );
  const prints = { stopList: fingerprint(stopLists), pages: {} };
  for (const [url, page] of pages) {
    prints.pages[url] = fingerprint({ days: page.days, validFrom: page.validFrom, arrivals: isArrivalPage(page) });
  }
  return { line, directions, pages, prints };
}

export async function collectAll(options) {
  const out = [];
  for (const line of LINES) out.push(await collectLine(line, options));
  return out;
}
