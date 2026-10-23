import { describe, expect, it } from 'vitest';
import { liveView, nearestObservation, panWindow, qualitySegments, qualityY, windowEnd, zoomWindow } from './surfaceModel';
import { wifiSchema } from './contract';
import type { WifiPoint } from './wifiModel';
const wifi=wifiSchema.parse({ssid:null,band:null,channel:null,rssiDbm:-63,signalQuality:82,rxLinkMbps:866.7,txLinkMbps:72,unavailableReason:null,state:'connected'});
const point=(time:number, quality:number|null=82, gap=false):WifiPoint=>({time,wifi:{...wifi,signalQuality:quality},breakBefore:gap});
describe('live signal surface',()=>{
 it('uses a fixed quality axis with exact endpoints and no adaptive exaggeration',()=>{expect([0,50,82,100].map(qualityY)).toEqual([100,50,18,0]);});
 it('preserves exact samples and separates missing data, zero, gaps and roaming',()=>{const p=[point(1000,0),point(2000,null),point(3000),point(6000,90,true)];expect(qualitySegments(p)).toEqual([[p[0]],[p[2]],[p[3]]]);expect(p[0].wifi?.signalQuality).toBe(0);});
 it('suppresses nonconnected quality and never invents values for empty history',()=>{const p=point(1);p.wifi!.state='disconnected';expect(qualitySegments([p])).toEqual([]);expect(qualitySegments([])).toEqual([]);expect(nearestObservation([],100,0,200)).toBeNull();});
 it('appends actual samples without moving earlier timestamps or changing quality',()=>{const p=[point(1000),point(2000)];const first=qualitySegments(p)[0];p.push(point(3000,40));expect(qualitySegments(p)[0].slice(0,2)).toEqual(first);expect(windowEnd(p,null,3500)).toBe(3500);});
 it('selects real observations only, including independent missing fields',()=>{const p=[point(1000),point(2000,null),point(5000)];expect(nearestObservation(p,2500,0,4000)).toBe(p[1]);expect(nearestObservation(p,1000,3000,4000)).toBeNull();});
 it('clamps scrubbing at retained-history boundaries and handles insufficient history',()=>{const p=[point(1000),point(2000)];expect(panWindow(2000,900,900,60,p,2000)).toBe(1000);expect(panWindow(1000,-900,900,60,p,2000)).toBe(2000);expect(windowEnd([],1,5000)).toBe(5000);});
 it('keeps zoom continuous and bounded between one and five minutes',()=>{expect(zoomWindow(60,2)).toBe(120);expect(zoomWindow(60,.1)).toBe(60);expect(zoomWindow(300,10)).toBe(300);});
 it('pinned window stays fixed on arrival; Return to Live clears pin and follows newest time',()=>{const p=[point(1000),point(2000)];expect(windowEnd(p,1500,3000)).toBe(1500);const v=liveView();expect(v.pinned).toBeNull();expect(windowEnd(p,v.end,3000)).toBe(3000);});
});
