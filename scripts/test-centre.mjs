const CENTRE_ID = '228';

const body = new URLSearchParams({
  requestId: '1',
  regionId: '9999',
  siteId: '9999',
  memberRegion: '0',
  memberSite: '0',
  memberId: '0',
  selectedCentreId: CENTRE_ID,
  selectedGroupId: '0',
  selectedQueryType: '0',
});

const res = await fetch('https://v2.iplaylaserforce.com/globalScoring.php', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: body.toString(),
});

const text = await res.text();
console.log('HTTP status:', res.status);
console.log('--- First 500 characters of response ---');
console.log(text.slice(0, 500));

if (/^\s*</.test(text)) {
  console.log('\n❌ Got HTML instead of JSON — likely rate-limited. Wait a minute and run again.');
} else {
  try {
    const data = JSON.parse(text);
    const players = data.top100 || [];
    const total = players.reduce((s, p) => s + (p['3'] || 0), 0);
    console.log(`\n✅ Valid JSON. Players in top100: ${players.length}`);
    console.log(`✅ Games total (sum of field '3'): ${total}`);
    if (players.length > 0) {
      console.log('Sample entry:', JSON.stringify(players[0]));
    }
  } catch (e) {
    console.log('\n⚠️ Not valid JSON:', e.message);
  }
}
