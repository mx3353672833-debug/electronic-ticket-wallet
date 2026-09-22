import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {missingJourneyFields} from '../utils/ticketCompleteness'
import {StorySidebar} from '../components/StorySidebar'
import {TicketOverlay} from '../components/TicketOverlay'
import {useTicketStore} from '../store/useTicketStore'
import type {Ticket} from '../types/ticket'

const complete:Ticket={id:'user-complete',type:'train',takenAt:'2025-09-21',departure:{name:'北京南',lat:39.8,lng:116.3},arrival:{name:'天津',lat:39.1,lng:117.1},carrierOrTrainNo:'C2007',originalImageUrl:'idb://images/original',processedImageUrl:'idb://images/face',thumbnailUrl:'idb://images/thumb',story:'原有故事',tags:['收藏'],companions:[],createdAt:'',updatedAt:'',processing:{version:3,cropped:false,processedAt:'',reviewed:false,issues:['日期未识别','车次首字符可能误读，请对照票面'],documentKind:'ticket',departureTime:null,amount:null}}
const originalUpdate=useTicketStore.getState().updateDetails
const dirty=vi.fn()
const update=vi.fn(async(id:string,patch:Partial<Ticket>)=>{useTicketStore.setState(s=>({tickets:s.tickets.map(t=>t.id===id?{...t,...patch}:t)}))})
function Sidebar(){const ticket=useTicketStore(s=>s.tickets[0]);return <StorySidebar ticket={ticket} onDirty={dirty} onClose={()=>{}}/>}
beforeEach(()=>{
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}}))
  HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')}
  HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}
  update.mockClear();dirty.mockClear()
  useTicketStore.setState({tickets:[structuredClone(complete)],updateDetails:update,selectedTicketId:complete.id,storySidebarOpen:false,ticketOrigin:null,searchQuery:'',yearRange:null})
})
afterEach(()=>{cleanup();vi.unstubAllGlobals();useTicketStore.setState({updateDetails:originalUpdate})})

it('does not require manual review, OCR rechecks, optional fields, or a map route for complete tickets',()=>{
  expect(missingJourneyFields(complete)).toEqual([])
  render(<TicketOverlay/> )
  expect(screen.queryByText(/核对|待补充|尚未扫描/)).not.toBeInTheDocument()
})
it('keeps missing current fields incomplete even if a legacy reviewed flag is true',()=>{
  expect(missingJourneyFields({...complete,takenAt:null,arrival:{name:'  '},carrierOrTrainNo:' ',processing:{...complete.processing!,reviewed:true}})).toEqual([{key:'takenAt',label:'日期'},{key:'arrival',label:'到达地'},{key:'carrierOrTrainNo',label:'车次'}])
})
it('requires a flight number for boarding passes but not a train number for local tickets',()=>{
  expect(missingJourneyFields({...complete,type:'boarding-pass',carrierOrTrainNo:''})).toEqual([{key:'carrierOrTrainNo',label:'航班号'}])
  expect(missingJourneyFields({...complete,type:'metro',carrierOrTrainNo:'',departure:{name:'',city:'北京'}})).toEqual([])
})
it('does not show stale warnings or empty optional values in the sidebar',()=>{
  render(<Sidebar/> )
  expect(screen.queryByText(/核对|未识别|待补充/)).not.toBeInTheDocument()
  expect(screen.getByText('票面信息').closest('details')).not.toHaveAttribute('open')
})
it('opens a missing-only form from the ticket and removes its prompt after saving',async()=>{
  useTicketStore.setState({tickets:[{...complete,takenAt:null}]})
  render(<TicketOverlay/> )
  fireEvent.click(screen.getByRole('button',{name:'待补充 · 日期'}))
  expect(screen.getByRole('form',{name:'补充信息'})).toBeInTheDocument()
  expect(screen.queryByLabelText('出发地')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('日期'),{target:{value:'2025-09-21'}})
  fireEvent.submit(screen.getByRole('form',{name:'补充信息'}))
  await waitFor(()=>expect(update).toHaveBeenCalledWith(complete.id,{takenAt:'2025-09-21'}))
  await waitFor(()=>expect(screen.queryByText(/待补充/)).not.toBeInTheDocument())
  expect(useTicketStore.getState().tickets[0].processing?.reviewed).toBe(false)
  expect(useTicketStore.getState().tickets[0].originalImageUrl).toBe(complete.originalImageUrl)
})
it('edits a story without showing or patching the ticket fields',async()=>{
  render(<Sidebar/> )
  fireEvent.click(screen.getByRole('button',{name:'编辑故事'}))
  expect(screen.getByRole('textbox',{name:'旅程故事'})).toHaveFocus()
  expect(screen.queryByLabelText('日期')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('旅程故事'),{target:{value:'新的旅程故事'}})
  fireEvent.submit(screen.getByRole('form',{name:'编辑故事'}))
  await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('故事已保存'))
  expect(update).toHaveBeenCalledWith(complete.id,{story:'新的旅程故事'})
  expect(useTicketStore.getState().tickets[0].departure).toEqual(complete.departure)
  expect(dirty).toHaveBeenLastCalledWith(false)
})
it('preserves entered text when save fails and allows retry',async()=>{
  update.mockRejectedValueOnce(new Error('网络暂时中断'))
  render(<Sidebar/> );fireEvent.click(screen.getByRole('button',{name:'编辑故事'}))
  fireEvent.change(screen.getByLabelText('旅程故事'),{target:{value:'未丢失的故事'}})
  fireEvent.submit(screen.getByRole('form',{name:'编辑故事'}))
  await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('网络暂时中断'))
  expect(screen.getByLabelText('旅程故事')).toHaveValue('未丢失的故事')
  expect(dirty).toHaveBeenLastCalledWith(true)
})
it('editing ticket details preserves an existing story, image references and unchanged coordinates',async()=>{
  render(<Sidebar/> );fireEvent.click(screen.getByText('票面信息'))
  fireEvent.click(screen.getByRole('button',{name:'编辑票面信息'}))
  fireEvent.submit(screen.getByRole('form',{name:'编辑票面信息'}))
  await waitFor(()=>expect(update).toHaveBeenCalled())
  const patch=update.mock.calls[0][1]
  expect(patch).not.toHaveProperty('story');expect(patch).not.toHaveProperty('originalImageUrl')
  expect(patch.departure).toEqual(complete.departure)
  expect(patch.processing?.issues).toEqual(complete.processing?.issues)
})
