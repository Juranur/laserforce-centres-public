/**
 * Fetch script for Laserforce centres - Optimized for GitHub Actions
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INITIAL_DELAY = 3000;
const RETRY_DELAY = 4000;
const RETRY_PAUSE = 60000;
const MAX_RETRIES = 3;

const CENTRES_API = 'https://v2.iplaylaserforce.com/globalScoringDropdownInfo.php';
const SCORING_API = 'https://v2.iplaylaserforce.com/globalScoring.php';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
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

async function main() {
  const startTime = Date.now();
  log('=== Starting Laserforce Data Fetch ===');
  
  const centreList = await fetchCentreList();
  const centreIds = centreList.map(c => c.centreId);
  const results = new Map();

  const outputPath = path.join(__dirname, '..', 'data', 'centres.json');
  
  // Load existing data for resume
  if (fs.existsSync(outputPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      if (existing.centres) {
        for (const c of existing.centres) {
          results.set(c.id, c.gamesTotal);
        }
        log(`Loaded ${results.size} existing results`);
      }
    } catch {}
  }

  // Fetch centres with zero or no data
  let toFetch = centreIds.filter(id => !results.has(id) || results.get(id) === 0);
  log(`Centres to fetch: ${toFetch.length}`);

  let completed = 0;
  for (const centreId of toFetch) {
    const total = await fetchGamesTotal(centreId);
    results.set(centreId, total);
    completed++;

    if (completed % 20 === 0 || completed === toFetch.length) {
      log(`Progress: ${completed}/${toFetch.length}`);
      
      // Save progress every 20 centres
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
    }

    if (completed < toFetch.length) {
      await sleep(INITIAL_DELAY);
    }
  }

  // Retry zeros
  for (let round = 1; round <= MAX_RETRIES; round++) {
    toFetch = centreIds.filter(id => results.get(id) === 0);
    if (toFetch.length === 0) break;

    log(`Retry round ${round}: ${toFetch.length} zeros`);
    await sleep(RETRY_PAUSE);

    for (const centreId of toFetch) {
      const total = await fetchGamesTotal(centreId);
      if (total > 0) results.set(centreId, total);
      await sleep(RETRY_DELAY);
    }

    // Save after retry
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
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  }

  const elapsed = Math.round((Date.now() - startTime) / 60000);
  const centresWithData = Array.from(results.values()).filter(v => v > 0).length;
  log(`\n=== Done in ${elapsed} minutes ===`);
  log(`Total: ${centreIds.length}, With data: ${centresWithData}`);
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
