import type { Ticket } from '../types/ticket'

export type CloudLayout = {
  id: string
  x: number
  y: number
  scale: number
  rotate: number
  zIndex: number
}

function hash(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function layoutTicketCloud(tickets: Ticket[]): CloudLayout[] {
  const count = tickets.length
  if (count === 0) return []
  const cols = Math.max(3, Math.ceil(Math.sqrt(count * 1.4)))
  return tickets.map((ticket, index) => {
    const h = hash(ticket.id)
    const col = index % cols
    const row = Math.floor(index / cols)
    const rows = Math.ceil(count / cols)
    const x = 8 + ((col + 0.5) / cols) * 84 + ((h % 7) - 3) * 0.4
    const y = 6 + ((row + 0.5) / Math.max(rows, 1)) * 82 + ((h % 5) - 2) * 0.5
    const year = ticket.takenAt ? Number(ticket.takenAt.slice(0, 4)) : 2020
    const yearBias = Math.max(-8, Math.min(8, (year - 2022) * 0.6))
    const typeBias =
      ticket.type === 'flight' ? 1.08 : ticket.type === 'train' ? 1.02 : 0.96
    const scale = (0.88 + (h % 10) * 0.015 + yearBias * 0.01) * typeBias
    const rotate = ((h % 11) - 5) * 0.8 + yearBias * 0.3
    const zIndex = 1 + (h % 20)
    return {
      id: ticket.id,
      x,
      y,
      scale: Math.max(0.78, Math.min(1.22, scale)),
      rotate,
      zIndex,
    }
  })
}

export function getYearsFromTickets(tickets: Ticket[]): number[] {
  const years = new Set<number>()
  for (const t of tickets) {
    if (t.takenAt) {
      const y = Number(t.takenAt.slice(0, 4))
      if (!Number.isNaN(y)) years.add(y)
    }
  }
  return [...years].sort((a, b) => a - b)
}
