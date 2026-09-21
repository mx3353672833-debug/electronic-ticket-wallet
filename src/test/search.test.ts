import { describe, expect, it } from 'vitest'
import { mockTickets } from '../data/mockTickets'
import {
  filterTickets,
  matchesSearch,
  mergeStoryUpdate,
  searchHits,
  ticketSearchText,
  yearScopedTickets,
} from '../utils/search'
import type { Ticket } from '../types/ticket'

describe('mock tickets', () => {
  it('provides 20 tickets with journey variety', () => {
    expect(mockTickets).toHaveLength(20)
    const types = new Set(mockTickets.map((t) => t.type))
    expect(types.has('train')).toBe(true)
    expect(types.has('flight')).toBe(true)
    const cities = mockTickets.flatMap((t) => [
      t.departure?.city,
      t.arrival?.city,
    ])
    expect(cities.filter(Boolean).length).toBeGreaterThan(10)
    const stories = mockTickets.map((t) => t.story)
    expect(new Set(stories).size).toBeGreaterThan(10)
  })
})

describe('cloud vs action result set', () => {
  it('keeps year-scoped tickets in the cloud while search only marks hits', () => {
    const yearRange = { start: 2023, end: 2023 }
    const cloud = yearScopedTickets(mockTickets, yearRange)
    const hits = searchHits(cloud, '北京')
    expect(cloud.length).toBeGreaterThan(0)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.length).toBeLessThan(cloud.length)
    expect(filterTickets(mockTickets, '北京', yearRange)).toEqual(hits)
  })

  it('does not empty the cloud when search has no hits', () => {
    const cloud = yearScopedTickets(mockTickets, null)
    const hits = searchHits(cloud, '不存在的城市xyz')
    expect(cloud).toHaveLength(20)
    expect(hits).toHaveLength(0)
    expect(filterTickets(mockTickets, '不存在的城市xyz', null)).toHaveLength(
      0,
    )
  })

  it('stacks year range with search for navigation set only', () => {
    const filtered = filterTickets(mockTickets, '北京', {
      start: 2023,
      end: 2023,
    })
    expect(filtered.length).toBeGreaterThan(0)
    for (const t of filtered) {
      expect(t.takenAt?.startsWith('2023')).toBe(true)
      expect(ticketSearchText(t).toLowerCase()).toContain('北京')
    }
  })
})

describe('search matching', () => {
  it('matches by city, train no, date, story, tag', () => {
    expect(mockTickets.filter((t) => matchesSearch(t, '大连')).length).toBeGreaterThan(0)
    expect(
      mockTickets.filter((t) => matchesSearch(t, 'D1234')).some((t) => t.carrierOrTrainNo === 'D1234'),
    ).toBe(true)
    expect(
      mockTickets.filter((t) => matchesSearch(t, '2023-08')).some((t) => t.takenAt === '2023-08-12'),
    ).toBe(true)
    expect(mockTickets.some((t) => matchesSearch(t, '火锅'))).toBe(true)
    expect(mockTickets.some((t) => matchesSearch(t, '出差'))).toBe(true)
  })
})

describe('mergeStoryUpdate keeps display image urls', () => {
  it('only changes story/tags/updatedAt', () => {
    const base: Ticket = {
      ...mockTickets[0],
      originalImageUrl: 'blob:http://localhost/fake-a',
      processedImageUrl: 'blob:http://localhost/fake-b',
      thumbnailUrl: 'blob:http://localhost/fake-c',
    }
    const next = mergeStoryUpdate(base, '新故事', ['新'], '2026-01-01T00:00:00.000Z')
    expect(next.story).toBe('新故事')
    expect(next.tags).toEqual(['新'])
    expect(next.originalImageUrl).toBe(base.originalImageUrl)
    expect(next.processedImageUrl).toBe(base.processedImageUrl)
    expect(next.thumbnailUrl).toBe(base.thumbnailUrl)
  })
})
