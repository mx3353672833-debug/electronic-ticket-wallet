import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { Icon } from './Icon'
import { processExistingTickets, type ScanProgress } from '../utils/processTickets'
import { useTicketStore } from '../store/useTicketStore'
import { REMOTE } from '../utils/remote'
import {updateAllTrainRoutes} from '../utils/trainRoutes'

export function ProcessingDialog({onClose}:{onClose:()=>void}) {
  const [busy,setBusy]=useState(false),[done,setDone]=useState(false)
  const [progress,setProgress]=useState<ScanProgress|null>(null)
  const [error,setError]=useState('')
  const [routing,setRouting]=useState(false)
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
    <div className="batch-body"><p className="processing-intro">自动裁边、透视校正，识别日期、站点和车次。原始照片和已有故事不会被替换。</p><p className="form-note">{REMOTE ? '使用私密服务器的 OpenCV + Tesseract。已扫描的票只补齐统一外观，不重复识别；已整理好的票保持不变。' : '使用这台 Mac 的本地扫描服务，'}不调用生成式 AI。褪色、遮挡或无法确定的内容会留待核对。</p>
    <p className="form-note">线路可单独按车次更新，不重新扫描照片。</p>
    {progress && <div className="batch-progress" role="status"><progress value={progress.completed} max={progress.total || 1} aria-label={routing?'线路进度':'扫描进度'} /><strong>{done ? '已处理' : '正在处理'} {progress.completed} / {progress.total}</strong><span>{busy ? progress.current : routing ? `${progress.updated || 0} 张线路已更新 · ${progress.unavailable || 0} 张暂无数据 · ${progress.failed.length} 张失败` : `${progress.failed.length} 张处理失败`}</span></div>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {!!progress?.failed.length && <div className="batch-errors">{progress.failed.map(f=><p key={f.name}>{f.name}：{f.error}</p>)}</div>}
    {done ? <button className="primary-button" onClick={close}>查看票夹</button> : <button className="primary-button" disabled={busy} onClick={async()=>{
      setBusy(true);setError('');setRouting(false)
      try { await processExistingTickets(setProgress);await init();setDone(true) }
      catch(e){setError(e instanceof Error?e.message:'整理中断，可以重试')}
      finally{setBusy(false)}
    }}>{busy && !routing?'扫描中，请勿关闭页面…':'开始整理全部照片'}</button>}
    {!done && <button className="text-button" disabled={busy} onClick={async()=>{
      setBusy(true);setError('');setRouting(true)
      try{setProgress(await updateAllTrainRoutes(setProgress));await init();setDone(true)}
      catch(e){setError(e instanceof Error?e.message:'线路更新失败，请重试')}
      finally{setBusy(false)}
    }}>{busy && routing?'正在更新车次线路…':'按车次更新全部线路'}</button>}
    </div>
  </Modal>
}
