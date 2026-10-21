import { memo, useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { Snapshot, Wifi } from './contract';
import { springStep } from './SpeedDial';
import { fieldStrength, labActive, labState, wifiHistory, wifiSeries, type WifiPoint } from './wifiModel';
import './wifiLab.css';
echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);
const fmt = (v: number | null | undefined, digits = 0) => v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: digits });
const clock = (time: string | null | undefined) => time ? new Date(time).toLocaleTimeString([], { hour12: false }) : '—';

// One rAF clock drives both instruments. No React renders per frame or perpetual sweep.
function useFieldMotion(active: boolean, rssi: number | null, quality: number | null) {
  const root = useRef<HTMLDivElement>(null);
  const motion = useRef([{ position: 0, velocity: 0 }, { position: 0, velocity: 0 }]);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const targets = [active ? fieldStrength(rssi) : 0, active ? (quality ?? 0) / 100 : 0];
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
      root.current?.querySelector('.measured-field')?.setAttribute('r', String(28 + r.position * 109));
      root.current?.querySelector('.measured-rim')?.setAttribute('r', String(28 + r.position * 109));
      if (!settled && !document.hidden) frame = requestAnimationFrame(draw);
    };
    const restart = () => { cancelAnimationFrame(frame); previous = performance.now(); if (!document.hidden) draw(previous); };
    media.addEventListener('change', restart); document.addEventListener('visibilitychange', restart); restart();
    return () => { cancelAnimationFrame(frame); media.removeEventListener('change', restart); document.removeEventListener('visibilitychange', restart); };
  }, [active, rssi, quality]);
  return root;
}
function SignalRadar({ wifi, active }: { wifi: Wifi | null; active: boolean }) {
  return <svg data-rssi-available={active && wifi?.rssiDbm != null} className="radar-svg" viewBox="0 0 630 330" role="img" aria-label="Signal field: radius represents measured RSSI from −100 to −40 dBm, not physical distance">
    <defs>
      <radialGradient id="radar-deck"><stop stopColor="#162f43"/><stop offset=".75" stopColor="#102131"/><stop offset="1" stopColor="#060f1b"/></radialGradient>
      <radialGradient id="radar-field"><stop offset=".15" stopColor="#7cd6ff" stopOpacity="0"/><stop offset=".7" stopColor="#53c5ff" stopOpacity=".07"/><stop offset=".96" stopColor="#6bd0ff" stopOpacity=".28"/><stop offset="1" stopColor="#c2eeff" stopOpacity=".6"/></radialGradient>
      <linearGradient id="radar-metal" x2=".8" y2="1"><stop stopColor="#a2c9e4" stopOpacity=".6"/><stop offset=".35" stopColor="#37546b" stopOpacity=".1"/><stop offset="1" stopColor="#71a7cb" stopOpacity=".5"/></linearGradient>
    </defs>
    <ellipse cx="230" cy="183" rx="159" ry="148" fill="#020813" opacity=".8"/>
    <circle cx="230" cy="164" r="153" fill="url(#radar-deck)" stroke="url(#radar-metal)" strokeWidth="2"/>
    <circle cx="230" cy="164" r="148" fill="none" stroke="#253d51"/>
    {Array.from({ length: 72 }, (_, i) => <path key={i} transform={`rotate(${i * 5} 230 164)`} d={`M230 21v${i % 6 === 0 ? 9 : 4}`} stroke={i % 6 === 0 ? '#8db8d5' : '#3b5b73'} strokeWidth={i % 6 === 0 ? 1.4 : 1}/>)}
    {[46, 73, 101, 128].map((r, i) => <g key={r}><circle cx="230" cy="164" r={r} fill="none" stroke="#335168" strokeOpacity={.45 + i * .09}/><path d={`M${230-r} 164h${r*2}M230 ${164-r}v${r*2}`} stroke="#46647b" strokeOpacity=".08"/></g>)}
    <path d="M85 164H375M230 19V309" stroke="#638ca7" strokeOpacity=".3" strokeDasharray="2 7"/>
    <circle className="measured-field" cx="230" cy="164" r="28" fill="url(#radar-field)"/>
    <circle className="measured-rim" cx="230" cy="164" r="28" fill="none" stroke="#9de3ff" strokeWidth="1.3"/>
    <path d="M222 164h16M230 156v16" stroke="#b4d9ec" opacity=".25"/>
    <rect x="181" y="128" width="98" height="68" rx="22" fill="#0b1926" fillOpacity=".9"/>
    <text x="230" y="151" textAnchor="middle" className="svg-micro">ACTUAL RSSI</text>
    <text x="230" y="185" textAnchor="middle" className="radar-number">{fmt(wifi?.rssiDbm)}</text>
    <text x="230" y="211" textAnchor="middle" className="svg-unit">dBm</text>
    <path d="M287 82 329 46H390" fill="none" stroke="#6896b4" strokeWidth=".7"/>
    <text x="396" y="49" className="svg-micro">−45 STRONG</text>
    <path d="M294 104 342 83H390" fill="none" stroke="#456b87" strokeWidth=".7"/>
    <text x="396" y="86" className="svg-micro">−60 GOOD</text>
    <path d="M281 126 348 120H390" fill="none" stroke="#456b87" strokeWidth=".7"/>
    <text x="396" y="123" className="svg-micro">−75 WEAK</text>
    <path d="M270 146 348 157H390" fill="none" stroke="#456b87" strokeWidth=".7"/>
    <text x="396" y="160" className="svg-micro">−90 LOW</text>
    <text x="406" y="211" className="svg-micro">REPORTED QUALITY</text>
    <text x="406" y="245" className="radar-quality">{fmt(wifi?.signalQuality)}<tspan className="svg-unit"> %</tspan></text>
    <path d="M406 260H542" stroke="#284158" strokeWidth="3"/>
    <path className="quality-rail" d="M406 260H542" pathLength="100" stroke="#98dfff" strokeWidth="3"/>
    <text x="406" y="284" className="svg-micro">{active ? 'NATIVE RADIO OBSERVATION' : 'NO CURRENT LIVE FIELD'}</text>
    <text x="230" y="327" textAnchor="middle" className="svg-micro">SIGNAL STRENGTH · NOT DISTANCE</text>
  </svg>;
}
function ConnectionBridge({ active }: { active: boolean }) {
  return <svg className="bridge-svg" viewBox="0 0 630 330" role="img" aria-label="PC to Wi-Fi router: link illumination represents reported quality, not throughput">
    <defs>
      <linearGradient id="node-metal" x2=".7" y2="1"><stop stopColor="#3c607b"/><stop offset=".45" stopColor="#172d41"/><stop offset="1" stopColor="#0a1523"/></linearGradient>
      <linearGradient id="node-glass" x2=".8" y2="1"><stop stopColor="#244f6d"/><stop offset=".5" stopColor="#0e253a"/><stop offset="1" stopColor="#081522"/></linearGradient>
      <linearGradient id="bridge-beam" gradientUnits="userSpaceOnUse" x1="186" y1="166" x2="467" y2="166"><stop stopColor="#91daff" stopOpacity="0"/><stop offset=".35" stopColor="#65c9ff"/><stop offset=".65" stopColor="#c2edff"/><stop offset="1" stopColor="#91daff" stopOpacity="0"/></linearGradient>
      <radialGradient id="node-floor"><stop stopColor="#61b7ed" stopOpacity=".13"/><stop offset="1" stopColor="#61b7ed" stopOpacity="0"/></radialGradient>
    </defs>
    <path d="M40 267 215 193 390 267 215 328ZM330 267 505 193 620 245 445 320" fill="none" stroke="#26465e" strokeWidth=".7" opacity=".6"/>
    <ellipse cx="150" cy="252" rx="133" ry="51" fill="url(#node-floor)"/><ellipse cx="493" cy="252" rx="126" ry="51" fill="url(#node-floor)"/>
    <g className="wireless-beams">
      <path d="M189 159Q316 95 455 159M189 177Q316 232 455 177" fill="none" stroke="url(#bridge-beam)" strokeWidth=".7"/>
      <path d="M186 166H467" stroke="url(#bridge-beam)" className="beam-halo"/>
      <path d="M186 166H467" stroke="url(#bridge-beam)" className="beam-core"/>
      <path d="M207 155Q316 140 444 155M207 179Q316 194 444 179" fill="none" stroke="url(#bridge-beam)" strokeWidth="2" opacity=".5"/>
      <path className="beam-response" d="M213 166H439" stroke="#e0f7ff" strokeWidth="3" pathLength="100" strokeDasharray="13 100"/>
    </g>
    {!active && <path d="M215 166H433" stroke="#536779" strokeWidth="1" strokeDasharray="3 9"/>}
    <path d="m68 90 121 11 0 113-121-18Z" fill="#020812" stroke="#4d728e"/>
    <path d="m68 90 9-7 122 11-10 7Z" fill="#597e98"/><path d="m189 101 10-7v111l-10 9Z" fill="#1e354a"/>
    <path d="m77 100 103 10v88L77 183Z" fill="url(#node-glass)" stroke="#456b85" strokeWidth=".8"/>
    <path d="m83 106 89 10-89 44Z" fill="#b6e3ff" opacity=".04"/>
    <path d="m118 204 25 3v28l25 7-47 10-24-8 21-9Z" fill="url(#node-metal)" stroke="#3b607c"/>
    <path d="m98 244 23 8 47-10v5l-47 10-23-8Z" fill="#07111c"/>
    <g fill="none" stroke="#a6e1ff" strokeWidth="2" opacity=".85"><path d="M107 145q19-14 39 3M113 153q12-9 26 2M120 161q6-4 12 1"/><circle cx="126" cy="169" r="1.5" fill="#b9eaff"/></g>
    <text x="133" y="286" textAnchor="middle" className="node-label">THIS PC</text><text x="133" y="304" textAnchor="middle" className="svg-micro">SELECTED INTERFACE</text>
    <path d="m435 171 99-20 56 36-96 25Z" fill="url(#node-metal)" stroke="#6891ad"/>
    <path d="m435 171 59 41v20l-59-40Z" fill="#102235" stroke="#365873"/><path d="m494 212 96-25v20l-96 25Z" fill="#081725" stroke="#365873"/>
    <path d="m452 169-6-76q1-6 5-4l7 74M553 168l7-83q1-6 6-3l-5 91" fill="#173249" stroke="#6c99b6" strokeWidth="2"/>
    <path d="m465 176 53-11 39 23-56 13Z" fill="#0c1b2a" stroke="#2e4e68"/>
    {[0,1,2,3,4].map(i=><path key={i} d={`m${478+i*9} ${179-i*1.8} 20 12`} stroke="#304d63" strokeWidth="2"/>)}
    <path d="m509 218 7-2m6-2 7-2m6-2 7-2" stroke={active ? '#9ce2ff' : '#526879'} strokeWidth="2"/>
    <text x="510" y="286" textAnchor="middle" className="node-label">WI-FI ROUTER</text><text x="510" y="304" textAnchor="middle" className="svg-micro">ASSOCIATED ACCESS POINT</text>
    <text x="321" y="80" textAnchor="middle" className="svg-micro">WIRELESS ASSOCIATION</text>
    <path d="M298 89h46" stroke="#456982"/>
    <text x="322" y="242" textAnchor="middle" className="svg-micro">{active ? 'QUALITY-RESPONSIVE LINK' : 'NO LIVE QUALITY'}</text>
    <text x="322" y="327" textAnchor="middle" className="svg-micro">SCHEMATIC · NO PHYSICAL DISTANCE</text>
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
  return <article className="lab-chart"><div className="lab-chart-head"><h3><small>0{kind+1}</small>{chartNames[kind]}</h3><span>{fmt(value, 1)}{kind === 2 ? ` / ${fmt(latest?.txLinkMbps,1)}` : ''} <small>{['dBm','%','Mbps','ms'][kind]}</small></span></div><div className="lab-chart-canvas" ref={element}/><div className="lab-chart-caption">{['Native radio strength', 'Windows / driver reported', 'RX solid · TX dashed · association rates', 'Native ICMP · independent observation'][kind]}</div></article>;
});
export function WifiLab({ snapshot, stale }: { snapshot: Snapshot | null; stale: boolean }) {
  const [now, setNow] = useState(Date.now()), [seconds, setSeconds] = useState(60);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const wifi = snapshot?.network.details?.wifi ?? null, points = wifiHistory.points;
  const state = labState(snapshot, stale, now, points), active = labActive(state);
  const root = useFieldMotion(active, wifi?.rssiDbm ?? null, wifi?.signalQuality ?? null);
  const at = snapshot?.network.observedAt;
  const age = at ? Math.max(0, (now-Date.parse(at))/1000) : null;
  const stamp = `${clock(at)} · ${age === null ? 'age unknown' : `${age.toFixed(1)}s old`}`;
  const rtt = snapshot?.gateway.samples.at(-1);
  const rttFresh = rtt && now - Date.parse(rtt.timestamp) < 4500 && active;
  const rows = [['Adapter', snapshot?.network.adapterName], ['SSID', wifi?.ssid], ['BSSID', wifi?.bssid], ['Adapter MAC', wifi?.mac], ['Band', wifi?.band], ['Channel', wifi?.channel], ['Radio type', wifi?.radioType], ['Authentication', wifi?.authentication], ['Cipher', wifi?.cipher], ['Connection mode', wifi?.connectionMode], ['Native state', wifi?.state], ['Observation (UTC)', at]];
  return <section className={`wifi-lab ${active ? 'lab-live' : 'lab-inactive'} ${state === 'Degraded' || state === 'Weakening' ? 'lab-warning' : ''}`} ref={root} data-state={state}>
    <div className="lab-title"><div><div className="lab-kicker">WIRELESS OBSERVATORY <span>/ 01</span></div><h1>Wi-Fi Lab<span>.</span></h1></div><p>Two perspectives. One native observation.<br/><span>Read-only radio instruments · approximately 1 Hz</span></p><div className="lab-status"><span className="tiny-dot"/>{state}<small>{active ? 'MEASURED SIGNAL STATE' : 'MEASUREMENTS NOT LIVE'}</small></div></div>
    <div className="lab-heroes">
      <article className="lab-hero radar-hero" data-observed-at={at ?? ''}><header><div><span className="hero-index">A /</span><h2>Signal radar</h2></div><span>RADIO FIELD</span></header><SignalRadar wifi={wifi} active={active}/><div className="lab-hero-foot"><span>{wifi?.band ?? 'Band unavailable'} <i> / </i> {state}</span><time>{stamp}</time></div></article>
      <article className="lab-hero bridge-hero" data-observed-at={at ?? ''}><header><div><span className="hero-index">C /</span><h2>Connection bridge</h2></div><span>PC → ACCESS POINT</span></header><ConnectionBridge active={active && wifi?.signalQuality != null}/><div className="lab-hero-foot"><span>{wifi?.band ?? '—'} <i>/</i> CH {wifi?.channel ?? '—'}</span><time>{stamp}</time></div></article>
    </div>
    <div className="lab-readings"><div><span>NEGOTIATED RX</span><b>{fmt(wifi?.rxLinkMbps,1)} <small>Mbps</small></b></div><div><span>NEGOTIATED TX</span><b>{fmt(wifi?.txLinkMbps,1)} <small>Mbps</small></b></div><div><span>GATEWAY RTT <em>{rttFresh ? 'LATEST' : 'LAST / UNAVAILABLE'}</em></span><b>{fmt(rtt?.rttMs,1)} <small>ms</small></b></div><p>RSSI is received power. Quality is driver reported.<br/>Negotiated rates are association rates; actual PC traffic is in Instruments.</p></div>
    <div className="lab-history-heading"><h2>Wireless timeline <span>SHARED TIME AXIS</span></h2><div className="segmented" aria-label="Wi-Fi history window">{[60,300].map(n=><button key={n} aria-pressed={seconds===n} className={seconds===n?'selected':''} onClick={()=>setSeconds(n)}>{n===60?'60 seconds':'5 minutes'}</button>)}</div></div>
    <div className="lab-charts">{chartNames.map((_,kind)=><LabChart key={kind} kind={kind} points={points} snapshot={snapshot} seconds={seconds}/>)}</div>
    <details className="connection-inspector lab-inspector"><summary><span>TECHNICAL INSPECTOR <b>Native Windows Wi-Fi</b></span><span>ASSOCIATION & MEASUREMENT NOTES <i>＋</i></span></summary><dl>{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value ?? 'Unavailable'}</dd></div>)}</dl>
      {wifi?.unavailableReason && <p className="amber">{wifi.unavailableReason}</p>}<p>{snapshot?.network.details?.selection ?? 'No selected Wi-Fi adapter.'} · Gateway ICMP follows Windows routing and may include other path effects. Gateway replies keep their own completion timestamps; they are not atomic with radio queries.</p>
      <p>Field radius maps −100 to −40 dBm (clipped visually only). Reported quality independently controls field lighting and link intensity. Weakening means a drop of at least 4 dB across 2–4.5 seconds; degraded means RSSI below −75 dBm or quality below 40%. These display thresholds do not identify a cause. Unknown radio fields remain unavailable, including ambiguous multi-link band/channel/RSSI. No distance, interference, SNR, retries or band switching is inferred.</p>
      <p>Native query completion is the shared timestamp. Older than 3.5 seconds is stale. Pausing freezes acquisition. History is bounded to 600 observations, with gaps for missed polls and detected BSSID changes. Counter throughput is separate. The graphics spring between measurements and stop when settled; numbers and charts never interpolate.</p>
    </details>
  </section>;
}
