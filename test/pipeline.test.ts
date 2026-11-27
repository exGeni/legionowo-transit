import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript module
import { assemble } from '../scripts/lib/assemble.mjs';

describe('building the published data', () => {
  // Value: protects=nobody is shown a departure where the city prints none; fails_when=a final,
  //   arrivals or unlinked stop gets times, a missing page goes unreported, or contradicting
  //   neighbours are not flagged; why_new=build step untested; seam=none (used by build-data).
  it('gives no times to arrival, unlinked and last stops, and flags contradictions', () => {
    const page = (times: string[], headsign = 'Centrum') =>
      ({ headsign, stopName: null, validFrom: '2026-01-02', days: [{ label: 'Sobota', times }] });
    const stops = ['a', 'b', 'c', 'd', 'e'].map((n) => ({ name: `${n.toUpperCase()} 01`, url: n === 'c' ? null : n }));
    const out = assemble([{
      line: 'D1',
      directions: [{ headsign: 'Centrum', stops }],
      pages: new Map([
        ['a', page(['06:00', '07:00'])],
        ['b', page(['06:02', '09:02'])],
        ['d', page(['07:10'], 'Przystanek końcowy')],
        ['e', page(['07:12'])],
      ]),
    }], { D1: ['#000', '#fff'] });
    const built = out.lines[0].directions[0].stops;
    expect(built.map((s: { days: unknown }) => s.days !== null)).toEqual([true, true, false, false, false]);
    expect(built.map((s: { suspect?: boolean }) => !!s.suspect)).toEqual([true, true, false, false, false]);
    expect(out.notes).toHaveLength(2);
    expect(out.departures).toBe(4);
  });
});

describe('the scheduled check, run as it is in GitHub Actions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'check-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  // A stand-in city: one stop page per line, minutes taken from the environment.
  const city = `globalThis.fetch = async (url) => {
    const path = new URL(url).pathname;
    const line = (path.match(/d(\\d)(e?)/) ?? []).slice(1).join('').toUpperCase();
    if (process.env.CITY === 'down') return { ok: false, status: 503, text: async () => '' };
    const body = path.startsWith('/dkm-legionowo-')
      ? '<div class="rozklady"><div><p><strong>Centrum</strong></p><ul><li><a href="/d' + line.toLowerCase() + '-a">A 01</a></li><li>Z 01</li></ul></div></div>'
      : '<div class="breadcrumb-1">Przystanek: A 01</div><div class="rozklad1"><p>kierunek: <strong>Centrum</strong> Linia <strong>D' + line + '</strong></p><table><tr><td>Sobota</td></tr><tr><td>godz.</td><td>min.</td></tr><tr><td>6</td><td>' + process.env.CITY + '</td></tr></table></div>';
    return { ok: true, status: 200, text: async () => body };
  };`;

  // Value: protects=a changed or unreachable city site becomes a visible state and a report;
  //   fails_when=check.mjs writes the wrong state, exits with an error, or reports nothing;
  //   why_new=orchestration untested; seam=none (fetch replaced by a preload);
  //   no_claim=the live site, GitHub permissions, the status branch.
  it('writes ok, then changed with a report', { timeout: 180_000 }, async () => {
    const stub = join(dir, 'city.mjs');
    writeFileSync(stub, city);
    const script = resolve('scripts/check.mjs');
    const run = (CITY: string) => {
      execFileSync(process.execPath, ['--import', pathToFileURL(stub).href, script, 'status.json', 'report.json'],
        { cwd: dir, env: { ...process.env, CITY }, stdio: 'pipe' });
      return {
        status: JSON.parse(readFileSync(join(dir, 'status.json'), 'utf8')).lines,
        report: JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')),
      };
    };
    // Publish what the stand-in city shows with "30".
    const published = join(dir, 'collect.mjs');
    writeFileSync(published, `import { writeFileSync, mkdirSync } from 'node:fs';
      const { collectAll } = await import(${JSON.stringify(pathToFileURL(resolve('scripts/lib/collect.mjs')).href)});
      const all = await collectAll();
      mkdirSync('public/data', { recursive: true });
      writeFileSync('public/data/sources.json', JSON.stringify({ verifiedAt: '2026-01-01', lines: Object.fromEntries(all.map((c) => [c.line, c.prints])) }));`);
    mkdirSync(join(dir, 'public', 'data'), { recursive: true });
    // Far enough ahead that no renewal reminder joins the report.
    writeFileSync(join(dir, 'public', 'data', 'timetable.json'), JSON.stringify({ validUntil: '2999-12-31' }));
    execFileSync(process.execPath, ['--import', pathToFileURL(stub).href, published], { cwd: dir, env: { ...process.env, CITY: '30' } });

    const same = run('30');
    expect(Object.values(same.status).map((s) => (s as { state: string }).state)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
    expect(same.report).toEqual([]);

    // An outage is not a change, and is not reported on the first day.
    const down = run('down');
    expect(down.status.D1.state).toBe('unknown');
    expect(down.report).toEqual([]);

    const changed = run('31');
    expect(changed.status.D1.state).toBe('changed');
    // A page that answers but no longer reads is a change, not an outage.
    expect(run('30a').status.D2.state).toBe('changed');
    expect(changed.report.map((r: { line: string }) => r.line)).toEqual(['D1', 'D2', 'D3', 'D4', 'D5E']);
  });
});
