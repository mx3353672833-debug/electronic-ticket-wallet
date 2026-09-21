import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
import {serialQueue} from './private-store.mjs'

export const APPEARANCE_VERSION='paper-v1'
const run=promisify(execFile),serial=serialQueue(),prefix='idb://images/'
export const appearanceCurrent=ticket=>ticket.appearance?.version===APPEARANCE_VERSION && ticket.appearance?.imageUrl===ticket.processedImageUrl
export function imageId(url) {
  const id=typeof url==='string' && url.startsWith(prefix)?url.slice(prefix.length):''
  if(!/^[a-zA-Z0-9-]{1,160}$/.test(id))throw new Error('Invalid image reference')
  return id
}

/** Shared pure algorithm, private per-collection source/reference, bounded worker. */
export function createAppearanceRenderer(dataDir,{python=process.env.WALLET_PYTHON||'/opt/ticket-wallet-venv/bin/python'}={}) {
  return ticket=>serial(async()=>{
    const sourceUrl=ticket.appearance?.imageUrl===ticket.processedImageUrl?ticket.appearance.sourceImageUrl:ticket.processedImageUrl
    const source=path.join(dataDir,'images',imageId(sourceUrl))
    let profile
    try{profile=JSON.parse(await fs.readFile(path.join(dataDir,'appearance-reference.json'),'utf8'))}
    catch(error){if(error.code!=='ENOENT')throw error}
    const work=await fs.mkdtemp(path.join(dataDir,'scans','.appearance-'))
    try{
      const out=path.join(work,'output')
      const args=[fileURLToPath(new URL('../scripts/ticket-appearance.py',import.meta.url)),source,'--production','--kind',ticket.type,'--out',out]
      if(profile?.imageUrl)args.push('--reference',path.join(dataDir,'images',imageId(profile.imageUrl)))
      const response=await run(python,args,{timeout:90000,maxBuffer:16384,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_THREAD_LIMIT:'1'}})
      const recipe=JSON.parse(response.stdout)
      const images=[]
      for(const [name,suffix] of [['processed',''],['thumbnail','-thumb']]){
        const bytes=await fs.readFile(path.join(out,name+'.webp'))
        const hash=crypto.createHash('sha256').update(bytes).digest('hex')
        images.push({id:`paper-v1-${hash}${suffix}`,mime:'image/webp',size:bytes.length,bytes})
      }
      const processedImageUrl=prefix+images[0].id,thumbnailUrl=prefix+images[1].id
      return {patch:{processedImageUrl,thumbnailUrl,appearance:{...recipe,sourceImageUrl:sourceUrl,
        sourceThumbnailUrl:ticket.appearance?.imageUrl===ticket.processedImageUrl?ticket.appearance.sourceThumbnailUrl:ticket.thumbnailUrl,
        imageUrl:processedImageUrl}},images}
    }finally{await fs.rm(work,{recursive:true,force:true})}
  })
}
