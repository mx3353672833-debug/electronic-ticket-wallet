import { db, getImageBlob, imageIdFromUrl } from '../db/db'

/** Explicit UI action: export current user edits and referenced bytes to private local storage. */
export async function exportWallet(onProgress: (text: string) => void) {
  const tickets = (await db.tickets.toArray()).filter(t => !t.id.startsWith('mock-'))
  const images = [...new Set(tickets.flatMap(t => [t.originalImageUrl, t.processedImageUrl, t.thumbnailUrl]).map(imageIdFromUrl))]
  if (images.some(id => !id)) throw new Error('有未持久化的图片，导出已停止')
  const headers = { 'X-Ticket-Wallet': '1' }
  const start = await fetch('/__local/export/start', { method: 'POST', headers })
  if (!start.ok) throw new Error('无法建立本机备份')
  const { exportId } = await start.json()
  const manifest: { id: string; mime: string; size: number }[] = []
  for (const id of images as string[]) {
    onProgress(`备份图片 ${manifest.length + 1} / ${images.length}`)
    const blob = await getImageBlob(id)
    if (!blob) throw new Error(`缺少图片：${id}`)
    const response = await fetch(`/__local/export/${exportId}/images/${encodeURIComponent(id)}`, { method: 'PUT', headers, body: blob })
    if (!response.ok) throw new Error('写入备份失败')
    manifest.push({ id, mime: blob.type, size: blob.size })
  }
  const response = await fetch(`/__local/export/${exportId}/finish`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), tickets, images: manifest }) })
  if (!response.ok) throw new Error('备份校验失败')
  onProgress(`已备份 ${tickets.length} 张票、${images.length} 张图片`)
}
