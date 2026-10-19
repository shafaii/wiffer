import { useCallback, useEffect, useRef, useState } from 'react';
import { trafficStore } from './trafficStore';
import { messageSchema, type Command, type Settings, type Snapshot } from './contract';

export function useMonitor() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [stale, setStale] = useState(false);
  const lastMessage = useRef(Date.now());
  const active = useRef<{ id: string; timer: ReturnType<typeof setTimeout>; resolve: (ok: boolean) => void } | null>(null);
  useEffect(() => {
    const bridge = window.chrome?.webview;
    if (!bridge) return;
    const listener = (event: MessageEvent) => {
      const parsed = messageSchema.safeParse(event.data);
      if (!parsed.success) { setError('The desktop sent an invalid message. Restart PulseDeck.'); return; }
      lastMessage.current = Date.now(); setStale(false);
      const message = parsed.data;
      if (message.type === 'traffic') trafficStore.accept(message.batch);
      if (message.type === 'snapshot') setSnapshot(message.snapshot);
      if (message.type === 'error') setError(message.message);
      if ((message.type === 'ack' || message.type === 'error') && active.current?.id === message.id) {
        clearTimeout(active.current.timer); active.current.resolve(message.type === 'ack'); active.current = null; setPending(false);
      }
    };
    bridge.addEventListener('message', listener);
    bridge.postMessage({ version: 2, type: 'ready', id: 'ready' });
    const watchdog = setInterval(() => setStale(Date.now() - lastMessage.current > 5000), 1000);
    return () => { bridge.removeEventListener('message', listener); clearInterval(watchdog); if (active.current) { clearTimeout(active.current.timer); active.current.resolve(false); active.current = null; } };
  }, []);
  const command = useCallback((type: Command['type'], settings?: Settings): Promise<boolean> => {
    const bridge = window.chrome?.webview;
    if (!bridge || active.current) return Promise.resolve(false);
    setError(null); setPending(true);
    return new Promise(resolve => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => { active.current = null; setPending(false); setError('The desktop did not acknowledge this action. State below reflects the last received snapshot.'); resolve(false); }, 12000);
      active.current = { id, timer, resolve };
      if (type === 'configure' && settings) bridge.postMessage({ version: 2, id, type, settings });
      else bridge.postMessage({ version: 2, id, type: type as 'pause' | 'resume' | 'reset' | 'ready' });
    });
  }, []);
  return { snapshot, error, pending, stale, command, clearError: () => setError(null) };
}
