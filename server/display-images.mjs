import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
import {serialQueue} from './private-store.mjs'

const run=promisify(execFile),serial=serialQueue(),pending=new Map()
export const DISPLAY_VERSION='display-v1'
/** Called only after session + collection membership checks. Cache is never public. */
export async function displayImage(dataDir,image,variant,{python=process.env.WALLET_PYTHON||'/opt/ticket-wallet-venv/bin/python'}={}) {
  if(!['screen','thumb'].includes(variant)|| !/^[A-Za-z0-9-]{1,160}$/.test(image.id))throw new Error('Invalid display variant')
  const source=path.join(dataDir,'images',image.id),stat=await fs.stat(source)
  const key=crypto.createHash('sha256').update(`${image.id}:${stat.size}:${stat.mtimeMs}:${variant}:${DISPLAY_VERSION}`).digest('hex')
  const folder=path.join(dataDir,'display-cache'),file=path.join(folder,key+'.webp')
  try{await fs.access(file);return file}catch(error){if(error.code!=='ENOENT')throw error}
  const jobKey=dataDir+':'+key
  if(pending.has(jobKey))return pending.get(jobKey)
  if(pending.size>=12)return source // Bound work during rapid browsing; the client still has its preview.
  const job=serial(async()=>{
    await fs.mkdir(folder,{recursive:true,mode:0o700})
    // Regenerable cache has a per-collection cap; it never deletes archival media.
    const files=await fs.readdir(folder),entries=await Promise.all(files.filter(n=>/^[a-f0-9]{64}\.webp$/.test(n)).map(async name=>({name,...await fs.stat(path.join(folder,name))})))
    let size=entries.reduce((sum,e)=>sum+e.size,0)
    for(const entry of entries.sort((a,b)=>a.mtimeMs-b.mtimeMs)){
      if(size<64*1048576)break
      await fs.unlink(path.join(folder,entry.name));size-=entry.size
    }
    const disk=await fs.statfs(folder)
    if(disk.bavail*disk.bsize<1024*1048576)return source
    const temp=path.join(folder,key+'-'+crypto.randomUUID()+'.tmp')
    try{
      await run(python,[fileURLToPath(new URL('../scripts/display-image.py',import.meta.url)),source,temp,variant],{timeout:30000,maxBuffer:16384,env:{...process.env,OMP_THREAD_LIMIT:'1',OPENBLAS_NUM_THREADS:'1'}})
      await fs.chmod(temp,0o600);await fs.rename(temp,file);return file
    }finally{await fs.unlink(temp).catch(()=>{})}
  }).finally(()=>pending.delete(jobKey))
  pending.set(jobKey,job);return job
}
