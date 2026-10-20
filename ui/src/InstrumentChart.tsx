import { memo, useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, ScatterChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, MarkLineComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { Snapshot, TrafficSample } from './contract';
import { focusScale, inverseFocus, seriesPoints } from './chartMath';
import { trafficPoints, variationPoints, type InstrumentPoint } from './instrumentMath';
echarts.use([LineChart, ScatterChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);
export type Instrument = 'gateway' | 'internet' | 'variation' | 'loss' | 'download' | 'upload';
export const instruments: Instrument[] = ['gateway', 'internet', 'variation', 'loss', 'download', 'upload'];
const titles = { gateway: 'Gateway RTT', internet: 'External RTT', variation: 'RTT variation', loss: 'Packet-loss events', download: 'Download history', upload: 'Upload history' };
const colors = { gateway: '#67c7ff', internet: '#b5dfff', variation: '#e9ca81', loss: '#f18d83', download: '#67c7ff', upload: '#b5dfff' };
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const InstrumentChart = memo(function InstrumentChart({ kind, snapshot, traffic, seconds, focus, expanded, onExpand, stale }: {
  kind: Instrument; snapshot: Snapshot | null; traffic: TrafficSample[]; seconds: number; focus: boolean; expanded: boolean; onExpand: () => void; stale: boolean;
}) {
  const element = useRef<HTMLDivElement>(null);
  const instance = useRef<echarts.EChartsType | null>(null);
  const isTraffic = kind === 'download' || kind === 'upload';
  const unit = isTraffic ? 'Mbps' : kind === 'loss' ? 'events' : 'ms';
  const now = snapshot ? Date.parse(snapshot.now) : Date.now();
  const start = now - seconds * 1000;
  const endpoint = kind === 'gateway' ? snapshot?.gateway : snapshot?.internet;
  const latest = isTraffic ? (kind === 'download' ? traffic.at(-1)?.downloadMbps : traffic.at(-1)?.uploadMbps) :
    kind === 'variation' ? (snapshot ? variationPoints(snapshot.internet.samples).at(-1)?.raw : null) : endpoint?.samples.at(-1)?.rttMs;
  const stats = snapshot ? [snapshot.gateway, snapshot.internet].map(e => seconds === 60 ? e.stats60 : e.stats300) : [];
  const sent = stats.reduce((n, s) => n + s.sent, 0), failed = stats.reduce((n, s) => n + s.errors + s.timeouts, 0);
  const hasData = isTraffic ? traffic.some(s => Date.parse(s.timestamp) > start && Date.parse(s.timestamp) <= now) :
    snapshot && (kind === 'gateway' ? snapshot.gateway.samples : kind === 'internet' ? snapshot.internet.samples : [...snapshot.gateway.samples, ...snapshot.internet.samples]).some(s => Date.parse(s.timestamp) > start && Date.parse(s.timestamp) <= now);
  useEffect(() => {
    const chart = echarts.init(element.current!, undefined, { renderer: 'canvas' }); instance.current = chart;
    chart.group = 'wiffer-instruments'; echarts.connect('wiffer-instruments');
    const observer = new ResizeObserver(() => { chart.dispatchAction({ type: 'hideTip' }); chart.resize(); }); observer.observe(element.current!);
    return () => { observer.disconnect(); chart.dispose(); instance.current = null; };
  }, []);
  useEffect(() => {
    const series: object[] = [];
    const line = (id: string, name: string, data: InstrumentPoint[], color: string, area = false) => series.push({ id, name, type: 'line', data: data.filter(p => p.value[0] > start && p.value[0] <= now), showSymbol: false, connectNulls: false, smooth: false,
      lineStyle: { color, width: 1.5 }, itemStyle: { color }, ...(area ? { areaStyle: { color, opacity: .06 } } : {}) });
    if (snapshot && (kind === 'gateway' || kind === 'internet')) {
      const samples = snapshot[kind].samples;
      const visible = samples.filter(s => Date.parse(s.timestamp) > start && Date.parse(s.timestamp) <= now);
      const failureHeight = Math.max(focus ? 60 : 30, ...visible.map(s => focus ? focusScale(s.rttMs ?? 0) : s.rttMs ?? 0)) * 1.05;
      line('rtt', titles[kind], seriesPoints(samples, start, now, focus).map(p => ({ value: p.value, raw: p.raw?.rttMs ?? null, note: p.raw?.error ?? 'Native ICMP reply' })), colors[kind], true);
      series.push({ id: 'failures', type: 'scatter', name: 'Failed probe (no RTT)', symbol: 'diamond', symbolSize: 7,
        data: visible.filter(s => s.status !== 'success').map(s => ({ value: [Date.parse(s.timestamp), failureHeight], raw: null, note: `${s.status}: ${s.error ?? 'No reply'}` })), itemStyle: { color: colors.loss } });
    } else if (snapshot && kind === 'variation') {
      for (const id of ['gateway', 'internet'] as const) line(id, id, variationPoints(snapshot[id].samples), colors[id]);
    } else if (snapshot && kind === 'loss') {
      for (const [index, id] of (['gateway', 'internet'] as const).entries()) series.push({ id, name: id, type: 'scatter', symbol: 'rect', symbolSize: [3, 11],
        data: snapshot[id].samples.filter(s => Date.parse(s.timestamp) > start && Date.parse(s.timestamp) <= now).map(s => ({ value: [Date.parse(s.timestamp), index + 1], raw: null,
          note: `${id}: ${s.status}${s.error ? ' · ' + s.error : ''}`, itemStyle: { color: s.status === 'success' ? '#585754' : colors.loss, opacity: s.status === 'success' ? .6 : 1 }, symbolSize: s.status === 'success' ? [2, 5] : [5, 16] })), itemStyle: { color: colors[id] } });
    } else if (isTraffic) line('traffic', titles[kind], trafficPoints(traffic, kind), colors[kind], true);
    instance.current?.setOption({ animation: false, backgroundColor: 'transparent', grid: { left: 49, right: 17, top: 13, bottom: 29 },
      tooltip: { trigger: 'axis', confine: true, extraCssText: 'max-width: min(420px, calc(100% - 16px)); white-space: normal; overflow-wrap: anywhere;', backgroundColor: '#252421', borderColor: '#575653', textStyle: { color: '#f7f6f3', fontSize: 12 },
        formatter: (parameters: unknown) => {
          const points = parameters as { seriesName: string; data: InstrumentPoint }[];
          if (!Array.isArray(points) || !points.length) return '';
          return `<b>${new Date(points[0].data.value[0]).toLocaleTimeString(undefined, { hour12: false })}.${String(points[0].data.value[0] % 1000).padStart(3, '0')}</b><br/>` + points.map(p => `${escape(p.seriesName)}: ${p.data.raw === null ? '—' : p.data.raw.toLocaleString(undefined, { maximumFractionDigits: 6 }) + ' ' + unit}<br/><span style="color:#c4c3c0">${escape(p.data.note)}</span>`).join('<br/>');
        }, axisPointer: { type: 'line', lineStyle: { color: '#868582' } } },
      xAxis: { type: 'time', min: start, max: now, splitNumber: expanded ? 8 : 3, axisLine: { lineStyle: { color: '#444340' } }, axisTick: { show: false }, axisLabel: { color: '#a5a4a1', fontSize: 10, hideOverlap: true, formatter: (v: number) => new Date(v).toLocaleTimeString(undefined, { hour12: false, minute: '2-digit', second: '2-digit' }) }, splitLine: { show: true, lineStyle: { color: '#2a2926', type: 'dotted' } } },
      yAxis: { type: 'value', min: 0, max: kind === 'loss' ? 3 : kind === 'gateway' || kind === 'internet' ? (v: { max: number }) => Math.max(focus ? 60 : 30, v.max * 1.1) : undefined, splitNumber: 3,
        ...(focus && (kind === 'gateway' || kind === 'internet') ? { interval: 20 } : {}),
        axisLabel: { color: '#a5a4a1', fontSize: 10, hideOverlap: true, formatter: (v: number) => kind === 'loss' ? v === 1 ? 'GW' : v === 2 ? 'EXT' : '' : (focus && (kind === 'gateway' || kind === 'internet') ? inverseFocus(v) : v).toLocaleString(undefined, { maximumSignificantDigits: 3 }) }, splitLine: { show: kind !== 'loss', lineStyle: { color: '#33322f', type: 'dotted' } } },
      series }, { replaceMerge: ['series'], lazyUpdate: true });
  }, [kind, snapshot, traffic, seconds, focus, expanded, start, now, isTraffic, unit]);
  return <section className={`instrument-chart ${kind} ${expanded ? 'expanded' : ''}`} aria-label={titles[kind]}>
    <div className="chart-head"><h3><span>{String(instruments.indexOf(kind) + 1).padStart(2, '0')}</span>{titles[kind]}</h3><div><b>{kind === 'loss' ? sent ? `${(failed / sent * 100).toFixed(1)}%` : '—' : latest == null ? '—' : latest.toFixed(2)}</b><small>{kind === 'loss' ? 'combined loss' : unit}</small><button onClick={onExpand} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${titles[kind]}`} title="Expand instrument">{expanded ? '↙' : '↗'}</button></div></div>
    <div className="chart-surface"><div ref={element} className="instrument-canvas" role="img" aria-label={`${titles[kind]}, ${seconds} second history. Hover for exact timestamps and values.`} />
      {!hasData && <div className="chart-empty">{stale ? 'Host updates stopped' : snapshot?.paused ? 'Paused · no samples in window' : snapshot && !snapshot.network.connected ? 'Disconnected · waiting for network' : isTraffic && traffic.at(-1)?.status === 'unavailable' ? 'Interface counters unavailable' : 'Awaiting native measurements'}</div>}</div>
    <div className="chart-foot"><span>{kind === 'gateway' || kind === 'internet' ? `${endpoint?.target ?? 'No target'} · ${focus ? 'focus scale¹' : 'linear scale'}` : kind === 'variation' ? '10s rolling · sky GW / glacier EXT' : kind === 'loss' ? `${failed} failed / ${sent} completed · dim ticks = replies` : 'Measured interface traffic · unsmoothed'}</span><span>{!snapshot ? 'NO HOST' : stale ? 'STALE' : snapshot.paused ? 'PAUSED' : !snapshot.network.connected ? 'OFFLINE' : 'LIVE'}</span></div>
  </section>;
});
