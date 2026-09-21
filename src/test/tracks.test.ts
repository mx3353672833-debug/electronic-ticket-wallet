import { describe, expect, it } from 'vitest'
import { readTrackFile, trackAnchor, trackFromGeoJSON, trackLength } from '../utils/tracks'
import { lookupCityCoord, ticketRoute } from '../utils/geo'
import { mockTickets } from '../data/mockTickets'

const line = (coordinates: number[][]) => ({ type: 'LineString', coordinates })
const file = (text: string, name: string) => {
  const f = new File([text], name)
  // jsdom lacks Blob.text(); native browsers provide it.
  Object.defineProperty(f, 'text', { value: async () => text })
  return f
}

describe('ticket tracks', () => {
  it('does not invent a midpoint or connecting line without geometry', () => {
    const route=ticketRoute({...mockTickets[0],departure:{name:'出发站',lat:30,lng:110},arrival:{name:'到达站',lat:40,lng:120},track:undefined})
    expect(route.mid).toEqual({lat:30,lng:110})
    expect(route.ticket.track).toBeUndefined()
    expect(route.ticket.railRoute).toBeUndefined()
  })
  it('does not plot refund receipts as completed travel',()=>{
    const route=ticketRoute({...mockTickets[0],processing:{version:2,processedAt:'2026-09-21',cropped:true,reviewed:false,issues:[],documentKind:'refund',departureTime:null,amount:10}})
    expect(route.hasCoords).toBe(false)
  })
  it('places the ticket on a curved recorded track, not the endpoint midpoint', () => {
    const track = trackFromGeoJSON(line([[110, 30], [110, 31], [110, 32], [112, 32]]), 'curve.geojson')
    const route = ticketRoute({ ...mockTickets[0], track })
    expect(route.mid).toEqual({ lat: 32, lng: 110 })
    expect(route.mid).not.toEqual({ lat: 31, lng: 111 })
    expect(route.from).toEqual({ lat: 30, lng: 110 })
    expect(route.to).toEqual({ lat: 32, lng: 112 })
    expect(track.segments[0]).toHaveLength(4)
  })

  it('keeps discontinuous segments separate and excludes gaps from travelled length', () => {
    const track = trackFromGeoJSON({ type: 'MultiLineString', coordinates: [[[0, 0], [0, 1]], [[80, 0], [80, 1]]] }, 'gap.geojson')
    expect(track.segments).toHaveLength(2)
    expect(trackLength(track)).toBeCloseTo(222.39, 1)
    expect(trackAnchor(track)).toEqual({ lat: 1, lng: 0 })
  })

  it('extracts lines from collections, ignoring waypoint points', () => {
    const track = trackFromGeoJSON({ type: 'FeatureCollection', features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [10, 20] } },
      { type: 'Feature', geometry: line([[10, 20, 100], [11, 21, 102]]) },
    ] }, 'trip.json')
    expect(track.segments).toEqual([[[10, 20], [11, 21]]])
  })

  it.each([[[181, 20], [0, 0]], [[20, 91], [0, 0]], [[NaN, 0], [0, 0]], [['120', 20], [121, 21]]])('rejects invalid coordinates %j', (first, second) => {
    expect(() => trackFromGeoJSON({ type: 'LineString', coordinates: [first, second] }, 'invalid.json')).toThrow('无效坐标')
  })

  it('rejects empty tracks and excessive point counts', () => {
    expect(() => trackFromGeoJSON({ type: 'FeatureCollection', features: [] }, 'empty.json')).toThrow('没有轨迹线')
    expect(() => trackFromGeoJSON(line([[0, 0]]), 'short.json')).toThrow('至少需要两个')
    expect(() => trackFromGeoJSON(line(Array.from({ length: 100001 }, () => [0, 0])), 'large.json')).toThrow('10 万')
  })

  it('imports GPX without joining separate track segments', async () => {
    const track = await readTrackFile(file('<gpx version="1.1"><trk><trkseg><trkpt lat="30" lon="110"/><trkpt lat="31" lon="110"/></trkseg><trkseg><trkpt lat="32" lon="112"/><trkpt lat="33" lon="112"/></trkseg></trk></gpx>', 'trip.gpx'))
    expect(track.source).toBe('gpx')
    expect(track.segments).toEqual([[[110, 30], [110, 31]], [[112, 32], [112, 33]]])
  })

  it('reports malformed XML/JSON and oversized files clearly', async () => {
    await expect(readTrackFile(file('<gpx>', 'bad.gpx'))).rejects.toThrow('无法读取 GPX')
    await expect(readTrackFile(file('not json', 'bad.json'))).rejects.toThrow('无法读取 GeoJSON')
    const oversized = file('{}', 'large.json')
    Object.defineProperty(oversized, 'size', { value: 21 * 1024 * 1024 })
    await expect(readTrackFile(oversized)).rejects.toThrow('20 MB')
  })

  it('does not invent coordinates for ambiguous or fictional places', () => {
    expect(lookupCityCoord('家门口')).toBeNull()
    expect(lookupCityCoord('甲城')).toBeNull()
    expect(lookupCityCoord('客运站')).toBeNull()
    expect(lookupCityCoord('京')).toBeNull()
    expect(lookupCityCoord('大连市')).toEqual(lookupCityCoord('大连'))
  })
})
