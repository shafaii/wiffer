import { describe, expect, it } from 'vitest';
import { fieldStrength, labState, WifiHistory, wifiSeries } from './wifiModel';
import { snapshotSchema, wifiSchema, type Snapshot } from './contract';
const base = 1800000000000;
const wifi = wifiSchema.parse({ ssid: null, band: '5 GHz', channel: 36, rssiDbm: -60, signalQuality: 80, rxLinkMbps: 866.7, txLinkMbps: 72, unavailableReason: null, state: 'connected', bssid: 'AA:BB:CC:DD:EE:01' });
const metrics = {sent:0,successful:0,timeouts:0,errors:0,lossPercent:null,min:null,average:null,max:null,median:null,p95:null,variation:null};
const iso = (t: number) => new Date(base+t).toISOString();
function snap(t = 0): Snapshot {
  return snapshotSchema.parse({now:iso(t),sessionStarted:iso(0),runningSeconds:t/1000,paused:false,
    network:{connected:true,adapterId:'a',adapterName:'Test adapter',gateway:null,adapters:[],error:null,observedAt:iso(t),
      details:{type:'Wi-Fi',operationalState:'Up',selection:'Test fixture',bytesReceived:null,bytesSent:null,receiveErrors:null,sendErrors:null,receiveDiscards:null,sendDiscards:null,counterError:null,wifi:{...wifi}}},
    settings:{gatewayOverride:null,internetTarget:'1.1.1.1',timeoutMs:2500},gateway:{id:'gateway',target:null,samples:[],stats60:metrics,stats300:metrics},internet:{id:'internet',target:'1.1.1.1',samples:[],stats60:metrics,stats300:metrics}});
}
describe('shared Wi-Fi native observation history', () => {
  it('deduplicates native timestamps, freezes on pause and bounds to 600 observations', () => {
    const h = new WifiHistory(); for(let i=0;i<650;i++) h.accept(snap(i*1000));
    expect(h.points).toHaveLength(600); h.accept(snap(649000)); expect(h.points).toHaveLength(600);
    const s=snap(650000);s.paused=true;h.accept(s);expect(h.points.at(-1)?.time).toBe(base+649000);
  });
  it('clears session and adapter replacements while retaining gaps on disconnection', () => {
    const h=new WifiHistory();h.accept(snap());const disconnected=snap(1000);disconnected.network.adapterId=null;disconnected.network.details=null;h.accept(disconnected);
    expect(wifiSeries(h.points,'rssiDbm')).toEqual([[base,-60],[base+1000,null]]);
    const next=snap(2000);next.network.adapterId='b';h.accept(next);expect(h.points).toHaveLength(1);
    next.sessionStarted=iso(3000);h.accept(next);expect(h.points).toHaveLength(0);
  });
  it('breaks traces across missed polls and BSSID changes without altering exact values', () => {
    const h=new WifiHistory();h.accept(snap());h.accept(snap(5000));
    const roam=snap(6000);roam.network.details!.wifi!.bssid='AA:BB:CC:DD:EE:02';h.accept(roam);
    expect(h.points.slice(1).every(p=>p.breakBefore)).toBe(true);
    expect(wifiSeries(h.points,'rxLinkMbps').map(p=>p[1])).toEqual([866.7,null,866.7,null,866.7]);
  });
});
describe('coherent state and display-only mapping', () => {
  it('distinguishes stale, unavailable, reconnecting, disconnected and paused', () => {
    const s=snap();expect(labState(s,false,base,[])).toBe('Stable');expect(labState(s,false,base+3501,[])).toBe('Stale');expect(labState(s,true,base,[])).toBe('Stale');
    s.network.details!.wifi!.state='authenticating';expect(labState(s,false,base,[])).toBe('Reconnecting');
    s.network.details!.wifi!.state='disconnected';expect(labState(s,false,base,[])).toBe('Disconnected');
    s.network.details!.wifi=null;expect(labState(s,false,base,[])).toBe('Unavailable');s.paused=true;expect(labState(s,false,base+99999,[])).toBe('Paused');
  });
  it('uses independent quality/RSSI thresholds and a time-bounded weakening comparison', () => {
    const h=new WifiHistory();h.accept(snap());h.accept(snap(1000));const s=snap(3000);s.network.details!.wifi!.rssiDbm=-65;h.accept(s);
    expect(labState(s,false,base+3000,h.points)).toBe('Weakening');s.network.details!.wifi!.rssiDbm=null;s.network.details!.wifi!.signalQuality=0;expect(labState(s,false,base+3000,h.points)).toBe('Degraded');
    s.network.details!.wifi!.signalQuality=null;expect(labState(s,false,base+3000,h.points)).toBe('Unavailable');
    expect(fieldStrength(null)).toBe(0);expect(fieldStrength(-70)).toBe(.5);expect(fieldStrength(-120)).toBe(0);expect(fieldStrength(-20)).toBe(1);
  });
  it('rejects malformed state, identifiers and observation timestamps at the bridge', () => {
    expect(wifiSchema.safeParse({...wifi,state:'excellent'}).success).toBe(false);expect(wifiSchema.safeParse({...wifi,bssid:'bad'}).success).toBe(false);
    const s=snap();s.network.observedAt='yesterday';expect(snapshotSchema.safeParse(s).success).toBe(false);
  });
});
