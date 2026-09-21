import fs from 'node:fs/promises'
import path from 'node:path'
import {atomicJson,failure,serialQueue} from './private-store.mjs'

export async function openCollection({dataDir,scanner,routePlanner}) {
  let manifest=JSON.parse(await fs.readFile(path.join(dataDir,'manifest.json'),'utf8'))
  const serial=serialQueue()
  const commit=async next=>{
    const revisions=path.join(dataDir,'revisions')
    await fs.mkdir(revisions,{recursive:true,mode:0o700})
    await fs.writeFile(path.join(revisions,`${new Date().toISOString().slice(0,10)}.json`),JSON.stringify(manifest),{flag:'wx',mode:0o600}).catch(error=>{if(error.code!=='EEXIST')throw error})
    await atomicJson(path.join(dataDir,'manifest.json'),next)
    manifest=next
  }
  async function size(location) {
    const stat=await fs.lstat(location).catch(error=>{if(error.code==='ENOENT')return null;throw error})
    if(!stat || stat.isSymbolicLink()) return 0
    if(stat.isFile()) return stat.size
    const sizes=await Promise.all((await fs.readdir(location)).map(name=>size(path.join(location,name))))
    return sizes.reduce((a,b)=>a+b,0)
  }
  const usageBytes=async()=>{const sizes=await Promise.all(['images','scans','revisions','manifest.json'].map(name=>size(path.join(dataDir,name))));return sizes.reduce((a,b)=>a+b,0)}
  const processTicket=async(ticket,original)=>{
    const result=await scanner(original,ticket.sourceFile.sha256)
    const now=new Date().toISOString(),sha=ticket.sourceFile.sha256
    const processedId=`scan-v${result.version}-${sha}`,thumbId=`scan-thumb-v${result.version}-${sha}`
    const additions=[]
    for(const [id,kind] of [[processedId,'processed'],[thumbId,'thumbnail']]) {
      const source=path.join(dataDir,'scans',sha,`${kind}.jpg`)
      await fs.copyFile(source,path.join(dataDir,'images',id))
      await fs.chmod(path.join(dataDir,'images',id),0o600)
      additions.push({id,mime:'image/jpeg',size:(await fs.stat(source)).size})
    }
    const fields=result.fields
    const next={...ticket,departure:ticket.departure||result.departure,arrival:ticket.arrival||result.arrival,takenAt:ticket.takenAt||fields.takenAt,
      carrierOrTrainNo:ticket.carrierOrTrainNo||fields.trainNo||undefined,seat:ticket.seat||fields.seat||undefined,
      type:fields.documentKind==='boarding'?'boarding-pass':fields.documentKind!=='unknown'?'train':ticket.type,
      processedImageUrl:'idb://images/'+processedId,thumbnailUrl:'idb://images/'+thumbId,
      cropRecipe:{corners:result.corners,rotation:result.rotation||0,filter:'opencv-perspective-color-preserving-v3'},
      processing:{version:result.version,processedAt:now,cropped:result.cropped,reviewed:false,issues:fields.issues,documentKind:fields.documentKind,departureTime:fields.departureTime,amount:fields.amount},
      tags:ticket.tags.filter(t=>t!=='待整理'),updatedAt:now}
    if(!next.track && result.railRoute?.from===next.departure?.name && result.railRoute?.to===next.arrival?.name) next.railRoute=result.railRoute
    if(routePlanner && !next.track) {
      // Timetable/network outages must not make an otherwise valid photo import fail.
      try{const route=await routePlanner(next);if(route)next.railRoute=route}catch{}
    }
    return {ticket:next,images:additions,originalMime:({JPEG:'image/jpeg',PNG:'image/png',WEBP:'image/webp',GIF:'image/gif',AVIF:'image/avif'})[result.originalFormat]||'application/octet-stream'}
  }
  return {get manifest(){return manifest},dataDir,serial,commit,processTicket,usageBytes,
    async ensureRoom(bytes,quotaBytes) {
      if(quotaBytes && await usageBytes()+bytes>quotaBytes) throw failure(413,'票夹空间已满，请联系站长调整额度')
      const disk=await fs.statfs(dataDir)
      if(disk.bavail*disk.bsize<1024*1048576+bytes) throw failure(507,'服务器空间不足，原有票据未改变，请联系站长')
    },
  }
}
