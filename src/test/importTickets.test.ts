import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, imageIdFromUrl } from '../db/db'
import { importTicketFiles, type ImportReport } from '../utils/importTickets'
import { makeThumbnail } from '../utils/images'
import { recognizeTicket } from '../utils/recognition'

vi.mock('../utils/images', () => ({ makeThumbnail: vi.fn() }))
const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer
const photo = (name: string, content: string) => {
  const file = new File([content], name, { type: 'image/jpeg' })
  Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes(content) })
  return file
}

beforeEach(async () => {
  await db.tickets.clear(); await db.images.clear()
  vi.mocked(makeThumbnail).mockReset().mockResolvedValue({ type: 'image/webp', arrayBuffer: async () => bytes('thumbnail') } as Blob)
  vi.stubGlobal('fetch',vi.fn(async(input: string,options?: RequestInit)=>{
    if (input==='/__local/process') {
      const hash=await crypto.subtle.digest('SHA-256',await (options!.body as Blob).arrayBuffer())
      const sha256=Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('')
      return {ok:true,json:async()=>({sha256,version:2,cropped:true,corners:[[0,0],[1,0],[1,1],[0,1]],rotation:0,fields:recognizeTicket({version:2,cropped:true,confidence:1,corners:[],width:1800,height:1100,lines:[]}),departure:null,arrival:null})}
    }
    return {ok:true,arrayBuffer:async()=>bytes(input.endsWith('thumbnail')?'scanned thumbnail':'processed ticket')}
  }))
})

describe('batch photo import', () => {
  it('stores exact source bytes, leaves journey data unknown, and reports progress', async () => {
    const progress: ImportReport[] = []
    const result = await importTicketFiles([photo('one.jpeg', 'original one'), photo('two.jpeg', 'original two')], r => progress.push(r))
    expect(result).toMatchObject({ total: 2, completed: 2, imported: 2, skipped: 0, failed: [] })
    expect(progress.at(-1)?.completed).toBe(2)
    expect(await db.images.count()).toBe(8)
    const row = (await db.tickets.toArray()).find(t => t.sourceFile?.name === 'one.jpeg')!
    expect(row).toMatchObject({ takenAt: null, departure: null, arrival: null, type: 'other', tags: [], processing:{version:2,cropped:true,reviewed:false} })
    expect(row.processedImageUrl).not.toBe(row.originalImageUrl)
    expect(row.sourceFile?.sha256).toHaveLength(64)
    const image = await db.images.get(imageIdFromUrl(row.originalImageUrl)!)
    expect(new Uint8Array(image!.data!)).toEqual(new Uint8Array(bytes('original one')))
  })

  it('skips identical contents even when renamed and does not overwrite existing stories', async () => {
    await importTicketFiles([photo('one.jpeg', 'same')], () => {})
    const row = (await db.tickets.toArray())[0]
    await db.tickets.update(row.id, { story: 'keep this story' })
    const result = await importTicketFiles([photo('renamed.jpeg', 'same')], () => {})
    expect(result).toMatchObject({ imported: 0, skipped: 1, failed: [] })
    expect(await db.tickets.count()).toBe(1)
    expect(await db.images.count()).toBe(4)
    expect((await db.tickets.get(row.id))?.story).toBe('keep this story')
  })

  it('continues past an unreadable photo without leaving partial records', async () => {
    vi.mocked(makeThumbnail).mockRejectedValueOnce(new Error('图片损坏'))
    const result = await importTicketFiles([photo('bad.jpeg', 'bad'), photo('good.jpeg', 'good')], () => {})
    expect(result).toMatchObject({ completed: 2, imported: 1, failed: [{ name: 'bad.jpeg', error: '图片损坏' }] })
    expect(await db.tickets.count()).toBe(1)
    expect(await db.images.count()).toBe(4)
  })
})
