interface Env {
  DB: D1Database
  SCNET_API_KEY?: string
  DEEPSEEK_API_KEY?: string
  JWT_SECRET: string
  ADMIN_TOKEN?: string
  SCNET_BASE_URL?: string
  DEEPSEEK_BASE_URL?: string
  ALLOWED_ORIGINS?: string
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
type MemberTier = 'normal' | 'plus' | 'pro'

type UserTokenPayload = {
  uid: string
  email: string
  exp: number
}

type AdminTokenPayload = {
  role: 'admin'
  exp: number
}

type RequireUserOptions = {
  allowBlocked?: boolean
}

type MembershipInfo = {
  tier: MemberTier
  expiresAt: string
  isExpired: boolean
}

const USER_TOKEN_PREFIX = 'nwu'
const ADMIN_TOKEN_PREFIX = 'nwa'
const API_KEY_PREFIX = 'nwk_'
const PASSWORD_ITERATIONS = 100000
const WEEKLY_REDEEM_CODES = new Set(['NW-WEEK-2026-7D-Q9M4XK', 'NW-WEEK-2026-7D-R8P2LM'])
const DEFAULT_BLOCKED_MESSAGE = '你的账户被禁用，请联系客服'
const ADMIN_ISSUE_USER_ID = '__admin_issue_user__'
const ADMIN_ISSUE_USER_EMAIL = 'admin@novelwriter.local'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = buildCorsHeaders(request, env)
    try {
      const url = new URL(request.url)
      const path = url.pathname
      const method = request.method.toUpperCase()

      if (method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders })
      }

      if (method === 'GET' && path === '/health') {
        return json(
          {
            ok: true,
            service: 'novelwriter-scnet-gateway',
            now: new Date().toISOString()
          },
          200,
          corsHeaders
        )
      }

      if (method === 'POST' && path === '/auth/register') {
        return withCors(await handleRegister(request, env), corsHeaders)
      }
      if (method === 'POST' && path === '/auth/login') {
        return withCors(await handleLogin(request, env), corsHeaders)
      }
      if (method === 'POST' && path === '/auth/password-reset') {
        return withCors(await handlePasswordReset(request, env), corsHeaders)
      }
      if (method === 'GET' && path === '/auth/me') {
        const user = await requireUser(request, env)
        const membership = await getUserMembership(env.DB, user.uid)
        return json({ user, membership }, 200, corsHeaders)
      }
      if (method === 'GET' && path === '/auth/membership') {
        const user = await requireUser(request, env)
        const membership = await getUserMembership(env.DB, user.uid)
        return json({ membership }, 200, corsHeaders)
      }
      if (
        method === 'POST' &&
        (path === '/auth/membership/upgrade' || path === '/auth/membership/redeem' || path === '/auth/redeem')
      ) {
        return withCors(await handleMembershipUpgrade(request, env), corsHeaders)
      }
      if (method === 'GET' && path === '/auth/api-keys') {
        const user = await requireUser(request, env)
        const keys = await listUserApiKeys(env.DB, user.uid)
        return json({ keys }, 200, corsHeaders)
      }
      if (method === 'POST' && path === '/auth/api-keys') {
        const user = await requireUser(request, env)
        const body = await readJson<{ name?: string }>(request)
        const created = await createUserApiKey(env.DB, user.uid, body?.name?.trim() || '默认密钥')
        return json({ apiKey: created.apiKey, key: created.safeKey }, 201, corsHeaders)
      }
      if (method === 'POST' && path.startsWith('/auth/api-keys/') && path.endsWith('/revoke')) {
        const user = await requireUser(request, env)
        const keyId = path.replace('/auth/api-keys/', '').replace('/revoke', '')
        await revokeUserApiKey(env.DB, user.uid, keyId)
        return json({ ok: true }, 200, corsHeaders)
      }
      if (method === 'GET' && path === '/auth/usage') {
        const user = await requireUser(request, env)
        const days = clampNumber(Number(url.searchParams.get('days') || '7'), 1, 90)
        const usage = await queryUserUsage(env.DB, user.uid, days)
        return json({ usage }, 200, corsHeaders)
      }
      if (method === 'GET' && path === '/issues') {
        return withCors(await handleUserIssuesList(request, env), corsHeaders)
      }
      if (method === 'POST' && path === '/issues') {
        return withCors(await handleCreateIssue(request, env), corsHeaders)
      }
      if (method === 'GET' && /^\/issues\/[^/]+$/.test(path)) {
        const issueId = path.replace('/issues/', '')
        return withCors(await handleIssueDetail(request, env, issueId), corsHeaders)
      }
      if (method === 'POST' && /^\/issues\/[^/]+\/comments$/.test(path)) {
        const issueId = path.replace('/issues/', '').replace('/comments', '')
        return withCors(await handleIssueCommentCreate(request, env, issueId), corsHeaders)
      }

      if (method === 'POST' && path === '/admin/login') {
        return withCors(await handleAdminLogin(request, env), corsHeaders)
      }
      if (method === 'GET' && path === '/admin/users') {
        await requireAdmin(request, env)
        const users = await env.DB
          .prepare(
            `SELECT
              u.id,
              u.email,
              u.created_at,
              COALESCE(m.tier, 'normal') AS tier,
              m.expires_at,
              COALESCE(u.blocked, 0) AS blocked,
              COALESCE(u.blocked_message, '') AS blocked_message
             FROM users u
             LEFT JOIN memberships m ON m.user_id = u.id
             ORDER BY u.created_at DESC
             LIMIT 500`
          )
          .all()
        return json({ users: users.results ?? [] }, 200, corsHeaders)
      }
      if (method === 'GET' && /^\/admin\/users\/[^/]+$/.test(path)) {
        await requireAdmin(request, env)
        const userId = path.replace('/admin/users/', '')
        return withCors(await handleAdminUserDetail(env, userId, url), corsHeaders)
      }
      if (method === 'POST' && /^\/admin\/users\/[^/]+\/block$/.test(path)) {
        await requireAdmin(request, env)
        const userId = path.replace('/admin/users/', '').replace('/block', '')
        return withCors(await handleAdminUserBlock(request, env, userId), corsHeaders)
      }
      if (method === 'GET' && path.startsWith('/admin/users/') && path.endsWith('/usage')) {
        await requireAdmin(request, env)
        const userId = path.replace('/admin/users/', '').replace('/usage', '')
        const days = clampNumber(Number(url.searchParams.get('days') || '7'), 1, 90)
        const usage = await queryUserUsage(env.DB, userId, days)
        return json({ usage }, 200, corsHeaders)
      }
      if (method === 'GET' && path === '/admin/dashboard') {
        await requireAdmin(request, env)
        const days = clampNumber(Number(url.searchParams.get('days') || '30'), 1, 365)
        const data = await getAdminDashboard(env.DB, days)
        return json({ days, ...data }, 200, corsHeaders)
      }
      if (method === 'GET' && path === '/admin/issues') {
        await requireAdmin(request, env)
        return withCors(await handleAdminIssueList(env), corsHeaders)
      }
      if (method === 'GET' && /^\/admin\/issues\/[^/]+$/.test(path)) {
        await requireAdmin(request, env)
        const issueId = path.replace('/admin/issues/', '')
        return withCors(await handleAdminIssueDetail(env, issueId), corsHeaders)
      }
      if (method === 'POST' && /^\/admin\/issues\/[^/]+\/visibility$/.test(path)) {
        await requireAdmin(request, env)
        const issueId = path.replace('/admin/issues/', '').replace('/visibility', '')
        return withCors(await handleAdminIssueVisibilityUpdate(request, env, issueId), corsHeaders)
      }
      if (method === 'POST' && /^\/admin\/issues\/[^/]+\/comments$/.test(path)) {
        await requireAdmin(request, env)
        const issueId = path.replace('/admin/issues/', '').replace('/comments', '')
        return withCors(await handleAdminIssueCommentCreate(request, env, issueId), corsHeaders)
      }

      if (path.startsWith('/v1/')) {
        return withCors(await proxyModelApi(request, env, path), corsHeaders)
      }

      return json(
        {
          error: 'Not Found',
          routes: [
            'POST /auth/register',
            'POST /auth/login',
            'POST /auth/password-reset',
            'GET /auth/me',
            'GET /auth/membership',
            'POST /auth/membership/upgrade',
            'POST /auth/membership/redeem',
            'POST /auth/redeem',
            'GET /auth/api-keys',
            'POST /auth/api-keys',
            'POST /auth/api-keys/:id/revoke',
            'GET /auth/usage',
            'GET /issues',
            'POST /issues',
            'GET /issues/:id',
            'POST /issues/:id/comments',
            'POST /admin/login',
            'GET /admin/users (admin)',
            'GET /admin/users/:id (admin)',
            'POST /admin/users/:id/block (admin)',
            'GET /admin/users/:id/usage (admin)',
            'GET /admin/dashboard (admin)',
            'GET /admin/issues (admin)',
            'GET /admin/issues/:id (admin)',
            'POST /admin/issues/:id/visibility (admin)',
            'POST /admin/issues/:id/comments (admin)',
            'GET /health',
            '/v1/*'
          ]
        },
        404,
        corsHeaders
      )
    } catch (error) {
      return withCors(handleError(error), corsHeaders)
    }
  }
}

async function handleRegister(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ email?: string; password?: string }>(request)
  const email = normalizeEmail(body?.email)
  const password = body?.password || ''

  if (!email || !isValidEmail(email)) {
    throw httpError(400, '邮箱格式不正确')
  }
  if (password.length < 8) {
    throw httpError(400, '密码至少 8 位')
  }

  const existing = await env.DB
    .prepare('SELECT id FROM users WHERE email = ? LIMIT 1')
    .bind(email)
    .first<{ id: string }>()
  if (existing?.id) {
    throw httpError(409, '该邮箱已注册')
  }

  const uid = crypto.randomUUID()
  const passwordHash = await hashPassword(password)
  await env.DB
    .prepare(
      `INSERT INTO users (id, email, password_hash, created_at)
       VALUES (?, ?, ?, ?)`
    )
    .bind(uid, email, passwordHash, nowIso())
    .run()

  await ensureMembershipRow(env.DB, uid)
  const created = await createUserApiKey(env.DB, uid, '默认密钥')
  const membership = await getUserMembership(env.DB, uid)
  const token = await signUserToken({ uid, email }, env.JWT_SECRET)

  return json(
    {
      user: { id: uid, email },
      token,
      apiKey: created.safeKey,
      membership,
      note: '请保存 apiKey，后续调用 /v1/* 需要使用。'
    },
    201
  )
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ email?: string; password?: string }>(request)
  const email = normalizeEmail(body?.email)
  const password = body?.password || ''

  if (!email || !password) {
    throw httpError(400, '邮箱或密码不能为空')
  }

  const user = await env.DB
    .prepare('SELECT id, email, password_hash FROM users WHERE email = ? LIMIT 1')
    .bind(email)
    .first<{ id: string; email: string; password_hash: string }>()

  if (!user) {
    throw httpError(401, '邮箱或密码错误')
  }

  const ok = await verifyPassword(password, user.password_hash)
  if (!ok) {
    throw httpError(401, '邮箱或密码错误')
  }

  await ensureMembershipRow(env.DB, user.id)
  const membership = await getUserMembership(env.DB, user.id)
  const token = await signUserToken({ uid: user.id, email: user.email }, env.JWT_SECRET)
  return json({ user: { id: user.id, email: user.email }, token, membership }, 200)
}

async function handlePasswordReset(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ email?: string; password?: string }>(request)
  const email = normalizeEmail(body?.email)
  const password = body?.password || ''

  if (!email || !isValidEmail(email)) {
    throw httpError(400, '邮箱格式不正确')
  }
  if (password.length < 8) {
    throw httpError(400, '密码至少 8 位')
  }

  const user = await env.DB
    .prepare('SELECT id FROM users WHERE email = ? LIMIT 1')
    .bind(email)
    .first<{ id: string }>()
  if (!user?.id) {
    throw httpError(404, '该邮箱尚未注册')
  }

  const passwordHash = await hashPassword(password)
  await env.DB
    .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .bind(passwordHash, user.id)
    .run()

  return json({ ok: true, message: '密码已重置，请使用新密码登录' }, 200)
}

async function handleMembershipUpgrade(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const body = await readJson<{
    plan?: MemberTier
    source?: 'purchase' | 'redeem'
    code?: string
    durationDays?: number
    amountCents?: number
  }>(request)

  const source = body.source === 'redeem' ? 'redeem' : 'purchase'
  const plan: MemberTier = body.plan === 'pro' ? 'pro' : body.plan === 'plus' ? 'plus' : 'normal'
  const amountCents = Math.max(0, Number(body.amountCents ?? (plan === 'pro' ? 9900 : plan === 'plus' ? 3900 : 0)))
  let durationDays = clampNumber(Number(body.durationDays ?? (source === 'redeem' ? 7 : 30)), 1, 3650)

  if (source === 'redeem') {
    const code = String(body.code || '').trim().toUpperCase()
    if (!code) throw httpError(400, '请输入兑换码')
    if (!WEEKLY_REDEEM_CODES.has(code)) throw httpError(400, '兑换码无效')
    const used = await env.DB
      .prepare(`SELECT id FROM membership_recharges WHERE code = ? AND status = 'success' LIMIT 1`)
      .bind(code)
      .first<{ id: string }>()
    if (used?.id) throw httpError(409, '该兑换码已被使用')
    durationDays = 7
    await applyMembershipChange(env.DB, user.uid, 'plus', durationDays, {
      source,
      amountCents: 0,
      code
    })
  } else {
    if (plan === 'normal') throw httpError(400, '请选择 Plus 或 Pro 套餐')
    await applyMembershipChange(env.DB, user.uid, plan, durationDays, {
      source,
      amountCents
    })
  }

  const membership = await getUserMembership(env.DB, user.uid)
  return json({ ok: true, membership }, 200)
}

async function handleAdminLogin(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ adminToken?: string }>(request)
  const token = String(body.adminToken || '').trim()
  if (!env.ADMIN_TOKEN) throw httpError(403, 'ADMIN_TOKEN 未配置')
  if (!token || token !== env.ADMIN_TOKEN) throw httpError(403, '管理员凭证错误')
  const adminSession = await signAdminToken(env.JWT_SECRET)
  return json({ ok: true, token: adminSession, role: 'admin' }, 200)
}

async function handleAdminUserBlock(request: Request, env: Env, userId: string): Promise<Response> {
  const exists = await env.DB.prepare('SELECT id FROM users WHERE id = ? LIMIT 1').bind(userId).first<{ id: string }>()
  if (!exists?.id) throw httpError(404, '用户不存在')

  const body = await readJson<{ blocked?: boolean; message?: string }>(request)
  const blocked = Boolean(body.blocked)
  const message = blocked ? String(body.message || '').trim() : ''
  await env.DB
    .prepare('UPDATE users SET blocked = ?, blocked_message = ?, blocked_updated_at = ? WHERE id = ?')
    .bind(blocked ? 1 : 0, message, nowIso(), userId)
    .run()

  return json({ ok: true, blocked, message }, 200)
}

async function handleAdminUserDetail(env: Env, userId: string, url: URL): Promise<Response> {
  const days = clampNumber(Number(url.searchParams.get('days') || '30'), 1, 365)
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const user = await env.DB
    .prepare(
      `SELECT
        u.id,
        u.email,
        u.created_at,
        COALESCE(u.blocked, 0) AS blocked,
        COALESCE(u.blocked_message, '') AS blocked_message,
        u.blocked_updated_at,
        COALESCE(m.tier, 'normal') AS member_tier,
        COALESCE(m.expires_at, '') AS membership_expires_at
       FROM users u
       LEFT JOIN memberships m ON m.user_id = u.id
       WHERE u.id = ?
       LIMIT 1`
    )
    .bind(userId)
    .first<any>()
  if (!user?.id) throw httpError(404, '用户不存在')

  const usageSummary = await env.DB
    .prepare(
      `SELECT
        COUNT(*) AS total_requests,
        COALESCE(SUM(total_tokens), 0) AS total_tokens,
        COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
        COALESCE(SUM(completion_tokens), 0) AS completion_tokens
       FROM usage_logs
       WHERE user_id = ? AND created_at >= ?`
    )
    .bind(userId, since)
    .first<any>()

  const usageHistory = await env.DB
    .prepare(
      `SELECT
        id,
        endpoint,
        model,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        status_code,
        error_text,
        request_id,
        latency_ms,
        created_at
       FROM usage_logs
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 200`
    )
    .bind(userId)
    .all()

  const rechargeHistory = await env.DB
    .prepare(
      `SELECT
        id,
        plan,
        source,
        amount_cents,
        duration_days,
        code,
        status,
        created_at
       FROM membership_recharges
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 200`
    )
    .bind(userId)
    .all()

  const deviceHistory = await env.DB
    .prepare(
      `SELECT
        ip_address,
        mac_address,
        first_seen_at,
        last_seen_at,
        hit_count
       FROM user_device_history
       WHERE user_id = ?
       ORDER BY last_seen_at DESC
       LIMIT 200`
    )
    .bind(userId)
    .all()

  const paidSummary = await env.DB
    .prepare(
      `SELECT
        COUNT(*) AS paid_recharge_count,
        COALESCE(SUM(amount_cents), 0) AS paid_amount_cents
       FROM membership_recharges
       WHERE user_id = ? AND status = 'success' AND source = 'purchase'`
    )
    .bind(userId)
    .first<any>()

  return json(
    {
      days,
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.created_at,
        blocked: Boolean(Number(user.blocked || 0)),
        blockedMessage: String(user.blocked_message || ''),
        blockedUpdatedAt: String(user.blocked_updated_at || ''),
        memberTier: user.member_tier === 'plus' || user.member_tier === 'pro' ? user.member_tier : 'normal',
        membershipExpiresAt: String(user.membership_expires_at || '')
      },
      summary: {
        requestsInRange: Number(usageSummary?.total_requests || 0),
        tokensInRange: Number(usageSummary?.total_tokens || 0),
        promptTokensInRange: Number(usageSummary?.prompt_tokens || 0),
        completionTokensInRange: Number(usageSummary?.completion_tokens || 0),
        paidRechargeCount: Number(paidSummary?.paid_recharge_count || 0),
        paidAmountCents: Number(paidSummary?.paid_amount_cents || 0)
      },
      usageHistory: usageHistory.results ?? [],
      rechargeHistory: rechargeHistory.results ?? [],
      deviceHistory: deviceHistory.results ?? []
    },
    200
  )
}

async function handleUserIssuesList(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env, { allowBlocked: true })
  const rows = await env.DB
    .prepare(
      `SELECT
        i.id,
        i.user_id,
        i.user_email,
        i.title,
        i.content,
        i.image_urls_json,
        i.visibility,
        i.status,
        i.created_at,
        i.updated_at,
        COALESCE((SELECT COUNT(*) FROM issue_comments c WHERE c.issue_id = i.id), 0) AS reply_count,
        COALESCE((SELECT MAX(c.created_at) FROM issue_comments c WHERE c.issue_id = i.id), '') AS last_reply_at
       FROM issues i
       WHERE i.user_id = ? OR i.visibility = 'public'
       ORDER BY i.updated_at DESC
       LIMIT 500`
    )
    .bind(user.uid)
    .all()

  const items = (rows.results || []).map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    title: row.title,
    content: row.content,
    images: parseIssueImageJson(row.image_urls_json),
    visibility: row.visibility === 'public' ? 'public' : 'private',
    status: row.status || 'open',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    replyCount: Number(row.reply_count || 0),
    lastReplyAt: String(row.last_reply_at || '')
  }))

  return json({ issues: items }, 200)
}

async function handleCreateIssue(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env, { allowBlocked: true })
  const body = await readJson<{ title?: string; content?: string; images?: string[] }>(request)
  const title = String(body.title || '').trim()
  const content = String(body.content || '').trim()
  const images = sanitizeIssueImages(body.images)

  if (!title) throw httpError(400, '请填写标题')
  if (!content) throw httpError(400, '请填写问题描述')
  if (title.length > 140) throw httpError(400, '标题长度不能超过 140 字')
  if (content.length > 12000) throw httpError(400, '问题描述过长')

  const createdAt = nowIso()
  const issueId = crypto.randomUUID()
  await env.DB
    .prepare(
      `INSERT INTO issues (
        id, user_id, user_email, title, content, image_urls_json, visibility, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'private', 'open', ?, ?)`
    )
    .bind(issueId, user.uid, user.email, title, content, JSON.stringify(images), createdAt, createdAt)
    .run()

  return json(
    {
      ok: true,
      issue: {
        id: issueId,
        title,
        content,
        images,
        visibility: 'private',
        status: 'open',
        createdAt,
        updatedAt: createdAt
      }
    },
    201
  )
}

async function handleIssueDetail(request: Request, env: Env, issueId: string): Promise<Response> {
  const user = await requireUser(request, env, { allowBlocked: true })
  const issue = await env.DB
    .prepare(
      `SELECT
        id, user_id, user_email, title, content, image_urls_json, visibility, status, created_at, updated_at
       FROM issues
       WHERE id = ?
       LIMIT 1`
    )
    .bind(issueId)
    .first<any>()
  if (!issue?.id) throw httpError(404, '问题不存在')

  const isOwner = String(issue.user_id || '') === user.uid
  const isPublic = String(issue.visibility || '') === 'public'
  if (!isOwner && !isPublic) throw httpError(403, '该问题暂未公开')

  const comments = await queryIssueComments(env.DB, issueId)

  return json(
    {
      issue: {
        id: issue.id,
        userId: issue.user_id,
        userEmail: issue.user_email,
        title: issue.title,
        content: issue.content,
        images: parseIssueImageJson(issue.image_urls_json),
        visibility: isPublic ? 'public' : 'private',
        status: issue.status || 'open',
        createdAt: issue.created_at,
        updatedAt: issue.updated_at
      },
      canReply: isOwner || isPublic,
      comments: comments.map((row: any) => ({
        id: row.id,
        issueId: row.issue_id,
        userId: row.user_id,
        userEmail: row.user_email,
        content: row.content,
        images: parseIssueImageJson(row.image_urls_json),
        createdAt: row.created_at,
        parentCommentId: String(row.parent_comment_id || '')
      }))
    },
    200
  )
}

async function handleIssueCommentCreate(request: Request, env: Env, issueId: string): Promise<Response> {
  const user = await requireUser(request, env, { allowBlocked: true })
  const issue = await env.DB
    .prepare(`SELECT id, user_id, visibility FROM issues WHERE id = ? LIMIT 1`)
    .bind(issueId)
    .first<{ id: string; user_id: string; visibility: string }>()
  if (!issue?.id) throw httpError(404, '问题不存在')

  const isOwner = issue.user_id === user.uid
  const isPublic = issue.visibility === 'public'
  if (!isOwner && !isPublic) throw httpError(403, '该问题暂未公开，无法回复')

  const body = await readJson<{ content?: string; images?: string[]; parentCommentId?: string }>(request)
  const content = String(body.content || '').trim()
  if (!content) throw httpError(400, '回复内容不能为空')
  if (content.length > 6000) throw httpError(400, '回复内容过长')
  const images = sanitizeIssueImages(body.images)
  const parentCommentId = String(body.parentCommentId || '').trim()

  if (parentCommentId) {
    const parent = await env.DB
      .prepare('SELECT id FROM issue_comments WHERE id = ? AND issue_id = ? LIMIT 1')
      .bind(parentCommentId, issueId)
      .first<{ id: string }>()
    if (!parent?.id) throw httpError(404, '回复目标不存在')
  }

  const createdAt = nowIso()
  const commentId = crypto.randomUUID()
  const insertWithParent = await env.DB
    .prepare(
      `INSERT INTO issue_comments (
        id, issue_id, user_id, user_email, content, image_urls_json, created_at, parent_comment_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(commentId, issueId, user.uid, user.email, content, JSON.stringify(images), createdAt, parentCommentId || null)
    .run()
    .catch(() => null)

  if (!insertWithParent?.success) {
    await env.DB
      .prepare(
        `INSERT INTO issue_comments (
          id, issue_id, user_id, user_email, content, image_urls_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(commentId, issueId, user.uid, user.email, content, JSON.stringify(images), createdAt)
      .run()
  }

  await env.DB.prepare(`UPDATE issues SET updated_at = ? WHERE id = ?`).bind(createdAt, issueId).run()

  return json(
    {
      ok: true,
      comment: {
        id: commentId,
        issueId,
        userId: user.uid,
        userEmail: user.email,
        content,
        images,
        createdAt,
        parentCommentId
      }
    },
    201
  )
}

async function handleAdminIssueList(env: Env): Promise<Response> {
  const rows = await env.DB
    .prepare(
      `SELECT
        i.id,
        i.user_id,
        i.user_email,
        i.title,
        i.content,
        i.image_urls_json,
        i.visibility,
        i.status,
        i.created_at,
        i.updated_at,
        COALESCE((SELECT COUNT(*) FROM issue_comments c WHERE c.issue_id = i.id), 0) AS reply_count
       FROM issues i
       ORDER BY i.updated_at DESC
       LIMIT 1000`
    )
    .all()

  return json(
    {
      issues: (rows.results || []).map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        userEmail: row.user_email,
        title: row.title,
        content: row.content,
        images: parseIssueImageJson(row.image_urls_json),
        visibility: row.visibility === 'public' ? 'public' : 'private',
        status: row.status || 'open',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        replyCount: Number(row.reply_count || 0)
      }))
    },
    200
  )
}

async function handleAdminIssueDetail(env: Env, issueId: string): Promise<Response> {
  const issue = await env.DB
    .prepare(
      `SELECT
        id, user_id, user_email, title, content, image_urls_json, visibility, status, created_at, updated_at
       FROM issues
       WHERE id = ?
       LIMIT 1`
    )
    .bind(issueId)
    .first<any>()
  if (!issue?.id) throw httpError(404, '问题不存在')

  const comments = await queryIssueComments(env.DB, issueId)

  return json(
    {
      issue: {
        id: issue.id,
        userId: issue.user_id,
        userEmail: issue.user_email,
        title: issue.title,
        content: issue.content,
        images: parseIssueImageJson(issue.image_urls_json),
        visibility: issue.visibility === 'public' ? 'public' : 'private',
        status: issue.status || 'open',
        createdAt: issue.created_at,
        updatedAt: issue.updated_at
      },
      comments: comments.map((row: any) => ({
        id: row.id,
        issueId: row.issue_id,
        userId: row.user_id,
        userEmail: row.user_email,
        content: row.content,
        images: parseIssueImageJson(row.image_urls_json),
        createdAt: row.created_at,
        parentCommentId: String(row.parent_comment_id || '')
      }))
    },
    200
  )
}

async function handleAdminIssueVisibilityUpdate(request: Request, env: Env, issueId: string): Promise<Response> {
  const issue = await env.DB.prepare('SELECT id FROM issues WHERE id = ? LIMIT 1').bind(issueId).first<{ id: string }>()
  if (!issue?.id) throw httpError(404, '问题不存在')
  const body = await readJson<{ isPublic?: boolean }>(request)
  const visibility = body.isPublic ? 'public' : 'private'
  await env.DB.prepare('UPDATE issues SET visibility = ?, updated_at = ? WHERE id = ?').bind(visibility, nowIso(), issueId).run()
  return json({ ok: true, visibility }, 200)
}

async function ensureAdminIssueUser(db: D1Database): Promise<void> {
  await db
    .prepare(
      `INSERT INTO users (id, email, password_hash, created_at)
       VALUES (?, ?, '__system__', ?)
       ON CONFLICT(id) DO NOTHING`
    )
    .bind(ADMIN_ISSUE_USER_ID, ADMIN_ISSUE_USER_EMAIL, nowIso())
    .run()
}

async function handleAdminIssueCommentCreate(request: Request, env: Env, issueId: string): Promise<Response> {
  const issue = await env.DB
    .prepare('SELECT id FROM issues WHERE id = ? LIMIT 1')
    .bind(issueId)
    .first<{ id: string }>()
  if (!issue?.id) throw httpError(404, '问题不存在')

  const body = await readJson<{ content?: string; images?: string[]; parentCommentId?: string }>(request)
  const content = String(body.content || '').trim()
  if (!content) throw httpError(400, '回复内容不能为空')
  if (content.length > 6000) throw httpError(400, '回复内容过长')
  const images = sanitizeIssueImages(body.images)
  const parentCommentId = String(body.parentCommentId || '').trim()

  if (parentCommentId) {
    const parent = await env.DB
      .prepare('SELECT id FROM issue_comments WHERE id = ? AND issue_id = ? LIMIT 1')
      .bind(parentCommentId, issueId)
      .first<{ id: string }>()
    if (!parent?.id) throw httpError(404, '回复目标不存在')
  }

  await ensureAdminIssueUser(env.DB)
  const createdAt = nowIso()
  const commentId = crypto.randomUUID()
  const insertWithParent = await env.DB
    .prepare(
      `INSERT INTO issue_comments (
        id, issue_id, user_id, user_email, content, image_urls_json, created_at, parent_comment_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      commentId,
      issueId,
      ADMIN_ISSUE_USER_ID,
      '管理员',
      content,
      JSON.stringify(images),
      createdAt,
      parentCommentId || null
    )
    .run()
    .catch(() => null)

  if (!insertWithParent?.success) {
    await env.DB
      .prepare(
        `INSERT INTO issue_comments (
          id, issue_id, user_id, user_email, content, image_urls_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(commentId, issueId, ADMIN_ISSUE_USER_ID, '管理员', content, JSON.stringify(images), createdAt)
      .run()
  }

  await env.DB.prepare('UPDATE issues SET updated_at = ? WHERE id = ?').bind(createdAt, issueId).run()

  return json(
    {
      ok: true,
      comment: {
        id: commentId,
        issueId,
        userId: ADMIN_ISSUE_USER_ID,
        userEmail: '管理员',
        content,
        images,
        createdAt,
        parentCommentId
      }
    },
    201
  )
}

async function proxyModelApi(request: Request, env: Env, path: string): Promise<Response> {
  const apiKeyRaw = extractApiKey(request)
  if (!apiKeyRaw) {
    throw httpError(401, '缺少用户 API Key')
  }

  const apiKeyHash = await sha256Hex(apiKeyRaw)
  const apiKey = await env.DB
    .prepare(
      `SELECT k.id, k.user_id, k.revoked_at
       FROM api_keys k
       WHERE k.key_hash = ?
       LIMIT 1`
    )
    .bind(apiKeyHash)
    .first<{ id: string; user_id: string; revoked_at: string | null }>()

  if (!apiKey || apiKey.revoked_at) {
    throw httpError(401, '无效的用户 API Key')
  }

  const requestAt = nowIso()
  await writeUserDeviceHistory(env.DB, {
    userId: apiKey.user_id,
    ipAddress: readClientIp(request),
    macAddress: normalizeClientMac(request.headers.get('x-client-mac') || ''),
    requestAt
  })

  const blockState = await getUserBlockState(env.DB, apiKey.user_id)
  if (blockState.blocked) {
    throw httpError(403, blockState.message || DEFAULT_BLOCKED_MESSAGE)
  }

  const upstreamPath = path.startsWith('/v1/') ? path.slice(3) : path
  const isModelsRequest = request.method.toUpperCase() === 'GET' && upstreamPath === '/models'

  const membership = await getUserMembership(env.DB, apiKey.user_id)
  const paid = (membership.tier === 'plus' || membership.tier === 'pro') && !membership.isExpired
  if (!paid && !isModelsRequest) {
    throw httpError(403, '当前非会员，无法使用在线模型')
  }

  const baseUrl = (env.DEEPSEEK_BASE_URL || env.SCNET_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '')
  const upstreamUrl = `${baseUrl}${upstreamPath}`
  const upstreamApiKey = (env.DEEPSEEK_API_KEY || env.SCNET_API_KEY || '').trim()
  if (!upstreamApiKey) {
    throw httpError(500, '未配置上游模型密钥（DEEPSEEK_API_KEY）')
  }

  const headers = new Headers()
  headers.set('Authorization', `Bearer ${upstreamApiKey}`)
  headers.set('Content-Type', 'application/json')
  headers.set('Accept', 'application/json')

  const model = await tryReadModelFromBody(request)
  const reqInit: RequestInit = { method: request.method, headers }
  if (!['GET', 'HEAD'].includes(request.method.toUpperCase())) {
    reqInit.body = await request.text()
  }

  const started = Date.now()
  const upstreamResp = await fetch(upstreamUrl, reqInit)
  const responseClone = upstreamResp.clone()
  const { promptTokens, completionTokens, totalTokens, errorText } =
    await readUsageFromResponse(responseClone)

  await writeUsageLog(env.DB, {
    id: crypto.randomUUID(),
    userId: apiKey.user_id,
    apiKeyId: apiKey.id,
    endpoint: path,
    model: model || null,
    promptTokens,
    completionTokens,
    totalTokens,
    statusCode: upstreamResp.status,
    errorText,
    requestId: upstreamResp.headers.get('x-request-id'),
    latencyMs: Date.now() - started
  })

  await env.DB.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').bind(nowIso(), apiKey.id).run()
  return upstreamResp
}
async function requireAdmin(request: Request, env: Env): Promise<void> {
  if (!env.ADMIN_TOKEN) throw httpError(403, 'ADMIN_TOKEN 未配置')
  const xAdmin = (request.headers.get('x-admin-token') || '').trim()
  if (xAdmin && xAdmin === env.ADMIN_TOKEN) return

  const bearer = extractBearerToken(request)
  if (!bearer) throw httpError(403, '无管理员权限')
  const payload = await verifyAdminToken(bearer, env.JWT_SECRET)
  if (!payload || payload.role !== 'admin') throw httpError(403, '无管理员权限')
}

async function requireUser(request: Request, env: Env, options?: RequireUserOptions): Promise<UserTokenPayload> {
  const token = extractBearerToken(request)
  if (!token) throw httpError(401, '请先登录')
  const payload = await verifyUserToken(token, env.JWT_SECRET)
  if (!payload) throw httpError(401, '登录态已失效')
  if (!options?.allowBlocked) {
    const blockState = await getUserBlockState(env.DB, payload.uid)
    if (blockState.blocked) {
      throw httpError(403, blockState.message || DEFAULT_BLOCKED_MESSAGE)
    }
  }
  return payload
}

async function getUserBlockState(db: D1Database, userId: string): Promise<{ blocked: boolean; message: string }> {
  const row = await db
    .prepare('SELECT COALESCE(blocked, 0) AS blocked, COALESCE(blocked_message, \'\') AS blocked_message FROM users WHERE id = ? LIMIT 1')
    .bind(userId)
    .first<{ blocked: number; blocked_message: string }>()
  return {
    blocked: Boolean(Number(row?.blocked || 0)),
    message: String(row?.blocked_message || '').trim() || DEFAULT_BLOCKED_MESSAGE
  }
}

function readClientIp(request: Request): string {
  const direct = String(request.headers.get('cf-connecting-ip') || '').trim()
  if (direct) return direct
  const forwarded = String(request.headers.get('x-forwarded-for') || '').trim()
  if (forwarded) return forwarded.split(',')[0].trim()
  return ''
}

function normalizeClientMac(value: string): string {
  const raw = String(value || '').trim().toUpperCase().replace(/-/g, ':')
  if (!raw) return ''
  if (/^[0-9A-F]{12}$/.test(raw)) {
    return raw.match(/.{1,2}/g)?.join(':') || ''
  }
  if (/^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$/.test(raw)) {
    return raw
  }
  return ''
}

async function queryIssueComments(db: D1Database, issueId: string): Promise<any[]> {
  const withParent = await db
    .prepare(
      `SELECT
        id, issue_id, user_id, user_email, content, image_urls_json, created_at, parent_comment_id
       FROM issue_comments
       WHERE issue_id = ?
       ORDER BY created_at ASC
       LIMIT 500`
    )
    .bind(issueId)
    .all()
    .catch(() => null)

  if (withParent?.results) {
    return withParent.results as any[]
  }

  const legacy = await db
    .prepare(
      `SELECT
        id, issue_id, user_id, user_email, content, image_urls_json, created_at
       FROM issue_comments
       WHERE issue_id = ?
       ORDER BY created_at ASC
       LIMIT 500`
    )
    .bind(issueId)
    .all()

  return (legacy.results || []).map((row: any) => ({
    ...row,
    parent_comment_id: ''
  }))
}

async function writeUserDeviceHistory(
  db: D1Database,
  payload: { userId: string; ipAddress: string; macAddress: string; requestAt: string }
): Promise<void> {
  const ip = payload.ipAddress.trim()
  const mac = payload.macAddress.trim()
  if (!ip && !mac) return
  await db
    .prepare(
      `INSERT INTO user_device_history (user_id, ip_address, mac_address, first_seen_at, last_seen_at, hit_count)
       VALUES (?, ?, ?, ?, ?, 1)
       ON CONFLICT(user_id, ip_address, mac_address) DO UPDATE SET
         last_seen_at = excluded.last_seen_at,
         hit_count = user_device_history.hit_count + 1`
    )
    .bind(payload.userId, ip, mac, payload.requestAt, payload.requestAt)
    .run()
}

async function ensureMembershipRow(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO memberships (user_id, tier, expires_at, updated_at)
       VALUES (?, 'normal', NULL, ?)
       ON CONFLICT(user_id) DO NOTHING`
    )
    .bind(userId, nowIso())
    .run()
}

async function getUserMembership(db: D1Database, userId: string): Promise<MembershipInfo> {
  await ensureMembershipRow(db, userId)
  const row = await db
    .prepare(`SELECT tier, expires_at FROM memberships WHERE user_id = ? LIMIT 1`)
    .bind(userId)
    .first<{ tier: MemberTier; expires_at: string | null }>()

  const tier: MemberTier =
    row?.tier === 'plus' || row?.tier === 'pro' || row?.tier === 'normal' ? row.tier : 'normal'
  const expiresAt = row?.expires_at || ''
  const expiresMs = expiresAt ? new Date(expiresAt).getTime() : NaN
  const isExpired = tier !== 'normal' && Number.isFinite(expiresMs) && expiresMs < Date.now()
  return { tier, expiresAt, isExpired }
}

async function applyMembershipChange(
  db: D1Database,
  userId: string,
  tier: MemberTier,
  durationDays: number,
  meta: { source: 'purchase' | 'redeem'; amountCents: number; code?: string }
): Promise<void> {
  const current = await getUserMembership(db, userId)
  const now = Date.now()
  const currentMs = current.expiresAt ? new Date(current.expiresAt).getTime() : NaN
  const baseMs = Number.isFinite(currentMs) && currentMs > now ? currentMs : now
  const expiresAt = new Date(baseMs + durationDays * 86400000).toISOString()
  const createdAt = nowIso()

  await db
    .prepare(
      `INSERT INTO memberships (user_id, tier, expires_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         tier = excluded.tier,
         expires_at = excluded.expires_at,
         updated_at = excluded.updated_at`
    )
    .bind(userId, tier, expiresAt, createdAt)
    .run()

  await db
    .prepare(
      `INSERT INTO membership_recharges
       (id, user_id, plan, source, amount_cents, duration_days, code, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'success', ?)`
    )
    .bind(
      crypto.randomUUID(),
      userId,
      tier,
      meta.source,
      meta.amountCents,
      durationDays,
      meta.code || null,
      createdAt
    )
    .run()
}

async function getAdminDashboard(db: D1Database, days: number): Promise<Record<string, JsonValue>> {
  const since = new Date(Date.now() - days * 86400000).toISOString()

  const users = await db
    .prepare(
      `SELECT
        u.id,
        u.email,
        u.created_at,
        COALESCE(m.tier, 'normal') AS member_tier,
        COALESCE(m.expires_at, '') AS membership_expires_at,
        COALESCE(ut.total_requests, 0) AS total_requests,
        COALESCE(ut.total_tokens, 0) AS total_tokens,
        COALESCE(ud.days_requests, 0) AS days_requests,
        COALESCE(ud.days_tokens, 0) AS days_tokens,
        ut.last_used_at,
        COALESCE(rc.recharge_count, 0) AS recharge_count,
        COALESCE(rc.recharge_amount_cents, 0) AS recharge_amount_cents,
        rc.last_recharge_at,
        rr.redeem_duration_days,
        rr.redeem_code
       FROM users u
       LEFT JOIN memberships m ON m.user_id = u.id
       LEFT JOIN (
         SELECT user_id, COUNT(*) AS total_requests, COALESCE(SUM(total_tokens), 0) AS total_tokens, MAX(created_at) AS last_used_at
         FROM usage_logs
         GROUP BY user_id
       ) ut ON ut.user_id = u.id
       LEFT JOIN (
         SELECT user_id, COUNT(*) AS days_requests, COALESCE(SUM(total_tokens), 0) AS days_tokens
         FROM usage_logs
         WHERE created_at >= ?
         GROUP BY user_id
       ) ud ON ud.user_id = u.id
       LEFT JOIN (
         SELECT user_id, COUNT(*) AS recharge_count, COALESCE(SUM(amount_cents), 0) AS recharge_amount_cents, MAX(created_at) AS last_recharge_at
         FROM membership_recharges
         WHERE status = 'success' AND source = 'purchase'
         GROUP BY user_id
       ) rc ON rc.user_id = u.id
       LEFT JOIN (
         SELECT mr.user_id, mr.duration_days AS redeem_duration_days, mr.code AS redeem_code
         FROM membership_recharges mr
         INNER JOIN (
           SELECT user_id, MAX(created_at) AS latest_redeem_at
           FROM membership_recharges
           WHERE status = 'success' AND source = 'redeem'
           GROUP BY user_id
         ) x ON x.user_id = mr.user_id AND x.latest_redeem_at = mr.created_at
       ) rr ON rr.user_id = u.id
       ORDER BY u.created_at DESC
       LIMIT 1000`
    )
    .bind(since)
    .all()

  const totals = await db
    .prepare(
      `SELECT
        COUNT(*) AS total_users,
        SUM(CASE WHEN m.tier = 'plus' THEN 1 ELSE 0 END) AS plus_users,
        SUM(CASE WHEN m.tier = 'pro' THEN 1 ELSE 0 END) AS pro_users,
        SUM(CASE WHEN m.tier = 'normal' OR m.tier IS NULL THEN 1 ELSE 0 END) AS normal_users
       FROM users u
       LEFT JOIN memberships m ON m.user_id = u.id`
    )
    .first<{ total_users: number; plus_users: number; pro_users: number; normal_users: number }>()

  const rechargeStats = await db
    .prepare(
      `SELECT
        COUNT(*) AS recharge_count,
        COALESCE(SUM(amount_cents), 0) AS recharge_amount_cents
       FROM membership_recharges
       WHERE status = 'success' AND source = 'purchase' AND created_at >= ?`
    )
    .bind(since)
    .first<{ recharge_count: number; recharge_amount_cents: number }>()

  const normalizedUsers = (users.results || []).map((row: any) => {
    const tier = row.member_tier === 'plus' || row.member_tier === 'pro' ? row.member_tier : 'normal'
    const expiresMs = row.membership_expires_at ? new Date(row.membership_expires_at).getTime() : NaN
    const isExpired = tier !== 'normal' && Number.isFinite(expiresMs) && expiresMs < Date.now()
    const redeemDurationDays = Number(row.redeem_duration_days || 0)
    const redeemCode = String(row.redeem_code || '').trim().toUpperCase()
    let redeemCardLabel = ''
    if (redeemDurationDays > 0) {
      if (redeemCode.includes('WEEK')) {
        redeemCardLabel = '周卡'
      } else if (redeemDurationDays === 7) {
        redeemCardLabel = '7日卡'
      } else if (redeemDurationDays >= 28 && redeemDurationDays <= 31) {
        redeemCardLabel = '月卡'
      }
    }
    return {
      id: row.id,
      email: row.email,
      createdAt: row.created_at,
      memberTier: tier,
      membershipExpiresAt: row.membership_expires_at || '',
      isExpired,
      isPaid: (tier === 'plus' || tier === 'pro') && !isExpired,
      totalRequests: Number(row.total_requests || 0),
      daysRequests: Number(row.days_requests || 0),
      frequencyPerDay: Number((Number(row.days_requests || 0) / days).toFixed(2)),
      totalTokens: Number(row.total_tokens || 0),
      daysTokens: Number(row.days_tokens || 0),
      lastUsedAt: row.last_used_at || '',
      rechargeCount: Number(row.recharge_count || 0),
      rechargeAmountCents: Number(row.recharge_amount_cents || 0),
      lastRechargeAt: row.last_recharge_at || '',
      redeemCardLabel
    }
  })

  return {
    summary: {
      totalUsers: Number(totals?.total_users || 0),
      normalUsers: Number(totals?.normal_users || 0),
      plusUsers: Number(totals?.plus_users || 0),
      proUsers: Number(totals?.pro_users || 0),
      rechargeCountInRange: Number(rechargeStats?.recharge_count || 0),
      rechargeAmountInRangeCents: Number(rechargeStats?.recharge_amount_cents || 0)
    },
    users: normalizedUsers
  }
}

async function createUserApiKey(
  db: D1Database,
  userId: string,
  name: string
): Promise<{ apiKey: { id: string; name: string; prefix: string; createdAt: string }; safeKey: string }> {
  const raw = `${API_KEY_PREFIX}${toBase64Url(randomBytes(24))}`
  const hash = await sha256Hex(raw)
  const id = crypto.randomUUID()
  const createdAt = nowIso()
  const prefix = raw.slice(0, 12)

  await db
    .prepare(
      `INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, userId, name, hash, prefix, createdAt)
    .run()

  return {
    apiKey: { id, name, prefix, createdAt },
    safeKey: raw
  }
}

async function listUserApiKeys(db: D1Database, userId: string): Promise<Array<Record<string, JsonValue>>> {
  const rows = await db
    .prepare(
      `SELECT id, name, key_prefix, created_at, last_used_at, revoked_at
       FROM api_keys
       WHERE user_id = ?
       ORDER BY created_at DESC`
    )
    .bind(userId)
    .all()

  return (rows.results || []).map((item: any) => ({
    id: item.id,
    name: item.name,
    prefix: item.key_prefix,
    createdAt: item.created_at,
    lastUsedAt: item.last_used_at,
    revokedAt: item.revoked_at
  }))
}

async function revokeUserApiKey(db: D1Database, userId: string, keyId: string): Promise<void> {
  const exists = await db
    .prepare('SELECT id FROM api_keys WHERE id = ? AND user_id = ? LIMIT 1')
    .bind(keyId, userId)
    .first<{ id: string }>()
  if (!exists?.id) throw httpError(404, '密钥不存在')

  await db.prepare('UPDATE api_keys SET revoked_at = ? WHERE id = ?').bind(nowIso(), keyId).run()
}

async function queryUserUsage(db: D1Database, userId: string, days: number): Promise<Record<string, JsonValue>> {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const summary = await db
    .prepare(
      `SELECT
        COUNT(*) AS request_count,
        COALESCE(SUM(total_tokens), 0) AS total_tokens,
        COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
        COALESCE(SUM(completion_tokens), 0) AS completion_tokens
       FROM usage_logs
       WHERE user_id = ? AND created_at >= ?`
    )
    .bind(userId, since)
    .first<{
      request_count: number
      total_tokens: number
      prompt_tokens: number
      completion_tokens: number
    }>()

  const byModel = await db
    .prepare(
      `SELECT model, COUNT(*) AS request_count, COALESCE(SUM(total_tokens), 0) AS total_tokens
       FROM usage_logs
       WHERE user_id = ? AND created_at >= ?
       GROUP BY model
       ORDER BY total_tokens DESC`
    )
    .bind(userId, since)
    .all()

  return {
    days,
    summary: summary || { request_count: 0, total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 },
    byModel: byModel.results || []
  }
}

async function readUsageFromResponse(
  response: Response
): Promise<{ promptTokens: number; completionTokens: number; totalTokens: number; errorText: string | null }> {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    if (!response.ok) {
      const text = await response.text()
      return { promptTokens: 0, completionTokens: 0, totalTokens: 0, errorText: text.slice(0, 500) }
    }
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0, errorText: null }
  }

  const data = (await response.json()) as any
  const usage = data?.usage || {}
  const promptTokens = Number(usage.prompt_tokens || 0)
  const completionTokens = Number(usage.completion_tokens || 0)
  const totalTokens = Number(usage.total_tokens || promptTokens + completionTokens)
  let errorText: string | null = null
  if (!response.ok) {
    errorText =
      typeof data?.error?.message === 'string' ? data.error.message : JSON.stringify(data).slice(0, 500)
  }
  return { promptTokens, completionTokens, totalTokens, errorText }
}

async function tryReadModelFromBody(request: Request): Promise<string | null> {
  try {
    if (['GET', 'HEAD'].includes(request.method.toUpperCase())) return null
    const text = await request.clone().text()
    if (!text) return null
    const data = JSON.parse(text) as any
    return typeof data?.model === 'string' ? data.model : null
  } catch {
    return null
  }
}

async function writeUsageLog(
  db: D1Database,
  row: {
    id: string
    userId: string
    apiKeyId: string
    endpoint: string
    model: string | null
    promptTokens: number
    completionTokens: number
    totalTokens: number
    statusCode: number
    errorText: string | null
    requestId: string | null
    latencyMs: number
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO usage_logs (
        id, user_id, api_key_id, endpoint, model, prompt_tokens, completion_tokens, total_tokens, status_code, error_text, request_id, latency_ms, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      row.id,
      row.userId,
      row.apiKeyId,
      row.endpoint,
      row.model,
      row.promptTokens,
      row.completionTokens,
      row.totalTokens,
      row.statusCode,
      row.errorText,
      row.requestId,
      row.latencyMs,
      nowIso()
    )
    .run()
}

function extractApiKey(request: Request): string | null {
  const xApiKey = request.headers.get('x-api-key')
  if (xApiKey?.trim()) return xApiKey.trim()
  const bearer = extractBearerToken(request)
  if (bearer && bearer.startsWith(API_KEY_PREFIX)) return bearer
  return null
}

function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get('authorization') || ''
  if (!auth.toLowerCase().startsWith('bearer ')) return null
  const token = auth.slice(7).trim()
  return token || null
}

async function signUserToken(payload: { uid: string; email: string }, secret: string): Promise<string> {
  const data: UserTokenPayload = {
    uid: payload.uid,
    email: payload.email,
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600
  }
  const body = toBase64UrlFromString(JSON.stringify(data))
  const signature = await signHmac(`${USER_TOKEN_PREFIX}.${body}`, secret)
  return `${USER_TOKEN_PREFIX}.${body}.${signature}`
}

async function verifyUserToken(token: string, secret: string): Promise<UserTokenPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== USER_TOKEN_PREFIX) return null
  const [prefix, body, signature] = parts
  const expected = await signHmac(`${prefix}.${body}`, secret)
  if (!timingSafeEqual(signature, expected)) return null
  const payload = JSON.parse(fromBase64UrlToString(body)) as UserTokenPayload
  if (!payload?.uid || !payload?.email || !payload?.exp) return null
  if (payload.exp < Math.floor(Date.now() / 1000)) return null
  return payload
}

async function signAdminToken(secret: string): Promise<string> {
  const payload: AdminTokenPayload = {
    role: 'admin',
    exp: Math.floor(Date.now() / 1000) + 12 * 3600
  }
  const body = toBase64UrlFromString(JSON.stringify(payload))
  const signature = await signHmac(`${ADMIN_TOKEN_PREFIX}.${body}`, secret)
  return `${ADMIN_TOKEN_PREFIX}.${body}.${signature}`
}

async function verifyAdminToken(token: string, secret: string): Promise<AdminTokenPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== ADMIN_TOKEN_PREFIX) return null
  const [prefix, body, signature] = parts
  const expected = await signHmac(`${prefix}.${body}`, secret)
  if (!timingSafeEqual(signature, expected)) return null
  const payload = JSON.parse(fromBase64UrlToString(body)) as AdminTokenPayload
  if (payload?.role !== 'admin' || !payload.exp) return null
  if (payload.exp < Math.floor(Date.now() / 1000)) return null
  return payload
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const saltEncoded = toBase64Url(salt)
  const hash = await pbkdf2(password, salt, PASSWORD_ITERATIONS, 32)
  const hashEncoded = toBase64Url(hash)
  return `pbkdf2_sha256$${PASSWORD_ITERATIONS}$${saltEncoded}$${hashEncoded}`
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false
  const iterations = Number(parts[1])
  if (!Number.isFinite(iterations) || iterations <= 0 || iterations > PASSWORD_ITERATIONS) return false
  const salt = fromBase64Url(parts[2])
  const expected = fromBase64Url(parts[3])
  const actual = await pbkdf2(password, salt, iterations, expected.length)
  return timingSafeEqual(toBase64Url(actual), toBase64Url(expected))
}

async function pbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
  length: number
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations
    },
    keyMaterial,
    length * 8
  )
  return new Uint8Array(bits)
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function signHmac(content: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(content))
  return toBase64Url(new Uint8Array(signed))
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function toBase64UrlFromString(text: string): string {
  return toBase64Url(new TextEncoder().encode(text))
}

function fromBase64UrlToString(value: string): string {
  return new TextDecoder().decode(fromBase64Url(value))
}

function parseIssueImageJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(String(raw || '[]')) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => String(item || '').trim())
      .filter((item) => Boolean(item))
      .slice(0, 6)
  } catch {
    return []
  }
}

function sanitizeIssueImages(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const results: string[] = []
  for (const item of input) {
    const value = String(item || '').trim()
    if (!value) continue
    const isDataUrl = value.startsWith('data:image/')
    const isHttpUrl = /^https?:\/\//i.test(value)
    if (!isDataUrl && !isHttpUrl) continue
    if (value.length > 2_000_000) continue
    results.push(value)
    if (results.length >= 6) break
  }
  return results
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw httpError(400, '请求体不是合法 JSON')
  }
}

function buildCorsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers()
  const reqOrigin = request.headers.get('origin') || ''
  const allowedRaw = (env.ALLOWED_ORIGINS || '*').trim()

  if (allowedRaw === '*') {
    headers.set('Access-Control-Allow-Origin', '*')
  } else {
    const allowed = allowedRaw.split(',').map((s) => s.trim()).filter(Boolean)
    if (allowed.includes(reqOrigin)) {
      headers.set('Access-Control-Allow-Origin', reqOrigin)
      headers.set('Vary', 'Origin')
    }
  }

  headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-admin-token')
  return headers
}

function withCors(response: Response, corsHeaders: Headers): Response {
  const merged = new Headers(response.headers)
  corsHeaders.forEach((v, k) => merged.set(k, v))
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: merged
  })
}

function json(data: Record<string, JsonValue>, status = 200, headers?: Headers): Response {
  const outputHeaders = new Headers(headers)
  outputHeaders.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(data), { status, headers: outputHeaders })
}

function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number }
  err.status = status
  return err
}

function handleError(error: unknown): Response {
  const status = typeof error === 'object' && error && 'status' in error ? Number((error as any).status) || 500 : 500
  const message = error instanceof Error ? error.message : '内部错误'
  return json({ error: message }, status)
}

function normalizeEmail(email?: string): string {
  return (email || '').trim().toLowerCase()
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function nowIso(): string {
  return new Date().toISOString()
}

function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.max(min, Math.min(max, value))
}



