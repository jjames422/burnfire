"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Text, useTranslation } from "@/components/i18n/LanguageProvider";
import { compact, dateTime, day, ticks } from "@/lib/intel/format";

export interface ChartSeries {
  id: string;
  label: string;
  color: string;
  points: { t: number; v: number | null }[];
}

const PAD = { top: 14, right: 18, bottom: 26, left: 52 };

/**
 * One-axis line chart. Gaps longer than `gapMs` break the line instead of
 * bridging missing history. Hover or touch shows a crosshair with values;
 * a data table is always available below the plot.
 */
export function LineChart({ series, height = 240, gapMs = 36 * 3_600_000, label, valueFormat, area = false, endLabels = true, start, step = false, integer = false }: {
  series: ChartSeries[];
  height?: number;
  gapMs?: number;
  label: string;
  valueFormat?: (value: number) => string;
  area?: boolean;
  endLabels?: boolean;
  start?: number;
  /** Draw as a step line (values that change in discrete jumps, such as levels). */
  step?: boolean;
  integer?: boolean;
}) {
  const { t, locale } = useTranslation();
  const format = valueFormat ?? ((value: number) => compact(value, locale));
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [hover, setHover] = useState<number | null>(null);
  const clip = useId().replace(/:/g, "");

  const hasPoints = series.some((item) => item.points.some((point) => point.v !== null));
  // Re-attach when the plot first appears (the empty state renders no plot element).
  useEffect(() => {
    const element = wrap.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasPoints]);

  const visible = useMemo(() => series.map((item) => ({
    ...item, points: item.points.filter((point) => point.v !== null && (start === undefined || point.t >= start)).sort((a, b) => a.t - b.t) as { t: number; v: number }[],
  })), [series, start]);
  const all = visible.flatMap((item) => item.points);
  const times = [...new Set(all.map((point) => point.t))].sort((a, b) => a - b);

  if (!all.length) {
    return <div className="intel-chart-empty" role="status"><Text>{"No history recorded for this period yet."}</Text></div>;
  }

  const minT = start ?? Math.min(...all.map((point) => point.t));
  const maxT = Math.max(...all.map((point) => point.t));
  const values = all.map((point) => point.v);
  const yTicks = ticks(Math.min(...values), Math.max(...values), height < 200 ? 3 : 4, integer);
  const minV = yTicks[0];
  const maxV = yTicks[yTicks.length - 1];
  const plotW = width - PAD.left - PAD.right - (endLabels && series.length > 1 ? 54 : 0);
  const plotH = height - PAD.top - PAD.bottom;
  const x = (time: number) => PAD.left + (maxT === minT ? plotW / 2 : ((time - minT) / (maxT - minT)) * plotW);
  const y = (value: number) => PAD.top + plotH - ((value - minV) / (maxV - minV || 1)) * plotH;

  const segments = (points: { t: number; v: number }[]) => {
    const runs: { t: number; v: number }[][] = [];
    for (const point of points) {
      const run = runs[runs.length - 1];
      if (run && point.t - run[run.length - 1].t <= gapMs) run.push(point);
      else runs.push([point]);
    }
    return runs;
  };
  const path = (run: { t: number; v: number }[]) => run.map((point, index) => index === 0
    ? `M${x(point.t).toFixed(1)},${y(point.v).toFixed(1)}`
    : step ? `H${x(point.t).toFixed(1)}V${y(point.v).toFixed(1)}` : `L${x(point.t).toFixed(1)},${y(point.v).toFixed(1)}`).join("");
  const xTickCount = Math.max(2, Math.min(6, Math.floor(plotW / 110)));
  const xTicks = Array.from({ length: xTickCount }, (_, index) => minT + ((maxT - minT) * index) / (xTickCount - 1));

  const hoverTime = hover === null ? null : times.reduce((best, time) => (Math.abs(time - hover) < Math.abs(best - hover) ? time : best), times[0]);
  const hoverRows = hoverTime === null ? [] : visible.map((item) => {
    const point = item.points.reduce<{ t: number; v: number } | null>((best, candidate) =>
      (!best || Math.abs(candidate.t - hoverTime) < Math.abs(best.t - hoverTime) ? candidate : best), null);
    return point && Math.abs(point.t - hoverTime) <= gapMs / 2 ? { item, point } : null;
  }).filter((row): row is { item: (typeof visible)[number]; point: { t: number; v: number } } => row !== null);

  const move = (clientX: number) => {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return;
    const ratio = Math.min(1, Math.max(0, (clientX - box.left - PAD.left) / plotW));
    setHover(minT + ratio * (maxT - minT));
  };
  const tableRows = times.filter((_, index) => times.length <= 40 || index % Math.ceil(times.length / 40) === 0 || index === times.length - 1);

  return (
    <figure className="intel-chart">
      <div ref={wrap} className="intel-chart-plot" onPointerMove={(event) => move(event.clientX)} onPointerDown={(event) => move(event.clientX)} onPointerLeave={() => setHover(null)}>
        <svg width={width} height={height} role="img" aria-label={label}>
          <defs><clipPath id={clip}><rect x={PAD.left} y={PAD.top - 4} width={plotW + 8} height={plotH + 8} /></clipPath></defs>
          {yTicks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={PAD.left + plotW} y1={y(tick)} y2={y(tick)} className="intel-grid" />
              <text x={PAD.left - 8} y={y(tick)} className="intel-axis" textAnchor="end" dominantBaseline="middle">{format(tick)}</text>
            </g>
          ))}
          {xTicks.map((tick, index) => (
            <text key={index} x={x(tick)} y={height - 6} className="intel-axis" textAnchor={index === 0 ? "start" : index === xTicks.length - 1 ? "end" : "middle"}>{day(tick, locale)}</text>
          ))}
          <g clipPath={`url(#${clip})`}>
            {visible.map((item) => segments(item.points).map((run, index) => (
              <g key={`${item.id}-${index}`}>
                {area && visible.length === 1 && run.length > 1 && (
                  <path d={`${path(run)}L${x(run[run.length - 1].t)},${PAD.top + plotH}L${x(run[0].t)},${PAD.top + plotH}Z`} fill={item.color} opacity={0.1} />
                )}
                {run.length > 1 ? <path d={path(run)} fill="none" stroke={item.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  : <circle cx={x(run[0].t)} cy={y(run[0].v)} r={3} fill={item.color} />}
              </g>
            )))}
          </g>
          {endLabels && visible.map((item) => {
            const last = item.points[item.points.length - 1];
            if (!last) return null;
            return (
              <g key={item.id}>
                <circle cx={x(last.t)} cy={y(last.v)} r={4} fill={item.color} stroke="var(--intel-chart-surface)" strokeWidth={2} />
                {visible.length > 1 && <text x={x(last.t) + 9} y={y(last.v)} className="intel-end-label" dominantBaseline="middle">{item.label}</text>}
              </g>
            );
          })}
          {hoverTime !== null && (
            <g>
              <line x1={x(hoverTime)} x2={x(hoverTime)} y1={PAD.top} y2={PAD.top + plotH} className="intel-crosshair" />
              {hoverRows.map(({ item, point }) => <circle key={item.id} cx={x(point.t)} cy={y(point.v)} r={4.5} fill={item.color} stroke="var(--intel-chart-surface)" strokeWidth={2} />)}
            </g>
          )}
        </svg>
        {hoverTime !== null && hoverRows.length > 0 && (
          <div className="intel-tooltip" style={{ insetInlineStart: Math.min(width - 190, Math.max(0, x(hoverTime) + 12)) }} role="status">
            <strong>{dateTime(hoverRows[0].point.t, locale)}</strong>
            {hoverRows.map(({ item, point }) => (
              <span key={item.id}><i style={{ background: item.color }} />{visible.length > 1 ? item.label : t("Value")}<b>{format(point.v)}</b></span>
            ))}
          </div>
        )}
      </div>
      {visible.length > 1 && (
        <figcaption className="intel-legend">
          {visible.map((item) => <span key={item.id}><i style={{ background: item.color }} />{item.label}</span>)}
        </figcaption>
      )}
      <details className="intel-table-view">
        <summary><Text>{"Data table"}</Text></summary>
        <div className="intel-scroll">
          <table>
            <thead><tr><th scope="col"><Text>{"Observed (UTC)"}</Text></th>{visible.map((item) => <th scope="col" key={item.id}>{item.label}</th>)}</tr></thead>
            <tbody>{tableRows.map((time) => (
              <tr key={time}><td>{dateTime(time, locale)}</td>{visible.map((item) => {
                const point = item.points.find((candidate) => candidate.t === time);
                return <td key={item.id}>{point ? format(point.v) : "—"}</td>;
              })}</tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
