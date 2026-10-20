import { describe, expect, it, vi } from 'vitest';
import { springStep } from './SpeedDial';
import { TelemetryMetrics } from './TelemetryDiagnostics';
import { messageSchema, speedTestSchema } from './contract';
describe('digital instrument motion', () => {
  it('converges at 60/120/240 Hz with comparable physical timing', () => {
    const positions = [60, 120, 240].map(hz => {
      let state = { position: 0, velocity: 0 };
      for (let i = 0; i < hz / 2; i++) state = springStep(state.position, state.velocity, 1, 1 / hz);
      return state.position;
    });
    expect(positions[0]).toBeCloseTo(positions[2], 10);
    positions.forEach(n => expect(n).toBeGreaterThan(.999));
  });
  it('preserves inertia on reversal and settles to genuine zero', () => {
    let s = springStep(0, 0, 1, .06); const velocity = s.velocity;
    expect(velocity).toBeGreaterThan(0);
    for (let i = 0; i < 240; i++) s = springStep(s.position, s.velocity, 0, 1 / 240);
    expect(Math.abs(s.position)).toBeLessThan(.00001);
    expect(Number.isFinite(springStep(0, 0, 1, 600).position)).toBe(true);
  });
});
describe('new bridge contracts', () => {
  const state = { status: 'idle', phase: 'Ready', elapsedSeconds: 0, progress: 0, liveDownloadMbps: null, liveUploadMbps: null, downloadMbps: null, uploadMbps: null,
    idleLatencyMs: null, downloadLatencyMs: null, uploadLatencyMs: null, downloadBytes: 0, uploadBytes: 0, downloadSeconds: null, uploadSeconds: null, endpoint: 'speed.cloudflare.com', server: null, error: null };
  it('accepts native test status but rejects remote injection and nonfinite results', () => {
    expect(messageSchema.safeParse({version:2,type:'speedTest',state}).success).toBe(true);
    expect(speedTestSchema.safeParse({...state,endpoint:'example.com'}).success).toBe(false);
    expect(speedTestSchema.safeParse({...state,downloadMbps:Infinity}).success).toBe(false);
    expect(speedTestSchema.safeParse({...state,progress:2}).success).toBe(false);
    expect(speedTestSchema.safeParse({...state,status:'complete',progress:1}).success).toBe(false);
    expect(speedTestSchema.safeParse({...state,status:'canceled',downloadMbps:10}).success).toBe(false);
  });
  it('detects dropped batches while allowing duplicates and session resets', () => {
    const raf = vi.fn(() => 1); vi.stubGlobal('requestAnimationFrame', raf);
    const metrics = new TelemetryMetrics(), batch = {generation:0,samples:[]};
    const timing = {batchId:1,sentUnixMs:Date.now(),sampleAgeMs:1,readMs:.1};
    metrics.accept(batch,timing); metrics.accept(batch,timing);
    metrics.accept(batch,{...timing,batchId:3});
    expect(metrics.batches).toBe(2); expect(metrics.missingBatches).toBe(1);
    metrics.accept({generation:1,samples:[]},{...timing,batchId:4});
    expect(metrics.missingSamples).toBe(0); expect(raf).toHaveBeenCalledTimes(1);
    expect(metrics.acquisition).toEqual([]); vi.unstubAllGlobals();
  });
});
