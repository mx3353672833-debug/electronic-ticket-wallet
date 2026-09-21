import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { Icon } from './Icon'
import { processExistingTickets, type ScanProgress } from '../utils/processTickets'
import { useTicketStore } from '../store/useTicketStore'
import { REMOTE } from '../utils/remote'

export function ProcessingDialog({onClose}:{onClose:()=>void}) {
  const [busy,setBusy]=useState(false),[done,setDone]=useState(false)
  const [progress,setProgress]=useState<ScanProgress|null>(null)
  const [error,setError]=useState('')
  const init=useTicketStore(s=>s.init)
  useEffect(()=>{
    if (!busy) return
    const protect=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''}
    window.addEventListener('beforeunload',protect)
    return ()=>window.removeEventListener('beforeunload',protect)
  },[busy])
  const close=()=>{if(!busy)onClose()}
  return <Modal className="upload-modal batch-modal" label="扫描与识别" onClose={close}>
    <header className="upload-header"><h2>扫描与识别</h2><button className="icon-button" aria-label="关闭扫描" disabled={busy} onClick={close}><Icon name="close" /></button></header>
    <div className="batch-body"><p className="processing-intro">自动裁边、透视校正、保留纸色；识别日期、站点和车次。原始照片和已有故事不会被替换。</p><p className="form-note">{REMOTE ? '使用私密服务器的 OpenCV + Tesseract；已完成的票面保持不变，只继续处理未完成项。' : '使用这台 Mac 的本地扫描服务，'}不调用生成式 AI。褪色、遮挡或无法确定的内容会留待核对。</p>
    {progress && <div className="batch-progress" role="status"><progress value={progress.completed} max={progress.total} aria-label="扫描进度" /><strong>{done ? '已处理' : '正在处理'} {progress.completed} / {progress.total}</strong><span>{busy ? progress.current : `${progress.failed.length} 张处理失败`}</span></div>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {!!progress?.failed.length && <div className="batch-errors">{progress.failed.map(f=><p key={f.name}>{f.name}：{f.error}</p>)}</div>}
    {done ? <button className="primary-button" onClick={close}>查看票夹</button> : <button className="primary-button" disabled={busy} onClick={async()=>{
      setBusy(true);setError('')
      try { await processExistingTickets(setProgress);await init();setDone(true) }
      catch(e){setError(e instanceof Error?e.message:'整理中断，可以重试')}
      finally{setBusy(false)}
    }}>{busy?'扫描中，请勿关闭页面…':'开始整理全部照片'}</button>}
    </div>
  </Modal>
}
