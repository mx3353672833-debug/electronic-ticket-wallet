import { describe, expect, it } from 'vitest'
import { placeCoord, routeMidpoint } from '../utils/geo'

describe('journey place coords', () => {
  it('uses explicit lat/lng when provided on place', () => {
    const c = placeCoord({ name: '自定义站', city: '未知城', lat: 12.34, lng: 56.78 })
    expect(c).toEqual({ lat: 12.34, lng: 56.78 })
  })

  it('falls back to city dictionary when lat/lng missing', () => {
    const c = placeCoord({ name: '某站', city: '上海' })
    expect(c?.lat).toBeCloseTo(31.2304, 3)
  })

  it('midpoint still works with explicit coords from upload', () => {
    const mid = routeMidpoint({ lat: 10, lng: 20 }, { lat: 30, lng: 40 })
    expect(mid).toEqual({ lat: 20, lng: 30 })
  })
})
