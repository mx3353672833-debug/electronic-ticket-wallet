import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {normalizeEmail} from '../server/accounts.mjs'

/** Add ownership without moving, regenerating or rewriting the legacy collection. */
export async function upgradeAccounts({dataDir,ownerEmail,dryRun=false}) {
  if(!dataDir || !path.isAbsolute(dataDir))throw new Error('Explicit absolute data directory required')
  const email=normalizeEmail(ownerEmail)
  for(const name of ['accounts.json','service.json']) {
    await fs.access(path.join(dataDir,name)).then(()=>{throw new Error('Multi-user configuration already exists; refusing to overwrite')},error=>{if(error.code!=='ENOENT')throw error})
  }
  const auth=JSON.parse(await fs.readFile(path.join(dataDir,'auth.json'),'utf8'))
  const manifest=JSON.parse(await fs.readFile(path.join(dataDir,'manifest.json'),'utf8'))
  if(!/^[a-f0-9]{128}$/.test(auth.passwordHash) || !auth.salt || !Array.isArray(manifest.tickets) || !Array.isArray(manifest.images))throw new Error('Invalid legacy wallet')
  const names=new Set(manifest.images.map(image=>image.id))
  for(const image of manifest.images) {
    if(!/^[a-zA-Z0-9-]+$/.test(image.id) || (await fs.stat(path.join(dataDir,'images',image.id))).size!==image.size)throw new Error('Image validation failed')
  }
  for(const ticket of manifest.tickets)for(const field of ['originalImageUrl','processedImageUrl','thumbnailUrl']) {
    if(!ticket[field]?.startsWith('idb://images/') || !names.has(ticket[field].slice(13)))throw new Error('Broken image reference')
  }
  const report={tickets:manifest.tickets.length,images:manifest.images.length,originalDataUntouched:true,dryRun}
  if(dryRun)return report
  const owner={id:crypto.randomUUID(),email,role:'owner',storage:'legacy',legacyUsername:String(auth.username).toLowerCase(),salt:auth.salt,passwordHash:auth.passwordHash,emailVerified:false,quotaBytes:2*1024*1048576,createdAt:new Date().toISOString()}
  await fs.writeFile(path.join(dataDir,'accounts.json'),JSON.stringify({version:1,codeSecret:crypto.randomBytes(32).toString('hex'),users:[owner],codes:{},events:[]}),{flag:'wx',mode:0o600})
  await fs.writeFile(path.join(dataDir,'service.json'),JSON.stringify({registration:'invite',inviteCode:crypto.randomBytes(12).toString('base64url'),maxUsers:20,memberQuotaBytes:256*1048576,feedbackTo:email,smtp:null}),{flag:'wx',mode:0o600})
  return report
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [dataDir,ownerEmail,...flags]=process.argv.slice(2)
  console.log(JSON.stringify(await upgradeAccounts({dataDir,ownerEmail,dryRun:flags.includes('--dry-run')})))
}
