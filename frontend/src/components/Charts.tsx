import { useId } from 'react';
import { formatNumber } from '../lib/format';

interface Point {
  label: string;
  value: number | null;
  hint?: string;
}

export function LineChart({
  points,
  height = 200,
  color = 'var(--accent)',
  formatValue = (v: number) => formatNumber(v, 1),
  unit,
  emptyText = '还没有足够的数据',
}: {
  points: Point[];
  height?: number;
  color?: string;
  formatValue?: (value: number) => string;
  unit?: string;
  emptyText?: string;
}) {
  const gradientId = useId().replace(/:/g, '');
  const valid = points.filter((p) => p.value !== null && Number.isFinite(p.value)) as Array<Point & { value: number }>;
  if (valid.length === 0) {
    return <div className="chart-empty" style={{ height }}>{emptyText}</div>;
  }
  const width = 640;
  const padX = 36;
  const padTop = 18;
  const padBottom = 28;
  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;
  const values = valid.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.max(1, max * 0.2);
  const lower = min === max ? Math.max(0, min - span) : Math.max(0, min - span * 0.15);
  const upper = max + span * 0.15;
  const stepX = valid.length > 1 ? innerW / (valid.length - 1) : 0;
  const coords = valid.map((point, index) => {
    const x = padX + index * stepX;
    const y = padTop + innerH - ((point.value - lower) / (upper - lower || 1)) * innerH;
    return { ...point, x, y };
  });
  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords[coords.length - 1].x.toFixed(1)},${(padTop + innerH).toFixed(1)} L${coords[0].x.toFixed(1)},${(padTop + innerH).toFixed(1)} Z`;
  const labelStep = Math.max(1, Math.ceil(points.length / 6));

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="趋势图">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.26" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <line
            key={ratio}
            x1={padX}
            x2={width - padX}
            y1={padTop + innerH * ratio}
            y2={padTop + innerH * ratio}
            stroke="var(--chart-grid)"
            strokeDasharray="3 5"
          />
        ))}
        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((c) => (
          <g key={c.label + c.x}>
            <circle cx={c.x} cy={c.y} r="4" fill="var(--bg)" stroke={color} strokeWidth="2">
              <title>{`${c.label}：${formatValue(c.value)}${unit ?? ''}`}</title>
            </circle>
          </g>
        ))}
        {points.map((point, index) => {
          if (index % labelStep !== 0 && index !== points.length - 1) return null;
          const x = padX + (valid.length > 1 ? index * stepX : 0);
          return (
            <text key={point.label + index} x={Math.min(width - padX, Math.max(padX, x))} y={height - 8} textAnchor="middle" className="chart-label">
              {point.label}
            </text>
          );
        })}
        <text x={padX - 8} y={padTop + 4} textAnchor="end" className="chart-axis">
          {formatValue(upper)}
        </text>
        <text x={padX - 8} y={padTop + innerH} textAnchor="end" className="chart-axis">
          {formatValue(lower)}
        </text>
      </svg>
    </div>
  );
}

export function BarChart({
  items,
  height = 170,
  color = 'var(--accent)',
  formatValue = (v: number) => formatNumber(v, 0),
  unit,
}: {
  items: Array<{ label: string; value: number; hint?: string }>;
  height?: number;
  color?: string;
  formatValue?: (value: number) => string;
  unit?: string;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="bar-chart" style={{ height }}>
      {items.map((item) => (
        <div className="bar-col" key={item.label} title={`${item.label}：${formatValue(item.value)}${unit ?? ''}`}>
          <span className="bar-value">{formatValue(item.value)}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ height: `${Math.max(2, (item.value / max) * 100)}%`, background: color }} />
          </div>
          <span className="bar-label">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

const DONUT_COLORS = ['#c8f751', '#7cc7ff', '#ffb35c', '#ff6b6b', '#b794ff', '#5ee0c0', '#ffd166', '#8fa3b8', '#e07be0'];

export function Donut({
  items,
  size = 180,
  thickness = 18,
  centerLabel,
  centerValue,
}: {
  items: Array<{ label: string; value: number }>;
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  if (total === 0) {
    return <div className="chart-empty" style={{ height: size }}>近 4 周还没有训练</div>;
  }
  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="肌群分布">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--chart-track)" strokeWidth={thickness} />
          {items.map((item, index) => {
            const ratio = item.value / total;
            const dash = ratio * circumference;
            const circle = (
              <circle
                key={item.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={DONUT_COLORS[index % DONUT_COLORS.length]}
                strokeWidth={thickness}
                strokeDasharray={`${Math.max(0, dash - 2)} ${circumference}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              >
                <title>{`${item.label}：${item.value} 组（${Math.round(ratio * 100)}%）`}</title>
              </circle>
            );
            offset += dash;
            return circle;
          })}
        </g>
        <text x="50%" y="47%" textAnchor="middle" className="donut-center-value">
          {centerValue ?? total}
        </text>
        <text x="50%" y="60%" textAnchor="middle" className="donut-center-label">
          {centerLabel ?? '总组数'}
        </text>
      </svg>
      <div className="donut-legend">
        {items.map((item, index) => (
          <div key={item.label} className="legend-row">
            <span className="legend-dot" style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }} />
            <span className="legend-label">{item.label}</span>
            <span className="legend-value">
              {item.value} 组 · {Math.round((item.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
