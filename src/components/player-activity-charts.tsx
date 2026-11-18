"use client";

/**
 * Career-activity span chart (horizontal Gantt-style).
 *
 * One row per top centre (by missions). Each row's visible bar runs from the
 * centre's `joined` date to its most-recent play date (derived from the
 * per-game-type `summary`), so:
 *   - the LEFT edge  = when the player started at that centre
 *   - the RIGHT edge = how recently they were last active there
 *   - the bar colour = mission volume at that centre (dim zinc → bright cyan)
 *
 * This is the only view that uses the dated `summary` data the fetcher started
 * capturing — it spans the player's whole career on day one, unlike the
 * cumulative archive curve which only grows one point per cycle. Built with a
 * stacked-bar Gantt trick: [pre (transparent)] + [active (coloured)] +
 * [post (transparent)], so the visible segment floats between two dates on a
 * real calendar-time x-axis.
 *
 * Only centres with 10 or more missions are shown, to keep the chart focused
 * on centres the player has actually invested in.
 */
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CentreActivity } from "@/lib/player-stats";
import { fmtNum } from "@/lib/player-stats";

interface Props {
  centres: CentreActivity[];
}

interface SpanRow extends CentreActivity {
  pre: number;   // ms from career start → joined (invisible)
  active: number; // ms from joined → lastPlayed (visible)
  post: number;  // ms from lastPlayed → career end (invisible)
}

function fmtYear(t: number): string {
  return String(new Date(t).getFullYear());
}

function fmtMonthYear(t: number): string {
  return new Date(t).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** Mission-volume heat: dim zinc (low) → bright cyan (high). */
function heatColor(missions: number, max: number): string {
  const t = Math.max(0, Math.min(1, max > 0 ? missions / max : 0));
  const hue = 240 - t * 50;    // 240 (blue-zinc) → 190 (cyan)
  const sat = 5 + t * 90;      // 5% → 95%
  const light = 38 + t * 22;   // 38% → 60%
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

interface TooltipPayloadItem {
  payload?: SpanRow;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/95 px-3 py-2 text-xs text-zinc-100 shadow-xl">
      <div className="font-semibold text-zinc-50">{row.name}</div>
      <div>
        missions <b className="text-cyan-300">{fmtNum(row.missions)}</b>
        {row.gameTypeCount > 0 ? ` · ${row.gameTypeCount} game type${row.gameTypeCount === 1 ? "" : "s"}` : ""}
      </div>
      <div className="text-zinc-200">
        joined <b className="text-zinc-50">{row.joined}</b>
      </div>
      <div className="text-zinc-200">
        last played <b className="text-zinc-50">{row.lastPlayed ?? "—"}</b>
        {row.lastPlayed ? "" : " (no summary yet — run update workflow)"}
      </div>
    </div>
  );
}

export default function PlayerActivityChart({ centres }: Props) {
  // Only keep centres with 10 or more missions — the chart is about where the
  // player has actually invested their time, not single-visit drop-ins.
  const filtered = centres.filter(c => c.missions >= 10);

  if (!filtered.length) {
    return (
      <p className="text-xs text-zinc-200">
        No centre activity to show (no centres with 10 or more missions).
      </p>
    );
  }

  const careerStart = Math.min(...filtered.map(c => c.joinedT).filter(Number.isFinite));
  const now = Date.now();
  const lastActive = Math.max(...filtered.map(c => c.lastPlayedT ?? c.joinedT).filter(Number.isFinite));
  const careerEnd = Math.max(now, lastActive);
  const spanMs = Math.max(1, careerEnd - careerStart);
  const maxMissions = Math.max(...filtered.map(c => c.missions));

  // top centre first (most missions) appears at the TOP of the chart — recharts
  // renders category rows bottom-up, so reverse to put the leader on top
  const rows: SpanRow[] = [...filtered].reverse().map(c => {
    const end = c.lastPlayedT ?? careerEnd;
    const pre = Math.max(0, c.joinedT - careerStart);
    const active = Math.max(0, end - c.joinedT);
    const post = Math.max(0, careerEnd - end);
    return { ...c, pre, active, post };
  });

  const height = Math.max(220, rows.length * 28 + 40);
  const ticks: number[] = [];
  // one tick per year across the span
  const startYear = new Date(careerStart).getFullYear();
  const endYear = new Date(careerEnd).getFullYear();
  for (let y = startYear; y <= endYear; y++) {
    const t = Date.parse(`${y}-01-01T00:00:00Z`);
    if (Number.isFinite(t) && t >= careerStart && t <= careerEnd) ticks.push(t - careerStart);
  }

  // Width grows with the longest centre name so full names are never truncated.
  const longestName = Math.max(...filtered.map(c => c.name.length), 0);
  const labelWidth = Math.max(180, Math.min(360, longestName * 7 + 16));

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart layout="vertical" data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
          <XAxis
            type="number"
            domain={[0, spanMs]}
            ticks={ticks}
            tickFormatter={(v: number) => fmtYear(careerStart + v)}
            stroke="#e2e8f0"
            tick={{ fontSize: 11, fill: "#e2e8f0" }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={labelWidth}
            stroke="#e2e8f0"
            tick={{ fontSize: 11, fill: "#e2e8f0" }}
            tickLine={false}
            interval={0}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "#ffffff08" }} />
          <Bar dataKey="pre" stackId="span" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="active" stackId="span" radius={[2, 2, 2, 2]} isAnimationActive={false}>
            {rows.map((r, i) => (
              <Cell key={i} fill={heatColor(r.missions, maxMissions)} />
            ))}
          </Bar>
          <Bar dataKey="post" stackId="span" fill="transparent" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs text-zinc-100">
        Each bar spans a centre&apos;s first play → most recent play.
        Bar colour = mission volume (dim = few, bright cyan = many).
        Only centres with 10 or more missions are shown.
        {filtered.some(c => !c.lastPlayed) ? " Some centres lack a last-played date (update workflow not yet run with summary capture)." : ""}
      </p>
    </div>
  );
}

export { fmtMonthYear }; 
