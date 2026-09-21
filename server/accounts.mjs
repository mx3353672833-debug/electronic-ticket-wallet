import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {promisify} from 'node:util'
import {failure,privateStore,secureEqual} from './private-store.mjs'

const scrypt=promisify(crypto.scrypt)
export async function passwordHash(password,salt) { return (await scrypt(password,salt,64)).toString('hex') }
export function normalizeEmail(value) {
  if(typeof value !== 'string') throw failure(400,'请输入有效邮箱')
  const email=value.trim().toLowerCase()
  if(email.length>254 || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) throw failure(400,'请输入有效邮箱')
  return email
}
function checkPassword(password) {
  if(typeof password !== 'string' || password.length<12 || password.length>200) throw failure(400,'密码需要 12–200 个字符')
}
export async function createAccounts({dataDir,config,sendMail,now=()=>Date.now()}) {
  if(!['invite','open'].includes(config.registration) || (config.registration==='invite' && (typeof config.inviteCode!=='string' || config.inviteCode.length<12))) throw new Error('Invalid registration configuration')
  const store=await privateStore(path.join(dataDir,'accounts.json'))
  const state=store.read()
  if(state.version!==1 || !Array.isArray(state.users) || typeof state.codeSecret!=='string' || state.codeSecret.length<32 || state.users.filter(u=>u.role==='owner').length!==1) throw new Error('Invalid accounts store')
  const digest=text=>crypto.createHmac('sha256',state.codeSecret).update(text).digest('hex')
  const publicUser=user=>({id:user.id,email:user.email,role:user.role,quotaBytes:user.quotaBytes})
  const getUser=id=>store.read().users.find(u=>u.id===id)
  const inviteValid=value=>config.registration!=='invite' || (typeof config.inviteCode==='string' && config.inviteCode.length>=12 && secureEqual(value||'',config.inviteCode))
  const codeKey=(email,purpose)=>digest(`${purpose}:${email}`)
  const codeHash=(email,purpose,code)=>digest(`${purpose}:${email}:${code}`)
  const emailReply={ok:true,message:'如邮箱可用于此操作，验证码已发送，10 分钟内有效。'}
  const sendCode=async({email:input,purpose,inviteCode},ip)=>{
    const email=normalizeEmail(input)
    if(!['register','reset'].includes(purpose)) throw failure(400,'无效的验证码用途')
    if(purpose==='register' && !inviteValid(inviteCode)) throw failure(403,'请输入有效邀请码')
    if(!sendMail) throw failure(503,'邮件服务暂时不可用，请稍后重试')
    const code=String(crypto.randomInt(0,1000000)).padStart(6,'0'),time=now(),key=codeKey(email,purpose),ipHash=digest(ip)
    const reservation=await store.update(next=>{
      next.events=next.events.filter(e=>e.at>time-86400000)
      for(const [k,v] of Object.entries(next.codes)) if(v.expires<=time) delete next.codes[k]
      const events=next.events.filter(e=>e.kind==='code')
      if(events.length>=100 || events.filter(e=>e.at>time-3600000).length>=40 || events.filter(e=>e.ipHash===ipHash).length>=20 || events.filter(e=>e.ipHash===ipHash && e.at>time-3600000).length>=10 || events.filter(e=>e.emailHash===digest(email)).length>=8 || events.some(e=>e.emailHash===digest(email) && e.at>time-60000)) throw failure(429,'验证码请求过于频繁，请稍后再试')
      next.events.push({kind:'code',at:time,ipHash,emailHash:digest(email)})
      const existing=next.users.find(u=>u.email===email)
      if((purpose==='register' && existing) || (purpose==='reset' && !existing)) return null
      if(purpose==='register' && next.users.length>=(config.maxUsers||20)) throw failure(503,'本次内测名额已满，请联系站长')
      next.codes[key]={hash:codeHash(email,purpose,code),expires:time+600000,attempts:0,sent:false}
      return next.codes[key].hash
    })
    if(!reservation) return emailReply
    try {
      await sendMail({to:email,subject:purpose==='register'?'票夹 · 注册验证码':'票夹 · 重置密码验证码',text:`你的票夹${purpose==='register'?'注册':'重置密码'}验证码是：${code}\n\n10 分钟内有效，请勿透露给他人。如果不是你本人操作，请忽略此邮件。`})
      await store.update(next=>{if(next.codes[key]?.hash===reservation) next.codes[key].sent=true})
    } catch {
      await store.update(next=>{if(next.codes[key]?.hash===reservation) delete next.codes[key]})
      throw failure(502,'邮件发送失败，请稍后重试')
    }
    return emailReply
  }
  const finishCode=async({email:input,code,password,inviteCode},purpose,ip)=>{
    const email=normalizeEmail(input)
    checkPassword(password)
    if(typeof code!=='string' || !/^\d{6}$/.test(code)) throw failure(400,'请输入 6 位验证码')
    if(purpose==='register' && !inviteValid(inviteCode)) throw failure(403,'请输入有效邀请码')
    const key=codeKey(email,purpose)
    // Code checking, consumption and account creation are one serialized mutation.
    const result=await store.update(async next=>{
      const record=next.codes[key],time=now()
      if(!record || !record.sent || record.expires<=time || record.attempts>=5) return {error:'验证码无效或已过期，请重新获取'}
      if(!secureEqual(record.hash,codeHash(email,purpose,code))) {
        record.attempts++
        if(record.attempts>=5) delete next.codes[key]
        return {error:'验证码错误；连续错误 5 次后需重新获取'}
      }
      let user=next.users.find(u=>u.email===email)
      if(purpose==='register') {
        if(user) return {error:'验证码无效或邮箱已注册'}
        if(next.users.length>=(config.maxUsers||20)) return {error:'本次内测名额已满'}
        const ipHash=digest(ip)
        if(next.events.filter(e=>e.kind==='register' && e.ipHash===ipHash && e.at>time-86400000).length>=3) return {error:'今天注册的账号过多，请稍后再试'}
        user={id:crypto.randomUUID(),email,role:'member',storage:'private',quotaBytes:config.memberQuotaBytes||256*1048576,createdAt:new Date(time).toISOString()}
        const directory=path.join(dataDir,'users',user.id)
        await fs.mkdir(directory,{recursive:true,mode:0o700})
        await fs.mkdir(path.join(directory,'images'),{mode:0o700})
        await fs.mkdir(path.join(directory,'scans'),{mode:0o700})
        await fs.writeFile(path.join(directory,'manifest.json'),JSON.stringify({version:1,tickets:[],images:[]}),{flag:'wx',mode:0o600})
        next.users.push(user)
        next.events.push({kind:'register',at:time,ipHash})
      } else if(!user) return {error:'验证码无效或已过期，请重新获取'}
      user.salt=crypto.randomBytes(24).toString('hex')
      user.passwordHash=await passwordHash(password,user.salt)
      user.emailVerified=true
      user.authVersion=(user.authVersion||0)+1
      delete next.codes[key]
      return {user:structuredClone(user)}
    })
    if(result.error) throw failure(400,result.error)
    return result.user
  }
  const login=async(identifier,password)=>{
    if(typeof identifier!=='string' || identifier.length>254 || typeof password!=='string' || password.length>200) return null
    const name=identifier.trim().toLowerCase()
    const user=store.read().users.find(u=>u.email===name || (u.role==='owner' && u.legacyUsername===name))
    // Also perform scrypt for unknown accounts, without disclosing existence.
    const hash=await passwordHash(password,user?.salt||state.codeSecret)
    return user && secureEqual(hash,user.passwordHash)?user:null
  }
  return {sendCode,register:(input,ip)=>finishCode(input,'register',ip),reset:(input,ip)=>finishCode(input,'reset',ip),login,getUser,publicUser,inviteValid}
}
