import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain JavaScript module
import { Changed, collectLine } from '../scripts/lib/collect.mjs';
// @ts-expect-error plain JavaScript module
import { place } from '../scripts/lib/place.mjs';
// @ts-expect-error plain JavaScript module
import { missingHolidays, publicHolidays, undated } from '../scripts/lib/renewal.mjs';
import { matches, type Platform } from '../src/platforms';
import { upcoming, warsawInstant } from '../src/schedule';
import type { Timetable } from '../src/types';

const serve = (pages: Record<string, string>) =>
  vi.stubGlobal('fetch', async (url: string) => {
    const body = pages[new URL(url).pathname];
    return { ok: body !== undefined, status: body === undefined ? 404 : 200, text: async () => body ?? '' };
  });

afterEach(() => vi.unstubAllGlobals());

const list = (heading: string) => `<div class="rozklady"><div><p><strong>${heading}</strong></p>
  <ul><li><a href="/d1-a">A 01</a></li><li>Z 01</li></ul></div>`;

describe('a city page that is not a timetable', () => {
  const failure = async () => collectLine('D1').then(() => null, (error: Error) => error);

  it('counts as "could not compare", not as a change', async () => {
    const maintenance = '<html><body><h1>Przerwa techniczna</h1></body></html>';
    serve({ '/dkm-legionowo-d1': maintenance });
    expect(await failure()).not.toBeInstanceOf(Changed);
    serve({ '/dkm-legionowo-d1': `${list('Centrum')}</div>`, '/d1-a': maintenance });
    const stopPage = await failure();
    expect(stopPage?.message).toContain('no timetable block');
    expect(stopPage).not.toBeInstanceOf(Changed);
  });

  it('never drops a direction whose heading cannot be read', async () => {
    const both = `${list('Centrum')}<div><p></p><ul><li>Z 01</li><li>A 01</li></ul></div></div>`;
    serve({ '/dkm-legionowo-d1': both });
    const error = await failure();
    expect(error).toBeInstanceOf(Changed);
    expect(error?.message).toContain('without a readable direction');
  });
});

describe('search', () => {
  it('finds "Os." and "Osiedle" while either is still being typed', () => {
    const stop = (name: string) => ({ name, services: [] }) as unknown as Platform;
    for (const name of ['Os. Młodych 01', 'Osiedle Młodych 01']) {
      for (const typed of ['os', 'os.', 'osied', 'osiedle', 'osiedle mł', 'os. mlodych', 'młodych']) {
        expect(matches(stop(name), typed), `${typed} / ${name}`).toBe(true);
      }
    }
  });
});

describe('renewing the timetable', () => {
  it('knows the public holidays, moving ones included', () => {
    expect(publicHolidays(2027)).toEqual(expect.arrayContaining(['2027-03-28', '2027-03-29', '2027-05-16', '2027-05-27', '2027-12-24']));
  });

  it('asks for every holiday up to the validity date, and only those', () => {
    const calendar = { validUntil: '2027-01-06', unconfirmed: ['2026-12-24', '2026-12-25', '2026-12-26'] };
    expect(missingHolidays(calendar, '2026-11-27')).toEqual(['2027-01-01', '2027-01-06']);
  });

  it('names pages with departures but no readable validity date', () => {
    const pages = new Map([['a', { validFrom: null, headsign: 'Centrum' }], ['b', { validFrom: '2026-01-02' }],
      ['c', { validFrom: null, headsign: 'Przystanek końcowy' }]]);
    expect(undated(pages)).toEqual(['a: no validity date']);
  });

  it('promises nothing past the validity date', () => {
    const table = {
      validUntil: '2026-11-27',
      lines: [{ id: 'D1', directions: [{ headsign: 'Centrum', stops: [{ stop: 'a', days: { '1234567': ['08:00'] } }] }] }],
    } as unknown as Timetable;
    const found = upcoming(table, 'a', warsawInstant('2026-11-27', '07:00'));
    expect(found.departures.map((d) => d.date)).toEqual(['2026-11-27']);
    expect(found.unconfirmed).toBe('2026-11-28');
    // A list that has expired as a whole is still shown, with the screen's own warning.
    expect(upcoming(table, 'a', warsawInstant('2026-11-29', '07:00')).departures.length).toBeGreaterThan(0);
  });
});

describe('placing stops on the map', () => {
  const table = {
    stops: { t: { name: 'Osiedle Młodych 01' }, n: { name: 'Orzechowa 01' }, d: { name: 'Dębowa 01' }, x: { name: 'Nigdzie 01' } },
    lines: [{ id: 'D2', directions: [{ stops: [{ stop: 't' }, { stop: 'n' }, { stop: 'd' }, { stop: 'x' }] }] }],
  };
  const node = (name: string, lat: number, platform = true) => ({ name, lat, lon: 20.9, platform });

  it('takes the post from the line route, prefers the kerb, and refuses two places of one name', () => {
    const { geo, unverified } = place(table, {
      nodes: [node('Orzechowa 01', 52.4), node('Dębowa 01', 52.401), node('Dębowa 01', 52.41)],
      members: { D2: { 1: node('Os. Młodych 01', 52.4001, false), 2: node('Os. Młodych 01', 52.4002) } },
    });
    expect(geo.t).toEqual([52.4002, 20.9]);
    expect(geo.n).toEqual([52.4, 20.9]);
    expect(unverified.x).toContain('no OpenStreetMap stop');
    expect(geo.d).toBeDefined();
  });

  it('does not choose between two places on one route', () => {
    const { geo, unverified } = place(table, {
      nodes: [],
      members: { D2: { 1: node('Dębowa 01', 52.4), 2: node('Dębowa 01', 52.45) } },
    });
    expect(geo.d).toBeUndefined();
    expect(unverified.d).toContain('two places');
  });
});
