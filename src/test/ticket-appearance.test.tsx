import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {TicketOverlay} from '../components/TicketOverlay'
import {TicketFace} from '../components/TicketFace'
import {useTicketStore} from '../store/useTicketStore'
import type {Ticket} from '../types/ticket'

const ticket:Ticket={id:'user-styled',type:'train',takenAt:null,departure:{name:'甲'},arrival:{name:'乙'},
  originalImageUrl:'/test-original.png',processedImageUrl:'/test-styled.webp',thumbnailUrl:'/test-thumb.webp',
  story:'原故事',tags:[],companions:[],createdAt:'',updatedAt:''}
beforeEach(()=>{
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}}))
  HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')}
  HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}
  useTicketStore.setState({tickets:[ticket],selectedTicketId:ticket.id,searchQuery:'',yearRange:null,storySidebarOpen:false})
})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})

it('uses the saved styled thumbnail on the map and saved full face in the viewer',()=>{
  const view=render(<TicketFace ticket={ticket} thumbnail />)
  expect(screen.getByRole('img')).toHaveAttribute('src','/test-thumb.webp')
  view.rerender(<TicketFace ticket={ticket}/> )
  expect(screen.getByRole('img')).toHaveAttribute('src','/test-styled.webp')
})

it('defaults to the styled face, keeps the original button, and has no style selector',()=>{
  render(<TicketOverlay/> )
  expect(screen.getByRole('img')).toHaveAttribute('src','/test-styled.webp')
  expect(screen.queryByText(/Change Style/i)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'查看原图'}))
  expect(screen.getByRole('img')).toHaveAttribute('src','/test-original.png')
  fireEvent.click(screen.getByRole('button',{name:'查看票面'}))
  expect(screen.getByRole('img')).toHaveAttribute('src','/test-styled.webp')
  expect(useTicketStore.getState().tickets[0].story).toBe('原故事')
})

it('keeps a visible preview while the large image is loading or fails',()=>{
  const view=render(<TicketFace ticket={ticket} progressive/> )
  expect(view.container.querySelector('.ticket-preview')).toHaveAttribute('src','/test-thumb.webp')
  expect(screen.getByRole('img')).toHaveStyle({opacity:'0'})
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByRole('button',{name:'清晰图未载入，点此重试'})).toBeVisible()
  expect(view.container.querySelector('.ticket-preview')).toBeVisible()
  fireEvent.load(screen.getByRole('img'))
  expect(screen.getByRole('img')).toHaveStyle({opacity:'1'})
})
