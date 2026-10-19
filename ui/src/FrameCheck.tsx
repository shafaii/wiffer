import { useEffect, useRef, useState } from 'react';
export function FrameCheck() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState('30s presentation check · keep window visible');
  const frame = useRef(0);
  useEffect(() => {
    if (!running) return;
    const intervals: number[] = [];
    let previous = 0, start = 0, hidden = false;
    const visibility = () => { if (document.hidden) hidden = true; };
    document.addEventListener('visibilitychange', visibility);
    const measure = (now: number) => {
      if (!start) start = now;
      if (previous) intervals.push(now - previous);
      previous = now;
      if (now - start < 30000) { frame.current = requestAnimationFrame(measure); return; }
      const sorted = [...intervals].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length * .5)];
      const p95 = sorted[Math.floor(sorted.length * .95)];
      const slow = intervals.filter(ms => ms > median * 1.5).length;
      const missed = intervals.reduce((n, ms) => n + Math.max(0, Math.round(ms / median) - 1), 0);
      setResult(`${hidden ? 'Visibility changed; invalid for comparison · ' : ''}${intervals.length} frames / 30s · p50 ${median.toFixed(2)}ms · p95 ${p95.toFixed(2)}ms · ${slow} long frames · ~${missed} missed refreshes`);
      setRunning(false);
    };
    frame.current = requestAnimationFrame(measure);
    return () => { cancelAnimationFrame(frame.current); document.removeEventListener('visibilitychange', visibility); };
  }, [running]);
  return <div className="frame-check"><button disabled={running} onClick={() => setRunning(true)}>{running ? 'Measuring 30s…' : 'Measure frame pacing'}</button><span role="status">{result}</span><small>requestAnimationFrame intervals; missed refreshes estimated from the median. Not a GPU present trace.</small></div>;
}
