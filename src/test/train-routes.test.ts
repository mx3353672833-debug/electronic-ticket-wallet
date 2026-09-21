import {beforeEach,afterEach,expect,it,vi} from 'vitest'
import {db} from '../db/db'
import {mockTickets} from '../data/mockTickets'
import {updateAllTrainRoutes,updateTrainRoute} from '../utils/trainRoutes'
import type {Ticket} from '../types/ticket'
const route:Ticket['railRoute']={segments:[[[110,30],[111,31]]],source:'osm-rail',status:'timetable-constrained',from:'甲',to:'乙',distanceKm:100,lineNames:[],osmWays:[],datasetDate:'2026-05-12',attribution:'OSM',sourceUrl:'https://example.com',computedAt:'2026-09-21'}
beforeEach(async()=>{await db.tickets.clear()})
afterEach(()=>vi.unstubAllGlobals())
it('updates only the route while preserving story and persistent image references',async()=>{
  const ticket={...mockTickets[0],id:'user-route',story:'keep me'};await db.tickets.put(ticket)
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({status:'updated',railRoute:route})))
  await updateTrainRoute(ticket)
  expect(await db.tickets.get(ticket.id)).toMatchObject({story:ticket.story,originalImageUrl:ticket.originalImageUrl,railRoute:route})
})
it('does not write an outdated result after concurrent metadata changes',async()=>{
  const ticket={...mockTickets[0],id:'user-route'};await db.tickets.put(ticket)
  vi.stubGlobal('fetch',vi.fn(async()=>{await db.tickets.update(ticket.id,{takenAt:'2020-01-01'});return Response.json({status:'updated',railRoute:route})}))
  await expect(updateTrainRoute(ticket)).rejects.toThrow('票面信息已修改')
  expect((await db.tickets.get(ticket.id))?.railRoute).toBeUndefined()
})
it('bulk update skips imported tracks and reports unavailable results without erasing routes',async()=>{
  const ticket={...mockTickets[0],id:'user-route',railRoute:route};await db.tickets.bulkPut([ticket,{...ticket,id:'user-gpx',track:{source:'gpx',filename:'test.gpx',importedAt:'2026-09-21',segments:[[[110,30],[111,31]]]}}])
  const request=vi.fn(async()=>Response.json({status:'not-found'}));vi.stubGlobal('fetch',request)
  const result=await updateAllTrainRoutes(()=>{})
  expect(result).toMatchObject({total:1,completed:1,updated:0,unavailable:1,failed:[]});expect(request).toHaveBeenCalledTimes(1)
  expect((await db.tickets.get(ticket.id))?.railRoute).toEqual(route)
})
it('waits and retries the same ticket after a temporary rate limit',async()=>{
  await db.tickets.put({...mockTickets[0],id:'user-route'})
  const request=vi.fn().mockResolvedValueOnce(Response.json({error:'服务繁忙',retryAfter:0.001},{status:503})).mockResolvedValueOnce(Response.json({status:'updated',railRoute:route}))
  vi.stubGlobal('fetch',request);const messages:string[]=[]
  const result=await updateAllTrainRoutes(progress=>messages.push(progress.current))
  expect(result.updated).toBe(1);expect(result.failed).toEqual([]);expect(request).toHaveBeenCalledTimes(2)
  expect(messages.some(message=>message.includes('服务繁忙'))).toBe(true)
})
