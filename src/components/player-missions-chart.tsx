"use client";

/**
 * Cumulative career-missions chart (line, not bars).
 *  - cyan line: the real cumulative-missions curve, drawn from every measured
 *    knot (exact per-mission totals from the API's last-30 window AND archived
 *    per-cycle totals, merged onto one time axis). A flat segment between two
 *    knots just means no missions were recorded in that window — it is no less
 *    "real" whether the knots came from the live pull or the archive tracker,
 *    so they share one colour.
 *  - amber line: a highlight overlay on segments where more than 30 missions
 *    were logged between two consecutive knots (i.e. too fast to be the normal
 *    play rate, almost certainly a catch-up after a gap in coverage). Only the
 *    between-knot segments that exceed the threshold are drawn amber; the rest
 *    of the curve stays cyan. With ~6-hour update cycles this is rare, which is
 *    the point — it flags the few genuinely unusual intervals.
 *  - grey dashed line: piecewise-linear pre-archive estimate (toggleable).
 *
 * Y axis is auto-zoomed to the known range: a zero-based axis would render a
 * 7,700-mission career as a flat line, since the archive currently only
 * contains recent points. Absolute totals are on the axis labels.
 *
 * The pre-archive estimate (grey dashed) is shown by default but can be hidden
 * via the "Show estimated history" toggle — useful when only real measured data
 * is desired. When hidden, the pure-estimate knot points are dropped so the
 * X-axis only spans actual tracked data.
 */
import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Switch } from "@/components/ui/switch";
import type { MergedPoint } from "@/lib/player-stats";
import { fmtDay, fmtNum } from "@/lib/player-stats";

interface Props {
  data: MergedPoint[];
  yDomain: [number, number];
  height?: number;
}

/** A segment with > this many missions between its endpoints is flagged amber. */
const SPIKE_THRESHOLD = 30;

interface TooltipPayloadItem {
  dataKey?: string | number;
  value?: number | null;
  payload?: MergedPoint;
}

/** Axis date formatter: includes the year so spans across years stay readable. */
function fmtDayYear(t: number): string {
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Real cumulative value at a knot — exact (live pull) preferred, falling back to
 * archive (per-cycle total). Estimate knots return null so they never contribute
 * to the real line.
 */
function realValue(p: MergedPoint): number | null {
  if (p.exact != null) return p.exact;
  if (p.archive != null) return p.archive;
  return null;
}

interface ChartRow extends MergedPoint {
  /** cumulative total used by both the cyan and amber Lines. */
  total: number | null;
  /** true when the segment ENDING at this knot exceeded the spike threshold
   *  (i.e. this knot's total minus the previous real knot's total > threshold).
   *  Drives the amber highlight overlay. */
  spikeEnd?: boolean;
}

/**
 * Build the chart rows: keep every real knot (exact or archive) in order, drop
 * estimate-only knots, and tag each knot with whether the segment leading into
 * it was a spike (delta > SPIKE_THRESHOLD vs the previous real knot).
 */
function buildRows(data: MergedPoint[]): ChartRow[] {
  const rows: ChartRow[] = [];
  let prevTotal: number | null = null;
  for (const p of data) {
    const total = realValue(p);
    if (total == null) continue; // skip pure-estimate knots
    const spikeEnd = prevTotal != null ? total - prevTotal > SPIKE_THRESHOLD : false;
    rows.push({ ...p, total, spikeEnd });
    prevTotal = total;
  }
  return rows;
}

/**
 * Amber overlay data: a parallel array where `total` is set only on the spike
 * segments (the spike knot AND the knot just before it, so the segment between
 * them is drawn), and null elsewhere. With connectNulls=false this renders as
 * isolated amber segments exactly over the spike intervals, leaving the rest
 * of the curve purely cyan.
 */
function buildSpikeOverlay(rows: ChartRow[]): (ChartRow & { overlay: number | null })[] {
  return rows.map((r, i) => {
    const prev = rows[i - 1];
    const isSpikeSegment =
      r.spikeEnd || (prev?.spikeEnd ?? false);
    return { ...r, overlay: isSpikeSegment ? r.total : null };
  });
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as ChartRow | undefined;
  if (!point) return null;
  const when = new Date(point.t);
  const total = point.total ?? point.estimate ?? 0;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/95 px-3 py-2 text-xs text-zinc-100 shadow-xl">
      <div className="font-semibold text-cyan-300">
        {fmtDay(point.t)}, {("0" + when.getHours()).slice(-2)}:{("0" + when.getMinutes()).slice(-2)}
      </div>
      <div>
        career total <b>{fmtNum(total)}</b>
      </div>
      {point.mission ? (
        <div className="text-zinc-200">
          {point.mission.type} &middot; score {fmtNum(point.mission.score)} &middot; {point.mission.site}
        </div>
      ) : null}
      {point.spikeEnd ? (
        <div className="text-amber-300">spike segment &mdash; &gt; {SPIKE_THRESHOLD} missions since the last point</div>
      ) : null}
      {point.estimate != null && point.exact == null && point.archive == null ? (
        <div className="text-zinc-200">estimated (join date &mdash; no API history before archive)</div>
      ) : null}
    </div>
  );
}

export default function PlayerMissionsChart({ data, yDomain, height = 300 }: Props) {
  const [showEstimate, setShowEstimate] = useState(true);

  // When the estimate is hidden, drop the pure-estimate knot points so the
  // X-axis only spans actual tracked data — otherwise the real curve gets
  // cramped at the far right against the join date.
  const visibleData = showEstimate
    ? data
    : data.filter(p => p.exact != null || p.archive != null);

  // Chart rows: every real knot, tagged with spike-segment boundaries.
  const rows = buildRows(visibleData);
  const overlayRows = buildSpikeOverlay(rows);

  // X-axis domain: full span when the estimate is shown, otherwise from the
  // first real point to the last real point (no left padding so the axis starts
  // exactly where data collection began).
  const xDomain: [number, number] | ["dataMin", "dataMax"] = showEstimate
    ? ["dataMin", "dataMax"]
    : rows.length
      ? [rows[0].t, rows[rows.length - 1].t]
      : ["dataMin", "dataMax"];

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Switch
          id="show-estimate"
          checked={showEstimate}
          onCheckedChange={setShowEstimate}
          aria-label="Toggle estimated pre-archive history"
        />
        <label htmlFor="show-estimate" className="cursor-pointer text-xs text-zinc-100">
          Show estimated pre-archive history (dotted line)
        </label>
      </div>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <LineChart data={overlayRows} margin={{ top: 12, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid stroke="#273252" strokeDasharray="3 3" />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={xDomain}
              tickFormatter={fmtDayYear}
              stroke="#e2e8f0"
              tick={{ fontSize: 11, fill: "#e2e8f0" }}
              tickLine={false}
            />
            <YAxis
              domain={yDomain}
              stroke="#e2e8f0"
              tick={{ fontSize: 11, fill: "#e2e8f0" }}
              tickFormatter={fmtNum}
              tickLine={false}
              width={64}
            />
            <Tooltip content={<ChartTooltip />} />
            {/* Real cumulative curve: one continuous cyan line over every
                measured knot (live + archive merged). */}
            <Line
              type="linear"
              dataKey="total"
              stroke="#29e0ff"
              strokeWidth={2.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            {/* Amber highlight overlay: only the between-knot segments where the
                mission delta exceeded the spike threshold. Drawn slightly
                thicker so it reads as a highlight on top of the cyan line. */}
            <Line
              type="linear"
              dataKey="overlay"
              stroke="#ffb340"
              strokeWidth={4}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            {showEstimate ? (
              <Line
                type="linear"
                dataKey="estimate"
                stroke="#a1a1aa"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
} 
