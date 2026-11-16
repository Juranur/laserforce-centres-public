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
 *   LF_TRACK_TOP_N   how many top leaderboard players to track (default 8)
 *   LF_BASE_DELAY    ms between API calls (default 4000)
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
const BASE_DELAY = parseInt(process.env.LF_BASE_DELAY || '4000', 10);
const RATE_LIMIT_PAUSE = 60000;
const MAX_RUNTIME_MS = 50 * 60 * 1000;
const START_TIME = Date.now();
// re-running within this window updates the existing point instead of appending
const REPLACE_WINDOW_MS = 60 * 60 * 1000;
// leaderboard ranks by centres played (query type 1); track the top N
const TRACK_TOP_N = parseInt(process.env.LF_TRACK_TOP_N || '8', 10);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
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

async function fetchLeaderboard() {
  const params = baseParams();
  params.selectedQueryType = '1';
  params.selectedCentreId = '0';
  params.selectedGroupId = '0';
  const data = await apiPost('globalScoring.php', params);
  return (data.top100 || []).map(r => ({
    rank: r['0'],
    centre: r['1'],
    codename: r['2'],
    centres: r['3'], // number of centres joined — this is what the ranking is by
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
    history = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    log(`Loaded history: cycle ${history.cycle}, ${Object.keys(history.players).length} players tracked`);
  } else {
    history = {
      version: 1,
      generated: null,
      cycle: 0,
      note: 'archivePoints: one career-total point per update cycle. recentMissions: the API\'s exact last-30 window.',
      leaderboard: { queryType: 1, rows: [] },
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

  // 1. leaderboard refresh
  let rows = [];
  try {
    rows = await withRetry(fetchLeaderboard, 'leaderboard');
    history.leaderboard = { queryType: 1, rows };
    log(`Leaderboard: ${rows.length} rows`);
  } catch (e) {
    log(`⚠️ Leaderboard failed, keeping previous rows: ${e.message}`);
    rows = (history.leaderboard && history.leaderboard.rows) || [];
  }
  await sleep(BASE_DELAY);

  // 2. decide which tokens to track: existing + watchlist + top N
  const tokens = new Set(Object.keys(history.players));
  watchlist.forEach(t => tokens.add(t));
  for (const r of rows.slice(0, TRACK_TOP_N)) {
    if (r.token) tokens.add(r.token);
  }
  log(`Tracking ${tokens.size} player(s)`);

  // 3. per-player update: profile + recent missions + archive point
  let updated = 0, failed = 0;
  const nowIso = new Date().toISOString();
  for (const token of tokens) {
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
  fs.writeFileSync(DATA_PATH, JSON.stringify(history, null, 2));
  log(`Saved cycle ${history.cycle}: ${updated} updated, ${failed} failed, ` +
      `${Object.keys(history.players).length} tracked -> ${DATA_PATH}`);
  log('=== Player stats update done ===');
}

main().catch(e => {
  log(`❌ Fatal: ${e.message}`);
  process.exit(1);
});
