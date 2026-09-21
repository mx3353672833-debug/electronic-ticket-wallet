/** Delivery URLs are view-only. Never write these back to the ticket database. */
export function displayImageUrl(url:string,view:'screen'|'thumb') {
  return /^\/tickets\/media\/[a-zA-Z0-9-]+(?:\?view=(screen|thumb))?$/.test(url) ? url.split('?')[0]+'?view='+view : url
}

type Entry={promise:Promise<string>;objectUrl?:string;bytes:number}
const cache=new Map<string,Entry>()
const MAX_BYTES=24*1024*1024
export function clearDisplayImages(){clearTimeout(prefetchTimer);cache.forEach(item=>{if(item.objectUrl)URL.revokeObjectURL(item.objectUrl)});cache.clear()}
export function cachedDisplayImage(url:string){return cache.get(url)?.objectUrl}
export async function loadDisplayImage(url:string):Promise<string>{
  // Only lightweight delivery copies enter our cache; archival photos load directly.
  if(!/^\/tickets\/media\/[a-zA-Z0-9-]+\?view=(screen|thumb)$/.test(url))return url
  const previous=cache.get(url)
  if(previous){cache.delete(url);cache.set(url,previous);return previous.promise}
  const entry:Entry={bytes:0,promise:Promise.resolve('')}
  entry.promise=(async()=>{
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store'})
    if(!response.ok)throw new Error('图片暂时没有载入')
    const blob=await response.blob(),objectUrl=URL.createObjectURL(blob)
    if(cache.get(url)!==entry){URL.revokeObjectURL(objectUrl);throw new Error('图片会话已结束')}
    entry.objectUrl=objectUrl;entry.bytes=blob.size
    let total=[...cache.values()].reduce((sum,value)=>sum+value.bytes,0)
    for(const [key,value] of cache){
      if(total<=MAX_BYTES && cache.size<=24)break
      if(key===url||!value.objectUrl)continue
      cache.delete(key);total-=value.bytes;URL.revokeObjectURL(value.objectUrl)
    }
    return objectUrl
  })().catch(error=>{if(cache.get(url)===entry)cache.delete(url);throw error})
  cache.set(url,entry);return entry.promise
}
let prefetchTimer:ReturnType<typeof setTimeout>|undefined
export function warmTicketImage(url:string){
  clearTimeout(prefetchTimer)
  if((navigator as Navigator & {connection?:{saveData?:boolean}}).connection?.saveData)return
  prefetchTimer=setTimeout(()=>{void loadDisplayImage(displayImageUrl(url,'screen')).catch(()=>{})},90)
}
