import { useEffect, useMemo, useState } from 'react'
import './AdminConsole.css'

const GATEWAY_BASE_URL = 'https://novelwriter-scnet-gateway.liangyunlong.workers.dev'
const ADMIN_SESSION_KEY = 'novelwriter.admin.session.v1'

function parseAdminPageFromHash(hash: string): 'users' | 'issues' {
  const value = String(hash || '').toLowerCase()
  if (value.startsWith('#/admin/issues')) return 'issues'
  return 'users'
}

function buildAdminHash(page: 'users' | 'issues') {
  return page === 'issues' ? '#/admin/issues' : '#/admin/users'
}

type DashboardUser = {
  id: string
  email: string
  createdAt: string
  memberTier: 'normal' | 'plus' | 'pro'
  membershipExpiresAt: string
  isExpired: boolean
  isPaid: boolean
  totalRequests: number
  daysRequests: number
  frequencyPerDay: number
  totalTokens: number
  daysTokens: number
  lastUsedAt: string
  rechargeCount: number
  rechargeAmountCents: number
  lastRechargeAt: string
  redeemCardLabel?: string
}

type DashboardSummary = {
  totalUsers: number
  normalUsers: number
  plusUsers: number
  proUsers: number
  rechargeCountInRange: number
  rechargeAmountInRangeCents: number
}

type DashboardPayload = {
  days: number
  summary: DashboardSummary
  users: DashboardUser[]
}

type AdminIssueRecord = {
  id: string
  userId: string
  userEmail: string
  title: string
  content: string
  images: string[]
  visibility: 'public' | 'private'
  status: string
  createdAt: string
  updatedAt: string
  replyCount: number
}

type AdminIssueComment = {
  id: string
  issueId: string
  userId: string
  userEmail: string
  content: string
  images: string[]
  createdAt: string
  parentCommentId?: string
}

type AdminIssueDetailPayload = {
  issue?: AdminIssueRecord
  comments?: AdminIssueComment[]
}

type UsageHistoryItem = {
  id: string
  endpoint: string
  model: string
  total_tokens: number
  status_code: number
  error_text: string
  created_at: string
}

type RechargeHistoryItem = {
  id: string
  plan: string
  source: 'purchase' | 'redeem'
  amount_cents: number
  duration_days: number
  code: string
  status: string
  created_at: string
}

type DeviceHistoryItem = {
  ip_address: string
  mac_address: string
  first_seen_at: string
  last_seen_at: string
  hit_count: number
}

type UserDetailPayload = {
  days: number
  user: {
    id: string
    email: string
    createdAt: string
    blocked: boolean
    blockedMessage: string
    blockedUpdatedAt: string
    memberTier: 'normal' | 'plus' | 'pro'
    membershipExpiresAt: string
  }
  summary: {
    requestsInRange: number
    tokensInRange: number
    promptTokensInRange: number
    completionTokensInRange: number
    paidRechargeCount: number
    paidAmountCents: number
  }
  usageHistory: UsageHistoryItem[]
  rechargeHistory: RechargeHistoryItem[]
  deviceHistory: DeviceHistoryItem[]
}

function formatDate(value: string) {
  if (!value) return '--'
  const ts = new Date(value).getTime()
  if (!Number.isFinite(ts)) return value
  return new Date(value).toLocaleString('zh-CN')
}

function tierLabel(tier: DashboardUser['memberTier']) {
  if (tier === 'pro') return 'Pro'
  if (tier === 'plus') return 'Plus'
  return '普通'
}

function cardLabelFromRecharge(item: RechargeHistoryItem) {
  if (item.source !== 'redeem') return '--'
  const code = String(item.code || '').toUpperCase()
  if (code.includes('WEEK')) return '周卡'
  if (item.duration_days === 7) return '7日卡'
  if (item.duration_days >= 28 && item.duration_days <= 31) return '月卡'
  return `${item.duration_days}日卡`
}

async function readErrorMessage(response: Response, fallback: string) {
  const text = await response.text()
  try {
    const parsed = text ? (JSON.parse(text) as { error?: unknown; message?: unknown }) : {}
    if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error.trim()
    if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message.trim()
  } catch {
    // ignore parse error
  }
  return text || fallback
}

export default function AdminConsole() {
  const [activePage, setActivePage] = useState<'users' | 'issues'>(() =>
    parseAdminPageFromHash(window.location.hash)
  )
  const [adminInput, setAdminInput] = useState('')
  const [adminSessionToken, setAdminSessionToken] = useState(() => localStorage.getItem(ADMIN_SESSION_KEY) || '')
  const [days, setDays] = useState(30)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState<DashboardPayload | null>(null)

  const [selectedUserId, setSelectedUserId] = useState('')
  const [detail, setDetail] = useState<UserDetailPayload | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [isSavingBlock, setIsSavingBlock] = useState(false)
  const [blockEnabled, setBlockEnabled] = useState(false)
  const [blockMessage, setBlockMessage] = useState('')
  const [issues, setIssues] = useState<AdminIssueRecord[]>([])
  const [issuesError, setIssuesError] = useState('')
  const [isIssuesLoading, setIsIssuesLoading] = useState(false)
  const [selectedIssueId, setSelectedIssueId] = useState('')
  const [selectedIssue, setSelectedIssue] = useState<AdminIssueRecord | null>(null)
  const [selectedIssueComments, setSelectedIssueComments] = useState<AdminIssueComment[]>([])
  const [issueDetailError, setIssueDetailError] = useState('')
  const [isIssueDetailLoading, setIsIssueDetailLoading] = useState(false)
  const [isIssueVisibilitySaving, setIsIssueVisibilitySaving] = useState(false)
  const [adminIssueReplyContent, setAdminIssueReplyContent] = useState('')
  const [adminIssueReplyParentId, setAdminIssueReplyParentId] = useState('')
  const [isAdminIssueReplySubmitting, setIsAdminIssueReplySubmitting] = useState(false)

  const isLoggedIn = Boolean(adminSessionToken.trim())

  async function loginAdmin() {
    const token = adminInput.trim()
    if (!token) {
      setError('请输入管理员口令')
      return
    }
    setError('')
    setIsLoading(true)
    try {
      const resp = await fetch(`${GATEWAY_BASE_URL}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminToken: token })
      })
      if (!resp.ok) {
        const message = await readErrorMessage(resp, `管理员登录失败：${resp.status}`)
        throw new Error(message)
      }
      const data = (await resp.json()) as { token?: string }
      const session = String(data.token || '').trim()
      if (!session) throw new Error('管理员会话令牌为空')
      localStorage.setItem(ADMIN_SESSION_KEY, session)
      setAdminSessionToken(session)
      setAdminInput('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '管理员登录失败')
    } finally {
      setIsLoading(false)
    }
  }

  function logoutAdmin() {
    localStorage.removeItem(ADMIN_SESSION_KEY)
    setAdminSessionToken('')
    setPayload(null)
    setError('')
    setSelectedUserId('')
    setDetail(null)
    setIssues([])
    setIssuesError('')
    setSelectedIssueId('')
    setSelectedIssue(null)
    setSelectedIssueComments([])
    setIssueDetailError('')
    setAdminIssueReplyContent('')
    setAdminIssueReplyParentId('')
  }

  async function fetchDashboard() {
    if (!adminSessionToken.trim()) return
    setError('')
    setIsLoading(true)
    try {
      const resp = await fetch(`${GATEWAY_BASE_URL}/admin/dashboard?days=${days}`, {
        headers: {
          Authorization: `Bearer ${adminSessionToken}`
        }
      })
      if (!resp.ok) {
        if (resp.status === 403) {
          logoutAdmin()
          throw new Error('管理员会话已失效，请重新登录')
        }
        const message = await readErrorMessage(resp, `获取后台数据失败：${resp.status}`)
        throw new Error(message)
      }
      const data = (await resp.json()) as DashboardPayload
      setPayload(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取后台数据失败')
    } finally {
      setIsLoading(false)
    }
  }

  async function fetchIssues() {
    if (!adminSessionToken.trim()) return
    setIssuesError('')
    setIsIssuesLoading(true)
    try {
      const resp = await fetch(`${GATEWAY_BASE_URL}/admin/issues`, {
        headers: {
          Authorization: `Bearer ${adminSessionToken}`
        }
      })
      if (!resp.ok) {
        const message = await readErrorMessage(resp, `获取问题反馈失败：${resp.status}`)
        throw new Error(message)
      }
      const data = (await resp.json()) as { issues?: AdminIssueRecord[] }
      setIssues(Array.isArray(data.issues) ? data.issues : [])
    } catch (err) {
      setIssuesError(err instanceof Error ? err.message : '获取问题反馈失败')
    } finally {
      setIsIssuesLoading(false)
    }
  }

  async function openIssueDetail(issueId: string) {
    if (!adminSessionToken.trim()) return
    setSelectedIssueId(issueId)
    setSelectedIssue(null)
    setSelectedIssueComments([])
    setIssueDetailError('')
    setAdminIssueReplyContent('')
    setAdminIssueReplyParentId('')
    setIsIssueDetailLoading(true)
    try {
      const resp = await fetch(`${GATEWAY_BASE_URL}/admin/issues/${issueId}`, {
        headers: {
          Authorization: `Bearer ${adminSessionToken}`
        }
      })
      if (!resp.ok) {
        const message = await readErrorMessage(resp, `获取问题详情失败：${resp.status}`)
        throw new Error(message)
      }
      const data = (await resp.json()) as AdminIssueDetailPayload
      setSelectedIssue(data.issue || null)
      setSelectedIssueComments(Array.isArray(data.comments) ? data.comments : [])
    } catch (err) {
      setIssueDetailError(err instanceof Error ? err.message : '获取问题详情失败')
    } finally {
      setIsIssueDetailLoading(false)
    }
  }

  function closeIssueDetail() {
    if (isIssueVisibilitySaving || isAdminIssueReplySubmitting) return
    setSelectedIssueId('')
    setSelectedIssue(null)
    setSelectedIssueComments([])
    setIssueDetailError('')
    setAdminIssueReplyContent('')
    setAdminIssueReplyParentId('')
  }

  async function updateIssueVisibility(issueId: string, isPublic: boolean) {
    if (!adminSessionToken.trim()) return
    setIsIssueVisibilitySaving(true)
    setIssuesError('')
    setIssueDetailError('')
    try {
      const resp = await fetch(`${GATEWAY_BASE_URL}/admin/issues/${issueId}/visibility`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminSessionToken}`
        },
        body: JSON.stringify({ isPublic })
      })
      if (!resp.ok) {
        const message = await readErrorMessage(resp, `更新可见性失败：${resp.status}`)
        throw new Error(message)
      }
      await fetchIssues()
      if (selectedIssueId === issueId) {
        await openIssueDetail(issueId)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '更新可见性失败'
      setIssuesError(message)
      setIssueDetailError(message)
    } finally {
      setIsIssueVisibilitySaving(false)
    }
  }

  async function submitAdminIssueReply() {
    if (!adminSessionToken.trim() || !selectedIssueId) return
    const content = adminIssueReplyContent.trim()
    if (!content) {
      setIssueDetailError('请填写回复内容')
      return
    }

    setIsAdminIssueReplySubmitting(true)
    setIssueDetailError('')
    try {
      const resp = await fetch(`${GATEWAY_BASE_URL}/admin/issues/${selectedIssueId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminSessionToken}`
        },
        body: JSON.stringify({
          content,
          parentCommentId: adminIssueReplyParentId || undefined
        })
      })
      if (!resp.ok) {
        const message = await readErrorMessage(resp, `回复失败：${resp.status}`)
        throw new Error(message)
      }

      setAdminIssueReplyContent('')
      setAdminIssueReplyParentId('')
      await openIssueDetail(selectedIssueId)
      await fetchIssues()
    } catch (err) {
      setIssueDetailError(err instanceof Error ? err.message : '回复失败')
    } finally {
      setIsAdminIssueReplySubmitting(false)
    }
  }

  async function openUserDetail(userId: string) {
    if (!adminSessionToken.trim()) return
    setSelectedUserId(userId)
    setDetail(null)
    setDetailError('')
    setIsDetailLoading(true)
    try {
      const resp = await fetch(`${GATEWAY_BASE_URL}/admin/users/${userId}?days=${days}`, {
        headers: {
          Authorization: `Bearer ${adminSessionToken}`
        }
      })
      if (!resp.ok) {
        const message = await readErrorMessage(resp, `获取用户详情失败：${resp.status}`)
        throw new Error(message)
      }
      const data = (await resp.json()) as UserDetailPayload
      setDetail(data)
      setBlockEnabled(Boolean(data.user.blocked))
      setBlockMessage(String(data.user.blockedMessage || ''))
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : '获取用户详情失败')
    } finally {
      setIsDetailLoading(false)
    }
  }

  function closeUserDetail() {
    if (isSavingBlock) return
    setSelectedUserId('')
    setDetail(null)
    setDetailError('')
  }

  async function saveUserBlockSetting() {
    if (!selectedUserId || !adminSessionToken.trim()) return
    setIsSavingBlock(true)
    setDetailError('')
    try {
      const resp = await fetch(`${GATEWAY_BASE_URL}/admin/users/${selectedUserId}/block`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminSessionToken}`
        },
        body: JSON.stringify({
          blocked: blockEnabled,
          message: blockEnabled ? blockMessage.trim() : ''
        })
      })
      if (!resp.ok) {
        const message = await readErrorMessage(resp, `保存封禁设置失败：${resp.status}`)
        throw new Error(message)
      }
      await openUserDetail(selectedUserId)
      await fetchDashboard()
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : '保存封禁设置失败')
    } finally {
      setIsSavingBlock(false)
    }
  }

  useEffect(() => {
    if (!isLoggedIn) return
    void fetchDashboard()
    void fetchIssues()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, days])

  useEffect(() => {
    const onHashChange = () => {
      setActivePage(parseAdminPageFromHash(window.location.hash))
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    const nextHash = buildAdminHash(activePage)
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash
    }
  }, [activePage])

  const revenueYuan = useMemo(() => {
    const cents = payload?.summary.rechargeAmountInRangeCents ?? 0
    return (cents / 100).toFixed(2)
  }, [payload])

  return (
    <main className={`admin-console ${isLoggedIn ? 'is-authenticated' : 'is-login'}`}>
      <header className="admin-console-header">
        <h1>软件管理后台</h1>
        <div className="admin-console-header-actions">
          <a href="#/" className="admin-link">
            返回写作端
          </a>
          {isLoggedIn && (
            <button className="admin-btn" onClick={logoutAdmin} type="button">
              退出管理员
            </button>
          )}
        </div>
      </header>

      {!isLoggedIn ? (
        <section className="admin-login-card">
          <h2>管理员登录</h2>
          <p>仅管理员口令可访问后台数据。</p>
          <input
            autoFocus
            value={adminInput}
            onChange={(event) => setAdminInput(event.target.value)}
            placeholder="输入 ADMIN_TOKEN"
            type="password"
          />
          <button
            className="admin-btn admin-btn-primary"
            disabled={isLoading}
            onClick={() => void loginAdmin()}
            type="button"
          >
            {isLoading ? '登录中...' : '登录'}
          </button>
          {error && <p className="admin-error">{error}</p>}
        </section>
      ) : (
        <>
          <section className="admin-toolbar">
            <div className="admin-page-switch">
              <button
                className={`admin-btn ${activePage === 'users' ? 'admin-btn-primary' : ''}`}
                onClick={() => setActivePage('users')}
                type="button"
              >
                用户管理
              </button>
              <button
                className={`admin-btn ${activePage === 'issues' ? 'admin-btn-primary' : ''}`}
                onClick={() => setActivePage('issues')}
                type="button"
              >
                问题管理
              </button>
            </div>
            <label>
              统计区间（天）
              <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
                <option value={7}>7</option>
                <option value={30}>30</option>
                <option value={90}>90</option>
              </select>
            </label>
            <button
              className="admin-btn admin-btn-primary"
              disabled={isLoading}
              onClick={() => void fetchDashboard()}
              type="button"
            >
              {isLoading ? '刷新中...' : '刷新数据'}
            </button>
            {activePage === 'issues' && (
              <button
                className="admin-btn"
                disabled={isIssuesLoading}
                onClick={() => void fetchIssues()}
                type="button"
              >
                {isIssuesLoading ? '问题刷新中...' : '刷新问题反馈'}
              </button>
            )}
          </section>

          {error && <p className="admin-error">{error}</p>}
          {issuesError && <p className="admin-error">{issuesError}</p>}

          {activePage === 'users' && (
            <>
              <section className="admin-summary-grid">
                <article>
                  <strong>{payload?.summary.totalUsers ?? 0}</strong>
                  <span>总用户</span>
                </article>
                <article>
                  <strong>{payload?.summary.normalUsers ?? 0}</strong>
                  <span>普通会员</span>
                </article>
                <article>
                  <strong>{payload?.summary.plusUsers ?? 0}</strong>
                  <span>Plus 会员</span>
                </article>
                <article>
                  <strong>{payload?.summary.proUsers ?? 0}</strong>
                  <span>Pro 会员</span>
                </article>
                <article>
                  <strong>{payload?.summary.rechargeCountInRange ?? 0}</strong>
                  <span>{days}天充值笔数</span>
                </article>
                <article>
                  <strong>{revenueYuan}</strong>
                  <span>{days}天充值金额(元)</span>
                </article>
              </section>

              <section className="admin-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>邮箱</th>
                      <th>会员</th>
                      <th>到期时间</th>
                      <th>是否充值</th>
                      <th>充值次数</th>
                      <th>总充值金额(元)</th>
                      <th>最近充值</th>
                      <th>请求频率(次/天)</th>
                      <th>{days}天请求</th>
                      <th>累计请求</th>
                      <th>{days}天Tokens</th>
                      <th>累计Tokens</th>
                      <th>最近使用</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(payload?.users || []).map((user) => (
                      <tr key={user.id}>
                        <td>
                          <button className="admin-user-link" onClick={() => void openUserDetail(user.id)} type="button">
                            {user.email}
                          </button>
                        </td>
                        <td>
                          {tierLabel(user.memberTier)}
                          {user.isExpired ? '（已到期）' : ''}
                        </td>
                        <td>{formatDate(user.membershipExpiresAt)}</td>
                        <td>
                          {user.rechargeCount > 0 ? '是' : '否'}
                          {user.rechargeCount <= 0 && user.redeemCardLabel ? (
                            <div className="admin-redeem-tag">{user.redeemCardLabel}</div>
                          ) : null}
                        </td>
                        <td>{user.rechargeCount}</td>
                        <td>{(user.rechargeAmountCents / 100).toFixed(2)}</td>
                        <td>{formatDate(user.lastRechargeAt)}</td>
                        <td>{user.frequencyPerDay}</td>
                        <td>{user.daysRequests}</td>
                        <td>{user.totalRequests}</td>
                        <td>{user.daysTokens.toLocaleString('zh-CN')}</td>
                        <td>{user.totalTokens.toLocaleString('zh-CN')}</td>
                        <td>{formatDate(user.lastUsedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!payload?.users?.length && <p className="admin-empty">暂无用户数据。</p>}
              </section>
            </>
          )}

          {activePage === 'issues' && (
            <section className="admin-table-wrap">
              <div className="admin-issues-head">
                <h3>问题反馈（默认仅管理员可见）</h3>
                <span>{`共 ${issues.length} 条`}</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>标题</th>
                    <th>用户</th>
                    <th>可见性</th>
                    <th>回复数</th>
                    <th>更新时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <button className="admin-user-link" onClick={() => void openIssueDetail(row.id)} type="button">
                          {row.title}
                        </button>
                      </td>
                      <td>{row.userEmail}</td>
                      <td>{row.visibility === 'public' ? '公开' : '私密'}</td>
                      <td>{row.replyCount}</td>
                      <td>{formatDate(row.updatedAt)}</td>
                      <td>
                        <button
                          className="admin-btn"
                          disabled={isIssueVisibilitySaving}
                          onClick={() => void updateIssueVisibility(row.id, row.visibility !== 'public')}
                          type="button"
                        >
                          {row.visibility === 'public' ? '改为私密' : '设为公开'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!issues.length && !isIssuesLoading && <p className="admin-empty">暂无问题反馈。</p>}
            </section>
          )}

          {selectedUserId && (
            <div className="admin-detail-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeUserDetail()}>
              <section className="admin-detail-modal" onMouseDown={(event) => event.stopPropagation()}>
                <header className="admin-detail-head">
                  <h3>用户详情</h3>
                  <button className="admin-btn" onClick={closeUserDetail} type="button">关闭</button>
                </header>

                {isDetailLoading && <p className="admin-empty">加载中...</p>}
                {detailError && <p className="admin-error">{detailError}</p>}

                {detail && !isDetailLoading && (
                  <div className="admin-detail-grid">
                    <section className="admin-detail-card">
                      <h4>基础信息</h4>
                      <p>{`邮箱：${detail.user.email}`}</p>
                      <p>{`会员：${tierLabel(detail.user.memberTier)}`}</p>
                      <p>{`到期：${formatDate(detail.user.membershipExpiresAt)}`}</p>
                      <p>{`注册时间：${formatDate(detail.user.createdAt)}`}</p>
                      <p>{`近${detail.days}天请求：${detail.summary.requestsInRange}`}</p>
                      <p>{`近${detail.days}天Tokens：${detail.summary.tokensInRange.toLocaleString('zh-CN')}`}</p>
                      <p>{`总充值(元)：${(detail.summary.paidAmountCents / 100).toFixed(2)}`}</p>
                    </section>

                    <section className="admin-detail-card">
                      <h4>封禁设置</h4>
                      <label className="admin-block-toggle">
                        <input checked={blockEnabled} onChange={(event) => setBlockEnabled(event.target.checked)} type="checkbox" />
                        <span>禁止该用户使用产品</span>
                      </label>
                      <textarea
                        disabled={!blockEnabled}
                        onChange={(event) => setBlockMessage(event.target.value)}
                        placeholder="自定义提示（用户被禁用时返回）"
                        value={blockMessage}
                      />
                      <div className="admin-detail-actions">
                        <button className="admin-btn admin-btn-primary" disabled={isSavingBlock} onClick={() => void saveUserBlockSetting()} type="button">
                          {isSavingBlock ? '保存中...' : '保存设置'}
                        </button>
                      </div>
                      <p>{`最近封禁更新时间：${formatDate(detail.user.blockedUpdatedAt)}`}</p>
                    </section>

                    <section className="admin-detail-card admin-detail-wide">
                      <h4>消费历史（请求明细）</h4>
                      <div className="admin-mini-table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>时间</th>
                              <th>模型</th>
                              <th>接口</th>
                              <th>Tokens</th>
                              <th>状态</th>
                              <th>错误</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.usageHistory.map((row) => (
                              <tr key={row.id}>
                                <td>{formatDate(row.created_at)}</td>
                                <td>{row.model || '--'}</td>
                                <td>{row.endpoint}</td>
                                <td>{Number(row.total_tokens || 0).toLocaleString('zh-CN')}</td>
                                <td>{row.status_code}</td>
                                <td>{row.error_text || '--'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    <section className="admin-detail-card admin-detail-wide">
                      <h4>充值/兑换历史</h4>
                      <div className="admin-mini-table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>时间</th>
                              <th>类型</th>
                              <th>方案</th>
                              <th>金额(元)</th>
                              <th>时长</th>
                              <th>卡种</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.rechargeHistory.map((row) => (
                              <tr key={row.id}>
                                <td>{formatDate(row.created_at)}</td>
                                <td>{row.source === 'purchase' ? '充值' : '兑换码'}</td>
                                <td>{row.plan}</td>
                                <td>{(Number(row.amount_cents || 0) / 100).toFixed(2)}</td>
                                <td>{row.duration_days}天</td>
                                <td>{cardLabelFromRecharge(row)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    <section className="admin-detail-card admin-detail-wide">
                      <h4>设备历史（IP / MAC）</h4>
                      <div className="admin-mini-table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>IP</th>
                              <th>MAC</th>
                              <th>首次出现</th>
                              <th>最近出现</th>
                              <th>次数</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.deviceHistory.map((row, idx) => (
                              <tr key={`${row.ip_address}-${row.mac_address}-${idx}`}>
                                <td>{row.ip_address || '--'}</td>
                                <td>{row.mac_address || '--'}</td>
                                <td>{formatDate(row.first_seen_at)}</td>
                                <td>{formatDate(row.last_seen_at)}</td>
                                <td>{row.hit_count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </div>
                )}
              </section>
            </div>
          )}

          {selectedIssueId && (
            <div className="admin-detail-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeIssueDetail()}>
              <section className="admin-detail-modal admin-issue-detail-modal" onMouseDown={(event) => event.stopPropagation()}>
                <header className="admin-detail-head">
                  <h3>问题详情</h3>
                  <button className="admin-btn" onClick={closeIssueDetail} type="button">关闭</button>
                </header>

                {isIssueDetailLoading && <p className="admin-empty">加载中...</p>}
                {issueDetailError && <p className="admin-error">{issueDetailError}</p>}

                {selectedIssue && !isIssueDetailLoading && (
                  <>
                    <div className="admin-issue-detail-body">
                      <div className="admin-issue-detail-grid">
                        <section className="admin-detail-card admin-detail-wide">
                          <h4>{selectedIssue.title}</h4>
                          <p>{`用户：${selectedIssue.userEmail}`}</p>
                          <p>{`创建：${formatDate(selectedIssue.createdAt)}`}</p>
                          <p>{`更新：${formatDate(selectedIssue.updatedAt)}`}</p>
                          <p>{`可见性：${selectedIssue.visibility === 'public' ? '公开可回复' : '私密（仅管理员和本人）'}`}</p>
                          <p>{selectedIssue.content}</p>
                          {selectedIssue.images.length > 0 && (
                            <div className="admin-issue-image-grid">
                              {selectedIssue.images.map((img, idx) => (
                                <img alt={`issue-${idx + 1}`} key={`${img.slice(0, 32)}-${idx}`} src={img} />
                              ))}
                            </div>
                          )}
                          <div className="admin-detail-actions">
                            <button
                              className="admin-btn"
                              onClick={() => setAdminIssueReplyParentId('')}
                              type="button"
                            >
                              回复主贴
                            </button>
                            <button
                              className="admin-btn admin-btn-primary"
                              disabled={isIssueVisibilitySaving}
                              onClick={() => void updateIssueVisibility(selectedIssue.id, selectedIssue.visibility !== 'public')}
                              type="button"
                            >
                              {isIssueVisibilitySaving
                                ? '保存中...'
                                : selectedIssue.visibility === 'public'
                                  ? '改为私密'
                                  : '设为公开'}
                            </button>
                          </div>
                        </section>

                        <section className="admin-detail-card admin-detail-wide">
                          <h4>回复列表</h4>
                          <div className="admin-mini-table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>时间</th>
                                  <th>用户</th>
                                  <th>内容</th>
                                  <th>图片</th>
                                  <th>操作</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedIssueComments.map((comment) => (
                                  <tr key={comment.id}>
                                    <td>{formatDate(comment.createdAt)}</td>
                                    <td>{comment.userEmail}</td>
                                    <td>{comment.content}</td>
                                    <td>{comment.images.length > 0 ? `有 (${comment.images.length})` : '--'}</td>
                                    <td>
                                      <button
                                        className="admin-btn"
                                        onClick={() => setAdminIssueReplyParentId(comment.id)}
                                        type="button"
                                      >
                                        回复
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {selectedIssueComments.length > 0 && (
                            <div className="admin-issue-comment-list">
                              {selectedIssueComments.map((comment) => (
                                <article key={`${comment.id}-full`}>
                                  <header>
                                    <strong>{comment.userEmail}</strong>
                                    <span>{formatDate(comment.createdAt)}</span>
                                  </header>
                                  <p>{comment.content}</p>
                                  {comment.parentCommentId && (
                                    <small className="admin-issue-comment-parent">{`回复：${comment.parentCommentId}`}</small>
                                  )}
                                  <div className="admin-issue-comment-actions">
                                    <button
                                      className="admin-btn"
                                      onClick={() => setAdminIssueReplyParentId(comment.id)}
                                      type="button"
                                    >
                                      回复该条
                                    </button>
                                  </div>
                                  {comment.images.length > 0 && (
                                    <div className="admin-issue-image-grid">
                                      {comment.images.map((img, idx) => (
                                        <img alt={`comment-${idx + 1}`} key={`${img.slice(0, 32)}-${idx}`} src={img} />
                                      ))}
                                    </div>
                                  )}
                                </article>
                              ))}
                            </div>
                          )}
                        </section>
                      </div>
                    </div>
                    <section className="admin-detail-card admin-issue-reply-editor">
                      <h4>{adminIssueReplyParentId ? '回复指定回复' : '回复主贴'}</h4>
                      {adminIssueReplyParentId && (
                        <p className="admin-issue-reply-target">{`目标回复ID：${adminIssueReplyParentId}`}</p>
                      )}
                      <textarea
                        onChange={(event) => setAdminIssueReplyContent(event.target.value)}
                        placeholder={adminIssueReplyParentId ? '输入对该条回复的管理员回复...' : '输入管理员回复...'}
                        value={adminIssueReplyContent}
                      />
                      <div className="admin-detail-actions">
                        {adminIssueReplyParentId && (
                          <button
                            className="admin-btn"
                            disabled={isAdminIssueReplySubmitting}
                            onClick={() => setAdminIssueReplyParentId('')}
                            type="button"
                          >
                            改为回复主贴
                          </button>
                        )}
                        <button
                          className="admin-btn admin-btn-primary"
                          disabled={isAdminIssueReplySubmitting}
                          onClick={() => void submitAdminIssueReply()}
                          type="button"
                        >
                          {isAdminIssueReplySubmitting ? '提交中...' : '提交回复'}
                        </button>
                      </div>
                    </section>
                  </>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </main>
  )
}
