import * as fs from 'fs';

const CAPTURE_DATE = '2022-08-14';
const wayback = JSON.parse(fs.readFileSync('wayback-dropdown-2022.json', 'utf8'));
const current = JSON.parse(fs.readFileSync('data/centres.json', 'utf8'));

// match the id type used in your existing file (number vs string)
const useNumber = typeof current.centres[0].id === 'number';
const norm = id => (useNumber ? Number(id) : String(id));

const activeIds = new Set(current.centres.filter(c => c.status === 'active').map(c => String(c.id)));
const knownIds  = new Set(current.centres.map(c => String(c.id)));

const historical = wayback.centres.map(c => ({ id: norm(c.centreId), regionSite: c.regionSite, name: c.centre }));
const stillActive  = historical.filter(c => activeIds.has(String(c.id)));
const toAdd        = historical.filter(c => !activeIds.has(String(c.id)) && !knownIds.has(String(c.id)));

console.log(`Capture: ${historical.length} centres | still active today: ${stillActive.length} (skipped) | NEW retired entries: ${toAdd.length}`);

current.centres.push(...toAdd.map(c => ({
  ...c, gamesTotal: 0, lastActivity: CAPTURE_DATE, status: 'no longer public',
})));
current.activeCentres  = current.centres.filter(c => c.status === 'active').length;
current.retiredCentres = current.centres.filter(c => c.status !== 'active').length;
current.totalCentres   = current.centres.length;

fs.writeFileSync('data/centres.json', JSON.stringify(current, null, 2));
console.log(`Done: ${current.totalCentres} total, ${current.activeCentres} active, ${current.retiredCentres} retired`);