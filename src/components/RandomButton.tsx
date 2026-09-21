import { useTicketStore } from '../store/useTicketStore'
import { filterTickets } from '../utils/search'

export function RandomButton() {
  const tickets = useTicketStore((s) => s.tickets)
  const searchQuery = useTicketStore((s) => s.searchQuery)
  const yearRange = useTicketStore((s) => s.yearRange)
  const randomTicket = useTicketStore((s) => s.randomTicket)

  const filteredCount = filterTickets(tickets, searchQuery, yearRange).length
  const disabled = filteredCount === 0

  return (
    <div className="random-button-wrap">
      {disabled ? (
        <p className="random-hint" role="status">
          当前结果为空，无法随机
        </p>
      ) : null}
      <button
        type="button"
        className="random-button"
        disabled={disabled}
        onClick={() => randomTicket()}
        title={disabled ? '当前结果为空' : '从当前结果集抽一张'}
      >
        ↻ 随机翻一张
      </button>
    </div>
  )
}
