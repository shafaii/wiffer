import { memo, useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { Snapshot, Wifi } from './contract';
import { springStep } from './SpeedDial';
import { fieldStrength, labActive, labState, wifiHistory, wifiSeries, type WifiPoint } from './wifiModel';
import { haloQuality, haloState } from './haloModel';
import './wifiLab.css';
echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);
const fmt = (v: number | null | undefined, digits = 0) => v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: digits });


// Display-only spring motion. No React renders per frame or perpetual idle animation.
function useFieldMotion(active: boolean, rssi: number | null, quality: number | null) {
  const root = useRef<HTMLDivElement>(null);
  const motion = useRef([{ position: 0, velocity: 0 }, { position: 0, velocity: 0 }]);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const targets = [active ? fieldStrength(rssi) : 0, active ? haloQuality(quality) ?? 0 : 0];
    let frame = 0, previous = performance.now();
    const draw = (time: number) => {
      frame = 0;
      let settled = true;
      motion.current = motion.current.map((m, i) => {
        const next = media.matches || !active ? { position: targets[i], velocity: 0 } : springStep(m.position, m.velocity, targets[i], (time - previous) / 1000);
        const done = Math.abs(next.position - targets[i]) < .0002 && Math.abs(next.velocity) < .003;
        settled &&= done;
        return done ? { position: targets[i], velocity: 0 } : next;
      });
      previous = time;
      const [r, q] = motion.current;
      root.current?.style.setProperty('--field', String(r.position));
      root.current?.style.setProperty('--link', String(q.position));
      root.current?.style.setProperty('--response', String(Math.min(1, Math.abs(r.velocity) + Math.abs(q.velocity))));

      if (!settled && !document.hidden) frame = requestAnimationFrame(draw);
    };
    const restart = () => { cancelAnimationFrame(frame); previous = performance.now(); if (!document.hidden) draw(previous); };
    media.addEventListener('change', restart); document.addEventListener('visibilitychange', restart); restart();
    return () => { cancelAnimationFrame(frame); media.removeEventListener('change', restart); document.removeEventListener('visibilitychange', restart); };
  }, [active, rssi, quality]);
  return root;
}
function WirelessHalo({ wifi, active, state }: { wifi: Wifi | null; active: boolean; state: string }) {
  return <svg className="wifi-sculpture wireless-halo" viewBox="0 0 640 380" role="img" aria-label={`Wireless halo: ${state}. Reported quality ${active ? fmt(wifi?.signalQuality) : 'unavailable'} percent. RSSI ${active ? fmt(wifi?.rssiDbm) : 'unavailable'} dBm.`} data-quality-available={active && wifi?.signalQuality != null} data-halo-state={state}>
    <defs>
      <radialGradient id="halo-body" cx="35%" cy="25%" r="78%"><stop stopColor="#325f7e"/><stop offset=".45" stopColor="#132f48"/><stop offset=".85" stopColor="#071424"/><stop offset="1" stopColor="#28475d"/></radialGradient>
      <radialGradient id="halo-light" cx="32%" cy="24%" r="78%"><stop stopColor="#e0f7ff"/><stop offset=".15" stopColor="#8fd9ff"/><stop offset=".46" stopColor="#237bb3"/><stop offset=".8" stopColor="#102c48"/><stop offset="1" stopColor="#5cb6e1"/></radialGradient>
      <radialGradient id="halo-bloom"><stop stopColor="#42aaff" stopOpacity=".19"/><stop offset=".65" stopColor="#429fff" stopOpacity=".05"/><stop offset="1" stopColor="#429fff" stopOpacity="0"/></radialGradient>
      <linearGradient id="halo-orbit" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#234359"/><stop offset=".45" stopColor="#8acde9"/><stop offset=".65" stopColor="#e4f8ff"/><stop offset="1" stopColor="#244860"/></linearGradient>
      <linearGradient id="halo-fill" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#e8faff"/><stop offset=".5" stopColor="#95ddff"/><stop offset="1" stopColor="#418ebf"/></linearGradient>
    </defs>
    <circle className="halo-bloom" cx="320" cy="183" r="176" fill="url(#halo-bloom)"/>
    <g className="halo-orbits" fill="none" stroke="url(#halo-orbit)">
      <ellipse cx="320" cy="183" rx="197" ry="61" transform="rotate(-24 320 183)" strokeWidth="1.2" opacity=".5"/>
      <ellipse cx="320" cy="183" rx="159" ry="104" transform="rotate(38 320 183)" strokeWidth=".8" opacity=".35"/>
    </g>
    <circle cx="320" cy="183" r="87" fill="url(#halo-body)" stroke="#50718a" strokeOpacity=".3"/>
    <circle className="halo-core" cx="320" cy="183" r="87" fill="url(#halo-light)"/>
    <path d="M259 153C269 122 301 104 331 109" fill="none" stroke="#d2efff" strokeWidth="1.1" opacity=".25"/>
    <g className="halo-orbits" fill="none">
      <path d="M140 263A197 61 -24 0 0 500 103" stroke="#081522" strokeWidth="5"/>
      <path d="M140 263A197 61 -24 0 0 500 103" stroke="url(#halo-orbit)" strokeWidth="1.7"/>
    </g>
    <circle className="halo-track" cx="320" cy="183" r="122" fill="none" stroke="#385269" strokeWidth="2"/>
    <g transform="rotate(-90 320 183)" fill="none">
      <circle className="halo-fill halo-soft" cx="320" cy="183" r="122" pathLength="100" stroke="#82d8ff" strokeWidth="9"/>
      <circle className="halo-fill" cx="320" cy="183" r="122" pathLength="100" stroke="url(#halo-fill)" strokeWidth="3"/>
    </g>
    <path d="M320 55v7" stroke="#d3eaff" strokeWidth="1.5" opacity=".6"/>
    <path className="wifi-slash" d="M276 227 364 139" stroke="#a6bbca" strokeWidth="3"/>
    <g className="wifi-pause" stroke="#b0bdcb" strokeWidth="5" strokeLinecap="round"><path d="M312 173v20M328 173v20"/></g>
    <circle className="wifi-pending" cx="320" cy="183" r="105" fill="none" stroke="#9db8cb" strokeWidth="2" strokeDasharray="20 16"/>
  </svg>;
}
const chartNames = ['RSSI', 'Reported quality', 'Negotiated rates', 'Gateway RTT'] as const;
const LabChart = memo(function LabChart({ kind, points, snapshot, seconds }: { kind: number; points: WifiPoint[]; snapshot: Snapshot | null; seconds: number }) {
  const element = useRef<HTMLDivElement>(null), instance = useRef<echarts.EChartsType | null>(null);
  useEffect(() => {
    const chart = echarts.init(element.current!, undefined, { renderer: 'canvas' }); instance.current = chart;
    chart.group = 'wifi-lab'; echarts.connect('wifi-lab');
    const observer = new ResizeObserver(() => chart.resize()); observer.observe(element.current!);
    return () => { observer.disconnect(); chart.dispose(); instance.current = null; };
  }, []);
  useEffect(() => {
    const now = snapshot ? Date.parse(snapshot.now) : Date.now();
    const fields = kind === 0 ? ['rssiDbm'] as const : kind === 1 ? ['signalQuality'] as const : ['rxLinkMbps', 'txLinkMbps'] as const;
    const data = kind === 3 ? [snapshot?.gateway.samples.flatMap((s, i, all) => [
      ...(i && Date.parse(s.timestamp) - Date.parse(all[i-1].timestamp) > 1800 ? [[Date.parse(s.timestamp)-1, null]] : []), [Date.parse(s.timestamp), s.rttMs]]) ?? []] : fields.map(f => wifiSeries(points, f));
    instance.current?.setOption({ animation: false, grid: { left: 44, right: 18, top: 14, bottom: 25 },
      tooltip: { trigger: 'axis', confine: true, backgroundColor: '#102235', borderColor: '#416079', textStyle: { color: '#e7f6ff', fontSize: 11 }, valueFormatter: (v: unknown) => v == null ? 'Unavailable' : `${v} ${kind === 0 ? 'dBm' : kind === 1 ? '%' : kind === 2 ? 'Mbps' : 'ms'}` },
      xAxis: { type: 'time', min: now-seconds*1000, max: now, splitNumber: 3, axisLine: { lineStyle: { color: '#2a4054' } }, axisTick: { show: false }, axisLabel: { color: '#809cb4', fontSize: 9, hideOverlap: true, formatter: (v: number) => new Date(v).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }) }, splitLine: { show: false } },
      yAxis: { type: 'value', min: kind === 0 ? (v: { min: number }) => Math.min(-100, v.min) : 0, max: kind === 0 ? (v: { max: number }) => Math.max(-30, v.max) : kind === 1 ? 100 : undefined, splitNumber: 3, axisLabel: { color: '#809cb4', fontSize: 9 }, splitLine: { lineStyle: { color: '#243a4c', type: 'dashed', opacity: .6 } } },
      series: data.map((values, i) => ({ id: `lab-${kind}-${i}`, name: kind === 2 ? i ? 'TX' : 'RX' : chartNames[kind], type: 'line', showSymbol: false, connectNulls: false, smooth: false, data: values.filter(p => Number(p[0]) > now-seconds*1000 && Number(p[0]) <= now), lineStyle: { color: i ? '#c4e9ff' : '#68caff', width: 1.6, type: i ? 'dashed' : 'solid' }, itemStyle: { color: i ? '#c4e9ff' : '#68caff' }, areaStyle: kind !== 2 ? { color: '#58bfff', opacity: .04 } : undefined })) });
  }, [kind, points, snapshot, seconds]);
  const latest = snapshot?.network.details?.wifi;
  const value = kind === 0 ? latest?.rssiDbm : kind === 1 ? latest?.signalQuality : kind === 2 ? latest?.rxLinkMbps : snapshot?.gateway.samples.at(-1)?.rttMs;
  return <article className="lab-chart"><div className="lab-chart-head"><h3>{chartNames[kind]}</h3><span>{fmt(value, 1)}{kind === 2 ? ` / ${fmt(latest?.txLinkMbps,1)}` : ''} <small>{['dBm','%','Mbps','ms'][kind]}</small></span></div><div className="lab-chart-canvas" ref={element}/></article>;
});
export function WifiLab({ snapshot, stale }: { snapshot: Snapshot | null; stale: boolean }) {
  const [now, setNow] = useState(Date.now()), [seconds, setSeconds] = useState(60);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const wifi = snapshot?.network.details?.wifi ?? null, points = wifiHistory.points;
  const state = labState(snapshot, stale, now, points), active = labActive(state);
  const root = useFieldMotion(active, wifi?.rssiDbm ?? null, wifi?.signalQuality ?? null);
  const at = snapshot?.network.observedAt;
  const rows = [['Adapter', snapshot?.network.adapterName], ['SSID', wifi?.ssid], ['BSSID', wifi?.bssid], ['Adapter MAC', wifi?.mac], ['Band', wifi?.band], ['Channel', wifi?.channel], ['Radio type', wifi?.radioType], ['Authentication', wifi?.authentication], ['Cipher', wifi?.cipher], ['Connection mode', wifi?.connectionMode], ['Native state', wifi?.state], ['Observation (UTC)', at], ['RSSI (dBm)', wifi?.rssiDbm], ['Reported quality (%)', wifi?.signalQuality], ['Negotiated RX (Mbps)', wifi?.rxLinkMbps], ['Negotiated TX (Mbps)', wifi?.txLinkMbps], ['Gateway RTT (ms)', snapshot?.gateway.samples.at(-1)?.rttMs]];
  return <section className={`wifi-lab ${active ? 'lab-live' : 'lab-inactive'} ${state === 'Degraded' || state === 'Weakening' ? 'lab-warning' : ''}`} ref={root} data-state={state}>
    <article className="lab-hero" data-observed-at={at ?? ''} data-band={active ? wifi?.band ?? '' : ''}>
      <WirelessHalo wifi={wifi} active={active} state={haloState(state, wifi?.signalQuality)}/>
      <div className="wifi-state" role="status">{haloState(state, wifi?.signalQuality)}</div>
      <div className="wifi-numbers"><span aria-label="Reported quality" className="wifi-quality-number">{active ? fmt(wifi?.signalQuality) : '—'}<small>%</small></span><span aria-label="RSSI" className="wifi-rssi-number">{active ? fmt(wifi?.rssiDbm) : '—'}<small>dBm</small></span></div>
    </article>
    <div className="lab-history-heading"><h2>History</h2><div className="segmented" aria-label="Wi-Fi history window">{[60,300].map(n=><button key={n} aria-pressed={seconds===n} className={seconds===n?'selected':''} onClick={()=>setSeconds(n)}>{n===60?'60 seconds':'5 minutes'}</button>)}</div></div>
    <div className="lab-charts">{chartNames.map((_,kind)=><LabChart key={kind} kind={kind} points={points} snapshot={snapshot} seconds={seconds}/>)}</div>
    <details className="connection-inspector lab-inspector"><summary><span>TECHNICAL INSPECTOR <b>Native Windows Wi-Fi</b></span><span>ASSOCIATION & MEASUREMENT NOTES <i>＋</i></span></summary><dl>{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value ?? 'Unavailable'}</dd></div>)}</dl>
      {wifi?.unavailableReason && <p className="amber">{wifi.unavailableReason}</p>}<p>{snapshot?.network.details?.selection ?? 'No selected Wi-Fi adapter.'} · Gateway ICMP follows Windows routing and may include other path effects. Gateway replies keep their own completion timestamps; they are not atomic with radio queries.</p>
      <p>Halo circumference maps reported quality linearly from 0 to 100%, clockwise from the top marker. Orb intensity follows the same independent quality reading. Excellent ≥80%, good ≥60%, fair ≥40%, weak below 40% are display categories, not reliability guarantees. Missing quality suppresses the live halo. RSSI remains a separate exact measurement, never a distance. Existing weakening/degraded diagnostics remain independent. Weakening means a drop of at least 4 dB across 2–4.5 seconds; degraded means RSSI below −75 dBm or quality below 40%. These display thresholds do not identify a cause. Unknown radio fields remain unavailable, including ambiguous multi-link band/channel/RSSI. No distance, interference, SNR, retries or band switching is inferred.</p>
      <p>Native query completion is the shared timestamp. Older than 3.5 seconds is stale. Pausing freezes acquisition. History is bounded to 600 observations, with gaps for missed polls and detected BSSID changes. Counter throughput is separate. The graphics spring between measurements and stop when settled; numbers and charts never interpolate.</p>
    </details>
  </section>;
}
