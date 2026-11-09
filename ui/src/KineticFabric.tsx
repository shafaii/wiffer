import { useEffect, useRef } from 'react';
import type { Wifi } from './contract';
import type { LabState } from './wifiModel';
import { trafficStore } from './trafficStore';
import { springStep } from './motion';
import { fabricQuality, fabricTraffic, ribbonPath } from './fabricModel';
import './kineticFabric.css';
export function KineticFabric({ wifi, active, state }: { wifi: Wifi | null; active: boolean; state: LabState }) {
  const root = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null);
  const latest = useRef({wifi,active,state}); latest.current = {wifi,active,state};
  const wake = useRef(()=>{});
  useEffect(()=>{wake.current();},[wifi,active,state]);
  useEffect(()=>{
    const el = svg.current!, host = root.current!, reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const surfaces = [...el.querySelectorAll<SVGPathElement>('.fabric-material')], edges = [...el.querySelectorAll<SVGPathElement>('.fabric-edge')], seams = [...el.querySelectorAll<SVGPathElement>('.fabric-flow')];
    let frame = 0, previous = 0, pointer: number | null = null, startX = 0, startY = 0, anchor = .5, tx = 0, ty = 0;
    let geometry = '';
    let x = {position:0,velocity:0}, y = {...x}, q = {...x}, rx = 0, ux = 0;
    const draw = (time: number) => {
      frame = 0; if(document.hidden) return;
      const dt = previous ? Math.min(.04,(time-previous)/1000) : 1/60; previous=time;
      const current = latest.current, target = fabricQuality(current.wifi?.signalQuality ?? null,current.active);
      q = reduced.matches ? {position:target,velocity:0} : springStep(q.position,q.velocity,target,dt);
      x = reduced.matches ? {position:tx*.25,velocity:0} : springStep(x.position,x.velocity,tx,dt);
      y = reduced.matches ? {position:ty*.25,velocity:0} : springStep(y.position,y.velocity,ty,dt);
      if (Math.abs(q.position-target)+Math.abs(q.velocity)<.001) q={position:target,velocity:0};
      if (!reduced.matches && Math.abs(x.position-tx)+Math.abs(x.velocity)<.01) x={position:tx,velocity:0};
      if (!reduced.matches && Math.abs(y.position-ty)+Math.abs(y.velocity)<.01) y={position:ty,velocity:0};
      const shown = current.active && current.wifi?.signalQuality != null ? q.position : 0;
      const key = [shown,x.position,y.position,anchor].map(v=>v.toFixed(4)).join(',');
      if (key !== geometry) {
      geometry = key;
      surfaces.forEach((p,i)=>p.setAttribute('d',ribbonPath(i,shown,x.position,y.position,anchor)));
      edges.forEach((p,i)=>p.setAttribute('d',ribbonPath(i,shown,x.position,y.position,anchor,true)));
      seams.forEach((p,i)=>p.setAttribute('d',ribbonPath(i ? 5 : 1,shown,x.position,y.position,anchor,true)));
      }
      const rates = fabricTraffic(trafficStore.latest(),current.active,Date.now());
      if (!reduced.matches) { rx = (rx + rates[0]*dt*100) % 224; ux = (ux - rates[1]*dt*100) % 252; }
      seams.forEach((p,i)=>{p.style.strokeDashoffset=String(reduced.matches ? 0 : i?ux:rx);p.style.opacity=String(rates[i] ? .2+rates[i]*.65 : 0);});
      host.style.setProperty('--fabric-light',String(current.active && current.wifi?.signalQuality != null ? .18+shown*.82 : .08));
      host.dataset.quality=String(target);host.dataset.pull=String(Math.hypot(x.position,y.position));host.dataset.rx=String(rates[0]);host.dataset.tx=String(rates[1]);
      const unsettled = Math.abs(q.position-target)+Math.abs(q.velocity)+Math.abs(x.position-tx)+Math.abs(y.position-ty)+Math.abs(x.velocity)+Math.abs(y.velocity) > .01;
      if(!reduced.matches && (unsettled || rates.some(v=>v>0))) frame=requestAnimationFrame(draw);
    };
    const schedule=()=>{if(!frame&&!document.hidden)frame=requestAnimationFrame(draw);}; wake.current=schedule;
    const locate=(e:PointerEvent)=>{const b=el.getBoundingClientRect();return [(e.clientX-b.left)/b.width*1200,(e.clientY-b.top)/b.height*400];};
    const down=(e:PointerEvent)=>{if(pointer!==null)return;pointer=e.pointerId;[startX,startY]=locate(e);anchor=Math.max(.05,Math.min(.95,startX/1200));el.setPointerCapture(e.pointerId);el.focus();host.dataset.dragging='true';schedule();};
    const move=(e:PointerEvent)=>{const [px,py]=locate(e);if(pointer!==null&&pointer!==e.pointerId)return;if(pointer!==null){tx=Math.max(-130,Math.min(130,(px-startX)*.7));ty=Math.max(-100,Math.min(100,(py-startY)*.7));}else{anchor=px/1200;tx=(px-600)*.009;ty=(py-200)*.055;}schedule();};
    const release=()=>{pointer=null;tx=ty=0;host.dataset.dragging='false';schedule();};
    const leave=()=>{if(pointer===null)release();};
    const visibility=()=>{cancelAnimationFrame(frame);frame=0;previous=0;release();};
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape')release();else if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();anchor=.5;tx=e.key==='ArrowLeft'?-35:e.key==='ArrowRight'?35:0;ty=e.key==='ArrowUp'?-35:e.key==='ArrowDown'?35:0;schedule();}};
    el.addEventListener('pointerdown',down);el.addEventListener('pointermove',move);el.addEventListener('pointerup',release);el.addEventListener('pointercancel',release);el.addEventListener('lostpointercapture',release);el.addEventListener('pointerleave',leave);el.addEventListener('keydown',key);el.addEventListener('keyup',release);el.addEventListener('blur',release);
    document.addEventListener('visibilitychange',visibility);reduced.addEventListener('change',schedule);const unsubscribe=trafficStore.subscribe(schedule);schedule();
    return()=>{cancelAnimationFrame(frame);unsubscribe();wake.current=()=>{};document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',schedule);el.removeEventListener('pointerdown',down);el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',release);el.removeEventListener('pointercancel',release);el.removeEventListener('lostpointercapture',release);el.removeEventListener('pointerleave',leave);el.removeEventListener('keydown',key);el.removeEventListener('keyup',release);el.removeEventListener('blur',release);};
  },[]);
  return <div className="kinetic-fabric" ref={root} data-status={state}>
    <div className="fabric-readings"><span className="fabric-quality">{active ? wifi?.signalQuality ?? '—' : '—'}<small>%</small></span><span className="fabric-rssi">{active ? wifi?.rssiDbm ?? '—' : '—'}<small>dBm</small></span><span className="fabric-status"><i/>{state==='Stable'?'Connected':state==='Degraded'?'Weak':state}</span></div>
    <svg ref={svg} viewBox="0 0 1200 400" preserveAspectRatio="none" tabIndex={0} role="img" aria-label="Interactive signal fabric. Drag to stretch; arrow keys to pull, release to recover. Quality controls illumination and fullness. Moving seams represent measured local RX and TX traffic.">
      <defs><linearGradient id="fabric-silk" x1="0" y1="0" x2=".3" y2="1" gradientUnits="objectBoundingBox"><stop stopColor="#caf1ff" stopOpacity=".65"/><stop offset=".13" stopColor="#5fb9ee" stopOpacity=".38"/><stop offset=".44" stopColor="#153e63" stopOpacity=".5"/><stop offset=".73" stopColor="#071628" stopOpacity=".9"/><stop offset="1" stopColor="#8dd9ff" stopOpacity=".7"/></linearGradient><linearGradient id="fabric-edge"><stop stopColor="#35688a" stopOpacity="0"/><stop offset=".25" stopColor="#78ceff"/><stop offset=".58" stopColor="#e0f8ff"/><stop offset=".82" stopColor="#4ea5e4"/><stop offset="1" stopColor="#346d91" stopOpacity="0"/></linearGradient></defs>
      <g className="fabric-weave">{Array.from({length:7},(_,i)=><g key={i}><path className="fabric-material" fill="url(#fabric-silk)"/><path className="fabric-edge" fill="none" stroke="url(#fabric-edge)" strokeWidth={i===3?1.5:.8}/></g>)}</g>
      <g className="fabric-traffic" fill="none" strokeWidth="2" strokeLinecap="round"><path className="fabric-flow fabric-rx" pathLength="1000" stroke="#d0f4ff" strokeDasharray="24 200"/><path className="fabric-flow fabric-tx" pathLength="1000" stroke="#719dca" strokeDasharray="12 240"/></g>
    </svg>
  </div>;
}
