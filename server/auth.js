const form=document.querySelector('form[data-mode]')
const mode=form.dataset.mode
const message=document.querySelector('#auth-message')
const submit=form.querySelector('[type=submit]')
const send=document.querySelector('#send-code')
const invite=form.elements.namedItem('inviteCode')
// The fragment stays in the browser; invitation secrets do not enter proxy URL logs.
if(invite) invite.value=new URLSearchParams(location.hash.slice(1)).get('invite')||''
const notify=(text,error=false)=>{message.textContent=text;message.classList.toggle('is-error',error)}
async function request(route,data) {
  const response=await fetch(`/tickets/auth/${route}`,{method:'POST',headers:{'Content-Type':'application/json','X-Ticket-Wallet':'1'},body:JSON.stringify(data)})
  const result=await response.json().catch(()=>({error:'服务器暂时不可用，请稍后重试'}))
  if(!response.ok) throw new Error(result.error||'操作失败，请重试')
  return result
}
if(mode==='register') {
  const status=document.querySelector('#invitation-status')
  if(!invite.value)status.textContent='请使用站长发给你的一次性邀请链接打开此页面。'
  else void request('invitation',{inviteCode:invite.value}).then(()=>{
    status.textContent='邀请有效，注册成功后此链接将失效。'
    form.hidden=false
  }).catch(error=>{status.textContent=error.message})
}
send?.addEventListener('click',async()=>{
  const email=form.elements.namedItem('email')
  if(!email.reportValidity() || (invite && !invite.reportValidity())) return
  send.disabled=true;notify('正在发送验证码…')
  try {
    const result=await request('send-code',{email:email.value,purpose:mode==='register'?'register':'reset',inviteCode:invite?.value})
    notify(result.message)
    let remaining=60;send.textContent=`${remaining} 秒后重发`
    const timer=setInterval(()=>{remaining--;send.textContent=remaining?`${remaining} 秒后重发`:'发送验证码';if(!remaining){clearInterval(timer);send.disabled=false}},1000)
    form.elements.namedItem('code').focus()
  } catch(error) {notify(error.message,true);send.disabled=false}
})
form.addEventListener('submit',async event=>{
  event.preventDefault()
  const fields=Object.fromEntries(new FormData(form))
  if(mode!=='login' && fields.password!==fields.confirmation){notify('两次输入的密码不一致',true);return}
  submit.disabled=true;notify('正在处理…')
  try {await request(mode,fields);location.assign('/tickets/')}
  catch(error){notify(error.message,true);submit.disabled=false}
})
