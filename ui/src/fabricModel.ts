import type { TrafficSample } from './contract';
export const fabricQuality = (q: number | null, active: boolean) => active && q !== null && Number.isFinite(q) ? Math.max(0, Math.min(1, q / 100)) : 0;
// A bounded visual response, not an interface-capacity scale. Zero/unavailable never moves.
export function fabricTraffic(sample: TrafficSample | null, active: boolean, now: number) {
  if (!active || !sample || sample.status !== 'measured' || now - Date.parse(sample.timestamp) > 1200 || Date.parse(sample.timestamp) > now + 1000) return [0, 0];
  return [sample.downloadMbps, sample.uploadMbps].map(v => v === null || v <= 0 ? 0 : Math.min(1, Math.log1p(v) / Math.log(101)));
}
export function ribbonPath(index: number, q: number, pullX = 0, pullY = 0, anchor = .5, edge = false) {
  const top: string[] = [], bottom: string[] = [];
  for (let n = 0; n <= 80; n++) {
    const t = n / 80, envelope = Math.sin(Math.PI * t) ** .7;
    const influence = Math.exp(-(((t - anchor) / .19) ** 2)) * envelope;
    const x = 25 + t * 1150 + pullX * influence;
    const wave = Math.sin(t * Math.PI * 2.15 - .9 + index * .16);
    const y = 196 + wave * (68 + q * 32) * envelope + (index - 3) * (12 + 10 * q) * envelope + 23 * Math.sin(t * Math.PI) + pullY * influence;
    const width = (6 + q * 17) * envelope * (.6 + .4 * Math.sin(t * Math.PI + index * .4) ** 2);
    top.push(`${x.toFixed(2)},${(y - width).toFixed(2)}`);
    bottom.unshift(`${x.toFixed(2)},${(y + width).toFixed(2)}`);
  }
  return `M${top.join(' L')}${edge ? '' : ' L' + bottom.join(' L') + ' Z'}`;
}
