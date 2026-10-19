import type { Sample } from './contract';
// Preserve a full linear band for ordinary RTTs, then double the scale every 20 units.
export function focusScale(ms: number): number { return ms <= 30 ? ms * 2 : 60 + 20 * Math.log2(ms / 30); }
export function inverseFocus(value: number): number { return value <= 60 ? value / 2 : 30 * 2 ** ((value - 60) / 20); }
export function seriesPoints(samples: Sample[], start: number, end: number, focus: boolean) {
  const result: { value: [number, number | null]; raw: Sample | null }[] = [];
  let previous: number | null = null;
  for (const sample of samples) {
    const time = Date.parse(sample.timestamp);
    if (time < start || time > end) continue;
    if (previous !== null && time - previous > 1800) result.push({ value: [previous + 1, null], raw: null });
    result.push({ value: [time, sample.rttMs === null ? null : focus ? focusScale(sample.rttMs) : sample.rttMs], raw: sample });
    previous = time;
  }
  return result;
}
