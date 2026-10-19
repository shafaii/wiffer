import { memo, useEffect, useRef, useState } from 'react';
import { useTraffic } from './trafficStore';
export function gaugeRange(value: number, current: number) {
  if (value <= current) return current;
  return Math.max(current, 10 ** Math.ceil(Math.log10(value)));
}
const format = (value: number | null) => value === null ? '—' : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const point = (fraction: number, radius: number) => [160 + Math.cos((210 - fraction * 240) * Math.PI / 180) * radius, 140 - Math.sin((210 - fraction * 240) * Math.PI / 180) * radius];

const SpeedDial = memo(function SpeedDial({ direction, value, average, inactive, manualScale }: {
  direction: 'download' | 'upload'; value: number | null; average: number | null; inactive: boolean; manualScale: number;
}) {
  const [automaticScale, setAutomaticScale] = useState(100);
  const scale = manualScale || gaugeRange(value ?? 0, automaticScale);
  useEffect(() => { if (!manualScale && scale !== automaticScale) setAutomaticScale(scale); }, [manualScale, scale, automaticScale]);
  const needle = useRef<SVGGElement>(null);
  const arc = useRef<SVGPathElement>(null);
  const shown = useRef(0);
  useEffect(() => {
    const target = Math.min(1, (value ?? 0) / scale);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0, previous = performance.now();
    const draw = (time: number) => {
      const dt = Math.min(64, time - previous); previous = time;
      shown.current = reduced || inactive ? target : shown.current + (target - shown.current) * (1 - Math.exp(-dt / 75));
      if (Math.abs(target - shown.current) < .0001) shown.current = target;
      if (needle.current) needle.current.style.transform = `rotate(${shown.current * 240}deg)`;
      arc.current?.setAttribute('stroke-dasharray', `${shown.current * 100} 100`);
      if (shown.current !== target) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [value, scale, inactive]);
  return <article className={`speed-dial ${direction} ${inactive ? 'inactive' : ''}`} aria-label={`${direction}: ${format(value)} megabits per second, local PC traffic`}>
    <div className="dial-heading"><span className="direction-arrow">{direction === 'download' ? '↓' : '↑'}</span><h2>{direction.toUpperCase()}</h2><span className="instrument-id">{direction === 'download' ? 'RX / 01' : 'TX / 02'}</span></div>
    <div className="dial-face"><svg viewBox="0 0 320 278" aria-hidden="true">
      <defs>
        <linearGradient id={`${direction}-metal`} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#77766e"/><stop offset=".24" stopColor="#30312e"/><stop offset=".55" stopColor="#111411"/><stop offset=".84" stopColor="#44463f"/><stop offset="1" stopColor="#77756a"/></linearGradient>
        <radialGradient id={`${direction}-face`} cx=".4" cy=".25" r=".8"><stop stopColor="#30332f"/><stop offset=".7" stopColor="#181c19"/><stop offset="1" stopColor="#0b0e0c"/></radialGradient>
        <linearGradient id={`${direction}-glass`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#fff" stopOpacity=".09"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></linearGradient>
      </defs>
      <circle cx="160" cy="143" r="137" fill="#080b09"/>
      <circle cx="160" cy="140" r="136" fill={`url(#${direction}-metal)`} stroke="#73766b" strokeWidth=".7"/>
      <circle cx="160" cy="140" r="129" fill="#0c100d" stroke="#080b09" strokeWidth="2"/>
      <circle cx="160" cy="140" r="125" fill={`url(#${direction}-face)`} stroke="#484d43" strokeWidth="1"/>
      <path className="dial-rail" d="M 56.08 200 A 120 120 0 1 1 263.92 200" />
      <path ref={arc} className="dial-arc" d="M 56.08 200 A 120 120 0 1 1 263.92 200" pathLength="100" strokeDasharray="0 100" />
      {Array.from({ length: 51 }, (_, i) => { const major = i % 10 === 0; const a = point(i / 50, 111), b = point(i / 50, major ? 100 : 106); return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className={major ? 'major-tick' : 'minor-tick'} />; })}
      {Array.from({ length: 6 }, (_, i) => { const p = point(i / 5, 85); return <text key={i} x={p[0]} y={p[1] + 4} textAnchor="middle">{scale * i / 5 >= 1000 ? `${scale * i / 5000}k` : scale * i / 5}</text>; })}
      <text x="160" y="101" textAnchor="middle" className="dial-engraving">WIFFER / {direction === 'download' ? 'RX' : 'TX'}</text>
      <g ref={needle} className="dial-needle"><path d="M 66 194 L 156 135 L 177 132 L 165 146 Z"/><path d="M 66 194 L 158 140" stroke="#fff6dc" strokeWidth="1" /></g>
      <circle cx="160" cy="140" r="12" fill={`url(#${direction}-metal)`} stroke="#0a0d0a" strokeWidth="3"/>
      <circle cx="160" cy="140" r="4" fill="currentColor"/>
      <path d="M 57 85 A 119 119 0 0 1 268 91 Q 160 57 57 85" fill={`url(#${direction}-glass)`}/>
      <rect x="92" y="185" width="136" height="53" rx="9" fill="#0b0f0c" stroke="#343b32"/>
    </svg><div className="dial-digital"><strong>{format(value)}</strong><span>Mbps <i>INSTANTANEOUS</i></span></div></div>
    <div className="dial-average"><span>3s weighted average</span><b>{format(average)} <small>Mbps</small></b></div>
    {value !== null && value > scale && <small className="coral">Above dial scale · numeric value is uncapped</small>}
  </article>;
});

export const TrafficDeck = memo(function TrafficDeck({ inactive, state }: { inactive: boolean; state: string }) {
  const latest = useTraffic();
  const [scale, setScale] = useState(0);
  // A frozen last reading remains explicitly labelled; no invented zero when unavailable.
  return <section className="traffic-deck"><div className="instrument-bar"><span><span className="tiny-dot" /> LOCAL PC TRAFFIC</span><label>Dial range <select aria-label="Throughput dial range" value={scale} onChange={e => setScale(Number(e.target.value))}><option value={0}>Auto ↑</option>{[10, 100, 1000, 10000].map(n => <option key={n} value={n}>{n} Mbps</option>)}</select></label></div>
    <div className="dual-dials"><SpeedDial direction="download" value={latest?.downloadMbps ?? null} average={latest?.downloadAverage ?? null} inactive={inactive} manualScale={scale} />
      <SpeedDial direction="upload" value={latest?.uploadMbps ?? null} average={latest?.uploadAverage ?? null} inactive={inactive} manualScale={scale} /></div>
    <div className="traffic-caption"><span>{inactive ? `${state} · last readings` : latest?.status === 'measured' ? `Measured every ~250 ms · ${new Date(latest.timestamp).toLocaleTimeString()}` : latest?.error ?? 'Waiting for native byte counters'}</span><span>LAN + internet · not capacity</span></div>
  </section>;
});
