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
function SignalField({ wifi, active, state }: { wifi: Wifi | null; active: boolean; state: string }) {
  const surface = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = surface.current!, media = matchMedia('(prefers-reduced-motion: reduce)');
    let target = [0,0], positions = [{position:0,velocity:0},{position:0,velocity:0}], frame = 0, previous = 0, dragging = false;
    const draw = (time: number) => {
      frame = 0;
      positions = positions.map((p,i)=>media.matches ? {position:0,velocity:0} : springStep(p.position,p.velocity,target[i],previous ? (time-previous)/1000 : 0)); previous=time;
      el.style.setProperty('--px',String(positions[0].position)); el.style.setProperty('--py',String(positions[1].position));
      if (!document.hidden && !media.matches && positions.some((p,i)=>Math.abs(p.position-target[i])>.001 || Math.abs(p.velocity)>.003)) frame=requestAnimationFrame(draw);
    };
    const wake=()=>{if(!frame&&!document.hidden){previous=0;frame=requestAnimationFrame(draw);}};
    const move=(e:PointerEvent)=>{const r=el.getBoundingClientRect(); const amount=dragging?1:.3; target=[Math.max(-1,Math.min(1,(e.clientX-r.left)/r.width*2-1))*amount,Math.max(-1,Math.min(1,(e.clientY-r.top)/r.height*2-1))*amount];wake();};
    const down=(e:PointerEvent)=>{dragging=true;el.setPointerCapture(e.pointerId);move(e);};
    const reset=()=>{dragging=false;target=[0,0];wake();};
    const leave=()=>{if(!dragging)reset();};
    const visibility=()=>{cancelAnimationFrame(frame);frame=0;reset();};
    el.addEventListener('pointermove',move);el.addEventListener('pointerdown',down);el.addEventListener('pointerup',reset);el.addEventListener('pointercancel',reset);el.addEventListener('lostpointercapture',reset);el.addEventListener('pointerleave',leave);media.addEventListener('change',visibility);document.addEventListener('visibilitychange',visibility);
    return ()=>{cancelAnimationFrame(frame);el.removeEventListener('pointermove',move);el.removeEventListener('pointerdown',down);el.removeEventListener('pointerup',reset);el.removeEventListener('pointercancel',reset);el.removeEventListener('lostpointercapture',reset);el.removeEventListener('pointerleave',leave);media.removeEventListener('change',visibility);document.removeEventListener('visibilitychange',visibility);};
  }, []);
  return <div ref={surface} className="signal-surface" data-quality={active&&wifi?.signalQuality!=null} data-rssi={active&&wifi?.rssiDbm!=null} data-status={state} role="img" aria-label={`Signal field. ${state}. Quality ${active?fmt(wifi?.signalQuality):'unavailable'} percent. RSSI ${active?fmt(wifi?.rssiDbm):'unavailable'} dBm. Drag to explore the surface; interaction does not alter measurements.`}>
    <svg viewBox="0 0 720 320" aria-hidden="true" className="surface-svg">
      <defs><linearGradient id="contour-light" x1="0" y1="0" x2="1" y2=".3"><stop stopColor="#529bc5" stopOpacity="0"/><stop offset=".32" stopColor="#6cc7f3"/><stop offset=".62" stopColor="#c8edff"/><stop offset="1" stopColor="#4489b5" stopOpacity="0"/></linearGradient><linearGradient id="contour-wash" x2="0" y2="1"><stop stopColor="#71cfff" stopOpacity=".16"/><stop offset="1" stopColor="#327eb1" stopOpacity="0"/></linearGradient></defs>
      <g className="surface-displacement"><g className="surface-strength">
        {Array.from({length:14},(_,i)=><path key={i} className="surface-contour" d={`M-30 ${238+i*8} C100 ${260+i*5} 150 ${70+i*10} 315 ${105+i*10} S510 ${270-i*3} 750 ${75+i*11}`} fill="none" stroke="url(#contour-light)" strokeWidth={i===5?1.8:.8} opacity={.25+(.75-Math.abs(i-6)*.08)}/>) }
        <path d="M-30 278C100 285 150 120 315 155S510 255 750 130V340H-30Z" fill="url(#contour-wash)"/>
      </g></g>
    </svg>
    <div className="surface-readout"><span>{active?fmt(wifi?.signalQuality):'—'}<small>%</small></span><span>{active?fmt(wifi?.rssiDbm):'—'}<small>dBm</small></span></div>
    <span className="surface-status">{state}</span>
  </div>;
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
      <SignalField wifi={wifi} active={active} state={haloState(state, wifi?.signalQuality)}/>
      <div className="wifi-state" role="status">{haloState(state, wifi?.signalQuality)}</div>
      <div className="wifi-numbers"><span aria-label="Reported quality" className="wifi-quality-number">{active ? fmt(wifi?.signalQuality) : '—'}<small>%</small></span><span aria-label="RSSI" className="wifi-rssi-number">{active ? fmt(wifi?.rssiDbm) : '—'}<small>dBm</small></span></div>
    </article>
    <div className="lab-history-heading"><h2>History</h2><div className="segmented" aria-label="Wi-Fi history window">{[60,300].map(n=><button key={n} aria-pressed={seconds===n} className={seconds===n?'selected':''} onClick={()=>setSeconds(n)}>{n===60?'60 seconds':'5 minutes'}</button>)}</div></div>
    <div className="lab-charts">{chartNames.map((_,kind)=><LabChart key={kind} kind={kind} points={points} snapshot={snapshot} seconds={seconds}/>)}</div>
    <details className="connection-inspector lab-inspector"><summary><span>TECHNICAL INSPECTOR <b>Native Windows Wi-Fi</b></span><span>ASSOCIATION & MEASUREMENT NOTES <i>＋</i></span></summary><dl>{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value ?? 'Unavailable'}</dd></div>)}</dl>
      {wifi?.unavailableReason && <p className="amber">{wifi.unavailableReason}</p>}<p>{snapshot?.network.details?.selection ?? 'No selected Wi-Fi adapter.'} · Gateway ICMP follows Windows routing and may include other path effects. Gateway replies keep their own completion timestamps; they are not atomic with radio queries.</p>
      <p>Field expansion and illumination follow reported quality. Independent RSSI controls contour compression across −100 to −40 dBm, clipped for display only. Pointer deformation is cosmetic and never changes measurements. Excellent ≥80%, good ≥60%, fair ≥40%, weak below 40% are display categories, not reliability guarantees. Missing quality suppresses the live halo. RSSI remains a separate exact measurement, never a distance. Existing weakening/degraded diagnostics remain independent. Weakening means a drop of at least 4 dB across 2–4.5 seconds; degraded means RSSI below −75 dBm or quality below 40%. These display thresholds do not identify a cause. Unknown radio fields remain unavailable, including ambiguous multi-link band/channel/RSSI. No distance, interference, SNR, retries or band switching is inferred.</p>
      <p>Native query completion is the shared timestamp. Older than 3.5 seconds is stale. Pausing freezes acquisition. History is bounded to 600 observations, with gaps for missed polls and detected BSSID changes. Counter throughput is separate. The graphics spring between measurements and stop when settled; numbers and charts never interpolate.</p>
    </details>
  </section>;
}
