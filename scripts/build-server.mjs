import fs from 'node:fs/promises'
import ts from 'typescript'

// The production host runs Node 20; emit the shared pure parser without TS runtime hooks.
const source = await fs.readFile('src/utils/recognition.ts','utf8')
const result = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}})
await fs.mkdir('.local-data/deploy/server',{recursive:true})
await fs.mkdir('.local-data/deploy/scripts',{recursive:true})
await fs.writeFile('.local-data/deploy/server/recognition.mjs',result.outputText)
await fs.copyFile('server/production.mjs','.local-data/deploy/server/production.mjs')
await fs.copyFile('scripts/scan-ticket-linux.py','.local-data/deploy/scripts/scan-ticket-linux.py')
