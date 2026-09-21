import {describe,it,expect} from 'vitest'
import L from 'leaflet'
import {createRouteGeometry,geometryLevel} from '../utils/mapGeometry'

describe('display-only route geometry',()=>{
  it('caches zoom bands, cuts redundant projection work and leaves stored coordinates untouched',()=>{
    const points: [number,number][] = Array.from({length:12000},(_,i)=>[110+i/12000,35+Math.sin(i/400)*.02])
    const source=JSON.stringify(points),geometry=createRouteGeometry([points])
    const wide=geometry(4),close=geometry(15),full=geometry(20)
    expect(wide).toBe(geometry(6))
    expect(geometryLevel(6.1)).toBe(9)
    expect(wide[0].length).toBeLessThan(points.length/20)
    expect(close[0].length).toBeGreaterThan(wide[0].length)
    expect(full[0]).toHaveLength(points.length)
    expect(JSON.stringify(points)).toBe(source)
    expect(wide[0][0]).toEqual([points[0][1],points[0][0]])
    expect(wide[0].at(-1)).toEqual([points.at(-1)![1],points.at(-1)![0]])
  })
  it('never joins separated track segments and retains a real bend at its visible scale',()=>{
    const segments: [number,number][][]=[[[110,35],[110.5,36],[111,35]],[[112,34],[113,35]]]
    const displayed=createRouteGeometry(segments)(6)
    expect(displayed).toEqual([[[35,110],[36,110.5],[35,111]],[[34,112],[35,113]]])
  })
  it('keeps simplification error below one screen pixel at the top of the zoom band',()=>{
    const points: [number,number][]=Array.from({length:2000},(_,i)=>[110+i/2000,35+Math.sin(i/32)*.07])
    const geometry=createRouteGeometry([points])
    for(const zoom of [6,9,12]) {
      const displayed=geometry(zoom)[0].map(p=>L.CRS.EPSG3857.latLngToPoint(L.latLng(p[0],p[1]),zoom))
      for(const coordinate of points) {
        const p=L.CRS.EPSG3857.latLngToPoint(L.latLng(coordinate[1],coordinate[0]),zoom)
        const distance=Math.min(...displayed.slice(1).map((end,i)=>L.LineUtil.pointToSegmentDistance(p,displayed[i],end)))
        expect(distance).toBeLessThanOrEqual(1.001)
      }
    }
  })
})
