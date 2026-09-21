import { describe, expect, it } from 'vitest'
import { recognizeTicket, type OCRLine, type ScanResult } from '../utils/recognition'

const line=(text:string,x:number,y=.15,height=.055):OCRLine=>({text,x,y,height,width:.13,confidence:.8})
const scan=(lines:OCRLine[],extra:Partial<ScanResult>={}):ScanResult=>({version:2,cropped:true,confidence:.9,corners:[],width:1800,height:1100,lines,...extra})
const stations=new Set(['北京南','天津','青岛北','上海'])
describe('local ticket OCR fields',()=>{
  it('joins split station text by row and never reads the year/month as a seat',()=>{
    const r=recognizeTicket(scan([line('北',.10),line('京南站',.20),line('C2007',.44),line('天 津站',.62),line('2024年06月18日09:20开',.07,.3),line('08年012号',.6,.32),line('¥54.5元',.08,.4)]),stations)
    expect(r).toMatchObject({departure:'北京南',arrival:'天津',takenAt:'2024-06-18',departureTime:'09:20',trainNo:'C2007',seat:'08车012',amount:54.5,issues:[]})
  })
  it('uses a second local contrast pass while retaining missing-field issues',()=>{
    const r=recognizeTicket(scan([],{alternatives:[[line('青島北站',.1),line('天津站',.65)],[line('D6002',.44),line('2020年02月29日10:20开',.1,.32)]]}),stations)
    expect(r).toMatchObject({departure:'青岛北',arrival:'天津',trainNo:'D6002',takenAt:'2020-02-29'})
  })
  it('does not accept arbitrary personal text as station names',()=>{
    const r=recognizeTicket(scan([line('测试姓名',.1),line('天津站',.65)]),stations)
    expect(r.departure).toBeNull()
    expect(r.issues).toContain('出发站未识别')
  })
  it('does not turn a promotional year into a boarding-pass journey date',()=>{
    const r=recognizeTicket(scan([line('BOARDING PASS',.1),line('SC1174',.1,.3),line('10OCT',.7,.3),line('2025年优惠',.1,.8)]))
    expect(r).toMatchObject({documentKind:'boarding',trainNo:'SC1174',takenAt:null,departure:null,arrival:null})
  })
  it('identifies a boarding pass even if the other OCR pass resembles a train ticket',()=>{
    const r=recognizeTicket(scan([],{alternatives:[[line('1330',.4)],[line('登机牌',.1)]]}))
    expect(r.documentKind).toBe('boarding')
  })
  it('recognizes refund receipts and rejects impossible dates',()=>{
    const r=recognizeTicket(scan([line('退票费',.1,.7),line('2023年02月30日',.1,.3)]))
    expect(r.documentKind).toBe('refund');expect(r.takenAt).toBeNull();expect(r.seat).toBeNull()
  })
})
