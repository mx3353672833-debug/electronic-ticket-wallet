import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { initWallet } from '../scripts/init-wallet.mjs'
import { passwordHash } from './production.mjs'

test('initialize empty private wallet without exposing or overwriting credentials',async()=>{
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'wallet-init-test-'))
  const dataDir = path.join(root,'collection')
  try {
    const result = await initWallet({dataDir,origin:'https://wallet.example',username:'test-owner'})
    const login = JSON.parse(await fs.readFile(result.credentialsFile,'utf8'))
    const auth = JSON.parse(await fs.readFile(path.join(dataDir,'auth.json'),'utf8'))
    assert.equal(login.url,'https://wallet.example/tickets/')
    assert.equal(auth.password,undefined)
    assert.equal(auth.passwordHash,await passwordHash(login.password,auth.salt))
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(dataDir,'manifest.json'),'utf8')),{version:1,tickets:[],images:[]})
    assert.deepEqual(await fs.readdir(path.join(dataDir,'images')),[])
    if (process.platform !== 'win32') {
      assert.equal((await fs.stat(dataDir)).mode & 0o777,0o700)
      assert.equal((await fs.stat(result.credentialsFile)).mode & 0o777,0o600)
    }
    await assert.rejects(initWallet({dataDir,origin:'https://wallet.example'}),{code:'EEXIST'})
    assert.deepEqual(JSON.parse(await fs.readFile(result.credentialsFile,'utf8')),login)
    await assert.rejects(initWallet({dataDir:path.join(root,'invalid'),origin:'http://wallet.example'}),/HTTPS origin/)
    await assert.rejects(initWallet({dataDir:path.join(root,'invalid'),origin:'https://wallet.example/tickets/'}),/HTTPS origin/)
    await assert.rejects(fs.access(path.join(root,'invalid')))
  } finally {
    await fs.rm(root,{recursive:true,force:true})
  }
})
