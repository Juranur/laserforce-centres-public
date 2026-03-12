/**
 * Fetch script for Laserforce centres
 * Runs in GitHub Actions to update data every 24 hours
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const INITIAL_DELAY = 4000;
const RETRY_DELAY = 6000;
const RETRY_PAUSE = 90000;
const MAX_RETRIES = 5;

const CENTRES_API = 'https://v2.iplaylaserforce.com/globalScoringDropdownInfo.php';
const SCORING_API = 'https://v2.iplaylaserforce.com/globalScoring.php';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
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

  if (!response.ok) {
    throw new Error(`Failed to fetch centres: ${response.status}`);
  }

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
    const gamesTotal = (data.top100 || []).reduce(
      (sum, player) => sum + (player['3'] || 0),
      0
    );

    return gamesTotal;
  } catch {
    return 0;
  }
}

async function fetchWithRetry(centreIds, delay, progressLabel) {
  const results = new Map();
  let completed = 0;

  for (const centreId of centreIds) {
    const gamesTotal = await fetchGamesTotal(centreId);
    results.set(centreId, gamesTotal);
    
    completed++;
    if (completed % 10 === 0 || completed === centreIds.length) {
      const zeros = Array.from(results.values()).filter(v => v === 0).length;
      log(`${progressLabel}: ${completed}/${centreIds.length} (${zeros} zeros so far)`);
    }

    if (completed < centreIds.length) {
      await sleep(delay);
    }
  }

  return results;
}

async function main() {
  log('=== Starting Laserforce Data Fetch ===');
  log(`Configuration: MAX_RETRIES=${MAX_RETRIES}, INITIAL_DELAY=${INITIAL_DELAY}ms`);
  
  const centreList = await fetchCentreList();
  const centreIds = centreList.map(c => c.centreId);
  
  const results = new Map();
  let centresToFetch = [...centreIds];
  
  // Initial fetch
  log('\n=== Initial Fetch ===');
  const initialResults = await fetchWithRetry(centresToFetch, INITIAL_DELAY, 'Initial');
  
  for (const [id, total] of initialResults) {
    results.set(id, total);
  }
  
  let zerosCount = Array.from(results.values()).filter(v => v === 0).length;
  let successCount = results.size - zerosCount;
  log(`Initial fetch complete: ${successCount}/${results.size} centres with data (${zerosCount} zeros)`);
  
  // Retry loop
  for (let retryRound = 1; retryRound <= MAX_RETRIES; retryRound++) {
    centresToFetch = centreIds.filter(id => (results.get(id) || 0) === 0);
    
    if (centresToFetch.length === 0) {
      log('\n🎉 All centres have data! No more retries needed.');
      break;
    }
    
    log(`\n=== Retry Round ${retryRound}/${MAX_RETRIES} ===`);
    log(`Found ${centresToFetch.length} centres with zero data`);
    log(`Waiting ${RETRY_PAUSE / 1000} seconds before retry...`);
    await sleep(RETRY_PAUSE);
    
    const retryResults = await fetchWithRetry(centresToFetch, RETRY_DELAY, `Retry ${retryRound}`);
    
    let improved = 0;
    for (const [id, total] of retryResults) {
      if (total > 0 && (results.get(id) || 0) === 0) {
        results.set(id, total);
        improved++;
      }
    }
    
    zerosCount = Array.from(results.values()).filter(v => v === 0).length;
    successCount = results.size - zerosCount;
    log(`Retry ${retryRound} complete: Improved ${improved}, now ${successCount}/${results.size} with data`);
  }
  
  // Build final output
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
  
  // Save to file
  const dataDir = path.join(__dirname, '..', 'data');
  const outputPath = path.join(dataDir, 'centres.json');
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  
  log('\n=== Final Summary ===');
  log(`Total centres: ${output.totalCentres}`);
  log(`Centres with data: ${output.centresWithData}`);
  log(`Success rate: ${((output.centresWithData / output.totalCentres) * 100).toFixed(1)}%`);
  log(`\nData saved to: ${outputPath}`);
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
