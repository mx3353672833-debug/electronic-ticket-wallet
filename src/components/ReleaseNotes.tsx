import {useState} from 'react'
import releases from '../data/releases.json'
import {Modal} from './Modal'
import {Icon} from './Icon'

export function ReleaseNotes() {
  const [open,setOpen]=useState(false)
  return <>
    <button type="button" className="toolbar-button release-notes-trigger" aria-label="更新记录" aria-haspopup="dialog" title="更新记录" onClick={()=>setOpen(true)}><Icon name="history"/><span>更新记录</span></button>
    {open && <Modal label="更新记录" className="release-notes-modal" onClose={()=>setOpen(false)}>
      <header className="release-notes-header"><div><h2>更新记录</h2><p>当前版本 v{releases[0].version}</p></div><button type="button" className="icon-button" aria-label="关闭更新记录" onClick={()=>setOpen(false)}><Icon name="close"/></button></header>
      <div className="release-notes-body" tabIndex={0} role="region" aria-label="版本更新历史">
        <ol className="release-list">{releases.map((release,index)=><li key={release.version}>
          <article aria-labelledby={`release-${release.version}`}>
            <div className="release-meta"><span>v{release.version}</span>{index===0 && <span className="release-current">最新</span>}<time dateTime={release.date}>{release.date.replaceAll('-','.')}</time></div>
            <h3 id={`release-${release.version}`}>{release.title}</h3>
            <ul>{release.changes.map(change=><li key={change}>{change}</li>)}</ul>
          </article>
        </li>)}</ol>
        <p className="release-history-note">早期未单独编号的更新合并记在 v0.1.0。这里只记录已发布的变化。</p>
      </div>
    </Modal>}
  </>
}
