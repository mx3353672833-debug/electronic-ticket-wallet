import { useMemo } from 'react'
import { useTicketStore } from '../store/useTicketStore'
import { layoutTicketCloud } from '../utils/layout'
import { matchesSearch, searchHits, yearScopedTickets } from '../utils/search'
import { TicketCard } from './TicketCard'

export function TicketCloud() {
  const tickets = useTicketStore((s) => s.tickets)
  const searchQuery = useTicketStore((s) => s.searchQuery)
  const yearRange = useTicketStore((s) => s.yearRange)
  const openTicket = useTicketStore((s) => s.openTicket)

  const cloudTickets = useMemo(
    () => yearScopedTickets(tickets, yearRange),
    [tickets, yearRange],
  )
  const hits = useMemo(
    () => searchHits(cloudTickets, searchQuery),
    [cloudTickets, searchQuery],
  )
  const layouts = useMemo(
    () => layoutTicketCloud(cloudTickets),
    [cloudTickets],
  )
  const layoutMap = useMemo(
    () => new Map(layouts.map((l) => [l.id, l])),
    [layouts],
  )

  const hasQuery = Boolean(searchQuery.trim())
  const noSearchHits = hasQuery && hits.length === 0

  if (tickets.length === 0) {
    return (
      <div className="ticket-cloud ticket-cloud-empty" role="status">
        票夹是空的。点击右上角「收录一张票」开始。
      </div>
    )
  }

  if (cloudTickets.length === 0) {
    return (
      <div className="ticket-cloud ticket-cloud-empty" role="status">
        当前年份范围内没有票。试试点「全部」或切换年份。
      </div>
    )
  }

  return (
    <div className="ticket-cloud" aria-label="票云">
      {cloudTickets.map((ticket) => {
        const layout = layoutMap.get(ticket.id)
        if (!layout) return null
        const matched = hasQuery ? matchesSearch(ticket, searchQuery) : true
        return (
          <TicketCard
            key={ticket.id}
            ticket={ticket}
            layout={layout}
            dimmed={hasQuery && !matched}
            matched={hasQuery && matched}
            onOpen={openTicket}
          />
        )
      })}
      {noSearchHits ? (
        <div className="ticket-cloud-no-hits" role="status">
          没有匹配的票
        </div>
      ) : null}
    </div>
  )
}
