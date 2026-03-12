'use client'

import { useEffect, useState } from 'react'

interface Centre {
  id: string
  regionSite: string
  name: string
  gamesTotal: number
  lastActivity: string
}

interface CentresData {
  lastUpdated: string
  totalCentres: number
  centresWithData: number
  centres: Centre[]
}

type SortField = 'rank' | 'id' | 'regionSite' | 'name' | 'gamesTotal' | 'lastActivity'
type SortDirection = 'asc' | 'desc'

export default function Home() {
  const [data, setData] = useState<CentresData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('gamesTotal')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  useEffect(() => {
    fetch('/api/centres')
      .then(res => res.json())
      .then(data => {
        setData(data)
        setLoading(false)
      })
      .catch(err => {
        setError('Failed to load data')
        setLoading(false)
      })
  }, [])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection(field === 'name' || field === 'regionSite' || field === 'lastActivity' ? 'asc' : 'desc')
    }
  }

  const parseRegionSite = (regionSite: string) => {
    const parts = regionSite.split('-')
    return {
      region: parseInt(parts[0]) || 0,
      site: parseInt(parts[1]) || 0
    }
  }

  const parseLastActivity = (lastActivity: string) => {
    if (lastActivity === 'before 2026' || !lastActivity) {
      return new Date('2000-01-01')
    }
    return new Date(lastActivity)
  }

  const getSortedCentres = () => {
    if (!data?.centres) return []

    const sorted = [...data.centres].sort((a, b) => {
      let comparison = 0

      switch (sortField) {
        case 'id':
          comparison = parseInt(a.id) - parseInt(b.id)
          break
        case 'regionSite': {
          const aParsed = parseRegionSite(a.regionSite)
          const bParsed = parseRegionSite(b.regionSite)
          if (aParsed.region !== bParsed.region) {
            comparison = aParsed.region - bParsed.region
          } else {
            comparison = aParsed.site - bParsed.site
          }
          break
        }
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'gamesTotal':
          comparison = a.gamesTotal - b.gamesTotal
          break
        case 'lastActivity': {
          const aDate = parseLastActivity(a.lastActivity)
          const bDate = parseLastActivity(b.lastActivity)
          comparison = aDate.getTime() - bDate.getTime()
          break
        }
        case 'rank':
        default:
          comparison = b.gamesTotal - a.gamesTotal
          break
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })

    return sorted
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <span style={{ color: '#ccc', marginLeft: '4px' }}>⇅</span>
    }
    return <span style={{ marginLeft: '4px' }}>{sortDirection === 'asc' ? '↑' : '↓'}</span>
  }

  const sortedCentres = getSortedCentres()

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif'
      }}>
        <p>Loading centre data...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif',
        color: 'red'
      }}>
        <p>{error}</p>
      </div>
    )
  }

  return (
    <div style={{
      padding: '2rem',
      fontFamily: 'system-ui, sans-serif',
      maxWidth: '1500px',
      margin: '0 auto'
    }}>
      <h1 style={{ marginBottom: '0.5rem' }}>Laserforce Centres Rankings</h1>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>
        Total Centres: {data?.totalCentres} | Centres with Data: {data?.centresWithData} |
        Last Updated: {data?.lastUpdated ? new Date(data.lastUpdated).toLocaleString() : 'N/A'}
      </p>

      <p style={{ color: '#888', marginBottom: '1rem', fontSize: '14px' }}>
        💡 Click column headers to sort
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '14px'
        }}>
          <thead>
            <tr style={{ backgroundColor: '#f4f4f4' }}>
              <th onClick={() => handleSort('rank')} style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd', width: '60px', cursor: 'pointer', userSelect: 'none' }}>
                Rank<SortIcon field="rank" />
              </th>
              <th onClick={() => handleSort('id')} style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd', width: '80px', cursor: 'pointer', userSelect: 'none' }}>
                ID<SortIcon field="id" />
              </th>
              <th onClick={() => handleSort('regionSite')} style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd', width: '100px', cursor: 'pointer', userSelect: 'none' }}>
                Region-Site<SortIcon field="regionSite" />
              </th>
              <th onClick={() => handleSort('name')} style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd', cursor: 'pointer', userSelect: 'none' }}>
                Centre Name<SortIcon field="name" />
              </th>
              <th onClick={() => handleSort('gamesTotal')} style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd', width: '120px', cursor: 'pointer', userSelect: 'none' }}>
                Games Total<SortIcon field="gamesTotal" />
              </th>
              <th onClick={() => handleSort('lastActivity')} style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd', width: '130px', cursor: 'pointer', userSelect: 'none' }}>
                Latest Activity<SortIcon field="lastActivity" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedCentres.map((centre, index) => (
              <tr key={centre.id} style={{ backgroundColor: index % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>{index + 1}</td>
                <td style={{ padding: '10px', borderBottom: '1px solid #eee', fontFamily: 'monospace' }}>{centre.id}</td>
                <td style={{ padding: '10px', borderBottom: '1px solid #eee', fontFamily: 'monospace' }}>{centre.regionSite}</td>
                <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>{centre.name}</td>
                <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #eee', fontWeight: '500' }}>
                  {centre.gamesTotal.toLocaleString()}
                </td>
                <td style={{
                  padding: '10px',
                  borderBottom: '1px solid #eee',
                  color: centre.lastActivity === 'before 2026' ? '#999' : '#333',
                  fontStyle: centre.lastActivity === 'before 2026' ? 'italic' : 'normal'
                }}>
                  {centre.lastActivity || 'before 2026'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
