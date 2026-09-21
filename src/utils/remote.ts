export const REMOTE = import.meta.env.VITE_WALLET_REMOTE === '1'
export const SERVER_BASE = '/tickets'
export async function remoteRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${SERVER_BASE}/api${path}`, { ...options, headers: { 'X-Ticket-Wallet': '1', ...options.headers } })
  if (!response.ok) {
    if (response.status === 401) throw new Error('登录已过期，请刷新页面重新登录')
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || '服务器暂时不可用，请重试')
  }
  return response.json()
}
