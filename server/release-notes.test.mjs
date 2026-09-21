import test from 'node:test'
import assert from 'node:assert/strict'
import {validateReleases,validateNewRelease,checkRelease} from '../scripts/check-release.mjs'

const entry=(version='0.2.0',date='2026-09-21')=>({version,date,title:'更新说明',changes:['新增更新记录入口。']})
test('release metadata agrees with package and lockfile versions',async()=>{await checkRelease()})
test('release history rejects missing notes, mismatched versions and nonchronological entries',()=>{
  assert.throws(()=>validateReleases([],'0.2.0'))
  assert.throws(()=>validateReleases([entry()],'0.3.0'))
  assert.throws(()=>validateReleases([entry(),entry()],'0.2.0'))
  assert.throws(()=>validateReleases([entry(),entry('0.3.0')],'0.2.0'))
  assert.throws(()=>validateReleases([entry(),entry('0.1.0','2026-09-22')],'0.2.0'))
  assert.throws(()=>validateReleases([entry('0.2.0','2026-02-30')],'0.2.0'))
  assert.throws(()=>validateReleases([{...entry(),changes:[]}],'0.2.0'))
  assert.throws(()=>validateReleases([{...entry(),changes:[' '.repeat(10)]}],'0.2.0'))
  assert.throws(()=>validateReleases([{...entry(),changes:['很'.repeat(101)]}],'0.2.0'))
  assert.doesNotThrow(()=>validateReleases([entry(),entry('0.1.0')],'0.2.0'))
})
test('release gate requires a new version and preserves published notes',()=>{
  const previous=[entry('0.1.0')]
  assert.throws(()=>validateNewRelease(previous,'0.1.0',previous))
  assert.throws(()=>validateNewRelease([entry()],'0.1.0',previous))
  assert.throws(()=>validateNewRelease([entry(),{...previous[0],changes:['修改旧公告']}],'0.1.0',previous))
  assert.doesNotThrow(()=>validateNewRelease([entry(),...previous],'0.1.0',previous))
  assert.doesNotThrow(()=>validateNewRelease([entry()],'0.1.0'))
})
