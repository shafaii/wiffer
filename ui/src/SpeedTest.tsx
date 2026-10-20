import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { Command, SpeedTestState } from './contract';
let state: SpeedTestState | null = null;
const listeners = new Set<() => void>();
export const speedTestStore = {
  accept(next: SpeedTestState) { state = next; listeners.forEach(fn => fn()); },
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  snapshot: () => state,
};
const number = (n: number | null | undefined) => n == null ? '—' : n.toFixed(2);
export function SpeedTest({ command, pending, onClose }: { command: (type: Command['type']) => Promise<boolean>; pending: boolean; onClose: () => void }) {
  const test = useSyncExternalStore(speedTestStore.subscribe, speedTestStore.snapshot);
  const dialog = useRef<HTMLDialogElement>(null);
  const running = test?.status === 'running';
  useEffect(() => { dialog.current?.showModal(); }, []);
  const close = async () => { if (running) await command('cancelSpeedTest'); onClose(); };
  return <dialog ref={dialog} className="speed-dialog" onCancel={e => { e.preventDefault(); void close(); }}>
    <div className="dialog-head"><div><div className="eyebrow">ON DEMAND / INTERNET ↔ THIS PC</div><h2>Quick Speed Test</h2></div><button onClick={() => void close()} aria-label="Close speed test" disabled={pending}>×</button></div>
    <p className="speed-warning">This test saturates your connection and may temporarily increase gaming latency. It transfers up to 384 MB of test data, takes up to 35 seconds, and only starts when you select Start test.</p>
    <div className="test-results"><div><small>↓ DOWNLOAD</small><strong>{number(running ? test.liveDownloadMbps ?? test.downloadMbps : test?.downloadMbps)}</strong><em>Mbps</em></div><div><small>↑ UPLOAD</small><strong>{number(running ? test.liveUploadMbps ?? test.uploadMbps : test?.uploadMbps)}</strong><em>Mbps</em></div></div>
    <div className="test-status"><span>{running ? 'Live active direction · sustained completed direction' : test?.status === 'complete' ? 'Sustained average · measured transfer windows' : 'No final result'}</span><span>{(test?.elapsedSeconds ?? 0).toFixed(1)} s</span></div>
    <div className="test-latencies"><span>Idle <b>{number(test?.idleLatencyMs)} ms</b></span><span>Loaded ↓ <b>{number(test?.downloadLatencyMs)} ms</b></span><span>Loaded ↑ <b>{number(test?.uploadLatencyMs)} ms</b></span></div>
    <progress max={1} value={test?.progress ?? 0} aria-label="Speed test progress"/>
    <div className="test-status" role="status"><span>{test?.phase ?? 'Ready'}</span><span>{test?.server ?? 'Cloudflare edge'} · speed.cloudflare.com</span></div>
    {test?.error && <p className="test-error" role="alert">{test.error}</p>}
    <p>Transfer windows: ↓ {number(test?.downloadSeconds)} s / ↑ {number(test?.uploadSeconds)} s. Measures HTTPS internet throughput between Cloudflare and this PC using two transfer streams. Includes request overhead; bounded test results may understate very fast links. Upload live values count completed requests and can arrive in bursts. HTTP latency includes server time and is not ICMP ping.</p>
    <p>Local PC traffic instruments include LAN traffic and other apps. This is <b>not a PC-to-modem LAN capacity test</b>; that requires a compatible local test endpoint. Cloudflare receives your IP and test requests. Wiffer does not submit a results report.</p>
    <div className="dialog-actions"><span className="muted">{((test?.downloadBytes ?? 0) / 1e6).toFixed(1)} MB ↓ / {((test?.uploadBytes ?? 0) / 1e6).toFixed(1)} MB ↑</span>{running ? <button disabled={pending} onClick={() => void command('cancelSpeedTest')}>Cancel test</button> : <button className="primary" disabled={pending} onClick={() => void command('startSpeedTest')}>Start test</button>}</div>
  </dialog>;
}
