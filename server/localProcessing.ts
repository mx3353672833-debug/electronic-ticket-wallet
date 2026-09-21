import type { Plugin } from 'vite'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { recognizeTicket } from '../src/utils/recognition.ts'
import type { ScanResult } from '../src/utils/recognition.ts'
import type { Ticket, Place } from '../src/types/ticket.ts'
// @ts-expect-error Node runtime module shared with the private server.
import {createRoutePlanner} from './train-routes.mjs'

const run = promisify(execFile)
const root = path.resolve('.local-data')
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
type Station = { lat: number; lng: number }
let compiling: Promise<unknown> | undefined
let processing: Promise<unknown> = Promise.resolve()
const planRoute=createRoutePlanner({cacheDir:root})

async function scanFile(data: Buffer) {
  const sha = crypto.createHash('sha256').update(data).digest('hex')
  const dir = path.join(root, 'scans', sha)
  const cached = await fs.readFile(path.join(dir, 'scan.json'), 'utf8').catch(() => '')
  if (cached && JSON.parse(cached).version === 2) return sha
  const binary = path.join(root, 'bin/scan-ticket')
  await fs.mkdir(path.dirname(binary), { recursive: true })
  try { await fs.access(binary) } catch {
    compiling ??= run('/usr/bin/swiftc', [path.resolve('scripts/scan-ticket.swift'), '-o', binary], { timeout: 120000 })
    await compiling
  }
  const incoming = await fs.mkdtemp(path.join(root, 'incoming-'))
  const file = path.join(incoming, 'source')
  try {
    await fs.writeFile(file, data, { mode: 0o600 })
    await run(binary, [file, dir], { timeout: 90000 })
  } finally { await fs.unlink(file).catch(() => {}); await fs.rmdir(incoming).catch(() => {}) }
  return sha
}

async function result(sha: string) {
  const scan: ScanResult = JSON.parse(await fs.readFile(path.join(root, 'scans', sha, 'scan.json'), 'utf8'))
  const stations: Record<string, Station[]> = JSON.parse(await fs.readFile(path.join(root, 'stations.json'), 'utf8').catch(() => '{}'))
  const fields = recognizeTicket(scan, Object.keys(stations).length ? new Set(Object.keys(stations)) : undefined)
  const place = (name: string | null): Place | null => {
    if (!name) return null
    const matches = stations[name] || []
    const first = matches[0]
    const ambiguous = first && matches.some(p => Math.abs(p.lat-first.lat)+Math.abs(p.lng-first.lng)>.15)
    return { name, ...(!ambiguous && first ? { lat: first.lat, lng: first.lng } : {}) }
  }
  const routes: Record<string, Ticket['railRoute'] | null> = JSON.parse(await fs.readFile(path.join(root, 'routes.json'), 'utf8').catch(() => '{}'))
  const key = `${fields.departure}|${fields.arrival}|${/^[GDC]/.test(fields.trainNo || '') ? 'high-speed' : 'conventional'}`
  const railRoute = fields.documentKind === 'ticket' ? routes[key] || undefined : undefined
  // Raw OCR includes personal identifiers. Only return the requested travel fields.
  return { sha256: sha, version: scan.version, cropped: scan.cropped, corners: scan.corners, rotation: scan.rotation || 0, width: scan.width, height: scan.height, fields, departure: place(fields.departure), arrival: place(fields.arrival), railRoute }
}

export function localProcessing(): Plugin {
  return { name: 'private-local-ticket-scanner', configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1')
      if (!url.pathname.startsWith('/__local/')) return next()
      const peer = req.socket.remoteAddress || ''
      const host = req.headers.host || ''
      const origin = req.headers.origin
      if (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer) || !/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host) || req.headers['x-ticket-wallet'] !== '1' || (origin && origin !== `http://${host}`)) {
        res.writeHead(403, headers); res.end('Local access only'); return
      }
      Object.entries(headers).forEach(([k,v])=>res.setHeader(k,v))
      try {
        if(url.pathname==='/__local/train-route' && req.method==='POST') {
          const chunks:Buffer[]=[];let size=0
          for await(const chunk of req){size+=chunk.length;if(size>16384)throw new Error('Route request too large');chunks.push(Buffer.from(chunk))}
          const railRoute=await planRoute(JSON.parse(Buffer.concat(chunks).toString()))
          res.setHeader('Content-Type','application/json');res.end(JSON.stringify(railRoute?{status:'updated',railRoute}:{status:'not-found'}));return
        }
        if (url.pathname === '/__local/export/start' && req.method === 'POST') {
          const exportId = crypto.randomUUID()
          await fs.mkdir(path.join(root, 'exports', exportId, 'images'), { recursive: true, mode: 0o700 })
          res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ exportId })); return
        }
        const exportMatch = url.pathname.match(/^\/__local\/export\/([a-f0-9-]{36})\/(?:images\/([a-zA-Z0-9-]+)|(finish))$/)
        if (exportMatch && ((exportMatch[2] && req.method === 'PUT') || (exportMatch[3] && req.method === 'POST'))) {
          const dir = path.join(root, 'exports', exportMatch[1])
          await fs.access(path.join(dir, 'images'))
          const buffers: Buffer[] = []; let size = 0
          for await (const chunk of req) { size += chunk.length; if (size > 40 * 1048576) throw new Error('备份条目过大'); buffers.push(Buffer.from(chunk)) }
          const data = Buffer.concat(buffers)
          if (exportMatch[2]) await fs.writeFile(path.join(dir, 'images', exportMatch[2]), data, { mode: 0o600, flag: 'wx' })
          else {
            const manifest = JSON.parse(data.toString())
            for (const image of manifest.images) {
              if (!/^[a-zA-Z0-9-]+$/.test(image.id) || (await fs.stat(path.join(dir, 'images', image.id))).size !== image.size) throw new Error('图片校验失败')
            }
            await fs.writeFile(path.join(dir, 'manifest.json'), data, { mode: 0o600, flag: 'wx' })
            await fs.writeFile(path.join(root, 'exports', 'latest.json'), JSON.stringify({ exportId: exportMatch[1], tickets: manifest.tickets.length, images: manifest.images.length }), { mode: 0o600 })
          }
          res.end('OK'); return
        }
        if (url.pathname === '/__local/process' && req.method === 'POST') {
          const buffers: Buffer[] = []; let size = 0
          for await (const chunk of req) {
            size += chunk.length
            if (size > 40*1048576) { res.writeHead(413); res.end('Image exceeds 40 MB'); return }
            buffers.push(Buffer.from(chunk))
          }
          if (!size) throw new Error('没有收到图片')
          const task = processing.then(()=>scanFile(Buffer.concat(buffers)))
          processing = task.catch(()=>{})
          const sha = await task
          res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(await result(sha))); return
        }
        const match = url.pathname.match(/^\/__local\/scans\/([a-f0-9]{64})\/(result|processed|thumbnail)$/)
        if (match && req.method === 'GET') {
          const [,sha,kind] = match
          if (kind === 'result') { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(await result(sha))) }
          else { res.setHeader('Content-Type','image/jpeg'); res.end(await fs.readFile(path.join(root,'scans',sha,`${kind}.jpg`))) }
          return
        }
        res.writeHead(404); res.end('Not found')
      } catch (error) {
        const missing = (error as NodeJS.ErrnoException).code === 'ENOENT'
        res.writeHead(missing ? 404 : 500, { 'Content-Type':'application/json' })
        res.end(JSON.stringify({ error: missing ? '尚未扫描这张照片' : '本机扫描失败，原图未改变，请重试' }))
      }
    })
  } }
}
