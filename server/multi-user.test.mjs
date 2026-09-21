import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import {initWallet} from '../scripts/init-wallet.mjs'
import {upgradeAccounts} from '../scripts/upgrade-accounts.mjs'
import {createWalletServer} from './production.mjs'
import {createFeedback} from './feedback.mjs'

async function fixture(t,{quota=256*1048576,mailFailure=false,scanSize=20,restoredLegacy=false,routePlanner,appearanceFactory,displayRenderer}={}) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'wallet-multi-test-')),dataDir=path.join(root,'data'),distDir=path.join(root,'dist')
  const origin='https://wallet.example'
  await initWallet({dataDir,origin,username:'original-owner'})
  const credentials=JSON.parse(await fs.readFile(path.join(dataDir,'initial-login.json'),'utf8'))
  const config=JSON.parse(await fs.readFile(path.join(dataDir,'auth.json'),'utf8'))
  const original=Buffer.from('synthetic-private-owner-ticket'),sha=crypto.createHash('sha256').update(original).digest('hex'),imageId='original-'+sha,id='user-'+sha
  const ownerTicket={id,type:'train',takenAt:null,departure:null,arrival:null,originalImageUrl:'idb://images/'+imageId,processedImageUrl:'idb://images/'+imageId,thumbnailUrl:'idb://images/'+imageId,story:'private owner story',tags:[],companions:[],sourceFile:{sha256:sha},processing:{version:2}}
  await fs.writeFile(path.join(dataDir,'images',imageId),original)
  const legacyManifest=JSON.stringify({tickets:[ownerTicket],images:[{id:imageId,mime:'image/jpeg',size:original.length}]})
  await fs.writeFile(path.join(dataDir,'manifest.json'),legacyManifest)
  assert.equal((await upgradeAccounts({dataDir,ownerEmail:'owner@example.com',dryRun:true})).dryRun,true)
  await assert.rejects(fs.access(path.join(dataDir,'accounts.json')))
  await upgradeAccounts({dataDir,ownerEmail:'owner@example.com'})
  await assert.rejects(upgradeAccounts({dataDir,ownerEmail:'intruder@example.com'}),/refusing to overwrite/)
  assert.equal(await fs.readFile(path.join(dataDir,'manifest.json'),'utf8'),legacyManifest)
  assert.deepEqual(await fs.readFile(path.join(dataDir,'images',imageId)),original)
  await fs.mkdir(distDir);await fs.writeFile(path.join(distDir,'index.html'),'<title>Test wallet</title>')
  const serviceConfig=JSON.parse(await fs.readFile(path.join(dataDir,'service.json'),'utf8'))
  serviceConfig.memberQuotaBytes=quota
  serviceConfig.inviteCode='legacy-link-0001'
  if(restoredLegacy) {
    const file=path.join(dataDir,'accounts.json'),state=JSON.parse(await fs.readFile(file,'utf8'))
    state.invitations=[{id:crypto.randomUUID(),hash:crypto.createHmac('sha256',state.codeSecret).update('invitation:'+serviceConfig.inviteCode).digest('hex'),createdAt:Date.now(),expiresAt:Date.now()+7*86400000}]
    await fs.writeFile(file,JSON.stringify(state),{mode:0o600})
  }
  let time=Date.now(),server,base,failMail=mailFailure
  const mails=[],scans=[]
  const mail=async message=>{if(failMail)throw new Error('Synthetic SMTP failure');mails.push(message)}
  const start=async()=>{
    server=await createWalletServer({dataDir,distDir,config,serviceConfig,routePlanner,appearanceFactory,displayRenderer,sendMail:mail,now:()=>time,scannerFactory:async directory=>async(source,hash)=>{
      scans.push(directory);const scanDir=path.join(directory,'scans',hash);await fs.mkdir(scanDir,{recursive:true})
      await fs.writeFile(path.join(scanDir,'processed.jpg'),Buffer.alloc(scanSize,1))
      await fs.writeFile(path.join(scanDir,'thumbnail.jpg'),Buffer.alloc(scanSize,2))
      return {version:3,cropped:true,corners:[],originalFormat:'PNG',fields:{takenAt:null,documentKind:'unknown',issues:['review']},departure:null,arrival:null}
    }})
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`
  }
  await start()
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true})})
  const request=(route,{cookie,method='GET',data,raw,origin:requestOrigin=origin,headers={}}={})=>fetch(base+'/tickets'+route,{method,redirect:'manual',headers:{Origin:requestOrigin,'X-Ticket-Wallet':'1',...(cookie?{Cookie:cookie}:{}),...(!raw?{'Content-Type':'application/json'}:{}),...headers},body:raw|| (data!==undefined?JSON.stringify(data):undefined)})
  const cookie=res=>res.headers.get('set-cookie')?.split(';')[0]
  const password='Synthetic-password-123!'
  const owner=async()=>{const res=await request('/auth/login',{method:'POST',data:{email:credentials.username,password:credentials.password}});assert.equal(res.status,200);return cookie(res)}
  const invitations=new Map()
  const newInvite=async()=>{const res=await request('/api/invitations',{cookie:await owner(),method:'POST'});assert.equal(res.status,201);return res.json()}
  const invite=async email=>{if(!invitations.has(email))invitations.set(email,(await newInvite()).token);return invitations.get(email)}
  const code=async(email,purpose='register')=>{
    const res=await request('/auth/send-code',{method:'POST',data:{email,purpose,inviteCode:purpose==='register'?await invite(email):undefined}})
    assert.equal(res.status,200)
    const latest=mails.filter(m=>m.to===email).at(-1)
    const value=latest?.text.match(/验证码是：(\d{6})/)?.[1]
    assert.ok(value)
    assert.ok(!(await res.text()).includes(value))
    return value
  }
  const register=async email=>{const value=await code(email);const res=await request('/auth/register',{method:'POST',data:{email,password,code:value,inviteCode:await invite(email)}});assert.equal(res.status,201);return cookie(res)}
  return {request,cookie,code,register,password,serviceConfig,mails,scans,dataDir,id,imageId,legacyManifest,credentials,owner,invite,newInvite,invitations,
    advance:ms=>{time+=ms},setMailFailure:value=>{failMail=value},restart:async()=>{await new Promise(resolve=>server.close(resolve));await start()},
  }
}

const syntheticAppearance=async()=>async ticket=>{
  const bytes=Buffer.from('synthetic-styled-image'),hash=crypto.createHash('sha256').update(ticket.processedImageUrl).digest('hex')
  const images=[{id:'paper-v1-'+hash,mime:'image/png',size:bytes.length,bytes},{id:'paper-v1-'+hash+'-thumb',mime:'image/png',size:bytes.length,bytes}]
  const processedImageUrl='idb://images/'+images[0].id
  return {images,patch:{processedImageUrl,thumbnailUrl:'idb://images/'+images[1].id,appearance:{version:'paper-v1',imageUrl:processedImageUrl,sourceImageUrl:ticket.processedImageUrl,sourceThumbnailUrl:ticket.thumbnailUrl}}}
}

test('small display images remain authenticated, collection-scoped, no-store and read-only',async t=>{
  const calls=[]
  const f=await fixture(t,{displayRenderer:async(dir,image,variant)=>{calls.push({dir,id:image.id,variant});return path.join(dir,'images',image.id)}})
  const owner=await f.owner(),other=await f.register('display-other@example.com'),route='/media/'+f.imageId+'?view=screen'
  assert.equal((await f.request(route)).status,401)
  assert.equal((await f.request(route,{cookie:other})).status,404)
  assert.equal(calls.length,0)
  const response=await f.request(route,{cookie:owner})
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store')
  assert.equal(calls.length,1);assert.equal(calls[0].dir,f.dataDir);assert.equal(calls[0].variant,'screen')
  assert.equal((await f.request('/media/'+f.imageId+'?view=anything',{cookie:owner})).status,400)
  assert.equal(await fs.readFile(path.join(f.dataDir,'manifest.json'),'utf8'),f.legacyManifest)
  await f.request('/logout',{cookie:owner,method:'POST'})
  assert.equal((await f.request(route,{cookie:owner})).status,401)
})

test('appearance is private, idempotent and preserves original bytes, metadata and old scans',async t=>{
  const f=await fixture(t,{appearanceFactory:syntheticAppearance}),owner=await f.owner(),alice=await f.register('alice@example.com')
  const url='/api/appearance/'+f.id,read=async()=> (await f.request('/api/tickets/'+f.id,{cookie:owner})).json()
  const before=await read(),source=await fs.readFile(path.join(f.dataDir,'images',f.imageId))
  assert.equal((await f.request(url,{method:'POST'})).status,401)
  assert.equal((await f.request(url,{cookie:alice,method:'POST'})).status,404)
  assert.equal((await f.request(url,{cookie:owner,method:'POST',origin:'https://attacker.example'})).status,403)
  assert.deepEqual(await(await f.request(url,{cookie:owner,method:'POST'})).json(),{unchanged:false})
  const after=await read()
  for(const key of Object.keys(before).filter(key=>!['processedImageUrl','thumbnailUrl'].includes(key)))assert.deepEqual(after[key],before[key])
  assert.equal(after.appearance.sourceImageUrl,before.processedImageUrl)
  assert.match(after.processedImageUrl,/^idb:\/\/images\/paper-v1-/)
  assert.equal(f.scans.length,0)
  assert.deepEqual(await fs.readFile(path.join(f.dataDir,'images',f.imageId)),source)
  const media=after.processedImageUrl.replace('idb://images/','/media/')
  assert.equal((await f.request(media,{cookie:owner})).status,200)
  assert.equal((await f.request(media,{cookie:alice})).status,404)
  assert.equal((await f.request(media)).status,401)
  assert.deepEqual(await(await f.request(url,{cookie:owner,method:'POST'})).json(),{unchanged:true})
  await f.request('/api/tickets/'+f.id,{cookie:owner,method:'PATCH',data:{story:'new story',appearance:{imageUrl:'bad'},processedImageUrl:'blob:bad'}})
  assert.equal((await read()).processedImageUrl,after.processedImageUrl)
  assert.deepEqual((await read()).appearance,after.appearance)
  await f.restart()
  const reloaded=await(await f.request('/api/tickets/'+f.id,{cookie:await f.owner()})).json()
  assert.equal(reloaded.processedImageUrl,after.processedImageUrl);assert.equal(reloaded.story,'new story')
})

test('new uploads automatically gain styled faces and thumbnails without altering originals',async t=>{
  const f=await fixture(t,{appearanceFactory:syntheticAppearance}),alice=await f.register('alice@example.com')
  const raw=Buffer.from('synthetic-new-photo')
  const response=await f.request('/api/import',{cookie:alice,method:'POST',raw})
  assert.equal(response.status,200)
  const {id}=await response.json(),ticket=await(await f.request('/api/tickets/'+id,{cookie:alice})).json()
  assert.match(ticket.processedImageUrl,/^idb:\/\/images\/paper-v1-/)
  assert.match(ticket.thumbnailUrl,/-thumb$/)
  assert.match(ticket.appearance.sourceImageUrl,/^idb:\/\/images\/scan-v3-/)
  const original=await f.request(ticket.originalImageUrl.replace('idb://images/','/media/'),{cookie:alice})
  assert.deepEqual(Buffer.from(await original.arrayBuffer()),raw)
})

test('appearance quota rejection leaves existing collection and files unchanged',async t=>{
  const f=await fixture(t,{quota:10000,appearanceFactory:async()=>async ticket=>{
    const result=await(await syntheticAppearance())(ticket)
    result.images=result.images.map(image=>({...image,bytes:Buffer.alloc(20000),size:20000}))
    return result
  }}),alice=await f.register('alice@example.com')
  assert.equal((await f.request('/api/import',{cookie:alice,method:'POST',raw:Buffer.from('new-photo')})).status,413)
  assert.deepEqual(await(await f.request('/api/tickets',{cookie:alice})).json(),[])
  assert.equal(await fs.readFile(path.join(f.dataDir,'manifest.json'),'utf8'),f.legacyManifest)
  const state=JSON.parse(await fs.readFile(path.join(f.dataDir,'accounts.json'),'utf8'))
  const dir=path.join(f.dataDir,'users',state.users.find(user=>user.email==='alice@example.com').id)
  assert.deepEqual(await fs.readdir(path.join(dir,'images')),[])
})

test('route refresh is private, keeps photos and stories, and protects edits and GPX',async t=>{
  let result={segments:[[[110,30],[111,31]]],distanceKm:100},release,started
  const f=await fixture(t,{routePlanner:async()=>{started?.();if(release)await new Promise(resolve=>{release=resolve});return result}}),owner=await f.owner(),alice=await f.register('alice@example.com')
  const url='/api/routes/'+f.id,patch=data=>f.request('/api/tickets/'+f.id,{cookie:owner,method:'PATCH',data})
  await patch({takenAt:'2026-09-21',carrierOrTrainNo:'G1',departure:{name:'甲'},arrival:{name:'乙'}})
  assert.equal((await f.request(url,{method:'POST'})).status,401)
  assert.equal((await f.request(url,{cookie:alice,method:'POST'})).status,404)
  assert.equal((await f.request(url,{cookie:owner,method:'POST',origin:'https://attacker.example'})).status,403)
  assert.equal((await (await f.request(url,{cookie:owner,method:'POST'})).json()).status,'updated')
  const read=async()=> (await f.request('/api/tickets/'+f.id,{cookie:owner})).json()
  assert.equal((await read()).story,'private owner story');assert.equal((await read()).originalImageUrl,'idb://images/'+f.imageId)
  result=null;assert.equal((await (await f.request(url,{cookie:owner,method:'POST'})).json()).status,'not-found');assert.equal((await read()).railRoute.distanceKm,100)
  await patch({takenAt:'2026-09-20'});assert.equal((await read()).railRoute,undefined)
  result={segments:[[[110,30],[111,31]]],distanceKm:200};release=true
  const begin=new Promise(resolve=>{started=resolve}),pending=f.request(url,{cookie:owner,method:'POST'});await begin
  await patch({carrierOrTrainNo:'G2'});release();assert.equal((await pending).status,409);assert.equal((await read()).railRoute,undefined)
  await patch({track:{segments:[[[110,30],[111,31]]]}})
  assert.equal((await (await f.request(url,{cookie:owner,method:'POST'})).json()).status,'skipped')
})

test('migration preserves legacy data; registration isolates tickets, media, processing and admin feedback',async t=>{
  const f=await fixture(t),alice=await f.register('alice@example.com'),owner=await f.owner()
  assert.deepEqual(await (await f.request('/api/tickets',{cookie:alice})).json(),[])
  assert.equal((await (await f.request('/api/tickets',{cookie:owner})).json())[0].story,'private owner story')
  for(const route of ['/api/tickets/'+f.id,'/media/'+f.imageId])assert.equal((await f.request(route,{cookie:alice})).status,404)
  assert.equal((await f.request('/api/tickets/'+f.id,{cookie:alice,method:'PATCH',data:{story:'steal'}})).status,404)
  assert.equal((await f.request('/api/process/'+f.id,{cookie:alice,method:'POST',data:{}})).status,404)
  assert.equal((await f.request('/api/feedback',{cookie:alice})).status,403)
  assert.equal((await f.request('/api/account',{cookie:alice})).status,200)
  const account=await (await f.request('/api/account',{cookie:alice})).json()
  assert.equal(account.inviteCode,undefined);assert.equal(account.role,'member');assert.equal(account.passwordHash,undefined)
  assert.equal((await f.request('/api/tickets')).status,401)
  assert.equal((await f.request('/media/'+f.imageId)).status,401)
  assert.equal((await f.request('/accounts.json',{cookie:owner})).status,404)
  assert.equal((await f.request('/service.json',{cookie:owner})).status,404)
  assert.equal((await f.request('/auth/send-code',{method:'POST',origin:'https://attacker.example',data:{}})).status,403)
  assert.equal((await f.request('/auth/register',{method:'POST',data:{email:'intruder@example.com',password:f.password,code:'123456',inviteCode:'wrong'}})).status,403)
  assert.equal(await fs.readFile(path.join(f.dataDir,'manifest.json'),'utf8'),f.legacyManifest)
  const state=await fs.readFile(path.join(f.dataDir,'accounts.json'),'utf8');assert.ok(!state.includes(f.password));assert.ok(!state.includes(f.credentials.password))
})

test('identical uploads belong to separate users; edits and sessions stay isolated after restart',async t=>{
  const f=await fixture(t),alice=await f.register('alice@example.com'),bob=await f.register('bob@example.com')
  const raw=Buffer.from('synthetic-friend-photo')
  const first=await (await f.request('/api/import',{cookie:alice,method:'POST',raw})).json()
  const second=await (await f.request('/api/import',{cookie:bob,method:'POST',raw})).json()
  assert.equal(first.skipped,false);assert.equal(second.skipped,false);assert.equal(first.id,second.id)
  assert.equal(new Set(f.scans).size,2)
  assert.deepEqual(await (await f.request('/api/import',{cookie:alice,method:'POST',raw})).json(),{skipped:true})
  await f.request('/api/tickets/'+first.id,{cookie:alice,method:'PATCH',data:{story:'Only Alice',userId:'legacy'}})
  assert.equal((await (await f.request('/api/tickets/'+second.id,{cookie:bob})).json()).story,'')
  await f.restart()
  assert.equal((await f.request('/api/tickets',{cookie:alice})).status,401)
  const login=await f.request('/auth/login',{method:'POST',data:{email:'ALICE@EXAMPLE.COM',password:f.password}})
  const restored=await (await f.request('/api/tickets',{cookie:f.cookie(login)})).json()
  assert.equal(restored.length,1);assert.equal(restored[0].story,'Only Alice')
  assert.equal(restored[0].userId,undefined)
})

test('codes are one-use, purpose-bound, expiring, throttled and locked after five mistakes',async t=>{
  const f=await fixture(t),email='alice@example.com',code=await f.code(email)
  assert.equal((await f.request('/auth/send-code',{method:'POST',data:{email,purpose:'register',inviteCode:await f.invite(email)}})).status,429)
  for(let i=0;i<5;i++)assert.equal((await f.request('/auth/register',{method:'POST',data:{email,code:code==='000000'?'000001':'000000',password:f.password,inviteCode:await f.invite(email)}})).status,400)
  assert.equal((await f.request('/auth/register',{method:'POST',data:{email,code,password:f.password,inviteCode:await f.invite(email)}})).status,400)
  f.advance(61000);const expired=await f.code(email);f.advance(600001)
  assert.equal((await f.request('/auth/register',{method:'POST',data:{email,code:expired,password:f.password,inviteCode:await f.invite(email)}})).status,400)
  const fresh=await f.code(email)
  assert.equal((await f.request('/auth/reset',{method:'POST',data:{email,code:fresh,password:f.password}})).status,400)
  const data={email,code:fresh,password:f.password,inviteCode:await f.invite(email)}
  const results=await Promise.all([f.request('/auth/register',{method:'POST',data}),f.request('/auth/register',{method:'POST',data})])
  assert.deepEqual(results.map(r=>r.status).sort(),[201,403])
})

test('password reset verifies mail, revokes all old sessions and does not change tickets',async t=>{
  const f=await fixture(t),alice=await f.register('alice@example.com');f.advance(61000)
  const code=await f.code('alice@example.com','reset'),password='A-new-synthetic-password!'
  const reset=await f.request('/auth/reset',{method:'POST',data:{email:'alice@example.com',code,password}})
  assert.equal(reset.status,200)
  assert.equal((await f.request('/api/tickets',{cookie:alice})).status,401)
  assert.equal((await f.request('/api/tickets',{cookie:f.cookie(reset)})).status,200)
  assert.equal((await f.request('/auth/login',{method:'POST',data:{email:'alice@example.com',password:f.password}})).status,401)
  assert.equal((await f.request('/auth/login',{method:'POST',data:{email:'alice@example.com',password}})).status,200)
  assert.equal((await f.request('/auth/reset',{method:'POST',data:{email:'alice@example.com',code,password}})).status,400)
  const mailCount=f.mails.length
  assert.equal((await f.request('/auth/send-code',{method:'POST',data:{email:'unknown@example.com',purpose:'reset'}})).status,200)
  assert.equal(f.mails.length,mailCount)
})

test('SMTP failure never exposes a code or creates a usable challenge',async t=>{
  const f=await fixture(t,{mailFailure:true})
  const response=await f.request('/auth/send-code',{method:'POST',data:{email:'alice@example.com',purpose:'register',inviteCode:await f.invite('alice@example.com')}})
  assert.equal(response.status,502)
  const state=JSON.parse(await fs.readFile(path.join(f.dataDir,'accounts.json'),'utf8'))
  assert.deepEqual(state.codes,{})
  assert.equal(state.users.length,1)
})

test('quota rejection removes only the uncommitted upload, leaving the owner untouched',async t=>{
  const f=await fixture(t,{quota:1000,scanSize:1000}),alice=await f.register('alice@example.com')
  assert.equal((await f.request('/api/import',{cookie:alice,method:'POST',raw:Buffer.from('test')})).status,413)
  assert.deepEqual(await (await f.request('/api/tickets',{cookie:alice})).json(),[])
  const accounts=JSON.parse(await fs.readFile(path.join(f.dataDir,'accounts.json'),'utf8'))
  const directory=path.join(f.dataDir,'users',accounts.users.find(u=>u.email==='alice@example.com').id)
  assert.deepEqual(await fs.readdir(path.join(directory,'images')),[])
  assert.deepEqual(await fs.readdir(path.join(directory,'scans')),[])
  assert.equal(await fs.readFile(path.join(f.dataDir,'manifest.json'),'utf8'),f.legacyManifest)
})

test('feedback is private to the owner, durable when mail fails, rate limited and retryable',async t=>{
  const f=await fixture(t),alice=await f.register('alice@example.com'),owner=await f.owner()
  f.setMailFailure(true)
  const result=await f.request('/api/feedback',{cookie:alice,method:'POST',data:{category:'suggestion',message:'Synthetic suggestion, please improve search.'}})
  assert.equal(result.status,201)
  const item=(await (await f.request('/api/feedback',{cookie:owner})).json())[0]
  assert.equal(item.email,'alice@example.com');assert.equal(item.notification,'pending')
  assert.equal((await f.request('/api/feedback',{cookie:alice,method:'POST',data:{category:'bug',message:'Too soon'}})).status,429)
  assert.equal((await f.request('/api/feedback/'+item.id,{cookie:alice,method:'PATCH',data:{status:'resolved'}})).status,403)
  assert.equal((await f.request('/api/feedback/'+item.id,{cookie:owner,method:'PATCH',data:{status:'resolved'}})).status,200)
  f.advance(86400001)
  const outbox=[]
  const feedback=await createFeedback({dataDir:f.dataDir,config:f.serviceConfig,sendMail:async message=>outbox.push(message),now:()=>Date.now()+2*86400000})
  await feedback.deliver()
  assert.equal(outbox.length,1);assert.equal(outbox[0].to,'owner@example.com');assert.equal(outbox[0].replyTo,'alice@example.com')
  assert.equal(feedback.list({role:'owner'})[0].notification,'sent')
})

test('one invitation admits only one of two different emails, atomically and across restarts',async t=>{
  const f=await fixture(t),owner=await f.owner(),invitation=await f.newInvite()
  const token=invitation.token
  assert.equal(token.length,43)
  for(const email of ['alice@example.com','bob@example.com'])f.invitations.set(email,token)
  // Visiting/validating the link and sending codes do not spend the invitation.
  for(let i=0;i<2;i++)assert.equal((await f.request('/auth/invitation',{method:'POST',data:{inviteCode:token}})).status,200)
  const codes=await Promise.all(['alice@example.com','bob@example.com'].map(email=>f.code(email)))
  const responses=await Promise.all(['alice@example.com','bob@example.com'].map((email,i)=>f.request('/auth/register',{method:'POST',data:{email,code:codes[i],password:f.password,inviteCode:token}})))
  assert.deepEqual(responses.map(r=>r.status).sort(),[201,403])
  const state=JSON.parse(await fs.readFile(path.join(f.dataDir,'accounts.json'),'utf8'))
  assert.equal(state.users.length,2);assert.ok(state.invitations[0].usedAt)
  assert.ok(!JSON.stringify(state).includes(token))
  const listed=await (await f.request('/api/invitations',{cookie:owner})).json()
  assert.equal(listed[0].status,'used');assert.equal(listed[0].token,undefined);assert.equal(listed[0].hash,undefined)
  const winner=f.cookie(responses.find(r=>r.status===201))
  for(const method of ['GET','POST'])assert.equal((await f.request('/api/invitations',{cookie:winner,method})).status,403)
  assert.equal((await f.request('/api/invitations/'+invitation.id,{cookie:winner,method:'DELETE'})).status,403)
  assert.equal((await f.request('/api/invitations',{method:'POST'})).status,401)
  assert.equal((await f.request('/api/invitations',{cookie:owner,method:'POST',origin:'https://attacker.example'})).status,403)
  await f.restart()
  assert.equal((await f.request('/auth/invitation',{method:'POST',data:{inviteCode:token}})).status,403)
  assert.equal((await f.request('/auth/send-code',{method:'POST',data:{email:'other@example.com',purpose:'register',inviteCode:token}})).status,403)
})

test('invites reject legacy/missing tokens, expire, revoke and bind the email code to its link',async t=>{
  const f=await fixture(t),owner=await f.owner()
  for(const inviteCode of [undefined,'wrong',f.serviceConfig.inviteCode]) {
    assert.equal((await f.request('/auth/send-code',{method:'POST',data:{email:'alice@example.com',purpose:'register',inviteCode}})).status,403)
    assert.equal((await f.request('/auth/register',{method:'POST',data:{email:'alice@example.com',password:f.password,code:'123456',inviteCode}})).status,403)
  }
  assert.equal(f.mails.length,0)
  const code=await f.code('alice@example.com'),original=await f.invite('alice@example.com'),other=await f.newInvite()
  assert.equal((await f.request('/auth/register',{method:'POST',data:{email:'alice@example.com',code,password:f.password,inviteCode:other.token}})).status,400)
  assert.equal((await f.request('/auth/invitation',{method:'POST',data:{inviteCode:original}})).status,200)
  assert.equal((await f.request('/api/invitations/'+other.id,{cookie:owner,method:'DELETE'})).status,200)
  assert.equal((await f.request('/auth/invitation',{method:'POST',data:{inviteCode:other.token}})).status,403)
  await f.restart()
  assert.equal((await f.request('/auth/invitation',{method:'POST',data:{inviteCode:original}})).status,200)
  assert.equal((await f.request('/auth/invitation',{method:'POST',data:{inviteCode:other.token}})).status,403)
  f.advance(7*86400000+1)
  assert.equal((await f.request('/auth/invitation',{method:'POST',data:{inviteCode:original}})).status,403)
  const page=await (await f.request('/register')).text()
  assert.match(page,/form[^>]*hidden/);assert.doesNotMatch(page,/朋友发给你的邀请码/)
})

test('explicitly restored legacy URL stays one-use for competing emails and after restart',async t=>{
  const f=await fixture(t,{restoredLegacy:true}),token=f.serviceConfig.inviteCode
  const page=await f.request('/register?invite='+token)
  assert.equal(page.status,303)
  assert.equal(page.headers.get('location'),'/tickets/register#invite='+token)
  for(const email of ['alice@example.com','bob@example.com'])f.invitations.set(email,token)
  const codes=await Promise.all(['alice@example.com','bob@example.com'].map(email=>f.code(email)))
  const results=await Promise.all(['alice@example.com','bob@example.com'].map((email,i)=>f.request('/auth/register',{method:'POST',data:{email,code:codes[i],password:f.password,inviteCode:token}})))
  assert.deepEqual(results.map(r=>r.status).sort(),[201,403])
  await f.restart()
  assert.equal((await f.request('/auth/invitation',{method:'POST',data:{inviteCode:token}})).status,403)
  assert.equal((await f.request('/register?invite=https%3A%2F%2Fattacker.example')).headers.get('location'),null)
  const owner=await f.owner(),list=await(await f.request('/api/invitations',{cookie:owner})).json()
  assert.equal(list[0].status,'used')
  const modern=await f.newInvite()
  assert.equal((await f.request('/auth/invitation',{method:'POST',data:{inviteCode:modern.token}})).status,200)
})
