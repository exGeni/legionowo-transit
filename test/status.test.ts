import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript module
import { difference, needsAttention, nextStatus, renewal } from '../scripts/lib/status.mjs';

const t = (day: number, hour = 0) => new Date(Date.UTC(2026, 11, day, hour)).toISOString();
const verified = t(1);

describe('status of a line', () => {
  it('is ok when the site shows the published data', () => {
    expect(nextStatus(undefined, 'same', verified, t(2))).toEqual({ state: 'ok', lastCompared: t(2) });
  });
  it('keeps "changed" even if the site later matches again or fails', () => {
    const changed = nextStatus(undefined, 'different', verified, t(2));
    expect(nextStatus(changed, 'same', verified, t(3))).toEqual({ state: 'changed', lastCompared: t(3), since: t(2) });
    expect(nextStatus(changed, 'failed', verified, t(3))).toEqual({ state: 'changed', lastCompared: t(2), since: t(2) });
  });
  it('clears "changed" only after a newer verification', () => {
    const changed = nextStatus(undefined, 'different', verified, t(2));
    expect(nextStatus(changed, 'same', t(4), t(5))).toEqual({ state: 'ok', lastCompared: t(5) });
  });
  it('reports an unreachable site only after two days, keeping the last good time', () => {
    const ok = nextStatus(undefined, 'same', verified, t(2));
    const unknown = nextStatus(ok, 'failed', verified, t(3));
    expect(unknown).toEqual({ state: 'unknown', lastCompared: t(2) });
    expect(needsAttention(unknown, t(3))).toBe(false);
    expect(needsAttention(unknown, t(5))).toBe(true);
  });
});

describe('difference from the published data', () => {
  const published = { stopList: 'a', pages: { u: '1' } };
  it('sees nothing when nothing changed', () => {
    expect(difference(published, { stopList: 'a', pages: { u: '1' } })).toBeNull();
  });
  it('sees new times, new stops and removed pages', () => {
    expect(difference(published, { stopList: 'a', pages: { u: '2' } })).toContain('1 stop page');
    expect(difference(published, { stopList: 'b', pages: { u: '1' } })).toContain('list of stops');
    expect(difference(published, { stopList: 'a', pages: {} })).toContain('1 stop page');
  });
});

describe('renewal reminder', () => {
  it('starts 14 days before the validity ends', () => {
    expect(renewal('2026-12-31', t(16))).toBeNull();
    expect(renewal('2026-12-31', t(17, 1)).title).toContain('renewal');
  });
});
