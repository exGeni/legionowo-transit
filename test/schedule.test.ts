import { describe, expect, it } from 'vitest';
import { platforms } from '../src/platforms';
import { advice,expiresSoon, isExpired, plan, upcoming, warsawInstant, weekday } from '../src/schedule';
import type { Timetable } from '../src/types';

const table: Timetable = {
  schema: 1,
  source: { name: 'x', url: 'https://example.test' },
  obtainedAt: '2026-11-27',
  verifiedAgainstSite: '2026-11-27',
  validUntil: '2026-12-31',
  processing: '',
  stops: { a: { name: 'A 01' }, b: { name: 'B 01' } },
  lines: [
    {
      id: 'D1', color: '#000', textColor: '#fff',
      directions: [{
        id: 'D1-1', headsign: 'Centrum',
        stops: [
          { stop: 'a', days: { '12345': ['06:30', '08:30', '09:30'], '6': ['07:30'] } },
          { stop: 'b', days: null },
        ],
      }],
    },
  ],
};

// 2026-11-27 is a Friday; Warsaw is UTC+1 then.
const at = (date: string, time: string) => warsawInstant(date, time);

describe('Warsaw clock', () => {
  it('converts winter and summer time', () => {
    expect(new Date(at('2026-11-27', '08:30')).toISOString()).toBe('2026-11-27T07:30:00.000Z');
    expect(new Date(at('2026-07-01', '08:30')).toISOString()).toBe('2026-07-01T06:30:00.000Z');
  });
  it('knows weekdays', () => {
    expect(weekday('2026-11-27')).toBe(5);
    expect(weekday('2026-11-29')).toBe(7);
  });
});

describe('leave time: departure minus walk minus 2 minutes', () => {
  const dep = { line: 'D1', headsign: 'Centrum', date: '2026-11-27', time: '08:30', at: at('2026-11-27', '08:30') };
  const t = (time: string, seconds = 0) => at('2026-11-27', time) + seconds * 1000;

  it('counts whole minutes, rounding down', () => {
    expect(advice(dep, t('08:19'), 5)).toEqual({ kind: 'in', minutes: 4 });
    expect(advice(dep, t('08:19', 30), 5)).toEqual({ kind: 'in', minutes: 3 });
  });
  it('says "now" in the last minute', () => {
    expect(advice(dep, t('08:22', 30), 5)).toEqual({ kind: 'now' });
    expect(advice(dep, t('08:23'), 5)).toEqual({ kind: 'now' });
  });
  it('says "tight" while only the safety margin is left', () => {
    expect(advice(dep, t('08:24'), 5)).toEqual({ kind: 'tight' });
    expect(advice(dep, t('08:25'), 5)).toEqual({ kind: 'tight' });
  });
  it('moves to the next bus once walking cannot make it', () => {
    const p = plan(table, 'a', t('08:26'), 5);
    expect(p.next?.time).toBe('09:30');
    expect(p.missed?.time).toBe('08:30');
  });
});

describe('which departures exist', () => {
  it('offers nothing where nobody boards', () => {
    expect(upcoming(table, 'b', at('2026-11-27', '05:00')).departures).toEqual([]);
  });
  it('runs on to Saturday, skipping nothing', () => {
    const p = plan(table, 'a', at('2026-11-27', '22:00'), 5);
    expect([p.next?.date, p.next?.time]).toEqual(['2026-11-28', '07:30']);
    expect(advice(p.next!, at('2026-11-27', '22:00'), 5)).toEqual({ kind: 'later-day' });
  });
  it('passes a Sunday without service', () => {
    const p = plan(table, 'a', at('2026-11-29', '10:00'), 5);
    expect([p.next?.date, p.next?.time]).toEqual(['2026-11-30', '06:30']);
  });
  it('stops at a date with no rule instead of guessing', () => {
    const p = plan(table, 'a', at('2026-12-23', '22:00'), 5);
    expect(p.next).toBeNull();
    expect(p.unconfirmed).toBe('2026-12-24');
  });
  it('filters by line', () => {
    expect(upcoming(table, 'a', at('2026-11-27', '05:00'), { line: 'D2' }).departures).toEqual([]);
  });
});

describe('stop posts a rider can choose', () => {
  // Value: protects=each stop post offers exactly the lines and directions that can be boarded there;
  //   fails_when=a final stop offers a service, a stop without times is called "end of route",
  //   a post shared by lines loses one, or names are not sorted the Polish way;
  //   why_new=platforms() had no test; seam=none;
  //   no_claim=search matching, distance sorting and the picker screen are not covered.
  it('merges lines per post and tells a final stop from a stop without times', () => {
    const days = { '6': ['07:00'] };
    const direction = (id: string, headsign: string, stops: Timetable['lines'][number]['directions'][number]['stops']) =>
      ({ id, headsign, stops });
    const found = platforms({
      ...table,
      stops: { m: { name: 'Mickiewicza 01' }, l: { name: 'Łąkowa 01' }, e: { name: 'Leśna 01' }, k: { name: 'Końcowa 01' } },
      lines: [
        { id: 'D1', color: '#000', textColor: '#fff', directions: [
          direction('D1-1', 'Centrum', [
            { stop: 'm', days, suspect: true, source: 's1', validFrom: '2026-01-02' },
            { stop: 'l', days: null },
            { stop: 'k', days: null },
          ]),
          direction('D1-2', 'Piaski', [{ stop: 'e', days }, { stop: 'm', days: null }]),
        ] },
        { id: 'D2', color: '#000', textColor: '#fff', directions: [
          direction('D2-1', 'Osiedle', [{ stop: 'm', days }, { stop: 'k', days: null }]),
        ] },
      ],
    });
    expect(found.map((p) => p.name)).toEqual(['Końcowa 01', 'Leśna 01', 'Łąkowa 01', 'Mickiewicza 01']);
    const [end, , noTimes, shared] = found;
    expect(end).toMatchObject({ services: [], terminusOnly: true });
    expect(noTimes).toMatchObject({ services: [], terminusOnly: false });
    expect(shared!.terminusOnly).toBe(false);
    expect(shared!.services).toEqual([
      { line: 'D1', headsign: 'Centrum', suspect: true, source: 's1', validFrom: '2026-01-02' },
      { line: 'D2', headsign: 'Osiedle' },
    ]);
  });
});

describe('validity', () => {
  it('warns two weeks ahead and expires after the last day', () => {
    expect(expiresSoon(table, at('2026-12-16', '12:00'))).toBe(false);
    expect(expiresSoon(table, at('2026-12-17', '12:00'))).toBe(true);
    expect(isExpired(table, at('2026-12-31', '23:00'))).toBe(false);
    expect(isExpired(table, at('2027-01-01', '00:30'))).toBe(true);
  });
});
