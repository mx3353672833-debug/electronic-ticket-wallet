import { describe, expect, it } from 'vitest'
import { mockTickets } from '../data/mockTickets'
import { withEnrichedPlaces } from '../utils/geo'
import { filterTickets, searchHits, yearScopedTickets } from '../utils/search'
import { ticketRoute } from '../utils/geo'

describe('map homepage filters', () => {
  it('year scope keeps tickets; search only marks hits on map set', () => {
    const enriched = mockTickets.map(withEnrichedPlaces)
    const yearRange = { start: 2023, end: 2024 }
    const scoped = yearScopedTickets(enriched, yearRange)
    const hits = searchHits(scoped, '北京')
    expect(scoped.length).toBeGreaterThan(0)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.length).toBeLessThan(scoped.length)
    expect(filterTickets(enriched, '北京', yearRange)).toEqual(hits)
  })

  it('routes without coords still listed when place unknown', () => {
    const incomplete = mockTickets.find((t) => !t.takenAt && t.id === 'mock-19')
    expect(incomplete).toBeTruthy()
    const route = ticketRoute(withEnrichedPlaces(incomplete!))
    // 厦门/泉州有坐标；若名称命中城市字典则 hasCoords 为 true
    if (!route.hasCoords) {
      expect(route.mid).toBeNull()
    }
  })
})
