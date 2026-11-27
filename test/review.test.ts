import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain JavaScript module
import { planAlerts } from '../scripts/lib/alerts.mjs';
// @ts-expect-error plain JavaScript module
import { stopId } from '../scripts/lib/collect.mjs';
import { board } from '../src/board';
import { matches, platforms } from '../src/platforms';
import { warsawInstant } from '../src/schedule';
import type { Status, Timetable } from '../src/types';

class El {
  attrs: Record<string, string> = {};
  nodes: (El | string)[] = [];
  setAttribute(name: string, value: string) { this.attrs[name] = value; }
  addEventListener() {}
  append(...nodes: (El | string)[]) { this.nodes.push(...nodes); }
  replaceChildren(...nodes: (El | string)[]) { this.nodes = nodes; }
  get textContent(): string {
    return this.nodes.map((n) => (typeof n === 'string' ? n : n.textContent)).join('');
  }
  set textContent(value: string) { this.nodes = [value]; }
  all(): El[] {
    return [this, ...this.nodes.flatMap((n) => (typeof n === 'string' ? [] : n.all()))];
  }
}

const table: Timetable = {
  schema: 1,
  source: { name: 'x', url: 'https://example.test' },
  obtainedAt: '2026-11-27',
  verifiedAgainstSite: '2026-11-27',
  verifiedAt: 'v2',
  validUntil: '2026-12-31',
  processing: '',
  stops: { a: { name: 'Os. Batorego 02' }, z: { name: 'Z 01' } },
  lines: [{
    id: 'D1', color: '#000', textColor: '#fff',
    directions: [{ id: 'D1-1', headsign: 'Centrum', stops: [{ stop: 'a', days: { '12345': ['08:30', '09:30'] } }, { stop: 'z', days: null }] }],
  }],
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function screen(time: string, date = '2026-11-27', status: Status | null = null) {
  vi.stubGlobal('document', { createElement: () => new El() });
  vi.useFakeTimers();
  vi.setSystemTime(warsawInstant(date, time));
  const view = board(table, status, platforms(table)[0]!, { stop: 'a', line: null, walk: 5 }, () => {}, () => {});
  const root = view.root as unknown as El;
  const found = (cls: string) => root.all().filter((e) => e.attrs.class === cls).map((e) => e.textContent);
  view.destroy();
  return { card: found('card')[0]!, warnings: found('warn') };
}

describe('defects found in review stay fixed', () => {
  it('treats "Os." and "Osiedle" as one stop post, in the data and in search', () => {
    expect(stopId('Osiedle Młodych 01')).toBe(stopId('Os. Młodych 01'));
    expect(matches(platforms(table)[0]!, 'osiedle batorego')).toBe(true);
  });

  it('makes the rider choose a direction where one line leaves a post both ways', () => {
    const days = { '6': ['07:00'] };
    const way = (headsign: string) => ({ id: headsign, headsign, stops: [{ stop: 'a', days }, { stop: 'z', days: null }] });
    const found = platforms({ ...table, lines: [{ ...table.lines[0]!, directions: [way('Centrum'), way('Piaski')] }] });
    expect(found.filter((p) => p.stop === 'a').map((p) => [p.id, p.towards, p.services.length]))
      .toEqual([['a~Centrum', 'Centrum', 1], ['a~Piaski', 'Piaski', 1]]);
  });

  it('does not claim there is nothing left today while a bus can still be run for', () => {
    const { card } = screen('09:27');
    expect(card).toContain('Nie zdążysz na 09:30');
    expect(card).not.toContain('Dziś już nic');
  });

  it('says a date is unconfirmed instead of guessing', () => {
    expect(screen('12:00', '2026-12-24').card).toContain('niepotwierdzony');
  });

  it('does not trust a status written for another version of the timetable', () => {
    const now = new Date(warsawInstant('2026-11-27', '08:00')).toISOString();
    const status = (verifiedAt: string): Status => ({ verifiedAt, lines: { D1: { state: 'ok', lastCompared: now } } });
    expect(screen('08:00', '2026-11-27', status('v2')).warnings).toEqual([]);
    expect(screen('08:00', '2026-11-27', status('v1')).warnings).toHaveLength(1);
  });

  it('opens, comments on and closes issues, one per line', () => {
    const report = [{ line: 'D1', title: 'Timetable D1: changed', body: 'b' }];
    expect(planAlerts([], report).map((a: { do: string }) => a.do)).toEqual(['create']);
    expect(planAlerts([{ number: 1, title: 'Timetable D1: changed' }], report)).toEqual([]);
    expect(planAlerts([{ number: 1, title: 'Timetable D1: cannot be compared' }], report)[0]).toMatchObject({ do: 'update', number: 1 });
    expect(planAlerts([{ number: 2, title: 'Timetable D2: changed' }], [])).toEqual([{ do: 'close', number: 2 }]);
  });
});
