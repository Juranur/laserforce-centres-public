import Link from "next/link";
import {
  avatarUrl,
  fmtNum,
  getHistory,
  getTrackedPlayers,
} from "@/lib/player-stats";

export const metadata = {
  title: "Player Stats",
};

/** Index of tracked players (the ones the update cycle archives). */
export default function PlayersPage() {
  const history = getHistory();
  const players = getTrackedPlayers();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-1 text-2xl font-bold text-zinc-100">Player stats</h1>
      <p className="mb-8 text-sm text-zinc-400">
        {players.length} player(s) tracked &middot; archive cycle {history.cycle} &middot;
        updated {history.generated.slice(0, 16).replace("T", " ")} UTC &middot; each cycle
        adds one point to every player&apos;s cumulative career curve.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {players.map(p => (
          <Link
            key={p.token}
            href={`/players/${p.token}`}
            className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 transition-colors hover:border-cyan-500/60"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatarUrl(p.avatar)}
              alt=""
              className="h-14 w-14 rounded-lg bg-zinc-800 object-contain"
            />
            <div>
              <div className="font-semibold text-zinc-100">{p.codename}</div>
              <div className="text-sm text-zinc-400">
                {fmtNum(p.totalMissions)} career missions &middot;{" "}
                {p.centres.length} centre{p.centres.length === 1 ? "" : "s"}
              </div>
              <div className="text-xs text-zinc-500">
                joined {p.joinDate ?? "?"} &middot; {p.archivePoints.length} archive point(s)
              </div>
            </div>
          </Link>
        ))}
      </div>

      <p className="mt-8 text-xs text-zinc-500">
        Ranking source: globalScoring.php (top 100 by centres played). To track a player
        permanently, add their token to <code>data/player-watchlist.json</code>.
      </p>
    </main>
  );
}
