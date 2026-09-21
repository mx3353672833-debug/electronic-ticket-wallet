"""Build a routable graph from OSM rail geometry. Never add invented gap edges.

Input is the HDX/HOT China railways GeoJSON ZIP (ODbL), not passenger schedules.
Output is private local cache. Nodes are actual OSM coordinates; edges retain
every intermediate vertex. Current track geometry does not prove a past service.
"""
import json, zipfile, math, sys, collections, pickle, os
from array import array

archive = sys.argv[1]
output = '.local-data/rail-network.pickle'
print('Reading OSM railway geometry', flush=True)
with zipfile.ZipFile(archive) as z:
    data = json.loads(z.read('railways.geojson'))
    metadata = json.loads(z.read('metadata.json'))

def key(p): return (round(p[0]*1e7), round(p[1]*1e7))
def coord(k): return (k[0]/1e7, k[1]/1e7)
def distance(a,b):
    return math.hypot((a[0]-b[0])*math.cos(math.radians((a[1]+b[1])/2)), a[1]-b[1])*111195

os.makedirs('.local-data',exist_ok=True)
stations = {}
for f in data['features']:
    p,g=f['properties'],f['geometry'];name=p.get('name_zh') or p.get('name')
    if name and p.get('railway') in ('station','halt') and g['type']=='Point':
        stations.setdefault(name.removesuffix('站'),[]).append({'lng':g['coordinates'][0],'lat':g['coordinates'][1],'osmId':p['id'],'province':p.get('adm1_name'),'city':p.get('adm2_name')})
with open('.local-data/stations.json','w') as f:json.dump(stations,f,ensure_ascii=False)
manifest = json.load(open('.local-data/processing-manifest.json')) if os.path.exists('.local-data/processing-manifest.json') else []
wanted = {r['fields'].get(k) for r in manifest if 'fields' in r for k in ('departure','arrival')}
# Index stations actually requested by this private collection, not a maintainer's itinerary.
station_candidates = {n: stations[n] for n in wanted if n in stations}
station_grid = collections.defaultdict(list)
for name, places in station_candidates.items():
    for i,p in enumerate(places):
        x,y=int(p['lng']*50),int(p['lat']*50)
        for dx in (-1,0,1):
            for dy in (-1,0,1): station_grid[(x+dx,y+dy)].append((name,i,p))
nearest = {}
lines=[]; junctions=set()
for f in data['features']:
    p,g = f['properties'], f['geometry']
    if p.get('railway') != 'rail' or g['type']!='LineString': continue
    coordinates=g['coordinates']
    if len(coordinates)<2: continue
    junctions.update((key(coordinates[0]),key(coordinates[-1])))
    packed=array('d',(v for xy in coordinates for v in xy[:2]))
    lines.append((packed,p.get('name') or p.get('name_zh') or '',p['id']))
    for xy in coordinates:
        for name,i,station in station_grid.get((int(xy[0]*50),int(xy[1]*50)),[]):
            d=distance(xy,(station['lng'],station['lat']))
            k=(name,i)
            if d < 1500 and (k not in nearest or d<nearest[k][0]): nearest[k]=(d,key(xy))
del data
junctions.update(v[1] for v in nearest.values())
nodes=list(junctions); index={k:i for i,k in enumerate(nodes)}; adjacency=[[] for _ in nodes]; edges=[]
for packed,name,osm_id in lines:
    coords=list(zip(packed[::2],packed[1::2])); start=0
    for j in range(1,len(coords)):
        k=key(coords[j])
        if k not in junctions: continue
        a=index[key(coords[start])]; b=index[k]; geometry=coords[start:j+1]
        length=sum(distance(x,y) for x,y in zip(geometry,geometry[1:])); start=j
        if a==b or length==0: continue
        eid=len(edges); edges.append((a,b,length,name,osm_id,array('d',(v for xy in geometry for v in xy))))
        adjacency[a].append((b,eid)); adjacency[b].append((a,eid))
del lines
snaps={}
for (name,i),(d,k) in nearest.items(): snaps.setdefault(name,[]).append((index[k],d,station_candidates[name][i]))
network={'nodes':[coord(k) for k in nodes],'adj':adjacency,'edges':edges,'stations':snaps,'metadata':metadata}
with open(output,'wb') as f: pickle.dump(network,f,pickle.HIGHEST_PROTOCOL)
print(json.dumps({'nodes':len(nodes),'edges':len(edges),'stations':len(snaps),'cacheMB':round(os.path.getsize(output)/1048576,1)}),flush=True)
