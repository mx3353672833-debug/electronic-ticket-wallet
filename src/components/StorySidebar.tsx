import { useRef, useState } from 'react'
import type { Ticket } from '../types/ticket'
import { useTicketStore } from '../store/useTicketStore'
import { readTrackFile, trackLength } from '../utils/tracks'
import { Icon } from './Icon'
import { REMOTE } from '../utils/remote'

export function StorySidebar({ ticket, onDirty, onClose }: { ticket: Ticket; onDirty: (dirty: boolean) => void; onClose: () => void }) {
  const updateDetails = useTicketStore(s => s.updateDetails)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  const importTrack = async (file: File | undefined) => {
    if (!file) return
    setImporting(true); setError(''); setNotice('')
    try { const track = await readTrackFile(file); await updateDetails(ticket.id, { track }); setNotice('轨迹已关联。回到地图即可查看。') }
    catch (e) { setError(e instanceof Error ? e.message : '轨迹导入失败，请重试') }
    finally { setImporting(false); if (fileInput.current) fileInput.current.value = '' }
  }
  return <aside className="story-sidebar" aria-label="旅程笔记"><div className="story-sidebar-header"><span>信息</span><button className="icon-button" aria-label="关闭旅程笔记" onClick={onClose}><Icon name="close" /></button></div><h2>旅程笔记</h2>
    {editing ? <form className="story-edit" onChange={() => onDirty(true)} onSubmit={async e => {
      e.preventDefault(); setSaving(true); setError('')
      const data = new FormData(e.currentTarget)
      const value = (name: string) => String(data.get(name) || '').trim()
      const processing = ticket.processing ? { ...ticket.processing, departureTime: value('departureTime') || null, amount: value('amount') ? Number(value('amount')) : null } : undefined
      const place = (prefix: string, previous: Ticket['departure']) => {
        const name = value(prefix + 'Name'), city = value(prefix + 'City')
        if (!name && !city) return null
        const unchanged = name === (previous?.name || '') && city === (previous?.city || '')
        return { name: name || city, city: city || undefined, ...(unchanged ? { lat: previous?.lat, lng: previous?.lng } : {}) }
      }
      try { await updateDetails(ticket.id, { story: value('story'), tags: value('tags').split(/[,，、]/).filter(Boolean).map(s => s.trim()), takenAt: value('takenAt') || null, departure: place('departure', ticket.departure), arrival: place('arrival', ticket.arrival), carrierOrTrainNo: value('carrierOrTrainNo'), seat: value('seat'), processing, companions: value('companions').split(/[,，、]/).filter(Boolean).map(s => s.trim()) }); setEditing(false); onDirty(false); setNotice('笔记已保存') }
      catch (err) { setError(err instanceof Error ? err.message : '保存失败，请重试') }
      finally { setSaving(false) }
    }}>
      <label>旅程故事<textarea name="story" defaultValue={ticket.story} rows={5} placeholder="记录这段旅程…" /></label>
      <label>日期<input name="takenAt" type="date" defaultValue={ticket.takenAt || ''} /></label>
      <div className="form-row"><label>出发地<input name="departureName" defaultValue={ticket.departure?.name || ''} /></label><label>出发城市<input name="departureCity" defaultValue={ticket.departure?.city || ''} /></label></div>
      <div className="form-row"><label>到达地<input name="arrivalName" defaultValue={ticket.arrival?.name || ''} /></label><label>到达城市<input name="arrivalCity" defaultValue={ticket.arrival?.city || ''} /></label></div>
      <label>车次 / 航班<input name="carrierOrTrainNo" defaultValue={ticket.carrierOrTrainNo || ''} /></label>
      <label>车厢 / 座位<input name="seat" defaultValue={ticket.seat || ''} /></label>
      {ticket.processing && <div className="form-row"><label>出发时间<input type="time" name="departureTime" defaultValue={ticket.processing.departureTime || ''} /></label><label>票价<input type="number" min="0" step="0.01" name="amount" defaultValue={ticket.processing.amount ?? ''} /></label></div>}
      <label>同行的人<input name="companions" defaultValue={ticket.companions.join('，')} /></label><label>标签（逗号分隔）<input name="tags" defaultValue={ticket.tags.join('，')} /></label>
      <div className="form-actions"><button type="submit" className="primary-button" disabled={saving}>{saving ? '保存中…' : '保存笔记'}</button><button type="button" onClick={() => { setEditing(false); onDirty(false) }} disabled={saving}>取消</button></div>
    </form> : <><div className="story-date">{ticket.takenAt?.replaceAll('-', '.') || '日期待补'}<span>{ticket.carrierOrTrainNo}</span></div><div className="story-route"><span>{ticket.departure?.name || '出发地待补'}</span><Icon name="arrow" /><span>{ticket.arrival?.name || '到达地待补'}</span></div><p className="story-text">{ticket.story || '还没有笔记。'}</p>{ticket.companions.length > 0 && <p className="companions">同行 · {ticket.companions.join('、')}</p>}<div className="story-tags">{ticket.tags.map(t => <span key={t}>{t}</span>)}</div><button className="text-button" onClick={() => { setNotice(''); setEditing(true) }}>编辑信息与故事 <Icon name="arrow" size={14} /></button></>}
    {ticket.processing && <section className="recognition-section"><h3>票面识别</h3><dl><dt>处理</dt><dd>{ticket.processing.cropped ? '已裁边 · 已校正透视' : '裁边未成功，保留原照片范围'}</dd><dt>凭证</dt><dd>{ticket.processing.documentKind === 'refund' ? '退票费凭证，不计作已出行' : ticket.processing.documentKind === 'boarding' ? '登机牌' : '火车票'}</dd><dt>座位</dt><dd>{ticket.seat || '未识别'}</dd><dt>出发时间</dt><dd>{ticket.processing.departureTime || '未识别'}</dd><dt>票价</dt><dd>{ticket.processing.amount == null ? '未识别' : `¥${ticket.processing.amount.toFixed(2)}`}</dd></dl><p className="review-status">{ticket.processing.reviewed ? '已人工核对' : 'OCR 识别，尚未人工核对'}</p>{ticket.processing.issues.length > 0 && <ul className="recognition-issues">{ticket.processing.issues.map(s=><li key={s}>{s}</li>)}</ul>}{!ticket.processing.reviewed && <button className="text-button" disabled={saving || editing} onClick={async()=>{try {await updateDetails(ticket.id,{processing:{...ticket.processing!,reviewed:true}})} catch {setError('保存核对状态失败')}}}>我已对照票面核对</button>}</section>}
    <section className="track-section"><div className="track-section-title"><Icon name="map" /><h3>线路</h3></div>{ticket.track ? <><p className="track-info">已导入轨迹 · {trackLength(ticket.track).toFixed(1)} km</p><p className="track-filename">{ticket.track.filename}</p></> : ticket.railRoute ? <><p>{ticket.railRoute.distanceKm} km · {ticket.railRoute.segments.reduce((n,s)=>n+s.length,0).toLocaleString()} 个实际路网点</p><p>{ticket.railRoute.lineNames.join(' / ') || 'OSM 铁路轨道'}</p><p className="route-caution">沿实际铁路线形推算的线路，不代表已确认这趟历史车次的经由。路网快照：{ticket.railRoute.datasetDate}。</p><a className="source-link" href={ticket.railRoute.sourceUrl} target="_blank" rel="noreferrer">{ticket.railRoute.attribution}</a></> : <p>{ticket.processing?.documentKind==='refund' ? '退票费凭证不自动生成行程。' : '还没有可确认的线路，不绘制起终点直线。可以导入实际行程轨迹。'}</p>}<input className="sr-only" ref={fileInput} type="file" accept=".gpx,.geojson,.json" aria-label="选择轨迹文件" onChange={e => void importTrack(e.target.files?.[0])} /><button className="track-import" disabled={importing || saving || editing} onClick={() => fileInput.current?.click()}><Icon name="upload" size={15} />{importing ? '正在读取轨迹…' : ticket.track ? '替换轨迹文件' : '导入 GPX / GeoJSON'}</button><small>{REMOTE ? '轨迹保存在私密服务器。' : '轨迹文件仅保存在当前浏览器。'}</small></section>
    {REMOTE && <p className="form-note">此票的笔记和轨迹保存在私密服务器，登录后可跨设备查看。</p>}
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="saved-notice" role="status"><Icon name="check" size={14} />{notice}</p>}
  </aside>
}
