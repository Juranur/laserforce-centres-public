import * as fs from 'fs';

const DATA = 'data/centres.json';
const API = 'https://v2.iplaylaserforce.com/globalScoring.php';
const DELAY = 4000, RATE_PAUSE = 60000, MAX_CONSECUTIVE_PAUSES = 20;
const PROGRESS = 'scripts/probe-progress.json';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const db = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const maxKnown = Math.max(...db.centres.map(c => Number(c.id) || 0));
const CEILING_OVERRIDE = Number(process.argv[2]) || 0;
const MAX_ID = CEILING_OVERRIDE || maxKnown + 50;
const known = new Set(db.centres.map(c => String(c.id)));
const useNumber = typeof db.centres[0].id === 'number';
const progress = fs.existsSync(PROGRESS) ? JSON.parse(fs.readFileSync(PROGRESS, 'utf8')) : { nextId: 1 };
let consecutivePauses = 0;

console.log(`Probing IDs ${progress.nextId}–${MAX_ID}...`);

for (let id = progress.nextId; id <= MAX_ID; id++) {
  let total = 0, name = null;

  while (true) { // retry the SAME id until the API gives a real answer
    const body = new URLSearchParams({ requestId:'1', regionId:'9999', siteId:'9999',
      memberRegion:'0', memberSite:'0', memberId:'0', selectedCentreId:String(id),
      selectedGroupId:'0', selectedQueryType:'0' });
    const res = await fetch(API, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: body.toString() });
    const text = await res.text();

    if (/^\s*</.test(text)) {
      if (++consecutivePauses > MAX_CONSECUTIVE_PAUSES) {
        console.log(`⛔ ${MAX_CONSECUTIVE_PAUSES} consecutive pauses — API is blocking us. Progress saved; rerun later, resumes at id ${id}.`);
        process.exit(1);
      }
      console.log(`⚠️ ${id} rate-limited — pausing 60s (pause ${consecutivePauses}/${MAX_CONSECUTIVE_PAUSES}), then retrying SAME id`);
      await sleep(RATE_PAUSE);
      continue; // stays in the inner loop — same id
    }

    try {
      const data = JSON.parse(text);
      total = (data.top100 || []).reduce((s, p) => s + (p['3'] || 0), 0);
      name = data.top100?.[0]?.['1'];
    } catch {}
    break; // definitive answer received
  }

  consecutivePauses = 0; // success resets the wall counter

  if (total > 0 && name) {
    if (known.has(String(id))) {
      console.log(`– ${id}: tracked (${name})`);
    } else {
      console.log(`✓ NEW ${id}: ${name} — ${total} games`);
      db.centres.push({ id: useNumber ? Number(id) : String(id), regionSite: 'unknown',
        name, gamesTotal: total, lastActivity: 'before 2026', status: 'no longer public' });
      known.add(String(id));
      fs.writeFileSync(DATA, JSON.stringify(db, null, 2));
    }
  } else {
    console.log(`· ${id}: no data`);
  }

  progress.nextId = id + 1;
  fs.writeFileSync(PROGRESS, JSON.stringify(progress));
  await sleep(DELAY);
}
console.log('Probe complete.');