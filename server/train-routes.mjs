import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {execFile} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {atomicJson,failure} from './private-store.mjs'
import gcoord from 'gcoord'

const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
const cleanStation=value=>typeof value==='string'?value.trim().replace(/(?:火车站|站)$/u,''):''
const validDate=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value
export function routeInput(ticket) {
  if(!ticket || typeof ticket!=='object')return null
  const train=String(ticket.carrierOrTrainNo||'').trim().toUpperCase().split('/')[0]
  const from=cleanStation(ticket.departure?.name),to=cleanStation(ticket.arrival?.name)
  if(ticket.track || ticket.type!=='train' || ticket.processing?.documentKind==='refund' || !/^[GDCZTKYSL]?\d{1,5}$/.test(train) || !from || !to || from===to || from.length>40 || to.length>40 || !validDate(ticket.takenAt))return null
  return {train,date:ticket.takenAt,from,to}
}
export const routeSignature=ticket=>JSON.stringify(routeInput(ticket))

export function selectStops(payload,input) {
  const data=payload?.data || payload
  if(!data || !Array.isArray(data.timetable) || data.timetable.length<2 || data.timetable.length>100)return null
  const aliases=Array.isArray(data.numberFull)?data.numberFull:[]
  if(data.timetable.some(s=>!s || typeof s!=='object'))return null
  if(![...aliases,...data.timetable.map(s=>s.trainCode)].some(code=>String(code).toUpperCase()===input.train))return null
  const stops=data.timetable.map(s=>({name:cleanStation(s.station),day:Number(s.day)||0,arrive:s.arrive,depart:s.depart}))
  if(stops.some(s=>!s.name || s.name.length>40 || !Number.isInteger(s.day) || s.day<0 || s.day>10))return null
  const pairs=[]
  for(let a=0;a<stops.length;a++)if(stops[a].name===input.from)for(let b=a+1;b<stops.length;b++)if(stops[b].name===input.to)pairs.push([a,b])
  if(pairs.length!==1)return null
  const [a,b]=pairs[0]
  return {stops:stops.slice(a,b+1),boardingDay:stops[a].day,runDays:Array.isArray(data.rundays)?data.rundays.filter(d=>/^\d{8}$/.test(d)):[]}
}

export function createRoutePlanner({cacheDir,fetchImpl=fetch,now=()=>Date.now(),compute,minInterval=1500}={}) {
  const directory=path.join(cacheDir,'train-route-cache')
  let graph=path.join(cacheDir,'rail-network.rgraph')
  let queue=Promise.resolve(),pending=0,nextRequest=0,cooldown=0
  const read=async key=>{
    try{const item=JSON.parse(await fs.readFile(path.join(directory,key+'.json'),'utf8'));return item.expires>now()?item.value:undefined}catch{return undefined}
  }
  const write=async(key,value,ttl)=>{
    await fs.mkdir(directory,{recursive:true,mode:0o700})
    // Shared derived cache has a hard entry budget; never evict or modify user originals.
    const entries=await fs.readdir(directory)
    if(entries.length<2000 || entries.includes(key+'.json'))await atomicJson(path.join(directory,key+'.json'),{expires:now()+ttl,value})
    return value
  }
  async function query(url,key,maxBytes=1048576) {
    const cached=await read(key);if(cached!==undefined)return cached
    if(cooldown>now())throw failure(503,'线路服务暂时繁忙，请稍后重试')
    const delay=nextRequest-now();if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay))
    nextRequest=now()+minInterval
    let res
    try{res=await fetchImpl(url,{signal:AbortSignal.timeout(10000),redirect:'error',headers:{Accept:'application/json'}})}catch{throw failure(502,'线路查询暂时失败，请稍后重试')}
    if(res.status===429 || res.status===403){cooldown=now()+60000;throw failure(503,'线路服务暂时繁忙，请稍后重试')}
    if(res.status===400 || res.status===404)return write(key,null,86400000)
    if(!res.ok)throw failure(502,'线路查询暂时失败，请稍后重试')
    const chunks=[];let bytes=0
    for await(const chunk of res.body){bytes+=chunk.length;if(bytes>maxBytes)throw failure(502,'线路数据过大');chunks.push(chunk)}
    let value;try{value=JSON.parse(Buffer.concat(chunks).toString())}catch{throw failure(502,'线路数据格式错误')}
    return write(key,value,86400000)
  }
  const run=compute || (input=>new Promise((resolve,reject)=>{
    const child=execFile(process.env.WALLET_PYTHON||'python3',[fileURLToPath(new URL('../scripts/rail-itinerary.py',import.meta.url)),graph,path.join(cacheDir,'stations.json')],{timeout:60000,maxBuffer:12*1048576},(error,stdout)=>{
      if(error)return reject(failure(503,'线路计算暂时失败，请稍后重试'))
      try{resolve(JSON.parse(stdout))}catch{reject(failure(502,'线路计算结果有误'))}
    });child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(input))
  }))
  async function resolveTicket(ticket) {
    const input=routeInput(ticket);if(!input)return null
    let graphVersion='test'
    if(!compute){
      try{await fs.access(path.join(cacheDir,'rail-network.rgraph'));graph=path.join(cacheDir,'rail-network.rgraph')}catch{graph=path.join(cacheDir,'rail-network.pickle')}
      try{const stat=await fs.stat(graph);graphVersion=stat.size+':'+stat.mtimeMs}catch{return null}
    }
    const key=hash(['route-v6',graphVersion,input]),cached=await read(key)
    if(cached!==undefined)return cached
    const dated=await query('https://rg-api.zenglingkun.cn/api/v2/getTrainMain?'+new URLSearchParams({trainNum:input.train,date:input.date.replaceAll('-','')}),hash(['dated',input.train,input.date]))
    let selected=selectStops(dated,input),basis='requested-date',serviceDate=input.date
    if(selected?.runDays.length && !selected.runDays.includes(input.date.replaceAll('-','')))selected=null
    // A boarding date may be later than the train's originating date.
    if(selected?.boardingDay) {
      serviceDate=new Date(Date.parse(input.date+'T00:00:00Z')-selected.boardingDay*86400000).toISOString().slice(0,10)
      selected=selectStops(await query('https://rg-api.zenglingkun.cn/api/v2/getTrainMain?'+new URLSearchParams({trainNum:input.train,date:serviceDate.replaceAll('-','')}),hash(['dated',input.train,serviceDate])),input)
      if(selected && ((selected.runDays.length && !selected.runDays.includes(serviceDate.replaceAll('-',''))) || new Date(Date.parse(serviceDate+'T00:00:00Z')+selected.boardingDay*86400000).toISOString().slice(0,10)!==input.date))selected=null
    }
    if(!selected){selected=selectStops(await query('https://data.railgo.zenglingkun.cn/api/train/query?'+new URLSearchParams({train:input.train}),hash(['available',input.train])),input);basis='available-schedule';serviceDate=null}
    if(!selected)return write(key,null,3600000)
    const names=selected.stops.map(s=>s.name)
    const positions={}
    // Station renames need not match the OSM station name. Use the provider's station
    // coordinates as a fallback, converting GCJ-02 before matching WGS84 tracks.
    let map
    try{map=await query('https://rg-api.zenglingkun.cn/api/v2/mapLine?'+new URLSearchParams({train:input.train}),hash(['station-coordinates',input.train]),8*1048576)}catch(error){if(error.status===503)throw error}
    for(const entry of (Array.isArray(map?.data?.stations)?map.data.stations:[]).slice(0,100))for(const [name,xy] of Object.entries(entry)) {
      if(names.includes(cleanStation(name)) && Array.isArray(xy) && xy.length===2 && xy.every(Number.isFinite) && xy[0]>=70 && xy[0]<=140 && xy[1]>=15 && xy[1]<=55)positions[cleanStation(name)]=gcoord.transform(xy,gcoord.GCJ02,gcoord.WGS84)
    }
    const geometryKey=hash(['geometry-v6',graphVersion,input.train,names,positions])
    let route=await read(geometryKey)
    if(route===undefined){route=await run({stops:names,train:input.train,positions});await write(geometryKey,route,route?7*86400000:3600000)}
    if(!route)return write(key,null,3600000)
    const result={...route,timetable:{provider:'RailGo',sourceUrl:'https://railgo.dev/',trainNo:input.train,travelDate:input.date,serviceDate,basis,stops:names,queriedAt:new Date(now()).toISOString()},requestKey:hash(input)}
    return write(key,result,7*86400000)
  }
  return ticket=>{
    if(pending>=8)return Promise.reject(failure(429,'线路正在更新，请稍后重试'))
    pending++
    const task=queue.then(()=>resolveTicket(ticket));queue=task.catch(()=>{})
    return task.finally(()=>{pending--})
  }
}
