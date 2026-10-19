import { describe, expect, it } from 'vitest';
import { focusScale, inverseFocus, seriesPoints } from './chartMath';
import { messageSchema, sampleSchema } from './contract';
describe('focus scale', () => {
  it('is continuous, monotone, invertible and leaves normal RTTs linear', () => {
    const values = [0, 5, 10, 30, 31, 100, 279, 516, 1199, 1894, 10000];
    values.forEach(v => expect(inverseFocus(focusScale(v))).toBeCloseTo(v, 8));
    expect(focusScale(10)).toBe(20); expect(focusScale(30)).toBe(60); expect(focusScale(60)).toBe(80);
    values.slice(1).forEach((v, i) => expect(focusScale(v)).toBeGreaterThan(focusScale(values[i])));
  });
  it('keeps failures null and breaks lines across disconnections', () => {
    const result = seriesPoints([
      { timestamp: '2026-10-18T10:00:00Z', destination: '1.1.1.1', rttMs: 5, status: 'success', error: null },
      { timestamp: '2026-10-18T10:00:01Z', destination: '1.1.1.1', rttMs: null, status: 'timeout', error: 'timeout' },
      { timestamp: '2026-10-18T10:00:10Z', destination: '1.1.1.1', rttMs: 12, status: 'success', error: null },
    ], 0, Date.parse('2026-10-18T10:00:11Z'), true);
    expect(result.map(p => p.value[1])).toEqual([10, null, null, 24]);
  });
});
describe('bridge validation', () => {
  it('rejects a failed probe with a fabricated zero RTT', () => expect(sampleSchema.safeParse({ timestamp: '2026-10-18T10:00:00Z', destination: '1.1.1.1', rttMs: 0, status: 'timeout', error: 'timeout' }).success).toBe(false));
  it('rejects incompatible versions and unknown fields', () => {
    expect(messageSchema.safeParse({ version: 3, type: 'ack', id: 'a' }).success).toBe(false);
    expect(messageSchema.safeParse({ version: 2, type: 'ack', id: 'a', extra: true }).success).toBe(false);
    expect(messageSchema.safeParse({ version: 2, type: 'ack', id: 'a' }).success).toBe(true);
  });
});
