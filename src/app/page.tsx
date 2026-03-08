'use client'

import { useState, useEffect } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

interface Centre {
  id: string
  regionSite: string
  name: string
  gamesTotal: number
}

export default function Home() {
  const [centres, setCentres] = useState<Centre[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    async function fetchCentres() {
      try {
        const response = await fetch('/api/centres')

        if (!response.ok) {
          throw new Error('Failed to fetch data')
        }

        const data = await response.json()
        setCentres(data.centres)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }

    fetchCentres()
  }, [])

  const filteredCentres = centres.filter(centre =>
    centre.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const formatNumber = (num: number) => {
    return num.toLocaleString()
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-5xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>All Centres</CardTitle>
            <CardDescription>
              List of all Laserforce centres worldwide ({centres.length} total)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Input
                type="text"
                placeholder="Search centres..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>

            {loading ? (
              <div className="space-y-4">
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-8 flex-1" />
                    <Skeleton className="h-8 w-24" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="text-center py-8 text-destructive">
                <p>{error}</p>
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">ID</TableHead>
                      <TableHead>Centre Name</TableHead>
                      <TableHead className="w-32 text-right">Games Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCentres.map((centre) => (
                      <TableRow key={centre.id}>
                        <TableCell className="font-medium">{centre.id}</TableCell>
                        <TableCell>{centre.name}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatNumber(centre.gamesTotal)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredCentres.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                          No centres found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
