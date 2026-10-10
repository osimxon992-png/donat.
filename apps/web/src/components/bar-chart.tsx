'use client';

import { useMemo, useState } from 'react';

export interface BarDatum {
  label: string;
  value: number;
  /** Pre-formatted value for tooltip/table (keeps money formatting out of chart math). */
  display: string;
  extra?: string;
}

/**
 * Single-series bar chart (magnitude over time). One hue, thin bars with 4px rounded
 * data-ends on the baseline, 2px gaps, recessive grid, hover tooltip, and a table view.
 */
export function BarChart({ data, title, height = 200 }: { data: BarDatum[]; title: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const max = useMemo(() => Math.max(1, ...data.map((d) => d.value)), [data]);
  const ticks = [0, 0.5, 1];
  const width = 600;
  const padL = 4;
  const padB = 22;
  const plotH = height - padB;
  const slot = (width - padL) / Math.max(1, data.length);
  const barW = Math.max(2, slot - 2); // 2px surface gap between bars
  const labelEvery = Math.ceil(data.length / 8);
  const active = hover !== null ? data[hover] : undefined;

  return (
    <figure className="card p-4">
      <figcaption className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold">{title}</span>
        <button className="text-xs text-muted hover:text-text" onClick={() => setShowTable((s) => !s)}>
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </figcaption>
      {showTable ? (
        <div className="max-h-64 overflow-y-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Period</th>
                <th className="text-right">Value</th>
                <th className="text-right">Details</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.label}>
                  <td>{d.label}</td>
                  <td className="text-right tabular-nums">{d.display}</td>
                  <td className="text-right text-muted">{d.extra}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <line key={t} x1={0} x2={width} y1={plotH - t * plotH} y2={plotH - t * plotH} stroke="var(--color-border)" strokeWidth={1} strokeDasharray={t === 0 ? undefined : '2 4'} />
            ))}
            {data.map((d, i) => {
              const h = (d.value / max) * (plotH - 6);
              const x = padL + i * slot;
              return (
                <g key={d.label}>
                  {/* hit target is the full slot, larger than the mark */}
                  <rect x={x} y={0} width={slot} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />
                  {h > 0 && (
                    <path
                      d={barPath(x + 1, plotH, barW, h)}
                      fill="var(--color-accent)"
                      opacity={hover === null || hover === i ? 1 : 0.45}
                      pointerEvents="none"
                    />
                  )}
                  {i % labelEvery === 0 && (
                    <text x={x + slot / 2} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--color-muted)">
                      {d.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {active && hover !== null && (
            <div
              className="pointer-events-none absolute top-0 rounded-lg border border-border bg-bg px-3 py-2 text-xs shadow-xl"
              style={{ left: `${Math.min(80, Math.max(0, ((padL + hover * slot) / width) * 100 - 5))}%` }}
            >
              <p className="text-muted">{active.label}</p>
              <p className="font-semibold tabular-nums">{active.display}</p>
              {active.extra && <p className="text-muted">{active.extra}</p>}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

/** Bar with 4px rounded top corners, square on the baseline. */
function barPath(x: number, baseline: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  const top = baseline - h;
  return `M${x},${baseline} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${baseline} Z`;
}
