import {useEffect,useState} from 'react'
import {Modal} from './Modal'
import {Icon} from './Icon'
import {remoteRequest,SERVER_BASE} from '../utils/remote'

type Account={email:string;role:'owner'|'member';usedBytes:number;quotaBytes:number;canInvite?:boolean;feedbackEnabled:boolean}
type Invitation={id:string;createdAt:number;expiresAt:number;status:'active'|'used'|'revoked'|'expired';token?:string}
type Suggestion={id:string;email:string;category:'suggestion'|'bug';message:string;createdAt:string;status:'new'|'read'|'resolved';notification:'pending'|'sent'}
const size=(bytes:number)=>bytes>=1024**3?`${(bytes/1024**3).toFixed(1)} GB`:`${(bytes/1024**2).toFixed(1)} MB`

export function AccountTools() {
  const [account,setAccount]=useState<Account|null>(null)
  const [panel,setPanel]=useState<'account'|'feedback'|'inbox'|null>(null)
  const [message,setMessage]=useState('')
  const [category,setCategory]=useState('suggestion')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [busy,setBusy]=useState(false)
  const [items,setItems]=useState<Suggestion[]>([])
  const [invitations,setInvitations]=useState<Invitation[]>([])
  const [inviteLink,setInviteLink]=useState('')
  const [inviteId,setInviteId]=useState('')
  useEffect(()=>{void remoteRequest<Account>('/account').then(setAccount).catch(()=>{})},[])
  const open=async(next:NonNullable<typeof panel>)=>{
    setPanel(next);setError('');setNotice('');setBusy(true)
    try {
      if(next==='inbox')setItems(await remoteRequest<Suggestion[]>('/feedback'))
      else {
        const value=await remoteRequest<Account>('/account');setAccount(value)
        if(next==='account' && value.canInvite) {
          const links=await remoteRequest<Invitation[]>('/invitations');setInvitations(links)
          if(inviteId && !links.some(i=>i.id===inviteId && i.status==='active'))setInviteLink('')
        }
      }
    } catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  return <>
    <button className="toolbar-button" aria-label="提建议" onClick={()=>void open('feedback')}><Icon name="feedback"/><span>提建议</span></button>
    <button className="toolbar-button" aria-label="我的账号" onClick={()=>void open('account')}><Icon name="account"/><span>账号</span></button>
    {panel && <Modal label={panel==='account'?'我的账号':panel==='feedback'?'给站长提建议':'收到的建议'} className={`upload-modal account-modal${panel==='inbox'?' feedback-inbox':''}`} onClose={()=>{if(!busy)setPanel(null)}}>
      <header className="upload-header"><h2>{panel==='account'?'我的账号':panel==='feedback'?'给站长提建议':'收到的建议'}</h2><button type="button" className="icon-button" aria-label="关闭窗口" disabled={busy} onClick={()=>setPanel(null)}><Icon name="close"/></button></header>
      <div className="batch-body">
        {busy && <p role="status" className="upload-note">正在处理…</p>}
        {error && <p className="form-error" role="alert">{error}<button type="button" className="text-button" disabled={busy} onClick={()=>void open(panel)}>重试</button></p>}
        {notice && <p className="saved-notice" role="status">{notice}</p>}
        {panel==='account' && account && <>
          <p className="account-email">{account.email||'原票夹账号'}<span>{account.role==='owner'?'站长':'个人票夹'}</span></p>
          <div className="account-storage"><span>已用 {size(account.usedBytes)}{account.quotaBytes>0?` / ${size(account.quotaBytes)}`:''}</span>{account.quotaBytes>0 && <progress value={account.usedBytes} max={account.quotaBytes}/>}<small>包含原图、扫描文件和站内恢复记录。</small></div>
          {account.canInvite && <section className="account-invite"><h3>邀请朋友</h3><p>每条链接限注册一个账号，7 天内有效。打开链接或获取验证码不占用名额。链接仅生成时显示，请复制后私下发送。</p>
            <button type="button" className="text-button" disabled={busy} onClick={()=>{
              setBusy(true);setError('');setNotice('')
              void remoteRequest<Invitation>('/invitations',{method:'POST'}).then(value=>{
                setInviteLink(`${location.origin}${SERVER_BASE}/register#invite=${encodeURIComponent(value.token!)}`)
                setInviteId(value.id)
                setInvitations(current=>[value,...current]);setNotice('已生成新链接，只能注册一次。')
              }).catch(e=>setError(e.message)).finally(()=>setBusy(false))
            }}>生成一次性邀请链接</button>
            {inviteLink && <><label>新邀请链接<input aria-label="新邀请链接" readOnly value={inviteLink} onFocus={e=>e.currentTarget.select()}/></label><button type="button" className="text-button" onClick={()=>{void navigator.clipboard.writeText(inviteLink).then(()=>setNotice('邀请链接已复制')).catch(()=>setError('无法复制，请选中上方链接手动复制'))}}>复制邀请链接</button></>}
            <ul className="invitation-list">{invitations.map((item)=><li key={item.id}><span>{new Date(item.createdAt).toLocaleString('zh-CN')}<small>{({active:'待使用',used:'已使用',revoked:'已撤销',expired:'已过期'})[item.status]}</small></span>{item.status==='active' && <button className="text-button" disabled={busy} aria-label={`撤销邀请 ${new Date(item.createdAt).toLocaleString('zh-CN')}`} onClick={()=>{
              setBusy(true);setError('');void remoteRequest<Invitation>(`/invitations/${item.id}`,{method:'DELETE'}).then(value=>{setInvitations(current=>current.map(i=>i.id===value.id?value:i));if(item.id===inviteId)setInviteLink('');setNotice('邀请已撤销。')}).catch(e=>setError(e.message)).finally(()=>setBusy(false))
            }}>撤销</button>}</li>)}</ul>
          </section>}
          {account.role==='owner' && account.feedbackEnabled && <button className="account-link" onClick={()=>void open('inbox')}>收到的建议<Icon name="arrow"/></button>}
          <a className="text-button" href={`${SERVER_BASE}/reset`}>通过邮箱重置密码</a>
          <form action={`${SERVER_BASE}/logout`} method="post"><button className="account-signout" type="submit">退出登录</button></form>
        </>}
        {panel==='feedback' && !notice && <form className="feedback-form" onSubmit={e=>{
          e.preventDefault();setBusy(true);setError('')
          void remoteRequest<{message:string}>('/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({category,message})}).then(result=>{setNotice(result.message);setMessage('')}).catch(e=>setError(e.message)).finally(()=>setBusy(false))
        }}>
          <label>类型<select value={category} onChange={e=>setCategory(e.target.value)} disabled={busy}><option value="suggestion">功能建议</option><option value="bug">遇到问题</option></select></label>
          <label>想说的话<textarea rows={7} required minLength={5} maxLength={4000} value={message} onChange={e=>setMessage(e.target.value)} disabled={busy} placeholder="哪里不方便，或者希望增加什么功能？"/></label>
          <p className="upload-note">内容和你的账号邮箱会发送给站长，方便回复。不会附带票据照片或轨迹，请勿填写证件号、验证码和密码。</p>
          <button className="primary-button" type="submit" disabled={busy || !account?.feedbackEnabled || message.trim().length<5}>发送建议</button>
        </form>}
        {panel==='inbox' && <div className="feedback-list">{!busy && !items.length && <p className="upload-note">还没有收到建议。</p>}{items.map(item=><article key={item.id} className="feedback-item"><div className="feedback-meta"><strong>{item.category==='bug'?'问题反馈':'功能建议'}</strong><span>{new Date(item.createdAt).toLocaleDateString('zh-CN')}</span></div><a href={`mailto:${item.email}`}>{item.email}</a><p>{item.message}</p><div className="feedback-meta"><span>{item.status==='new'?'未读':item.status==='read'?'已读':'已处理'} · {item.notification==='sent'?'已发邮件通知':'邮件通知待重试'}</span><button className="text-button" disabled={busy || item.status==='resolved'} onClick={()=>{
          setBusy(true);setError('');void remoteRequest(`/feedback/${item.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'resolved'})}).then(()=>setItems(current=>current.map(value=>value.id===item.id?{...value,status:'resolved'}:value))).catch(e=>setError(e.message)).finally(()=>setBusy(false))
        }}>标记已处理</button></div></article>)}</div>}
      </div>
    </Modal>}
  </>
}
