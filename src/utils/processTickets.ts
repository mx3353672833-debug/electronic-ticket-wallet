import { db, getImageBlob, imageIdFromUrl, toIdbImageUrl, listTickets } from '../db/db'
import { REMOTE, remoteRequest } from './remote'
import type { Ticket, Place } from '../types/ticket'
import type { RecognizedTicket } from './recognition'

export type ProcessingResult = {
  sha256: string; version: number; cropped: boolean; corners: [number,number][]; rotation: number
  fields: RecognizedTicket; departure: Place | null; arrival: Place | null; railRoute?: Ticket['railRoute']
}
const headers = { 'X-Ticket-Wallet': '1' }
async function checked(response: Response) {
  if (!response.ok) throw new Error(response.status === 404 ? '本机扫描服务不可用，请在这台 Mac 上启动项目后重试' : '扫描失败，原图已保留')
  return response
}
export async function requestScan(file: Blob): Promise<ProcessingResult> {
  const response = await checked(await fetch('/__local/process', { method:'POST', headers, body:file }))
  return response.json()
}

export async function applyScan(id: string, result: ProcessingResult): Promise<void> {
  const { sha256, fields } = result
  const [processed, thumbnail] = await Promise.all(['processed','thumbnail'].map(async kind => (await checked(await fetch(`/__local/scans/${sha256}/${kind}`,{ headers }))).arrayBuffer()))
  const now = new Date().toISOString()
  const processedId = `scan-v${result.version}-${sha256}`, thumbnailId = `scan-thumb-v${result.version}-${sha256}`
  await db.transaction('rw', db.tickets, db.images, async () => {
    const ticket = await db.tickets.get(id)
    if (!ticket) throw new Error('照片已不存在')
    const preserve = ticket.processing?.reviewed
    const departure = preserve ? ticket.departure : ticket.departure || result.departure
    const arrival = preserve ? ticket.arrival : ticket.arrival || result.arrival
    const railRoute = result.railRoute && departure?.name === result.railRoute.from && arrival?.name === result.railRoute.to ? result.railRoute : undefined
    await db.images.bulkPut([
      {id:processedId,data:processed,mime:'image/jpeg',createdAt:now},
      {id:thumbnailId,data:thumbnail,mime:'image/jpeg',createdAt:now},
    ])
    await db.tickets.put({
      ...ticket, departure, arrival, takenAt: ticket.takenAt || fields.takenAt,
      type: fields.documentKind === 'boarding' ? 'boarding-pass' : fields.documentKind !== 'unknown' ? 'train' : ticket.type,
      carrierOrTrainNo: ticket.carrierOrTrainNo || fields.trainNo || undefined, seat: ticket.seat || fields.seat || undefined,
      processedImageUrl:toIdbImageUrl(processedId),thumbnailUrl:toIdbImageUrl(thumbnailId),
      cropRecipe:{corners:result.corners,rotation:result.rotation,filter:'native-perspective-color-preserving-v2'},
      railRoute: ticket.track ? undefined : railRoute,
      processing:{version:result.version,processedAt:now,cropped:result.cropped,reviewed:preserve || false,issues:fields.issues,documentKind:fields.documentKind,departureTime:fields.departureTime,amount:fields.amount},
      tags:ticket.tags.filter(t=>t!=='待整理'),updatedAt:now,
    })
  })
}

export type ScanProgress = { completed: number; total: number; current: string; failed: { name: string; error: string }[] }
export async function processExistingTickets(onProgress: (p: ScanProgress)=>void): Promise<ScanProgress> {
  const tickets = (await listTickets()).filter(t=>!t.id.startsWith('mock-'))
  const progress: ScanProgress = {completed:0,total:tickets.length,current:'',failed:[]}
  for (const ticket of tickets) {
    progress.current = ticket.sourceFile?.name || ticket.id
    onProgress({...progress,failed:[...progress.failed]})
    try {
      if (REMOTE) {
        await remoteRequest(`/process/${encodeURIComponent(ticket.id)}`, { method: 'POST' })
        progress.completed++; onProgress({...progress,failed:[...progress.failed]}); continue
      }
      const sha = ticket.sourceFile?.sha256
      const cached = sha ? await fetch(`/__local/scans/${sha}/result`,{headers}) : undefined
      let result: ProcessingResult
      if (cached?.ok) result = await cached.json()
      else {
        const imageId=imageIdFromUrl(ticket.originalImageUrl)
        const original=imageId ? await getImageBlob(imageId) : undefined
        if (!original) throw new Error('找不到原图')
        result = await requestScan(original)
      }
      await applyScan(ticket.id,result)
    } catch (e) { progress.failed.push({name:progress.current,error:e instanceof Error ? e.message:'处理失败'}) }
    progress.completed++
    onProgress({...progress,failed:[...progress.failed]})
  }
  return progress
}
