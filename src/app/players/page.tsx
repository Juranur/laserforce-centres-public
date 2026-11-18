import {
  fmtNum,
  getHistory,
  getTrackedPlayers,
} from "@/lib/player-stats";
import { PlayersList } from "@/components/player-search";

export const metadata = {
  title: "Player Stats",
};

/**
 * Index of tracked players (the ones the update cycle archives).
 *
 * The page itself is a server component: it reads the committed history JSON
 * (via getTrackedPlayers / getHistory) and hands the already-loaded
 * PlayerHistory[] straight to the client <PlayersList>, which owns the search
 * box state. The outer <main> carries a dark background so the existing
 * zinc-100 / zinc-300 text reads correctly — without it, those near-white
 * classes render against the light body theme and the stats line is barely
 * legible.
 */
export default function PlayersPage() {
  const history = getHistory();
  const players = getTrackedPlayers();

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="mb-1 text-2xl font-bold text-zinc-50">Player stats</h1>
        <p className="mb-8 text-sm font-medium text-zinc-300">
          {fmtNum(players.length)} player{players.length === 1 ? "" : "s"} tracked &middot; archive cycle {history.cycle} &middot;
          updated {history.generated.slice(0, 16).replace("T", " ")} UTC &middot; each cycle
          adds one point to every player&apos;s cumulative career curve.
        </p>

        <PlayersList players={players} />

        <p className="mt-8 text-xs text-zinc-400">
          Ranking source: globalScoring.php (top 100 by centres played). To track a player
          permanently, add their token to <code className="text-zinc-300">data/player-watchlist.json</code>.
        </p>
      </div>
    </main>
  );
} 
