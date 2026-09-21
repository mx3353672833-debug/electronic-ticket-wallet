"""Follow an ordered passenger stop sequence through the existing OSM rail graph."""
import json, math, heapq, re, sys, time
from collections import defaultdict
from rail_graph import load_graph


def distance(a, b):
    return math.hypot((a[0]-b[0])*math.cos(math.radians((a[1]+b[1])/2)), a[1]-b[1])*111195


class RailRouter:
    def __init__(self, network, places, positions=None):
        self.nodes, self.edges, self.adj = [network[k] for k in ('nodes', 'edges', 'adj')]
        self.stations = dict(network['stations'])
        self.places = places
        self.positions = positions or {}
        for name, point in self.positions.items():
            if name in self.stations:
                self.stations[name] = [hit for hit in self.stations[name] if distance(point, (hit[2]['lng'], hit[2]['lat'])) < 5000]
        self.grid = None

    def index_stops(self, names):
        # Stops may sit inside a long OSM way, far from its junction endpoints.
        # Snap to an actual geometry vertex and split that edge, never draw a gap.
        grid = defaultdict(list); nearest = {}; places_by_key = {}
        for name in names:
            point = self.positions.get(name)
            places = self.places.get(name) or ([{'lng': point[0], 'lat': point[1]}] if point else [])
            if point: places = [p for p in places if distance(point, (p['lng'], p['lat'])) < 5000] or [{'lng': point[0], 'lat': point[1]}]
            for j, place in enumerate(places):
                key = (name, j); xy = (place['lng'], place['lat']); places_by_key[key] = place
                x, y = int(xy[0]*50), int(xy[1]*50)
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1): grid[x+dx, y+dy].append((key, xy))
        if not grid: return
        for eid, edge in enumerate(self.edges):
            packed = edge[5]
            for j in range(0, len(packed), 2):
                xy = (packed[j], packed[j+1])
                for key, place in grid.get((int(xy[0]*50), int(xy[1]*50)), []):
                    d = distance(xy, place)
                    edge_key = (key, eid)
                    if d < 1500 and d < nearest.get(edge_key, (float('inf'),))[0]: nearest[edge_key] = (d, eid, j//2)
        cuts = defaultdict(dict)
        choices = defaultdict(list)
        for (key, _), hit in nearest.items(): choices[key].append(hit)
        for key, hits in choices.items():
            hits.sort(); limit = min(1500, max(350, hits[0][0]+120))
            # Multiple platform tracks can be disconnected in OSM. Keep nearby
            # rail candidates and let the connected stop-to-stop path choose.
            for d, eid, j in hits[:48]:
                if d <= limit: cuts[eid].setdefault(j, []).append((key, d))
        for eid, indexes in cuts.items():
            a, b, length, name, osm, packed = self.edges[eid]
            coords = list(zip(packed[::2], packed[1::2])); vertices = {0: a, len(coords)-1: b}
            for j in sorted(indexes):
                if j not in vertices:
                    vertices[j] = len(self.nodes); self.nodes.append(coords[j]); self.adj.append([])
                for key, d in indexes[j]: self.stations.setdefault(key[0], []).append((vertices[j], d, places_by_key[key]))
            self.adj[a] = [(v, e) for v, e in self.adj[a] if e != eid]
            self.adj[b] = [(v, e) for v, e in self.adj[b] if e != eid]
            ordered = sorted(vertices)
            for start, end in zip(ordered, ordered[1:]):
                u, v = vertices[start], vertices[end]; part = coords[start:end+1]
                metres = sum(distance(x, y) for x, y in zip(part, part[1:])); new_id = len(self.edges)
                self.edges.append((u, v, metres, name, osm, [x for xy in part for x in xy]))
                self.adj[u].append((v, new_id)); self.adj[v].append((u, new_id))

    def station_nodes(self, name):
        if name not in self.stations:
            if self.grid is None:
                self.grid = defaultdict(list)
                for i, (x, y) in enumerate(self.nodes):
                    self.grid[(int(x*50), int(y*50))].append(i)
            hits = []
            point = self.positions.get(name)
            places = self.places.get(name) or ([{'lng': point[0], 'lat': point[1]}] if point else [])
            for place in places:
                xy = (place['lng'], place['lat']); x, y = int(xy[0]*50), int(xy[1]*50)
                candidates = [(distance(xy, self.nodes[i]), i) for dx in (-1, 0, 1) for dy in (-1, 0, 1) for i in self.grid.get((x+dx, y+dy), [])]
                if candidates:
                    d, i = min(candidates)
                    if d < 1500: hits.append((i, d, place))
            self.stations[name] = hits
        hits = self.stations[name]
        if hits and any(distance((hits[0][2]['lng'], hits[0][2]['lat']), (p[2]['lng'], p[2]['lat'])) > 15000 for p in hits[1:]):
            return []
        return list(dict.fromkeys(p[0] for p in hits))

    def leg(self, sources, targets, high_speed):
        dist = {s: 0 for s in sources}; prev = {}; queue = [(0, s) for s in sources]; heapq.heapify(queue)
        target = None
        while queue:
            d, u = heapq.heappop(queue)
            if d != dist.get(u): continue
            if u in targets: target = u; break
            for v, eid in self.adj[u]:
                a, b, length, name, _, _ = self.edges[eid]
                if re.search(r'货车|货运|货线|专用线|机\d|检修|存车|牵出|调车|到发线|机走|走行线|小运转', name): continue
                hsr = any(s in name for s in ('高速', '客运专线', '客专', '城际', '高铁'))
                if hsr and not high_speed: continue
                nd = d + length*(1 if not high_speed or hsr else 1.45)*(1.12 if not name else 1)
                if nd < dist.get(v, float('inf')):
                    dist[v] = nd; prev[v] = (u, eid); heapq.heappush(queue, (nd, v))
        if target is None: return None
        path = []; u = target
        while u in prev:
            v, eid = prev[u]; path.append((v, u, eid)); u = v
        return list(reversed(path)), target

    def route(self, stops, train):
        if not 2 <= len(stops) <= 100: return None
        self.index_stops(stops)
        station_nodes = [self.station_nodes(s) for s in stops]
        if any(not nodes for nodes in station_nodes): return None
        high_speed = train.startswith(('G', 'D', 'C'))
        sources = station_nodes[0]; path = []; stop_points = []
        for targets in station_nodes[1:]:
            leg = self.leg(sources, set(targets), high_speed)
            if leg is None: return None
            part, target = leg
            if not stop_points: stop_points.append(self.nodes[part[0][0] if part else target])
            stop_points.append(self.nodes[target]); path.extend(part)
            # Continue from the exact node reached, not another platform's disconnected rail.
            sources = [target]
        points = []; names = []; ids = []; metres = 0
        for u, v, eid in path:
            a, b, length, name, osm, packed = self.edges[eid]
            coords = list(zip(packed[::2], packed[1::2]))
            if u != a: coords.reverse()
            if points and points[-1] != coords[0]: return None
            points.extend(coords if not points else coords[1:]); metres += length; ids.append(str(osm))
            if name and name not in names: names.append(name)
        # Compare with the stop sequence, not just the endpoints: a service may intentionally detour.
        straight = sum(distance(a, b) for a, b in zip(stop_points, stop_points[1:]))
        if len(points) < 2 or metres > max(15000, straight*3): return None
        return {'segments': [points], 'source': 'osm-rail', 'status': 'timetable-constrained', 'from': stops[0], 'to': stops[-1],
                'distanceKm': round(metres/1000, 2), 'lineNames': names, 'osmWays': list(dict.fromkeys(ids)),
                'datasetDate': '2026-05-12', 'attribution': '© OpenStreetMap contributors · ODbL · HOT/HDX',
                'sourceUrl': 'https://data.humdata.org/dataset/hotosm_chn_railways',
                'computedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}


if __name__ == '__main__':
    # Only load the operator's trusted local graph, never an uploaded pickle.
    graph = load_graph(sys.argv[1])
    with open(sys.argv[2]) as f: places = json.load(f)
    request = json.load(sys.stdin)
    router = RailRouter(graph, places, request.get('positions'))
    print(json.dumps(router.route(request['stops'], request['train']), ensure_ascii=False))
