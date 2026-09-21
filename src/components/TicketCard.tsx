import type { Ticket } from '../types/ticket'
import { TICKET_TYPE_LABELS } from '../types/ticket'
import { formatRoute, ticketHasIncompleteJourney } from '../utils/search'
import type { CloudLayout } from '../utils/layout'

type Props = {
  ticket: Ticket
  layout: CloudLayout
  dimmed: boolean
  matched: boolean
  onOpen: (id: string) => void
}

export function TicketCard({ ticket, layout, dimmed, matched, onOpen }: Props) {
  return (
    <button
      type="button"
      className={`ticket-card${dimmed ? ' is-dimmed' : ''}${matched ? ' is-matched' : ''}`}
      style={{
        left: `${layout.x}%`,
        top: `${layout.y}%`,
        transform: `translate(-50%, -50%) rotate(${layout.rotate}deg) scale(${layout.scale})`,
        zIndex: layout.zIndex,
      }}
      onClick={() => onOpen(ticket.id)}
      aria-label={`${formatRoute(ticket)} ${ticket.takenAt ?? ''}`}
    >
      <img src={ticket.thumbnailUrl} alt="" draggable={false} />
      <div className="ticket-card-meta">
        <span>{TICKET_TYPE_LABELS[ticket.type]}</span>
        <strong>{formatRoute(ticket)}</strong>
        <span>{ticket.takenAt ?? '日期待补'}</span>
        {ticket.carrierOrTrainNo ? <span>{ticket.carrierOrTrainNo}</span> : null}
        {ticketHasIncompleteJourney(ticket) ? (
          <em className="ticket-hint">建议补全日期/出发地/到达地</em>
        ) : null}
      </div>
    </button>
  )
}
