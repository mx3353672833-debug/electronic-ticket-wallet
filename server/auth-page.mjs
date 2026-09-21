export function authPage(mode='login',{error=''}={}) {
  const register=mode==='register',login=mode==='login'
  const title=register?'创建票夹':mode==='reset'?'重置密码':'打开票夹'
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · 票夹</title><link rel="stylesheet" href="/tickets/auth.css"><script src="/tickets/auth.js" defer></script></head><body><main class="auth-sheet">
  <header><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M3 4h18v5a3 3 0 0 0 0 6v5H3v-5a3 3 0 0 0 0-6Z"/><path d="M15 4v3m0 3v4m0 3v3"/></svg><span>票夹</span></header>
  <h1>${title}</h1><p class="intro">${register?'仅接受站长邀请。一个链接只能注册一个账号。':mode==='reset'?'用邮箱验证码设置新密码，已有票据不会改变。':'登录后，继续整理你的旅途。'}</p>
  ${register?'<p id="invitation-status" class="intro" role="status">正在检查邀请链接…</p><noscript>请启用 JavaScript 以验证邀请链接。</noscript>':''}
  <form data-mode="${mode}" method="post" action="/tickets/login" ${register?'hidden':''}>
  ${register?'<input type="hidden" name="inviteCode">':''}
  <label>${login?'邮箱 / 原账号':'邮箱'}<input name="email" type="${login?'text':'email'}" autocomplete="username" maxlength="254" required placeholder="you@example.com" spellcheck="false" autocapitalize="none"></label>
  ${!login?'<label>邮箱验证码<span class="code-row"><input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required placeholder="6 位验证码"><button type="button" id="send-code">发送验证码</button></span></label>':''}
  <label>${mode==='reset'?'新密码':'密码'}<input name="password" type="password" autocomplete="${login?'current-password':'new-password'}" ${login?'':'minlength="12"'} maxlength="200" required placeholder="${login?'输入密码':'至少 12 个字符'}"></label>
  ${!login?'<label>确认密码<input name="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="200" required placeholder="再次输入密码"></label>':''}
  <p id="auth-message" class="message${error?' is-error':''}" role="status" aria-live="polite">${escape(error)}</p><button class="submit" type="submit">${register?'注册并打开票夹':mode==='reset'?'保存新密码并登录':'登录'}</button></form>
  <nav>${login?'<span>注册需邀请链接</span><a href="/tickets/reset">忘记密码</a>':'<a href="/tickets/login">已有账号，返回登录</a>'}</nav>
  <footer>票据默认仅自己可见。请保留原始照片。<br>网站由站长维护，管理员在运维时可能接触服务器数据。</footer></main></body></html>`
}
