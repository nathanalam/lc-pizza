import React from 'react';

export type ChartSeries = { name: string; color: string; data: Record<string, number> };

interface SVGLineChartProps {
  title: string;
  dates: string[];
  series: ChartSeries[];
  // Theme overrides for dark vs light backgrounds
  axisColor?: string;
  gridColor?: string;
  labelColor?: string;
  zeroLineColor?: string;
}

function formatDateLabel(d: string) {
  const parts = d.split('-');
  return parts.length >= 3 ? `${parts[1]}/${parts[2]}` : d;
}

function formatCompact(v: number) {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export default function SVGLineChart({
  title,
  dates,
  series,
  axisColor = '#d1d5db',
  gridColor = '#e5e7eb',
  labelColor = '#9ca3af',
  zeroLineColor = '#6b7280',
}: SVGLineChartProps) {
  const W = 900, H = 200;
  const PAD = { top: 16, right: 20, bottom: 36, left: 70 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const activeSeries = series.filter(s => Object.values(s.data).some(v => v !== 0));

  if (dates.length === 0 || activeSeries.length === 0) {
    return (
      <div>
        <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: labelColor, marginBottom: '4px' }}>
          {title}
        </p>
        <p style={{ fontSize: '11px', color: labelColor, fontStyle: 'italic' }}>No data available</p>
      </div>
    );
  }

  let minVal = 0, maxVal = 0;
  activeSeries.forEach(s => {
    dates.forEach(d => {
      const v = s.data[d] ?? 0;
      if (v > maxVal) maxVal = v;
      if (v < minVal) minVal = v;
    });
  });
  if (maxVal === minVal) maxVal = minVal + 1;

  const yScale = (v: number) => cH - ((v - minVal) / (maxVal - minVal)) * cH;
  const xScale = (i: number) => dates.length === 1 ? cW / 2 : (i / (dates.length - 1)) * cW;

  const numYTicks = 4;
  const yTicks = Array.from({ length: numYTicks + 1 }, (_, i) => minVal + (i / numYTicks) * (maxVal - minVal));
  const xStep = Math.max(1, Math.ceil(dates.length / 8));

  return (
    <div>
      <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: labelColor, marginBottom: '4px' }}>
        {title}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {/* Y grid + labels */}
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line
              x1={PAD.left} y1={PAD.top + yScale(tick)}
              x2={PAD.left + cW} y2={PAD.top + yScale(tick)}
              stroke={gridColor} strokeWidth="0.8"
            />
            <text x={PAD.left - 5} y={PAD.top + yScale(tick) + 3.5}
              textAnchor="end" fontSize="9" fill={labelColor}>
              {formatCompact(tick)}
            </text>
          </g>
        ))}

        {/* X labels */}
        {dates.map((d, i) => {
          if (i % xStep !== 0 && i !== dates.length - 1) return null;
          return (
            <text key={d} x={PAD.left + xScale(i)} y={H - PAD.bottom + 13}
              textAnchor="middle" fontSize="9" fill={labelColor}>
              {formatDateLabel(d)}
            </text>
          );
        })}

        {/* Axes */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + cH} stroke={axisColor} strokeWidth="1" />
        <line x1={PAD.left} y1={PAD.top + cH} x2={PAD.left + cW} y2={PAD.top + cH} stroke={axisColor} strokeWidth="1" />

        {/* Zero line (when negatives present) */}
        {minVal < 0 && (
          <line
            x1={PAD.left} y1={PAD.top + yScale(0)}
            x2={PAD.left + cW} y2={PAD.top + yScale(0)}
            stroke={zeroLineColor} strokeWidth="0.8" strokeDasharray="4,3"
          />
        )}

        {/* Lines */}
        {activeSeries.map(s => {
          const pts = dates
            .map((d, i) => {
              const v = s.data[d];
              if (v === undefined) return null;
              return `${PAD.left + xScale(i)},${PAD.top + yScale(v)}`;
            })
            .filter(Boolean)
            .join(' ');
          if (!pts) return null;
          return (
            <polyline key={s.name} points={pts} fill="none"
              stroke={s.color} strokeWidth="1.8"
              strokeLinejoin="round" strokeLinecap="round" />
          );
        })}

        {/* Dot for single-day */}
        {dates.length === 1 && activeSeries.map(s => {
          const v = s.data[dates[0]];
          if (v === undefined) return null;
          return <circle key={s.name} cx={PAD.left + xScale(0)} cy={PAD.top + yScale(v)} r="4" fill={s.color} />;
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '4px' }}>
        {activeSeries.map(s => (
          <span key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', color: labelColor }}>
            <svg width="14" height="3" style={{ display: 'inline-block' }}>
              <line x1="0" y1="1.5" x2="14" y2="1.5" stroke={s.color} strokeWidth="2" />
            </svg>
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
