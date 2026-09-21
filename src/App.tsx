import { lazy, Suspense, useEffect, useState } from 'react'
import { useTicketStore } from './store/useTicketStore'
import { SearchBar } from './components/SearchBar'
import { YearTimeline } from './components/YearTimeline'
import { TicketOverlay } from './components/TicketOverlay'
import { BatchImportModal } from './components/BatchImportModal'
import { ProcessingDialog } from './components/ProcessingDialog'
import { Icon } from './components/Icon'
import { filterTickets, formatRoute } from './utils/search'
import { exportWallet } from './utils/exportWallet'
import { REMOTE } from './utils/remote'
import { AccountTools } from './components/AccountTools'
import { ReleaseNotes } from './components/ReleaseNotes'
import { readTrayCollapsed, saveTrayCollapsed } from './utils/trayPreference'
import { readMapPhotos, saveMapPhotos } from './utils/mapPreference'

const TicketMap = lazy(() => import('./components/TicketMap').then(m => ({ default: m.TicketMap })))

export default function App() {
  const { ready, loadError, init, tickets, searchQuery, yearRange, selectedTicketId, uploadOpen, setUploadOpen, openTicket, randomTicket } = useTicketStore()
  const [fitRequest, setFitRequest] = useState(0)
  const [processing, setProcessing] = useState(false)
  const [backupStatus, setBackupStatus] = useState('')
  const [trayCollapsed, setTrayCollapsed] = useState(readTrayCollapsed)
  const [showPhotos, setShowPhotos] = useState(readMapPhotos)
  useEffect(() => { void init() }, [init])
  const hits = filterTickets(tickets, searchQuery, yearRange)
  const scanned = tickets.filter(t => t.processing).length
  const routed = tickets.filter(t => t.track || t.railRoute).length
  if (!ready) return <div className="app-loading" role="status">正在打开票夹…</div>
  return <div className={`app-shell${trayCollapsed ? ' is-tray-collapsed' : ''}`} data-testid="ticket-wallet-home">
    <main className="map-stage"><Suspense fallback={<div className="app-loading">正在加载地图…</div>}><TicketMap fitRequest={fitRequest} showPhotos={showPhotos} /></Suspense></main>
    <header className="app-header">
      <div className="collection-title"><h1>地点</h1><span>{tickets.length} 张票</span></div>
      <div className="floating-search"><SearchBar /></div>
      <nav className="header-tools" aria-label="票夹工具"><ReleaseNotes />{REMOTE && <AccountTools />}<button className="toolbar-button" aria-label="扫描与识别票面" onClick={() => setProcessing(true)} disabled={!tickets.length}><Icon name="image" size={18} /><span>{REMOTE ? '检查整理' : scanned ? '重新整理' : '整理票面'}</span></button><button className="add-button" aria-label="上传票据照片" onClick={() => setUploadOpen(true)}><Icon name="plus" size={22} /><span>添加</span></button></nav>
    </header>
    {loadError && <p className="app-error" role="alert">{loadError}<button onClick={() => void init()}>重试</button></p>}
    {import.meta.env.DEV && <button style={{position:'fixed',left:24,top:88,zIndex:500}} disabled={!!backupStatus && !backupStatus.startsWith('已') && !backupStatus.startsWith('失败')} onClick={() => void exportWallet(setBackupStatus).catch(e => setBackupStatus('失败：' + e.message))}>{backupStatus || '导出私密迁移备份'}</button>}
    <div className="map-controls"><button className="map-fit" onClick={() => setFitRequest(n=>n+1)} aria-label="查看所有线路" title="查看所有线路"><Icon name="globe" /></button><button className="map-photos-toggle" aria-label="只看轨迹线" aria-pressed={!showPhotos} title={showPhotos?'隐藏地图票面，只看轨迹线':'恢复地图上的票面'} onClick={()=>{const next=!showPhotos;setShowPhotos(next);saveMapPhotos(next)}}><Icon name={showPhotos?'map':'image'} size={17}/><span>{showPhotos?'只看轨迹':'显示票面'}</span></button></div>
    <footer className="collection-tray">
      <div className="tray-toolbar"><YearTimeline /><button className="random-button" disabled={!hits.length} onClick={() => randomTicket()} aria-label="随机翻一张票"><Icon name="shuffle" size={17} /></button><span className="tray-count">{searchQuery ? hits.length + ' 张匹配' : routed + ' 张已关联线路'}</span><button type="button" className="tray-toggle" aria-label={trayCollapsed ? '展开票据栏' : '收起票据栏'} aria-expanded={!trayCollapsed} aria-controls="ticket-tray-content" onClick={() => { const next = !trayCollapsed; setTrayCollapsed(next); saveTrayCollapsed(next) }}><Icon name={trayCollapsed ? 'chevronUp' : 'chevronDown'} size={17} /><span>{trayCollapsed ? '展开' : '收起'}</span></button></div>
      <div className="tray-disclosure" id="ticket-tray-content" aria-hidden={trayCollapsed} inert={trayCollapsed}><div className="tray-disclosure-inner">
      <div className="ticket-filmstrip" aria-label="所有票据">{hits.map(t=><button key={t.id} className="film-ticket" onClick={()=>openTicket(t.id)} aria-label={formatRoute(t) + ' ' + (t.takenAt || t.sourceFile?.name || '日期待核对')}><img src={t.thumbnailUrl} alt="" loading="lazy" /><span>{t.takenAt || '日期待核对'}</span>{t.processing?.documentKind==='refund' && <small>退票凭证</small>}</button>)}{!hits.length && <p className="empty-collection">{tickets.length ? '没有匹配的票' : '添加票据照片，开始整理。'}</p>}</div>
      <div className="collection-status"><span>{scanned} 张已扫描 · {REMOTE ? '私密云端票夹' : '仅保存在本机浏览器'}</span></div>
      </div></div>
    </footer>
    {selectedTicketId && <TicketOverlay />}
    {uploadOpen && <BatchImportModal />}
    {processing && <ProcessingDialog onClose={()=>setProcessing(false)} />}
  </div>
}
