import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createWalletServer, passwordHash } from './production.mjs'

test('private server: auth, CSRF, media protection, metadata persistence, duplicate import and logout',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'wallet-server-test-'))
  const source=Buffer.from('synthetic-image-bytes-not-a-real-ticket')
  const sha=(await import('node:crypto')).createHash('sha256').update(source).digest('hex')
  const imageId=`original-${sha}`,id=`user-${sha}`
  const ticket={id,type:'train',originalImageUrl:`idb://images/${imageId}`,processedImageUrl:`idb://images/${imageId}`,thumbnailUrl:`idb://images/${imageId}`,story:'original story',tags:[],companions:[],processing:{version:2},sourceFile:{sha256:sha},railRoute:{segments:[[[1,1],[2,2]]]}}
  await fs.mkdir(path.join(root,'images'))
  await fs.mkdir(path.join(root,'dist'))
  await fs.writeFile(path.join(root,'dist','index.html'),'<title>Private app</title>')
  await fs.writeFile(path.join(root,'images',imageId),source)
  await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify({tickets:[ticket],images:[{id:imageId,mime:'image/jpeg',size:source.length}]}))
  const origin='https://wallet.example',salt='test-salt',password='test-only-password'
  const config={origin,username:'test',salt,passwordHash:await passwordHash(password,salt)}
  const scanner=async()=>{throw new Error('Migrated tickets must not be rescanned')}
  let server=await createWalletServer({dataDir:root,distDir:path.join(root,'dist'),config,scanner})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  let base=`http://127.0.0.1:${server.address().port}`
  const call=(route,options={})=>fetch(base+'/tickets'+route,{redirect:'manual',...options})
  try {
    assert.equal((await call('/')).status,303)
    assert.equal((await call('/api/tickets')).status,401)
    assert.equal((await call('/media/'+imageId)).status,401)
    assert.equal((await call('/login',{method:'POST',body:'username=test&password=test-only-password'})).status,403)
    assert.equal((await call('/login',{method:'POST',headers:{Origin:origin},body:'username=test&password=wrong'})).status,401)
    const login=await call('/login',{method:'POST',headers:{Origin:origin},body:new URLSearchParams({username:'test',password})})
    assert.equal(login.status,303)
    assert.match(login.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/)
    const Cookie=login.headers.get('set-cookie').split(';')[0]
    const headers={Cookie,Origin:origin,'X-Ticket-Wallet':'1','Content-Type':'application/json'}
    assert.equal((await call('/',{headers})).status,200)
    const media=await call('/media/'+imageId,{headers})
    assert.equal(media.headers.get('cache-control'),'no-store')
    assert.deepEqual(Buffer.from(await media.arrayBuffer()),source)
    assert.equal((await call('/api/tickets/'+id,{method:'PATCH',headers:{...headers,Origin:'https://attacker.example'},body:'{"story":"bad"}'})).status,403)
    const patched=await call('/api/tickets/'+id,{method:'PATCH',headers,body:JSON.stringify({story:'saved story',thumbnailUrl:'https://attacker.example',railRoute:null})})
    assert.equal(patched.status,200)
    assert.equal((await patched.json()).thumbnailUrl,ticket.thumbnailUrl)
    const disk=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'))
    assert.equal(disk.tickets[0].story,'saved story')
    assert.equal(disk.tickets[0].railRoute,null)
    assert.equal((await call('/api/tickets/'+id,{method:'PATCH',headers,body:'{"tags":"bad"}'})).status,400)
    assert.deepEqual(await (await call('/api/import',{method:'POST',headers,body:source})).json(),{skipped:true})
    assert.deepEqual(await (await call('/api/process/'+id,{method:'POST',headers})).json(),{unchanged:true})
    assert.equal((await call('/auth.json',{headers})).status,404)
    assert.equal((await call('/media/manifest.json',{headers})).status,404)
    assert.equal((await call('/logout',{method:'POST',headers})).status,303)
    assert.equal((await call('/api/tickets',{headers})).status,401)
    await new Promise(resolve=>server.close(resolve))
    server=await createWalletServer({dataDir:root,distDir:path.join(root,'dist'),config,scanner})
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
    base=`http://127.0.0.1:${server.address().port}`
    const again=await call('/login',{method:'POST',headers:{Origin:origin},body:new URLSearchParams({username:'test',password})})
    const restored=await (await call('/api/tickets',{headers:{Cookie:again.headers.get('set-cookie').split(';')[0]}})).json()
    assert.equal(restored[0].story,'saved story')
    for (let i=0;i<10;i++) await call('/login',{method:'POST',headers:{Origin:origin},body:'username=test&password=wrong'})
    assert.equal((await call('/login',{method:'POST',headers:{Origin:origin},body:'username=test&password=wrong'})).status,429)
  } finally {
    await new Promise(resolve=>server.close(resolve))
    await fs.rm(root,{recursive:true,force:true})
  }
})
