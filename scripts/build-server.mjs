import fs from 'node:fs/promises'
import ts from 'typescript'

// The production host runs Node 20; emit the shared pure parser without TS runtime hooks.
const source = await fs.readFile('src/utils/recognition.ts','utf8')
const result = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}})
await fs.mkdir('.local-data/deploy/server',{recursive:true})
await fs.mkdir('.local-data/deploy/scripts',{recursive:true})
await fs.writeFile('.local-data/deploy/server/recognition.mjs',result.outputText)
for (const name of ['production.mjs','accounts.mjs','auth-page.mjs','auth.js','auth.css','collection.mjs','private-store.mjs','mail.mjs','feedback.mjs','train-routes.mjs','appearance.mjs']) {
  await fs.copyFile('server/'+name,'.local-data/deploy/server/'+name)
}
for (const name of ['scan-ticket-linux.py','init-wallet.mjs','upgrade-accounts.mjs','rail-itinerary.py','rail_graph.py','ticket-appearance.py']) {
  await fs.copyFile('scripts/'+name,'.local-data/deploy/scripts/'+name)
}
// Nodemailer is pure JS; keep its package and notices with the runtime bundle.
await fs.mkdir('.local-data/deploy/node_modules',{recursive:true})
await fs.cp('node_modules/nodemailer','.local-data/deploy/node_modules/nodemailer',{recursive:true})
await fs.cp('node_modules/gcoord','.local-data/deploy/node_modules/gcoord',{recursive:true})
