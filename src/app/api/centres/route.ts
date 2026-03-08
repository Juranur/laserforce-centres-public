import { NextResponse } from 'next/server';

interface Centre {
  id: string;
  regionSite: string;
  name: string;
  gamesTotal: number;
}

export async function GET() {
  try {
    // First, fetch the list of centres
    const centresFormData = new URLSearchParams();
    centresFormData.append('regionId', '9999');
    centresFormData.append('siteId', '9999');

    const centresResponse = await fetch('https://v2.iplaylaserforce.com/globalScoringDropdownInfo.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: centresFormData.toString(),
    });

    if (!centresResponse.ok) {
      throw new Error(`Failed to fetch centres: ${centresResponse.status}`);
    }

    const centresData = await centresResponse.json();
    const centreIds = centresData.centres.map((c: { centreId: string }) => c.centreId);

    // Fetch top 100 players for each centre and sum their games
    const centres: Centre[] = [];

    // Process centres in batches to avoid overwhelming the server
    const batchSize = 10;
    for (let i = 0; i < centreIds.length; i += batchSize) {
      const batch = centreIds.slice(i, i + batchSize);

      const results = await Promise.all(
        batch.map(async (centreId: string) => {
          try {
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

            const response = await fetch('https://v2.iplaylaserforce.com/globalScoring.php', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: formData.toString(),
            });

            if (!response.ok) {
              return { centreId, gamesTotal: 0 };
            }

            const data = await response.json();
            const gamesTotal = (data.top100 || []).reduce(
              (sum: number, player: { '3': number }) => sum + (player['3'] || 0),
              0
            );

            return { centreId, gamesTotal };
          } catch {
            return { centreId, gamesTotal: 0 };
          }
        })
      );

      // Find centre info and add to results
      for (const result of results) {
        const centreInfo = centresData.centres.find(
          (c: { centreId: string }) => c.centreId === result.centreId
        );
        if (centreInfo) {
          centres.push({
            id: centreInfo.centreId,
            regionSite: centreInfo.regionSite,
            name: centreInfo.centre,
            gamesTotal: result.gamesTotal,
          });
        }
      }
    }

    return NextResponse.json({ centres });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch centres', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
