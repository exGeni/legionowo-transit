import { afterEach, describe, expect, it, vi } from 'vitest';
import { board } from '../src/board';
import { loadTimetable } from '../src/data';
import { matches, metres, platforms } from '../src/platforms';
import { warsawInstant } from '../src/schedule';
import type { Status, Timetable } from '../src/types';
import { walkStepper } from '../src/ui';

// Just enough of an element for src/dom.ts and the screens; no DOM library is installed.
class El {
  attrs: Record<string, string> = {};
  listeners: Record<string, () => void> = {};
  nodes: (El | string)[] = [];
  setAttribute(name: string, value: string) { this.attrs[name] = value; }
  addEventListener(name: string, fn: () => void) { this.listeners[name] = fn; }
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
  validUntil: '2026-12-31',
  processing: '',
  stops: { a: { name: 'Łąkowa 01' }, z: { name: 'Z 01' } },
  lines: [{
    id: 'D1', color: '#000', textColor: '#fff',
    directions: [{ id: 'D1-1', headsign: 'Centrum', stops: [{ stop: 'a', days: { '12345': ['08:30', '09:30'] } }, { stop: 'z', days: null }] }],
  }],
};
const status: Status = { lines: { D1: { state: 'ok', lastCompared: new Date(warsawInstant('2026-11-27', '07:00')).toISOString() } } };

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function screen(time: string, date = '2026-11-27') {
  vi.stubGlobal('document', { createElement: () => new El() });
  vi.useFakeTimers();
  vi.setSystemTime(warsawInstant(date, time));
  const view = board(table, status, platforms(table)[0]!, { stop: 'a', line: null, walk: 5 }, () => {}, () => {});
  const root = view.root as unknown as El;
  const card = () => root.all().find((e) => e.attrs.class === 'card')!.textContent;
  const button = () => root.all().find((e) => e.attrs.class === 'secondary');
  return { root, card, button, destroy: view.destroy };
}

describe('the countdown as drawn', () => {
  // Value: protects=the big card says the right thing in each state; fails_when=minutes, "now",
  //   "tight", the missed bus button or the next-day time is drawn wrongly or the card does not
  //   change when the minute does; why_new=only the rule functions were tested; seam=none;
  //   no_claim=layout, colours and a real browser.
  it('counts down, then says leave now, then moves on and keeps the missed bus one tap away', () => {
    const s = screen('08:19');
    expect(s.card()).toBe('Wyjdź za4min');
    vi.advanceTimersByTime(4 * 60_000);
    expect(s.card()).toBe('Wyjdź teraz');
    vi.advanceTimersByTime(60_000);
    expect(s.card()).toBe('Wyjdź terazna styk');
    vi.advanceTimersByTime(2 * 60_000);
    expect(s.card()).toContain('Nie zdążysz na 08:30. Następny:');
    s.button()!.listeners.click!();
    expect(s.card()).toContain('trzeba biec');
    s.destroy();
  });

  it('shows the day and time of the next bus when today has none, and no countdown after expiry', () => {
    const evening = screen('20:00');
    expect(evening.card()).toContain('Dziś już nic. Następny kurs08:30poniedziałek, 30 listopada');
    const sunday = screen('10:00', '2026-11-29');
    expect(sunday.card()).toContain('Dziś brak kursów w rozkładzie miasta. Następny:08:30');
    sunday.destroy();
    evening.destroy();
    const expired = screen('08:00', '2027-01-04');
    expect(expired.root.textContent).toContain('nieaktualny');
    expect(expired.root.all().some((e) => e.attrs.class === 'card')).toBe(false);
    expired.destroy();
  });
});

describe('walking time and finding a stop', () => {
  it('keeps walking minutes between 0 and 60 and saves each change', () => {
    vi.stubGlobal('document', { createElement: () => new El() });
    const settings = { stop: null, line: null, walk: 1 };
    const save = vi.fn();
    const [less, more] = (walkStepper(settings, save) as unknown as El).all().filter((e) => e.listeners.click);
    less!.listeners.click!();
    less!.listeners.click!();
    expect(settings.walk).toBe(0);
    settings.walk = 60;
    more!.listeners.click!();
    expect(settings.walk).toBe(60);
    expect(save).toHaveBeenCalledTimes(3);
  });

  it('searches without Polish letters and measures distance', () => {
    const [stop] = platforms(table);
    expect([matches(stop!, 'lakowa'), matches(stop!, 'centrum'), matches(stop!, 'rynek')]).toEqual([true, true, false]);
    expect(metres([52.4, 20.9], [52.401, 20.9])).toBeCloseTo(111, 0);
  });
});

describe('offline', () => {
  // Value: protects=the app opens without a network; fails_when=the saved timetable is not kept or
  //   not used; why_new=no test; seam=none; no_claim=the service worker (checked in a browser).
  it('uses the copy saved on the phone when the network fails', async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => table }));
    expect(await loadTimetable()).toEqual(table);
    vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
    expect(await loadTimetable()).toEqual(table);
    store.clear();
    expect(await loadTimetable()).toBeNull();
  });
});
