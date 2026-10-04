/**
 * Fetch script for Laserforce centres
 * - Rotates through centres to handle rate limiting
 * - Preserves centres that disappear from API with "no longer public" status
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Conservative delays
const BASE_DELAY = 4000;
const RATE_LIMIT_PAUSE = 60000;
const CONSECUTIVE_LIMIT = 2;
const BATCH_SIZE = 20;

const CENTRES_API = 'https://v2.iplaylaserforce.com/globalScoringDropdownInfo.php';
const SCORING_API = 'https://v2.iplaylaserforce.com/globalScoring.php';

const MAX_RUNTIME_MS = 50 * 60 * 1000;
const START_TIME = Date.now();

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

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

async function fetchCentreList() {
  log('Fetching centre list...');
  const formData = new URLSearchParams();
  formData.append('regionId', '9999');
  formData.append('siteId', '9999');

  const response = await fetch(CENTRES_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  });

  const data = await response.json();
  log(`Found ${data.centres.length} centres in API`);
  return data.centres;
}

async function fetchGamesTotal(centreId) {
  const formData = new URLSearchParams();
  formData.append('requestId', '1');
  formData.append('regionId', '9999');
  formData.append('siteId', '9999');
  formData.append('memberRegion', '0');
  formData.append('memberSite', '0');
  formData.append('memberId', '0');
  formData.append('selectedCentreId', String(centreId));
  formData.append('selectedGroupId', '0');
  formData.append('selectedQueryType', '0');

  try {
    const response = await fetch(SCORING_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    const text = await response.text();

    if (text.startsWith('<!DOCTYPE') || text.startsWith('<html') || text.includes('<head>')) {
      return { total: 0, rateLimited: true };
    }

    const data = JSON.parse(text);
    const total = (data.top100 || []).reduce((sum, p) => sum + (p['3'] || 0), 0);
    return { total, rateLimited: false };
  } catch (err) {
    return { total: 0, rateLimited: false, error: err.message };
  }
}

function saveData(outputPath, activeCentres, retiredCentres, results, lastCheckedIndex) {
  const activeMapped = activeCentres.map(c => {
    const data = results.get(c.centreId) || { gamesTotal: 0, lastActivity: 'before 2026' };
    return {
      id: c.centreId,
      regionSite: c.regionSite,
      name: c.centre,
      gamesTotal: data.gamesTotal,
      lastActivity: data.lastActivity,
      status: 'active'
    };
  });

  const retiredMapped = retiredCentres.map(c => ({
    id: c.id,
    regionSite: c.regionSite,
    name: c.name,
    gamesTotal: c.gamesTotal,
    lastActivity: c.lastActivity || 'before 2026',
    status: 'no longer public'
  }));

  const allCentres = [...activeMapped, ...retiredMapped];

  const output = {
    lastUpdated: new Date().toISOString(),
    totalCentres: allCentres.length,
    activeCentres: activeMapped.length,
    retiredCentres: retiredMapped.length,
    centresWithData: allCentres.filter(c => c.gamesTotal > 0).length,
    lastCheckedIndex: lastCheckedIndex,
    centres: allCentres,
  };

  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  return output;
}

async function main() {
  log('=== Laserforce Data Fetch Started ===');
  log(`Date: ${getTodayDate()}`);
  log('Mode: Rotating + preserving retired centres');

  const outputPath = path.join(__dirname, '..', 'data', 'centres.json');
  const today = getTodayDate();

  const results = new Map();
  let startIndex = 0;
  let fullExistingCentres = [];

  if (fs.existsSync(outputPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      if (existing.centres) {
        fullExistingCentres = existing.centres;
        for (const c of existing.centres) {
          results.set(c.id, {
            gamesTotal: c.gamesTotal || 0,
            lastActivity: c.lastActivity || 'before 2026',
            status: c.status || 'active',
          });
        }
        log(`Loaded ${results.size} existing records`);
      }
      if (typeof existing.lastCheckedIndex === 'number') {
        startIndex = (existing.lastCheckedIndex + 1) % existing.totalCentres;
        log(`Resuming from index ${startIndex}`);
      }
    } catch (err) {
      log(`Warning: Could not load existing data: ${err.message}`);
    }
  }

  const activeCentres = await fetchCentreList();
  const activeIds = new Set(activeCentres.map(c => c.centreId));

  // Build retired centres list (preserved from existing data)
  const retiredCentres = [];
  for (const c of fullExistingCentres) {
    if (!activeIds.has(c.id)) {
      retiredCentres.push({
        id: c.id,
        regionSite: c.regionSite,
        name: c.name,
        gamesTotal: c.gamesTotal,
        lastActivity: c.lastActivity || 'before 2026',
      });
    }
  }

  log(`Active centres: ${activeCentres.length}`);
  log(`Retired centres (preserved): ${retiredCentres.length}`);

  const total = activeCentres.length;
  const reorderedList = [
    ...activeCentres.slice(startIndex),
    ...activeCentres.slice(0, startIndex)
  ];

  let completed = 0;
  let changesDetected = 0;
  let rateLimitHits = 0;
  let consecutiveRateLimits = 0;
  let lastCheckedIdx = startIndex;

  for (let i = 0; i < reorderedList.length; i++) {
    if (shouldStop()) break;

    const centre = reorderedList[i];
    const actualIndex = (startIndex + i) % total;

    const { total: newTotal, rateLimited } = await fetchGamesTotal(centre.centreId);

    if (rateLimited) {
      rateLimitHits++;
      consecutiveRateLimits++;

      if (consecutiveRateLimits >= CONSECUTIVE_LIMIT) {
        log(`⚠️ Rate limited ${consecutiveRateLimits}x, pausing 60s... (total: ${rateLimitHits})`);
        await sleep(RATE_LIMIT_PAUSE);
        consecutiveRateLimits = 0;
      }
      continue;
    }

    consecutiveRateLimits = 0;
    lastCheckedIdx = actualIndex;

    const existing = results.get(centre.centreId) || { gamesTotal: 0, lastActivity: 'before 2026' };

    if (newTotal > 0) {
      if (newTotal !== existing.gamesTotal) {
        const diff = newTotal - existing.gamesTotal;
        results.set(centre.centreId, {
          gamesTotal: newTotal,
          lastActivity: today,
          status: 'active',
        });
        changesDetected++;
        log(`✓ ${centre.centreId}: ${existing.gamesTotal} → ${newTotal} (${diff > 0 ? '+' : ''}${diff})`);
      } else {
        results.set(centre.centreId, {
          gamesTotal: newTotal,
          lastActivity: existing.lastActivity,
          status: 'active',
        });
      }
    }

    completed++;

    if (completed % BATCH_SIZE === 0) {
      log(`Progress: ${completed}/${reorderedList.length} | Changes: ${changesDetected} | Rate limits: ${rateLimitHits}`);
      saveData(outputPath, activeCentres, retiredCentres, results, lastCheckedIdx);
    }

    if (!shouldStop()) {
      await sleep(BASE_DELAY);
    }
  }

  const output = saveData(outputPath, activeCentres, retiredCentres, results, lastCheckedIdx);
  const elapsed = Math.round((Date.now() - START_TIME) / 60000);

  log(`\n=== Complete in ${elapsed} minutes ===`);
  log(`Active centres checked: ${completed}/${total}`);
  log(`Retired centres preserved: ${retiredCentres.length}`);
  log(`Last checked index: ${lastCheckedIdx}`);
  log(`Next run starts at: ${(lastCheckedIdx + 1) % total}`);
  log(`Changes detected: ${changesDetected}`);
  log(`Rate limit hits: ${rateLimitHits}`);
  log(`Total centres in data: ${output.totalCentres}`);
}

main().catch(err => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
