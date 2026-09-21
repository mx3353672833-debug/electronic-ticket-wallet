import {render,screen,fireEvent,cleanup} from '@testing-library/react'
import {afterEach,beforeEach,describe,it,expect} from 'vitest'
import {ReleaseNotes} from '../components/ReleaseNotes'
import releases from '../data/releases.json'

beforeEach(()=>{
  HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')}
  HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}
})
afterEach(cleanup)

describe('release notes',()=>{
  it('does not interrupt the map; opens every release newest-first only on request',()=>{
    render(<ReleaseNotes/>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'更新记录'}))
    expect(screen.getByRole('dialog',{name:'更新记录'})).toBeVisible()
    expect(screen.getByText(`当前版本 v${releases[0].version}`)).toBeInTheDocument()
    expect(screen.getAllByRole('heading',{level:3}).map(heading=>heading.textContent)).toEqual(releases.map(release=>release.title))
    for(const release of releases)for(const change of release.changes)expect(screen.getByText(change)).toBeInTheDocument()
    expect(screen.getByRole('region',{name:'版本更新历史'})).toHaveAttribute('tabindex','0')
  })
  it('closes by button and Escape, restores focus, and never auto-opens on a new visit',()=>{
    const view=render(<ReleaseNotes/>),trigger=screen.getByRole('button',{name:'更新记录'})
    trigger.focus();fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button',{name:'关闭更新记录'}))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(trigger).toHaveFocus()
    fireEvent.click(trigger)
    fireEvent(screen.getByRole('dialog'),new Event('cancel',{bubbles:false,cancelable:true}))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(trigger).toHaveFocus()
    view.unmount();render(<ReleaseNotes/>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
