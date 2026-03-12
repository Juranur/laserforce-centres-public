/**
 * Fetch script for Laserforce centres
 * Optimized for GitHub Actions with fast completion
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fast configuration - prioritize completion over 100% data
const BASE_DELAY = 1500;        // 1.5 seconds between requests
const RETRY_DELAY = 3000;       // 3 seconds for retries
const BATCH_SIZE = 50;          // Progress save interval
const MAX_RETRY_ROUNDS = 2;     // Only 2 retry rounds

const CENTRES_API = 'https://v2.iplaylaserforce.com/globalScoringDropdownInfo.php';
const SCORING_API = 'https://v2.iplaylaserforce.com/globalScoring.php';

// Hard timeout: exit after 45 minutes max
const MAX_RUNTIME_MS = 45 * 60 * 1000;
const START_TIME = Date.now();

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
  const centres = centreList.map(c => ({
    id: c.centreId,
    regionSite: c.regionSite,
    name: c.centre,
    gamesTotal: results.get(c.centreId) || 0,
  }));

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
  log('=== Starting Laserforce Data Fetch (Fast Mode) ===');

  const outputPath = path.join(__dirname, '..', 'data', 'centres.json');

  // Load existing data
  const results = new Map();
  if (fs.existsSync(outputPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      if (existing.centres) {
        for (const c of existing.centres) {
          if (c.gamesTotal > 0) results.set(c.id, c.gamesTotal);
        }
        log(`Loaded ${results.size} existing valid results`);
      }
    } catch {}
  }

  const centreList = await fetchCentreList();
  const centreIds = centreList.map(c => c.centreId);

  // Only fetch centres without data
  let toFetch = centreIds.filter(id => !results.has(id));
  log(`Centres to fetch: ${toFetch.length}`);

  if (toFetch.length === 0) {
    log('All centres already have data!');
    const output = saveData(outputPath, centreList, results);
    log(`Done: ${output.centresWithData}/${output.totalCentres} with data`);
    return;
  }

  // Initial fetch pass
  let completed = 0;
  let consecutiveZeros = 0;

  for (const centreId of toFetch) {
    if (shouldStop()) break;

    const total = await fetchGamesTotal(centreId);
    results.set(centreId, total);
    completed++;

    if (total === 0) {
      consecutiveZeros++;
    } else {
      consecutiveZeros = 0;
    }

    // If getting many zeros in a row, might be rate limited - pause briefly
    if (consecutiveZeros >= 10) {
      log('Many consecutive zeros, pausing 10s...');
      await sleep(10000);
      consecutiveZeros = 0;
    }

    // Save progress every batch
    if (completed % BATCH_SIZE === 0) {
      const zeros = Array.from(results.values()).filter(v => v === 0).length;
      log(`Progress: ${completed}/${toFetch.length} (${zeros} zeros so far)`);
      saveData(outputPath, centreList, results);
    }

    if (completed < toFetch.length && !shouldStop()) {
      await sleep(BASE_DELAY);
    }
  }

  log(`Initial pass complete: ${completed} fetched`);

  // Quick retry for zeros (if time permits)
  for (let round = 1; round <= MAX_RETRY_ROUNDS; round++) {
    if (shouldStop()) break;

    const zeros = centreIds.filter(id => results.get(id) === 0);
    if (zeros.length === 0) {
      log('All centres have data!');
      break;
    }

    log(`Retry round ${round}: ${zeros.length} zeros to retry`);

    // Brief pause before retry
    await sleep(5000);

    let retryCount = 0;
    for (const centreId of zeros) {
      if (shouldStop()) break;

      const total = await fetchGamesTotal(centreId);
      if (total > 0) {
        results.set(centreId, total);
        log(`Retry success: ${centreId} = ${total}`);
      }
      retryCount++;

      if (retryCount % BATCH_SIZE === 0) {
        saveData(outputPath, centreList, results);
      }

      if (!shouldStop()) await sleep(RETRY_DELAY);
    }

    saveData(outputPath, centreList, results);
  }

  // Final save
  const output = saveData(outputPath, centreList, results);
  const elapsed = Math.round((Date.now() - START_TIME) / 60000);

  log(`\n=== Done in ${elapsed} minutes ===`);
  log(`Total: ${output.totalCentres}, With data: ${output.centresWithData} (${Math.round(output.centresWithData/output.totalCentres*100)}%)`);
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
