import { describe, expect, it } from 'vitest';
import { TrafficStore } from './trafficStore';
import { gaugeRange } from './SpeedDial';
import { trafficPoints, variationPoints } from './instrumentMath';
import { trafficBatchSchema, trafficSampleSchema, wifiSchema, type TrafficSample } from './contract';
const sample = (sequence: number, changes = {}): TrafficSample => ({ sequence, timestamp: new Date(1800000000000 + sequence * 250).toISOString(), elapsedSeconds: .25, status: 'measured', downloadMbps: 8, uploadMbps: 1, downloadAverage: 7, uploadAverage: .5, error: null, ...changes });
describe('incremental traffic store', () => {
  it('deduplicates batches, ignores old generations, and clears on session reset', () => {
    const store = new TrafficStore(); let notifications = 0; store.subscribe(() => notifications++);
    store.accept({ generation: 1, samples: [sample(1), sample(2)] }); store.accept({ generation: 1, samples: [sample(2), sample(3)] });
    expect(store.history().map(s => s.sequence)).toEqual([1, 2, 3]); expect(notifications).toBe(2);
    store.accept({ generation: 1, samples: [sample(2)] }); expect(notifications).toBe(2);
    store.accept({ generation: 2, samples: [] }); expect(store.latest()).toBe(null);
    store.accept({ generation: 1, samples: [sample(4)] }); expect(store.history()).toEqual([]);
  });
  it('bounds history and preserves raw precision', () => {
    const store = new TrafficStore(); store.accept({ generation: 0, samples: Array.from({ length: 1300 }, (_, i) => sample(i, { downloadMbps: 1.23456789 })) });
    expect(store.history()).toHaveLength(1204); expect(store.latest()?.downloadMbps).toBe(1.23456789);
  });
});
describe('native bridge telemetry validation', () => {
  it('rejects nonfinite speeds, invented unavailable zeros and zero sampling intervals', () => {
    expect(trafficSampleSchema.safeParse(sample(1, { downloadMbps: Infinity })).success).toBe(false);
    expect(trafficSampleSchema.safeParse(sample(1, { status: 'unavailable' })).success).toBe(false);
    expect(trafficSampleSchema.safeParse(sample(1, { elapsedSeconds: 0 })).success).toBe(false);
    expect(trafficSampleSchema.safeParse(sample(1, { elapsedSeconds: .37 })).success).toBe(true);
  });
  it('rejects oversized, duplicate and out-of-order batches', () => {
    expect(trafficBatchSchema.safeParse({ generation: 0, samples: [sample(2), sample(1)] }).success).toBe(false);
    expect(trafficBatchSchema.safeParse({ generation: 0, samples: [sample(1), sample(1)] }).success).toBe(false);
    expect(trafficBatchSchema.safeParse({ generation: 0, samples: Array.from({ length: 1205 }, (_, i) => sample(i)) }).success).toBe(false);
  });
  it('permits unavailable Wi-Fi but rejects fabricated RSSI and malformed quality', () => {
    const wifi = { ssid: null, band: null, channel: null, rssiDbm: null, signalQuality: null, rxLinkMbps: null, txLinkMbps: null, unavailableReason: 'Driver unavailable' };
    expect(wifiSchema.safeParse(wifi).success).toBe(true);
    expect(wifiSchema.safeParse({ ...wifi, rssiDbm: 0 }).success).toBe(false);
    expect(wifiSchema.safeParse({ ...wifi, signalQuality: 101 }).success).toBe(false);
  });
});
describe('instrument data mapping', () => {
  it('never shrinks automatic ranges and handles throughput above 10 Gbps', () => {
    expect(gaugeRange(0, 1000)).toBe(1000); expect(gaugeRange(1001, 1000)).toBe(10000); expect(gaugeRange(25000, 100)).toBe(100000);
  });
  it('preserves throughput precision and inserts explicit gaps', () => {
    const result = trafficPoints([sample(1, { downloadMbps: 1.23456789 }), sample(10), sample(11, { status: 'unavailable', downloadMbps: null })], 'download');
    expect(result.map(s => s.raw)).toEqual([1.23456789, null, 8, null]);
  });
  it('calculates time-windowed jitter at variable probe rates without mapping failures to zero', () => {
    const s = (seconds: number, rttMs: number | null) => ({ timestamp: new Date(1800000000000 + seconds * 1000).toISOString(), destination: '1.1.1.1', rttMs, status: rttMs === null ? 'timeout' as const : 'success' as const, error: null });
    const points = variationPoints([s(0, 10), s(1, 30), s(2, null), s(4, 20), s(20, 50)]);
    expect(points.filter(p => p.note !== 'Probe gap').map(p => p.raw)).toEqual([null, 20, null, 15, null]);
    expect(points.some(p => p.note === 'Probe gap')).toBe(true);
  });
});
