import fs from 'node:fs/promises'
import path from 'node:path'
import {displayImage} from '../server/display-images.mjs'
const dataDir=path.resolve(process.argv[2])
const manifest=JSON.parse(await fs.readFile(path.join(dataDir,'manifest.json'),'utf8'))
const jobs=new Map()
for(const ticket of manifest.tickets)for(const [field,variant] of [['processedImageUrl','screen'],['thumbnailUrl','thumb']]){
  const id=ticket[field]?.replace(/^idb:\/\/images\//,'')
  const image=manifest.images.find(i=>i.id===id)
  if(image)jobs.set(id+':'+variant,{image,variant})
}
let count=0,before=0,after=0
for(const {image,variant} of jobs.values()){
  const file=await displayImage(dataDir,image,variant)
  before+=image.size;after+=(await fs.stat(file)).size;count++
  if(count%40===0)console.log(JSON.stringify({prepared:count,total:jobs.size}))
}
console.log(JSON.stringify({ready:true,images:count,archivalBytes:before,displayBytes:after,reductionPercent:Number((100*(1-after/before)).toFixed(1))}))
