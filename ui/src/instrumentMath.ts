import type { Sample, TrafficSample } from './contract';
export type InstrumentPoint = { value: [number, number | null]; raw: number | null; note: string };
// A 10-second rolling variation, computed only from successful probes in that window.
export function variationPoints(samples: Sample[]): InstrumentPoint[] {
  return samples.flatMap((s, index) => {
    const time = Date.parse(s.timestamp);
    const successes = samples.slice(0, index + 1).filter(p => p.status === 'success' && Date.parse(p.timestamp) > time - 10000);
    const value = s.status !== 'success' || successes.length < 2 ? null : successes.slice(1).reduce((sum, p, i) => sum + Math.abs(p.rttMs! - successes[i].rttMs!), 0) / (successes.length - 1);
    const point: InstrumentPoint = { value: [time, value], raw: value, note: '10s mean absolute successive-success RTT difference' };
    return index > 0 && time - Date.parse(samples[index - 1].timestamp) > 1800 ? [{ value: [time - 1, null] as [number, null], raw: null, note: 'Probe gap' }, point] : [point];
  });
}
export function trafficPoints(samples: TrafficSample[], direction: 'download' | 'upload'): InstrumentPoint[] {
  const result: InstrumentPoint[] = [];
  let previous = 0;
  for (const sample of samples) {
    const time = Date.parse(sample.timestamp);
    if (previous && time - previous > 1000) result.push({ value: [previous + 1, null], raw: null, note: 'Sampling gap' });
    const value = direction === 'download' ? sample.downloadMbps : sample.uploadMbps;
    result.push({ value: [time, value], raw: value, note: sample.error ?? `${sample.elapsedSeconds.toFixed(4)}s measured interval` });
    previous = time;
  }
  return result;
}
