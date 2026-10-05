import * as fs from 'fs';

const DATA = 'data/centres.json';
const API = 'https://v2.iplaylaserforce.com/globalScoring.php';
const DELAY = 4000, RATE_PAUSE = 60000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchCentre(centreId) {
  const body = new URLSearchParams({
    requestId: '1', regionId: '9999', siteId: '9999',
    memberRegion: '0', memberSite: '0', memberId: '0',
    selectedCentreId: String(centreId),
    selectedGroupId: '0', selectedQueryType: '0',
  });
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const text = await res.text();
  if (/^\s*</.test(text)) return { rateLimited: true };
  try {
    const data = JSON.parse(text);
    return {
      total: (data.top100 || []).reduce((s, p) => s + (p['3'] || 0), 0),
      apiName: data.top100?.[0]?.['1'],
    };
  } catch { return { total: 0 }; }
}

const db = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const retired = db.centres.filter(c => c.status !== 'active');
console.log(`Probing ${retired.length} retired centres...\n`);

let updated = 0, noData = 0;
for (const c of retired) {
  const r = await fetchCentre(c.id);
  if (r.rateLimited) {
    console.log(`⚠️ ${c.id} rate-limited, pausing 60s...`);
    await sleep(RATE_PAUSE);
    continue;
  }
  // sanity check: does the API's own name match what we stored?
  if (r.apiName) {
    const stored = c.name.split(',')[0].slice(0, 8).toLowerCase();
    if (!r.apiName.toLowerCase().includes(stored)) {
      console.log(`⚠️ NAME CHECK ${c.id}: stored "${c.name}" vs API "${r.apiName}" — verify manually!`);
    }
  }
  if (r.total > 0 && r.total !== c.gamesTotal) {
    console.log(`✓ ${c.id} ${c.name}: ${c.gamesTotal} → ${r.total}`);
    c.gamesTotal = r.total;
    updated++;
  } else {
    console.log(`– ${c.id} ${c.name}: ${r.total === 0 ? 'no data in API' : 'unchanged'}`);
    if (r.total === 0) noData++;
  }
  await sleep(DELAY);
}

fs.writeFileSync(DATA, JSON.stringify(db, null, 2));
console.log(`\nDone. Updated: ${updated} | No data: ${noData}`);