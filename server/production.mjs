import http from 'node:http'
import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scrypt = promisify(crypto.scrypt), run = promisify(execFile)
const prefix = '/tickets', imagePrefix = 'idb://images/'
const idPattern = /^[a-zA-Z0-9-]{1,160}$/
const mimeTypes = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.ico':'image/x-icon' }
const escapeHtml = text => text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
function loginPage(error = '') {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>登录 · 私密票夹</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f5f7;color:#202124;font:16px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100dvh;display:grid;place-items:center}main{width:min(380px,calc(100% - 40px));padding:32px;background:white;border:1px solid #e5e5e7;border-radius:18px}h1{font-size:26px;margin:0 0 12px}p{color:#6b6b70;line-height:1.6;font-size:14px}label{display:block;font-size:14px;margin-top:20px}input{display:block;width:100%;padding:12px;margin-top:7px;border:1px solid #ccc;border-radius:8px;font:inherit}button{margin-top:24px;width:100%;border:0;border-radius:9px;padding:13px;background:#252528;color:white;font:inherit}.error{color:#b42318}</style><main><h1>私密票夹</h1><p>登录后查看你的票、旅程和故事。</p>${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}<form method="post" action="${prefix}/login"><label>账号<input name="username" autocomplete="username" required maxlength="100"></label><label>密码<input name="password" type="password" autocomplete="current-password" required maxlength="200"></label><button type="submit">打开票夹</button></form></main></html>`
}
export async function passwordHash(password, salt) { return (await scrypt(password, salt, 64)).toString('hex') }
async function body(req, limit) {
  const chunks = []; let length = 0
  for await (const chunk of req) { length += chunk.length; if (length > limit) throw Object.assign(new Error('文件过大'), { status: 413 }); chunks.push(chunk) }
  return Buffer.concat(chunks)
}
export async function createWalletServer({ dataDir, distDir, config, scanner }) {
  let manifest = JSON.parse(await fs.readFile(path.join(dataDir, 'manifest.json'), 'utf8'))
  const sessions = new Map(), attempts = new Map()
  let queue = Promise.resolve(), loginJobs = 0, scanJobs = 0
  const serial = task => { const result = queue.then(task); queue = result.catch(() => {}); return result }
  const cookie = (value, age) => `ticket_wallet=${value}; Path=${prefix}/; HttpOnly; ${config.secureCookie !== false ? 'Secure; ' : ''}SameSite=Strict; Max-Age=${age}`
  const commit = async next => {
    // One metadata snapshot per day, in addition to the immutable migration manifest.
    const revisions = path.join(dataDir, 'revisions')
    await fs.mkdir(revisions, { recursive: true, mode: 0o700 })
    await fs.writeFile(path.join(revisions, `${new Date().toISOString().slice(0,10)}.json`), JSON.stringify(manifest), { flag: 'wx', mode: 0o600 }).catch(e => { if (e.code !== 'EEXIST') throw e })
    const temp = path.join(dataDir, `manifest-${crypto.randomUUID()}.tmp`)
    await fs.writeFile(temp, JSON.stringify(next), { mode: 0o600 })
    await fs.rename(temp, path.join(dataDir, 'manifest.json'))
    manifest = next
  }
  const json = (res, status, value) => { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8' }); res.end(JSON.stringify(value)) }
  const redirect = (res, to) => { res.writeHead(303, { Location: to }); res.end() }
  const processTicket = async (ticket, original) => {
    const result = await scanner(original, ticket.sourceFile.sha256)
    const now = new Date().toISOString(), sha = ticket.sourceFile.sha256
    const processedId = `scan-v${result.version}-${sha}`, thumbId = `scan-thumb-v${result.version}-${sha}`
    const additions = []
    for (const [id, kind] of [[processedId,'processed'],[thumbId,'thumbnail']]) {
      const source = path.join(dataDir,'scans',sha,`${kind}.jpg`)
      await fs.copyFile(source, path.join(dataDir,'images',id))
      additions.push({ id, mime:'image/jpeg', size:(await fs.stat(source)).size })
    }
    const fields = result.fields
    const next = { ...ticket, departure:ticket.departure || result.departure, arrival:ticket.arrival || result.arrival, takenAt:ticket.takenAt || fields.takenAt,
      carrierOrTrainNo:ticket.carrierOrTrainNo || fields.trainNo || undefined, seat:ticket.seat || fields.seat || undefined,
      type:fields.documentKind === 'boarding' ? 'boarding-pass' : fields.documentKind !== 'unknown' ? 'train' : ticket.type,
      processedImageUrl:imagePrefix+processedId, thumbnailUrl:imagePrefix+thumbId,
      cropRecipe:{corners:result.corners,rotation:result.rotation || 0,filter:'opencv-perspective-color-preserving-v3'},
      processing:{version:result.version,processedAt:now,cropped:result.cropped,reviewed:false,issues:fields.issues,documentKind:fields.documentKind,departureTime:fields.departureTime,amount:fields.amount},
      tags:ticket.tags.filter(t=>t!=='待整理'), updatedAt:now }
    if (!next.track && result.railRoute?.from === next.departure?.name && result.railRoute?.to === next.arrival?.name) next.railRoute=result.railRoute
    return { ticket:next, images:additions, originalMime: ({JPEG:'image/jpeg',PNG:'image/png',WEBP:'image/webp',GIF:'image/gif',AVIF:'image/avif'})[result.originalFormat] || 'application/octet-stream' }
  }
  return http.createServer(async (req,res) => {
    res.setHeader('Cache-Control','no-store')
    res.setHeader('X-Content-Type-Options','nosniff')
    res.setHeader('X-Frame-Options','DENY')
    // no-referrer makes native POST forms send Origin:null in Chromium.
    // strict-origin retains CSRF validation without disclosing ticket ids or queries.
    res.setHeader('Referrer-Policy','strict-origin')
    res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive')
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
    try {
      const url = new URL(req.url, config.origin), route = url.pathname
      const writes = !['GET','HEAD'].includes(req.method)
      if (writes && req.headers.origin !== config.origin) return json(res,403,{error:'请求来源不匹配'})
      const now = Date.now()
      for (const [key,value] of sessions) if (value < now) sessions.delete(key)
      for (const [key,value] of attempts) if (value.until < now) attempts.delete(key)
      const token = (req.headers.cookie || '').split(';').map(v=>v.trim()).find(v=>v.startsWith('ticket_wallet='))?.slice(14)
      const authenticated = !!token && sessions.has(token)
      if (route === `${prefix}/login`) {
        if (req.method === 'GET') {
          if (authenticated) return redirect(res,`${prefix}/`)
          res.setHeader('Content-Type','text/html; charset=utf-8'); return res.end(loginPage())
        }
        if (req.method !== 'POST') return json(res,405,{error:'Method not allowed'})
        const ip = req.headers['x-real-ip'] || req.socket.remoteAddress
        const attempt = attempts.get(ip) || { count:0,until:now+15*60*1000 }
        if (attempt.count >= 10 || attempts.size > 2000 || loginJobs >= 2) { res.setHeader('Retry-After','900'); return json(res,429,{error:'尝试过多，请 15 分钟后再试'}) }
        attempt.count++; attempts.set(ip,attempt)
        const form = new URLSearchParams((await body(req,4096)).toString())
        loginJobs++
        let hash
        try { hash = await passwordHash(form.get('password') || '',config.salt) } finally { loginJobs-- }
        if (form.get('username') !== config.username || !crypto.timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(config.passwordHash,'hex'))) {
          res.writeHead(401,{'Content-Type':'text/html; charset=utf-8'}); return res.end(loginPage('账号或密码不正确'))
        }
        attempts.delete(ip)
        if (sessions.size >= 100) sessions.delete(sessions.keys().next().value)
        const session = crypto.randomBytes(32).toString('hex')
        sessions.set(session,now+7*86400000)
        res.setHeader('Set-Cookie',cookie(session,7*86400)); return redirect(res,`${prefix}/`)
      }
      if (!authenticated) {
        if (route.startsWith(`${prefix}/api/`) || route.startsWith(`${prefix}/media/`)) return json(res,401,{error:'请先登录'})
        return redirect(res,`${prefix}/login`)
      }
      if (route === `${prefix}/logout` && req.method === 'POST') { sessions.delete(token); res.setHeader('Set-Cookie',cookie('',0)); return redirect(res,`${prefix}/login`) }
      if (route.startsWith(`${prefix}/api/`) && writes && req.headers['x-ticket-wallet'] !== '1') return json(res,403,{error:'缺少请求校验'})
      if (route === `${prefix}/api/tickets` && req.method === 'GET') return json(res,200,manifest.tickets)
      const ticketMatch = route.match(/^\/tickets\/api\/tickets\/([a-zA-Z0-9-]{1,160})$/)
      if (ticketMatch) {
        const id=ticketMatch[1], existing=manifest.tickets.find(t=>t.id===id)
        if (!existing) return json(res,404,{error:'票据不存在'})
        if (req.method === 'GET') return json(res,200,existing)
        if (req.method !== 'PATCH') return json(res,405,{error:'Method not allowed'})
        const patch=JSON.parse((await body(req,5*1048576)).toString())
        const allowed=['type','takenAt','departure','arrival','carrierOrTrainNo','seat','story','tags','companions','track','railRoute','processing']
        const fields=Object.fromEntries(Object.entries(patch).filter(([key])=>allowed.includes(key)))
        if (fields.story !== undefined && (typeof fields.story !== 'string' || fields.story.length > 50000)) return json(res,400,{error:'故事内容过长或格式错误'})
        for (const key of ['tags','companions']) if (fields[key] !== undefined && (!Array.isArray(fields[key]) || fields[key].length > 100 || fields[key].some(v=>typeof v !== 'string' || v.length > 200))) return json(res,400,{error:'标签格式错误'})
        for (const key of ['departure','arrival']) if (fields[key] != null && (typeof fields[key].name !== 'string' || fields[key].name.length > 100)) return json(res,400,{error:'站点格式错误'})
        if (fields.type !== undefined && !['train','flight','boarding-pass','metro','bus','other'].includes(fields.type)) return json(res,400,{error:'票据类型错误'})
        if (fields.takenAt != null && (typeof fields.takenAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fields.takenAt))) return json(res,400,{error:'日期格式错误'})
        for (const key of ['carrierOrTrainNo','seat']) if (fields[key] != null && (typeof fields[key] !== 'string' || fields[key].length > 100)) return json(res,400,{error:'票面字段格式错误'})
        for (const key of ['track','railRoute']) if (fields[key] != null && (!Array.isArray(fields[key].segments) || fields[key].segments.length > 1000 || fields[key].segments.some(segment=>!Array.isArray(segment) || segment.length > 100000 || segment.some(p=>!Array.isArray(p) || p.length!==2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0])>180 || Math.abs(p[1])>90)))) return json(res,400,{error:'轨迹坐标格式错误'})
        const next=await serial(async()=>{
          const current=manifest.tickets.find(t=>t.id===id)
          const updated={...current,...fields,updatedAt:new Date().toISOString()}
          await commit({...manifest,tickets:manifest.tickets.map(t=>t.id===id?updated:t)})
          return updated
        })
        return json(res,200,next)
      }
      if (route === `${prefix}/api/import` && req.method === 'POST') {
        if (scanJobs >= 3) return json(res,429,{error:'正在处理其他照片，请稍后重试'})
        scanJobs++
        try {
          const data=await body(req,40*1048576)
          const sha=crypto.createHash('sha256').update(data).digest('hex'),id=`user-${sha}`
          const result=await serial(async()=>{
            if (manifest.tickets.some(t=>t.id===id)) return {skipped:true}
            const disk=await fs.statfs(dataDir)
            if (disk.bavail*disk.bsize < 512*1048576) throw Object.assign(new Error('服务器剩余空间不足，原有票据未改变'),{status:507})
            const imageId=`original-${sha}`, original=path.join(dataDir,'images',imageId),now=new Date().toISOString()
            await fs.writeFile(original,data,{mode:0o600})
            const name=decodeURIComponent(req.headers['x-file-name'] || 'photo').slice(0,250)
            const ticket={id,type:'other',takenAt:null,departure:null,arrival:null,originalImageUrl:imagePrefix+imageId,processedImageUrl:imagePrefix+imageId,thumbnailUrl:imagePrefix+imageId,sourceFile:{name,size:data.length,sha256:sha},story:'',tags:[],companions:[],createdAt:now,updatedAt:now}
            const processed=await processTicket(ticket,original)
            await commit({...manifest,tickets:[...manifest.tickets,processed.ticket],images:[...manifest.images,{id:imageId,mime:processed.originalMime,size:data.length},...processed.images]})
            return {skipped:false,id}
          })
          return json(res,200,result)
        } finally { scanJobs-- }
      }
      const processMatch=route.match(/^\/tickets\/api\/process\/([a-zA-Z0-9-]{1,160})$/)
      if (processMatch && req.method === 'POST') {
        const result=await serial(async()=>{
          const ticket=manifest.tickets.find(t=>t.id===processMatch[1])
          if (!ticket) throw Object.assign(new Error('票据不存在'),{status:404})
          if (ticket.processing) return {unchanged:true}
          const originalId=ticket.originalImageUrl.slice(imagePrefix.length)
          if (!idPattern.test(originalId)) throw new Error('无效图片引用')
          const processed=await processTicket(ticket,path.join(dataDir,'images',originalId))
          await commit({...manifest,tickets:manifest.tickets.map(t=>t.id===ticket.id?processed.ticket:t),images:[...manifest.images,...processed.images]})
          return {unchanged:false}
        })
        return json(res,200,result)
      }
      const mediaMatch=route.match(/^\/tickets\/media\/([a-zA-Z0-9-]{1,160})$/)
      if (mediaMatch && req.method === 'GET') {
        const image=manifest.images.find(i=>i.id===mediaMatch[1])
        if (!image) return json(res,404,{error:'图片不存在'})
        res.setHeader('Content-Type', /^image\/(jpeg|png|webp|gif|avif)$/.test(image.mime) ? image.mime : 'application/octet-stream')
        const stream=createReadStream(path.join(dataDir,'images',image.id)); stream.on('error',()=>res.destroy()); stream.pipe(res); return
      }
      if (req.method !== 'GET' || !route.startsWith(`${prefix}/`)) return json(res,404,{error:'Not found'})
      const relative=route.slice(prefix.length+1) || 'index.html'
      if (!/^(index\.html|assets\/[a-zA-Z0-9_.-]+|favicon\.svg)$/.test(relative)) return json(res,404,{error:'Not found'})
      const data=await fs.readFile(path.join(distDir,relative))
      res.setHeader('Content-Type',mimeTypes[path.extname(relative)] || 'application/octet-stream'); res.end(data)
    } catch (error) {
      // Never log ticket text, identifiers, original paths or request bodies.
      if (!res.headersSent) json(res,error.status || (error.code==='ENOENT'?404:500),{error:error.status ? error.message : '处理失败，原有收藏未改变，请重试'})
      else res.destroy()
      console.error('wallet-request-failed',error.code || error.name || 'Error')
    }
  })
}

export async function createScanner(dataDir) {
  const {recognizeTicket}=await import('./recognition.mjs')
  const stations=JSON.parse(await fs.readFile(path.join(dataDir,'stations.json'),'utf8'))
  const routes=JSON.parse(await fs.readFile(path.join(dataDir,'routes.json'),'utf8'))
  return async (original,sha) => {
    const directory=path.join(dataDir,'scans',sha)
    await run(process.env.WALLET_PYTHON || '/opt/ticket-wallet-venv/bin/python',[fileURLToPath(new URL('../scripts/scan-ticket-linux.py',import.meta.url)),original,directory],{timeout:120000,maxBuffer:1048576,env:{...process.env,OMP_THREAD_LIMIT:'1',OPENBLAS_NUM_THREADS:'1'}})
    const scan=JSON.parse(await fs.readFile(path.join(directory,'scan.json'),'utf8'))
    const fields=recognizeTicket(scan,new Set(Object.keys(stations)))
    const place=name=>{
      if (!name) return null
      const matches=stations[name] || [], first=matches[0]
      const ambiguous=first && matches.some(p=>Math.abs(p.lat-first.lat)+Math.abs(p.lng-first.lng)>.15)
      return {name,...(!ambiguous && first?{lat:first.lat,lng:first.lng}:{})}
    }
    const key=`${fields.departure}|${fields.arrival}|${/^[GDC]/.test(fields.trainNo || '')?'high-speed':'conventional'}`
    return {...scan,fields,departure:place(fields.departure),arrival:place(fields.arrival),railRoute:fields.documentKind==='ticket'?routes[key] || undefined:undefined}
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataDir=process.env.WALLET_DATA || '/var/lib/ticket-wallet'
  const config=JSON.parse(await fs.readFile(path.join(dataDir,'auth.json'),'utf8'))
  const server=await createWalletServer({dataDir,distDir:fileURLToPath(new URL('../dist/',import.meta.url)),config,scanner:await createScanner(dataDir)})
  server.requestTimeout=150000
  server.listen(Number(process.env.WALLET_PORT || 3031),'127.0.0.1',()=>console.log('Private ticket wallet listening on loopback'))
}
