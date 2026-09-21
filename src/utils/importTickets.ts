import { db, toIdbImageUrl } from '../db/db'
import type { Ticket } from '../types/ticket'
import { makeThumbnail } from './images'
import { applyScan, requestScan } from './processTickets'
import { REMOTE, remoteRequest } from './remote'

export type ImportReport = {
  total: number
  completed: number
  imported: number
  skipped: number
  failed: { name: string; error: string }[]
  current: string
}

/** Sequential decoding avoids loading a whole folder of full-size images at once. */
export async function importTicketFiles(files: File[], onProgress: (report: ImportReport) => void): Promise<ImportReport> {
  const report: ImportReport = { total: files.length, completed: 0, imported: 0, skipped: 0, failed: [], current: '' }
  const publish = () => onProgress({ ...report, failed: [...report.failed] })
  publish()
  for (const file of files) {
    report.current = file.name
    publish()
    try {
      if (file.size > 40 * 1024 * 1024) throw new Error('图片超过 40 MB')
      if (REMOTE) {
        const result = await remoteRequest<{ skipped: boolean }>('/import', { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) }, body: file })
        if (result.skipped) report.skipped++; else report.imported++
        report.completed++; publish(); continue
      }
      const data = await file.arrayBuffer()
      const digest = await crypto.subtle.digest('SHA-256', data)
      const sha256 = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')
      const id = `user-${sha256}`
      const existing = await db.tickets.get(id)
      if (existing?.processing?.version === 2) { report.skipped++ }
      else {
        const scan = await requestScan(file)
        if (existing) { await applyScan(id, scan); report.imported++; report.completed++; publish(); continue }
        const thumbnail = await makeThumbnail(file)
        const thumbData = await thumbnail.arrayBuffer()
        const imageId = `original-${sha256}`, thumbId = `thumb-${sha256}`
        const now = new Date().toISOString()
        const ticket: Ticket = {
          id, type: 'other', takenAt: null, departure: null, arrival: null,
          originalImageUrl: toIdbImageUrl(imageId), processedImageUrl: toIdbImageUrl(imageId), thumbnailUrl: toIdbImageUrl(thumbId),
          sourceFile: { name: file.name, size: file.size, sha256 },
          story: '', tags: ['待整理'], companions: [], createdAt: now, updatedAt: now,
        }
        // Decode/hash before starting a transaction. Images and ticket commit
        // together, including quota failures and concurrent duplicate imports.
        const added = await db.transaction('rw', db.tickets, db.images, async () => {
          if (await db.tickets.get(id)) return false
          await db.images.bulkAdd([
            { id: imageId, data, mime: file.type, createdAt: now },
            { id: thumbId, data: thumbData, mime: thumbnail.type, createdAt: now },
          ])
          await db.tickets.add(ticket)
          return true
        })
        if (added) { await applyScan(id, scan); report.imported++ }
        else report.skipped++
      }
    } catch (error) {
      report.failed.push({ name: file.name, error: error instanceof Error ? error.message : '保存失败，请重试' })
    }
    report.completed++
    publish()
  }
  return { ...report, failed: [...report.failed] }
}
