import Dexie, { type EntityTable } from 'dexie'
import type { Ticket } from '../types/ticket'
import { mockTickets } from '../data/mockTickets'
import { REMOTE, SERVER_BASE, remoteRequest } from '../utils/remote'
import {clearDisplayImages,displayImageUrl} from '../utils/displayImages'

export type ImageRecord = {
  id: string
  blob?: Blob
  data?: ArrayBuffer
  mime: string
  createdAt: string
}

const db = new Dexie('electronic-ticket-wallet') as Dexie & {
  tickets: EntityTable<Ticket, 'id'>
  images: EntityTable<ImageRecord, 'id'>
}

db.version(1).stores({
  tickets: 'id, type, takenAt, createdAt, updatedAt',
  images: 'id, createdAt',
})

export function createId(prefix = 't'): string {
  return `${prefix}-${crypto.randomUUID()}`
}

export const IDB_PREFIX = 'idb://images/'

export function toIdbImageUrl(imageId: string): string {
  return `${IDB_PREFIX}${imageId}`
}

export function isIdbImageUrl(url: string): boolean {
  return url.startsWith(IDB_PREFIX)
}

export function imageIdFromUrl(url: string): string | null {
  return isIdbImageUrl(url) ? url.slice(IDB_PREFIX.length) : null
}

/** blob: 是会话内对象 URL，不能写入库；应保留库中 idb:// 或 data: 引用 */
export function isTransientImageUrl(url: string | undefined): boolean {
  return typeof url === 'string' && url.startsWith('blob:')
}

function pickPersistableUrl(
  incoming: string | undefined,
  previous: string,
): string {
  if (incoming === undefined) return previous
  if (isTransientImageUrl(incoming)) return previous
  return incoming
}

export function toPersistableTicket(
  ticket: Ticket,
  fallbackImageUrls?: Pick<
    Ticket,
    'originalImageUrl' | 'processedImageUrl' | 'thumbnailUrl'
  >,
): Ticket {
  const prev = fallbackImageUrls ?? {
    originalImageUrl: ticket.originalImageUrl,
    processedImageUrl: ticket.processedImageUrl,
    thumbnailUrl: ticket.thumbnailUrl,
  }
  return {
    ...ticket,
    originalImageUrl: pickPersistableUrl(ticket.originalImageUrl, prev.originalImageUrl),
    processedImageUrl: pickPersistableUrl(ticket.processedImageUrl, prev.processedImageUrl),
    thumbnailUrl: pickPersistableUrl(ticket.thumbnailUrl, prev.thumbnailUrl),
  }
}

export async function seedIfEmpty(): Promise<void> {
  if (REMOTE) return
  const count = await db.tickets.count()
  if (count === 0) {
    await db.tickets.bulkPut(mockTickets)
  }
}

export async function listTickets(): Promise<Ticket[]> {
  const rows = REMOTE ? await remoteRequest<Ticket[]>('/tickets') : await db.tickets.toArray()
  return rows.sort((a, b) => {
    const da = a.takenAt ?? '0000-00-00'
    const dbb = b.takenAt ?? '0000-00-00'
    return dbb.localeCompare(da) || (a.sourceFile?.name || a.id).localeCompare(b.sourceFile?.name || b.id)
  })
}

export async function getTicket(id: string): Promise<Ticket | undefined> {
  if (REMOTE) return remoteRequest<Ticket>(`/tickets/${encodeURIComponent(id)}`)
  return db.tickets.get(id)
}

export async function putTicket(ticket: Ticket): Promise<void> {
  if (REMOTE) { await updateTicket(ticket.id, ticket); return }
  const existing = await db.tickets.get(ticket.id)
  if (!existing && [ticket.originalImageUrl, ticket.processedImageUrl, ticket.thumbnailUrl].some(isTransientImageUrl)) {
    throw new Error('图片还未保存，无法收录这张票')
  }
  await db.tickets.put(toPersistableTicket(ticket, existing))
}

export async function updateTicket(
  id: string,
  patch: Partial<Omit<Ticket, 'id'>>,
): Promise<Ticket | undefined> {
  if (REMOTE) return remoteRequest<Ticket>(`/tickets/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch, (_key, value) => value === undefined ? null : value) })
  const existing = await db.tickets.get(id)
  if (!existing) return undefined
  const next = toPersistableTicket(
    {
      ...existing,
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
    },
    existing,
  )
  await db.tickets.put(next)
  return next
}

async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer()
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (result instanceof ArrayBuffer) resolve(result)
      else reject(new Error('cannot read blob'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('cannot read blob'))
    reader.readAsArrayBuffer(blob)
  })
}

export async function saveImageBlob(
  id: string,
  blob: Blob,
): Promise<ImageRecord> {
  const mime = blob.type || 'image/*'
  const data = await blobToArrayBuffer(blob)
  const record: ImageRecord = {
    id,
    data,
    mime,
    createdAt: new Date().toISOString(),
  }
  await db.images.put(record)
  return record
}

export async function getImageBlob(id: string): Promise<Blob | undefined> {
  const row = await db.images.get(id)
  if (!row) return undefined
  const mime = row.mime || 'image/*'
  if (row.data && (row.data as ArrayBuffer).byteLength !== undefined) {
    return new Blob([row.data], { type: mime })
  }
  if (row.blob instanceof Blob) return row.blob
  if (row.data) return new Blob([row.data], { type: mime })
  return undefined
}

const objectUrlCache = new Map<string, string>()

/** Release in-memory image handles before discarding a wallet session. */
export function clearResolvedImageUrls(): void {
  clearDisplayImages()
  objectUrlCache.forEach(url => URL.revokeObjectURL(url))
  objectUrlCache.clear()
}

export async function resolveImageUrl(url: string): Promise<string> {
  if (!url) return ''
  if (!isIdbImageUrl(url)) return url
  const imageId = imageIdFromUrl(url)
  if (!imageId) return ''
  if (REMOTE) return `${SERVER_BASE}/media/${encodeURIComponent(imageId)}`
  const cached = objectUrlCache.get(imageId)
  if (cached) return cached
  const blob = await getImageBlob(imageId)
  if (!blob) return ''
  const objectUrl = URL.createObjectURL(blob)
  objectUrlCache.set(imageId, objectUrl)
  return objectUrl
}

/** 库中记录 → 界面显示票（图片 URL 可展示；库引用仍保留 idb://） */
export async function resolveTicketImageUrls(
  tickets: Ticket[],
): Promise<Ticket[]> {
  return Promise.all(
    tickets.map(async (ticket) => ({
      ...ticket,
      originalImageUrl: await resolveImageUrl(ticket.originalImageUrl),
      processedImageUrl: await resolveImageUrl(ticket.processedImageUrl),
      thumbnailUrl: displayImageUrl(await resolveImageUrl(ticket.thumbnailUrl),'thumb'),
    })),
  )
}

/** 模拟刷新：从库重新读取并解析图片（不经过内存展示 URL） */
export async function loadTicketsForDisplay(): Promise<Ticket[]> {
  const raw = await listTickets()
  return resolveTicketImageUrls(raw)
}

export { db }
