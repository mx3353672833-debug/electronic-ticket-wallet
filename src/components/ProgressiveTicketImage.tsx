import {useEffect,useState} from 'react'
import {cachedDisplayImage,loadDisplayImage} from '../utils/displayImages'

export function ProgressiveTicketImage({src,preview,alt,ratio}:{src:string;preview:string;alt:string;ratio:number}){
  const [image,setImage]=useState(()=>cachedDisplayImage(src)||(!src.startsWith('/tickets/media/')?src:''))
  const [ready,setReady]=useState(false),[error,setError]=useState(false),[slow,setSlow]=useState(false),[retry,setRetry]=useState(0)
  useEffect(()=>{
    let current=true
    const timer=setTimeout(()=>{if(current)setSlow(true)},900)
    void loadDisplayImage(src).then(url=>{if(current)setImage(url)}).catch(()=>{if(current)setError(true)})
    return ()=>{current=false;clearTimeout(timer)}
  },[src,retry])
  return <div className="progressive-ticket" style={{aspectRatio:ratio}} data-ready={ready}>
    <img className="ticket-preview" src={preview} alt="" aria-hidden="true" draggable={false}/>
    <img className="real-ticket ticket-resolution" src={image||undefined} alt={alt} draggable={false} decoding="async" fetchPriority="high" style={{opacity:ready?1:0}} onLoad={e=>{
      const img=e.currentTarget
      if(img.decode)void img.decode().catch(()=>{}).then(()=>setReady(true));else setReady(true)
    }} onError={()=>setError(true)}/>
    {!ready && error?<button className="image-retry" onClick={()=>{setError(false);setImage('');setRetry(n=>n+1)}}>清晰图未载入，点此重试</button>:!ready && slow?<span className="image-loading" role="status">正在载入清晰票面…</span>:null}
  </div>
}
