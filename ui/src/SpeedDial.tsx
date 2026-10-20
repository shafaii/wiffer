import { memo, useEffect, useRef, useState } from 'react';
import { useTraffic } from './trafficStore';
export function gaugeRange(value: number, current: number) {
  return value <= current ? current : Math.max(current, 10 ** Math.ceil(Math.log10(value)));
}
// Exact critically damped spring, display only. Raw numbers never interpolate.
export function springStep(position: number, velocity: number, target: number, seconds: number) {
  const omega = 19, dt = Math.min(.064, Math.max(0, seconds)), offset = position - target;
  const impulse = velocity + omega * offset, decay = Math.exp(-omega * dt);
  return { position: target + (offset + impulse * dt) * decay, velocity: (velocity - omega * impulse * dt) * decay };
}
const format = (value: number | null) => value === null ? '—' : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rail = 'M 23 146 L 56 62 Q 66 36 96 36 H 261 Q 284 36 296 61 L 325 130';
const SpeedDial = memo(function SpeedDial({ direction, value, average, inactive, manualScale }: {
  direction: 'download' | 'upload'; value: number | null; average: number | null; inactive: boolean; manualScale: number;
}) {
  const [automaticScale, setAutomaticScale] = useState(100);
  const scale = manualScale || gaugeRange(value ?? 0, automaticScale);
  useEffect(() => { if (!manualScale && scale !== automaticScale) setAutomaticScale(scale); }, [manualScale, scale, automaticScale]);
  const arc = useRef<SVGPathElement>(null), trail = useRef<SVGPathElement>(null);
  const motion = useRef({ position: 0, velocity: 0 });
  useEffect(() => {
    const target = Math.min(1, (value ?? 0) / scale), reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, previous = performance.now();
    const draw = (time: number) => {
      motion.current = reduced.matches || inactive || value === null ? { position: target, velocity: 0 } : springStep(motion.current.position, motion.current.velocity, target, (time - previous) / 1000);
      previous = time;
      const settled = Math.abs(target - motion.current.position) < .0002 && Math.abs(motion.current.velocity) < .003;
      if (settled) motion.current = { position: target, velocity: 0 };
      const shown = Math.max(0, Math.min(1, motion.current.position));
      arc.current?.setAttribute('stroke-dasharray', `${shown * 100} 100`);
      trail.current?.setAttribute('stroke-dasharray', `${Math.max(0, Math.min(1, shown - motion.current.velocity * .025)) * 100} 100`);
      if (!settled) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [value, scale, inactive]);
  return <article className={`speed-dial ${direction} ${inactive ? 'inactive' : ''}`} aria-label={`${direction}: ${format(value)} megabits per second, local PC traffic`}>
    <div className="dial-heading"><span className="direction-arrow">{direction === 'download' ? '↓' : '↑'}</span><h2>{direction.toUpperCase()}</h2><span className="instrument-id">{direction === 'download' ? 'RX / 01' : 'TX / 02'}</span></div>
    <div className="digital-instrument"><svg viewBox="0 0 348 192" aria-hidden="true">
      <defs>
        <linearGradient id={`${direction}-deck`} x2=".2" y2="1"><stop stopColor="#233c54"/><stop offset=".35" stopColor="#101e2d"/><stop offset="1" stopColor="#060d17"/></linearGradient>
        <linearGradient id={`${direction}-edge`} x2="1" y2="1"><stop stopColor="#a6dfff" stopOpacity=".6"/><stop offset=".45" stopColor="#334f69" stopOpacity=".2"/><stop offset="1" stopColor="#71bfff" stopOpacity=".5"/></linearGradient>
        <linearGradient id={`${direction}-glass`} x2="0" y2="1"><stop stopColor="#d3efff" stopOpacity=".09"/><stop offset="1" stopColor="#d3efff" stopOpacity="0"/></linearGradient>
      </defs>
      <path d="M13 155 46 58Q58 24 91 24H267Q294 24 307 56L338 141 316 178H42Z" fill="#030812"/>
      <path d="M13 146 46 49Q58 15 91 15H267Q294 15 307 47L338 132 316 169H42Z" fill={`url(#${direction}-deck)`} stroke={`url(#${direction}-edge)`}/>
      <path d="M42 169H316L338 132" fill="none" stroke="#5094c3" strokeOpacity=".35"/>
      <path d={rail} className="energy-bed"/><path d={rail} className="energy-segments" pathLength="100" strokeDasharray=".4 2.1"/>
      <path ref={trail} d={rail} className="energy-trail" pathLength="100" strokeDasharray="0 100"/>
      <path ref={arc} d={rail} className="energy-arc" pathLength="100" strokeDasharray="0 100"/>
      <path d="M58 63Q67 26 95 26H264Q283 26 297 62L286 79Q190 42 58 91Z" fill={`url(#${direction}-glass)`}/>
      <path d="M65 155H288" stroke="#91cfff" strokeOpacity=".12"/>
      <text x="61" y="181">0</text><text x="286" y="181" textAnchor="end">{scale.toLocaleString()} Mbps</text>
    </svg><div className="digital-readout"><span className="readout-label">{inactive ? 'LAST MEASURED' : 'INSTANTANEOUS'}</span><strong>{format(value)}</strong><span className="readout-unit">Mbps</span></div></div>
    <div className="dial-average"><span>3s weighted average</span><b>{format(average)} <small>Mbps</small></b></div>
    {value !== null && value > scale && <small className="coral">Above arc scale · numeric value is uncapped</small>}
  </article>;
});
export const TrafficDeck = memo(function TrafficDeck({ inactive, state }: { inactive: boolean; state: string }) {
  const latest = useTraffic();
  const [scale, setScale] = useState(0);
  return <section className="traffic-deck"><div className="instrument-bar"><span><span className="tiny-dot" /> LOCAL PC TRAFFIC</span><label>Arc range <select aria-label="Throughput dial range" value={scale} onChange={e => setScale(Number(e.target.value))}><option value={0}>Auto ↑</option>{[10, 100, 1000, 10000].map(n => <option key={n} value={n}>{n} Mbps</option>)}</select></label></div>
    <div className="dual-dials"><SpeedDial direction="download" value={latest?.downloadMbps ?? null} average={latest?.downloadAverage ?? null} inactive={inactive} manualScale={scale}/><SpeedDial direction="upload" value={latest?.uploadMbps ?? null} average={latest?.uploadAverage ?? null} inactive={inactive} manualScale={scale}/></div>
    <div className="traffic-caption"><span>{inactive ? `${state} · last readings` : latest?.status === 'measured' ? `Native interval ${(latest.elapsedSeconds * 1000).toFixed(0)} ms · ${new Date(latest.timestamp).toLocaleTimeString()}` : latest?.error ?? 'Waiting for native byte counters'}</span><span>LAN + internet · not capacity</span></div>
  </section>;
});
