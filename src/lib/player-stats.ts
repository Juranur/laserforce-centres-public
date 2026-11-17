/**
 * Player-stats data layer.
 *
 * Source of truth: data/player-stats-history.json — committed by
 * scripts/fetch-player-stats.mjs on every update cycle (see
 * .github/workflows/update-player-stats.yml). Importing it statically means
 * each Vercel deploy (triggered by the workflow push) serves fresh data.
 *
 * The cumulative curve per player has two series:
 *  - "archive": one {t, missions} point per update cycle — grows forever
 *  - "exact":   per-mission totals from the API's last-30-missions window;
 *               after the i-th mission (oldest-first) of the last N, the
 *               career total was exactly totalMissions - (N-1-i)
 */
import historyJson from "../../data/player-stats-history.json";

export interface LeaderboardRow {
  rank: number;
  centre: string;
  codename: string;
  centres: number; // number of centres joined — this is what global scoring ranks by
  avatar: string;
  token: string;
}

export interface CentreEntry {
  name: string;
  missions: number;
  skillLevelNum: number;
  skillLevelName: string;
  joined: string;
}

export interface GameTypeEntry {
  type: string;
  missions: number;
}

export interface ArchivePoint {
  t: string; // ISO timestamp of the update cycle
  missions: number;
}

export interface RecentMission {
  date: string; // "YYYY-MM-DD HH:MM:SS" (site-local time)
  site: string;
  type: string;
  score: number;
}

export interface PlayerHistory {
  token: string;
  codename: string;
  avatar: string;
  joinDate: string | null;
  totalMissions: number;
  centres: CentreEntry[];
  gameTypes: GameTypeEntry[];
  archivePoints: ArchivePoint[];
  recentMissions: RecentMission[];
  lastFetched: string | null;
}

export interface PlayerStatsHistory {
  version: number;
  generated: string;
  cycle: number;
  note: string;
  leaderboard: { queryType: number; rows: LeaderboardRow[] };
  players: Record<string, PlayerHistory>;
}

const history = historyJson as unknown as PlayerStatsHistory;

export function getHistory(): PlayerStatsHistory {
  return history;
}

export function getPlayer(token: string): PlayerHistory | undefined {
  return history.players[token];
}

export function getTrackedPlayers(): PlayerHistory[] {
  return Object.values(history.players).sort((a, b) => b.totalMissions - a.totalMissions);
}

/** "YYYY-MM-DD HH:MM:SS" (or ISO) -> epoch ms. Treated as UTC for charting. */
export function parseStamp(s: string): number {
  const iso = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  return Date.parse(iso);
}

export interface SeriesPoint {
  t: number;
  missions: number;
  mission?: RecentMission;
}

export interface BuiltSeries {
  exact: SeriesPoint[];
  archive: SeriesPoint[];
  yDomain: [number, number];
}

export function buildSeries(player: PlayerHistory): BuiltSeries {
  const T = player.totalMissions || 0;

  const exact: SeriesPoint[] = [...(player.recentMissions ?? [])]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m, i, arr) => ({
      t: parseStamp(m.date),
      missions: T - (arr.length - 1 - i),
      mission: m,
    }))
    .filter(p => Number.isFinite(p.t));

  const archive: SeriesPoint[] = (player.archivePoints ?? [])
    .map(a => ({ t: parseStamp(a.t), missions: a.missions }))
    .filter(p => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);

  const values = [...exact, ...archive].map(p => p.missions);
  let min = values.length ? Math.min(...values) : 0;
  let max = values.length ? Math.max(...values) : 1;
  if (min === max) { min -= 2; max += 2; }
  const pad = Math.max(2, (max - min) * 0.12);

  return { exact, archive, yDomain: [min - pad, max + pad] };
}

export interface MergedPoint {
  t: number;
  exact: number | null;
  archive: number | null;
  estimate: number | null; // dashed pre-archive estimate: 0 at earliest join date → first real point
  mission?: RecentMission;
}

/** Merge both series onto one time axis (nulls break nothing with connectNulls). */
export function mergeSeries(series: BuiltSeries): MergedPoint[] {
  const map = new Map<number, MergedPoint>();
  for (const p of series.exact) {
    map.set(p.t, { t: p.t, exact: p.missions, archive: null, estimate: null, mission: p.mission });
  }
  for (const p of series.archive) {
    const existing = map.get(p.t);
    if (existing) existing.archive = p.missions;
    else map.set(p.t, { t: p.t, exact: null, archive: p.missions, estimate: null });
  }
  return [...map.values()].sort((a, b) => a.t - b.t);
}

/**
 * Inject a dashed "estimated history" segment from the player's earliest
 * centre-join date (0 missions, by definition) to the first real data point.
 *
 * The Laserforce API exposes no per-mission history before the last-30 window
 * and no past career totals, so the period between "joined" and "first archive
 * point" is genuinely unknown. A straight line is the simplest honest visual:
 * it is clearly labelled as an estimate and never plotted as real data. The
 * segment is two points (join date, first real point) with `estimate` set;
 * every other point keeps `estimate: null`, and the chart renders the line
 * with connectNulls=false so it only spans that one segment.
 */
export function withEstimate(merged: MergedPoint[], player: PlayerHistory): MergedPoint[] {
  if (!merged.length) return merged;

  const joinTs = player.centres
    .map(c => Date.parse((c.joined ?? "") + "T00:00:00Z"))
    .filter(t => Number.isFinite(t));
  if (!joinTs.length) return merged;

  const joinT = Math.min(...joinTs);
  const first = merged[0];
  // only add an estimate when the join date actually predates the real data
  if (joinT >= first.t) return merged;

  const firstVal = first.exact ?? first.archive ?? 0;
  const tagged = merged.map((p, i) =>
    i === 0 ? { ...p, estimate: firstVal } : { ...p, estimate: null },
  );
  tagged.unshift({ t: joinT, exact: null, archive: null, estimate: 0 });
  return tagged;
}

export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function avatarUrl(avatar: string | number): string {
  return `https://v2.iplaylaserforce.com/images/avatars/${String(avatar || 0).padStart(3, "0")}.png`;
}

export function highestSkill(centres: CentreEntry[]): CentreEntry | null {
  return centres.reduce<CentreEntry | null>(
    (best, c) => (!best || c.skillLevelNum > best.skillLevelNum ? c : best),
    null,
  );
}

export function fmtDay(t: number): string {
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
} 
