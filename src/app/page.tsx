'use client'

import { useEffect, useState } from 'react'

interface Centre {
  id: string
  regionSite: string
  name: string
  gamesTotal: number
}

interface CentresData {
  lastUpdated: string
  totalCentres: number
  centresWithData: number
  centres: Centre[]
}

export default function Home() {
  const [data, setData] = useState<CentresData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  // Sort by gamesTotal descending
  const sortedCentres = [...(data?.centres || [])].sort((a, b) => b.gamesTotal - a.gamesTotal)

  return (
    <div style={{
      padding: '2rem',
      fontFamily: 'system-ui, sans-serif',
      maxWidth: '1400px',
      margin: '0 auto'
    }}>
      <h1 style={{ marginBottom: '0.5rem' }}>Laserforce Centres Rankings</h1>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>
        Total Centres: {data?.totalCentres} | Centres with Data: {data?.centresWithData} | 
        Last Updated: {data?.lastUpdated ? new Date(data.lastUpdated).toLocaleString() : 'N/A'}
      </p>
      
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '14px'
        }}>
          <thead>
            <tr style={{ backgroundColor: '#f4f4f4' }}>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd', width: '60px' }}>Rank</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd', width: '80px' }}>ID</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd', width: '100px' }}>Region-Site</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Centre Name</th>
              <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd', width: '120px' }}>Games Total</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
