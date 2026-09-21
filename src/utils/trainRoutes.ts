import type {Ticket} from '../types/ticket'
import {getTicket,listTickets,updateTicket} from '../db/db'
import {REMOTE,remoteRequest} from './remote'
import type {ScanProgress} from './processTickets'

type RouteResult={status:'updated'|'not-found'|'skipped';railRoute?:Ticket['railRoute']}
export const canUpdateRoute=(ticket:Ticket)=>ticket.type==='train' && !ticket.track && ticket.processing?.documentKind!=='refund' && !!(ticket.carrierOrTrainNo && ticket.takenAt && ticket.departure?.name && ticket.arrival?.name)
export async function updateTrainRoute(ticket:Ticket):Promise<RouteResult> {
  if(REMOTE)return remoteRequest<RouteResult>(`/routes/${encodeURIComponent(ticket.id)}`,{method:'POST'})
  const response=await fetch('/__local/train-route',{method:'POST',headers:{'X-Ticket-Wallet':'1','Content-Type':'application/json'},body:JSON.stringify({type:ticket.type,takenAt:ticket.takenAt,carrierOrTrainNo:ticket.carrierOrTrainNo,departure:ticket.departure,arrival:ticket.arrival,track:ticket.track?{}:undefined,processing:{documentKind:ticket.processing?.documentKind}})})
  if(!response.ok)throw new Error('线路更新失败，请稍后重试')
  const result:RouteResult=await response.json()
  if(result.railRoute){
    const latest=await getTicket(ticket.id)
    if(!latest || !canUpdateRoute(latest) || latest.takenAt!==ticket.takenAt || latest.carrierOrTrainNo!==ticket.carrierOrTrainNo || latest.departure?.name!==ticket.departure?.name || latest.arrival?.name!==ticket.arrival?.name)throw new Error('票面信息已修改，请重新更新线路')
    await updateTicket(ticket.id,{railRoute:result.railRoute})
  }
  return result
}
export async function updateAllTrainRoutes(onProgress:(value:ScanProgress)=>void) {
  const tickets=(await listTickets()).filter(t=>!t.id.startsWith('mock-') && canUpdateRoute(t))
  const progress:ScanProgress={completed:0,total:tickets.length,current:'',failed:[],updated:0,unavailable:0}
  for(const ticket of tickets) {
    progress.current=ticket.carrierOrTrainNo || '车次';onProgress({...progress,failed:[...progress.failed]})
    try {const result=await updateTrainRoute(ticket);if(result.status==='updated')progress.updated!++;else progress.unavailable!++}
    catch(error){progress.failed.push({name:progress.current,error:error instanceof Error?error.message:'更新失败'})}
    progress.completed++;onProgress({...progress,failed:[...progress.failed]})
  }
  return progress
}
