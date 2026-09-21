import { useEffect, useRef, useState } from 'react'
import { useTicketStore } from '../store/useTicketStore'
import { filterTickets, formatRoute } from '../utils/search'
import { StorySidebar } from './StorySidebar'
import { TICKET_TYPE_LABELS } from '../types/ticket'
import { Modal } from './Modal'
import { TicketFace } from './TicketFace'
import { Icon } from './Icon'
import { useReducedMotion } from '../hooks/useReducedMotion'

export function TicketOverlay() {
  const { selectedTicketId, tickets, searchQuery, yearRange, storySidebarOpen, closeTicket, navigateTicket, toggleStorySidebar } = useTicketStore()
  const [original, setOriginal] = useState(false)
  const [zoom, setZoom] = useState(false)
  const [dirty, setDirty] = useState(false)
  const ticketRef = useRef<HTMLDivElement>(null)
  const touch = useRef({ x: 0, y: 0 })
  const reduced = useReducedMotion()
  const ticket = tickets.find(t => t.id === selectedTicketId)
  const filtered = filterTickets(tickets, searchQuery, yearRange)
  const index = filtered.findIndex(t => t.id === selectedTicketId)
  const canNavigate = filtered.length > 1 && index >= 0
  const canLeave = () => !dirty || window.confirm('旅程笔记还没有保存，放弃这次修改吗？')
  const close = () => { if (canLeave()) closeTicket() }
  const navigate = (direction: -1 | 1) => { if (canLeave()) { setDirty(false); setZoom(false); setOriginal(false); navigateTicket(direction) } }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select, [contenteditable]')) return
      if (!canNavigate || dirty) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); navigateTicket(e.key === 'ArrowLeft' ? -1 : 1); setZoom(false); setOriginal(false) }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [canNavigate, dirty, navigateTicket])
  if (!ticket) return null
  return <Modal className={`ticket-overlay ${storySidebarOpen ? 'with-story' : ''}`} label="全屏票面" onClose={close}>
    <div className="overlay-main"><header className="overlay-header"><button className="overlay-back" onClick={close}><Icon name="back" />回到地图</button><span className="overlay-counter">{index >= 0 ? `${String(index + 1).padStart(2, '0')} / ${String(filtered.length).padStart(2, '0')}` : '旅程收藏'}</span><button className="note-toggle" aria-expanded={storySidebarOpen} onClick={() => { if (!storySidebarOpen || canLeave()) { setDirty(false); toggleStorySidebar() } }}><Icon name="note" />{storySidebarOpen ? '收起笔记' : '旅程笔记'}</button></header>
      <div className={`overlay-stage ${zoom ? 'is-zoomed' : ''}`} onTouchStart={e => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }} onTouchEnd={e => { const dx = e.changedTouches[0].clientX - touch.current.x, dy = e.changedTouches[0].clientY - touch.current.y; if (!zoom && canNavigate && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) navigate(dx < 0 ? 1 : -1) }}>
        <div ref={ticketRef} className={`ticket-presentation ${ticket.id.startsWith('mock-') ? 'is-demo' : 'is-photo'}`} onPointerMove={e => {
          if (reduced || zoom || e.pointerType !== 'mouse') return
          const box = e.currentTarget.getBoundingClientRect()
          e.currentTarget.style.transform = `perspective(1100px) rotateX(${(0.5 - (e.clientY - box.top) / box.height) * 7}deg) rotateY(${((e.clientX - box.left) / box.width - .5) * 9}deg)`
        }} onPointerLeave={e => { e.currentTarget.style.transform = '' }}><TicketFace ticket={ticket} original={original} /></div>
      </div>
      <div className="overlay-details"><div><span className="eyebrow">{TICKET_TYPE_LABELS[ticket.type]} · {ticket.takenAt?.replaceAll('-', '.') || '日期待补'}</span><h2>{formatRoute(ticket)}</h2><p>{ticket.id.startsWith('mock-') ? '示例票面 · 非真实行程' : ticket.processing ? (original ? '原始照片' : '校正票面') + (ticket.processing.reviewed ? ' · 已核对' : ' · 识别待核对') : '尚未扫描'}</p></div><div className="ticket-tools">{!ticket.id.startsWith('mock-') && <><button className="icon-button" aria-label={original ? '查看票面' : '查看原图'} aria-pressed={original} onClick={() => setOriginal(!original)}><Icon name="image" /></button><button className="icon-button" aria-label={zoom ? '缩小票面' : '放大票面'} onClick={() => { setZoom(!zoom); if (ticketRef.current) ticketRef.current.style.transform = '' }}><Icon name={zoom ? 'zoomOut' : 'zoomIn'} /></button></>}{canNavigate && <><button className="icon-button" aria-label="上一张" onClick={() => navigate(-1)}><Icon name="back" /></button><button className="icon-button" aria-label="下一张" onClick={() => navigate(1)}><Icon name="arrow" /></button></>}</div></div>
    </div>
    {storySidebarOpen && <StorySidebar key={ticket.id} ticket={ticket} onDirty={setDirty} onClose={() => { if (canLeave()) { setDirty(false); toggleStorySidebar(false) } }} />}
  </Modal>
}
