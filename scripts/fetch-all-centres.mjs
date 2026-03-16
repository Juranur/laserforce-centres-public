/**
 * Fetch script for Laserforce centres
 * Rotates through centres so all get checked over multiple runs
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Very conservative delays
const BASE_DELAY = 4000;         // 4 seconds between requests
const RATE_LIMIT_PAUSE = 60000;  // 60 second pause when rate limited
const CONSECUTIVE_LIMIT = 2;     // Pause after 2 consecutive rate limits
const BATCH_SIZE = 20;           // Save every 20 centres

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

function saveData(outputPath, centreList, results, lastCheckedIndex) {
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
    lastCheckedIndex: lastCheckedIndex,
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
  log('Mode: Rotating through centres (4s delay, 60s pause on rate limit)');

  const outputPath = path.join(__dirname, '..', 'data', 'centres.json');
  const today = getTodayDate();

  const results = new Map();
  let startIndex = 0;

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
      if (typeof existing.lastCheckedIndex === 'number') {
        startIndex = (existing.lastCheckedIndex + 1) % existing.totalCentres;
        log(`Resuming from index ${startIndex} (last checked: ${existing.lastCheckedIndex})`);
      }
    } catch (err) {
      log(`Warning: Could not load existing data: ${err.message}`);
    }
  }

  const centreList = await fetchCentreList();
  const total = centreList.length;

  const reorderedList = [
    ...centreList.slice(startIndex),
    ...centreList.slice(0, startIndex)
  ];

  log(`Rotation: Starting from index ${startIndex}, will check ${reorderedList.length} centres`);

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
        log(`⚠️ Rate limited ${consecutiveRateLimits}x in a row, pausing 60s... (total hits: ${rateLimitHits})`);
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
        });
        changesDetected++;
        log(`✓ ${centre.centreId}: ${existing.gamesTotal} → ${newTotal} (${diff > 0 ? '+' : ''}${diff})`);
      } else {
        results.set(centre.centreId, {
          gamesTotal: newTotal,
          lastActivity: existing.lastActivity,
        });
      }
    }

    completed++;

    if (completed % BATCH_SIZE === 0) {
      log(`Progress: ${completed}/${reorderedList.length} | Changes: ${changesDetected} | Rate limits: ${rateLimitHits}`);
      saveData(outputPath, centreList, results, lastCheckedIdx);
    }

    if (!shouldStop()) {
      await sleep(BASE_DELAY);
    }
  }

  const output = saveData(outputPath, centreList, results, lastCheckedIdx);
  const elapsed = Math.round((Date.now() - START_TIME) / 60000);

  log(`\n=== Complete in ${elapsed} minutes ===`);
  log(`Centres checked this run: ${completed}/${total}`);
  log(`Last checked index: ${lastCheckedIdx}`);
  log(`Next run will start from index: ${(lastCheckedIdx + 1) % total}`);
  log(`Changes detected: ${changesDetected}`);
  log(`Rate limit hits: ${rateLimitHits}`);
  log(`Centres with data: ${output.centresWithData}`);
  log(`Centres with today's date: ${output.centres.filter(c => c.lastActivity === today).length}`);
}

main().catch(err => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
