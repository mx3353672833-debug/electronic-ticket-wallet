import { useEffect, useRef, useState } from 'react'
import { useTicketStore } from '../store/useTicketStore'
import { filterTickets, formatRoute } from '../utils/search'
import { Icon } from './Icon'
import {warmTicketImage} from '../utils/displayImages'

export function SearchBar() {
  const { searchQuery, setSearchQuery, tickets, yearRange, openTicket } = useTicketStore()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const results = filterTickets(tickets, searchQuery, yearRange)
  const shown = results.slice(0, 8)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k' && !document.querySelector('dialog[open]')) { e.preventDefault(); input.current?.focus() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  return <div className="search-bar" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false) }}>
    <div className="search-input-wrap"><Icon name="search" /><input ref={input} type="search" name="ticket-search" autoComplete="off" aria-label="搜索票据" placeholder="搜索地点、日期、车次或故事" value={searchQuery} onFocus={() => setOpen(true)} onChange={e => { setSearchQuery(e.target.value); setActive(0); setOpen(true) }} onKeyDown={e => {
      if (e.key === 'Escape') { setOpen(false); input.current?.blur() }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.max(0,Math.min(active + 1, shown.length - 1))) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(0, active - 1)) }
      if (e.key === 'Enter' && open && searchQuery.trim() && shown[Math.min(active,shown.length-1)]) { e.preventDefault();openTicket(shown[Math.min(active,shown.length-1)].id); setOpen(false) }
    }} />{searchQuery ? <button className="clear-search" aria-label="清除搜索" onClick={() => { setSearchQuery(''); input.current?.focus() }}><Icon name="close" size={14} /></button> : <kbd>⌘ K</kbd>}</div>
    {open && searchQuery.trim() && <div className="search-results" aria-label="搜索结果"><div className="search-result-label">{results.length ? `找到 ${results.length} 张票` : '没有匹配的票'}</div>{shown.map((ticket, i) => <button key={ticket.id} className={`search-result-item ${i === active ? 'active' : ''}`} onFocus={()=>warmTicketImage(ticket.processedImageUrl)} onPointerEnter={()=>warmTicketImage(ticket.processedImageUrl)} onPointerDown={e => e.preventDefault()} onClick={() => { openTicket(ticket.id); setOpen(false) }}><span>{formatRoute(ticket)}</span><small>{ticket.takenAt || '日期待补'} · {ticket.carrierOrTrainNo || '旅程'}</small><Icon name="arrow" size={16} /></button>)}</div>}
  </div>
}
