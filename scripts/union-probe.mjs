import * as fs from 'fs';

const base = JSON.parse(fs.readFileSync('data/centres.json', 'utf8'));  // fresh scheduled data
const mine = JSON.parse(fs.readFileSync('probe-backup.json', 'utf8'));  // your sweep results

const ids = new Set(base.centres.map(c => String(c.id)));
let added = 0;
for (const c of mine.centres) {
  if (!ids.has(String(c.id))) { base.centres.push(c); ids.add(String(c.id)); added++; }
}
base.lastUpdated = new Date().toISOString();
base.totalCentres = base.centres.length;
base.activeCentres = base.centres.filter(c => c.status === 'active').length;
base.retiredCentres = base.centres.filter(c => c.status !== 'active').length;
base.centresWithData = base.centres.filter(c => c.gamesTotal > 0).length;
fs.writeFileSync('data/centres.json', JSON.stringify(base, null, 2));
console.log(`Union complete: +${added} probe finds. Totals: ${base.totalCentres} | active: ${base.activeCentres} | retired: ${base.retiredCentres}`);