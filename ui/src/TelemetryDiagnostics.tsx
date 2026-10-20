import { useEffect, useState } from 'react';
import type { Snapshot, TrafficBatch } from './contract';
type Timing = { batchId: number; sentUnixMs: number; sampleAgeMs: number; readMs: number };
const bounded = (data: number[], n: number) => { data.push(n); if (data.length > 1204) data.shift(); };
export class TelemetryMetrics {
  intervals: number[] = []; bridge: number[] = []; acquisition: number[] = []; read: number[] = []; render: number[] = [];
  batches = 0; missingBatches = 0; missingSamples = 0;
  private lastBatch = 0; private sequence = -1; private generation = -1;
  private framePending = false;
  accept(batch: TrafficBatch, timing: Timing) {
    if (timing.batchId <= this.lastBatch) return;
    if (this.lastBatch) this.missingBatches += Math.max(0, timing.batchId - this.lastBatch - 1);
    this.lastBatch = timing.batchId; this.batches++;
    const receipt = performance.now();
    bounded(this.bridge, Date.now() - timing.sentUnixMs); // Same-machine wall-clock estimate, not clock-synchronized one-way latency.
    if (batch.samples.length) { bounded(this.acquisition, timing.sampleAgeMs); bounded(this.read, timing.readMs); }
    if (this.generation !== batch.generation) { this.generation = batch.generation; this.sequence = -1; }
    for (const sample of batch.samples) {
      if (sample.sequence <= this.sequence) continue;
      if (this.sequence >= 0) this.missingSamples += Math.max(0, sample.sequence - this.sequence - 1);
      this.sequence = sample.sequence;
      if (sample.status === 'measured') bounded(this.intervals, sample.elapsedSeconds * 1000);
    }
    // A hidden/minimized WebView may suspend rAF. Never accumulate callbacks while hidden.
    if (!this.framePending) {
      this.framePending = true;
      requestAnimationFrame(() => { this.framePending = false; bounded(this.render, performance.now() - receipt); });
    }
  }
}
export const telemetry = new TelemetryMetrics();
export const percentile = (data: number[], p: number) => data.length ? [...data].sort((a, b) => a - b)[Math.min(data.length - 1, Math.ceil(data.length * p) - 1)] : null;
const format = (n: number | null) => n === null ? '—' : n.toFixed(2);
export function TelemetryDiagnostics({ snapshot }: { snapshot: Snapshot | null }) {
  const [, tick] = useState(0);
  useEffect(() => { const timer = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(timer); }, []);
  const mean = telemetry.intervals.length ? telemetry.intervals.reduce((a, b) => a + b, 0) / telemetry.intervals.length : null;
  const probeHz = (id: 'gateway' | 'internet') => {
    const samples = snapshot?.[id].samples.slice(-60) ?? [];
    const seconds = samples.length > 1 ? (Date.parse(samples.at(-1)!.timestamp) - Date.parse(samples[0].timestamp)) / 1000 : 0;
    return seconds > 0 ? (samples.length - 1) / seconds : null;
  };
  return <div className="telemetry-diagnostics"><h3>Telemetry diagnostics · observed</h3>
    <div className="diagnostics-grid">{[
      ['Native traffic cadence', mean ? format(1000 / mean) + ' Hz' : '—'],
      ['Native interval p95', format(percentile(telemetry.intervals, .95)) + ' ms'],
      ['Provider read p95', format(percentile(telemetry.read, .95)) + ' ms'],
      ['Sample → host send p95', format(percentile(telemetry.acquisition, .95)) + ' ms'],
      ['Host → JS p95 (wall clock)', format(percentile(telemetry.bridge, .95)) + ' ms'],
      ['JS → next rAF p95', format(percentile(telemetry.render, .95)) + ' ms'],
      ['Batch / sample gaps', telemetry.missingBatches + ' / ' + telemetry.missingSamples],
      ['GW / EXT completion cadence', format(probeHz('gateway')) + ' / ' + format(probeHz('internet')) + ' Hz'],
    ].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>
    <p>{telemetry.batches} traffic batches received. Up to 1204 recent observations. Native durations use a monotonic clock. Host → JS is a same-machine wall-clock estimate and can be affected by clock adjustment. Next rAF is a rendering opportunity, not GPU presentation. Probe cadence includes response-time variation; slow probes never overlap. Paused statistics retain prior observations.</p>
  </div>;
}
