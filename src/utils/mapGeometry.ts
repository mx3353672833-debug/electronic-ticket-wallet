import L from 'leaflet'

type Coordinate = [number, number]
type IndexedPoint = L.Point & { coordinate: Coordinate }
export const geometryLevel = (zoom: number) => [6, 9, 12, 15, 18].find(level => zoom <= level) ?? 24

/** Display-only LOD. Keep original vertices, endpoints and segment boundaries.
 * Simplification tolerance is at most half a pixel at the top of each zoom band.
 * Stored GPX / OSM coordinates are never modified or replaced with a chord.
 */
export function createRouteGeometry(segments: Coordinate[][]) {
  const projected = segments.map(segment => segment.map(coordinate =>
    Object.assign(L.CRS.EPSG3857.latLngToPoint(L.latLng(coordinate[1], coordinate[0]), 0), { coordinate }) as IndexedPoint))
  const cache = new Map<number, L.LatLngTuple[][]>()
  return (zoom: number): L.LatLngTuple[][] => {
    const level = geometryLevel(zoom)
    let result = cache.get(level)
    if (!result) {
      result = projected.map(segment => (level === 24 ? segment : L.LineUtil.simplify(segment, .5 / 2 ** level) as IndexedPoint[])
        .map(({ coordinate: [lng, lat] }) => [lat, lng] as L.LatLngTuple))
      cache.set(level, result)
    }
    return result
  }
}
