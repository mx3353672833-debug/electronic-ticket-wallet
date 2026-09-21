import { beforeEach, describe, expect, it } from 'vitest'
import {
  createId,
  db,
  getImageBlob,
  isIdbImageUrl,
  isTransientImageUrl,
  listTickets,
  loadTicketsForDisplay,
  putTicket,
  resolveTicketImageUrls,
  saveImageBlob,
  seedIfEmpty,
  toIdbImageUrl,
  toPersistableTicket,
  updateTicket,
} from '../db/db'
import { mockTickets } from '../data/mockTickets'
import { mergeStoryUpdate } from '../utils/search'
import type { Ticket } from '../types/ticket'

beforeEach(async () => {
  await db.tickets.clear()
  await db.images.clear()
})

function makeUserTicket(imageUrl: string, story = '初始故事'): Ticket {
  const now = new Date().toISOString()
  return {
    id: createId('user'),
    type: 'train',
    takenAt: '2026-03-01',
    departure: { name: '起点站', city: '甲城' },
    arrival: { name: '终点站', city: '乙城' },
    carrierOrTrainNo: 'K1001',
    originalImageUrl: imageUrl,
    processedImageUrl: imageUrl,
    thumbnailUrl: imageUrl,
    story,
    tags: ['上传'],
    companions: [],
    createdAt: now,
    updatedAt: now,
  }
}

describe('IndexedDB persistence', () => {
  it('seeds mocks once', async () => {
    await seedIfEmpty()
    await seedIfEmpty()
    expect(await listTickets()).toHaveLength(20)
  })

  it('keeps idb image refs after story edit (upload → edit → reload)', async () => {
    await seedIfEmpty()
    const imageId = createId('img')
    const blob = new Blob(['png-bytes-upload'], { type: 'image/png' })
    await saveImageBlob(imageId, blob)
    const idbUrl = toIdbImageUrl(imageId)
    const ticket = makeUserTicket(idbUrl)
    await putTicket(ticket)

    const displayAfterUpload = await loadTicketsForDisplay()
    const shown = displayAfterUpload.find((t) => t.id === ticket.id)
    expect(shown).toBeTruthy()
    expect(shown!.thumbnailUrl).toBeTruthy()
    expect(isTransientImageUrl(shown!.thumbnailUrl)).toBe(true)

    const updated = await updateTicket(ticket.id, {
      story: '编辑后的故事',
      tags: ['上传', '已编辑'],
    })
    expect(updated?.story).toBe('编辑后的故事')
    expect(isIdbImageUrl(updated!.originalImageUrl)).toBe(true)
    expect(isIdbImageUrl(updated!.processedImageUrl)).toBe(true)
    expect(isIdbImageUrl(updated!.thumbnailUrl)).toBe(true)

    const displayAfterEdit = await loadTicketsForDisplay()
    const afterEdit = displayAfterEdit.find((t) => t.id === ticket.id)
    expect(afterEdit?.story).toBe('编辑后的故事')
    expect(afterEdit?.thumbnailUrl).toBeTruthy()
    expect(isTransientImageUrl(afterEdit!.thumbnailUrl)).toBe(true)
    expect(await getImageBlob(imageId)).toBeTruthy()

    const raw = (await listTickets()).find((t) => t.id === ticket.id)
    expect(raw?.originalImageUrl).toBe(idbUrl)
    expect(raw?.processedImageUrl).toBe(idbUrl)
    expect(raw?.thumbnailUrl).toBe(idbUrl)
  })

  it('simulates in-memory story edit then refresh', async () => {
    await seedIfEmpty()
    const imageId = createId('img')
    await saveImageBlob(imageId, new Blob(['x'], { type: 'image/jpeg' }))
    const idbUrl = toIdbImageUrl(imageId)
    const ticket = makeUserTicket(idbUrl)
    await putTicket(ticket)

    const before = await loadTicketsForDisplay()
    const displayTicket = before.find((t) => t.id === ticket.id)!
    const dbUpdated = await updateTicket(ticket.id, {
      story: '刷新前改过',
      tags: ['ok'],
    })
    const memoryTicket = mergeStoryUpdate(
      displayTicket,
      '刷新前改过',
      ['ok'],
      dbUpdated!.updatedAt,
    )
    expect(memoryTicket.thumbnailUrl).toBe(displayTicket.thumbnailUrl)

    const afterRefresh = await resolveTicketImageUrls(await listTickets())
    const reloaded = afterRefresh.find((t) => t.id === ticket.id)!
    expect(reloaded.story).toBe('刷新前改过')
    expect(reloaded.thumbnailUrl).toBeTruthy()
    expect(reloaded.processedImageUrl).toBeTruthy()
  })

  it('refuses to persist blob: urls over idb refs', () => {
    const existing = makeUserTicket(toIdbImageUrl('img-keep'))
    const dirty = {
      ...existing,
      originalImageUrl: 'blob:http://localhost/tmp1',
      processedImageUrl: 'blob:http://localhost/tmp2',
      thumbnailUrl: 'blob:http://localhost/tmp3',
      story: '想写库里',
    }
    const persistable = toPersistableTicket(dirty, existing)
    expect(persistable.originalImageUrl).toBe(toIdbImageUrl('img-keep'))
    expect(persistable.processedImageUrl).toBe(toIdbImageUrl('img-keep'))
    expect(persistable.thumbnailUrl).toBe(toIdbImageUrl('img-keep'))
    expect(persistable.story).toBe('想写库里')
  })

  it('keeps mock tickets after user insert', async () => {
    await seedIfEmpty()
    const firstMock = mockTickets[0]
    const row = await db.tickets.get(firstMock.id)
    expect(row?.id).toBe(firstMock.id)
  })
})
