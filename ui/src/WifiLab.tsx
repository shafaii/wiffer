import { memo, useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { Snapshot } from './contract';
import { SignalSurface } from './SignalSurface';
import { liveView, windowEnd } from './surfaceModel';
import { labActive, labState, wifiHistory, wifiSeries, type WifiPoint } from './wifiModel';
import './wifiLab.css';
echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);
const fmt = (v: number | null | undefined, digits = 0) => v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: digits });


const chartNames = ['RSSI', 'Reported quality', 'Negotiated rates', 'Gateway RTT'] as const;
const LabChart = memo(function LabChart({ kind, points, snapshot, seconds, end, selected }: { kind: number; points: WifiPoint[]; snapshot: Snapshot | null; seconds: number; end: number; selected: number | null }) {
  const element = useRef<HTMLDivElement>(null), instance = useRef<echarts.EChartsType | null>(null);
  useEffect(() => {
    const chart = echarts.init(element.current!, undefined, { renderer: 'canvas' }); instance.current = chart;
    chart.group = 'wifi-lab'; echarts.connect('wifi-lab');
    const observer = new ResizeObserver(() => chart.resize()); observer.observe(element.current!);
    return () => { observer.disconnect(); chart.dispose(); instance.current = null; };
  }, []);
  useEffect(() => {
    const now = end;
    const fields = kind === 0 ? ['rssiDbm'] as const : kind === 1 ? ['signalQuality'] as const : ['rxLinkMbps', 'txLinkMbps'] as const;
    const data = kind === 3 ? [snapshot?.gateway.samples.flatMap((s, i, all) => [
      ...(i && Date.parse(s.timestamp) - Date.parse(all[i-1].timestamp) > 1800 ? [[Date.parse(s.timestamp)-1, null]] : []), [Date.parse(s.timestamp), s.rttMs]]) ?? []] : fields.map(f => wifiSeries(points, f));
    instance.current?.setOption({ animation: false, grid: { left: 44, right: 18, top: 14, bottom: 25 },
      tooltip: { trigger: 'axis', confine: true, backgroundColor: '#102235', borderColor: '#416079', textStyle: { color: '#e7f6ff', fontSize: 11 }, valueFormatter: (v: unknown) => v == null ? 'Unavailable' : `${v} ${kind === 0 ? 'dBm' : kind === 1 ? '%' : kind === 2 ? 'Mbps' : 'ms'}` },
      xAxis: { type: 'time', min: now-seconds*1000, max: now, splitNumber: 3, axisLine: { lineStyle: { color: '#2a4054' } }, axisTick: { show: false }, axisLabel: { color: '#809cb4', fontSize: 9, hideOverlap: true, formatter: (v: number) => new Date(v).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }) }, splitLine: { show: false } },
      yAxis: { type: 'value', min: kind === 0 ? (v: { min: number }) => Math.min(-100, v.min) : 0, max: kind === 0 ? (v: { max: number }) => Math.max(-30, v.max) : kind === 1 ? 100 : undefined, splitNumber: 3, axisLabel: { color: '#809cb4', fontSize: 9 }, splitLine: { lineStyle: { color: '#243a4c', type: 'dashed', opacity: .6 } } },
      series: data.map((values, i) => ({ id: `lab-${kind}-${i}`, name: kind === 2 ? i ? 'TX' : 'RX' : chartNames[kind], type: 'line', showSymbol: false, connectNulls: false, smooth: false, data: values.filter(p => Number(p[0]) > now-seconds*1000 && Number(p[0]) <= now), lineStyle: { color: i ? '#c4e9ff' : '#68caff', width: 1.6, type: i ? 'dashed' : 'solid' }, itemStyle: { color: i ? '#c4e9ff' : '#68caff' }, areaStyle: kind !== 2 ? { color: '#58bfff', opacity: .04 } : undefined })) });
  }, [kind, points, snapshot, seconds, end]);
  useEffect(() => {
    const chart = instance.current;
    if (!chart) return;
    if (selected === null) { chart.dispatchAction({type:'hideTip'}); return; }
    const pixel = chart.convertToPixel({xAxisIndex:0}, selected);
    if (Number.isFinite(pixel)) chart.dispatchAction({type:'showTip', x:pixel, y:40});
  }, [selected, end, seconds, points]);
  const latest = snapshot?.network.details?.wifi;
  const value = kind === 0 ? latest?.rssiDbm : kind === 1 ? latest?.signalQuality : kind === 2 ? latest?.rxLinkMbps : snapshot?.gateway.samples.at(-1)?.rttMs;
  return <article className="lab-chart"><div className="lab-chart-head"><h3>{chartNames[kind]}</h3><span>{fmt(value, 1)}{kind === 2 ? ` / ${fmt(latest?.txLinkMbps,1)}` : ''} <small>{['dBm','%','Mbps','ms'][kind]}</small></span></div><div className="lab-chart-canvas" ref={element}/></article>;
});
export function WifiLab({ snapshot, stale }: { snapshot: Snapshot | null; stale: boolean }) {
  const [now, setNow] = useState(Date.now()), [view, setView] = useState(liveView), [selected, setSelected] = useState<number | null>(null);
  const seconds = view.seconds;
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const wifi = snapshot?.network.details?.wifi ?? null, points = wifiHistory.points;
  const state = labState(snapshot, stale, now, points), active = labActive(state);
  const latest = snapshot ? Date.parse(snapshot.now) : now;
  const end = windowEnd(points, view.end, latest);
  useEffect(() => {
    if (view.pinned !== null && !points.some(p=>p.time===view.pinned)) { setView(liveView()); setSelected(null); }
  }, [points, view.pinned]);
  useEffect(() => { setView(liveView()); setSelected(null); }, [snapshot?.sessionStarted, snapshot?.network.adapterId]);
  const at = snapshot?.network.observedAt;
  const rows = [['Adapter', snapshot?.network.adapterName], ['SSID', wifi?.ssid], ['BSSID', wifi?.bssid], ['Adapter MAC', wifi?.mac], ['Band', wifi?.band], ['Channel', wifi?.channel], ['Radio type', wifi?.radioType], ['Authentication', wifi?.authentication], ['Cipher', wifi?.cipher], ['Connection mode', wifi?.connectionMode], ['Native state', wifi?.state], ['Observation (UTC)', at], ['RSSI (dBm)', wifi?.rssiDbm], ['Reported quality (%)', wifi?.signalQuality], ['Negotiated RX (Mbps)', wifi?.rxLinkMbps], ['Negotiated TX (Mbps)', wifi?.txLinkMbps], ['Gateway RTT (ms)', snapshot?.gateway.samples.at(-1)?.rttMs]];
  return <section className={`wifi-lab ${active ? 'lab-live' : 'lab-inactive'} ${state === 'Degraded' || state === 'Weakening' ? 'lab-warning' : ''}`} data-state={state}>
    <article className="lab-hero" data-observed-at={at ?? ''} data-band={active ? wifi?.band ?? '' : ''}>
      <SignalSurface points={points} wifi={wifi} active={active} state={state} end={end} seconds={seconds} live={view.end===null} pinned={view.pinned}
        onView={(next, span)=>{setView(v=>({...v,end:next,seconds:span}));}}
        onInspect={setSelected} onPin={time=>{setView(v=>({...v,pinned:time,end}));setSelected(time);}}
        onLive={()=>{setView(v=>({...v,end:null,pinned:null}));setSelected(null);}}/>
    </article>
    <div className="lab-history-heading"><h2>History</h2><div className="segmented" aria-label="Wi-Fi history window">{[60,300].map(n=><button key={n} aria-pressed={seconds===n} className={seconds===n?'selected':''} onClick={()=>setView(v=>({...v,seconds:n}))}>{n===60?'60 seconds':'5 minutes'}</button>)}</div></div>
    <div className="lab-charts">{chartNames.map((_,kind)=><LabChart key={kind} kind={kind} points={points} snapshot={snapshot} seconds={seconds} end={end} selected={selected}/>)}</div>
    <details className="connection-inspector lab-inspector"><summary><span>TECHNICAL INSPECTOR <b>Native Windows Wi-Fi</b></span><span>ASSOCIATION & MEASUREMENT NOTES <i>＋</i></span></summary><dl>{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value ?? 'Unavailable'}</dd></div>)}</dl>
      {wifi?.unavailableReason && <p className="amber">{wifi.unavailableReason}</p>}<p>{snapshot?.network.details?.selection ?? 'No selected Wi-Fi adapter.'} · Gateway ICMP follows Windows routing and may include other path effects. Gateway replies keep their own completion timestamps; they are not atomic with radio queries.</p>
      <p>The surface plots actual native completion times against driver-reported quality (0–100%). Layered lighting follows the same measured trace; it is not additional telemetry. RSSI remains a separate dBm reading. Hover or pin to inspect exact observations; drag horizontally to navigate, wheel or pinch to zoom between 60 and 300 seconds. Arrow keys inspect, Enter pins, Escape returns to Live. Gateway ICMP tooltips retain their own timestamps; nearby replies are not simultaneous radio observations.</p>
      <p>Older than 3.5 seconds is stale. Pausing freezes acquisition. History is bounded to 600 observations, with gaps for missing fields, missed polls and detected BSSID changes. Animation translates the time window only; inspected values never interpolate. Degraded means RSSI below −75 dBm or quality below 40%; weakening means a 4 dB fall over 2–4.5 seconds. These display thresholds do not identify a cause. No distance, interference, SNR or retries are inferred.</p>
    </details>
  </section>;
}
