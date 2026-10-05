import * as fs from 'fs';

const files = fs.readdirSync('.')
  .filter(f => /^wayback-dropdown-\d{8}\.json$/.test(f))
  .sort().reverse();

console.log('Captures found (newest → oldest):', files.join(', ') || 'NONE', '\n');

const current = JSON.parse(fs.readFileSync('data/centres.json', 'utf8'));
const useNumber = typeof current.centres[0].id === 'number';
const norm = id => (useNumber ? Number(id) : String(id));
const activeIds = new Set(current.centres.filter(c => c.status === 'active').map(c => String(c.id)));
const knownIds = new Set(current.centres.map(c => String(c.id)));

let addedTotal = 0;
for (const file of files) {
  const m = file.match(/(\d{4})(\d{2})(\d{2})/);
  const captureDate = `${m[1]}-${m[2]}-${m[3]}`;

  let wayback;
  try { wayback = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { console.log(`⚠️ ${file}: not valid JSON — skipped`); continue; }
  if (!Array.isArray(wayback.centres)) { console.log(`⚠️ ${file}: no centres array — skipped`); continue; }

  const historical = wayback.centres
    .filter(c => c.centreId != null && c.centre)
    .map(c => ({ id: norm(c.centreId), regionSite: c.regionSite, name: c.centre }));

  const stillActive = historical.filter(c => activeIds.has(String(c.id)));
  const toAdd = historical.filter(c => !activeIds.has(String(c.id)) && !knownIds.has(String(c.id)));

  console.log(`${file} (${captureDate}): ${historical.length} captured | ${stillActive.length} still active, skipped | +${toAdd.length} new retired`);

  for (const c of toAdd) {
    current.centres.push({ ...c, gamesTotal: 0, lastActivity: captureDate, status: 'no longer public' });
    knownIds.add(String(c.id));
  }
  addedTotal += toAdd.length;
}

current.activeCentres = current.centres.filter(c => c.status === 'active').length;
current.retiredCentres = current.centres.filter(c => c.status !== 'active').length;
current.totalCentres = current.centres.length;
fs.writeFileSync('data/centres.json', JSON.stringify(current, null, 2));

console.log(`\nDone: +${addedTotal} new historical centres`);
console.log(`Totals: ${current.totalCentres} | active: ${current.activeCentres} | retired: ${current.retiredCentres}`);