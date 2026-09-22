import { useEffect, useRef, useState } from 'react'
import { useTicketStore } from '../store/useTicketStore'
import { filterTickets, formatRoute } from '../utils/search'
import { StorySidebar } from './StorySidebar'
import { TICKET_TYPE_LABELS } from '../types/ticket'
import { Modal } from './Modal'
import { TicketFace } from './TicketFace'
import { Icon } from './Icon'
import { useReducedMotion } from '../hooks/useReducedMotion'
import {motion,useAnimate} from 'motion/react'
import {originTransform} from '../utils/ticketMotion'
import {missingJourneyFields} from '../utils/ticketCompleteness'

export function TicketOverlay() {
  const { selectedTicketId, tickets, searchQuery, yearRange, storySidebarOpen, ticketOrigin, closeTicket, navigateTicket, toggleStorySidebar } = useTicketStore()
  const [original, setOriginal] = useState(false)
  const [zoom, setZoom] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [closing,setClosing]=useState(false)
  const [editMissingFor,setEditMissingFor]=useState<string|null>(null)
  const [scope,animate]=useAnimate()
  const flight=useRef<HTMLDivElement>(null)
  const settled=useRef(false)
  const entryBounds=useRef<DOMRect|null>(null)
  const leaving=useRef(false)
  const ticketRef = useRef<HTMLDivElement>(null)
  const touch = useRef({ x: 0, y: 0 })
  const reduced = useReducedMotion()
  const ticket = tickets.find(t => t.id === selectedTicketId)
  const filtered = filterTickets(tickets, searchQuery, yearRange)
  const index = filtered.findIndex(t => t.id === selectedTicketId)
  const canNavigate = filtered.length > 1 && index >= 0
  const canLeave = () => !dirty || window.confirm('旅程笔记还没有保存，放弃这次修改吗？')
  const close = () => {
    if(leaving.current||!canLeave())return
    leaving.current=true;setClosing(true)
    if(ticketRef.current)ticketRef.current.style.transform=''
    if(reduced||!flight.current){closeTicket();return}
    const target=originTransform(ticketOrigin,!settled.current&&entryBounds.current?entryBounds.current:flight.current.getBoundingClientRect())
    void animate(flight.current,{...target,opacity:ticketOrigin?1:0},{duration:.26,ease:[.32,0,.67,0]}).then(closeTicket)
  }
  const navigate = (direction: -1 | 1) => { if (!leaving.current && canLeave()) { setDirty(false); setZoom(false); setOriginal(false); navigateTicket(direction) } }
  useEffect(()=>{
    settled.current=false
    const frame=requestAnimationFrame(()=>{
      if(!flight.current||leaving.current)return
      entryBounds.current=flight.current.getBoundingClientRect()
      const start=originTransform(ticketOrigin,entryBounds.current)
      void animate(flight.current,{x:[start.x,0],y:[start.y,0],scaleX:[start.scaleX,1],scaleY:[start.scaleY,1],opacity:[1,1]},
        reduced?{duration:0}:{type:'spring',duration:.48,bounce:.04}).then(()=>{settled.current=true})
    })
    return ()=>cancelAnimationFrame(frame)
  },[selectedTicketId,ticketOrigin,reduced,animate])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select, [contenteditable]')) return
      if (!canNavigate || dirty || leaving.current) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); navigateTicket(e.key === 'ArrowLeft' ? -1 : 1); setZoom(false); setOriginal(false) }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [canNavigate, dirty, navigateTicket])
  if (!ticket) return null
  const missing=missingJourneyFields(ticket)
  return <Modal className={`ticket-overlay ${storySidebarOpen ? 'with-story' : ''} ${closing?'is-closing':''}`} label="全屏票面" onClose={close}>
    <motion.div className="ticket-viewer-backdrop" initial={{opacity:0}} animate={{opacity:closing?0:1}} transition={{duration:reduced?0:.28}}/>
    <div ref={scope} className="overlay-main"><header className="overlay-header"><button className="overlay-back" onClick={close}><Icon name="back" />回到地图</button><span className="overlay-counter">{index >= 0 ? `${String(index + 1).padStart(2, '0')} / ${String(filtered.length).padStart(2, '0')}` : '旅程收藏'}</span><button className="note-toggle" aria-expanded={storySidebarOpen} onClick={() => { if (!storySidebarOpen || canLeave()) { setDirty(false);setEditMissingFor(null); toggleStorySidebar() } }}><Icon name="note" />{storySidebarOpen ? '收起笔记' : '旅程笔记'}</button></header>
      <div className={`overlay-stage ${zoom ? 'is-zoomed' : ''}`} onTouchStart={e => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }} onTouchEnd={e => { const dx = e.changedTouches[0].clientX - touch.current.x, dy = e.changedTouches[0].clientY - touch.current.y; if (!zoom && canNavigate && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) navigate(dx < 0 ? 1 : -1) }}>
        <div ref={flight} className="ticket-flight" style={{opacity:0,'--ticket-ratio':original?4/3:ticket.appearance?ticket.appearance.width/ticket.appearance.height:1.59} as React.CSSProperties}><div ref={ticketRef} className={`ticket-presentation ${ticket.id.startsWith('mock-') ? 'is-demo' : 'is-photo'}`} onPointerMove={e => {
          if (reduced || zoom || !settled.current || leaving.current || e.pointerType !== 'mouse') return
          const box = e.currentTarget.getBoundingClientRect()
          e.currentTarget.style.transform = `perspective(1100px) rotateX(${(0.5 - (e.clientY - box.top) / box.height) * 7}deg) rotateY(${((e.clientX - box.left) / box.width - .5) * 9}deg)`
        }} onPointerLeave={e => { e.currentTarget.style.transform = '' }}><TicketFace ticket={ticket} original={original} progressive highResolution={zoom} /></div></div>
      </div>
      <div className="overlay-details"><div><span className="eyebrow">{TICKET_TYPE_LABELS[ticket.type]}{ticket.takenAt?` · ${ticket.takenAt.replaceAll('-', '.')}`:''}{ticket.carrierOrTrainNo?` · ${ticket.carrierOrTrainNo}`:''}</span><h2>{formatRoute(ticket)}</h2>{original&&<p>原始照片</p>}{missing.length>0&&<button className="missing-info-link" onClick={()=>{if(canLeave()){setDirty(false);setEditMissingFor(ticket.id);toggleStorySidebar(true)}}}>待补充 · {missing.map(field=>field.label).join('、')} <Icon name="arrow" size={13}/></button>}</div><div className="ticket-tools">{!ticket.id.startsWith('mock-') && <><button className="icon-button" title={original ? '查看票面' : '查看原图'} aria-label={original ? '查看票面' : '查看原图'} aria-pressed={original} onClick={() => setOriginal(!original)}><Icon name="image" /></button><button className="icon-button" title={zoom ? '缩小票面' : '放大票面'} aria-label={zoom ? '缩小票面' : '放大票面'} onClick={() => { setZoom(!zoom); if (ticketRef.current) ticketRef.current.style.transform = '' }}><Icon name={zoom ? 'zoomOut' : 'zoomIn'} /></button></>}{canNavigate && <><button className="icon-button" title="上一张 · ←" aria-label="上一张" onClick={() => navigate(-1)}><Icon name="back" /></button><button className="icon-button" title="下一张 · →" aria-label="下一张" onClick={() => navigate(1)}><Icon name="arrow" /></button></>}</div></div>
    </div>
    {storySidebarOpen && <StorySidebar key={ticket.id+':'+(editMissingFor===ticket.id)} initialEdit={editMissingFor===ticket.id?'missing':undefined} ticket={ticket} onDirty={setDirty} onClose={() => { if (canLeave()) { setDirty(false);setEditMissingFor(null); toggleStorySidebar(false) } }} />}
  </Modal>
}
