import type { Ticket } from '../types/ticket'
import { TICKET_TYPE_LABELS } from '../types/ticket'

export type YearRange = { start: number; end: number } | null

export function ticketSearchText(ticket: Ticket): string {
  const parts = [
    ticket.takenAt ?? '',
    ticket.departure?.name ?? '',
    ticket.departure?.city ?? '',
    ticket.arrival?.name ?? '',
    ticket.arrival?.city ?? '',
    ticket.carrierOrTrainNo ?? '',
    ticket.seat ?? '',
    ticket.story,
    ticket.sourceFile?.name ?? '',
    TICKET_TYPE_LABELS[ticket.type],
    ticket.type,
    ...ticket.tags,
    ...ticket.companions,
  ]
  return parts.filter(Boolean).join(' ')
}

export function matchesSearch(ticket: Ticket, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return ticketSearchText(ticket).toLowerCase().includes(q)
}

export function matchesYear(ticket: Ticket, range: YearRange): boolean {
  if (!range) return true
  if (!ticket.takenAt) return false
  const year = Number(ticket.takenAt.slice(0, 4))
  if (Number.isNaN(year)) return false
  return year >= range.start && year <= range.end
}

/** 票云展示集：仅年份范围，搜索不把票移出票云 */
export function yearScopedTickets(
  tickets: Ticket[],
  yearRange: YearRange,
): Ticket[] {
  return tickets.filter((t) => matchesYear(t, yearRange))
}

/** 动作结果集：搜索命中 + 年份范围（随机/切换/下拉用） */
export function filterTickets(
  tickets: Ticket[],
  query: string,
  yearRange: YearRange,
): Ticket[] {
  return tickets.filter(
    (t) => matchesYear(t, yearRange) && matchesSearch(t, query),
  )
}

/** 在已按年份圈定的票云里标出搜索命中 */
export function searchHits(ticketsInCloud: Ticket[], query: string): Ticket[] {
  return ticketsInCloud.filter((t) => matchesSearch(t, query))
}

export function mergeStoryUpdate(
  ticket: Ticket,
  story: string,
  tags: string[],
  updatedAt: string,
): Ticket {
  return { ...ticket, story, tags, updatedAt }
}

export function ticketHasIncompleteJourney(ticket: Ticket): boolean {
  return !ticket.takenAt || !ticket.departure || !ticket.arrival
}

export function formatRoute(ticket: Ticket): string {
  if (!ticket.departure && !ticket.arrival) return ticket.sourceFile?.name || '地点待补'
  const from = ticket.departure?.name || ticket.departure?.city || '?'
  const to = ticket.arrival?.name || ticket.arrival?.city || '?'
  return `${from} → ${to}`
}
