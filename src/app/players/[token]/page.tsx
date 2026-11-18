import Link from "next/link";
import { notFound } from "next/navigation";
import PlayerMissionsChart from "@/components/player-missions-chart";
import PlayerActivityChart from "@/components/player-activity-charts";
import {
  avatarUrl,
  buildSeries,
  fmtDay,
  fmtNum,
  getCentreActivity,
  getGameTypeActivity,
  getPlayer,
  highestSkill,
  mergeSeries,
  withEstimate,
} from "@/lib/player-stats";

interface PageProps {
  params: Promise<{ token: string }>;
}

/** Per-player page: cumulative career-missions curve + career breakdowns. */
export default async function PlayerPage({ params }: PageProps) {
  const { token } = await params;
  const player = getPlayer(token);
  if (!player) notFound();

  const series = buildSeries(player);
  const merged = withEstimate(mergeSeries(series), player);
  const centreActivity = getCentreActivity(player);
  const gameTypeActivity = getGameTypeActivity(player);
  const skill = highestSkill(player.centres);
  const memberYears = player.joinDate
    ? Math.round(((Date.now() - Date.parse(player.joinDate + "T00:00:00Z")) / 31557600000) * 10) / 10
    : null;

  // archive deltas: missions gained between consecutive cycles
  const archiveDeltas = player.archivePoints
    .slice(1)
    .map((pt, i) => ({ ...pt, delta: pt.missions - player.archivePoints[i].missions }))
    .reverse();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/players" className="text-sm text-zinc-100 hover:text-cyan-300">
        &larr; All players
      </Link>

      {/* profile header */}
      <div className="mt-4 flex flex-col items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 sm:flex-row">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl(player.avatar)}
          alt=""
          className="h-20 w-20 rounded-xl bg-zinc-800 object-contain"
        />
        <div className="text-center sm:text-left">
          <h1 className="text-2xl font-bold text-zinc-100">{player.codename}</h1>
          <div className="mt-2 flex flex-wrap justify-center gap-2 text-xs sm:justify-start">
            <span className="rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-zinc-100">
              joined <b className="text-zinc-50">{player.joinDate ?? "?"}</b>
              {memberYears != null ? ` (${memberYears} yrs)` : ""}
            </span>
            <span className="rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-zinc-100">
              career missions <b className="text-zinc-50">{fmtNum(player.totalMissions)}</b>
            </span>
            <span className="rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-zinc-100">
              centres <b className="text-zinc-50">{player.centres.length}</b>
            </span>
            {skill ? (
              <span className="rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-zinc-100">
                top rank <b className="text-zinc-50">{skill.skillLevelName}</b> (lvl{" "}
                {skill.skillLevelNum + 1})
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* cumulative chart */}
      <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
        <h2 className="mb-1 text-lg font-semibold text-cyan-300">Career missions over time</h2>
        <p className="mb-4 text-xs text-zinc-100">
          Cumulative total. Cyan: exact totals from the API&apos;s last-30-missions window
          ({series.exact.length ? fmtDay(series.exact[0].t) + " → " + fmtDay(series.exact[series.exact.length - 1].t) : "n/a"}).
          Amber: archived totals, one point per update cycle — the curve extends every cycle
          ({player.archivePoints.length} point{player.archivePoints.length === 1 ? "" : "s"} so far).
          Grey dashed: a piecewise-linear estimate from the player&apos;s earliest centre-join date to
          the first real data point, built from per-centre anchors (join dates, per-game-type
          last-played dates, and per-segment mission counts). Each centre × game type ramps linearly
          over its active span, so the curve ramps up as centres come online and plateaus as they go
          dormant — far more shape-accurate than a single straight line. Endpoints and totals are
          real measured data; only the within-segment play rate is assumed uniform (the API exposes
          no per-mission history before the archive). Use the toggle to hide the estimate and show
          only actual tracked data.
        </p>
        <PlayerMissionsChart data={merged} yDomain={series.yDomain} />
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-100">
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-cyan-400" />exact (last-30 window)</span>
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" />archive (per cycle)</span>
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-zinc-400" />estimated (per-centre anchors &rarr; archive)</span>
        </div>
        {archiveDeltas.length > 0 ? (
          <div className="mt-4 text-sm text-zinc-100">
            Between cycles:{" "}
            {archiveDeltas.slice(0, 6).map((d, i) => (
              <span key={d.t} className="mr-3">
                <b className="text-amber-300">+{fmtNum(d.delta)}</b>{" "}
                <span className="text-zinc-200">({fmtDay(Date.parse(d.t))})</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-xs text-zinc-100">
            First archive point recorded — deltas between cycles appear here from the next cycle on.
          </p>
        )}
      </section>

      {/* career activity span — uses dated summary data */}
      <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
        <h2 className="mb-1 text-lg font-semibold text-cyan-300">Career activity by centre</h2>
        <p className="mb-4 text-xs text-zinc-100">
          Each bar spans a centre&apos;s first play → most recent play, derived from the
          per-game-type last-played timestamps the update workflow captures. The right edge shows
          how recently the player was last active there; the colour shows mission volume. Only
          centres with 10 or more missions are shown. This view spans the whole career from the
          first join date —
          {centreActivity.some(c => !c.lastPlayed)
            ? " some centres lack a last-played date until the next update-workflow run populates summary data."
            : " populated from summary data captured by the update workflow."}
        </p>
        <PlayerActivityChart centres={centreActivity} />
      </section>

      {/* career by game type */}
      <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
        <h2 className="mb-3 text-lg font-semibold text-cyan-300">Career missions by game type</h2>
        <div className="space-y-2">
          {gameTypeActivity.map(g => {
            const max = gameTypeActivity[0]?.missions || 1;
            const lastPlayed = g.lastPlayed
              ? new Date(g.lastPlayed.replace(" ", "T") + "Z").toLocaleDateString("en-US", { month: "short", year: "numeric" })
              : null;
            return (
              <div key={g.type} className="flex items-center gap-3 text-sm">
                <div className="w-44 shrink-0 truncate text-right text-zinc-100">{g.type}</div>
                <div className="h-4 flex-1 overflow-hidden rounded bg-zinc-800">
                  <div
                    className="h-full rounded bg-gradient-to-r from-cyan-500/40 to-cyan-400"
                    style={{ width: `${Math.max(2, (g.missions / max) * 100)}%` }}
                  />
                </div>
                <div className="w-16 text-right tabular-nums text-zinc-100">{fmtNum(g.missions)}</div>
                <div className="w-24 shrink-0 text-right text-xs text-zinc-100">{lastPlayed ?? "—"}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* centres */}
      <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
        <h2 className="mb-3 text-lg font-semibold text-cyan-300">Centres</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-zinc-100">
              <th className="py-2">Centre</th>
              <th className="py-2 text-right">Missions</th>
              <th className="py-2">Skill</th>
              <th className="py-2">Joined</th>
            </tr>
          </thead>
          <tbody>
            {player.centres.map(c => (
              <tr key={c.name + c.joined} className="border-t border-zinc-800/60">
                <td className="py-2 text-zinc-100">{c.name}</td>
                <td className="py-2 text-right tabular-nums text-zinc-100">{fmtNum(c.missions)}</td>
                <td className="py-2 text-zinc-100">{c.skillLevelName} ({c.skillLevelNum + 1})</td>
                <td className="py-2 text-zinc-100">{c.joined}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* recent missions */}
      <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
        <h2 className="mb-3 text-lg font-semibold text-cyan-300">
          Recent missions (API detail — last 30)
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-zinc-100">
              <th className="py-2">Date &amp; time</th>
              <th className="py-2">Site</th>
              <th className="py-2">Game type</th>
              <th className="py-2 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {[...player.recentMissions]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((m, i) => (
                <tr key={m.date + i} className="border-t border-zinc-800/60">
                  <td className="py-2 tabular-nums text-zinc-100">{m.date}</td>
                  <td className="py-2 text-zinc-100">{m.site}</td>
                  <td className="py-2 text-zinc-100">{m.type}</td>
                  <td className="py-2 text-right tabular-nums text-zinc-100">{fmtNum(m.score)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
    </main>
  );
} 
