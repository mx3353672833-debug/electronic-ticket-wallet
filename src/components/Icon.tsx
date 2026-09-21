import type { CSSProperties } from 'react'

const paths = {
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  back: <path d="M20 12H4m6-6-6 6 6 6"/>,
  chevronUp: <path d="m6 15 6-6 6 6"/>,
  chevronDown: <path d="m6 9 6 6 6-6"/>,
  globe: <><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  pause: <path d="M8 5v14M16 5v14"/>,
  play: <path d="m8 5 11 7-11 7Z"/>,
  shuffle: <path d="m3 5 4 0 10 14h4M3 19h4L17 5h4m-4-3 4 3-4 3m0 8 4 3-4 3"/>,
  ticket: <><path d="M3 4h18v5a3 3 0 0 0 0 6v5H3v-5a3 3 0 0 0 0-6Z"/><path d="M15 4v3m0 3v4m0 3v3"/></>,
  note: <><path d="M5 3h14v18H5Z M9 8h6M9 12h6M9 16h3"/></>,
  history: <><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/><path d="M12 7v5l3 2"/></>,
  feedback: <><path d="M4 4h16v12H9l-5 4Z"/><path d="M8 8h8M8 12h5"/></>,
  account: <><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
  upload: <path d="M4 16v5h16v-5M12 16V3m-5 5 5-5 5 5"/>,
  check: <path d="m4 12 5 5L20 6"/>,
  map: <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Zm6-3v15m6-12v15"/>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/></>,
  train: <><rect x="6" y="3" width="12" height="15" rx="3"/><path d="M6 10h12M9 18l-3 3m9-3 3 3M9 14h.01M15 14h.01"/></>,
  plane: <path d="m3 11 7 2-3 7 3-1 4-5 5 1 2-2-7-4 1-5-2-2-3 6-5-1Z"/>,
  zoomIn: <><circle cx="10" cy="10" r="7"/><path d="m16 16 5 5M6 10h8m-4-4v8"/></>,
  zoomOut: <><circle cx="10" cy="10" r="7"/><path d="m16 16 5 5M6 10h8"/></>,
} as const

export function Icon({ name, size = 18, style }: { name: keyof typeof paths; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>{paths[name]}</svg>
}
