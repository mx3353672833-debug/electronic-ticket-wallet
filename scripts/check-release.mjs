import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {fileURLToPath,pathToFileURL} from 'node:url'

const root=fileURLToPath(new URL('../',import.meta.url))
const compare=(a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);return x[0]-y[0] || x[1]-y[1] || x[2]-y[2]}
export function validateReleases(releases,version) {
  assert(Array.isArray(releases) && releases.length>0,'更新记录不能为空')
  assert.equal(releases[0].version,version,'最新公告版本必须与 package.json 一致')
  for(const [index,release] of releases.entries()) {
    assert(typeof release.version==='string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(release.version),'版本号需为 x.y.z')
    assert(typeof release.date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(release.date) && new Date(release.date+'T00:00:00Z').toISOString().slice(0,10)===release.date,'发布日期需为有效 YYYY-MM-DD')
    assert(typeof release.title==='string' && release.title.trim().length>0 && release.title.length<=40,'标题需为 1–40 字')
    assert(Array.isArray(release.changes) && release.changes.length>=1 && release.changes.length<=6,'每版写 1–6 条简短变化')
    assert(release.changes.every(item=>typeof item==='string' && item.trim().length>0 && item.length<=100),'每条变化需为 1–100 字')
    if(index>0){assert(compare(releases[index-1].version,release.version)>0,'版本必须唯一且由新到旧');assert(releases[index-1].date>=release.date,'日期必须由新到旧')}
  }
}

export function validateNewRelease(releases,previousVersion,previousHistory=[]) {
  assert(compare(releases[0].version,previousVersion)>0,'发布新改动前必须升级版本并添加公告')
  if(previousHistory.length)assert.deepEqual(releases.slice(-previousHistory.length),previousHistory,'发布时应在顶部追加公告，不能删除或改写旧记录')
}

export async function checkRelease(base) {
  const read=async file=>JSON.parse(await fs.readFile(new URL('../'+file,import.meta.url),'utf8'))
  const [pkg,lock,releases]=await Promise.all([read('package.json'),read('package-lock.json'),read('src/data/releases.json')])
  validateReleases(releases,pkg.version)
  assert.equal(lock.version,pkg.version,'package-lock.json 版本未同步')
  assert.equal(lock.packages[''].version,pkg.version,'package-lock.json 根包版本未同步')
  if(base) {
    const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'})
    const ref=git(['rev-parse','--verify','--end-of-options',base+'^{commit}']).trim()
    const previous=JSON.parse(git(['show',ref+':package.json']))
    const hasHistory=git(['ls-tree','--name-only',ref,'--','src/data/releases.json']).trim()
    validateNewRelease(releases,previous.version,hasHistory?JSON.parse(git(['show',ref+':src/data/releases.json'])):[])
  }
  console.log(`更新记录校验通过：v${pkg.version}，${releases.length} 个版本${base?'，已对比上次发布':''}`)
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const args=process.argv.slice(2)
  if(args.length && (args.length!==2 || args[0]!=='--since')) {console.error('用法：npm run check:release -- [--since 上次发布提交]');process.exitCode=1}
  else await checkRelease(args[1]).catch(error=>{console.error('更新记录校验失败：'+error.message);process.exitCode=1})
}
