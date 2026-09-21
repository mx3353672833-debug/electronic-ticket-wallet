import { describe, expect, it } from 'vitest'
import { mockTickets } from '../data/mockTickets'
import {
  CITY_COORDS,
  placeCoord,
  routeMidpoint,
  ticketRoute,
  withEnrichedPlaces,
} from '../utils/geo'

describe('geo / map routes', () => {
  it('has coords for common Chinese cities', () => {
    expect(CITY_COORDS['北京']).toBeTruthy()
    expect(CITY_COORDS['大连']).toBeTruthy()
    expect(CITY_COORDS['上海']).toBeTruthy()
  })

  it('computes midpoint between departure and arrival', () => {
    const mid = routeMidpoint({ lat: 39.9, lng: 116.4 }, { lat: 31.2, lng: 121.5 })
    expect(mid).toEqual({ lat: (39.9 + 31.2) / 2, lng: (116.4 + 121.5) / 2 })
  })

  it('enriches mock tickets with map coords', () => {
    const enriched = mockTickets.map(withEnrichedPlaces)
    const withRoute = enriched.map(ticketRoute)
    const mapped = withRoute.filter((r) => r.hasCoords)
    expect(mapped.length).toBeGreaterThanOrEqual(15)
    for (const r of mapped) {
      expect(r.mid).toBeTruthy()
      expect(r.from).toBeTruthy()
      expect(r.to).toBeTruthy()
    }
  })

  it('falls back to city name lookup when lat/lng missing on place', () => {
    const coord = placeCoord({ name: '北京南站', city: '北京' })
    expect(coord?.lat).toBeCloseTo(39.9042, 3)
  })
})
