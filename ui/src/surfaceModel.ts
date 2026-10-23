import type { WifiPoint } from './wifiModel';
export type SurfaceView = { seconds: number; end: number | null; pinned: number | null };
export const liveView = (): SurfaceView => ({ seconds: 60, end: null, pinned: null });
export function windowEnd(points: WifiPoint[], end: number | null, latest: number) {
  return end === null ? latest : Math.max(Math.min(points[0]?.time ?? latest, latest), Math.min(latest, end));
}
export function zoomWindow(seconds: number, factor: number) { return Math.max(60, Math.min(300, seconds * factor)); }
export function panWindow(end: number, deltaPixels: number, width: number, seconds: number, points: WifiPoint[], latest: number) {
  return windowEnd(points, end - deltaPixels / Math.max(1, width) * seconds * 1000, latest);
}
export const qualityY = (q: number) => 100 - Math.max(0, Math.min(100, q));
export function nearestObservation(points: WifiPoint[], time: number, start: number, end: number) {
  return points.filter(p => p.time >= start && p.time <= end).reduce<WifiPoint | null>((best, p) => !best || Math.abs(p.time-time)<Math.abs(best.time-time) ? p : best, null);
}
// Separate paths across missing measurements, nonconnected observations, gaps and roaming.
export function qualitySegments(points: WifiPoint[]) {
  const segments: WifiPoint[][] = []; let current: WifiPoint[] = [];
  for (const p of points) {
    const q = p.wifi?.signalQuality;
    const valid = q != null && Number.isFinite(q) && p.wifi?.state === 'connected';
    if (p.breakBefore || !valid) { if (current.length) segments.push(current); current = []; }
    if (valid) current.push(p);
  }
  if (current.length) segments.push(current);
  return segments;
}
