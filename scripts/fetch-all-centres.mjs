/**
 * Fetch script for Laserforce centres
 * Fetches ALL centres every run to detect activity changes
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const BASE_DELAY = 1500;        // 1.5 seconds between requests
const RETRY_DELAY = 3000;       // 3 seconds for retries
const BATCH_SIZE = 50;          // Progress save interval
const MAX_RETRY_ROUNDS = 2;     // Only 2 retry rounds

const CENTRES_API = 'https://v2.iplaylaserforce.com/globalScoringDropdownInfo.php';
const SCORING_API = 'https://v2.iplaylaserforce.com/globalScoring.php';

// Hard timeout: exit after 45 minutes max
const MAX_RUNTIME_MS = 45 * 60 * 1000;
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
  const elapsed = Date.now() - START_TIME;
  if (elapsed > MAX_RUNTIME_MS) {
    log('⚠️ Max runtime reached, wrapping up...');
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
  formData.append('selectedCentreId', centreId);
  formData.append('selectedGroupId', '0');
  formData.append('selectedQueryType', '0');

  try {
    const response = await fetch(SCORING_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    if (!response.ok) return 0;
    const data = await response.json();
    return (data.top100 || []).reduce((sum, p) => sum + (p['3'] || 0), 0);
  } catch {
    return 0;
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
  log('=== Starting Laserforce Data Fetch ===');
  log('Mode: Fetch ALL centres to detect activity changes');

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
        log(`Loaded ${results.size} existing results from file`);
      }
    } catch (err) {
      log(`Warning: Could not load existing file: ${err.message}`);
    }
  }

  const centreList = await fetchCentreList();
  const centreIds = centreList.map(c => c.centreId);

  // CRITICAL: Fetch ALL centres to detect changes
  // Do NOT skip any centres, even if they have existing data
  const toFetch = centreIds;
  log(`Will fetch ALL ${toFetch.length} centres to detect activity`);

  // Fetch pass
  let completed = 0;
  let consecutiveZeros = 0;
  let changesDetected = 0;
  let apiZeros = 0;

  for (const centreId of toFetch) {
    if (shouldStop()) break;

    const newTotal = await fetchGamesTotal(centreId);
    const existing = results.get(centreId) || { gamesTotal: 0, lastActivity: 'before 2026' };

    // Track API zeros (possible rate limiting)
    if (newTotal === 0) {
      apiZeros++;
    }

    // Check if games total changed (activity detected)
    // Only update if we got valid data (newTotal > 0) AND it's different from before
    if (newTotal > 0 && newTotal !== existing.gamesTotal) {
      const change = newTotal - existing.gamesTotal;
      results.set(centreId, {
        gamesTotal: newTotal,
        lastActivity: today,
      });
      changesDetected++;
      log(`✓ Activity: ${centreId} changed by ${change > 0 ? '+' : ''}${change} (${existing.gamesTotal} → ${newTotal})`);
    } else if (newTotal > 0) {
      // No change, keep existing lastActivity
      results.set(centreId, {
        gamesTotal: newTotal,
        lastActivity: existing.lastActivity,
      });
    }
    // If newTotal === 0, keep existing data (don't overwrite with zero)

    completed++;

    // Handle consecutive zeros (rate limiting detection)
    if (newTotal === 0) {
      consecutiveZeros++;
      if (consecutiveZeros >= 10) {
        log('⚠️ Rate limiting suspected (10 consecutive zeros), pausing 15s...');
        await sleep(15000);
        consecutiveZeros = 0;
      }
    } else {
      consecutiveZeros = 0;
    }

    // Progress update and save
    if (completed % BATCH_SIZE === 0) {
      log(`Progress: ${completed}/${toFetch.length} | Changes: ${changesDetected} | API Zeros: ${apiZeros}`);
      saveData(outputPath, centreList, results);
    }

    if (completed < toFetch.length && !shouldStop()) {
      await sleep(BASE_DELAY);
    }
  }

  log(`\nInitial pass complete: ${completed} fetched, ${changesDetected} changes, ${apiZeros} API zeros`);

  // Retry centres that returned zero (if time permits)
  const zeroCentres = centreIds.filter(id => (results.get(id)?.gamesTotal || 0) === 0);

  if (zeroCentres.length > 0 && zeroCentres.length < 50) {
    log(`\nRetrying ${zeroCentres.length} centres that returned zero...`);
    await sleep(5000);

    for (const centreId of zeroCentres) {
      if (shouldStop()) break;

      const newTotal = await fetchGamesTotal(centreId);
      if (newTotal > 0) {
        results.set(centreId, {
          gamesTotal: newTotal,
          lastActivity: today,
        });
        log(`✓ Retry success: ${centreId} = ${newTotal}`);
      }
      await sleep(RETRY_DELAY);
    }
  }

  // Final save
  const output = saveData(outputPath, centreList, results);
  const elapsed = Math.round((Date.now() - START_TIME) / 60000);

  log(`\n=== Complete in ${elapsed} minutes ===`);
  log(`Total centres: ${output.totalCentres}`);
  log(`Centres with data: ${output.centresWithData}`);
  log(`Changes detected this run: ${changesDetected}`);
  log(`API zeros (may indicate rate limiting): ${apiZeros}`);
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
