import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { recognizeTicket } from '../src/utils/recognition.ts'
const run = promisify(execFile)
const source = process.argv[2]
if (!source) throw new Error('Usage: node scripts/process-folder.mjs /absolute/photo/folder')
const root = path.resolve('.local-data/scans')
await fs.mkdir(root, { recursive: true })
const names = (await fs.readdir(source)).filter(n => !n.startsWith('.') && /\.(jpe?g|png)$/i.test(n)).sort()
const results = []
const stations = new Set(Object.keys(JSON.parse(await fs.readFile('.local-data/stations.json', 'utf8'))))
let next = 0
async function worker() {
  while (next < names.length) {
    const name = names[next++]
    const input = path.join(source, name)
    const sha256 = crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex')
    const out = path.join(root, sha256)
    try {
      try { if (JSON.parse(await fs.readFile(path.join(out, 'scan.json'), 'utf8')).version !== 2) throw new Error('old version') }
      catch { await run(path.resolve('.local-data/bin/scan-ticket'), [input, out], { timeout: 90000 }) }
      const scan = JSON.parse(await fs.readFile(path.join(out, 'scan.json'), 'utf8'))
      const fields = recognizeTicket(scan, stations)
      results.push({ name, sha256, fields, cropped: scan.cropped, width: scan.width, height: scan.height })
      console.log(`${results.length}/${names.length} ${name} crop=${scan.cropped} fields=${5-fields.issues.length}/5`)
    } catch (error) { results.push({ name, sha256, error: error.message }); console.log(`${name} FAILED`) }
  }
}
await Promise.all([worker(), worker()])
results.sort((a,b)=>a.name.localeCompare(b.name))
await fs.writeFile('.local-data/processing-manifest.json', JSON.stringify(results, null, 2))
console.log(JSON.stringify({ total: results.length, cropped: results.filter(r=>r.cropped).length, allCoreFields: results.filter(r=>r.fields && !r.fields.issues.length).length, failed: results.filter(r=>r.error).length }))
