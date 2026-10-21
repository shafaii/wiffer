import { labActive, type LabState } from './wifiModel';
// Display calibration only; reported values are never modified.
export function haloQuality(quality: number | null | undefined): number | null {
  return quality == null || !Number.isFinite(quality) ? null : Math.max(0, Math.min(1, quality / 100));
}
export function haloState(state: LabState, quality: number | null | undefined): string {
  if (!labActive(state)) return state;
  const q = haloQuality(quality);
  if (q === null) return 'Unavailable';
  return q >= .8 ? 'Excellent' : q >= .6 ? 'Good' : q >= .4 ? 'Fair' : 'Weak';
}
