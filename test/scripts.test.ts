// The hand-run data scripts, run as they are in a scratch folder with the network replaced
// by a preload. Added by /gstack-ship test coverage audit.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript module
import { publicHolidays } from '../scripts/lib/renewal.mjs';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

function sandbox(fetchStub: string) {
  const dir = mkdtempSync(join(tmpdir(), 'script-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'stub.mjs'), fetchStub);
  const put = (path: string, value: unknown) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), JSON.stringify(value));
  };
  const read = (path: string) => JSON.parse(readFileSync(join(dir, path), 'utf8'));
  const run = (script: string, env: Record<string, string> = {}) =>
    spawnSync(process.execPath, ['--import', pathToFileURL(join(dir, 'stub.mjs')).href, resolve(script)],
      { cwd: dir, env: { ...process.env, ...env }, encoding: 'utf8' });
  return { dir, put, read, run };
}

describe('publishing a timetable (npm run data)', () => {
  const city = `globalThis.fetch = async (url) => {
    const path = new URL(url).pathname;
    const line = (path.match(/d(\\d)(e?)/) ?? []).slice(1).join('').toUpperCase();
    const body = path.startsWith('/dkm-legionowo-')
      ? '<div class="rozklady"><div><p><strong>Centrum</strong></p><ul><li><a href="/d' + line.toLowerCase() + '-a">A 01</a></li><li>Z 01</li></ul></div></div>'
      : '<div class="breadcrumb-1">Przystanek: A 01</div><div class="rozklad1"><p>kierunek: <strong>Centrum</strong> Linia <strong>D' + line + '</strong></p><table><tr><td>Sobota</td></tr><tr><td>godz.</td><td>min.</td></tr><tr><td>6</td><td>30</td></tr></table><p>' + (process.env.VALIDITY ?? '') + '</p></div>';
    return { ok: true, status: 200, text: async () => body };
  };`;

  // Value: protects=nothing is published while a holiday is unlisted or a page has no validity date;
  //   fails_when=build-data stops calling either guard or writes despite it;
  //   why_new=only the helper functions are tested, not that the script obeys them; seam=none;
  //   no_claim=the live site (stand-in pages).
  it('writes nothing until holidays are listed and every page has a validity date', { timeout: 120_000 }, () => {
    const s = sandbox(city);
    const year = new Date().getUTCFullYear();
    const calendar = { validUntil: `${year + 1}-12-31`, unconfirmed: [year, year + 1].flatMap((y) => [...publicHolidays(y), `${y}-12-31`]) };
    const dated = { VALIDITY: 'Obowiązuje od 2 stycznia 2026' };
    const written = () => existsSync(join(s.dir, 'public/data/timetable.json'));

    s.put('src/calendar.json', { ...calendar, validUntil: `${year - 1}-12-31` });
    const past = s.run('scripts/build-data.mjs', dated);
    expect([past.status, written()]).toEqual([1, false]);
    expect(past.stderr).toContain('already past');

    s.put('src/calendar.json', { ...calendar, validUntil: `31.12.${year + 1}` });
    const misspelt = s.run('scripts/build-data.mjs', dated);
    expect([misspelt.status, written()]).toEqual([1, false]);
    expect(misspelt.stderr).toContain('YYYY-MM-DD');

    s.put('src/calendar.json', { ...calendar, unconfirmed: [] });
    const holidays = s.run('scripts/build-data.mjs', dated);
    expect([holidays.status, written()]).toEqual([1, false]);
    expect(holidays.stderr).toContain('public holidays not listed');

    s.put('src/calendar.json', calendar);
    const undated = s.run('scripts/build-data.mjs');
    expect([undated.status, written()]).toEqual([1, false]);
    expect(undated.stderr).toContain('without a readable validity date');

    const good = s.run('scripts/build-data.mjs', dated);
    expect([good.status, written()], good.stderr).toEqual([0, true]);
  });
});

describe('building the map data (scripts/osm.mjs)', () => {
  const map = `globalThis.fetch = async (url) => {
    const stop = (id, lat, name, tags) => ({ type: 'node', id, lat, lon: 20.9, tags: { name, ...tags } });
    const answer = (elements) => ({ ok: true, status: 200, json: async () => ({ elements }) });
    // The whole Legionowo box is too big for the server: it must be split.
    if (url.includes('bbox=20.87000,52.37500,21.01000,52.44500')) return { ok: false, status: 400 };
    const b = stop(2, 52.401, 'B 01', { public_transport: 'stop_position' });
    if (url.includes('map.json')) return answer([
      stop(1, 52.4, 'A 01', { highway: 'bus_stop' }), b, stop(3, 52.402, 'C 01', { amenity: 'bench' }),
      { type: 'relation', id: 9, tags: { route: 'bus', ref: 'D4' } }]);
    return answer([
      { type: 'node', id: 11, lat: 52.4, lon: 20.9 }, { type: 'node', id: 12, lat: 52.401, lon: 20.901 }, b,
      { type: 'way', id: 21, nodes: [11, 12] }, { type: 'way', id: 22, nodes: [12, 11] },
      { type: 'relation', id: 9, members: [{ type: 'way', ref: 21, role: '' }, { type: 'way', ref: 22, role: 'platform' },
        { type: 'node', ref: 2, role: 'stop' }] }]);
  };`;

  // Value: protects=a line's drawn path is its mapped ways plus the routed parts, and only bus stops get points;
  //   fails_when=routed paths replace or drop mapped ones, D5E is skipped, platform ways are drawn, or a non-stop is placed;
  //   why_new=osm.mjs had no test; seam=none (fetch replaced by a preload);
  //   no_claim=live OpenStreetMap responses.
  it('joins mapped and routed paths and places only bus stops', { timeout: 60_000 }, () => {
    const s = sandbox(map);
    const line = (id: string) => ({ id, color: '#000', directions: [{ stops: [{ stop: 'a' }, { stop: 'b' }, { stop: 'c' }] }] });
    s.put('public/data/timetable.json', {
      stops: { a: { name: 'A 01' }, b: { name: 'B 01' }, c: { name: 'C 01' } },
      lines: [line('D1'), line('D4'), line('D5E')],
    });
    // The second D4 path was built through a stop the line no longer lists: it is not drawn.
    s.put('scripts/routed.json', {
      through: { D4: [['b', 'c'], ['b', 'gone']], D5E: [['a', 'b', 'c']] },
      lines: { D4: [[[20.9100001, 52.41], [20.92, 52.42]], [[1, 1], [2, 2]]], D5E: [[[20.93, 52.29], [20.94, 52.3]]] },
    });
    const result = s.run('scripts/osm.mjs');
    expect(result.status, result.stderr).toBe(0);

    const drawn = (id: string) => s.read(`public/data/lines/${id}.geojson`).features[0].geometry.coordinates;
    expect(drawn('D4')).toEqual([[[20.9, 52.4], [20.901, 52.401]], [[20.91, 52.41], [20.92, 52.42]]]);
    expect(drawn('D5E')).toEqual([[[20.93, 52.29], [20.94, 52.3]]]);
    expect(existsSync(join(s.dir, 'public/data/lines/D1.geojson'))).toBe(false);
    expect(Object.keys(s.read('public/data/geo.json').stops)).toEqual(['a', 'b']);
  });
});

describe('routing the unmapped parts (scripts/route.mjs)', () => {
  // The router stand-in answers with the points it was asked for.
  const router = `globalThis.fetch = async (url) => {
    const coordinates = new URL(url).pathname.split('/driving/')[1].split(';').map((p) => p.split(',').map(Number));
    return { status: 200, json: async () => ({ code: process.env.ROUTER ?? 'Ok', routes: [{ distance: 1000, geometry: { coordinates } }] }) };
  };`;

  // Value: protects=only the D4 detour and D5E are routed, and a failed run keeps the committed paths;
  //   fails_when=the whole of D4 is routed, lat/lon are swapped, or a router error or moved detour still writes;
  //   why_new=route.mjs had no test; seam=none (fetch replaced by a preload);
  //   no_claim=the live router or that its path matches the town's route.
  it('routes from Słoneczna 01 on, and writes nothing when it cannot', { timeout: 60_000 }, () => {
    const s = sandbox(router);
    const direction = (...ids: string[]) => ({ stops: ids.map((stop) => ({ stop })) });
    const timetable = (d4: string[]) => ({ lines: [
      { id: 'D4', directions: [direction(...d4)] }, { id: 'D5E', directions: [direction('c', 'd')] }] });
    s.put('public/data/geo.json', { stops: { x: [52.1, 20.1], 'sloneczna-01': [52.2, 20.2], c: [52.3, 20.3], d: [52.4, 20.4] } });
    s.put('public/data/timetable.json', timetable(['x', 'sloneczna-01', 'c']));
    s.put('scripts/routed.json', 'before');

    const refused = s.run('scripts/route.mjs', { ROUTER: 'NoRoute' });
    expect(refused.status).not.toBe(0);
    expect(s.read('scripts/routed.json')).toBe('before');

    const result = s.run('scripts/route.mjs');
    expect(result.status, result.stderr).toBe(0);
    expect(s.read('scripts/routed.json').lines).toEqual({
      D4: [[[20.2, 52.2], [20.3, 52.3]]],
      D5E: [[[20.3, 52.3], [20.4, 52.4]]],
    });

    s.put('public/data/timetable.json', timetable(['x', 'c']));
    expect(s.run('scripts/route.mjs').stderr).toContain('detour no longer starts');

    // A stop without a point must not be skipped over.
    s.put('public/data/timetable.json', timetable(['x', 'sloneczna-01', 'unplaced', 'c']));
    const gap = s.run('scripts/route.mjs');
    expect(gap.status).not.toBe(0);
    expect(gap.stderr).toContain('no map point for unplaced');
  });
});
