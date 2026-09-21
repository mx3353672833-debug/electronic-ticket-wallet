import path from 'node:path'
import crypto from 'node:crypto'
import {failure,privateStore} from './private-store.mjs'

export async function createFeedback({dataDir,config,sendMail,now=()=>Date.now()}) {
  const store=await privateStore(path.join(dataDir,'feedback.json'),{version:1,items:[]})
  let delivering=false
  const deliver=async()=>{
    if(delivering || !sendMail || !config.feedbackTo) return
    delivering=true
    try {
      const items=store.read().items.filter(i=>i.notification!=='sent' && (i.nextAttempt||0)<=now()).slice(0,10)
      for(const item of items) {
        let sent=false
        try {
          await sendMail({to:config.feedbackTo,replyTo:item.email,subject:`票夹 · 新${item.category==='bug'?'问题反馈':'建议'}`,text:`来自：${item.email}\n时间：${item.createdAt}\n\n${item.message}\n\n可在票夹“收到的建议”中查看和处理。编号：${item.id}`})
          sent=true
        } catch { /* The saved suggestion remains available even if SMTP fails. */ }
        await store.update(next=>{
          const current=next.items.find(i=>i.id===item.id)
          if(!current) return
          current.notification=sent?'sent':'pending'
          current.mailAttempts=(current.mailAttempts||0)+1
          current.nextAttempt=sent?null:now()+Math.min(86400000,60000*2**Math.min(current.mailAttempts,10))
        })
      }
    } finally { delivering=false }
  }
  return {
    deliver,
    async submit(user,input) {
      if(!['suggestion','bug'].includes(input.category) || typeof input.message!=='string' || input.message.trim().length<5 || input.message.length>4000) throw failure(400,'请选择类型，并填写 5–4000 字的内容')
      const item=await store.update(next=>{
        if(next.items.length>=2000) throw failure(503,'反馈收件箱暂时已满，请稍后再试')
        const recent=next.items.filter(i=>i.userId===user.id && Date.parse(i.createdAt)>now()-86400000)
        if(recent.length>=5 || recent.some(i=>Date.parse(i.createdAt)>now()-60000)) throw failure(429,'已收到你的反馈，请稍后再提交')
        const item={id:crypto.randomUUID(),userId:user.id,email:user.email,category:input.category,message:input.message.trim(),createdAt:new Date(now()).toISOString(),status:'new',notification:'pending'}
        next.items.push(item)
        return item
      })
      void deliver().catch(()=>{})
      return {ok:true,id:item.id,message:'已保存，站长可在反馈收件箱中查看。'}
    },
    list(user) {
      if(user.role!=='owner') throw failure(403,'仅站长可查看反馈收件箱')
      return store.read().items.slice().reverse().map(({nextAttempt:_nextAttempt,mailAttempts:_mailAttempts,...item})=>item)
    },
    async update(user,id,status) {
      if(user.role!=='owner') throw failure(403,'仅站长可处理反馈')
      if(!['new','read','resolved'].includes(status)) throw failure(400,'无效状态')
      return store.update(next=>{const item=next.items.find(i=>i.id===id); if(!item) throw failure(404,'反馈不存在'); item.status=status; return {ok:true}})
    },
  }
}
