import type { Ticket } from '../types/ticket'
import { Icon } from './Icon'
import { TICKET_TYPE_LABELS } from '../types/ticket'
import {ProgressiveTicketImage} from './ProgressiveTicketImage'
import {displayImageUrl} from '../utils/displayImages'

/** Real tickets use their saved derivative; the original is an explicit view. */
export function TicketFace({ ticket, original = false, thumbnail = false, progressive=false, highResolution=false }: { ticket: Ticket; original?: boolean; thumbnail?: boolean; progressive?:boolean;highResolution?:boolean }) {
  if (!ticket.id.startsWith('mock-')) {
    if(progressive){
      const src=original?ticket.originalImageUrl:highResolution?ticket.processedImageUrl:displayImageUrl(ticket.processedImageUrl,'screen')
      const ratio=original?4/3:ticket.appearance?ticket.appearance.width/ticket.appearance.height:1.59
      return <ProgressiveTicketImage key={src} src={src} preview={ticket.thumbnailUrl} ratio={ratio} alt={`${ticket.departure?.name||'出发地'} → ${ticket.arrival?.name||'到达地'} 票面`}/>
    }
    return <img className="real-ticket" src={original ? ticket.originalImageUrl : thumbnail ? ticket.thumbnailUrl : ticket.processedImageUrl} alt={`${ticket.departure?.name || '出发地'} → ${ticket.arrival?.name || '到达地'} 票面`} draggable={false} />
  }
  const flight = ticket.type === 'flight' || ticket.type === 'boarding-pass'
  const from = ticket.departure?.name || '出发地'
  const to = ticket.arrival?.name || '到达地'
  const cityFrom = ticket.departure?.city || from
  const cityTo = ticket.arrival?.city || to
  const serial = ticket.id.replace('mock-', '').padStart(4, '0')
  return <div className={`paper-ticket ${flight ? 'paper-flight' : ticket.type === 'train' ? 'paper-rail' : 'paper-local'} paper-tone-${Number(serial) % 3}`}>
    <div className="paper-main">
      <div className="paper-heading"><span><Icon name={flight ? 'plane' : 'train'} size={15} />{flight ? 'BOARDING PASS' : '旅途留存 · 车票'}</span><span>NO. {serial}</span></div>
      <div className="paper-route"><div><b>{flight ? cityFrom : from}</b><small>{flight ? from : cityFrom}</small></div><span className="paper-route-line"><small>{ticket.carrierOrTrainNo || 'JOURNEY'}</small><Icon name="arrow" size={22} /></span><div><b>{flight ? cityTo : to}</b><small>{flight ? to : cityTo}</small></div></div>
      <div className="paper-details"><span><small>DATE / 日期</small>{ticket.takenAt?.replaceAll('-', '.') || '日期待补'}</span><span><small>{flight ? 'SEAT / 座位' : 'SEAT / 车厢座位'}</small>{ticket.seat || '自由席'}</span></div>
      <div className="paper-bottom"><span>留一张票，记一段路</span><span>示例 · 非乘车凭证</span></div>
    </div>
    <div className="paper-stub"><span>{TICKET_TYPE_LABELS[ticket.type]}</span><b>{ticket.carrierOrTrainNo || '旅途'}</b><span>{ticket.takenAt?.slice(0, 4) || '—'}</span><span className="paper-perforations" aria-hidden="true">••••••••••••••••</span><small>DEMO</small></div>
  </div>
}
