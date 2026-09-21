import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

export const failure = (status, message) => Object.assign(new Error(message), {status})
export const serialQueue = () => {
  let queue = Promise.resolve()
  return task => { const result=queue.then(task); queue=result.catch(()=>{}); return result }
}
export async function atomicJson(file, value) {
  const temporary = path.join(path.dirname(file),`.write-${crypto.randomUUID()}.tmp`)
  try {
    await fs.writeFile(temporary,JSON.stringify(value),{flag:'wx',mode:0o600})
    await fs.rename(temporary,file)
  } finally { await fs.unlink(temporary).catch(()=>{}) }
}
export async function privateStore(file, initial) {
  let state
  try { state=JSON.parse(await fs.readFile(file,'utf8')) }
  catch(error) {
    if(error.code !== 'ENOENT' || initial === undefined) throw error
    await fs.writeFile(file,JSON.stringify(initial),{flag:'wx',mode:0o600})
    state=initial
  }
  const serial=serialQueue()
  return {
    read:()=>structuredClone(state),
    update:fn=>serial(async()=>{const next=structuredClone(state); const result=await fn(next); await atomicJson(file,next); state=next; return result}),
  }
}
export function secureEqual(a,b) {
  const left=Buffer.from(String(a)),right=Buffer.from(String(b))
  return left.length===right.length && crypto.timingSafeEqual(left,right)
}
