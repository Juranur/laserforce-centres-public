/**
 * Fetch script for Laserforce centres
 * Uses longer delays to avoid rate limiting
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Conservative delays to avoid rate limiting
const BASE_DELAY = 2500;        // 2.5 seconds between requests
const RATE_LIMIT_PAUSE = 20000; // 20 second pause when rate limited
const BATCH_SIZE = 30;          // Save every 30 centres

const CENTRES_API = 'https://v2.iplaylaserforce.com/globalScoringDropdownInfo.php';
const SCORING_API = 'https://v2.iplaylaserforce.com/globalScoring.php';

const MAX_RUNTIME_MS = 50 * 60 * 1000; // 50 minutes max
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
  log(`Found ${data.centres.length} centres`);
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

    // Check if response is HTML (rate limiting)
    if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      return { total: 0, rateLimited: true };
    }

    const data = JSON.parse(text);
    const total = (data.top100 || []).reduce((sum, p) => sum + (p['3'] || 0), 0);
    return { total, rateLimited: false };
  } catch (err) {
    return { total: 0, rateLimited: false, error: err.message };
  }
}

function saveData(outputPath, centreList, results) {
  const centres = centreList.map(c => {
    const data = results.get(c.centreId) || { gamesTotal: 0, lastActivity: 'before 2026' };
    return {
      id: c.centreId,
      regionSite: c.regionSite,
      name: c.centre,
      gamesTotal: data.gamesTotal,
      lastActivity: data.lastActivity,
    };
  });

  const output = {
    lastUpdated: new Date().toISOString(),
    totalCentres: centres.length,
    centresWithData: centres.filter(c => c.gamesTotal > 0).length,
    centres,
  };

  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  return output;
}

async function main() {
  log('=== Laserforce Data Fetch Started ===');
  log(`Date: ${getTodayDate()}`);

  const outputPath = path.join(__dirname, '..', 'data', 'centres.json');
  const today = getTodayDate();

  // Load existing data
  const results = new Map();
  if (fs.existsSync(outputPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      if (existing.centres) {
        for (const c of existing.centres) {
          results.set(c.id, {
            gamesTotal: c.gamesTotal || 0,
            lastActivity: c.lastActivity || 'before 2026',
          });
        }
        log(`Loaded ${results.size} existing records`);
      }
    } catch (err) {
      log(`Warning: Could not load existing data: ${err.message}`);
    }
  }

  const centreList = await fetchCentreList();

  // Fetch all centres
  let completed = 0;
  let changesDetected = 0;
  let rateLimitHits = 0;
  let consecutiveRateLimits = 0;

  for (const centre of centreList) {
    if (shouldStop()) break;

    const { total: newTotal, rateLimited } = await fetchGamesTotal(centre.centreId);

    if (rateLimited) {
      rateLimitHits++;
      consecutiveRateLimits++;
      log(`⚠️ Rate limited on centre ${centre.centreId} (hit #${rateLimitHits})`);

      if (consecutiveRateLimits >= 3) {
        log(`Pausing ${RATE_LIMIT_PAUSE/1000}s due to repeated rate limiting...`);
        await sleep(RATE_LIMIT_PAUSE);
        consecutiveRateLimits = 0;
      }

      // Keep existing data
      continue;
    }

    consecutiveRateLimits = 0;
    const existing = results.get(centre.centreId) || { gamesTotal: 0, lastActivity: 'before 2026' };

    // Update if we got valid data
    if (newTotal > 0) {
      if (newTotal !== existing.gamesTotal) {
        const diff = newTotal - existing.gamesTotal;
        results.set(centre.centreId, {
          gamesTotal: newTotal,
          lastActivity: today,
        });
        changesDetected++;
        log(`✓ ${centre.centreId}: ${existing.gamesTotal} → ${newTotal} (${diff > 0 ? '+' : ''}${diff})`);
      } else {
        // No change, preserve lastActivity
        results.set(centre.centreId, {
          gamesTotal: newTotal,
          lastActivity: existing.lastActivity,
        });
      }
    }

    completed++;

    // Progress save
    if (completed % BATCH_SIZE === 0) {
      log(`Progress: ${completed}/${centreList.length} | Changes: ${changesDetected} | Rate limits: ${rateLimitHits}`);
      saveData(outputPath, centreList, results);
    }

    if (!shouldStop()) {
      await sleep(BASE_DELAY);
    }
  }

  // Final save
  const output = saveData(outputPath, centreList, results);
  const elapsed = Math.round((Date.now() - START_TIME) / 60000);

  log(`\n=== Complete in ${elapsed} minutes ===`);
  log(`Centres fetched: ${completed}/${centreList.length}`);
  log(`Changes detected: ${changesDetected}`);
  log(`Rate limit hits: ${rateLimitHits}`);
  log(`Centres with data: ${output.centresWithData}`);
}

main().catch(err => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
