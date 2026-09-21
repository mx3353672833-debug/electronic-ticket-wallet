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

async function fixture(t,{quota=256*1048576,mailFailure=false,scanSize=20}={}) {
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
  serviceConfig.inviteCode='legacy-shared-code-must-not-work'
  let time=Date.now(),server,base,failMail=mailFailure
  const mails=[],scans=[]
  const mail=async message=>{if(failMail)throw new Error('Synthetic SMTP failure');mails.push(message)}
  const start=async()=>{
    server=await createWalletServer({dataDir,distDir,config,serviceConfig,sendMail:mail,now:()=>time,scannerFactory:async directory=>async(source,hash)=>{
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
