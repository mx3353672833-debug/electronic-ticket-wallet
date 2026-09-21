import { useMemo } from 'react'
import { useTicketStore } from '../store/useTicketStore'
import { getYearsFromTickets } from '../utils/layout'

export function YearTimeline() {
  const tickets = useTicketStore((s) => s.tickets)
  const yearRange = useTicketStore((s) => s.yearRange)
  const setYearRange = useTicketStore((s) => s.setYearRange)

  const years = useMemo(() => getYearsFromTickets(tickets), [tickets])

  if (years.length === 0) return null

  return (
    <div className="year-timeline" role="group" aria-label="年份筛选">
      <button
        type="button"
        className={!yearRange ? 'is-active' : undefined}
        onClick={() => setYearRange(null)}
      >
        全部
      </button>
      {years.map((year) => {
        const active =
          yearRange && yearRange.start === year && yearRange.end === year
        return (
          <button
            key={year}
            type="button"
            className={active ? 'is-active' : undefined}
            onClick={() => {
              if (active) setYearRange(null)
              else setYearRange({ start: year, end: year })
            }}
          >
            {year}
          </button>
        )
      })}
    </div>
  )
}
