import {afterEach,expect,it,vi} from 'vitest'
import {cachedDisplayImage,clearDisplayImages,displayImageUrl,loadDisplayImage} from '../utils/displayImages'
import {originTransform,ticketOrigin} from '../utils/ticketMotion'

afterEach(()=>{clearDisplayImages();vi.unstubAllGlobals();vi.restoreAllMocks()})
it('uses display variants only for authenticated media, not originals or persisted references',()=>{
  expect(displayImageUrl('/tickets/media/paper-v1-abc','screen')).toBe('/tickets/media/paper-v1-abc?view=screen')
  expect(displayImageUrl('/tickets/media/paper-v1-abc?view=thumb','thumb')).toBe('/tickets/media/paper-v1-abc?view=thumb')
  for(const source of ['idb://images/abc','blob:abc','https://example.com/image'])expect(displayImageUrl(source,'thumb')).toBe(source)
})
it('deduplicates pending loads, keeps a memory-only copy, and revokes it at sign out',async()=>{
  const fetcher=vi.fn(async()=>({ok:true,blob:async()=>new Blob(['private'])}))
  vi.stubGlobal('fetch',fetcher);vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:private');const revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{})
  const url='/tickets/media/abc?view=screen'
  const results=await Promise.all([loadDisplayImage(url),loadDisplayImage(url)])
  expect(results).toEqual(['blob:private','blob:private']);expect(fetcher).toHaveBeenCalledTimes(1)
  expect(fetcher).toHaveBeenCalledWith(url,{credentials:'same-origin',cache:'no-store'})
  expect(cachedDisplayImage(url)).toBe('blob:private')
  clearDisplayImages();expect(cachedDisplayImage(url)).toBeUndefined();expect(revoke).toHaveBeenCalledWith('blob:private')
})
it('failed authentication is not cached and can be retried',async()=>{
  const fetcher=vi.fn(async()=>({ok:false}));vi.stubGlobal('fetch',fetcher)
  await expect(loadDisplayImage('/tickets/media/missing?view=screen')).rejects.toThrow()
  await expect(loadDisplayImage('/tickets/media/missing?view=screen')).rejects.toThrow()
  expect(fetcher).toHaveBeenCalledTimes(2)
})
it('leaves full archival photos outside the lightweight memory cache',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher)
  expect(await loadDisplayImage('/tickets/media/original')).toBe('/tickets/media/original')
  expect(fetcher).not.toHaveBeenCalled()
})
it('maps the actual contained thumbnail to the viewer without moving the stored geometry',()=>{
  const img=document.createElement('img')
  Object.defineProperties(img,{naturalWidth:{value:1600},naturalHeight:{value:1000}})
  vi.spyOn(img,'getBoundingClientRect').mockReturnValue({left:20,top:30,width:120,height:60,bottom:90} as DOMRect)
  const origin=ticketOrigin(img)
  expect(origin).toEqual({left:32,top:30,width:96,height:60})
  expect(originTransform(origin,{left:100,top:100,width:800,height:500})).toEqual({x:-420,y:-290,scaleX:.12,scaleY:.12})
  expect(ticketOrigin(null)).toBeNull()
})
