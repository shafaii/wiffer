import type { TrafficSample } from './contract';

const defaultTicks = [0, 0.1, 1, 10, 50, 100];
const scaleWindowMs = 30_000;

// Both dials use the same ladder. Retain a burst on the scale for 30 seconds.
export function gaugeScale(samples: readonly TrafficSample[]): readonly number[] {
  const latest = samples.at(-1);
  if (!latest) return defaultTicks;

  const end = Date.parse(latest.timestamp);
  let peak = 0;
  for (const sample of samples) {
    const time = Date.parse(sample.timestamp);
    if (sample.status === 'measured' && time >= end - scaleWindowMs && time <= end) {
      peak = Math.max(peak, sample.downloadMbps ?? 0, sample.uploadMbps ?? 0);
    }
  }

  let ceiling = 100;
  while (ceiling < peak) ceiling = Math.min(ceiling * 10, Number.MAX_VALUE);
  return ceiling === 100 ? defaultTicks : defaultTicks.map(tick => tick / 100 * ceiling);
}

// Printed tick marks divide the dial evenly. Interpolate within each marked interval.
export function gaugePosition(value: number, ticks: readonly number[]): number {
  if (value <= 0) return 0;
  for (let i = 1; i < ticks.length; i++) {
    if (value <= ticks[i]) {
      const fraction = (value - ticks[i - 1]) / (ticks[i] - ticks[i - 1]);
      return (i - 1 + fraction) / (ticks.length - 1);
    }
  }
  return 1;
}
