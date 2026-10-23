import type { Snapshot, Wifi } from './contract';
export type WifiPoint = { time: number; observedAt?: string; wifi: Wifi | null; breakBefore: boolean };
// Only actual native observations enter this bounded history, even while the tab is unmounted.
export class WifiHistory {
  points: WifiPoint[] = [];
  private session = '';
  private adapter: string | null = null;
  accept(s: Snapshot) {
    if (this.session !== s.sessionStarted) { this.points = []; this.session = s.sessionStarted; this.adapter = null; }
    if (s.paused || !s.network.observedAt) return;
    const time = Date.parse(s.network.observedAt), last = this.points.at(-1);
    if (time < Date.parse(s.sessionStarted) || (last && time <= last.time)) return;
    if (s.network.adapterId && this.adapter && this.adapter !== s.network.adapterId) this.points = [];
    if (s.network.adapterId) this.adapter = s.network.adapterId;
    const wifi = s.network.details?.wifi ?? null;
    const previous = this.points.at(-1);
    const changedBss = !!(wifi?.bssid && previous?.wifi?.bssid && wifi.bssid !== previous.wifi.bssid);
    this.points.push({ time, observedAt: s.network.observedAt, wifi, breakBefore: changedBss || !!previous && time - previous.time > 2200 });
    this.points = this.points.slice(-600);
  }
}
export const wifiHistory = new WifiHistory();
export type LabState = 'Stable' | 'Weakening' | 'Degraded' | 'Reconnecting' | 'Disconnected' | 'Unavailable' | 'Stale' | 'Paused' | 'Awaiting route';
export function labState(s: Snapshot | null, stale: boolean, now: number, points: WifiPoint[]): LabState {
  if (!s) return 'Unavailable';
  if (s.paused) return 'Paused';
  const at = s.network.observedAt ? Date.parse(s.network.observedAt) : NaN;
  if (stale || !Number.isFinite(at) || now - at > 3500 || at - now > 1000) return 'Stale';
  const w = s.network.details?.wifi;
  if (w && ['associating', 'discovering', 'authenticating'].includes(w.state ?? '')) return 'Reconnecting';
  if (w && ['disconnected', 'disconnecting'].includes(w.state ?? '')) return 'Disconnected';
  if (!s.network.connected) return 'Disconnected';
  if (!w || w.state === 'unavailable' || w.state === 'ad-hoc') return 'Unavailable';
  if (w.state === 'connected' && !s.network.adapterId) return 'Awaiting route';
  if (w.rssiDbm === null && w.signalQuality === null) return 'Unavailable';
  if ((w.rssiDbm !== null && w.rssiDbm < -75) || (w.signalQuality !== null && w.signalQuality < 40)) return 'Degraded';
  const recent = points.filter(p => p.time >= at - 4500 && p.time < at);
  const first = recent[0];
  if (first && at - first.time >= 2000 && !recent.some(p => p.breakBefore || !p.wifi || p.wifi.rssiDbm === null) && !points.at(-1)?.breakBefore && w.rssiDbm !== null && first.wifi?.rssiDbm != null && w.rssiDbm <= first.wifi.rssiDbm - 4) return 'Weakening';
  return 'Stable';
}
export const labActive = (state: LabState) => ['Stable', 'Weakening', 'Degraded'].includes(state);
export const fieldStrength = (rssi: number | null) => rssi === null ? 0 : Math.max(0, Math.min(1, (rssi + 100) / 60));
export function wifiSeries(points: WifiPoint[], field: 'rssiDbm' | 'signalQuality' | 'rxLinkMbps' | 'txLinkMbps'): [number, number | null][] {
  return points.flatMap(p => [...(p.breakBefore ? [[p.time - 1, null] as [number, null]] : []), [p.time, p.wifi?.[field] ?? null] as [number, number | null]]);
}
