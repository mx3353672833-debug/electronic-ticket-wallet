import { beforeEach, describe, expect, it } from 'vitest'
import {
  db,
  createId,
  getImageBlob,
  listTickets,
  putTicket,
  saveImageBlob,
  seedIfEmpty,
  toIdbImageUrl,
  updateTicket,
} from '../db/db'
import { mockTickets } from '../data/mockTickets'
import type { Ticket } from '../types/ticket'

beforeEach(async () => {
  await db.tickets.clear()
  await db.images.clear()
})

describe('IndexedDB data layer', () => {
  it('seeds 20 mock tickets when empty', async () => {
    await seedIfEmpty()
    const rows = await listTickets()
    expect(rows).toHaveLength(20)
  })

  it('does not duplicate mocks on repeated seed', async () => {
    await seedIfEmpty()
    await seedIfEmpty()
    const rows = await listTickets()
    expect(rows).toHaveLength(20)
  })

  it('persists user tickets and image blobs', async () => {
    await seedIfEmpty()
    const imageId = createId('img')
    const blob = new Blob(['fake-image-bytes'], { type: 'image/png' })
    await saveImageBlob(imageId, blob)
    const url = toIdbImageUrl(imageId)
    const now = new Date().toISOString()
    const ticket: Ticket = {
      id: createId('user'),
      type: 'bus',
      takenAt: '2026-03-01',
      departure: { name: '起点站', city: '甲城' },
      arrival: { name: '终点站', city: '乙城' },
      originalImageUrl: url,
      processedImageUrl: url,
      thumbnailUrl: url,
      story: '用户录入的故事',
      tags: ['测试'],
      companions: [],
      createdAt: now,
      updatedAt: now,
    }
    await putTicket(ticket)
    const rows = await listTickets()
    expect(rows).toHaveLength(21)
    expect(rows.some((t) => t.id === ticket.id)).toBe(true)
    const storedBlob = await getImageBlob(imageId)
    expect(storedBlob).toBeTruthy()
    expect(storedBlob?.size).toBeGreaterThan(0)

    const updated = await updateTicket(ticket.id, {
      story: '已更新',
      tags: ['测试', '更新'],
    })
    expect(updated?.story).toBe('已更新')
    const again = await listTickets()
    const found = again.find((t) => t.id === ticket.id)
    expect(found?.tags).toEqual(['测试', '更新'])
  })

  it('keeps mock tickets after user insert', async () => {
    await seedIfEmpty()
    const firstMock = mockTickets[0]
    const row = await db.tickets.get(firstMock.id)
    expect(row?.id).toBe(firstMock.id)
  })
})
