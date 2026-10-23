import { useEffect, useRef, useState } from 'react';
import type { Wifi } from './contract';
import { springStep } from './SpeedDial';
import type { WifiPoint } from './wifiModel';
import { nearestObservation, panWindow, qualitySegments, qualityY, zoomWindow } from './surfaceModel';
import './signalSurface.css';
const number = (v: number | null | undefined) => v == null ? '—' : String(v);
const timeLabel = (t: number) => new Date(t).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
export function SignalSurface({ points, wifi, active, state, end, seconds, live, pinned, onView, onInspect, onPin, onLive }: {
  points: WifiPoint[]; wifi: Wifi | null; active: boolean; state: string; end: number; seconds: number; live: boolean; pinned: number | null;
  onView: (end: number, seconds: number) => void; onInspect: (time: number | null) => void; onPin: (time: number | null) => void; onLive: () => void;
}) {
  const root = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null), trace = useRef<SVGGElement>(null), cursor = useRef<SVGLineElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const latest = points.at(-1)?.time ?? end, start = end-seconds*1000;
  const selected = pinned !== null ? points.find(p=>p.time===pinned && p.time>=start && p.time<=end) ?? null : nearestObservation(points, hover ?? NaN, start, end);
  const inspected = pinned !== null || hover !== null ? selected : null;
  const x = (t: number) => 40 + (t-start)/(seconds*1000)*920;
  const y = (q: number) => 18 + qualityY(q)*1.72;
  const current = inspected ? inspected.wifi : (active ? wifi : null);
  const previousEnd = useRef(end);
  // Translation animates the arrival only. Geometry and inspected values stay at measured coordinates.
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let offset = live && end-previousEnd.current < 3500 ? (end-previousEnd.current)/(seconds*1000)*920 : 0;
    previousEnd.current=end;
    let velocity=0, frame=0, last=performance.now();
    const draw=(t:number)=>{
      if(media.matches || document.hidden){offset=0;velocity=0;}
      else {const next=springStep(offset,velocity,0,(t-last)/1000);offset=next.position;velocity=next.velocity;}
      last=t; trace.current?.setAttribute('transform',`translate(${offset} 0)`);
      if(Math.abs(offset)>.005 || Math.abs(velocity)>.01) frame=requestAnimationFrame(draw);
      else trace.current?.removeAttribute('transform');
    };
    const snap=()=>{cancelAnimationFrame(frame);offset=0;velocity=0;trace.current?.removeAttribute('transform');};
    media.addEventListener('change',snap);document.addEventListener('visibilitychange',snap);frame=requestAnimationFrame(draw);
    return()=>{cancelAnimationFrame(frame);media.removeEventListener('change',snap);document.removeEventListener('visibilitychange',snap);};
  },[end,seconds,live]);
  // Spring feedback is confined to the inspection cursor, never applied to signal quality.
  const cursorPosition=useRef({position:0,velocity:0});
  useEffect(()=>{
    const target=inspected ? x(inspected.time) : 0, media=matchMedia('(prefers-reduced-motion: reduce)');
    let frame=0,last=performance.now();
    const draw=(t:number)=>{const m=cursorPosition.current=media.matches?{position:target,velocity:0}:springStep(cursorPosition.current.position,cursorPosition.current.velocity,target,(t-last)/1000);last=t;cursor.current?.setAttribute('x1',String(m.position));cursor.current?.setAttribute('x2',String(m.position));if(!document.hidden&&(Math.abs(m.position-target)>.01||Math.abs(m.velocity)>.01))frame=requestAnimationFrame(draw);};
    const snap=()=>{cancelAnimationFrame(frame);cursorPosition.current={position:target,velocity:0};cursor.current?.setAttribute('x1',String(target));cursor.current?.setAttribute('x2',String(target));};
    media.addEventListener('change',snap);document.addEventListener('visibilitychange',snap);frame=requestAnimationFrame(draw);
    return()=>{cancelAnimationFrame(frame);media.removeEventListener('change',snap);document.removeEventListener('visibilitychange',snap);};
  },[inspected?.time,start,seconds]);
  const gesture=useRef<{x:number;end:number; moved:boolean; id:number}|null>(null), pointers=useRef(new Map<number,number>()), pinch=useRef(0);
  const inspect=(clientX:number)=>{
    const r=svg.current!.getBoundingClientRect(), fraction=Math.max(0,Math.min(1,((clientX-r.left)/r.width*1000-40)/920));
    const p=nearestObservation(points,start+fraction*seconds*1000,start,end);
    setHover(p?.time??null);if(pinned===null)onInspect(p?.time??null);
  };
  useEffect(()=>{
    const el=svg.current!;
    const wheel=(e:WheelEvent)=>{e.preventDefault();onView(end,zoomWindow(seconds,Math.exp(Math.max(-100,Math.min(100,e.deltaY))*.003)))};
    el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);
  },[end,seconds,onView]);
  const paths=qualitySegments(points).map(segment=>segment.filter((p,i)=>p.time>=start&&p.time<=end || p.time<start&&segment[i+1]?.time>=start || p.time>end&&segment[i-1]?.time<=end)).filter(a=>a.length);
  return <div className="live-surface" ref={root} data-live={live} data-pinned={pinned!==null} data-end={end} data-seconds={seconds} data-status={state}>
    <div className="live-surface-top">
      <div className="live-reading"><span className="surface-quality">{number(current?.signalQuality)}<small>%</small></span><span className="surface-rssi">{number(current?.rssiDbm)} <small>RSSI · dBm</small></span><span className="surface-band">{current?.band ?? ''}</span></div>
      <div className="surface-controls"><span className="surface-state"><i/>{state==='Stable'?'Connected':state}</span><button onClick={()=>{setHover(null);onLive();}} className={live&&pinned===null?'is-live':''}>{live&&pinned===null?'Live':'Return to Live'}</button></div>
    </div>
    <div className="surface-inspection" aria-live="off">{inspected ? <><time dateTime={(inspected.observedAt ?? new Date(inspected.time).toISOString())}>{(inspected.observedAt ?? new Date(inspected.time).toISOString()).replace('T',' ').replace('Z',' UTC').replace('+00:00',' UTC')}</time><span>{pinned!==null?'Pinned':'Inspecting'} · RX {number(inspected.wifi?.rxLinkMbps)} / TX {number(inspected.wifi?.txLinkMbps)} Mbps</span></> : <><span>Signal quality</span><span>{Math.round(seconds)} s</span></>}</div>
    <svg ref={svg} className="live-surface-plot" viewBox="0 0 1000 230" preserveAspectRatio="none" tabIndex={0} role="application" aria-label="Wi-Fi quality history. Drag to navigate, wheel or pinch to zoom. Arrow keys inspect observations, Enter pins, Escape returns to live."
      onPointerDown={e=>{svg.current?.setPointerCapture(e.pointerId);pointers.current.set(e.pointerId,e.clientX);gesture.current={x:e.clientX,end,moved:false,id:e.pointerId};if(pointers.current.size===2){const a=[...pointers.current.values()];pinch.current=Math.abs(a[0]-a[1]);}}}
      onPointerMove={e=>{if(pointers.current.has(e.pointerId))pointers.current.set(e.pointerId,e.clientX);if(pointers.current.size===2){const a=[...pointers.current.values()],distance=Math.abs(a[0]-a[1]);if(pinch.current>10&&distance>10)onView(end,zoomWindow(seconds,pinch.current/distance));pinch.current=distance;if(gesture.current)gesture.current.moved=true;return;}const g=gesture.current;if(g&&g.id===e.pointerId){const delta=e.clientX-g.x;if(Math.abs(delta)>4)g.moved=true;if(g.moved){onView(panWindow(g.end,delta,svg.current!.getBoundingClientRect().width*.92,seconds,points,latest),seconds);setHover(null);onInspect(null);return;}}inspect(e.clientX);}}
      onPointerUp={e=>{const g=gesture.current;pointers.current.delete(e.pointerId);if(g&&!g.moved){inspect(e.clientX);const r=svg.current!.getBoundingClientRect();const p=nearestObservation(points,start+Math.max(0,Math.min(1,((e.clientX-r.left)/r.width*1000-40)/920))*seconds*1000,start,end);onPin(p?.time??null);}gesture.current=null;}}
      onPointerCancel={()=>{gesture.current=null;pointers.current.clear();}}
      onLostPointerCapture={()=>{gesture.current=null;}}
      onPointerLeave={()=>{if(!gesture.current){setHover(null);if(pinned===null)onInspect(null);}}}
      onKeyDown={e=>{if(e.key==='Escape'){onLive();setHover(null);return;}if(e.key==='Enter'){onPin(inspected?.time??points.at(-1)?.time??null);return;}if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const visible=points.filter(p=>p.time>=start&&p.time<=end);const index=visible.findIndex(p=>p.time===(inspected?.time??latest));const p=visible[Math.max(0,Math.min(visible.length-1,index+(e.key==='ArrowLeft'?-1:1)))];if(p){setHover(p.time);onInspect(p.time);if(pinned!==null)onPin(p.time);}}}}>
      <defs><linearGradient id="surface-area" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#67c7fa" stopOpacity=".21"/><stop offset="1" stopColor="#63bbec" stopOpacity="0"/></linearGradient><clipPath id="surface-clip"><rect x="40" y="10" width="920" height="185"/></clipPath></defs>
      {[0,50,100].map(q=><g key={q} className="surface-grid"><line x1="40" x2="960" y1={y(q)} y2={y(q)}/><text x="17" y={y(q)+3}>{q}</text></g>)}
      <g clipPath="url(#surface-clip)"><g ref={trace} className="surface-trace">{paths.map((segment,i)=>{const d=segment.map((p,j)=>`${j?'L':'M'}${x(p.time)} ${y(p.wifi!.signalQuality!)}`).join(' ');return <g key={i}><path d={`${d}L${x(segment.at(-1)!.time)} 190L${x(segment[0].time)} 190Z`} fill="url(#surface-area)"/><path d={d} className="surface-contour-outer"/><path d={d} className="surface-contour-inner"/><path d={d} className="surface-measured-line"/>{segment.length===1&&<circle cx={x(segment[0].time)} cy={y(segment[0].wifi!.signalQuality!)} r="1.6" fill="#d9f4ff"/>}</g>})}</g>
      {inspected&&<g className="surface-cursor"><line ref={cursor} y1="10" y2="195"/>{inspected.wifi?.signalQuality!=null&&<circle cx={x(inspected.time)} cy={y(inspected.wifi.signalQuality)} r="4"/>}</g>}</g>
      {[0,.25,.5,.75,1].map(f=><text key={f} className="surface-time" x={40+f*920} y="220" textAnchor={f===0?'start':f===1?'end':'middle'}>{timeLabel(start+f*seconds*1000)}</text>)}
      {!paths.length&&<text className="surface-empty" x="500" y="115" textAnchor="middle">No quality observations</text>}
    </svg>
  </div>;
}
