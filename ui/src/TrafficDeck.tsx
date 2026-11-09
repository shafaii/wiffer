import { memo, useId, useMemo } from 'react';
import { trafficStore, useTraffic } from './trafficStore';
import { gaugePosition, gaugeScale } from './trafficGauge';
import './trafficDeck.css';

const rateFormat = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tickFormat = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const rate = (value: number | null) => value === null ? '—' : rateFormat.format(value);
type Direction = 'download' | 'upload';

const center = { x: 112, y: 80 };
const angleAt = (position: number) => 144 + 252 * position;
function dialPoint(radius: number, position: number) {
  const radians = angleAt(position) * Math.PI / 180;
  return { x: center.x + radius * Math.cos(radians), y: center.y + radius * Math.sin(radians) };
}

function dialArc(radius: number) {
  const start = dialPoint(radius, 0);
  const end = dialPoint(radius, 1);
  return `M${start.x} ${start.y} A${radius} ${radius} 0 1 1 ${end.x} ${end.y}`;
}

const track = dialArc(68);
const rim = dialArc(73.5);

function DialMark({ position, major }: { position: number; major?: boolean }) {
  const outer = dialPoint(59, position);
  const inner = dialPoint(major ? 55 : 57, position);
  return <line className={major ? 'traffic-gauge-mark major' : 'traffic-gauge-mark'} x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y} />;
}

function TrafficGauge({ value, ticks }: { value: number | null; ticks: readonly number[] }) {
  const id = useId();
  const position = value === null ? undefined : gaugePosition(value, ticks);
  const angle = position === undefined ? undefined : angleAt(position);
  const intervals = ticks.length - 1;

  return <div className="traffic-gauge" data-position={position}>
    <svg viewBox="0 0 224 152" aria-hidden="true" key={ticks.join('/')}>
      <defs>
        <radialGradient id={`${id}-face`}>
          <stop stopColor="currentColor" stopOpacity=".095" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-arc`} x1="44" y1="120" x2="171" y2="25" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--traffic-accent)" />
          <stop offset="1" stopColor="var(--traffic-highlight)" />
        </linearGradient>
        <linearGradient id={`${id}-needle`} x1="-12" y1="0" x2="42" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--traffic-accent)" stopOpacity=".35" />
          <stop offset="1" stopColor="#eef8ff" />
        </linearGradient>
      </defs>
      <ellipse cx={center.x} cy="73" rx="86" ry="73" fill={`url(#${id}-face)`} />
      <path className="traffic-gauge-rim" d={rim} />
      <path className="traffic-gauge-track" d={track} />
      {position !== undefined && <path className="traffic-gauge-fill" d={track} pathLength="100" stroke={`url(#${id}-arc)`} strokeDasharray="100 100" strokeDashoffset={100 * (1 - position)} opacity={position > 0 ? 1 : 0} />}
      {ticks.map((tick, index) => {
        const label = dialPoint(47, index / intervals);
        return <g className="traffic-gauge-tick" data-rate={tick} key={tick}>
          <DialMark position={index / intervals} major />
          <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="central">{tickFormat.format(tick)}</text>
          {index < intervals && [.25, .5, .75].map(offset => <DialMark key={offset} position={(index + offset) / intervals} />)}
        </g>;
      })}
      <g transform={`translate(${center.x} ${center.y})`}>
        {angle !== undefined && <g className="traffic-gauge-needle" data-angle={angle} style={{ transform: `rotate(${angle}deg)` }}>
          <path d="M-12 -1.5 L35 -1.3 42 0 35 1.3 -12 1.5 Z" fill={`url(#${id}-needle)`} />
        </g>}
        <circle className="traffic-gauge-hub" r="4" />
        {angle !== undefined && <circle className="traffic-gauge-pivot" r="1.35" />}
      </g>
    </svg>
    <div className="traffic-value"><strong>{rate(value)}</strong><span>Mbps</span></div>
  </div>;
}

function TrafficReading({ direction, value, average, ticks }: {
  direction: Direction; value: number | null; average: number | null; ticks: readonly number[];
}) {
  const download = direction === 'download';
  return <article className={`traffic-reading ${direction}`}>
    <h3><span className="traffic-direction" aria-hidden="true">
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={download ? 'M8 3v10m-4-4 4 4 4-4' : 'M8 13V3m-4 4 4-4 4 4'} />
      </svg>
    </span>{download ? 'Download' : 'Upload'}</h3>
    <TrafficGauge value={value} ticks={ticks} />
    <div className="traffic-average" title="3-second weighted average">3s average <b>{rate(average)} Mbps</b></div>
  </article>;
}

export const TrafficDeck = memo(function TrafficDeck({ inactiveReason }: { inactiveReason: string | null }) {
  const latest = useTraffic();
  const ticks = useMemo(() => gaugeScale(trafficStore.history()), [latest]);
  const measured = latest?.status === 'measured';
  const live = inactiveReason === null && measured;
  const status = inactiveReason ?? (measured ? 'Live' : latest?.status === 'unavailable' ? 'Unavailable' : 'Waiting for samples');

  return <section className="traffic-deck" aria-labelledby="local-traffic-heading" data-inactive={inactiveReason !== null}>
    <div className="cockpit-heading">
      <div><h2 id="local-traffic-heading">Local PC traffic</h2><p>LAN and internet traffic</p></div>
      <span className={`traffic-status${live ? ' is-live' : ''}`}><span className="tiny-dot" />{status}</span>
    </div>
    <div className="traffic-readings">
      <TrafficReading direction="download" value={latest?.downloadMbps ?? null} average={latest?.downloadAverage ?? null} ticks={ticks} />
      <TrafficReading direction="upload" value={latest?.uploadMbps ?? null} average={latest?.uploadAverage ?? null} ticks={ticks} />
    </div>
    <div className="traffic-caption">
      <span>Shared adaptive scale · 0–{ticks.at(-1)?.toLocaleString()} Mbps</span>
      {measured && <time dateTime={latest.timestamp} title={`Measured over ${(latest.elapsedSeconds * 1000).toFixed(0)} ms`}>
        {live ? 'Sample ' : 'Last sample '}{new Date(latest.timestamp).toLocaleTimeString()}
      </time>}
      {!inactiveReason && !measured && latest?.error && <span>{latest.error}</span>}
    </div>
  </section>;
});
