import { useEffect, useRef, useState } from 'react'
import type { TicketType } from '../types/ticket'
import { TICKET_TYPE_LABELS } from '../types/ticket'
import { useTicketStore } from '../store/useTicketStore'
import { makeThumbnail } from '../utils/images'
import { Modal } from './Modal'
import { Icon } from './Icon'
import { BatchImportModal } from './BatchImportModal'

export function UploadModal() {
  const { setUploadOpen, addUploadedTicket, openTicket, toggleStorySidebar, setSearchQuery, setYearRange } = useTicketStore()
  const input = useRef<HTMLInputElement>(null)
  const [selection, setSelection] = useState<{ file: File; preview: string } | null>(null)
  const file = selection?.file || null
  const preview = selection?.preview || ''
  const selectFile = (next: File | undefined) => {
    setSelection(next ? { file: next, preview: URL.createObjectURL(next) } : null)
    setError('')
  }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [batchMode, setBatchMode] = useState(false)
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  const close = () => { if (!saving && (!file || window.confirm('这张票还未保存，要关闭收录吗？'))) setUploadOpen(false) }
  if (batchMode) return <BatchImportModal />
  return <Modal className="upload-modal" label="收录一张票" onClose={close}>
    <header className="upload-header"><div><span className="eyebrow">A NEW MEMORY</span><h2>把这一程留下。</h2></div><button className="icon-button" aria-label="关闭收录" disabled={saving} onClick={close}><Icon name="close" /></button></header>
    <form className="upload-body" onSubmit={async e => {
      e.preventDefault(); if (!file) return
      const data = new FormData(e.currentTarget), value = (key: string) => String(data.get(key) || '').trim()
      setSaving(true); setError('')
      try { const thumbnail = await makeThumbnail(file); const id = await addUploadedTicket({ file, thumbnail, type: value('type') as TicketType, takenAt: value('takenAt') || null, departureName: value('departureName'), departureCity: value('departureCity'), arrivalName: value('arrivalName'), arrivalCity: value('arrivalCity'), carrierOrTrainNo: value('carrierOrTrainNo'), story: value('story'), tags: [] }); setSearchQuery(''); setYearRange(null); openTicket(id); toggleStorySidebar(true) }
      catch (err) { setError(err instanceof Error ? err.message : '保存失败，请重试') }
      finally { setSaving(false) }
    }}>
      <div className="upload-preview-col"><input ref={input} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" aria-label="选择票据照片" disabled={saving} onChange={e => selectFile(e.target.files?.[0])} />
        <button type="button" className={`photo-drop ${preview ? 'has-photo' : ''}`} disabled={saving} onClick={() => input.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!saving && e.dataTransfer.files[0]) selectFile(e.dataTransfer.files[0]) }}>{preview ? <img src={preview} alt="待收录的票据照片" /> : <><Icon name="upload" size={32} /><strong>选择一张票的照片</strong><span>也可以把照片拖到这里</span><small>JPG / PNG / WebP · 最大 40 MB</small></>}</button>
        {file && <p className="selected-file">{file.name} <span>点击照片可更换</span></p>}<p className="upload-note">保留原始照片与颜色。自动裁边尚未接入，当前按原图收录。</p>
        <button type="button" className="text-button" disabled={saving || !!file} onClick={() => setBatchMode(true)}>批量收录照片 <Icon name="arrow" size={14} /></button>
      </div>
      <div className="upload-form"><div className="form-row"><label>票据类型<select name="type">{Object.entries(TICKET_TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>出发日期<input type="date" name="takenAt" /></label></div>
        <div className="form-row"><label>出发地<input name="departureName" placeholder="如：大连北站" /></label><label>到达地<input name="arrivalName" placeholder="如：北京站" /></label></div>
        <div className="form-row"><label>出发城市<input name="departureCity" placeholder="如：大连" /></label><label>到达城市<input name="arrivalCity" placeholder="如：北京" /></label></div>
        <label>车次 / 航班<input name="carrierOrTrainNo" placeholder="如：G3501 / CA1606" /></label>
        <label>这段旅程的故事<textarea rows={4} name="story" placeholder="可以先留白，哪天想起来再补。" /></label>
        <p className="form-note">除了照片，其余信息都可以之后补充。</p>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button save-ticket" type="submit" disabled={!file || saving}><Icon name="plus" />{saving ? '正在保存原图…' : '收录到票夹'}</button><p className="form-footnote">仅保存到当前浏览器，不会上传照片。</p>
      </div>
    </form>
  </Modal>
}
