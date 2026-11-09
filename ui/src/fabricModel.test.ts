import { describe, expect, it } from 'vitest';
import { fabricQuality, fabricTraffic, ribbonPath } from './fabricModel';
import type { TrafficSample } from './contract';
const now = Date.now();
const sample: TrafficSample = {sequence:1,timestamp:new Date(now).toISOString(),elapsedSeconds:.25,status:'measured',downloadMbps:10,uploadMbps:0,downloadAverage:10,uploadAverage:0,error:null};
describe('kinetic fabric presentation boundaries',()=>{
  it('maps quality independently and linearly with missing/inactive suppression',()=>{expect([20,50,80,100].map(q=>fabricQuality(q,true))).toEqual([.2,.5,.8,1]);expect(fabricQuality(null,true)).toBe(0);expect(fabricQuality(80,false)).toBe(0);});
  it('uses only fresh measured traffic, independently by direction',()=>{expect(fabricTraffic(sample,true,now)[0]).toBeGreaterThan(0);expect(fabricTraffic(sample,true,now)[1]).toBe(0);for(const s of [null,{...sample,status:'baseline' as const},{...sample,timestamp:new Date(now-2000).toISOString()}])expect(fabricTraffic(s,true,now)).toEqual([0,0]);expect(fabricTraffic(sample,false,now)).toEqual([0,0]);});
  it('keeps stable quality geometry deterministic and dimensional',()=>{const p=ribbonPath(3,.8);expect(p).toBe(ribbonPath(3,.8));expect(new Set(p.match(/,[\d.]+/g)).size).toBeGreaterThan(50);expect(p).not.toBe(ribbonPath(3,.2));});
  it('deforms locally and restores exactly without changing endpoints',()=>{const rest=ribbonPath(3,.8),pull=ribbonPath(3,.8,80,-60,.5);expect(pull).not.toBe(rest);expect(pull.split(' L')[0]).toBe(rest.split(' L')[0]);expect(ribbonPath(3,.8,0,0,.5)).toBe(rest);});
});
