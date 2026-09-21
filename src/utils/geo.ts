import type { Place, Ticket } from '../types/ticket'
import { trackAnchor } from './tracks'

/** 城市/站点近似坐标（骨架用，非测绘级精度） */
export const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  北京: { lat: 39.9042, lng: 116.4074 },
  天津: { lat: 39.0842, lng: 117.2009 },
  上海: { lat: 31.2304, lng: 121.4737 },
  广州: { lat: 23.1291, lng: 113.2644 },
  深圳: { lat: 22.5431, lng: 114.0579 },
  大连: { lat: 38.914, lng: 121.6147 },
  成都: { lat: 30.5728, lng: 104.0668 },
  西安: { lat: 34.3416, lng: 108.9398 },
  杭州: { lat: 30.2741, lng: 120.1551 },
  南京: { lat: 32.0603, lng: 118.7969 },
  武汉: { lat: 30.5928, lng: 114.3055 },
  长沙: { lat: 28.2282, lng: 112.9388 },
  青岛: { lat: 36.0671, lng: 120.3826 },
  烟台: { lat: 37.4638, lng: 121.4479 },
  苏州: { lat: 31.2989, lng: 120.5853 },
  厦门: { lat: 24.4798, lng: 118.0894 },
  泉州: { lat: 24.8741, lng: 118.6757 },
  昆明: { lat: 25.0389, lng: 102.7183 },
  首都机场: { lat: 40.0799, lng: 116.6031 },
  大兴: { lat: 39.5098, lng: 116.4105 },
  虹桥: { lat: 31.1979, lng: 121.3363 },
  浦东: { lat: 31.1443, lng: 121.8083 },
  白云: { lat: 23.3924, lng: 113.2988 },
  双流: { lat: 30.5785, lng: 103.9471 },
  咸阳: { lat: 34.3296, lng: 108.708 },
  萧山: { lat: 30.184, lng: 120.263 },
  长水: { lat: 25.1019, lng: 102.9292 },
  周水子: { lat: 38.9657, lng: 121.5386 },
  北京南: { lat: 39.8654, lng: 116.3786 },
  大连北: { lat: 39.02, lng: 121.59 },
  广州南: { lat: 22.9887, lng: 113.269 },
  深圳北: { lat: 22.6097, lng: 114.0297 },
  杭州东: { lat: 30.292, lng: 120.212 },
  南京南: { lat: 31.9688, lng: 118.797 },
  上海虹桥: { lat: 31.1959, lng: 121.327 },
  武汉站: { lat: 30.608, lng: 114.424 },
  长沙南: { lat: 28.147, lng: 113.064 },
  国贸: { lat: 39.908, lng: 116.46 },
  西二旗: { lat: 40.052, lng: 116.308 },
  周庄: { lat: 31.11, lng: 120.85 },
  天河公园: { lat: 23.13, lng: 113.37 },
  广州南站: { lat: 22.9887, lng: 113.269 },
  静安寺: { lat: 31.223, lng: 121.445 },
  陆家嘴: { lat: 31.239, lng: 121.496 },
}

export type LatLng = { lat: number; lng: number }

export function lookupCityCoord(name?: string): LatLng | null {
  if (!name) return null
  const direct = CITY_COORDS[name]
  if (direct) return direct
  const normalized = name.replace(/(?:市|火车站|站)$/, '')
  const hit = Object.keys(CITY_COORDS).find(k => k === normalized)
  return hit ? CITY_COORDS[hit] : null
}

export function placeCoord(place: Place | null): LatLng | null {
  if (!place) return null
  if (typeof place.lat === 'number' && Number.isFinite(place.lat) && Math.abs(place.lat) <= 90 && typeof place.lng === 'number' && Number.isFinite(place.lng) && Math.abs(place.lng) <= 180) {
    return { lat: place.lat, lng: place.lng }
  }
  return lookupCityCoord(place.city) ?? lookupCityCoord(place.name)
}

export function routeMidpoint(from: LatLng | null, to: LatLng | null): LatLng | null {
  if (!from || !to) return null
  return { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 }
}

export type TicketRoute = {
  id: string
  ticket: Ticket
  from: LatLng | null
  to: LatLng | null
  mid: LatLng | null
  hasCoords: boolean
}

export function ticketRoute(ticket: Ticket): TicketRoute {
  const line = ticket.track || ticket.railRoute
  const first = line?.segments[0]?.[0]
  const last = line?.segments.at(-1)?.at(-1)
  const from = first ? { lat: first[1], lng: first[0] } : placeCoord(ticket.departure)
  const to = last ? { lat: last[1], lng: last[0] } : placeCoord(ticket.arrival)
  // A photo without a line stays at its known station, never an invented midpoint.
  const mid = first && last ? trackAnchor(line!) : from || to
  return {
    id: ticket.id,
    ticket,
    from,
    to,
    mid,
    hasCoords: Boolean(mid) && (ticket.processing?.documentKind !== 'refund' || Boolean(ticket.track)),
  }
}

/** 为展示补齐坐标（不改库；库中字段仍可为空） */
export function withEnrichedPlaces(ticket: Ticket): Ticket {
  const dep = ticket.departure
  const arr = ticket.arrival
  if (!dep && !arr) return ticket
  const depCoord = placeCoord(dep)
  const arrCoord = placeCoord(arr)
  return {
    ...ticket,
    departure: dep
      ? { ...dep, lat: dep.lat ?? depCoord?.lat, lng: dep.lng ?? depCoord?.lng }
      : null,
    arrival: arr
      ? { ...arr, lat: arr.lat ?? arrCoord?.lat, lng: arr.lng ?? arrCoord?.lng }
      : null,
  }
}

export function fitBounds(routes: TicketRoute[]): LatLng[] {
  const points: LatLng[] = []
  for (const r of routes) {
    if (r.from) points.push(r.from)
    if (r.to) points.push(r.to)
    if (r.mid) points.push(r.mid)
  }
  return points
}
