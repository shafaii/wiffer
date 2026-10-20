import { useEffect, useMemo, useRef, useState } from 'react';
import { InstrumentChart, instruments, type Instrument } from './InstrumentChart';
import { TrafficDeck } from './SpeedDial';
import { trafficStore } from './trafficStore';
import { SpeedTest } from './SpeedTest';
import { TelemetryDiagnostics } from './TelemetryDiagnostics';
import { FrameCheck } from './FrameCheck';
import { useMonitor } from './useMonitor';
import type { Endpoint, Metrics, Settings, Snapshot } from './contract';

const number = (v: number | null | undefined, digits = 1) => v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
const elapsed = (seconds: number) => [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, Math.floor(seconds) % 60].map(v => String(v).padStart(2, '0')).join(':');

function Glyph({ name, size = 18 }: { name: 'pulse' | 'settings' | 'pause' | 'play' | 'reset' | 'close' | 'arrow' | 'history' | 'computer' | 'router' | 'globe'; size?: number }) {
  const paths = { pulse: 'M2 12h5l3-8 4 16 3-8h5', settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2', pause: 'M8 5v14M16 5v14', play: 'm8 4 12 8-12 8Z', reset: 'M4 9a8 8 0 1 1 0 7M4 3v6h6', close: 'm6 6 12 12M6 18 18 6', arrow: 'M4 12h16m-6-6 6 6-6 6', history: 'M3 11a9 9 0 1 1 3 8M3 4v7h7m2-5v6l4 3', computer: 'M3 4h18v12H3Zm5 16h8m-4-4v4', router: 'M3 14h18v6H3Zm3-1V5m12 8V5M6 17h1m3 0h1', globe: 'M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18' };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

function Latest({ endpoint, color, now, inactive }: { endpoint?: Endpoint; color: string; now?: string; inactive: boolean }) {
  const sample = endpoint?.samples.at(-1);
  const stale = sample && now && Date.parse(now) - Date.parse(sample.timestamp) > 4500;
  return <div className={`hero-reading ${color} ${inactive || stale ? 'muted-reading' : ''}`}>
    <div className="eyebrow"><span className="trace-dot" />{endpoint?.id === 'gateway' || color === 'gateway' ? 'GATEWAY' : 'INTERNET'}<span className="target">{endpoint?.target ?? 'Not detected'}</span></div>
    <div className="reading"><span>{sample?.status === 'success' ? number(sample.rttMs) : '—'}</span><span className="unit">ms</span>
      <span className={`reading-status ${sample && sample.status !== 'success' ? 'coral' : ''}`}>{!sample ? 'Awaiting reply' : sample.status === 'timeout' ? 'Timed out' : sample.status === 'error' ? 'Probe error' : inactive ? 'Last reply' : stale ? 'Waiting for reply' : 'Latest reply'}</span>
    </div>
    <div className="reading-detail" title={sample?.error ?? ''}>{sample?.error ?? (sample ? `Received ${new Date(sample.timestamp).toLocaleTimeString()}` : 'Native ICMP · no samples yet')}</div>
  </div>;
}

function MetricRow({ endpoint, seconds }: { endpoint: Endpoint; seconds: number }) {
  const metrics: Metrics = seconds === 60 ? endpoint.stats60 : endpoint.stats300;
  return <div className={`metric-row ${endpoint.id}`}>
    <div className="metric-name"><span className="trace-dot" /><strong>{endpoint.id === 'gateway' ? 'Gateway' : 'Internet'}</strong><small>{metrics.sent} measured</small></div>
    {[metrics.min, metrics.average, metrics.max, metrics.median, metrics.p95, metrics.variation].map((v, i) => <div key={i} className={i === 2 && (v ?? 0) > 100 ? 'amber' : ''}>{number(v)}<small>ms</small></div>)}
    <div className={(metrics.lossPercent ?? 0) > 0 ? 'coral' : 'mint'}>{number(metrics.lossPercent)}<small>%</small></div>
  </div>;
}

function SettingsDialog({ snapshot, pending, error, onClose, onSave }: { snapshot: Snapshot; pending: boolean; error: string | null; onClose: () => void; onSave: (settings: Settings) => Promise<boolean> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [gateway, setGateway] = useState(snapshot.settings.gatewayOverride ?? '');
  const [internet, setInternet] = useState(snapshot.settings.internetTarget);
  const [timeout, setTimeoutValue] = useState(snapshot.settings.timeoutMs);
  const [validation, setValidation] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  const validIp = (value: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(value) && value.split('.').every(v => Number(v) <= 255 && String(Number(v)) === v) && Number(value.split('.')[0]) > 0 && Number(value.split('.')[0]) < 224 && !value.endsWith('.255');
  return <dialog ref={dialog} className="settings-dialog" onCancel={onClose}>
    <div className="dialog-head"><div><div className="eyebrow">MEASUREMENT SETUP</div><h2>Follow the right path.</h2></div><button className="icon-button" onClick={onClose} aria-label="Close settings"><Glyph name="close" /></button></div>
    <form onSubmit={async e => { e.preventDefault(); if ((gateway && !validIp(gateway)) || !validIp(internet)) { setValidation('Enter a valid IPv4 unicast address, such as 192.168.1.1.'); return; } if (await onSave({ gatewayOverride: gateway || null, internetTarget: internet, timeoutMs: timeout })) onClose(); }}>
      <label>Detected network<select value="" onChange={e => setGateway(e.target.value)}><option value="">Choose a detected gateway…</option>{snapshot.network.adapters.map(a => <option key={a.id} value={a.gateway}>{a.name} · {a.gateway}</option>)}</select></label>
      <label>Gateway target <span>Leave empty for automatic detection</span><input autoFocus value={gateway} onChange={e => setGateway(e.target.value.trim())} placeholder={snapshot.network.gateway ?? '192.168.1.1'} maxLength={15} /></label>
      <label>Internet target<input value={internet} onChange={e => setInternet(e.target.value.trim())} required maxLength={15} /></label>
      <label>Reply timeout <span>250–10,000 milliseconds</span><input type="number" min="250" max="10000" step="1" required value={timeout} onChange={e => setTimeoutValue(Number(e.target.value))} /></label>
      <p className="muted">Changing settings starts a fresh session. Targets are IPv4 addresses. Settings last for this app session.</p>
      {(validation || error) && <p className="coral" role="alert">{validation || error}</p>}
      <div className="dialog-actions"><button type="button" onClick={() => { setGateway(''); setInternet('1.1.1.1'); setTimeoutValue(2500); }}>Restore defaults</button><button className="primary" disabled={pending} type="submit">{pending ? 'Applying…' : 'Apply settings'}<Glyph name="arrow" /></button></div>
    </form>
  </dialog>;
}

function History() {
  const records = [{ name: 'Internet', sent: 30, lost: 0, min: 5, avg: 42, max: 279 }, { name: 'Router', sent: 30, lost: 0, min: 5, avg: 49, max: 516 }, { name: 'Router', sent: 140, lost: 1, min: 2, avg: 119, max: 1199 }, { name: 'Router', sent: 120, lost: 0, min: 2, avg: 82, max: 1894 }];
  return <section className="history-view">
    <div className="section-heading"><div><div className="eyebrow">IMPORTED CONTEXT · NON-LIVE</div><h1>Earlier observations.</h1><p className="muted">Summary records supplied during troubleshooting. Dates and individual samples were not provided.</p></div><span className="outline-tag"><Glyph name="history" />6 summary records</span></div>
    <div className="historical-table"><div className="historical-row table-head"><span>ENDPOINT / RECORD</span><span>SENT</span><span>LOST</span><span>MIN</span><span>AVERAGE</span><span>MAX</span></div>
      {records.map((r, i) => <div className="historical-row" key={i}><span><small className="record-number">0{i + 1}</small><strong>{r.name}</strong></span><span>{r.sent}</span><span className={r.lost ? 'coral' : ''}>{r.lost}</span><span>{r.min}<small> ms</small></span><span>{r.avg}<small> ms</small></span><span className="amber">{r.max.toLocaleString()}<small> ms</small></span></div>)}
    </div>
    <div className="speedtests">{[{ name: 'A', down: '292.44', up: '103.70', idle: 23, download: 90, upload: 514 }, { name: 'B', down: '287.37', up: '122.84', idle: 19, download: 67, upload: 411 }].map(s => <article className="speedtest" key={s.name}>
      <div className="eyebrow">SPEEDTEST {s.name}<span className="muted">IMPORTED SUMMARY</span></div><div className="speed-numbers"><div><small>↓ DOWNLOAD</small><strong>{s.down}<em>Mbps</em></strong></div><div><small>↑ UPLOAD</small><strong>{s.up}<em>Mbps</em></strong></div></div>
      <div className="loaded-latency"><span>Idle <b>{s.idle} ms</b></span><span>Loaded ↓ <b>{s.download} ms</b></span><span>Loaded ↑ <b className="amber">{s.upload} ms</b></span></div>
    </article>)}</div>
    <aside className="context-note"><span className="note-icon">i</span><div><strong>Observation context</strong><p>Concurrent traffic was reported during troubleshooting. These summaries do not establish the cause of latency. These imported tests are separate from Wiffer’s on-demand Quick Speed Test.</p></div></aside>
  </section>;
}

function ConnectionInspector({ snapshot }: { snapshot: Snapshot | null }) {
  const details = snapshot?.network.details, wifi = details?.wifi;
  const unavailable = 'Unavailable';
  const rows = [
    ['Adapter', snapshot?.network.adapterName], ['Connection', details?.type], ['Operational state', details?.operationalState],
    ['SSID', wifi?.ssid], ['Band / channel', wifi ? `${wifi.band ?? unavailable} / ${wifi.channel ?? unavailable}` : unavailable],
    ['RSSI', wifi?.rssiDbm != null ? `${wifi.rssiDbm} dBm` : unavailable], ['Signal quality', wifi?.signalQuality != null ? `${wifi.signalQuality}%` : unavailable],
    ['Negotiated RX / TX', wifi ? `${number(wifi.rxLinkMbps)} / ${number(wifi.txLinkMbps)} Mbps` : unavailable],
    ['Gateway / external', `${snapshot?.gateway.target ?? unavailable} / ${snapshot?.internet.target ?? unavailable}`],
    ['Bytes received / sent', `${details?.bytesReceived ?? unavailable} / ${details?.bytesSent ?? unavailable}`],
    ['Interface errors RX / TX', `${details?.receiveErrors ?? unavailable} / ${details?.sendErrors ?? unavailable}`],
    ['Interface discards RX / TX', `${details?.receiveDiscards ?? unavailable} / ${details?.sendDiscards ?? unavailable}`],
  ];
  return <details className="connection-inspector"><summary><span>CONNECTION INSPECTOR <b>{snapshot?.network.adapterName ?? 'Awaiting adapter'}</b></span><span>{details?.type ?? 'Native Windows'} <i>＋</i></span></summary>
    <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? unavailable}</dd></div>)}</dl>
    <p>{details?.selection ?? snapshot?.network.error ?? 'Waiting for network information.'} · ICMP follows Windows routing.</p>
    {wifi?.unavailableReason && <p className="amber">{wifi.unavailableReason}</p>}
    {details?.counterError && <p className="amber">{details.counterError}</p>}
    <p>Link rates describe the Wi-Fi association, not measured throughput. Error/discard counters are driver-reported cumulative interface totals, not ICMP loss. Wi-Fi retry/frame-failure diagnostics are unavailable until driver support is validated. Radio details refresh every 3 seconds.</p>
  </details>;
}

export function App() {
  const { snapshot, error, pending, stale, command, clearError } = useMonitor();
  const [page, setPage] = useState<'live' | 'history'>('live');
  const [seconds, setSeconds] = useState(60);
  const [focus, setFocus] = useState(true);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [expanded, setExpanded] = useState<Instrument | null>(null);
  const traffic = useMemo(() => trafficStore.history(), [snapshot]); // Main cockpit/chart updates are limited to the 1 Hz host snapshot.
  const connected = snapshot?.network.connected;
  const inactive = !snapshot || snapshot.paused || !connected || stale;
  const state = !snapshot ? 'Awaiting desktop' : stale ? 'Host connection lost' : snapshot.paused ? 'Paused' : snapshot.network.error ? 'Detection unavailable' : !connected ? 'Disconnected' : 'Monitoring';
  useEffect(() => { const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(null); }; window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape); }, []);
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><img className="brand-icon" src="/wiffer.svg" alt="Wiffer detective mascot" /><span>Wiffer<small>SNIFF OUT YOUR NETWORK PROBLEMS.</small></span><span className="edition">M0.7</span></div>
      <nav aria-label="Main views"><button className={page === 'live' ? 'active' : ''} onClick={() => setPage('live')}>Instruments</button><button className={page === 'history' ? 'active' : ''} onClick={() => setPage('history')}>Historical context <span className="count">6</span></button></nav>
      <div className="header-tools"><span className="local-label">ON DEVICE / WINDOWS</span><button aria-label="Measurement settings" disabled={!snapshot} onClick={() => setSettings(true)}><Glyph name="settings" /></button></div>
    </header>
    {!snapshot && <div className="host-banner">Desktop host not connected. Open Wiffer.exe. This browser view contains no simulated telemetry.</div>}
    {stale && <div className="host-banner">Host updates stopped. All displayed measurements are stale.</div>}
    {snapshot?.network.error && <div className="host-banner">{snapshot.network.error}</div>}
    {error && <div className="error-banner" role="alert">{error}<button onClick={clearError} aria-label="Dismiss error">×</button></div>}
    {page === 'history' ? <History /> : <main>
      <div className="session-strip"><div className="connection-state"><span className={`status-dot ${!inactive ? 'is-live' : ''}`} /><strong>{state}</strong><span>{snapshot?.network.adapterName ?? 'Native instrumentation'}</span><span className="strip-path">{snapshot?.gateway.target ?? 'Gateway unknown'} <i>→</i> {snapshot?.internet.target ?? '1.1.1.1'}</span></div>
        <div className="session-actions"><span className="session-clock">{elapsed(snapshot?.runningSeconds ?? 0)}<small>ACTIVE TIME</small></span><button className="test-speed" disabled={!snapshot || stale} onClick={() => setSpeedOpen(true)}>↗ Test Speed</button><button disabled={!snapshot || pending || stale} onClick={() => command(snapshot?.paused ? 'resume' : 'pause')}><Glyph name={snapshot?.paused ? 'play' : 'pause'} />{snapshot?.paused ? 'Resume' : 'Pause'}</button><button disabled={!snapshot || pending || stale} onClick={() => command('reset')}><Glyph name="reset" />Reset</button></div>
      </div>
      <div className="cockpit"><TrafficDeck inactive={inactive || !snapshot?.network.adapterId} state={!snapshot?.network.adapterId && snapshot ? 'Interface unavailable' : state} /><section className="signal-deck"><div className="instrument-bar"><span>PATH RESPONSE</span><span>NATIVE ICMP / ~1 Hz</span></div>
        <div className="signal-readings"><Latest endpoint={snapshot?.gateway} color="gateway" now={snapshot?.now} inactive={inactive} /><Latest endpoint={snapshot?.internet} color="internet" now={snapshot?.now} inactive={inactive} /></div>
        <div className="path-stats">{(['gateway', 'internet'] as const).map(id => { const e = snapshot?.[id], m = seconds === 60 ? e?.stats60 : e?.stats300; return <div key={id}><span>{id === 'gateway' ? 'GW' : 'EXT'} <small>{seconds}s</small></span><span>AVG <b>{number(m?.average)}<small>ms</small></b></span><span>P95 <b>{number(m?.p95)}<small>ms</small></b></span><span>LOSS <b className={(m?.lossPercent ?? 0) > 0 ? 'coral' : ''}>{number(m?.lossPercent)}<small>%</small></b></span></div>; })}</div>
        <div className="signal-caption">Two independent endpoints. Spikes are observations, not diagnoses.</div>
      </section></div>
      <section className="scope-bank"><div className="scope-toolbar"><div><h2>Signal history</h2><span>SYNCHRONIZED INSTRUMENTS</span></div><div className="chart-controls"><button className="scale-toggle" onClick={() => setFocus(!focus)}>{focus ? 'RTT focus scale¹' : 'RTT linear scale'}</button><div className="segmented" aria-label="Shared chart time window">{[60, 300].map(s => <button key={s} aria-pressed={seconds === s} className={seconds === s ? 'selected' : ''} onClick={() => setSeconds(s)}>{s === 60 ? '60 seconds' : '5 minutes'}</button>)}</div></div></div>
        {expanded && <div className="inspector-backdrop" onClick={() => setExpanded(null)} />}
        <div className="chart-grid">{instruments.map(kind => <InstrumentChart key={kind} kind={kind} snapshot={snapshot} traffic={traffic} seconds={seconds} focus={focus} stale={stale} expanded={expanded === kind} onExpand={() => setExpanded(expanded === kind ? null : kind)} />)}</div>
        <div className="bank-caption"><span>¹ RTT focus: linear 0–30 ms, logarithmic above. Hover for exact values. <b className="coral">◆</b> Failed probe, no RTT.</span><span>All times local · {seconds}s window</span></div>
      </section>
      <ConnectionInspector snapshot={snapshot} />
      <details className="measurement-details"><summary>Rolling statistics & measurement notes</summary><div className="metrics-table"><div className="metric-row table-head"><span>ENDPOINT</span><span>MIN</span><span>AVG</span><span>MAX</span><span>MEDIAN</span><span>P95</span><span>VARIATION</span><span>LOSS</span></div>{snapshot && <><MetricRow endpoint={snapshot.gateway} seconds={seconds} /><MetricRow endpoint={snapshot.internet} seconds={seconds} /></>}</div>
        <p>Loss = (timeouts + transport errors) ÷ completed probes. Canceled probes and disconnected intervals are not loss. RTT statistics use successes only; P95 uses nearest rank. Summary variation uses successive successful RTTs within the selected window; the chart uses a 10-second window and skips failures. Missing replies break traces.</p>
        <p>Speeds = byte-counter delta × 8 ÷ monotonic elapsed seconds ÷ 1,000,000. This is total traffic through the selected physical interface, including LAN traffic. The short average is time-weighted over approximately 3 seconds. Auto arc ranges only grow during this view; select a fixed range for comparisons. Numbers are measured; only the illuminated arcs use spring motion. No speed tests run automatically.</p><TelemetryDiagnostics snapshot={snapshot}/><FrameCheck />
      </details>
    </main>}
    <footer><span><span className="tiny-dot" /> LOCAL MEASUREMENTS <i>/</i> ICMP ~1 Hz <i>/</i> TRAFFIC ~4 Hz <i>/</i> {snapshot?.settings.timeoutMs ?? 2500} ms timeout</span><span>Wiffer <b>0.7</b></span></footer>
    {speedOpen && <SpeedTest command={command} pending={pending} onClose={() => setSpeedOpen(false)} />}
    {settings && snapshot && <SettingsDialog snapshot={snapshot} pending={pending} error={error} onClose={() => setSettings(false)} onSave={s => command('configure', s)} />}
  </div>;
}
