import { z } from 'zod';

const nonnegative = z.number().finite().nonnegative();
const nullableMetric = nonnegative.nullable();
const timestamp = z.string().datetime({ offset: true });
const counter = z.string().regex(/^\d{1,20}$/).nullable();
export const wifiSchema = z.object({ ssid: z.string().max(128).nullable(), band: z.enum(['2.4 GHz', '5 GHz', '6 GHz']).nullable(),
  channel: z.number().int().min(1).max(233).nullable(), rssiDbm: z.number().int().min(-127).max(-1).nullable(), signalQuality: z.number().int().min(0).max(100).nullable(),
  rxLinkMbps: nullableMetric, txLinkMbps: nullableMetric, unavailableReason: z.string().nullable(),
  state: z.enum(['unavailable', 'connected', 'ad-hoc', 'disconnecting', 'disconnected', 'associating', 'discovering', 'authenticating']).nullable().default(null),
  bssid: z.string().regex(/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/).nullable().default(null), mac: z.string().regex(/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/).nullable().default(null),
  radioType: z.string().max(64).nullable().default(null), authentication: z.string().max(64).nullable().default(null), cipher: z.string().max(64).nullable().default(null), connectionMode: z.string().max(64).nullable().default(null) }).strict();
export type Wifi = z.infer<typeof wifiSchema>;
const detailsSchema = z.object({ type: z.string(), operationalState: z.string(), selection: z.string(), bytesReceived: counter, bytesSent: counter,
  receiveErrors: counter, sendErrors: counter, receiveDiscards: counter, sendDiscards: counter, counterError: z.string().nullable(), wifi: wifiSchema.nullable() }).strict();
export const trafficSampleSchema = z.object({ sequence: nonnegative.int().safe(), timestamp, elapsedSeconds: nonnegative, status: z.enum(['measured', 'baseline', 'unavailable']),
  downloadMbps: nullableMetric, uploadMbps: nullableMetric, downloadAverage: nullableMetric, uploadAverage: nullableMetric, error: z.string().nullable() }).strict().refine(s =>
    s.status === 'measured' ? s.elapsedSeconds > 0 && s.elapsedSeconds <= 2 && [s.downloadMbps, s.uploadMbps, s.downloadAverage, s.uploadAverage].every(v => v !== null)
      : [s.downloadMbps, s.uploadMbps, s.downloadAverage, s.uploadAverage].every(v => v === null));
export const trafficBatchSchema = z.object({ generation: nonnegative.int().safe(), samples: z.array(trafficSampleSchema).max(1204) }).strict()
  .refine(b => b.samples.every((s, i) => i === 0 || s.sequence > b.samples[i - 1].sequence));
export type TrafficSample = z.infer<typeof trafficSampleSchema>;
export type TrafficBatch = z.infer<typeof trafficBatchSchema>;
export const sampleSchema = z.object({ timestamp, destination: z.string().max(64), rttMs: nullableMetric,
  status: z.enum(['success', 'timeout', 'error']), error: z.string().nullable() }).strict().refine(s => s.status === 'success' ? s.rttMs !== null : s.rttMs === null);
const metricsSchema = z.object({ sent: nonnegative.int(), successful: nonnegative.int(), timeouts: nonnegative.int(), errors: nonnegative.int(),
  lossPercent: z.number().min(0).max(100).nullable(), min: nullableMetric, average: nullableMetric, max: nullableMetric,
  median: nullableMetric, p95: nullableMetric, variation: nullableMetric }).strict();
const endpointSchema = z.object({ id: z.enum(['gateway', 'internet']), target: z.string().nullable(), samples: z.array(sampleSchema).max(600), stats60: metricsSchema, stats300: metricsSchema }).strict();
export const settingsSchema = z.object({ gatewayOverride: z.string().nullable(), internetTarget: z.string(), timeoutMs: z.number().int().min(250).max(10000) }).strict();
export const snapshotSchema = z.object({ now: timestamp, sessionStarted: timestamp, runningSeconds: nonnegative, paused: z.boolean(),
  network: z.object({ connected: z.boolean(), adapterId: z.string().nullable(), adapterName: z.string(), gateway: z.string().nullable(),
    adapters: z.array(z.object({ id: z.string(), name: z.string(), address: z.string(), gateway: z.string() }).strict()), error: z.string().nullable(), details: detailsSchema.nullable(), observedAt: timestamp.nullable().default(null) }).strict(),
  settings: settingsSchema, gateway: endpointSchema, internet: endpointSchema }).strict();
export const speedTestSchema = z.object({
  status: z.enum(['idle', 'running', 'complete', 'canceled', 'error']), phase: z.enum(['Ready', 'Idle latency', 'Download', 'Upload', 'Complete', 'Canceled', 'Test stopped', 'Test failed']),
  elapsedSeconds: nonnegative, progress: z.number().min(0).max(1),
  liveDownloadMbps: nullableMetric, liveUploadMbps: nullableMetric, downloadMbps: nullableMetric, uploadMbps: nullableMetric,
  idleLatencyMs: nullableMetric, downloadLatencyMs: nullableMetric, uploadLatencyMs: nullableMetric,
  downloadBytes: nonnegative.int().safe().max(256_000_000), uploadBytes: nonnegative.int().safe().max(128_000_000), downloadSeconds: nullableMetric, uploadSeconds: nullableMetric, endpoint: z.literal('speed.cloudflare.com'),
  server: z.string().max(128).nullable(), error: z.string().max(4096).nullable(),
}).strict().refine(s => {
  if (s.status === 'complete') return s.progress === 1 && s.downloadMbps !== null && s.uploadMbps !== null && (s.downloadSeconds ?? 0) > 0 && (s.uploadSeconds ?? 0) > 0 && s.downloadBytes > 0 && s.uploadBytes > 0 && s.liveDownloadMbps === null && s.liveUploadMbps === null;
  if (s.status === 'idle' || s.status === 'canceled' || s.status === 'error') return s.downloadMbps === null && s.uploadMbps === null && s.liveDownloadMbps === null && s.liveUploadMbps === null;
  return s.progress < 1;
});
export type SpeedTestState = z.infer<typeof speedTestSchema>;
export const timingSchema = z.object({ batchId: nonnegative.int().safe(), sentUnixMs: nonnegative.int().safe(), sampleAgeMs: nonnegative, readMs: nonnegative }).strict();
export const messageSchema = z.discriminatedUnion('type', [
  z.object({ version: z.literal(2), type: z.literal('snapshot'), snapshot: snapshotSchema }).strict(),
  z.object({ version: z.literal(2), type: z.literal('traffic'), batch: trafficBatchSchema, timing: timingSchema }).strict(),
  z.object({ version: z.literal(2), type: z.literal('speedTest'), state: speedTestSchema }).strict(),
  z.object({ version: z.literal(2), type: z.literal('ack'), id: z.string() }).strict(),
  z.object({ version: z.literal(2), type: z.literal('error'), id: z.string().nullable(), message: z.string() }).strict(),
]);
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Endpoint = z.infer<typeof endpointSchema>;
export type Sample = z.infer<typeof sampleSchema>;
export type Metrics = z.infer<typeof metricsSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Command = { version: 2; id: string } & ({ type: 'ready' | 'pause' | 'resume' | 'reset' | 'startSpeedTest' | 'cancelSpeedTest' } | { type: 'configure'; settings: Settings });
export interface WebViewBridge { postMessage(message: Command): void; addEventListener(type: 'message', handler: (event: MessageEvent) => void): void; removeEventListener(type: 'message', handler: (event: MessageEvent) => void): void }
declare global { interface Window { chrome?: { webview?: WebViewBridge } } }
