import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import {feature} from 'topojson-client'
import type {Topology,GeometryCollection} from 'topojson-specification'
import land from 'world-atlas/land-110m.json'
import { useTicketStore } from '../store/useTicketStore'
import { formatRoute, matchesSearch, yearScopedTickets } from '../utils/search'
import { ticketRoute } from '../utils/geo'
import type { TicketRoute } from '../utils/geo'
import { createRouteGeometry, geometryLevel } from '../utils/mapGeometry'
import {warmTicketImage} from '../utils/displayImages'

const baseLand=feature(land as unknown as Topology<{land:GeometryCollection}>,'land')
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches

function PhotoMarkers({ map, routes, query, onHover }: { map: L.Map; routes: TicketRoute[]; query: string; onHover: (id: string | null) => void }) {
  const currentQuery = useRef(query)
  const clusterGroup = useRef<L.MarkerClusterGroup | null>(null)
  const markers = useRef<{ ticket: TicketRoute['ticket']; marker: L.Marker; shell: HTMLDivElement }[]>([])
  useEffect(() => {
    const group = L.markerClusterGroup({ animate: !reducedMotion(), animateAddingMarkers: false, maxClusterRadius: 65, showCoverageOnHover: false, spiderfyOnMaxZoom: false, zoomToBoundsOnClick: false, removeOutsideVisibleBounds: true,
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
        shell.classList.toggle('is-dimmed', Boolean(currentQuery.current) && !children.some(m => (m.options as L.MarkerOptions & { match?: boolean }).match))
        return L.divIcon({ html: shell, className: 'photo-cluster-marker', iconSize: [130, 86], iconAnchor: [65, 90] })
      },
    })
    clusterGroup.current = group
    markers.current = []
    for (const route of routes) {
      if (!route.mid) continue
      const ticket = route.ticket
      const match = matchesSearch(ticket, currentQuery.current)
      const shell = document.createElement('div')
      shell.className = `map-photo ${currentQuery.current ? match ? 'is-matched' : 'is-dimmed' : ''}`
      // Native DOM avoids shipping React's server renderer to every map visitor.
      const face=L.DomUtil.create('div','map-photo-face',shell)
      const image=L.DomUtil.create('img','real-ticket',face) as HTMLImageElement
      image.src=ticket.thumbnailUrl;image.alt=formatRoute(ticket)+' 票面';image.draggable=false;image.decoding='async'
      const caption=L.DomUtil.create('span','map-photo-caption',shell)
      caption.textContent=`${ticket.departure?.name || '待核对'} → ${ticket.arrival?.name || '待核对'}`
      L.DomUtil.create('span',`map-photo-dot ${ticket.track || ticket.railRoute ? 'has-track' : ''}`,shell)
      const marker = L.marker([route.mid.lat, route.mid.lng], { icon: L.divIcon({ html: shell, className: 'photo-marker', iconSize: [130, 86], iconAnchor: [65, 90] }), keyboard: true, title: `${formatRoute(ticket)} ${ticket.takenAt || '日期待补'}`, alt: formatRoute(ticket), riseOnHover: true, match } as L.MarkerOptions)
      marker.on('click', () => useTicketStore.getState().openTicket(ticket.id,marker.getElement()?.querySelector('img')))
      marker.on('mouseover', () => {onHover(ticket.id);warmTicketImage(ticket.processedImageUrl)})
      marker.on('mouseout', () => onHover(null))
      markers.current.push({ ticket, marker, shell })
    }
    group.addLayers(markers.current.map(value => value.marker))
    group.on('clusterclick',event=>{
      const cluster=(event as L.LeafletEvent & {layer:L.MarkerCluster}).layer
      if(map.getZoom()>=18){cluster.spiderfy();return}
      map.stop()
      const options={padding:L.point(80,110),maxZoom:18}
      if(reducedMotion())map.fitBounds(cluster.getBounds(),{...options,animate:false})
      else map.flyToBounds(cluster.getBounds(),{...options,duration:.58,easeLinearity:.22})
    })
    map.addLayer(group)
    return () => { map.removeLayer(group); group.clearLayers(); clusterGroup.current = null; markers.current = []; onHover(null) }
  }, [map, routes, onHover])
  useEffect(() => {
    currentQuery.current = query
    for (const { ticket, marker, shell } of markers.current) {
      const match = matchesSearch(ticket, query)
      L.setOptions(marker, { match })
      shell.classList.toggle('is-matched', Boolean(query) && match)
      shell.classList.toggle('is-dimmed', Boolean(query) && !match)
    }
    clusterGroup.current?.refreshClusters()
  }, [query, routes])
  return null
}

function MapFrame({ map, routes, fitRequest }: { map: L.Map; routes: TicketRoute[]; fitRequest: number }) {
  const initialized=useRef(false)
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
      const options:L.FitBoundsOptions={paddingTopLeft: compact ? [55,160] : [130,130],paddingBottomRight:[compact?55:130,trayClearance+5],maxZoom:11}
      if(initialized.current&&!reducedMotion())map.flyToBounds([[south,west],[north,east]],{...options,duration:.55})
      else map.fitBounds([[south,west],[north,east]],{...options,animate:false})
      initialized.current=true
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
  const rendered = useRef<{ route: TicketRoute; lines: L.Polyline[]; stops: L.CircleMarker[]; geometry: ReturnType<typeof createRouteGeometry> }[]>([])
  const paints = useRef(new Map<string, string>())
  useEffect(() => {
    const group = L.layerGroup().addTo(map)
    // Canvas's native hit tolerance widens interaction without duplicating route geometry.
    const renderer=L.canvas({tolerance:11,padding:.35}).addTo(map)
    paints.current.clear()
    rendered.current = routes.map(route => {
      const line = route.ticket.track || route.ticket.railRoute
      const geometry = createRouteGeometry(line?.segments || [])
      const lines = geometry(map.getZoom()).map(segment => L.polyline(segment, { renderer,smoothFactor: .5, lineCap: 'round' })
        .on('click', () => useTicketStore.getState().openTicket(route.id))
        .on('mouseover', () => onHover(route.id))
        .on('mouseout', () => onHover(null)).addTo(group))
      const stops = [route.from, route.to].filter((p): p is NonNullable<typeof p> => Boolean(p)).map(p => L.circleMarker([p.lat, p.lng], { renderer,interactive:false,color:'#fff', weight:1.5 }).addTo(group))
      return { route, lines, stops, geometry }
    })
    let level = geometryLevel(map.getZoom())
    const refreshGeometry = () => {
      const nextLevel = geometryLevel(map.getZoom())
      if (level === nextLevel) return
      level = nextLevel
      for (const { geometry, lines } of rendered.current) {
        const segments = geometry(map.getZoom())
        lines.forEach((line, index) => line.setLatLngs(segments[index]))
      }
    }
    map.on('zoomend', refreshGeometry)
    return () => { map.off('zoomend', refreshGeometry); map.removeLayer(group); group.clearLayers();map.removeLayer(renderer); rendered.current = [] }
  }, [map, routes, onHover])
  useEffect(() => {
    // Hover changes only paint, not geometry or the element under the pointer.
    for (const item of rendered.current) {
      const {route,lines,stops} = item
      const dimmed = Boolean(query) && !matchesSearch(route.ticket, query)
      const active = hovered === route.id || (Boolean(query) && !dimmed)
      const color = route.ticket.track ? '#248a3d' : '#007aff'
      const paint = `${dimmed}:${active}:${color}`
      if (paints.current.get(route.id) === paint) continue
      paints.current.set(route.id, paint)
      lines.forEach(line => line.setStyle({color,weight:active ? 4.5 : 2.5,opacity:dimmed ? .07 : active ? 1 : .55}))
      stops.forEach(stop => { stop.setRadius(active ? 5 : 3); stop.setStyle({fillColor:color,fillOpacity:dimmed ? .2 : 1,opacity:dimmed ? .2 : 1}) })
    }
  }, [map, routes, query, hovered])
  return null
}

export function TicketMap({ fitRequest = 0, showPhotos = true }: { fitRequest?: number; showPhotos?: boolean }) {
  const { tickets, searchQuery, yearRange, openTicket } = useTicketStore()
  const [hovered, setHovered] = useState<string | null>(null)
  const [tileError, setTileError] = useState(false)
  const [showUnplaced, setShowUnplaced] = useState(false)
  const canvas = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<L.Map | null>(null)
  useEffect(() => {
    const instance = L.map(canvas.current!, {center:[34.5,112],zoom:4,minZoom:2,maxZoom:19,zoomSnap:1,zoomDelta:1,zoomControl:false,scrollWheelZoom:true,wheelDebounceTime:55,wheelPxPerZoomLevel:100,preferCanvas:true,zoomAnimation:!reducedMotion(),fadeAnimation:!reducedMotion(),inertia:true,inertiaDeceleration:2400})
    instance.createPane('map-base').style.zIndex='150'
    L.geoJSON(baseLand,{pane:'map-base',interactive:false,style:{stroke:false,fillColor:'#f3f4f2',fillOpacity:1},attribution:'<a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Natural Earth</a>'}).addTo(instance)
    let failures=0
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {updateWhenIdle:false,updateInterval:120,updateWhenZooming:false,keepBuffer:4,maxNativeZoom:19,maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · 经停数据 <a href="https://railgo.dev/" target="_blank" rel="noreferrer">RailGo</a>'})
      .on('loading',()=>{failures=0}).on('tileerror', () => {failures++}).on('load',()=>setTileError(failures>0)).addTo(instance)
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
    {map && <><MapFrame map={map} routes={mapped} fitRequest={fitRequest} /><RouteLayers map={map} routes={mapped} query={searchQuery} hovered={hovered} onHover={setHovered} />{showPhotos && <PhotoMarkers map={map} routes={mapped} query={searchQuery} onHover={setHovered} />}</>}
    {tileError && <div className="map-notice" role="status">底图暂时无法加载，票据和轨迹仍可浏览。请检查网络后刷新。</div>}
    {noHits && <div className="map-feedback" role="status">没有匹配的票<button onClick={() => useTicketStore.getState().setSearchQuery('')}>清除搜索</button></div>}
    {hoveredRoute && <div className="route-tooltip"><strong>{formatRoute(hoveredRoute.ticket)} · {hoveredRoute.ticket.carrierOrTrainNo || '车次待补'}</strong><span>{hoveredRoute.ticket.takenAt || '日期待补'}{hoveredRoute.ticket.railRoute?.timetable && !hoveredRoute.ticket.track ? ` · ${hoveredRoute.ticket.railRoute.timetable.stops.length} 站` : ''}</span></div>}
    {missing.length > 0 && <div className="unplaced-tickets"><button className="glass-button" aria-expanded={showUnplaced} onClick={() => setShowUnplaced(!showUnplaced)}>{missing.length} 张票待定位</button>{showUnplaced && <div className="unplaced-list">{missing.filter(r => matchesSearch(r.ticket, searchQuery)).map(r => <button key={r.id} onClick={() => openTicket(r.id)}><img src={r.ticket.thumbnailUrl} alt="" loading="lazy" /><span>{formatRoute(r.ticket)}<small>补充地点或导入轨迹</small></span></button>)}</div>}</div>}
  </div>
}
