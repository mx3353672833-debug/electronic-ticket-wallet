import { beforeEach, describe, expect, it } from 'vitest'
import { db, clearResolvedImageUrls, imageIdFromUrl } from '../db/db'
import { useTicketStore } from '../store/useTicketStore'
import { trackFromGeoJSON } from '../utils/tracks'
import { mockTickets } from '../data/mockTickets'

beforeEach(async () => {
  clearResolvedImageUrls()
  await db.tickets.clear()
  await db.images.clear()
  window.history.replaceState({}, '', '/')
  useTicketStore.setState({ tickets: [], searchQuery: '', yearRange: null, selectedTicketId: null, storySidebarOpen: false, uploadOpen: false })
})

describe('complete wallet persistence', () => {
  it('keeps original bytes, thumbnail, story and curved track after reopening the database', async () => {
    const original = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4])
    const thumbnail = new Uint8Array([82, 73, 70, 70])
    const id = await useTicketStore.getState().addUploadedTicket({
      file: new Blob([original], { type: 'image/png' }),
      thumbnail: new Blob([thumbnail], { type: 'image/webp' }),
      type: 'train', takenAt: '2026-09-21', departureName: '大连北', departureCity: '大连', arrivalName: '北京南', arrivalCity: '北京', carrierOrTrainNo: 'QA-ONLY', story: '', tags: [],
    })
    const track = trackFromGeoJSON({ type: 'LineString', coordinates: [[120, 38], [118, 40], [116, 40]] }, 'synthetic-test.geojson')
    const firstImageUrl = useTicketStore.getState().tickets.find(t => t.id === id)!.originalImageUrl
    await useTicketStore.getState().updateDetails(id, { story: '测试：旅程笔记', tags: ['测试'], track })
    expect(useTicketStore.getState().tickets.find(t => t.id === id)?.originalImageUrl).toBe(firstImageUrl)

    clearResolvedImageUrls()
    db.close()
    await db.open()
    useTicketStore.setState({ tickets: [], ready: false })
    await useTicketStore.getState().init()
    const displayed = useTicketStore.getState().tickets.find(t => t.id === id)!
    expect(displayed.story).toBe('测试：旅程笔记')
    expect(displayed.track).toEqual(track)
    expect(displayed.originalImageUrl).toMatch(/^blob:/)
    expect(displayed.originalImageUrl).not.toBe(firstImageUrl)
    const saved = (await db.tickets.get(id))!
    expect(saved.originalImageUrl).toMatch(/^idb:\/\/images\//)
    expect(saved.processedImageUrl).toBe(saved.originalImageUrl)
    expect(saved.thumbnailUrl).not.toBe(saved.originalImageUrl)
    const originalRow = await db.images.get(imageIdFromUrl(saved.originalImageUrl)!)
    const thumbnailRow = await db.images.get(imageIdFromUrl(saved.thumbnailUrl)!)
    expect(new Uint8Array(originalRow!.data!)).toEqual(original)
    expect(new Uint8Array(thumbnailRow!.data!)).toEqual(thumbnail)
    expect(originalRow!.blob).toBeUndefined() // Original is not stored twice.
  })

  it('does not navigate or randomly select outside the active search/year scope', async () => {
    await db.tickets.bulkPut(mockTickets.map(t=>({...t,id:t.id.replace('mock-','user-test-')})))
    await useTicketStore.getState().init()
    useTicketStore.getState().setSearchQuery('G503')
    const one = useTicketStore.getState().randomTicket()!
    expect(one.carrierOrTrainNo).toBe('G503')
    useTicketStore.getState().navigateTicket(1)
    expect(useTicketStore.getState().selectedTicketId).toBe(one.id)
    useTicketStore.getState().setSearchQuery('no-match-test-query')
    expect(useTicketStore.getState().randomTicket()).toBeNull()
  })

  it('invalidates a network estimate after changing its stations',async()=>{
    const ticket={...mockTickets[0],id:'user-route-test',railRoute:{segments:[[[110,30],[110.5,30.8],[111,31]]] as [number,number][][],source:'osm-rail' as const,status:'network-estimate' as const,from:mockTickets[0].departure!.name,to:mockTickets[0].arrival!.name,distanceKm:130,lineNames:['测试线'],osmWays:['way/test'],datasetDate:'2026-05-12',attribution:'OSM',sourceUrl:'https://data.humdata.org/dataset/hotosm_chn_railways',computedAt:'2026-09-21'}}
    await db.tickets.put(ticket);await useTicketStore.getState().init()
    await useTicketStore.getState().updateDetails(ticket.id,{departure:{name:'已改站点'}})
    expect((await db.tickets.get(ticket.id))?.railRoute).toBeUndefined()
    expect(useTicketStore.getState().tickets[0].railRoute).toBeUndefined()
  })
})
