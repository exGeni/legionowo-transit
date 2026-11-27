// Reading the city's timetable pages. Source of truth: the line pages (ordered stop
// lists per direction) and the per-stop pages they link to.
import * as cheerio from 'cheerio';

export const SITE = 'https://legionowo.pl';
export const LINES = ['D1', 'D2', 'D3', 'D4', 'D5E'];
export const linePageUrl = (line) => `${SITE}/dkm-legionowo-${line.toLowerCase()}`;

/** The page answered but holds no timetable at all: a maintenance or error page, not a change. */
export class NotATimetable extends Error {}

export const clean = (s) => s.replace(/[ \s]+/g, ' ').trim();

export async function fetchPage(url, { tries = 3 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': 'timetable-check' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw new Error(`${url}: ${last.message}`);
}

/** Runs fn over items, a few at a time, so the city's server is not hammered. */
export async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

/**
 * The city links some stops over plain http; read them over https. A few links are
 * broken (a stop name typed where the address belongs): those count as no link.
 */
export const absolute = (href) => {
  // An address has no spaces; a stop name typed in its place does. Some real links are
  // relative without a leading slash, so that alone must not disqualify one.
  if (/\s/.test(href.trim())) return null;
  const url = URL.parse(href, SITE);
  if (!url || url.hostname.replace(/^www\./, '') !== 'legionowo.pl') return null;
  url.protocol = 'https:';
  return url.href;
};

/** @returns [{ headsign, stops: [{ name, url|null }] }] in the order printed. */
export function parseLinePage(html) {
  const $ = cheerio.load(html);
  const directions = $('div.rozklady')
    .find('ul')
    .toArray()
    .map((ul) => {
      const box = $(ul).parent();
      // Some line pages put the whole "kierunek: X przystanki:" phrase in bold.
      const headsign = clean(box.find('p strong').first().text().replace(/kierunek:|przystanki:/gi, ''));
      const stops = $(ul)
        .children('li')
        .toArray()
        .map((li) => {
          const href = $(li).find('a[href]').first().attr('href');
          return { name: clean($(li).text()), url: href ? absolute(href) : null };
        })
        .filter((s) => s.name);
      return { headsign, stops };
    })
    .filter((d) => d.stops.length > 1);
  if (!directions.length) throw new NotATimetable('line page: no stop lists found');
  // Skipping it would silently remove a whole direction from the line.
  if (directions.some((d) => !d.headsign)) throw new Error('line page: a stop list without a readable direction');
  return directions;
}
