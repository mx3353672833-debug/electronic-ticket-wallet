"""Shortest paths on connected OSM rail tracks, explicitly unverified itineraries."""
import pickle,json,heapq,sys,math,time,re
from pathlib import Path

with open('.local-data/rail-network.pickle','rb') as f: network=pickle.load(f)
nodes,edges,adj,stations=[network[k] for k in ('nodes','edges','adj','stations')]

def route(start,end,train):
    if start==end or start not in stations or end not in stations: return None
    def distinct(places):
        if len(places)<2:return False
        a=places[0][2]
        return any(abs(a['lng']-p[2]['lng'])+abs(a['lat']-p[2]['lat'])>.15 for p in places[1:])
    if distinct(stations[start]) or distinct(stations[end]): return None
    sources=[p[0] for p in stations[start]]; targets={p[0] for p in stations[end]}
    dist={s:0 for s in sources}; prev={}; queue=[(0,s) for s in sources]; heapq.heapify(queue); target=None
    high_speed=train.startswith(('G','D','C'))
    while queue:
        d,u=heapq.heappop(queue)
        if d!=dist.get(u):continue
        if u in targets: target=u;break
        for v,eid in adj[u]:
            a,b,length,name,_,_=edges[eid]
            if re.search(r'货车|货运|货线|专用线|机\d|检修|存车|牵出|调车|到发线|机走|走行线|小运转',name):continue
            hsr=any(s in name for s in ('高速','客运专线','客专','城际','高铁'))
            # Ordinary passenger trains cannot be routed over passenger-only HSR.
            if not high_speed and hsr:continue
            weight=length*(1 if not high_speed or hsr else 1.45)*(1.12 if not name else 1)
            nd=d+weight
            if nd<dist.get(v,float('inf')):
                dist[v]=nd;prev[v]=(u,eid);heapq.heappush(queue,(nd,v))
    if target is None:return None
    path=[];u=target
    while u in prev:
        v,eid=prev[u];path.append((v,u,eid));u=v
    path.reverse();points=[];names=[];ids=[];metres=0
    for u,v,eid in path:
        a,b,length,name,osm,packed=edges[eid];cs=list(zip(packed[::2],packed[1::2]))
        if u!=a:cs.reverse()
        # A shared node must be precisely equal; never interpolate a gap.
        if points and points[-1]!=cs[0]:raise ValueError('Disconnected geometry')
        points.extend(cs if not points else cs[1:]);metres+=length;ids.append(osm)
        if name and name not in names:names.append(name)
    if len(points)<3:return None
    a,b=points[0],points[-1];direct=math.hypot((a[0]-b[0])*math.cos(math.radians((a[1]+b[1])/2)),a[1]-b[1])*111195
    if metres>max(12000,direct*3):return None
    return {'segments':[points],'source':'osm-rail','status':'network-estimate','from':start,'to':end,'distanceKm':round(metres/1000,2),'lineNames':names,'osmWays':list(dict.fromkeys(ids)),'datasetDate':'2026-05-12','attribution':'© OpenStreetMap contributors · ODbL · HOT/HDX','sourceUrl':'https://data.humdata.org/dataset/hotosm_chn_railways','computedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}

if len(sys.argv)>2:
    print(json.dumps(route(sys.argv[1],sys.argv[2],sys.argv[3] if len(sys.argv)>3 else ''),ensure_ascii=False))
else:
    m=json.load(open('.local-data/processing-manifest.json'));result={}
    for r in m:
        f=r.get('fields',{});a,b,t=f.get('departure'),f.get('arrival'),f.get('trainNo') or ''
        if not a or not b or f.get('documentKind')!='ticket':continue
        k=f'{a}|{b}|'+('high-speed' if t.startswith(('G','D','C')) else 'conventional')
        if k not in result:result[k]=route(a,b,t);print(f'Routes {len(result)} mapped {sum(v is not None for v in result.values())}',flush=True)
    Path('.local-data/routes.json').write_text(json.dumps(result,ensure_ascii=False))
