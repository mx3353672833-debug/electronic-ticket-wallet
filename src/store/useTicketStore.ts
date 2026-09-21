import { create } from 'zustand'
import type { Ticket } from '../types/ticket'
import {
  createId,
  loadTicketsForDisplay,
  putTicket,
  saveImageBlob,
  seedIfEmpty,
  toIdbImageUrl,
  updateTicket,
} from '../db/db'
import {
  filterTickets,
  mergeStoryUpdate,
  type YearRange,
} from '../utils/search'

export type WalletState = {
  ready: boolean
  tickets: Ticket[]
  searchQuery: string
  searchFocused: boolean
  yearRange: YearRange
  selectedTicketId: string | null
  storySidebarOpen: boolean
  uploadOpen: boolean
  loadError: string | null

  init: () => Promise<void>
  setSearchQuery: (q: string) => void
  setSearchFocused: (v: boolean) => void
  setYearRange: (range: YearRange) => void
  openTicket: (id: string) => void
  closeTicket: () => void
  toggleStorySidebar: (open?: boolean) => void
  setUploadOpen: (open: boolean) => void
  navigateTicket: (direction: -1 | 1) => void
  randomTicket: () => Ticket | null
  updateStory: (id: string, story: string, tags: string[]) => Promise<void>
  updateDetails: (id: string, patch: Partial<Pick<Ticket, 'story' | 'tags' | 'takenAt' | 'departure' | 'arrival' | 'carrierOrTrainNo' | 'seat' | 'companions' | 'track' | 'processing' | 'railRoute'>>) => Promise<void>
  updateJourneyPlaces: (
    id: string,
    patch: {
      takenAt?: string | null
      departure?: Ticket['departure']
      arrival?: Ticket['arrival']
    },
  ) => Promise<void>
  addUploadedTicket: (input: {
    file: Blob
    thumbnail?: Blob
    type: Ticket['type']
    takenAt: string | null
    departureName: string
    departureCity: string
    arrivalName: string
    arrivalCity: string
    carrierOrTrainNo: string
    story: string
    tags: string[]
    departureLat?: string
    departureLng?: string
    arrivalLat?: string
    arrivalLng?: string
  }) => Promise<string>
}

export const useTicketStore = create<WalletState>((set, get) => ({
  ready: false,
  tickets: [],
  searchQuery: '',
  searchFocused: false,
  yearRange: null,
  selectedTicketId: null,
  storySidebarOpen: false,
  uploadOpen: false,
  loadError: null,

  init: async () => {
    try {
      await seedIfEmpty()
      const tickets = (await loadTicketsForDisplay()).filter(t=>!t.id.startsWith('mock-'))
      const url = new URL(window.location.href)
      const ticketParam = url.searchParams.get('ticket')
      const valid = ticketParam && tickets.some((t) => t.id === ticketParam)
      set({
        ready: true,
        tickets,
        selectedTicketId: valid ? ticketParam : null,
        loadError: null,
      })
    } catch (error) {
      set({
        ready: true,
        loadError: error instanceof Error ? error.message : '数据加载失败',
      })
    }
  },

  setSearchQuery: (q) => set({ searchQuery: q }),
  setSearchFocused: (v) => set({ searchFocused: v }),
  setYearRange: (range) => set({ yearRange: range }),

  openTicket: (id) => {
    const url = new URL(window.location.href)
    url.searchParams.set('ticket', id)
    window.history.replaceState({}, '', url)
    set({ selectedTicketId: id, storySidebarOpen: false })
  },

  closeTicket: () => {
    const url = new URL(window.location.href)
    url.searchParams.delete('ticket')
    window.history.replaceState({}, '', url)
    set({ selectedTicketId: null, storySidebarOpen: false })
  },

  toggleStorySidebar: (open) => {
    const next = open ?? !get().storySidebarOpen
    set({ storySidebarOpen: next })
  },

  setUploadOpen: (open) => set({ uploadOpen: open }),

  navigateTicket: (direction) => {
    const { tickets, searchQuery, yearRange, selectedTicketId } = get()
    const filtered = filterTickets(tickets, searchQuery, yearRange)
    if (!selectedTicketId || filtered.length === 0) return
    const index = filtered.findIndex((t) => t.id === selectedTicketId)
    if (index < 0) return
    const nextIndex = (index + direction + filtered.length) % filtered.length
    get().openTicket(filtered[nextIndex].id)
  },

  randomTicket: () => {
    const { tickets, searchQuery, yearRange } = get()
    const filtered = filterTickets(tickets, searchQuery, yearRange)
    if (filtered.length === 0) return null
    const pick = filtered[Math.floor(Math.random() * filtered.length)]
    get().openTicket(pick.id)
    return pick
  },

  updateStory: async (id, story, tags) => {
    const updated = await updateTicket(id, { story, tags })
    if (!updated) return
    set((state) => ({
      tickets: state.tickets.map((t) =>
        t.id === id
          ? mergeStoryUpdate(t, story, tags, updated.updatedAt)
          : t,
      ),
    }))
  },

  updateDetails: async (id, patch) => {
    const current = get().tickets.find(t=>t.id===id)
    if (current && (('departure' in patch && patch.departure?.name!==current.departure?.name) || ('arrival' in patch && patch.arrival?.name!==current.arrival?.name) || ('carrierOrTrainNo' in patch && patch.carrierOrTrainNo!==current.carrierOrTrainNo) || ('takenAt' in patch && patch.takenAt!==current.takenAt))) {
      patch = { ...patch, railRoute: undefined }
    }
    const updated = await updateTicket(id, patch)
    if (!updated) throw new Error('找不到这张票，请刷新后重试')
    set(state => ({ tickets: state.tickets.map(t => t.id === id ? { ...t, ...patch, updatedAt: updated.updatedAt } : t) }))
  },

  updateJourneyPlaces: async (id, patch) => {
    const updated = await updateTicket(id, patch)
    if (!updated) return
    set((state) => ({
      tickets: state.tickets.map((t) => {
        if (t.id !== id) return t
        return {
          ...t,
          takenAt: patch.takenAt !== undefined ? patch.takenAt : t.takenAt,
          departure:
            patch.departure !== undefined ? patch.departure : t.departure,
          arrival: patch.arrival !== undefined ? patch.arrival : t.arrival,
          updatedAt: updated.updatedAt,
        }
      }),
    }))
  },

  addUploadedTicket: async (input) => {
    const imageId = createId('img')
    const now = new Date().toISOString()
    const id = createId('user')
    await saveImageBlob(imageId, input.file)
    const imageUrl = toIdbImageUrl(imageId)
    let thumbnailUrl = imageUrl
    if (input.thumbnail) {
      const thumbnailId = createId('thumb')
      await saveImageBlob(thumbnailId, input.thumbnail)
      thumbnailUrl = toIdbImageUrl(thumbnailId)
    }
    const parseCoord = (v?: string): number | undefined => {
      if (v === undefined || v.trim() === '') return undefined
      const n = Number(v)
      return Number.isFinite(n) ? n : undefined
    }
    const depLat = parseCoord(input.departureLat)
    const depLng = parseCoord(input.departureLng)
    const arrLat = parseCoord(input.arrivalLat)
    const arrLng = parseCoord(input.arrivalLng)
    const ticket: Ticket = {
      id,
      type: input.type,
      takenAt: input.takenAt,
      departure:
        input.departureName || input.departureCity
          ? {
              name: input.departureName || input.departureCity,
              city: input.departureCity || undefined,
              lat: depLat,
              lng: depLng,
            }
          : null,
      arrival:
        input.arrivalName || input.arrivalCity
          ? {
              name: input.arrivalName || input.arrivalCity,
              city: input.arrivalCity || undefined,
              lat: arrLat,
              lng: arrLng,
            }
          : null,
      carrierOrTrainNo: input.carrierOrTrainNo || undefined,
      originalImageUrl: imageUrl,
      processedImageUrl: imageUrl,
      thumbnailUrl,
      story: input.story,
      tags: input.tags,
      companions: [],
      createdAt: now,
      updatedAt: now,
    }
    await putTicket(ticket)
    const tickets = await loadTicketsForDisplay()
    set({ tickets, uploadOpen: false })
    return id
  },
}))
