import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { passwordHash } from '../server/production.mjs'

/** Create a NEW empty wallet only. An existing directory is never modified. */
export async function initWallet({ dataDir, origin, username = 'owner' }) {
  if (!dataDir || !path.isAbsolute(dataDir)) throw new Error('An explicit absolute data directory is required')
  const url = new URL(origin)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Origin must be an HTTPS origin, e.g. https://tickets.example.com (no path)')
  }
  if (typeof username !== 'string' || !username.trim() || username.length > 100) throw new Error('Invalid username')
  const password = crypto.randomBytes(24).toString('base64url')
  const salt = crypto.randomBytes(24).toString('hex')
  const auth = { origin:url.origin, username, salt, passwordHash:await passwordHash(password,salt) }
  // Exclusive mkdir is the no-overwrite guard. The parent directory must exist.
  await fs.mkdir(dataDir, { mode:0o700 })
  await fs.mkdir(path.join(dataDir,'images'), { mode:0o700 })
  await fs.mkdir(path.join(dataDir,'scans'), { mode:0o700 })
  const files = {
    'manifest.json': { version:1, tickets:[], images:[] },
    'stations.json': {},
    'routes.json': {},
    'auth.json': auth,
    'initial-login.json': { url:`${url.origin}/tickets/`, username, password },
  }
  for (const [name,value] of Object.entries(files)) {
    await fs.writeFile(path.join(dataDir,name), JSON.stringify(value,null,2), { flag:'wx', mode:0o600 })
  }
  return { dataDir, credentialsFile:path.join(dataDir,'initial-login.json') }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dataDir, origin, username] = process.argv.slice(2)
  try {
    const result = await initWallet({dataDir,origin,username})
    console.log(`Created an empty wallet. Private initial credentials: ${result.credentialsFile}`)
    console.log('Store the password in a password manager; never publish this data directory.')
  } catch (error) {
    console.error(error.code === 'EEXIST' ? 'Refusing to modify an existing data directory.' : error.message)
    process.exitCode = 1
  }
}
