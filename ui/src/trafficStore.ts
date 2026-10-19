import { useSyncExternalStore } from 'react';
import type { TrafficBatch, TrafficSample } from './contract';

export class TrafficStore {
  private generation = -1;
  private sequence = -1;
  private ring: TrafficSample[] = [];
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  latest = () => this.ring.at(-1) ?? null;
  history = () => this.ring.slice();
  accept(batch: TrafficBatch) {
    if (batch.generation < this.generation) return;
    let changed = batch.generation !== this.generation;
    if (changed) { this.ring = []; this.sequence = -1; this.generation = batch.generation; }
    for (const sample of batch.samples) if (sample.sequence > this.sequence) {
      this.ring.push(sample); this.sequence = sample.sequence; changed = true;
    }
    if (this.ring.length > 1204) this.ring.splice(0, this.ring.length - 1204);
    if (changed) this.listeners.forEach(listener => listener());
  }
}
export const trafficStore = new TrafficStore();
export const useTraffic = () => useSyncExternalStore(trafficStore.subscribe, trafficStore.latest);
