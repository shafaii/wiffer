import { describe, expect, it } from 'vitest';
import { haloQuality, haloState } from './haloModel';
describe('quality-calibrated wireless halo', () => {
  it('maps the entire quality range linearly, including 82%', () => {
    for (const q of [0, 1, 39, 40, 60, 79, 80, 82, 99, 100]) expect(haloQuality(q)).toBe(q / 100);
    expect(haloQuality(-1)).toBe(0); expect(haloQuality(101)).toBe(1);
  });
  it('does not substitute missing or invalid quality with measured zero', () => {
    for (const q of [null, undefined, NaN, Infinity]) expect(haloQuality(q)).toBeNull();
    expect(haloState('Stable', null)).toBe('Unavailable');
    expect(haloState('Stable', 0)).toBe('Weak');
  });
  it('uses explicit display category boundaries, independently of RSSI diagnostics', () => {
    for (const [q, state] of [[0,'Weak'],[39,'Weak'],[40,'Fair'],[59,'Fair'],[60,'Good'],[79,'Good'],[80,'Excellent'],[100,'Excellent']] as const) expect(haloState('Stable', q)).toBe(state);
    expect(haloState('Degraded',82)).toBe('Excellent'); expect(haloState('Weakening',60)).toBe('Good');
  });
  it('connection and freshness states override even excellent cached quality', () => {
    for (const state of ['Reconnecting','Disconnected','Stale','Unavailable','Paused','Awaiting route'] as const) expect(haloState(state,100)).toBe(state);
  });
});
