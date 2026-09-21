import { useEffect, useRef, useState } from 'react'
import { Modal } from './Modal'
import { Icon } from './Icon'
import { useTicketStore } from '../store/useTicketStore'
import { importTicketFiles, type ImportReport } from '../utils/importTickets'
import { REMOTE } from '../utils/remote'

export function BatchImportModal() {
  const { init, setUploadOpen, setSearchQuery, setYearRange } = useTicketStore()
  const input = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [report, setReport] = useState<ImportReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!busy) return
    const protect = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [busy])
  const close = () => { if (!busy) setUploadOpen(false) }
  return <Modal className="upload-modal batch-modal" label="批量收录照片" onClose={close}>
    <header className="upload-header"><h2>添加票据照片</h2><button className="icon-button" aria-label="关闭批量收录" disabled={busy} onClick={close}><Icon name="close" /></button></header>
    <div className="batch-body">
      <input ref={input} className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,image/avif" aria-label="选择多张票据照片" disabled={busy} onChange={e => { setFiles(Array.from(e.target.files || []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))); setReport(null); setDone(false); setError('') }} />
      {!busy && !done && <button className="photo-drop" onClick={() => input.current?.click()}><Icon name="upload" size={30} /><strong>{files.length ? `已选择 ${files.length} 张照片` : '选择多张票据照片'}</strong><span>{files.length ? `合计 ${(files.reduce((n, f) => n + f.size, 0) / 1048576).toFixed(1)} MB · 点击可重新选择` : '可以一次选中整个文件夹内的照片'}</span></button>}
      {files.length > 0 && !report && <p className="batch-file-range">{files[0].name} … {files.at(-1)!.name}</p>}
      <p className="upload-note">每张照片会自动裁边、校正并识别票面。原图单独保留，重复照片自动跳过；识别不清楚的字段留待核对。</p>
      {report && <div className="batch-progress" role="status" aria-live="polite"><progress aria-label="照片收录进度" value={report.completed} max={report.total} /><strong>{done ? '收录完成' : '正在收录'} · {report.completed} / {report.total}</strong><span>{!done && report.current}</span><p>成功 {report.imported} 张 · 重复跳过 {report.skipped} 张 · 失败 {report.failed.length} 张</p></div>}
      {!!report?.failed.length && <div className="batch-errors" role="alert">{report.failed.map(f => <p key={f.name}>{f.name}：{f.error}</p>)}<p>已经成功的照片会保留，可重新选择文件重试，内容去重不会覆盖原有笔记。</p></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {done ? <button className="primary-button save-ticket" onClick={close}><Icon name="check" />完成，回到票夹</button> : <button className="primary-button save-ticket" disabled={!files.length || busy} onClick={async () => {
        setBusy(true); setError('')
        try {
          await importTicketFiles(files, setReport)
          await init()
          setSearchQuery(''); setYearRange(null); setDone(true)
        } catch (e) { setError(e instanceof Error ? e.message : '收录中断，可重新选择文件重试') }
        finally { setBusy(false) }
      }}><Icon name="plus" />{busy ? '正在保存，请不要关闭页面…' : `收录${files.length ? ` ${files.length} 张` : ''}照片`}</button>}
      <p className="form-footnote">{REMOTE ? '上传到你的私密服务器，登录后才能查看。使用传统扫描与 OCR，不调用生成式 AI。' : '仅保存在当前浏览器，不发送到云端。'}原文件请继续保留。</p>
    </div>
  </Modal>
}
