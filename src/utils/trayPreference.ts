export const TRAY_PREFERENCE_KEY = 'ticket-wallet:tray-collapsed'

export function readTrayCollapsed(): boolean {
  try { return localStorage.getItem(TRAY_PREFERENCE_KEY) !== 'false' }
  catch { return true }
}

export function saveTrayCollapsed(collapsed: boolean): void {
  try { localStorage.setItem(TRAY_PREFERENCE_KEY, String(collapsed)) }
  catch { /* The tray still works when browser storage is unavailable. */ }
}
