export const MAP_PHOTOS_KEY = 'ticket-wallet:map-photos'
export function readMapPhotos(): boolean {
  try { return localStorage.getItem(MAP_PHOTOS_KEY) !== 'false' } catch { return true }
}
export function saveMapPhotos(visible: boolean): void {
  try { localStorage.setItem(MAP_PHOTOS_KEY, String(visible)) } catch { /* Session state still works. */ }
}
