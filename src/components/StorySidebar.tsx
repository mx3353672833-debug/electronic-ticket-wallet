import {useEffect,useRef,useState} from 'react'
import type {Ticket} from '../types/ticket'
import {useTicketStore} from '../store/useTicketStore'
import {readTrackFile,trackLength} from '../utils/tracks'
import {Icon} from './Icon'
import {REMOTE} from '../utils/remote'
import {canUpdateRoute,updateTrainRoute} from '../utils/trainRoutes'
import {missingJourneyFields,type JourneyField} from '../utils/ticketCompleteness'

type EditMode='story'|'details'|'missing'

export function StorySidebar({ticket,onDirty,onClose,initialEdit}:{ticket:Ticket;onDirty:(dirty:boolean)=>void;onClose:()=>void;initialEdit?:EditMode}){
  const updateDetails=useTicketStore(s=>s.updateDetails),init=useTicketStore(s=>s.init)
  const [editing,setEditing]=useState<EditMode|null>(initialEdit==='missing'&&!missingJourneyFields(ticket).length?null:initialEdit||null)
  const [saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [importing,setImporting]=useState(false),[routing,setRouting]=useState(false)
  const fileInput=useRef<HTMLInputElement>(null),form=useRef<HTMLFormElement>(null)
  const missing=missingJourneyFields(ticket)
  const showField=(key:JourneyField)=>editing==='details'||(editing==='missing'&&missing.some(field=>field.key===key))
  useEffect(()=>{if(editing)form.current?.querySelector<HTMLInputElement|HTMLTextAreaElement>('input,textarea')?.focus()},[editing])
  const start=(mode:EditMode)=>{setNotice('');setError('');setEditing(mode)}
  const importTrack=async(file:File|undefined)=>{
    if(!file)return
    setImporting(true);setError('');setNotice('')
    try{const track=await readTrackFile(file);await updateDetails(ticket.id,{track});setNotice('轨迹已关联')}
    catch(e){setError(e instanceof Error?e.message:'轨迹导入失败，请重试')}
    finally{setImporting(false);if(fileInput.current)fileInput.current.value=''}
  }
  return <aside className="story-sidebar" aria-label="旅程笔记">
    <div className="story-sidebar-header"><span>{editing==='missing'?'补充信息':editing==='details'?'票面信息':'这段旅程'}</span><button className="icon-button" aria-label="关闭旅程笔记" onClick={onClose}><Icon name="close"/></button></div>
    <h2>{editing==='missing'?'补齐这几项':editing==='details'?'编辑票面信息':editing==='story'?'写下这段旅程':'旅程笔记'}</h2>
    {editing?<form ref={form} className="story-edit" aria-label={editing==='story'?'编辑故事':editing==='missing'?'补充信息':'编辑票面信息'} onChange={()=>onDirty(true)} onSubmit={async e=>{
      e.preventDefault();setSaving(true);setError('')
      const data=new FormData(e.currentTarget),value=(name:string)=>String(data.get(name)||'').trim()
      const patch:Parameters<typeof updateDetails>[1]={}
      if(editing==='story')patch.story=value('story')
      else{
        if(data.has('takenAt'))patch.takenAt=value('takenAt')||null
        for(const prefix of ['departure','arrival'] as const){
          if(!data.has(prefix+'Name'))continue
          const previous=ticket[prefix],name=value(prefix+'Name')
          const city=data.has(prefix+'City')?value(prefix+'City'):name===(previous?.name||'')?previous?.city:''
          const unchanged=name===(previous?.name||'')&&(city||'')===(previous?.city||'')
          patch[prefix]=name||city?{name:name||city!,city:city||undefined,...(unchanged?{lat:previous?.lat,lng:previous?.lng}:{})}:null
        }
        if(data.has('carrierOrTrainNo'))patch.carrierOrTrainNo=value('carrierOrTrainNo')
        if(editing==='details'){
          patch.seat=value('seat')
          patch.tags=value('tags').split(/[,，、]/).map(s=>s.trim()).filter(Boolean)
          patch.companions=value('companions').split(/[,，、]/).map(s=>s.trim()).filter(Boolean)
          if(ticket.processing)patch.processing={...ticket.processing,departureTime:value('departureTime')||null,amount:value('amount')?Number(value('amount')):null}
        }
      }
      try{await updateDetails(ticket.id,patch);setEditing(null);onDirty(false);setNotice(editing==='story'?'故事已保存':'信息已保存')}
      catch(err){setError(err instanceof Error?err.message:'保存失败，请重试')}
      finally{setSaving(false)}
    }}>
      {editing==='story'?<label>旅程故事<textarea name="story" defaultValue={ticket.story} rows={7} placeholder="那天为什么出发，有没有遇到什么人…"/></label>:<>
        {editing==='missing'&&<p className="form-note">只补缺少的信息，其他内容保持不变。</p>}
        {showField('takenAt')&&<label>日期<input name="takenAt" type="date" required={editing==='missing'} defaultValue={ticket.takenAt||''}/></label>}
        {showField('departure')&&<label>出发地<input name="departureName" required={editing==='missing'} defaultValue={ticket.departure?.name||ticket.departure?.city||''} placeholder="车站或机场名称"/></label>}
        {showField('arrival')&&<label>到达地<input name="arrivalName" required={editing==='missing'} defaultValue={ticket.arrival?.name||ticket.arrival?.city||''} placeholder="车站或机场名称"/></label>}
        {showField('carrierOrTrainNo')&&<label>车次 / 航班<input name="carrierOrTrainNo" required={editing==='missing'} defaultValue={ticket.carrierOrTrainNo||''}/></label>}
        {editing==='details'&&<details className="optional-fields"><summary>更多信息（选填）</summary><div className="optional-fields-body">
          <label>车厢 / 座位<input name="seat" defaultValue={ticket.seat||''}/></label>
          {ticket.processing&&<div className="form-row"><label>出发时间<input type="time" name="departureTime" defaultValue={ticket.processing.departureTime||''}/></label><label>票价<input type="number" min="0" step="0.01" name="amount" defaultValue={ticket.processing.amount??''}/></label></div>}
          <div className="form-row"><label>出发城市<input name="departureCity" defaultValue={ticket.departure?.city||''}/></label><label>到达城市<input name="arrivalCity" defaultValue={ticket.arrival?.city||''}/></label></div>
          <label>同行的人<input name="companions" defaultValue={ticket.companions.join('，')}/></label><label>标签<input name="tags" defaultValue={ticket.tags.join('，')} placeholder="用逗号分隔"/></label>
        </div></details>}
      </>}
      <div className="form-actions"><button type="submit" className="primary-button" disabled={saving}>{saving?'保存中…':editing==='story'?'保存故事':'保存信息'}</button><button type="button" disabled={saving} onClick={()=>{setEditing(null);onDirty(false);setError('')}}>取消</button></div>
    </form>:<>
      <div className="story-date">{ticket.takenAt?.replaceAll('-', '.')||'日期待补充'}<span>{ticket.carrierOrTrainNo}</span></div>
      <div className="story-route"><span>{ticket.departure?.name||ticket.departure?.city||'出发地待补充'}</span><Icon name="arrow"/><span>{ticket.arrival?.name||ticket.arrival?.city||'到达地待补充'}</span></div>
      {missing.length>0&&<div className="missing-summary"><span>待补充 · {missing.map(field=>field.label).join('、')}</span><button className="text-button" onClick={()=>start('missing')}>补充信息 <Icon name="arrow" size={14}/></button></div>}
      {ticket.story?<p className="story-text">{ticket.story}</p>:null}
      <button className={'text-button '+(ticket.story?'':'empty-story')} onClick={()=>start('story')}>{ticket.story?'编辑故事':'写点这段旅程的故事'} <Icon name="note" size={14}/></button>
      {ticket.companions.length>0&&<p className="companions">同行 · {ticket.companions.join('、')}</p>}
      {ticket.tags.length>0&&<div className="story-tags">{ticket.tags.map(tag=><span key={tag}>{tag}</span>)}</div>}
      <details className="recognition-section"><summary>票面信息</summary><dl>
        {ticket.processing?.documentKind==='refund'&&<><dt>凭证</dt><dd>退票费凭证</dd></>}
        {ticket.seat&&<><dt>座位</dt><dd>{ticket.seat}</dd></>}
        {ticket.processing?.departureTime&&<><dt>出发时间</dt><dd>{ticket.processing.departureTime}</dd></>}
        {ticket.processing?.amount!=null&&<><dt>票价</dt><dd>¥{ticket.processing.amount.toFixed(2)}</dd></>}
      </dl><button className="text-button" onClick={()=>start('details')}>编辑票面信息 <Icon name="arrow" size={14}/></button>
      </details>
      <details className="track-section"><summary><Icon name="map" size={15}/> 线路{ticket.track?' · '+trackLength(ticket.track).toFixed(1)+' km':ticket.railRoute?' · '+ticket.railRoute.distanceKm+' km':''}</summary>
        {ticket.track?<p className="track-filename">{ticket.track.filename}</p>:ticket.railRoute?<>
          {ticket.railRoute.timetable&&<p className="route-stops">{ticket.railRoute.timetable.stops.join(' → ')}</p>}
          <a className="source-link" href={ticket.railRoute.sourceUrl} target="_blank" rel="noreferrer">{ticket.railRoute.attribution}</a>
          {ticket.railRoute.timetable&&<p><a className="source-link" href="https://railgo.dev/" target="_blank" rel="noreferrer">经停数据 · RailGo</a></p>}
        </>:<p>{ticket.processing?.documentKind==='refund'?'退票凭证不显示乘车线路。':'还没有线路，可更新车次线路或导入轨迹。'}</p>}
        {canUpdateRoute(ticket)&&<button className="text-button" disabled={routing||importing} onClick={async()=>{
          setRouting(true);setError('');setNotice('')
          try{const result=await updateTrainRoute(ticket);if(result.status==='updated'){await init();setNotice('车次线路已更新')}else setNotice('暂未找到这趟车的线路')}
          catch(e){setError(e instanceof Error?e.message:'线路更新失败，请重试')}
          finally{setRouting(false)}
        }}>{routing?'正在更新线路…':'更新车次线路'}</button>}
        <input className="sr-only" ref={fileInput} type="file" accept=".gpx,.geojson,.json" aria-label="选择轨迹文件" onChange={e=>void importTrack(e.target.files?.[0])}/>
        <button className="track-import" disabled={importing||routing} onClick={()=>fileInput.current?.click()}><Icon name="upload" size={15}/>{importing?'正在读取轨迹…':ticket.track?'替换轨迹文件':'导入 GPX / GeoJSON'}</button>
        {!REMOTE&&<small>轨迹文件仅保存在当前浏览器。</small>}
      </details>
    </>}
    {error&&<p className="form-error" role="alert">{error}</p>}{notice&&<p className="saved-notice" role="status"><Icon name="check" size={14}/>{notice}</p>}
  </aside>
}
