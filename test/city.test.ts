import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain JavaScript module
import { collectLine, daySet, isArrivalPage, stopId } from '../scripts/lib/collect.mjs';
// @ts-expect-error plain JavaScript module
import { absolute, fetchPage, pool } from '../scripts/lib/site.mjs';
// @ts-expect-error plain JavaScript module
import { parseStopPage as parseA } from '../scripts/lib/parse-a.mjs';
// @ts-expect-error plain JavaScript module
import { parseStopPage as parseB } from '../scripts/lib/parse-b.mjs';

const stopPage = (line: string, minutes: string) => `<html><body>
  <div class="breadcrumb-1">Przystanek: Leśna 01</div>
  <div class="rozklad1"><p>kierunek: <strong>Centrum</strong><br />Linia <strong>${line}</strong></p>
    <table><tr><td colspan="2">Sobota</td></tr><tr><td>godz.</td><td>min.</td></tr>
    <tr><td>6</td><td>${minutes}</td></tr></table></div></body></html>`;

const linePage = `<div class="rozklady"><div class="rozklad1"><p><strong>kierunek: Centrum przystanki:</strong></p>
  <ul><li><a href="/d1-a">Leśna 01</a></li><li>Mickiewicza 01</li></ul></div></div>`;

const serve = (pages: Record<string, string>) =>
  vi.stubGlobal('fetch', async (url: string) => {
    const body = pages[new URL(url).pathname];
    return { ok: body !== undefined, status: body === undefined ? 404 : 200, text: async () => body ?? '' };
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('minutes the parsers must refuse rather than guess', () => {
  // Value: protects=a footnote or typo in a minutes cell stops publication; fails_when=either parser
  //   drops or reinterprets it; why_new=no test covered rejection; seam=none; no_claim=other cell kinds.
  it('both parsers refuse a footnote mark', () => {
    for (const parse of [parseA, parseB]) {
      expect(() => parse(stopPage('D1', '30a'))).toThrow();
      expect(parse(stopPage('D1', '30')).days[0].times).toEqual(['06:30']);
    }
  });
});

describe('reading a line from the city', () => {
  // Value: protects=a line is read from its list and stop pages, with a stable fingerprint;
  //   fails_when=the headsign keeps the bold labels, a page of another line is accepted, or changed
  //   times keep the same fingerprint; why_new=collectLine was untested; seam=none (fetch stubbed);
  //   no_claim=the live site.
  it('collects stops, rejects a page of the wrong line and sees changed times', async () => {
    serve({ '/dkm-legionowo-d1': linePage, '/d1-a': stopPage('D1', '30') });
    const first = await collectLine('D1');
    expect(first.directions[0]).toMatchObject({ headsign: 'Centrum' });
    expect(first.directions[0].stops[1]).toEqual({ name: 'Mickiewicza 01', url: null });

    serve({ '/dkm-legionowo-d1': linePage, '/d1-a': stopPage('D1', '31') });
    const second = await collectLine('D1');
    expect(second.prints.stopList).toBe(first.prints.stopList);
    expect(Object.values(second.prints.pages)).not.toEqual(Object.values(first.prints.pages));

    serve({ '/dkm-legionowo-d1': linePage, '/d1-a': stopPage('D2', '30') });
    await expect(collectLine('D1')).rejects.toThrow('page is for line D2');
  });

  it('names days, stops and arrival pages consistently', () => {
    expect([daySet('Poniedziałek - Piątek'), daySet('Poniedziałek - sobota'), daySet('Sobota ')]).toEqual(['12345', '123456', '6']);
    expect(() => daySet('Wakacje')).toThrow('unknown day label');
    expect(stopId('Osiedle Młodych 01 - końcowy')).toBe(stopId('Osiedle Młodych 01'));
    expect(isArrivalPage({ headsign: 'Przystanek końcowy' })).toBe(true);
    expect(isArrivalPage({ headsign: 'Centrum' })).toBe(false);
  });
});

describe('fetching politely', () => {
  it('never turns a stop name typed as an address into a page to fetch', () => {
    for (const bad of ['http://Polna 02', 'Objazdowa 02', 'https://example.test/x']) expect(absolute(bad)).toBeNull();
    expect(absolute('http://legionowo.pl/d1-a')).toBe('https://legionowo.pl/d1-a');
    expect(absolute('/pl/d1-b')).toBe('https://legionowo.pl/pl/d1-b');
    // As on the live D4 page: relative, no leading slash.
    expect(absolute('d4-pkplegionowo-arena-legionowo02')).toBe('https://legionowo.pl/d4-pkplegionowo-arena-legionowo02');
  });

  it('retries, then reports the address that failed', async () => {
    vi.useFakeTimers();
    let calls = 0;
    vi.stubGlobal('fetch', async () => ({ ok: ++calls > 2, status: 503, text: async () => 'page' }));
    const ok = fetchPage('https://legionowo.pl/x');
    await vi.runAllTimersAsync();
    expect(await ok).toBe('page');

    vi.stubGlobal('fetch', async () => ({ ok: false, status: 500, text: async () => '' }));
    const failing = expect(fetchPage('https://legionowo.pl/y')).rejects.toThrow('/y: HTTP 500');
    await vi.runAllTimersAsync();
    await failing;
  });

  it('keeps the order of results and never runs more than asked at once', async () => {
    let running = 0;
    let most = 0;
    const out = await pool([3, 1, 2, 0], 2, async (n: number) => {
      most = Math.max(most, ++running);
      await new Promise((r) => setTimeout(r, n));
      running -= 1;
      return n * 10;
    });
    expect(out).toEqual([30, 10, 20, 0]);
    expect(most).toBe(2);
  });
});
