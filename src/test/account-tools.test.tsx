import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react'
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {AccountTools} from '../components/AccountTools'
import {remoteRequest} from '../utils/remote'

vi.mock('../utils/remote',()=>({SERVER_BASE:'/tickets',remoteRequest:vi.fn()}))
const account={email:'friend@example.com',role:'member',usedBytes:1024,quotaBytes:256*1024**2,feedbackEnabled:true}
beforeEach(()=>{
  HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')}
  HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}
  vi.mocked(remoteRequest).mockResolvedValue(account)
})
afterEach(()=>{cleanup();vi.resetAllMocks()})
describe('account and feedback entry points',()=>{
  it('submits only the written suggestion, shows durable receipt and no admin inbox for members',async()=>{
    render(<AccountTools/>);fireEvent.click(screen.getByRole('button',{name:'提建议'}))
    await waitFor(()=>expect(screen.queryByText('正在处理…')).not.toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('想说的话'),{target:{value:'希望搜索能够支持更多关键词'}})
    vi.mocked(remoteRequest).mockResolvedValueOnce({message:'已保存，站长可在反馈收件箱中查看。'})
    fireEvent.click(screen.getByRole('button',{name:'发送建议'}))
    await screen.findByText('已保存，站长可在反馈收件箱中查看。')
    expect(remoteRequest).toHaveBeenLastCalledWith('/feedback',expect.objectContaining({method:'POST',body:JSON.stringify({category:'suggestion',message:'希望搜索能够支持更多关键词'})}))
    fireEvent.click(screen.getByRole('button',{name:'关闭窗口'}))
    vi.mocked(remoteRequest).mockResolvedValue(account)
    fireEvent.click(screen.getByRole('button',{name:'我的账号'}))
    await screen.findByText('friend@example.com')
    expect(screen.queryByText('收到的建议')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('邀请码')).not.toBeInTheDocument()
  })
  it('keeps failed feedback text for retry',async()=>{
    render(<AccountTools/>);fireEvent.click(screen.getByRole('button',{name:'提建议'}))
    await waitFor(()=>expect(screen.queryByText('正在处理…')).not.toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('想说的话'),{target:{value:'这是需要保留的建议内容'}})
    vi.mocked(remoteRequest).mockRejectedValueOnce(new Error('网络暂时不可用'))
    fireEvent.click(screen.getByRole('button',{name:'发送建议'}))
    await screen.findByText('网络暂时不可用')
    expect(screen.getByLabelText('想说的话')).toHaveValue('这是需要保留的建议内容')
  })
  it('shows owner inbox and renders user content as text',async()=>{
    vi.mocked(remoteRequest).mockResolvedValue({...account,role:'owner',inviteCode:'test-only-invitation'})
    render(<AccountTools/>);fireEvent.click(screen.getByRole('button',{name:'我的账号'}))
    await screen.findByText('收到的建议')
    expect(screen.getByLabelText('邀请码')).toHaveValue('test-only-invitation')
    vi.mocked(remoteRequest).mockResolvedValueOnce([{id:'test-feedback',email:'friend@example.com',category:'bug',message:'<script>doNotExecute()</script>',createdAt:'2026-01-01T00:00:00Z',status:'new',notification:'pending'}])
    fireEvent.click(screen.getByRole('button',{name:'收到的建议'}))
    await screen.findByText('<script>doNotExecute()</script>')
    expect(document.querySelector('script')).toBeNull()
    expect(screen.getByRole('button',{name:'标记已处理'})).toBeEnabled()
  })
})
