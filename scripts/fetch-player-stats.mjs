/**
 * Player-stats updater for the regular data cycle.
 *
 * Mirrors scripts/fetch-all-centres.mjs conventions (ESM, conservative delays,
 * max runtime cap). Appends one archive point per player per run to
 * data/player-stats-history.json — the cumulative career-missions curve is
 * built from these points over time. The API exposes no per-mission history
 * beyond the last 30 missions, so the archive IS the long-term dataset.
 *
 * Env knobs:
 *   LF_TOP_GAMES     top N players globally by games played      (default 50)
 *   LF_TOP_ARENAS    top N players globally by centres/arenas    (default 50)
 *   LF_TOP_KIEL      top N Laserzone Kiel players by games       (default 50)
 *   LF_KIEL_CENTRE_ID  centre id for the Kiel slice              (default 212)
 *   LF_BASE_DELAY    ms between API calls                        (default 7000)
 *
 * API (all POST, form-encoded; no auth):
 *   https://v2.iplaylaserforce.com/globalScoring.php    -> leaderboard (top100)
 *   https://v2.iplaylaserforce.com/memberDetails.php    -> player career (per centre)
 *   https://v2.iplaylaserforce.com/recentMissions.php   -> player's last 30 missions
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_PATH = path.join(__dirname, '..', 'data', 'player-stats-history.json');
const WATCHLIST_PATH = path.join(__dirname, '..', 'data', 'player-watchlist.json');

const API_BASE = 'https://v2.iplaylaserforce.com/';
const BASE_DELAY = parseInt(process.env.LF_BASE_DELAY || '7000', 10);
const RATE_LIMIT_PAUSE = 60000;
// 80 min: the checkpoint writes every 5 players (in the loop below) mean a
// workflow timeout kill or crash can no longer lose the whole cycle — at most 5
// players of progress. So the cap can safely exceed the old 50-min ceiling that
// was forced by the write-only-at-end design. At the observed ~14s/call
// effective pace (7000ms delay + ~8% throttle retries), 136 players need ~65
// min; 80 min gives ~15 min retry headroom. REQUIRES the workflow's
// timeout-minutes to be raised to >=100 (see update-player-stats.yml).
const MAX_RUNTIME_MS = 80 * 60 * 1000;
const START_TIME = Date.now();
// re-running within this window updates the existing point instead of appending
const REPLACE_WINDOW_MS = 60 * 60 * 1000;
// Three leaderboard slices to track (heavily overlapping, so the tracked total
// is well under TOP_GAMES + TOP_ARENAS + TOP_KIEL):
//   games  — global, ranked by games/missions played    (queryType 0, centreId 0)
//   arenas — global, ranked by centres/arenas played     (queryType 1, centreId 0)
//   kiel   — Laserzone Kiel home players by games played (queryType 0, centreId 212)
//            (the API honours the centreId filter ONLY with queryType 0)
const TOP_GAMES  = parseInt(process.env.LF_TOP_GAMES  || '50', 10);
const TOP_ARENAS = parseInt(process.env.LF_TOP_ARENAS || '50', 10);
const TOP_KIEL   = parseInt(process.env.LF_TOP_KIEL   || '50', 10);
const KIEL_CENTRE_ID = parseInt(process.env.LF_KIEL_CENTRE_ID || '212', 10);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// Atomic write: serialize to a temp file then rename. A plain writeFileSync
// truncates the target first, so a process killed mid-write (workflow timeout,
// OOM, runner eviction) leaves a corrupt half-file that crashes the NEXT run's
// JSON.parse. temp+rename (same filesystem) is atomic on POSIX — the history
// file is always either the previous complete version or the new one, never
// partial. Used for both the per-5-player checkpoints and the final save.
function saveHistory(data) {
  const tmp = DATA_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_PATH);
}

function shouldStop() {
  if (Date.now() - START_TIME > MAX_RUNTIME_MS) {
    log('⏱️ Max runtime reached');
    return true;
  }
  return false;
}

async function apiPost(endpoint, params, attempt = 1) {
  const body = new URLSearchParams(params).toString();
  const response = await fetch(API_BASE + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    throw new Error(`${endpoint} HTTP ${response.status}`);
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${endpoint} returned non-JSON: ${text.slice(0, 120)}`);
  }
}

function baseParams(token = '') {
  return {
    requestId: '1',
    regionId: '9999',
    siteId: '9999',
    memberRegion: '0',
    memberSite: '0',
    memberId: '0',
    token,
  };
}

async function withRetry(fn, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn();
    } catch (e) {
      log(`  ⚠️ ${label} failed (${e.message}), attempt ${attempt}/3`);
      if (attempt === 3) throw e;
      await sleep(RATE_LIMIT_PAUSE * attempt);
    }
  }
}

// Fetch one leaderboard slice from globalScoring.php.
//   queryType: 0 = games/missions played, 1 = centres/arenas played.
//   centreId:  0 = global ranking; a specific id filters to that centre's home
//              players. NOTE: the API honours the centre filter ONLY with
//              queryType 0 — with queryType 1 it ignores centreId and returns
//              the global centres ranking. So the Kiel slice uses queryType 0.
async function fetchLeaderboard(queryType, centreId = 0) {
  const params = baseParams();
  params.selectedQueryType = String(queryType);
  params.selectedCentreId = String(centreId);
  params.selectedGroupId = '0';
  const data = await apiPost('globalScoring.php', params);
  return (data.top100 || []).map(r => ({
    rank: r['0'],
    centre: r['1'],
    codename: r['2'],
    metric: r['3'], // games played (qt=0) or centres/arenas played (qt=1)
    avatar: String(r['5']),
    token: (r.DT_RowId || '').replace('token_', ''),
  }));
}

async function fetchPlayerProfile(token) {
  const data = await apiPost('memberDetails.php', baseParams(token));
  const centres = (data.centre || []).map(c => ({
    name: c.name,
    missions: c.missions,
    skillLevelNum: c.skillLevelNum,
    skillLevelName: c.skillLevelName,
    joined: c.joined,
    // per-game-type breakdown with last-played timestamps — the only dated
    // activity signal the API exposes besides the last-30 window. Captured
    // here so the career-span / recency charts have real historical anchors
    // (one lastPlayed date per centre × game type, going back to the join year).
    summary: (c.summary || []).map(s => ({
      type: s[0],
      missions: s[1],
      lastPlayed: s[2] ?? null,
    })),
  }));
  const gameTypes = {};
  (data.centre || []).forEach(c => {
    (c.summary || []).forEach(s => {
      gameTypes[s[0]] = (gameTypes[s[0]] || 0) + s[1];
    });
  });
  const joinDates = (data.centre || []).map(c => c.joined).filter(Boolean).sort();
  return {
    codename: (data.centre || [])[0]?.codename || '?',
    avatar: String((data.centre || [])[0]?.avatar || '0'),
    joinDate: joinDates[0] || null,
    totalMissions: centres.reduce((sum, c) => sum + c.missions, 0),
    centres: centres.sort((a, b) => b.missions - a.missions),
    gameTypes: Object.entries(gameTypes)
      .map(([type, missions]) => ({ type, missions }))
      .sort((a, b) => b.missions - a.missions),
  };
}

async function fetchRecentMissions(token) {
  const data = await apiPost('recentMissions.php', baseParams(token));
  return (data.mission || []).map(m => ({
    date: m[0], site: m[1], type: m[2], score: m[3],
  }));
}

function recordArchivePoint(player, totalMissions, nowIso) {
  const points = player.archivePoints || (player.archivePoints = []);
  const last = points[points.length - 1];
  if (last && Date.now() - new Date(last.t).getTime() < REPLACE_WINDOW_MS) {
    // same cycle re-run: update in place, do not pile up points
    last.missions = totalMissions;
  } else {
    points.push({ t: nowIso, missions: totalMissions });
  }
  // keep the file lean: cap per-player archive at 2000 points (~5 years of 6h cycles)
  if (points.length > 2000) player.archivePoints = points.slice(-2000);
}

async function main() {
  log('=== Player stats update start ===');

  // load history db (or start one)
  let history;
  if (fs.existsSync(DATA_PATH)) {
    try {
      history = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
      log(`Loaded history: cycle ${history.cycle}, ${Object.keys(history.players).length} players tracked`);
    } catch (e) {
      // A corrupt history file would crash here with a cryptic JSON error.
      // Back the bad file up so it can be inspected/recovered, then fail loudly
      // — do NOT silently start fresh (that would wipe all archived data).
      const bak = DATA_PATH + '.corrupt-' + Date.now();
      try { fs.renameSync(DATA_PATH, bak); } catch {}
      throw new Error(`History file corrupt (${e.message}); backed up to ${path.basename(bak)}. Restore from git before next run.`);
    }
  } else {
    history = {
      version: 1,
      generated: null,
      cycle: 0,
      note: 'archivePoints: one career-total point per update cycle. recentMissions: the API\'s exact last-30 window.',
      leaderboards: {
        games:  { queryType: 0, centreId: 0,              rows: [] },
        arenas: { queryType: 1, centreId: 0,              rows: [] },
        kiel:   { queryType: 0, centreId: KIEL_CENTRE_ID, rows: [] },
      },
      players: {},
    };
    log('No history file — starting a new one');
  }

  // optional watchlist: manually pinned tokens
  let watchlist = [];
  if (fs.existsSync(WATCHLIST_PATH)) {
    try {
      watchlist = (JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf8')).tokens || [])
        .filter(t => typeof t === 'string' && t);
      log(`Watchlist: ${watchlist.length} token(s)`);
    } catch (e) {
      log(`⚠️ Could not parse watchlist: ${e.message}`);
    }
  }

  // 1. refresh the three leaderboard slices we track. Each is a separate API
  //    call; the centreId filter only affects the Kiel slice (and only works
  //    with queryType 0). On failure a slice keeps its previous rows.
  const slices = [
    { key: 'games',  qt: 0, centreId: 0,              limit: TOP_GAMES,  label: `top ${TOP_GAMES} games (global)` },
    { key: 'arenas', qt: 1, centreId: 0,              limit: TOP_ARENAS, label: `top ${TOP_ARENAS} arenas (global)` },
    { key: 'kiel',   qt: 0, centreId: KIEL_CENTRE_ID, limit: TOP_KIEL,   label: `top ${TOP_KIEL} games (Laserzone Kiel #${KIEL_CENTRE_ID})` },
  ];
  const fresh = {};
  for (const s of slices) {
    let rows = [];
    try {
      rows = await withRetry(() => fetchLeaderboard(s.qt, s.centreId), `leaderboard ${s.label}`);
      log(`Leaderboard ${s.label}: ${rows.length} rows`);
    } catch (e) {
      const prev = history.leaderboards && history.leaderboards[s.key];
      rows = (prev && prev.rows) || [];
      log(`⚠️ Leaderboard ${s.label} failed, keeping ${rows.length} previous rows: ${e.message}`);
    }
    fresh[s.key] = { queryType: s.qt, centreId: s.centreId, rows };
    await sleep(BASE_DELAY);
  }
  history.leaderboards = fresh;

  // 2. decide which tokens to track: existing + watchlist + top N from each slice
  const seen = new Set(Object.keys(history.players));
  const tokens = new Set(seen);
  watchlist.forEach(t => tokens.add(t));
  for (const s of slices) {
    for (const r of fresh[s.key].rows.slice(0, s.limit)) {
      if (r.token) tokens.add(r.token);
    }
  }
  // Iterate UNSEEN tokens first (new leaderboard members with no archive yet),
  // then existing players. If the runtime cap bites, this guarantees newly-added
  // players get their initial fetch+archive before we spend time re-refreshing
  // players we already have — otherwise tail-of-list cohorts (the Kiel slice is
  // last) can be skipped cycle after cycle and never get archived. Existing
  // players skipped by a cap just keep their previous data (graceful).
  const unseenFirst = [
    ...[...tokens].filter(t => !seen.has(t)),
    ...[...tokens].filter(t => seen.has(t)),
  ];
  const newCount = unseenFirst.length - seen.size;
  log(`Tracking ${tokens.size} player(s) — ${newCount} new (fetched first), ${seen.size} existing — games top ${TOP_GAMES} ∪ arenas top ${TOP_ARENAS} ∪ Kiel top ${TOP_KIEL} (after overlap)`);

  // 3. per-player update: profile + recent missions + archive point
  let updated = 0, failed = 0;
  const nowIso = new Date().toISOString();
  for (const token of unseenFirst) {
    if (shouldStop()) { log('⏱️ Stopping early — remaining players keep their previous data'); break; }
    const existing = history.players[token];
    log(`Fetching ${token}${existing ? ` (${existing.codename})` : ''} ...`);
    try {
      const profile = await withRetry(() => fetchPlayerProfile(token), `profile ${token}`);
      await sleep(BASE_DELAY);
      const recent = await withRetry(() => fetchRecentMissions(token), `missions ${token}`);

      const player = history.players[token] || {
        token,
        archivePoints: [],
        recentMissions: [],
        lastFetched: null,
      };
      // Always stamp the token, even on pre-existing entries: history files
      // written by older script versions have no `token` property on the player
      // object, which made the /players list link to /players/undefined (404).
      // Re-stamping each cycle repairs those entries in place.
      player.token = token;
      player.codename = profile.codename;
      player.avatar = profile.avatar;
      player.joinDate = profile.joinDate;
      player.totalMissions = profile.totalMissions;
      player.centres = profile.centres;
      player.gameTypes = profile.gameTypes;
      player.recentMissions = recent;
      player.lastFetched = nowIso;
      recordArchivePoint(player, profile.totalMissions, nowIso);
      history.players[token] = player;
      updated++;
      log(`  ${profile.codename}: total ${profile.totalMissions}, archive points ${player.archivePoints.length}`);
      // checkpoint: persist every 5 players so a workflow timeout kill or crash
      // can't lose the whole cycle (at most 5 players of progress). The final
      // write after the loop still happens; this just bounds data loss.
      if (updated % 5 === 0) {
        try { saveHistory(history); }
        catch (e) { log(`  ⚠️ checkpoint write failed: ${e.message}`); }
      }
      await sleep(BASE_DELAY);
    } catch (e) {
      failed++;
      log(`  ❌ ${token} skipped: ${e.message}`);
      await sleep(BASE_DELAY);
    }
  }

  // 4. save
  history.cycle = (history.cycle || 0) + 1;
  history.generated = nowIso;
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  try { saveHistory(history); }
  catch (e) { log(`❌ Final save failed: ${e.message}`); throw e; }
  log(`Saved cycle ${history.cycle}: ${updated} updated, ${failed} failed, ` +
      `${Object.keys(history.players).length} tracked -> ${DATA_PATH}`);
  log('=== Player stats update done ===');
}

main().catch(e => {
  // Full stack trace, not just the message — a bare "Unexpected token" or
  // "fetch failed" tells us nothing about WHERE. The stack names the file+line.
  log(`❌ Fatal: ${e.stack || e.message}`);
  process.exit(1);
}); 
