"use client";

/**
 * Cumulative career-missions chart (line, not bars).
 *  - cyan line: exact per-mission totals from the API's last-30 window
 *  - amber line + dots: archived career totals, one point per update cycle
 * Y axis is auto-zoomed to the known range: a zero-based axis would render a
 * 7,700-mission career as a flat line, since the archive currently only
 * contains recent points. Absolute totals are on the axis labels.
 */
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MergedPoint } from "@/lib/player-stats";
import { fmtDay, fmtNum } from "@/lib/player-stats";

interface Props {
  data: MergedPoint[];
  yDomain: [number, number];
  height?: number;
}

interface TooltipPayloadItem {
  dataKey?: string | number;
  value?: number | null;
  payload?: MergedPoint;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const when = new Date(point.t);
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/95 px-3 py-2 text-xs text-zinc-200 shadow-xl">
      <div className="font-semibold text-cyan-300">
        {fmtDay(point.t)}, {("0" + when.getHours()).slice(-2)}:{("0" + when.getMinutes()).slice(-2)}
      </div>
      <div>
        career total <b>{fmtNum(point.exact ?? point.archive ?? 0)}</b>
      </div>
      {point.mission ? (
        <div className="text-zinc-400">
          {point.mission.type} &middot; score {fmtNum(point.mission.score)} &middot; {point.mission.site}
        </div>
      ) : null}
      {point.archive != null ? <div className="text-amber-300">archive point</div> : null}
    </div>
  );
}

export default function PlayerMissionsChart({ data, yDomain, height = 300 }: Props) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke="#273252" strokeDasharray="3 3" />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={fmtDay}
            stroke="#8b95b5"
            tick={{ fontSize: 11 }}
            tickLine={false}
          />
          <YAxis
            domain={yDomain}
            stroke="#8b95b5"
            tick={{ fontSize: 11 }}
            tickFormatter={fmtNum}
            tickLine={false}
            width={64}
          />
          <Tooltip content={<ChartTooltip />} />
          <Line
            type="linear"
            dataKey="exact"
            stroke="#29e0ff"
            strokeWidth={2.5}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="archive"
            stroke="#ffb340"
            strokeWidth={2}
            dot={{ r: 4 }}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
