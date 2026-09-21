import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from '../App'
import { mockTickets } from '../data/mockTickets'
import { useTicketStore } from '../store/useTicketStore'
import { readTrayCollapsed, saveTrayCollapsed, TRAY_PREFERENCE_KEY } from '../utils/trayPreference'
import { readMapPhotos, saveMapPhotos, MAP_PHOTOS_KEY } from '../utils/mapPreference'

vi.mock('../components/TicketMap', () => ({ TicketMap: ({showPhotos}:{showPhotos:boolean}) => <div data-testid="map" data-photos={showPhotos}>Test map</div> }))

beforeEach(() => {
  localStorage.clear()
  useTicketStore.setState({ready:true,loadError:null,init:async()=>{},tickets:mockTickets.slice(0,3),searchQuery:'',yearRange:null,selectedTicketId:null,uploadOpen:false})
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('collapsible ticket tray', () => {
  it('opens release history without resetting the map, search, years or tray',async()=>{
    HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')}
    HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}
    render(<App/>);const map=await screen.findByTestId('map')
    fireEvent.change(screen.getByRole('searchbox'),{target:{value:'G503'}})
    fireEvent.click(screen.getByRole('button',{name:'只看轨迹线'}))
    fireEvent.click(screen.getByRole('button',{name:'更新记录'}))
    expect(screen.getByRole('dialog',{name:'更新记录'})).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'关闭更新记录'}))
    expect(screen.getByTestId('map')).toBe(map)
    expect(map).toHaveAttribute('data-photos','false')
    expect(useTicketStore.getState().searchQuery).toBe('G503')
    expect(useTicketStore.getState().tickets).toHaveLength(3)
    expect(screen.getByRole('button',{name:'展开票据栏'})).toBeInTheDocument()
  })
  it('hides only map photos, persists the choice and preserves tickets and search',async()=>{
    const view=render(<App/>);await screen.findByTestId('map')
    fireEvent.change(screen.getByRole('searchbox'),{target:{value:'G503'}})
    fireEvent.click(screen.getByRole('button',{name:'只看轨迹线'}))
    expect(screen.getByRole('button',{name:'只看轨迹线'})).toHaveAttribute('aria-pressed','true')
    expect(screen.getByTestId('map')).toHaveAttribute('data-photos','false')
    expect(localStorage.getItem(MAP_PHOTOS_KEY)).toBe('false')
    expect(useTicketStore.getState().searchQuery).toBe('G503')
    expect(useTicketStore.getState().tickets).toHaveLength(3)
    view.unmount();render(<App/>);await screen.findByTestId('map')
    expect(screen.getByRole('button',{name:'只看轨迹线'})).toHaveAttribute('aria-pressed','true')
    fireEvent.click(screen.getByRole('button',{name:'只看轨迹线'}))
    expect(screen.getByTestId('map')).toHaveAttribute('data-photos','true')
  })
  it('starts compact, expands accessibly and hides the filmstrip from keyboard navigation when collapsed', () => {
    render(<App />)
    const toggle=screen.getByRole('button',{name:'展开票据栏'})
    const content=document.getElementById(toggle.getAttribute('aria-controls')!)!
    expect(toggle).toHaveAttribute('aria-expanded','false')
    expect(content).toHaveAttribute('inert')
    expect(content).toHaveAttribute('aria-hidden','true')
    expect(screen.getByRole('group',{name:'年份筛选'})).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'随机翻一张票'})).toBeEnabled()
    fireEvent.click(toggle)
    expect(screen.getByRole('button',{name:'收起票据栏'})).toHaveAttribute('aria-expanded','true')
    expect(content).not.toHaveAttribute('inert')
    expect(content).toHaveAttribute('aria-hidden','false')
    const filmstrip=document.querySelector('.ticket-filmstrip')!
    fireEvent.click(screen.getByRole('button',{name:'收起票据栏'}))
    expect(content).toHaveAttribute('inert')
    // Keep the same element, its horizontal position and selected filters.
    expect(document.querySelector('.ticket-filmstrip')).toBe(filmstrip)
    expect(useTicketStore.getState().tickets).toHaveLength(3)
  })

  it('remembers both states across remounts without resetting search or year filters', () => {
    const view=render(<App />)
    fireEvent.click(screen.getByRole('button',{name:'展开票据栏'}))
    expect(localStorage.getItem(TRAY_PREFERENCE_KEY)).toBe('false')
    view.unmount()
    const expanded=render(<App />)
    expect(screen.getByRole('button',{name:'收起票据栏'})).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'),{target:{value:'G503'}})
    fireEvent.click(screen.getByRole('button',{name:'收起票据栏'}))
    expect(useTicketStore.getState().searchQuery).toBe('G503')
    expect(localStorage.getItem(TRAY_PREFERENCE_KEY)).toBe('true')
    expanded.unmount()
    render(<App />)
    expect(screen.getByRole('button',{name:'展开票据栏'})).toBeInTheDocument()
  })

  it('remains usable when browser preference storage is blocked', () => {
    vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('blocked')})
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked')})
    expect(readTrayCollapsed()).toBe(true)
    expect(readMapPhotos()).toBe(true)
    expect(()=>saveMapPhotos(false)).not.toThrow()
    expect(()=>saveTrayCollapsed(false)).not.toThrow()
    render(<App />)
    fireEvent.click(screen.getByRole('button',{name:'展开票据栏'}))
    expect(screen.getByRole('button',{name:'收起票据栏'})).toBeInTheDocument()
  })
})
