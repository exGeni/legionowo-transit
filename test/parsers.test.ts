import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript module
import { parseStopPage as parseA } from '../scripts/lib/parse-a.mjs';
// @ts-expect-error plain JavaScript module
import { parseStopPage as parseB } from '../scripts/lib/parse-b.mjs';
// @ts-expect-error plain JavaScript module
import { parseLinePage } from '../scripts/lib/site.mjs';

// Cut-down copies of the city's markup. The side list has its own "kierunek:", which
// must never be read as the headsign of the timetable.
const sideList = `
  <div class="rozklad2 slupek">
    <p>kierunek: <strong>Inny kierunek</strong><br />przystanki:</p>
    <ul><li>Mickiewicza 01</li></ul>
  </div>`;

const page = (timetable: string) => `<html><body>
  <div class="breadcrumb-1">Znajdujesz się na: <a href="/pl">Strona główna</a> | <span>Przystanek: Leśna 01</span>
  </div>
  <div id="Main-11">
    <h1>Przystanek: Leśna 01</h1>
    ${timetable}
    ${sideList}
  </div>
</body></html>`;

const heading = '<p>kierunek: <strong>Centrum</strong><br />Linia <strong>D1</strong></p>';
const dayTable = (label: string, rows: [string, string][]) => `
  <table>
    <tr><td colspan="2"><strong><span>${label}</span></strong></td></tr>
    <tr><td><span>godz.</span></td><td><span>min.</span></td></tr>
    ${rows.map(([hour, min]) => `<tr><td>${hour}</td><td>${min}</td></tr>`).join('\n')}
  </table>`;

// Day tables sit side by side inside a layout table, as on the real pages.
const body = `${heading}
  <table><tr>
    <td>${dayTable('Poniedziałek - Piątek', [['6', '30'], ['14', '05, 45']])}</td>
    <td>${dayTable('Sobota', [['7', '15']])}</td>
  </tr></table>
  Obowiązuje: od 2 stycznia 2026 roku`;

const expected = {
  line: 'D1',
  headsign: 'Centrum',
  stopName: 'Leśna 01',
  validFrom: '2026-01-02',
  days: [
    { label: 'Poniedziałek - Piątek', times: ['06:30', '14:05', '14:45'] },
    { label: 'Sobota', times: ['07:15'] },
  ],
};

const parsers = [['first', parseA], ['second', parseB]] as const;

describe("the city's stop page layouts", () => {
  // Value: protects=both parsers read a stop page whose rozklad1 wrapper is nested in itself;
  //   fails_when=either parser rejects the double wrapper or loses line, headsign, validity date or times;
  //   why_new=no test imported either parser; seam=none;
  //   no_claim=the fixture is hand-cut, not a saved copy of a nested city page.
  it('reads a wrapper nested in itself, with both parsers', () => {
    const html = page(`<div class="rozklad1"><div class="rozklad1">${body}</div></div>`);
    for (const [name, parse] of parsers) expect(parse(html), name).toEqual(expected);
  });

  // Value: protects=both parsers read a stop page that has no rozklad1 wrapper at all;
  //   fails_when=either parser requires the wrapper, or takes the headsign from the side stop list;
  //   why_new=no test imported either parser; seam=none;
  //   no_claim=other unwrapped variants (no h1, no rozklad2 list) are not exercised.
  it('reads a timetable put straight into the page body, with both parsers', () => {
    const html = page(body);
    for (const [name, parse] of parsers) expect(parse(html), name).toEqual(expected);
  });
});

describe('stop links on a line page', () => {
  // Value: protects=a mistyped or foreign link leaves the stop listed without a page, and http links are read over https;
  //   fails_when=a broken href is returned as a URL (or throws), the stop is dropped, or http is kept;
  //   why_new=parseLinePage had no test; seam=none;
  //   no_claim=a stop name typed with no "http://" at all still resolves as a relative path and is not covered.
  it('keeps a stop with a broken link, without a page to fetch', () => {
    const html = `<div class="rozklady"><div class="rozklad1">
      <p><strong>kierunek: Centrum przystanki:</strong></p>
      <ul>
        <li><a href="http://legionowo.pl/d1-centrum-lesna01">Leśna 01</a></li>
        <li><a href="http://Objazdowa 02">Objazdowa 02</a></li>
        <li><a href="https://example.test/d1">Dębowa 01</a></li>
        <li><a href="/pl/d1-centrum-wspolna01">Wspólna 01</a></li>
        <li>Mickiewicza 01</li>
      </ul>
    </div></div>`;
    expect(parseLinePage(html)).toEqual([{
      headsign: 'Centrum',
      stops: [
        { name: 'Leśna 01', url: 'https://legionowo.pl/d1-centrum-lesna01' },
        { name: 'Objazdowa 02', url: null },
        { name: 'Dębowa 01', url: null },
        { name: 'Wspólna 01', url: 'https://legionowo.pl/pl/d1-centrum-wspolna01' },
        { name: 'Mickiewicza 01', url: null },
      ],
    }]);
  });
});
