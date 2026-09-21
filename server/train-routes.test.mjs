import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {createRoutePlanner,routeInput,selectStops} from './train-routes.mjs'

const ticket={type:'train',takenAt:'2026-09-21',carrierOrTrainNo:'G1',departure:{name:'甲站'},arrival:{name:'丙站'}}
const schedule=(names=['甲','乙','丙'],train='G1',day=0)=>({numberFull:[train],rundays:[],timetable:names.map(station=>({station,day,trainCode:train}))})
const geometry={segments:[[[110,30],[111,31]]],distanceKm:100,status:'timetable-constrained'}
async function fixture(t,respond) {
  const cacheDir=await fs.mkdtemp(path.join(os.tmpdir(),'train-routes-test-')),calls=[],computed=[]
  t.after(()=>fs.rm(cacheDir,{recursive:true,force:true}))
  const planner=createRoutePlanner({cacheDir,minInterval:0,compute:async input=>{computed.push(input);return geometry},fetchImpl:async url=>{
    calls.push(url);return respond?respond(new URL(url)):Response.json(url.includes('mapLine')?{data:{stations:[]}}:{data:schedule()})
  }})
  return {planner,calls,computed,cacheDir}
}
test('ordered slice, train aliases and malformed/reversed stops',()=>{
  assert.deepEqual(selectStops(schedule(['始','甲','乙','丙','终']),routeInput(ticket)).stops.map(s=>s.name),['甲','乙','丙'])
  for(const payload of [schedule(['丙','甲']),schedule(['甲','甲','丙']),schedule(['甲','丙'],'G2'),{timetable:[null,{}]}])assert.equal(selectStops(payload,routeInput(ticket)),null)
  for(const changes of [{track:{}},{type:'flight'},{processing:{documentKind:'refund'}},{takenAt:'2026-02-30'},{carrierOrTrainNo:'../../G1'}])assert.equal(routeInput({...ticket,...changes}),null)
  assert.equal(routeInput(null),null)
})
test('dated schedule passes ordered stops, caches by train/date and never sends ticket secrets',async t=>{
  const f=await fixture(t)
  const route=await f.planner({...ticket,story:'private-story',originalImageUrl:'private-photo',seat:'private-seat'})
  assert.equal(route.timetable.basis,'requested-date');assert.deepEqual(f.computed[0].stops,['甲','乙','丙'])
  assert.deepEqual(await f.planner(ticket),route);assert.equal(f.calls.length,2)
  assert(!f.calls.join(' ').includes('private-'))
  await f.planner({...ticket,takenAt:'2026-09-20'});assert.equal(f.calls.length,3)
  await f.planner({...ticket,carrierOrTrainNo:'G2'});assert.equal(f.calls.length,5)
  assert.equal((await fs.stat(path.join(f.cacheDir,'train-route-cache',(await fs.readdir(path.join(f.cacheDir,'train-route-cache')))[0]))).mode&0o777,0o600)
})
test('old date falls back to usable same-train schedule and converts station coordinates',async t=>{
  const f=await fixture(t,url=>url.pathname.includes('getTrainMain')?new Response('',{status:400}):Response.json(url.pathname.includes('mapLine')?{data:{stations:[{'甲':[116.42,39.9]}]}}:schedule()))
  const route=await f.planner({...ticket,takenAt:'2014-01-01'})
  assert.equal(route.timetable.basis,'available-schedule');assert.equal(route.timetable.serviceDate,null)
  assert.deepEqual(route.timetable.stops,['甲','乙','丙']);assert.notEqual(f.computed[0].positions.甲[0],116.42)
})
test('boarding after midnight queries the originating service day',async t=>{
  const f=await fixture(t,url=>Response.json(url.pathname.includes('mapLine')?{}:{data:schedule(['甲','乙','丙'],'G1',1)}))
  const route=await f.planner(ticket)
  assert.equal(route.timetable.serviceDate,'2026-09-20');assert(f.calls.some(url=>url.includes('date=20260920')))
})
test('rate limit aborts and cools down; missing stops never reach the router',async t=>{
  const limited=await fixture(t,()=>new Response('',{status:429}))
  await assert.rejects(limited.planner(ticket),{status:503});await assert.rejects(limited.planner(ticket),{status:503});assert.equal(limited.calls.length,1)
  const missing=await fixture(t,()=>Response.json(schedule(['甲','乙'])))
  assert.equal(await missing.planner(ticket),null);assert.equal(missing.computed.length,0)
  assert.equal(await missing.planner({...ticket,track:{}}),null);assert.equal(missing.calls.length,2)
})
