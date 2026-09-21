import http from 'node:http'
import fs from 'node:fs/promises'
import {createReadStream} from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {promisify} from 'node:util'
import {execFile} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {passwordHash,createAccounts} from './accounts.mjs'
import {authPage} from './auth-page.mjs'
import {createMailer} from './mail.mjs'
import {createFeedback} from './feedback.mjs'
import {openCollection} from './collection.mjs'
import {failure,secureEqual} from './private-store.mjs'

export {passwordHash}
const run=promisify(execFile),prefix='/tickets',imagePrefix='idb://images/'
const idPattern=/^[a-zA-Z0-9-]{1,160}$/
const mimeTypes={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}
async function body(req,limit) {
  const chunks=[];let length=0
  for await(const chunk of req){length+=chunk.length;if(length>limit)throw failure(413,'文件过大');chunks.push(chunk)}
  return Buffer.concat(chunks)
}
async function jsonBody(req,limit=16384) {
  try { const value=JSON.parse((await body(req,limit)).toString());if(!value || Array.isArray(value) || typeof value!=='object')throw failure(400,'请求格式错误');return value }
  catch(error){if(error instanceof SyntaxError)throw failure(400,'请求格式错误');throw error}
}
export async function createWalletServer({dataDir,distDir,config,scanner,scannerFactory,serviceConfig,sendMail,now=()=>Date.now()}) {
  const multi=Boolean(serviceConfig)
  const mail=sendMail || (multi?createMailer(serviceConfig):null)
  const accounts=multi?await createAccounts({dataDir,config:serviceConfig,sendMail:mail,now}):null
  const feedback=multi?await createFeedback({dataDir,config:serviceConfig,sendMail:mail,now}):null
  const sessions=new Map(),attempts=new Map(),collections=new Map(),busyUsers=new Set()
  let loginJobs=0,scanJobs=0
  const legacyUser={id:'legacy',role:'owner',storage:'legacy',email:'',quotaBytes:0}
  const getCollection=user=>{
    if(!collections.has(user.id)) {
      if(!idPattern.test(user.id) || (user.storage==='legacy' && user.role!=='owner'))throw new Error('Invalid collection owner')
      const directory=user.storage==='legacy'?dataDir:path.join(dataDir,'users',user.id)
      const loading=(async()=>openCollection({dataDir:directory,scanner:scannerFactory?await scannerFactory(directory,user):scanner || await createScanner(directory,{cacheDir:dataDir,includeRoutes:user.storage==='legacy'})}))()
      collections.set(user.id,loading)
      loading.catch(()=>collections.delete(user.id))
    }
    return collections.get(user.id)
  }
  const cookie=(token,age)=>`ticket_wallet=${token}; Path=${prefix}/; HttpOnly; ${config.secureCookie!==false?'Secure; ':''}SameSite=Strict; Max-Age=${age}`
  const createSession=(res,user)=>{
    for(const [key,value] of sessions)if(value.expires<now())sessions.delete(key)
    if(sessions.size>=1000)sessions.delete(sessions.keys().next().value)
    const token=crypto.randomBytes(32).toString('hex')
    sessions.set(token,{userId:user.id,authVersion:user.authVersion||0,expires:now()+7*86400000})
    res.setHeader('Set-Cookie',cookie(token,7*86400))
  }
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value))}
  const redirect=(res,to)=>{res.writeHead(303,{Location:to});res.end()}
  const revoke=userId=>{for(const [token,session] of sessions)if(session.userId===userId)sessions.delete(token)}
  const login=async(req,identifier,password)=>{
    const ip=String(req.headers['x-real-ip']||req.socket.remoteAddress)
    const time=now(),attempt=attempts.get(ip)||{count:0,until:time+900000}
    if(attempt.count>=10 || attempts.size>2000 || loginJobs>=2)throw failure(429,'尝试过多，请 15 分钟后再试')
    attempt.count++;attempts.set(ip,attempt);loginJobs++
    let user
    try {
      if(multi)user=await accounts.login(identifier,password)
      else if(typeof password==='string' && password.length<=200) {
        const hash=await passwordHash(password,config.salt)
        if(identifier===config.username && secureEqual(hash,config.passwordHash))user=legacyUser
      }
    } finally {loginJobs--}
    if(!user)throw failure(401,'账号或密码不正确')
    attempts.delete(ip)
    return user
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store')
    res.setHeader('X-Content-Type-Options','nosniff')
    res.setHeader('X-Frame-Options','DENY')
    res.setHeader('Referrer-Policy','strict-origin')
    res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive')
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
    try {
      const route=new URL(req.url,config.origin).pathname
      const writes=!['GET','HEAD'].includes(req.method)
      if(writes && req.headers.origin!==config.origin)return json(res,403,{error:'请求来源不匹配'})
      for(const [key,value] of sessions)if(value.expires<now())sessions.delete(key)
      for(const [key,value] of attempts)if(value.until<now())attempts.delete(key)
      const token=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('ticket_wallet='))?.slice(14)
      const session=token && sessions.get(token)
      const account=session?(multi?accounts.getUser(session.userId):legacyUser):null
      const user=account && session.authVersion===(account.authVersion||0)?account:null
      if(req.method==='GET' && ['/tickets/auth.js','/tickets/auth.css'].includes(route)) {
        res.setHeader('Content-Type',mimeTypes[path.extname(route)])
        return res.end(await fs.readFile(fileURLToPath(new URL('.'+route.slice(prefix.length),import.meta.url))))
      }
      if(req.method==='GET' && ['/tickets/login','/tickets/register','/tickets/reset'].includes(route)) {
        // Preserve explicitly restored old links. Move the token to a fragment
        // before rendering; subsequent page requests do not carry it in the URL.
        const legacyInvite=new URL(req.url,config.origin).searchParams.get('invite')
        if(route==='/tickets/register' && legacyInvite && /^(?:[A-Za-z0-9_-]{43}|[A-Za-z0-9_-]{16})$/.test(legacyInvite))return redirect(res,prefix+'/register#invite='+encodeURIComponent(legacyInvite))
        if(user && route!=='/tickets/reset')return redirect(res,prefix+'/')
        const mode=route.split('/').pop()
        if(mode!=='login' && !multi)return json(res,404,{error:'当前服务未启用注册'})
        res.setHeader('Content-Type','text/html; charset=utf-8')
        return res.end(authPage(mode))
      }
      if(route==='/tickets/login' && req.method==='POST') {
        const form=new URLSearchParams((await body(req,4096)).toString())
        const loggedIn=await login(req,form.get('username')||form.get('email'),form.get('password'))
        createSession(res,loggedIn);return redirect(res,prefix+'/')
      }
      if(route.startsWith('/tickets/auth/')) {
        if(req.method!=='POST')return json(res,405,{error:'Method not allowed'})
        if(req.headers['x-ticket-wallet']!=='1')return json(res,403,{error:'缺少请求校验'})
        const input=await jsonBody(req)
        if(route==='/tickets/auth/login') {createSession(res,await login(req,input.email,input.password));return json(res,200,{ok:true})}
        if(!multi)return json(res,404,{error:'当前服务未启用注册'})
        const ip=String(req.headers['x-real-ip']||req.socket.remoteAddress)
        if(route==='/tickets/auth/invitation')return accounts.inviteValid(input.inviteCode)?json(res,200,{ok:true}):json(res,403,{error:'邀请链接无效、已使用或已过期，请向站长索取新链接'})
        if(route==='/tickets/auth/send-code')return json(res,200,await accounts.sendCode(input,ip))
        if(route==='/tickets/auth/register') {createSession(res,await accounts.register(input,ip));return json(res,201,{ok:true})}
        if(route==='/tickets/auth/reset') {const reset=await accounts.reset(input,ip);revoke(reset.id);createSession(res,reset);return json(res,200,{ok:true})}
        return json(res,404,{error:'Not found'})
      }
      if(!user) {
        if(route.startsWith(prefix+'/api/') || route.startsWith(prefix+'/media/'))return json(res,401,{error:'请先登录'})
        return redirect(res,prefix+'/login')
      }
      if(route===prefix+'/logout' && req.method==='POST') {sessions.delete(token);res.setHeader('Set-Cookie',cookie('',0));return redirect(res,prefix+'/login')}
      if(route.startsWith(prefix+'/api/') && writes && req.headers['x-ticket-wallet']!=='1')return json(res,403,{error:'缺少请求校验'})
      if(multi && route===prefix+'/api/invitations') {
        if(req.method==='GET')return json(res,200,accounts.listInvitations(user))
        if(req.method==='POST')return json(res,201,await accounts.createInvitation(user))
      }
      const inviteMatch=route.match(/^\/tickets\/api\/invitations\/([a-zA-Z0-9-]+)$/)
      if(multi && inviteMatch && req.method==='DELETE')return json(res,200,await accounts.revokeInvitation(user,inviteMatch[1]))
      if(multi && route===prefix+'/api/feedback') {
        if(req.method==='POST')return json(res,201,await feedback.submit(user,await jsonBody(req)))
        if(req.method==='GET')return json(res,200,feedback.list(user))
      }
      const feedbackMatch=route.match(/^\/tickets\/api\/feedback\/([a-zA-Z0-9-]+)$/)
      if(multi && feedbackMatch && req.method==='PATCH')return json(res,200,await feedback.update(user,feedbackMatch[1],(await jsonBody(req)).status))
      const collection=await getCollection(user),{commit,processTicket,serial}=collection
      const manifest=collection.manifest
      if(route===prefix+'/api/account' && req.method==='GET')return json(res,200,{...(accounts?accounts.publicUser(user):{role:'owner',email:''}),usedBytes:await collection.usageBytes(),quotaBytes:user.quotaBytes,registration:multi?'invite':'disabled',canInvite:multi && user.role==='owner',feedbackEnabled:multi})
      if(route===prefix+'/api/tickets' && req.method==='GET')return json(res,200,manifest.tickets)
      const ticketMatch=route.match(/^\/tickets\/api\/tickets\/([a-zA-Z0-9-]{1,160})$/)
      if(ticketMatch) {
        const id=ticketMatch[1],existing=manifest.tickets.find(t=>t.id===id)
        if(!existing)return json(res,404,{error:'票据不存在'})
        if(req.method==='GET')return json(res,200,existing)
        if(req.method!=='PATCH')return json(res,405,{error:'Method not allowed'})
        const patch=await jsonBody(req,5*1048576)
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
          const current=collection.manifest
          const updated={...current.tickets.find(t=>t.id===id),...fields,updatedAt:new Date().toISOString()}
          await collection.ensureRoom(Buffer.byteLength(JSON.stringify(fields)),user.quotaBytes)
          await commit({...current,tickets:current.tickets.map(t=>t.id===id?updated:t)})
          return updated
        })
        return json(res,200,next)
      }
      if(route===prefix+'/api/import' && req.method==='POST') {
        if(scanJobs>=2 || busyUsers.has(user.id))throw failure(429,'正在处理照片，请稍后重试')
        scanJobs++;busyUsers.add(user.id)
        try {
          const data=await body(req,40*1048576)
          const sha=crypto.createHash('sha256').update(data).digest('hex'),id='user-'+sha
          const result=await serial(async()=>{
            const manifest=collection.manifest
            if(manifest.tickets.some(t=>t.id===id))return {skipped:true}
            if(manifest.tickets.length>=2000)throw failure(413,'票据数量已达上限，请联系站长')
            await collection.ensureRoom(data.length,user.quotaBytes)
            const imageId='original-'+sha,original=path.join(collection.dataDir,'images',imageId),time=new Date().toISOString()
            const name=decodeURIComponent(req.headers['x-file-name']||'photo').slice(0,250)
            const ticket={id,type:'other',takenAt:null,departure:null,arrival:null,originalImageUrl:imagePrefix+imageId,processedImageUrl:imagePrefix+imageId,thumbnailUrl:imagePrefix+imageId,sourceFile:{name,size:data.length,sha256:sha},story:'',tags:[],companions:[],createdAt:time,updatedAt:time}
            await fs.writeFile(original,data,{mode:0o600})
            let processed
            try {
              processed=await processTicket(ticket,original)
              await collection.ensureRoom(0,user.quotaBytes)
              await commit({...manifest,tickets:[...manifest.tickets,processed.ticket],images:[...manifest.images,{id:imageId,mime:processed.originalMime,size:data.length},...processed.images]})
            } catch(error) {
              // These paths belong only to this uncommitted upload in this user's collection.
              await fs.unlink(original).catch(()=>{})
              for(const image of processed?.images||[])await fs.unlink(path.join(collection.dataDir,'images',image.id)).catch(()=>{})
              await fs.rm(path.join(collection.dataDir,'scans',sha),{recursive:true,force:true}).catch(()=>{})
              throw error
            }
            return {skipped:false,id}
          })
          return json(res,200,result)
        } finally {scanJobs--;busyUsers.delete(user.id)}
      }
      const processMatch=route.match(/^\/tickets\/api\/process\/([a-zA-Z0-9-]{1,160})$/)
      if(processMatch && req.method==='POST') {
        if(scanJobs>=2 || busyUsers.has(user.id))throw failure(429,'正在处理照片，请稍后重试')
        scanJobs++;busyUsers.add(user.id)
        try {
          const result=await serial(async()=>{
            const manifest=collection.manifest,ticket=manifest.tickets.find(t=>t.id===processMatch[1])
            if(!ticket)throw failure(404,'票据不存在')
            if(ticket.processing)return {unchanged:true}
            const originalId=ticket.originalImageUrl.slice(imagePrefix.length)
            if(!idPattern.test(originalId))throw failure(400,'无效图片引用')
            await collection.ensureRoom(0,user.quotaBytes)
            const processed=await processTicket(ticket,path.join(collection.dataDir,'images',originalId))
            await commit({...manifest,tickets:manifest.tickets.map(t=>t.id===ticket.id?processed.ticket:t),images:[...manifest.images,...processed.images]})
            return {unchanged:false}
          })
          return json(res,200,result)
        } finally {scanJobs--;busyUsers.delete(user.id)}
      }
      const mediaMatch=route.match(/^\/tickets\/media\/([a-zA-Z0-9-]{1,160})$/)
      if(mediaMatch && req.method==='GET') {
        const image=manifest.images.find(i=>i.id===mediaMatch[1])
        if(!image)return json(res,404,{error:'图片不存在'})
        res.setHeader('Content-Type',/^image\/(jpeg|png|webp|gif|avif)$/.test(image.mime)?image.mime:'application/octet-stream')
        const stream=createReadStream(path.join(collection.dataDir,'images',image.id));stream.on('error',()=>res.destroy());stream.pipe(res);return
      }
      if(req.method!=='GET' || !route.startsWith(prefix+'/'))return json(res,404,{error:'Not found'})
      const relative=route.slice(prefix.length+1)||'index.html'
      if(!/^(index\.html|assets\/[a-zA-Z0-9_.-]+|favicon\.svg)$/.test(relative))return json(res,404,{error:'Not found'})
      res.setHeader('Content-Type',mimeTypes[path.extname(relative)]||'application/octet-stream')
      res.end(await fs.readFile(path.join(distDir,relative)))
    } catch(error) {
      if(!res.headersSent)json(res,error.status||(error.code==='ENOENT'?404:500),{error:error.status?error.message:'处理失败，原有收藏未改变，请重试'})
      else res.destroy()
      if(!error.status)console.error('wallet-request-failed',error.code||error.name||'Error')
    }
  })
  if(feedback) {
    const timer=setInterval(()=>void feedback.deliver().catch(()=>{}),60000)
    timer.unref();server.on('close',()=>clearInterval(timer))
    void feedback.deliver().catch(()=>{})
  }
  return server
}

export async function createScanner(dataDir, {cacheDir=dataDir, includeRoutes=true}={}) {
  const {recognizeTicket}=await import('./recognition.mjs')
  const stations=JSON.parse(await fs.readFile(path.join(cacheDir,'stations.json'),'utf8'))
  const routes=includeRoutes?JSON.parse(await fs.readFile(path.join(cacheDir,'routes.json'),'utf8')):{}
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

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const dataDir=process.env.WALLET_DATA||'/var/lib/ticket-wallet'
  const config=JSON.parse(await fs.readFile(path.join(dataDir,'auth.json'),'utf8'))
  let serviceConfig
  try {serviceConfig=JSON.parse(await fs.readFile(path.join(dataDir,'service.json'),'utf8'))}
  catch(error){if(error.code!=='ENOENT')throw error}
  const server=await createWalletServer({dataDir,distDir:fileURLToPath(new URL('../dist/',import.meta.url)),config,serviceConfig})
  server.requestTimeout=150000
  server.listen(Number(process.env.WALLET_PORT||3031),'127.0.0.1',()=>console.log('Private ticket wallet listening on loopback'))
}
