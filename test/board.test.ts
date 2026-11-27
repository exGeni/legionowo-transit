import { afterEach, describe, expect, it, vi } from 'vitest';
import { board } from '../src/board';
import { platforms } from '../src/platforms';
import { warsawInstant } from '../src/schedule';
import type { Status, Timetable } from '../src/types';

// Just enough of an element for src/dom.ts and the board; no DOM library is installed.
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

const days = { '1234567': ['23:00'] };
const table: Timetable = {
  schema: 1,
  source: { name: 'x', url: 'https://example.test' },
  obtainedAt: '2026-11-27',
  verifiedAgainstSite: '2026-11-27',
  validUntil: '2026-12-31',
  processing: '',
  stops: { a: { name: 'A 01' }, b: { name: 'B 01' }, z: { name: 'Z 01' } },
  lines: ['D1', 'D2', 'D3'].map((id) => ({
    id, color: '#000', textColor: '#fff',
    directions: [{
      id: `${id}-1`, headsign: 'Centrum',
      // D1 and D2 leave from "a"; only D3 leaves from "b".
      stops: [{ stop: id === 'D3' ? 'b' : 'a', days, suspect: id === 'D3' }, { stop: 'z', days: null }],
    }],
  })),
};

const now = warsawInstant('2026-11-27', '12:00');
const ago = (hours: number) => new Date(now - hours * 3_600_000).toISOString();
const fresh = { state: 'ok' as const, lastCompared: ago(1) };

function alerts(stop: string, status: Status | null, at = now): string[] {
  vi.setSystemTime(at);
  const view = board(table, status, platforms(table).find((p) => p.id === stop)!,
    { stop, line: null, walk: 5 }, () => {}, () => {});
  const found = (view.root as unknown as El).all().filter((e) => e.attrs.class === 'warn').map((e) => e.textContent);
  view.destroy();
  return found;
}

describe('warnings on the main screen', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // Value: protects=a rider is warned when the shown times may be wrong, and only then;
  //   fails_when=a changed line, a comparison older than 48 h, contradicting city tables or the nearing
  //   end of validity stays silent, or a line that does not stop here raises a warning;
  //   why_new=warnings() had no test; seam=none (a stand-in "document" global);
  //   no_claim=layout, styling, links and real browser rendering are not checked.
  it('warns about changed, stale, contradictory and expiring timetables of this stop only', () => {
    vi.stubGlobal('document', { createElement: () => new El() });
    vi.useFakeTimers();

    const status: Status = { lines: { D1: fresh, D2: fresh, D3: { state: 'changed', lastCompared: ago(1) } } };
    expect(alerts('a', status)).toEqual([]);

    const changed = alerts('a', { lines: { ...status.lines, D2: { state: 'changed', lastCompared: ago(1) } } });
    expect(changed).toHaveLength(1);
    expect(changed[0]).toContain('Rozkład D2 na stronie miasta zmienił się');

    const unreachable = (hours: number): Status =>
      ({ lines: { D1: fresh, D2: { state: 'unknown', lastCompared: ago(hours) } } });
    expect(alerts('a', unreachable(47))).toEqual([]);
    for (const stale of [alerts('a', unreachable(49)), alerts('a', null)]) {
      expect(stale).toHaveLength(1);
      expect(stale[0]).toContain('nie udało się porównać');
    }

    const suspect = alerts('b', { lines: { D3: fresh } });
    expect(suspect).toHaveLength(1);
    expect(suspect[0]).toContain('niespójne');

    const later = warsawInstant('2026-12-20', '12:00');
    const compared = { state: 'ok' as const, lastCompared: new Date(later).toISOString() };
    const expiring = alerts('a', { lines: { D1: compared, D2: compared } }, later);
    expect(expiring).toHaveLength(1);
    expect(expiring[0]).toContain('potwierdzone do 31.12.2026');
  });
});
