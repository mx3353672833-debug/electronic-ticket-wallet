import { useEffect, useMemo, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import { useTicketStore } from '../store/useTicketStore'
import { formatRoute, matchesSearch, yearScopedTickets } from '../utils/search'
import { ticketRoute } from '../utils/geo'
import type { TicketRoute } from '../utils/geo'
import { TicketFace } from './TicketFace'

function PhotoMarkers({ map, routes, query, onHover }: { map: L.Map; routes: TicketRoute[]; query: string; onHover: (id: string | null) => void }) {
  useEffect(() => {
    const group = L.markerClusterGroup({ maxClusterRadius: 65, showCoverageOnHover: false, spiderfyOnMaxZoom: true, zoomToBoundsOnClick: true, removeOutsideVisibleBounds: true,
      iconCreateFunction: cluster => {
        const shell = document.createElement('div')
        shell.className = 'photo-cluster'
        const children = cluster.getAllChildMarkers()
        const first = children.find(m => (m.options as L.MarkerOptions & { match?: boolean }).match) || children[0]
        const icon = first.options.icon as L.DivIcon
        const content = icon.options.html
        if (content instanceof HTMLElement) shell.append(content.cloneNode(true))
        const count = document.createElement('span')
        count.className = 'cluster-count'
        count.textContent = String(children.length)
        shell.append(count)
        shell.classList.toggle('is-dimmed', Boolean(query) && !children.some(m => (m.options as L.MarkerOptions & { match?: boolean }).match))
        return L.divIcon({ html: shell, className: 'photo-cluster-marker', iconSize: [130, 86], iconAnchor: [65, 90] })
      },
    })
    for (const route of routes) {
      if (!route.mid) continue
      const ticket = route.ticket
      const match = matchesSearch(ticket, query)
      const shell = document.createElement('div')
      shell.className = `map-photo ${query ? match ? 'is-matched' : 'is-dimmed' : ''}`
      // React escapes every text field before it reaches Leaflet's HTML icon.
      shell.innerHTML = renderToStaticMarkup(<><div className="map-photo-face"><TicketFace ticket={ticket} thumbnail /></div><span className="map-photo-caption">{ticket.departure?.name || '待核对'} → {ticket.arrival?.name || '待核对'}</span><span className={`map-photo-dot ${ticket.track || ticket.railRoute ? 'has-track' : ''}`} /></>)
      const marker = L.marker([route.mid.lat, route.mid.lng], { icon: L.divIcon({ html: shell, className: 'photo-marker', iconSize: [130, 86], iconAnchor: [65, 90] }), keyboard: true, title: `${formatRoute(ticket)} ${ticket.takenAt || '日期待补'}`, alt: formatRoute(ticket), riseOnHover: true, match } as L.MarkerOptions)
      marker.on('click', () => useTicketStore.getState().openTicket(ticket.id))
      marker.on('mouseover', () => onHover(ticket.id))
      marker.on('mouseout', () => onHover(null))
      group.addLayer(marker)
    }
    map.addLayer(group)
    return () => { map.removeLayer(group); group.clearLayers() }
  }, [map, routes, query, onHover])
  return null
}

function MapFrame({ map, routes, fitRequest }: { map: L.Map; routes: TicketRoute[]; fitRequest: number }) {
  const bounds = useMemo(() => {
    const points: L.LatLngTuple[] = []
    for (const route of routes) {
      const line = route.ticket.track || route.ticket.railRoute
      if (line) line.segments.forEach(s => s.forEach(p => points.push([p[1], p[0]])))
      else { if (route.from) points.push([route.from.lat, route.from.lng]); if (route.to) points.push([route.to.lat, route.to.lng]) }
    }
    return points.length ? L.latLngBounds(points) : null
  }, [routes])
  const key = bounds?.toBBoxString() || ''
  useEffect(() => {
    if (key) {
      const [west, south, east, north] = key.split(',').map(Number)
      const compact = map.getSize().x < 700
      const trayClearance = Number.parseFloat(getComputedStyle(map.getContainer()).getPropertyValue('--tray-clearance')) || 238
      map.fitBounds([[south, west], [north, east]], { paddingTopLeft: compact ? [55, 160] : [130, 130], paddingBottomRight: [compact ? 55 : 130, trayClearance + 5], maxZoom: 11, animate: false })
    }
  }, [map, key, fitRequest])
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  return null
}

/** Thin app-owned lifecycle integration with Leaflet, not a third-party React wrapper. */
function RouteLayers({ map, routes, query, hovered, onHover }: { map: L.Map; routes: TicketRoute[]; query: string; hovered: string | null; onHover: (id: string | null) => void }) {
  const rendered = useRef<{ route: TicketRoute; lines: L.Polyline[]; stops: L.CircleMarker[] }[]>([])
  useEffect(() => {
    const group = L.layerGroup().addTo(map)
    rendered.current = routes.map(route => {
      const line = route.ticket.track || route.ticket.railRoute
      const lines = (line?.segments || []).map(segment => L.polyline(segment.map(p => [p[1], p[0]] as L.LatLngTuple), { smoothFactor: .25, lineCap: 'round' })
        .on('click', () => useTicketStore.getState().openTicket(route.id))
        .on('mouseover', () => onHover(route.id))
        .on('mouseout', () => onHover(null)).addTo(group))
      const stops = [route.from, route.to].filter((p): p is NonNullable<typeof p> => Boolean(p)).map(p => L.circleMarker([p.lat, p.lng], { color:'#fff', weight:1.5 }).addTo(group))
      return { route, lines, stops }
    })
    return () => { map.removeLayer(group); group.clearLayers(); rendered.current = [] }
  }, [map, routes, onHover])
  useEffect(() => {
    // Hover changes only paint, not geometry or the element under the pointer.
    for (const {route,lines,stops} of rendered.current) {
      const dimmed = Boolean(query) && !matchesSearch(route.ticket, query)
      const active = hovered === route.id || (Boolean(query) && !dimmed)
      const color = route.ticket.track ? '#248a3d' : '#007aff'
      lines.forEach(line => line.setStyle({color,weight:active ? 4.5 : 2.5,opacity:dimmed ? .07 : active ? 1 : .55}))
      stops.forEach(stop => { stop.setRadius(active ? 5 : 3); stop.setStyle({fillColor:color,fillOpacity:dimmed ? .2 : 1,opacity:dimmed ? .2 : 1}) })
    }
  }, [map, routes, query, hovered])
  return null
}

export function TicketMap({ fitRequest = 0 }: { fitRequest?: number }) {
  const { tickets, searchQuery, yearRange, openTicket } = useTicketStore()
  const [hovered, setHovered] = useState<string | null>(null)
  const [tileError, setTileError] = useState(false)
  const [showUnplaced, setShowUnplaced] = useState(false)
  const canvas = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<L.Map | null>(null)
  useEffect(() => {
    const instance = L.map(canvas.current!, {center:[34.5,112],zoom:4,zoomSnap:.25,zoomDelta:.5,zoomControl:false,scrollWheelZoom:true})
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · 蓝线：路网推算'})
      .on('tileerror', () => setTileError(true)).addTo(instance)
    L.control.zoom({position:'bottomright',zoomInTitle:'放大地图',zoomOutTitle:'缩小地图'}).addTo(instance)
    setMap(instance)
    return () => { instance.remove() }
  }, [])
  const routes = useMemo(() => yearScopedTickets(tickets, yearRange).map(ticketRoute), [tickets, yearRange])
  const mapped = useMemo(() => routes.filter(r => r.hasCoords), [routes])
  const missing = useMemo(() => routes.filter(r => !r.hasCoords), [routes])
  const noHits = Boolean(searchQuery.trim()) && !routes.some(r => matchesSearch(r.ticket, searchQuery))
  const hoveredRoute = routes.find(r => r.id === hovered)
  return <div className="ticket-map-root" data-testid="ticket-map-home">
    <div ref={canvas} className="ticket-map-canvas" />
    {map && <><MapFrame map={map} routes={mapped} fitRequest={fitRequest} /><RouteLayers map={map} routes={mapped} query={searchQuery} hovered={hovered} onHover={setHovered} /><PhotoMarkers map={map} routes={mapped} query={searchQuery} onHover={setHovered} /></>}
    {tileError && <div className="map-notice" role="status">底图暂时无法加载，票据和轨迹仍可浏览。请检查网络后刷新。</div>}
    {noHits && <div className="map-feedback" role="status">没有匹配的票<button onClick={() => useTicketStore.getState().setSearchQuery('')}>清除搜索</button></div>}
    {hoveredRoute && <div className="route-tooltip"><strong>{formatRoute(hoveredRoute.ticket)}</strong><span>{hoveredRoute.ticket.takenAt || '日期待核对'} · {hoveredRoute.ticket.track ? '已导入实际轨迹' : hoveredRoute.ticket.railRoute ? '铁路路网推算 · 待核对' : '仅标出站点 · 尚无线路'}</span></div>}
    {missing.length > 0 && <div className="unplaced-tickets"><button className="glass-button" aria-expanded={showUnplaced} onClick={() => setShowUnplaced(!showUnplaced)}>{missing.length} 张票待定位</button>{showUnplaced && <div className="unplaced-list">{missing.filter(r => matchesSearch(r.ticket, searchQuery)).map(r => <button key={r.id} onClick={() => openTicket(r.id)}><img src={r.ticket.thumbnailUrl} alt="" loading="lazy" /><span>{formatRoute(r.ticket)}<small>补充地点或导入轨迹</small></span></button>)}</div>}</div>}
  </div>
}
