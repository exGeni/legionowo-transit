import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript module
import { findSuspects } from '../scripts/lib/suspect.mjs';

const stop = (times: string[]) => ({ days: { '12345': times } });

describe('contradictions between neighbouring stops', () => {
  it('flags a time typed with the wrong hour', () => {
    const found = findSuspects([stop(['06:00', '07:00', '08:00']), stop(['06:02', '06:05', '08:02'])]);
    expect(found).toEqual([{ from: 0, to: 1, days: '12345', lost: ['07:00'] }]);
  });
  it('accepts tables that agree', () => {
    expect(findSuspects([stop(['06:00', '07:00']), stop(['06:02', '07:02'])])).toEqual([]);
  });
  it('leaves alone a stop served by only some trips', () => {
    expect(findSuspects([stop(['06:00', '07:00', '08:00', '09:00']), stop(['08:02'])])).toEqual([]);
  });
});
