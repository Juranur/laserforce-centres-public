import Link from "next/link";
import { notFound } from "next/navigation";
import PlayerMissionsChart from "@/components/player-missions-chart";
import {
  avatarUrl,
  buildSeries,
  fmtDay,
  fmtNum,
  getPlayer,
  highestSkill,
  mergeSeries,
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
  const merged = mergeSeries(series);
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
      <Link href="/players" className="text-sm text-zinc-400 hover:text-cyan-300">
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
            <span className="rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-zinc-400">
              joined <b className="text-zinc-200">{player.joinDate ?? "?"}</b>
              {memberYears != null ? ` (${memberYears} yrs)` : ""}
            </span>
            <span className="rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-zinc-400">
              career missions <b className="text-zinc-200">{fmtNum(player.totalMissions)}</b>
            </span>
            <span className="rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-zinc-400">
              centres <b className="text-zinc-200">{player.centres.length}</b>
            </span>
            {skill ? (
              <span className="rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-zinc-400">
                top rank <b className="text-zinc-200">{skill.skillLevelName}</b> (lvl{" "}
                {skill.skillLevelNum + 1})
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* cumulative chart */}
      <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
        <h2 className="mb-1 text-lg font-semibold text-cyan-300">Career missions over time</h2>
        <p className="mb-4 text-xs text-zinc-300">
          Cumulative total. Cyan: exact totals from the API&apos;s last-30-missions window
          ({series.exact.length ? fmtDay(series.exact[0].t) + " → " + fmtDay(series.exact[series.exact.length - 1].t) : "n/a"}).
          Amber: archived totals, one point per update cycle — the curve extends every cycle
          ({player.archivePoints.length} point{player.archivePoints.length === 1 ? "" : "s"} so far,
          older per-mission history is not exposed by the API).
        </p>
        <PlayerMissionsChart data={merged} yDomain={series.yDomain} />
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-300">
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-cyan-400" />exact (last-30 window)</span>
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" />archive (per cycle)</span>
        </div>
        {archiveDeltas.length > 0 ? (
          <div className="mt-4 text-sm text-zinc-400">
            Between cycles:{" "}
            {archiveDeltas.slice(0, 6).map((d, i) => (
              <span key={d.t} className="mr-3">
                <b className="text-amber-300">+{fmtNum(d.delta)}</b>{" "}
                <span className="text-zinc-500">({fmtDay(Date.parse(d.t))})</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-xs text-zinc-300">
            First archive point recorded — deltas between cycles appear here from the next cycle on.
          </p>
        )}
      </section>

      {/* career by game type */}
      <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
        <h2 className="mb-3 text-lg font-semibold text-cyan-300">Career missions by game type</h2>
        <div className="space-y-2">
          {player.gameTypes.map(g => {
            const max = player.gameTypes[0]?.missions || 1;
            return (
              <div key={g.type} className="flex items-center gap-3 text-sm">
                <div className="w-44 shrink-0 truncate text-right text-zinc-300">{g.type}</div>
                <div className="h-4 flex-1 overflow-hidden rounded bg-zinc-800">
                  <div
                    className="h-full rounded bg-gradient-to-r from-cyan-500/40 to-cyan-400"
                    style={{ width: `${Math.max(2, (g.missions / max) * 100)}%` }}
                  />
                </div>
                <div className="w-16 text-right tabular-nums text-zinc-400">{fmtNum(g.missions)}</div>
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
            <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-2">Centre</th>
              <th className="py-2 text-right">Missions</th>
              <th className="py-2">Skill</th>
              <th className="py-2">Joined</th>
            </tr>
          </thead>
          <tbody>
            {player.centres.map(c => (
              <tr key={c.name + c.joined} className="border-t border-zinc-800/60">
                <td className="py-2 text-zinc-200">{c.name}</td>
                <td className="py-2 text-right tabular-nums text-zinc-300">{fmtNum(c.missions)}</td>
                <td className="py-2 text-zinc-500">{c.skillLevelName} ({c.skillLevelNum + 1})</td>
                <td className="py-2 text-zinc-500">{c.joined}</td>
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
            <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
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
                  <td className="py-2 tabular-nums text-zinc-200">{m.date}</td>
                  <td className="py-2 text-zinc-500">{m.site}</td>
                  <td className="py-2 text-zinc-500">{m.type}</td>
                  <td className="py-2 text-right tabular-nums text-zinc-300">{fmtNum(m.score)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
