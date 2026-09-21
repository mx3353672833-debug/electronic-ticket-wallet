import { gpx } from '@tmcw/togeojson'
import type { JourneyTrack } from '../types/ticket'

type Position = [number, number]

export function trackFromGeoJSON(data: unknown, filename: string, source: JourneyTrack['source'] = 'geojson'): JourneyTrack {
  const segments: Position[][] = []
  let total = 0
  const add = (value: unknown) => {
    if (!Array.isArray(value) || value.length < 2) throw new Error('轨迹段至少需要两个坐标点')
    const points = value.map(p => {
      if (!Array.isArray(p) || typeof p[0] !== 'number' || typeof p[1] !== 'number' || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90) throw new Error('轨迹含无效坐标，请使用 WGS84 经纬度文件')
      return [p[0], p[1]] as Position
    })
    total += points.length
    if (total > 100000) throw new Error('轨迹超过 10 万个点，请先按这段旅程导出')
    segments.push(points)
  }
  const visit = (node: unknown, depth = 0) => {
    if (depth > 16 || !node || typeof node !== 'object') throw new Error('轨迹文件格式无效')
    const o = node as Record<string, unknown>
    if (o.type === 'FeatureCollection' && Array.isArray(o.features)) o.features.forEach(f => visit(f, depth + 1))
    else if (o.type === 'Feature') { if (o.geometry) visit(o.geometry, depth + 1) }
    else if (o.type === 'GeometryCollection' && Array.isArray(o.geometries)) o.geometries.forEach(f => visit(f, depth + 1))
    else if (o.type === 'LineString') add(o.coordinates)
    else if (o.type === 'MultiLineString' && Array.isArray(o.coordinates)) o.coordinates.forEach(add)
  }
  visit(data)
  if (!segments.length) throw new Error('文件中没有轨迹线，请导出 GPX 轨迹或 GeoJSON LineString')
  return { segments, filename, source, importedAt: new Date().toISOString() }
}

export async function readTrackFile(file: File): Promise<JourneyTrack> {
  if (file.size > 20 * 1024 * 1024) throw new Error('轨迹文件需小于 20 MB，请仅导出这段旅程')
  const text = await file.text()
  if (file.name.toLowerCase().endsWith('.gpx')) {
    const xml = new DOMParser().parseFromString(text, 'text/xml')
    if (xml.querySelector('parsererror') || xml.documentElement.localName !== 'gpx') throw new Error('无法读取 GPX 文件')
    return trackFromGeoJSON(gpx(xml), file.name, 'gpx')
  }
  try { return trackFromGeoJSON(JSON.parse(text), file.name) }
  catch (error) { if (error instanceof SyntaxError) throw new Error('无法读取 GeoJSON，请检查文件格式'); throw error }
}

function distance(a: Position, b: Position): number {
  const rad = Math.PI / 180
  const lat = (b[1] - a[1]) * rad, lng = (b[0] - a[0]) * rad
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(lng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))
}

/** Returns an actual recorded point halfway along travelled distance; never averages endpoints. */
export function trackAnchor(track: Pick<JourneyTrack, 'segments'>): { lat: number; lng: number } {
  const edges = track.segments.flatMap(segment => segment.slice(1).map((p, i) => ({ p, km: distance(segment[i], p) })))
  const halfway = edges.reduce((sum, edge) => sum + edge.km, 0) / 2
  let covered = 0
  for (const edge of edges) { covered += edge.km; if (covered >= halfway) return { lat: edge.p[1], lng: edge.p[0] } }
  const point = track.segments[0][0]
  return { lat: point[1], lng: point[0] }
}

export function trackLength(track: JourneyTrack) {
  return track.segments.reduce((sum, segment) => sum + segment.slice(1).reduce((s, p, i) => s + distance(segment[i], p), 0), 0)
}
