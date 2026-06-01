const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const fs = require('fs/promises')
const path = require('path')
const { spawn } = require('child_process')
const crypto = require('crypto')
const os = require('os')

const DEFAULT_SYSTEM_PROMPT =
  'You are a fiction writing assistant. Keep character motives consistent and return usable prose.'
const SESSION_HISTORY_LIMIT = 32
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown'])
const OFFICIAL_SKILLS_DIR = 'E:\\novelwriter\\skills'
const DEFAULT_LANGUAGE = 'zh-CN'
const PROJECTS_DIR_BASENAME = 'NovelWriter Projects'
const APP_VERSION_LABEL = 'v 1.1 bate'
const APP_DISPLAY_NAME = '瓒呯骇鍏斿瓙AI鍐欎綔'
const APP_ID = 'com.novelwriter.desktop'
const APP_ICON_PATH =
  process.platform === 'win32'
    ? path.join(__dirname, '..', 'icon', 'icon.ico')
    : path.join(__dirname, '..', 'icon', 'logo.png')
const ACTIVATION_SECRET = 'novelwriter-offline-activation-v1'
const ACTIVATION_CODE_PREFIX = 'NW'
const ACTIVATION_FREE_PROJECT_LIMIT = 1
const DEEPSEEK_OPENAI_BASE_URL = 'https://api.deepseek.com'

let mainWindow = null
let cachePath = ''
let sessionStore = { sessions: {} }
let skillsStorePath = ''
let skillsStore = { installedOfficial: [], installedCustom: [], customSkills: [] }
let appSettingsPath = ''
let appSettings = {
  language: DEFAULT_LANGUAGE,
  projectsDir: '',
  autoUpdate: true,
  autoLaunch: true,
}
let activationStorePath = ''
let activationStore = {
  activated: false,
  email: '',
  codeHash: '',
  activatedAt: '',
  boundMachineMac: '',
  mode: 'offline-v1',
}
let activationDialogPromise = null

function getDefaultProjectsDir() {
  return path.join(app.getPath('documents'), PROJECTS_DIR_BASENAME)
}

function normalizeProjectsDir(targetDir) {
  const fallback = getDefaultProjectsDir()
  const raw = String(targetDir || '').trim()
  if (!raw) return fallback
  const resolved = path.resolve(raw)
  const root = path.parse(resolved).root
  if (isSamePath(resolved, root)) {
    return path.join(root, PROJECTS_DIR_BASENAME)
  }
  return resolved
}

function normalizeAppSettings(raw) {
  const language = raw?.language === 'en-US' ? 'en-US' : DEFAULT_LANGUAGE
  const projectsDir = normalizeProjectsDir(raw?.projectsDir)
  const autoUpdate = typeof raw?.autoUpdate === 'boolean' ? raw.autoUpdate : true
  const autoLaunch = typeof raw?.autoLaunch === 'boolean' ? raw.autoLaunch : true
  return { language, projectsDir, autoUpdate, autoLaunch }
}

function isSamePath(a, b) {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
}

async function loadAppSettings() {
  try {
    const raw = await fs.readFile(appSettingsPath, 'utf8')
    appSettings = normalizeAppSettings(JSON.parse(raw))
  } catch {
    appSettings = normalizeAppSettings(null)
  }
  await fs.mkdir(appSettings.projectsDir, { recursive: true })
}

async function saveAppSettings() {
  appSettings = normalizeAppSettings(appSettings)
  await fs.mkdir(path.dirname(appSettingsPath), { recursive: true })
  await fs.writeFile(appSettingsPath, JSON.stringify(appSettings, null, 2), 'utf8')
}

function normalizeMacAddress(value) {
  const clean = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/-/g, ':')
    .replace(/[^0-9A-F:]/g, '')
  const compact = clean.replace(/:/g, '')
  if (compact.length !== 12) return ''
  if (compact === '000000000000') return ''
  return compact.match(/.{1,2}/g)?.join(':') || ''
}

function collectMachineMacAddresses() {
  const interfaces = os.networkInterfaces()
  const values = Object.values(interfaces || {}).flat()
  const macs = values
    .map((item) => normalizeMacAddress(item?.mac || ''))
    .filter(Boolean)
  return [...new Set(macs)].sort()
}

function getCurrentMachineMacAddress() {
  const [first] = collectMachineMacAddresses()
  return first || ''
}

function normalizeActivationStore(raw) {
  return {
    activated: Boolean(raw?.activated),
    email: normalizeEmail(raw?.email),
    codeHash: String(raw?.codeHash || '').trim(),
    activatedAt: String(raw?.activatedAt || '').trim(),
    boundMachineMac: normalizeMacAddress(raw?.boundMachineMac),
    mode: String(raw?.mode || 'offline-v1').trim() || 'offline-v1',
  }
}

async function loadActivationStore() {
  try {
    const raw = await fs.readFile(activationStorePath, 'utf8')
    activationStore = normalizeActivationStore(JSON.parse(raw))
  } catch {
    activationStore = normalizeActivationStore(null)
  }
  if (activationStore.activated && !activationStore.boundMachineMac) {
    activationStore.boundMachineMac = getCurrentMachineMacAddress()
    await saveActivationStore()
  }
}

async function saveActivationStore() {
  activationStore = normalizeActivationStore(activationStore)
  await fs.mkdir(path.dirname(activationStorePath), { recursive: true })
  await fs.writeFile(activationStorePath, JSON.stringify(activationStore, null, 2), 'utf8')
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeActivationCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function buildActivationCodeForEmail(email) {
  const normalizedEmail = normalizeEmail(email)
  const digest = crypto
    .createHmac('sha256', ACTIVATION_SECRET)
    .update(normalizedEmail)
    .digest('hex')
    .toUpperCase()
    .slice(0, 20)
  const groups = digest.match(/.{1,4}/g) || []
  return `${ACTIVATION_CODE_PREFIX}-${groups.join('-')}`
}

function hashActivationCode(value) {
  const normalized = normalizeActivationCode(value)
  if (!normalized) return ''
  return crypto.createHash('sha256').update(normalized).digest('hex')
}

function verifyActivationCode(email, activationCode) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) return false
  const expected = normalizeActivationCode(buildActivationCodeForEmail(normalizedEmail))
  const provided = normalizeActivationCode(activationCode)
  return expected !== '' && expected === provided
}

function isActivationBoundToCurrentMachine() {
  if (!activationStore.activated) return false
  const bound = normalizeMacAddress(activationStore.boundMachineMac)
  if (!bound) return true
  const current = getCurrentMachineMacAddress()
  return Boolean(current) && current === bound
}

function getActivationStatusPayload() {
  const currentMachineMac = getCurrentMachineMacAddress()
  const boundMachineMac = normalizeMacAddress(activationStore.boundMachineMac)
  const machineBound = isActivationBoundToCurrentMachine()
  return {
    activated: Boolean(activationStore.activated) && machineBound,
    rawActivated: Boolean(activationStore.activated),
    email: activationStore.email,
    activatedAt: activationStore.activatedAt,
    currentMachineMac,
    boundMachineMac,
    machineBound,
    mode: activationStore.mode || 'offline-v1',
    projectLimit: ACTIVATION_FREE_PROJECT_LIMIT,
    localModelAllowed: Boolean(activationStore.activated) && machineBound,
  }
}

async function activateWithLicense(_event, payload) {
  const email = normalizeEmail(payload?.email)
  const activationCode = String(payload?.activationCode || payload?.code || '').trim()
  if (!email) throw new Error('email is required')
  if (!activationCode) throw new Error('activationCode is required')
  if (!verifyActivationCode(email, activationCode)) {
    throw new Error('Invalid activation code')
  }

  activationStore = normalizeActivationStore({
    activated: true,
    email,
    codeHash: hashActivationCode(activationCode),
    activatedAt: new Date().toISOString(),
    boundMachineMac: getCurrentMachineMacAddress(),
    mode: 'offline-v1',
  })
  await saveActivationStore()
  return { ok: true, status: getActivationStatusPayload() }
}

async function unbindCurrentMachine() {
  activationStore = normalizeActivationStore({
    activated: false,
    email: '',
    codeHash: '',
    activatedAt: '',
    boundMachineMac: '',
    mode: 'offline-v1',
  })
  await saveActivationStore()
  return { ok: true, status: getActivationStatusPayload() }
}

function getActivationReasonText(featureKey) {
  if (featureKey === 'multiple-projects') {
    return 'Free mode supports one project only. Activate to create more projects.'
  }
  if (featureKey === 'local-models') {
    return 'Local models are available after activation.'
  }
  return 'This feature requires software activation.'
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildActivationDialogHtml(channel, reasonText, emailPreset) {
  const safeReason = escapeHtml(reasonText || 'This feature requires software activation.')
  const safeEmail = escapeHtml(emailPreset || '')
  const safeChannel = JSON.stringify(channel)
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Activate NovelWriter</title>
    <style>
      * { box-sizing: border-box; font-family: "Segoe UI", "PingFang SC", sans-serif; }
      body { margin: 0; background: #12161f; color: #e8eef8; }
      .wrap { padding: 20px; }
      h1 { margin: 0 0 10px; font-size: 18px; }
      p { margin: 0 0 14px; color: #9fb0c7; font-size: 13px; line-height: 1.5; }
      label { display: block; margin: 12px 0 6px; font-size: 12px; color: #a6b5cb; }
      input { width: 100%; border: 1px solid #2d3a4e; background: #0f131b; color: #f4f8ff; border-radius: 8px; padding: 10px 12px; }
      .hint { margin-top: 6px; color: #73839a; font-size: 12px; }
      .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
      button { border: 0; border-radius: 8px; padding: 9px 14px; cursor: pointer; }
      #cancel { background: #2b3445; color: #e6edf9; }
      #submit { background: #2488ff; color: #ffffff; }
      #status { min-height: 18px; margin-top: 10px; font-size: 12px; color: #ffbf69; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Activate Software</h1>
      <p>${safeReason}</p>
      <label for="email">Email</label>
      <input id="email" type="email" placeholder="name@example.com" value="${safeEmail}" />
      <label for="code">Activation Code</label>
      <input id="code" type="text" placeholder="${ACTIVATION_CODE_PREFIX}-XXXX-XXXX-XXXX-XXXX-XXXX" />
      <div class="hint">Current mode: offline activation (email + code).</div>
      <div id="status"></div>
      <div class="actions">
        <button id="cancel" type="button">Cancel</button>
        <button id="submit" type="button">Activate</button>
      </div>
    </div>
    <script>
      const { ipcRenderer } = require('electron')
      const channel = ${safeChannel}
      const emailEl = document.getElementById('email')
      const codeEl = document.getElementById('code')
      const statusEl = document.getElementById('status')
      const submitEl = document.getElementById('submit')
      const cancelEl = document.getElementById('cancel')

      function setStatus(text) {
        statusEl.textContent = text || ''
      }

      cancelEl.addEventListener('click', () => window.close())
      codeEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          submitEl.click()
        }
      })

      submitEl.addEventListener('click', async () => {
        const email = emailEl.value.trim()
        const activationCode = codeEl.value.trim()
        if (!email || !activationCode) {
          setStatus('Email and activation code are required.')
          return
        }

        submitEl.disabled = true
        setStatus('Activating...')
        try {
          const result = await ipcRenderer.invoke(channel, { email, activationCode })
          if (result && result.ok) {
            setStatus('Activated successfully.')
            setTimeout(() => window.close(), 150)
            return
          }
          setStatus(result && result.error ? result.error : 'Activation failed.')
        } catch (error) {
          setStatus(error && error.message ? error.message : 'Activation failed.')
        } finally {
          submitEl.disabled = false
        }
      })
    </script>
  </body>
</html>`
}

async function showActivationDialog(reasonText) {
  if (isActivationBoundToCurrentMachine()) {
    return { ok: true, status: getActivationStatusPayload() }
  }
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { ok: false, error: 'Activation required' }
  }
  if (activationDialogPromise) return activationDialogPromise

  const channel = `novel:activation-dialog-submit:${Date.now()}:${Math.random()
    .toString(36)
    .slice(2, 8)}`
  activationDialogPromise = new Promise((resolve) => {
    let settled = false
    const dialogWindow = new BrowserWindow({
      parent: mainWindow,
      modal: true,
      width: 440,
      height: 420,
      minimizable: false,
      maximizable: false,
      resizable: false,
      autoHideMenuBar: true,
      title: 'Activate',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    })

    const closeWith = (payload) => {
      if (settled) return
      settled = true
      resolve(payload)
      if (!dialogWindow.isDestroyed()) {
        dialogWindow.close()
      }
    }

    ipcMain.handle(channel, async (_event, payload) => {
      try {
        await activateWithLicense(null, payload)
        closeWith({ ok: true, status: getActivationStatusPayload() })
        return { ok: true, status: getActivationStatusPayload() }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Activation failed',
        }
      }
    })

    dialogWindow.on('closed', () => {
      ipcMain.removeHandler(channel)
      if (!settled) {
        settled = true
        resolve({ ok: false, canceled: true, status: getActivationStatusPayload() })
      }
    })

    const html = buildActivationDialogHtml(channel, reasonText, activationStore.email)
    dialogWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  })

  try {
    return await activationDialogPromise
  } finally {
    activationDialogPromise = null
  }
}

async function ensureActivated(featureKey) {
  if (isActivationBoundToCurrentMachine()) return true
  const result = await showActivationDialog(getActivationReasonText(featureKey))
  if (result?.ok && result?.status?.activated) return true
  throw new Error('Activation required')
}

function isLocalOllamaModel(provider, model) {
  if (String(provider || '').trim() !== 'ollama') return false
  const name = String(model || '').trim()
  return !/-cloud(?::|$)/i.test(name)
}

function getProjectSettingsPayload() {
  return {
    language: appSettings.language,
    projectsDir: appSettings.projectsDir,
    autoUpdate: appSettings.autoUpdate,
    autoLaunch: appSettings.autoLaunch,
    appVersion: APP_VERSION_LABEL,
  }
}

function applyLaunchAtLoginSetting(enabled) {
  try {
    const openAtLogin = Boolean(enabled)
    const options =
      process.platform === 'win32'
        ? { openAtLogin, path: process.execPath, args: [] }
        : { openAtLogin }
    app.setLoginItemSettings(options)
  } catch {
    // ignore unsupported environments
  }
}

function projectIndexFilePath() {
  return path.join(appSettings.projectsDir, 'index.json')
}

function sanitizeProjectDirName(name) {
  const safe = String(name || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
  return safe || 'project'
}

function createImportedProjectId() {
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function projectPackageFilePath(dirPath) {
  return path.join(dirPath, 'project.json')
}

async function readProjectPackageMeta(dirPath) {
  try {
    const raw = await fs.readFile(projectPackageFilePath(dirPath), 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const id = String(parsed.id || '').trim()
    const name = String(parsed.name || '').trim()
    if (!id) return null
    return { id, name }
  } catch {
    return null
  }
}

async function collectExistingProjectIds() {
  const ids = new Set()
  const indexPath = projectIndexFilePath()
  const rawIndex = await fs.readFile(indexPath, 'utf8').catch(() => '')
  if (rawIndex) {
    try {
      const parsed = JSON.parse(rawIndex)
      const projects = Array.isArray(parsed?.projects) ? parsed.projects : []
      for (const project of projects) {
        const id = String(project?.id || '').trim()
        if (id) ids.add(id)
      }
    } catch {
      // ignore invalid index files
    }
  }

  await fs.mkdir(appSettings.projectsDir, { recursive: true })
  const entries = await fs.readdir(appSettings.projectsDir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dirPath = path.join(appSettings.projectsDir, entry.name)
    const meta = await readProjectPackageMeta(dirPath)
    const id = String(meta?.id || '').trim()
    if (id) ids.add(id)
  }
  return [...ids]
}

async function ensureUniqueProjectDir(baseName, projectId) {
  const safeBase = sanitizeProjectDirName(baseName)
  let candidate = path.join(appSettings.projectsDir, safeBase)
  if (!(await pathExists(candidate))) return candidate
  const existingMeta = await readProjectPackageMeta(candidate)
  if (existingMeta?.id === projectId) return candidate

  let idx = 2
  while (true) {
    candidate = path.join(appSettings.projectsDir, `${safeBase}-${idx}`)
    if (!(await pathExists(candidate))) return candidate
    const meta = await readProjectPackageMeta(candidate)
    if (meta?.id === projectId) return candidate
    idx += 1
  }
}

async function findProjectDirById(projectId) {
  const targetId = String(projectId || '').trim()
  if (!targetId) return ''
  await fs.mkdir(appSettings.projectsDir, { recursive: true })
  const entries = await fs.readdir(appSettings.projectsDir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dirPath = path.join(appSettings.projectsDir, entry.name)
    const meta = await readProjectPackageMeta(dirPath)
    if (meta?.id === targetId) return dirPath
  }
  const legacyDir = path.join(appSettings.projectsDir, targetId)
  if (await pathExists(legacyDir)) return legacyDir
  return ''
}

async function resolveProjectPackageDir(projectId, projectName) {
  const targetId = String(projectId || '').trim()
  if (!targetId) throw new Error('projectId is required')
  await fs.mkdir(appSettings.projectsDir, { recursive: true })

  const desiredName = sanitizeProjectDirName(projectName || targetId)
  const desiredDir = path.join(appSettings.projectsDir, desiredName)
  const matchedDir = await findProjectDirById(targetId)

  if (matchedDir) {
    if (isSamePath(matchedDir, desiredDir)) return matchedDir

    if (await pathExists(desiredDir)) {
      const desiredMeta = await readProjectPackageMeta(desiredDir)
      if (desiredMeta?.id === targetId) return desiredDir
      const uniqueDir = await ensureUniqueProjectDir(`${desiredName}-${targetId.slice(-6)}`, targetId)
      if (!isSamePath(matchedDir, uniqueDir)) {
        await fs.rename(matchedDir, uniqueDir).catch(() => {})
      }
      if (await pathExists(uniqueDir)) return uniqueDir
      return matchedDir
    }

    await fs.rename(matchedDir, desiredDir).catch(() => {})
    if (await pathExists(desiredDir)) return desiredDir
    return matchedDir
  }

  if (!(await pathExists(desiredDir))) return desiredDir
  const desiredMeta = await readProjectPackageMeta(desiredDir)
  if (desiredMeta?.id === targetId) return desiredDir
  return ensureUniqueProjectDir(`${desiredName}-${targetId.slice(-6)}`, targetId)
}

async function moveProjectStorageDirectory(nextDir) {
  const previousDir = normalizeProjectsDir(appSettings.projectsDir)
  const targetDir = normalizeProjectsDir(nextDir)
  if (isSamePath(previousDir, targetDir)) return targetDir

  const previousResolved = path.resolve(previousDir)
  const targetResolved = path.resolve(targetDir)
  if (targetResolved.startsWith(`${previousResolved}${path.sep}`)) {
    throw new Error('新目录不能位于当前目录内部')
  }

  const targetRoot = path.parse(targetResolved).root
  const targetParent = path.dirname(targetResolved)
  if (!isSamePath(targetParent, targetRoot)) {
    await fs.mkdir(targetParent, { recursive: true })
  }
  try {
    await fs.rename(previousResolved, targetResolved)
    return targetResolved
  } catch (error) {
    await fs.mkdir(targetResolved, { recursive: true })
    const entries = await fs.readdir(previousResolved, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const fromPath = path.join(previousResolved, entry.name)
      const toPath = path.join(targetResolved, entry.name)
      if (entry.isDirectory()) {
        await fs.cp(fromPath, toPath, { recursive: true, force: true })
      } else if (entry.isFile()) {
        await fs.copyFile(fromPath, toPath)
      }
    }
    await fs.rm(previousResolved, { recursive: true, force: true }).catch(() => {})
    return targetResolved
  }
}

function normalizeBaseUrl(baseUrl, provider) {
  const clean = String(baseUrl || '')
    .trim()
    .replace(/[銆傦紟]/g, '.')
    .replace(/[：﹕]/g, ':')
    .replace(/[／∕]/g, '/')
    .replace(/\/+$/, '')
  if (!clean) return provider === 'ollama' ? 'http://localhost:11434' : DEEPSEEK_OPENAI_BASE_URL
  if (provider === 'ollama' && !/^[a-z][a-z0-9+.-]*:\/\//i.test(clean)) {
    return `http://${clean}`
  }
  return clean
}

function buildOpenAiUrl(baseUrl) {
  const clean = baseUrl.replace(/\/+$/, '')
  if (clean.endsWith('/chat/completions')) return clean
  if (clean.endsWith('/v1')) return `${clean}/chat/completions`
  return `${clean}/v1/chat/completions`
}

function normalizeModelIdForRequest(provider, modelName) {
  const raw = String(modelName || '').trim()
  if (!raw) return ''
  if (provider !== 'openai') return raw
  return raw.replace(/\s*[锛?](鎺ㄨ崘|褰撳墠|recommended)[锛?]\s*$/gi, '').trim()
}

function normalizeApiKey(apiKey) {
  return String(apiKey || '').trim()
}

function buildOpenAiModelsUrl(baseUrl) {
  const clean = baseUrl.replace(/\/+$/, '')
  if (clean.endsWith('/models')) return clean
  if (clean.endsWith('/chat/completions')) {
    return clean.replace(/\/chat\/completions$/i, '/models')
  }
  if (clean.endsWith('/v1')) return `${clean}/models`
  return `${clean}/v1/models`
}

function hashText(input) {
  const text = String(input || '')
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `h-${(hash >>> 0).toString(16)}`
}

function toPreviewText(input, maxLength = 1200) {
  const text = String(input || '').trim()
  if (!text) return ''
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}\n...(truncated)`
}

function ensureSessionDiagnostics(session) {
  if (!session || typeof session !== 'object') return
  if (!Array.isArray(session.requestLogs)) {
    session.requestLogs = []
  } else if (session.requestLogs.length > 30) {
    session.requestLogs = session.requestLogs.slice(-30)
  }
}

function collectErrorCodes(error) {
  const codes = new Set()
  const queue = [error]
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || typeof current !== 'object') continue
    const code = current.code
    if (typeof code === 'string' && code.trim()) {
      codes.add(code.trim().toUpperCase())
    }
    if (Array.isArray(current.errors)) {
      current.errors.forEach((item) => queue.push(item))
    }
    if (current.cause) {
      queue.push(current.cause)
    }
  }
  return [...codes]
}

function shouldRetryOllamaNetworkError(error) {
  const codes = collectErrorCodes(error)
  const retryCodes = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EHOSTUNREACH',
    'EAI_AGAIN',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_SOCKET',
  ])
  if (codes.some((code) => retryCodes.has(code))) return true
  const message =
    error instanceof Error ? String(error.message || '') : typeof error === 'string' ? error : ''
  return /fetch failed|network|socket|connect|timed?out|econn|enotfound|eai_again/i.test(message)
}

function buildOllamaBaseUrlCandidates(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl, 'ollama')
  const candidates = [normalized]
  try {
    const parsed = new URL(normalized)
    const hostname = String(parsed.hostname || '').toLowerCase()
    const path = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname.replace(/\/+$/, '') : ''
    const suffix = `${path}${parsed.search || ''}${parsed.hash || ''}`
    const port = parsed.port ? `:${parsed.port}` : ''
    const pushHost = (host) => {
      const url = `${parsed.protocol}//${host}${port}${suffix}`
      if (!candidates.includes(url)) candidates.push(url)
    }
    if (hostname === 'localhost') {
      pushHost('127.0.0.1')
      pushHost('[::1]')
    } else if (hostname === '127.0.0.1' || hostname === '::1') {
      pushHost('localhost')
      if (hostname !== '::1') pushHost('[::1]')
    }
  } catch {
    // ignore malformed url and keep normalized as fallback candidate
  }
  return candidates
}

async function fetchWithOllamaBaseUrlFallback(baseUrl, requestFactory) {
  const candidates = buildOllamaBaseUrlCandidates(baseUrl)
  let lastError = null
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i]
    try {
      const result = await requestFactory(candidate)
      return { ...result, resolvedBaseUrl: candidate }
    } catch (error) {
      lastError = error
      const isLast = i === candidates.length - 1
      if (isLast || !shouldRetryOllamaNetworkError(error)) {
        throw error
      }
    }
  }
  throw lastError || new Error('Ollama request failed')
}

function toReadableOllamaError(error, baseUrl) {
  const codes = collectErrorCodes(error)
  const hasRefused = codes.includes('ECONNREFUSED')
  const hasTimeout = codes.includes('ETIMEDOUT')
  if (hasRefused || hasTimeout) {
    return '找不到本地模型，请查看“模型板块”的“使用帮助”，并根据说明安装本地模型。'
  }
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '未知错误'
  if (/fetch failed/i.test(String(message || ''))) {
    return '找不到本地模型，请查看“模型板块”的“使用帮助”，并根据说明安装本地模型。'
  }
  const detail = codes.length > 0 ? ` (${codes.join(', ')})` : ''
  return `请求 Ollama 失败：${String(message || '未知错误')}${detail}`
}

function trimSessionMessages(messages) {
  if (!Array.isArray(messages) || messages.length <= SESSION_HISTORY_LIMIT + 1) {
    return Array.isArray(messages) ? messages : []
  }
  const firstSystem = messages.find((item) => item && item.role === 'system')
  const nonSystem = messages.filter((item) => item && item.role !== 'system')
  const recent = nonSystem.slice(-SESSION_HISTORY_LIMIT)
  return firstSystem ? [firstSystem, ...recent] : recent
}

async function loadSessionStore() {
  try {
    const raw = await fs.readFile(cachePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && parsed.sessions) {
      sessionStore = parsed
      Object.values(sessionStore.sessions || {}).forEach((session) => {
        ensureSessionDiagnostics(session)
      })
    }
  } catch {
    sessionStore = { sessions: {} }
  }
}

async function saveSessionStore() {
  await fs.mkdir(path.dirname(cachePath), { recursive: true })
  await fs.writeFile(cachePath, JSON.stringify(sessionStore, null, 2), 'utf8')
}

function normalizeSkillsStore(raw) {
  const installedOfficial = Array.isArray(raw?.installedOfficial)
    ? raw.installedOfficial.filter((item) => typeof item === 'string' && item.trim())
    : []
  const installedCustom = Array.isArray(raw?.installedCustom)
    ? raw.installedCustom.filter((item) => typeof item === 'string' && item.trim())
    : []
  const customSkills = Array.isArray(raw?.customSkills)
    ? raw.customSkills
        .map((item) => ({
          id: String(item?.id || '').trim(),
          name: String(item?.name || '').trim(),
          fileName: String(item?.fileName || '').trim(),
          createdAt: String(item?.createdAt || '').trim(),
          updatedAt: String(item?.updatedAt || '').trim(),
        }))
        .filter((item) => item.id && item.name && item.fileName)
    : []
  return {
    installedOfficial: [...new Set(installedOfficial)],
    installedCustom: [...new Set(installedCustom)],
    customSkills,
  }
}

async function loadSkillsStore() {
  try {
    const raw = await fs.readFile(skillsStorePath, 'utf8')
    skillsStore = normalizeSkillsStore(JSON.parse(raw))
  } catch {
    skillsStore = normalizeSkillsStore(null)
  }
}

async function saveSkillsStore() {
  skillsStore = normalizeSkillsStore(skillsStore)
  await fs.mkdir(path.dirname(skillsStorePath), { recursive: true })
  await fs.writeFile(skillsStorePath, JSON.stringify(skillsStore, null, 2), 'utf8')
}

function getCustomSkillsDir() {
  return path.join(app.getPath('userData'), 'skills-custom')
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function resolveOfficialSkillsDir() {
  const candidates = [
    OFFICIAL_SKILLS_DIR,
    path.resolve(process.cwd(), 'skills'),
    path.resolve(__dirname, '..', 'skills'),
  ]
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate
    }
  }
  return candidates[0]
}

async function collectMarkdownFiles(rootDir) {
  const results = []
  const walk = async (targetDir) => {
    const entries = await fs.readdir(targetDir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const entryPath = path.join(targetDir, entry.name)
      if (entry.isDirectory()) {
        await walk(entryPath)
        continue
      }
      if (!entry.isFile()) continue
      const ext = path.extname(entry.name).toLowerCase()
      if (!MARKDOWN_EXTENSIONS.has(ext)) continue
      results.push(entryPath)
    }
  }
  await walk(rootDir)
  return results
}

function sanitizeSkillFileName(name) {
  return String(name || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function ensureUniqueSkillFileName(dirPath, baseName) {
  const safeBase = sanitizeSkillFileName(baseName) || `skill-${Date.now()}`
  let nextName = `${safeBase}.md`
  let idx = 1
  while (await pathExists(path.join(dirPath, nextName))) {
    nextName = `${safeBase}-${idx}.md`
    idx += 1
  }
  return nextName
}

function displayNameFromFileName(fileName) {
  return path.basename(fileName, path.extname(fileName))
}

function buildSkillsPrompt(installedSkills) {
  if (!Array.isArray(installedSkills) || installedSkills.length === 0) return ''
  return installedSkills
    .map((skill) => `## ${skill.name}\n${String(skill.content || '').trim()}`)
    .join('\n\n')
    .trim()
}

async function listOfficialSkills() {
  const skillsDir = await resolveOfficialSkillsDir()
  const installed = new Set(skillsStore.installedOfficial)
  const files = await collectMarkdownFiles(skillsDir)
  const skills = []
  for (const filePath of files) {
    const relativePath = path.relative(skillsDir, filePath).replace(/\\/g, '/')
    const fileName = path.basename(filePath)
    const content = await fs.readFile(filePath, 'utf8').catch(() => '')
    const stat = await fs.stat(filePath).catch(() => null)
    skills.push({
      id: `official:${relativePath}`,
      key: relativePath,
      source: 'official',
      name: displayNameFromFileName(fileName),
      fileName: relativePath,
      installed: installed.has(relativePath),
      canRename: false,
      canDelete: false,
      updatedAt: stat?.mtime?.toISOString?.() || '',
      content,
    })
  }
  skills.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  return { skills, skillsDir }
}

async function listCustomSkills() {
  const installed = new Set(skillsStore.installedCustom)
  const customDir = getCustomSkillsDir()
  await fs.mkdir(customDir, { recursive: true })

  const skills = []
  for (const skill of skillsStore.customSkills) {
    const filePath = path.join(customDir, skill.fileName)
    if (!(await pathExists(filePath))) continue
    const content = await fs.readFile(filePath, 'utf8').catch(() => '')
    const stat = await fs.stat(filePath).catch(() => null)
    skills.push({
      id: skill.id,
      key: skill.id,
      source: 'custom',
      name: skill.name,
      fileName: skill.fileName,
      installed: installed.has(skill.id),
      canRename: true,
      canDelete: true,
      updatedAt: skill.updatedAt || stat?.mtime?.toISOString?.() || '',
      content,
    })
  }
  skills.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  return skills
}

async function getSkillsCatalog() {
  const { skills: official } = await listOfficialSkills()
  const custom = await listCustomSkills()
  return [...official, ...custom]
}

async function getSkillsCenterPayload() {
  const { skills: official, skillsDir: officialDir } = await listOfficialSkills()
  const custom = await listCustomSkills()
  const catalog = [...official, ...custom]
  const installedSkills = catalog.filter((item) => item.installed)
  return {
    catalog,
    skillsPrompt: buildSkillsPrompt(installedSkills),
    officialDir,
  }
}

async function setSkillInstalled(payload, installed) {
  const id = String(payload?.id || '').trim()
  const source = String(payload?.source || '').trim()
  if (!id || !source) throw new Error('id and source are required')

  if (source === 'official') {
    const officialKey = id.startsWith('official:') ? id.slice('official:'.length) : id
    const next = new Set(skillsStore.installedOfficial)
    if (installed) next.add(officialKey)
    else next.delete(officialKey)
    skillsStore.installedOfficial = [...next]
    await saveSkillsStore()
    return { ok: true, ...(await getSkillsCenterPayload()) }
  }

  if (source === 'custom') {
    const exists = skillsStore.customSkills.some((item) => item.id === id)
    if (!exists) throw new Error('custom skill not found')
    const next = new Set(skillsStore.installedCustom)
    if (installed) next.add(id)
    else next.delete(id)
    skillsStore.installedCustom = [...next]
    await saveSkillsStore()
    return { ok: true, ...(await getSkillsCenterPayload()) }
  }

  throw new Error('unsupported source')
}

async function createCustomSkill(_event, payload) {
  const name = String(payload?.name || '').trim()
  const content = String(payload?.content || '').trim()
  if (!name || !content) throw new Error('name and content are required')

  const customDir = getCustomSkillsDir()
  await fs.mkdir(customDir, { recursive: true })
  const fileName = await ensureUniqueSkillFileName(customDir, name)
  await fs.writeFile(path.join(customDir, fileName), content, 'utf8')

  const id = `custom:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const now = new Date().toISOString()
  skillsStore.customSkills.push({
    id,
    name,
    fileName,
    createdAt: now,
    updatedAt: now,
  })
  skillsStore.installedCustom = [...new Set([...skillsStore.installedCustom, id])]
  await saveSkillsStore()
  return { ok: true, ...(await getSkillsCenterPayload()) }
}

async function renameCustomSkill(_event, payload) {
  const id = String(payload?.id || '').trim()
  const name = String(payload?.name || '').trim()
  if (!id || !name) throw new Error('id and name are required')

  const target = skillsStore.customSkills.find((item) => item.id === id)
  if (!target) throw new Error('custom skill not found')
  target.name = name
  target.updatedAt = new Date().toISOString()
  await saveSkillsStore()
  return { ok: true, ...(await getSkillsCenterPayload()) }
}

async function deleteCustomSkill(_event, payload) {
  const id = String(payload?.id || '').trim()
  if (!id) throw new Error('id is required')

  const target = skillsStore.customSkills.find((item) => item.id === id)
  if (!target) throw new Error('custom skill not found')
  const customDir = getCustomSkillsDir()
  await fs.unlink(path.join(customDir, target.fileName)).catch(() => {})
  skillsStore.customSkills = skillsStore.customSkills.filter((item) => item.id !== id)
  skillsStore.installedCustom = skillsStore.installedCustom.filter((item) => item !== id)
  await saveSkillsStore()
  return { ok: true, ...(await getSkillsCenterPayload()) }
}

function ensureSession(payload) {
  const {
    sessionId,
    provider,
    baseUrl,
    model,
    apiKey,
    temperature,
    skillsPrompt,
    reset,
  } = payload

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl, provider)
  const existing = sessionStore.sessions[sessionId]
  const identityChanged =
    !!existing &&
    (existing.provider !== provider ||
      existing.baseUrl !== normalizedBaseUrl ||
      existing.model !== model ||
      existing.apiKey !== apiKey ||
      existing.temperature !== temperature ||
      existing.skillsPrompt !== (skillsPrompt || ''))

  if (!existing || reset || identityChanged) {
    sessionStore.sessions[sessionId] = {
      id: sessionId,
      provider,
      baseUrl: normalizedBaseUrl,
      model,
      apiKey,
      temperature,
      skillsPrompt: skillsPrompt || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      requestLogs: [],
    }
  }
  const session = sessionStore.sessions[sessionId]
  ensureSessionDiagnostics(session)
  return session
}

async function callModel(payload, session) {
  const provider = payload.provider
  const baseUrl = normalizeBaseUrl(payload.baseUrl, provider)
  const requestModel = normalizeModelIdForRequest(provider, payload.model) || String(payload.model || '').trim()
  const requestApiKey = normalizeApiKey(payload.apiKey)
  const messages = session.messages

  if (provider === 'ollama') {
    let primary = null
    try {
      primary = await requestOllamaChat(baseUrl, requestModel, messages, payload.temperature)
    } catch (error) {
      throw new Error(toReadableOllamaError(error, baseUrl))
    }
    if (primary.response.ok) {
      if (primary.data?.error) throw new Error(primary.data.error)
      return String(primary.data?.message?.content || '').trim()
    }

    const primaryError = String(primary.data?.error || primary.rawText || '').trim()
    const canRetryCloud = !/-cloud(?::|$)/i.test(requestModel)
    const modelNotFound = /model\s+'.+?'\s+not\s+found/i.test(primaryError)
    if (canRetryCloud && modelNotFound) {
      const cloudModel = toCloudModelName(requestModel)
      let cloud = null
      try {
        cloud = await requestOllamaChat(baseUrl, cloudModel, messages, payload.temperature)
      } catch (error) {
        throw new Error(toReadableOllamaError(error, baseUrl))
      }
      if (cloud.response.ok) {
        if (cloud.data?.error) throw new Error(cloud.data.error)
        return String(cloud.data?.message?.content || '').trim()
      }
      const cloudError = String(cloud.data?.error || cloud.rawText || '').trim()
      throw new Error(cloudError || `Ollama request failed: ${cloud.response.status}`)
    }

    throw new Error(primaryError || `Ollama request failed: ${primary.response.status}`)
  }

  const response = await fetch(buildOpenAiUrl(baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getCurrentMachineMacAddress() ? { 'x-client-mac': getCurrentMachineMacAddress() } : {}),
      ...(requestApiKey ? { Authorization: `Bearer ${requestApiKey}` } : {}),
    },
    body: JSON.stringify({
      model: requestModel,
      messages,
      temperature: payload.temperature,
    }),
  })
  const rawText = await response.text()
  let data = null
  try {
    data = rawText ? JSON.parse(rawText) : null
  } catch {
    data = null
  }
  if (!response.ok) {
    const detail =
      (data &&
        typeof data === 'object' &&
        data.error &&
        typeof data.error === 'object' &&
        typeof data.error.message === 'string' &&
        data.error.message.trim()) ||
      String(rawText || '').trim().slice(0, 240)
    throw new Error(
      `API request failed: ${response.status}${detail ? `: ${detail}` : ''} (model=${requestModel})`
    )
  }
  if (data?.error?.message) throw new Error(data.error.message)
  return String(data?.choices?.[0]?.message?.content || '').trim()
}

async function generateWithSession(_event, payload) {
  const required = ['sessionId', 'provider', 'baseUrl', 'model', 'instruction', 'input']
  for (const key of required) {
    if (!payload || !payload[key]) {
      throw new Error(`Missing required field: ${key}`)
    }
  }

  if (isLocalOllamaModel(payload?.provider, payload?.model)) {
    await ensureActivated('local-models')
  }

  const session = ensureSession(payload)
  if (!Array.isArray(session.messages)) session.messages = []
  ensureSessionDiagnostics(session)

  const normalizedSkillsPrompt = String(payload.skillsPrompt || '').trim()
  const skillsLoaded = Boolean(normalizedSkillsPrompt)
  const injectedThisRequest = session.messages.length === 0 && skillsLoaded

  if (session.messages.length === 0) {
    const systemParts = [DEFAULT_SYSTEM_PROMPT]
    if (skillsLoaded) {
      systemParts.push(
        `Writing skills and guardrails (apply consistently):\n${normalizedSkillsPrompt}`
      )
    }
    session.messages.push({
      role: 'system',
      content: systemParts.join('\n\n'),
    })
  }

  const memoryBlock = Array.isArray(payload.memory) ? payload.memory.join('\n') : ''
  const userPrompt = `Long-term memory:\n${memoryBlock}\n\nTask:\n${payload.instruction}\n\nText:\n${payload.input}`
  session.messages.push({ role: 'user', content: userPrompt })

  const output = await callModel(payload, session)
  session.messages.push({ role: 'assistant', content: output || '' })
  const systemMessage = session.messages.find((item) => item && item.role === 'system')
  const systemContent = String(systemMessage?.content || '')
  const skillsInjected = skillsLoaded && Boolean(systemContent) && systemContent.includes(normalizedSkillsPrompt)
  const requestLog = {
    id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    provider: String(payload.provider || ''),
    model: String(payload.model || ''),
    baseUrl: normalizeBaseUrl(payload.baseUrl, payload.provider),
    instructionChars: String(payload.instruction || '').length,
    inputChars: String(payload.input || '').length,
    memoryCount: Array.isArray(payload.memory) ? payload.memory.length : 0,
    skillsLoaded,
    skillsInjected,
    injectedThisRequest,
  }
  session.requestLogs.push(requestLog)
  if (session.requestLogs.length > 30) {
    session.requestLogs = session.requestLogs.slice(-30)
  }
  session.messages = trimSessionMessages(session.messages)
  session.updatedAt = new Date().toISOString()
  await saveSessionStore()

  return {
    sessionId: session.id,
    output,
    diagnostics: {
      generatedAt: new Date().toISOString(),
      skillsLoaded,
      skillsInjected,
      skillsHit: skillsLoaded && skillsInjected,
      injectedThisRequest,
      skillsPromptHash: skillsLoaded ? hashText(normalizedSkillsPrompt) : '',
      systemPromptHash: systemContent ? hashText(systemContent) : '',
      systemPromptPreview: toPreviewText(systemContent),
      latestRequest: requestLog,
      requestLogs: session.requestLogs.slice(-12).reverse(),
    },
  }
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (error) => reject(error))
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code })
        return
      }
      reject(new Error(stderr || `Command failed: ${command} ${args.join(' ')}`))
    })
  })
}

async function createSkillModel(_event, payload) {
  await ensureActivated('local-models')

  const baseModel = String(payload?.baseModel || '').trim()
  const modelName = String(payload?.modelName || '').trim()
  const skillsPrompt = String(payload?.skillsPrompt || '').trim()

  if (!baseModel || !modelName || !skillsPrompt) {
    throw new Error('baseModel, modelName and skillsPrompt are required')
  }

  const modelfile = path.join(app.getPath('userData'), `modelfile-${Date.now()}.txt`)
  const escapedSkills = skillsPrompt.replace(/"""/g, '\\"\\"\\"')
  const content = `FROM ${baseModel}\n\nSYSTEM """\n${escapedSkills}\n"""\n`

  await fs.writeFile(modelfile, content, 'utf8')
  try {
    const result = await runCommand('ollama', ['create', modelName, '-f', modelfile])
    return {
      ok: true,
      stdout: result.stdout,
      stderr: result.stderr,
      modelName,
    }
  } finally {
    fs.unlink(modelfile).catch(() => {})
  }
}

function parseOllamaModelNames(data) {
  const rawModels = Array.isArray(data?.models) ? data.models : []
  return rawModels
    .map((item) => {
      if (typeof item?.name === 'string' && item.name.trim()) return item.name.trim()
      if (typeof item?.model === 'string' && item.model.trim()) return item.model.trim()
      return ''
    })
    .filter(Boolean)
}

function parseOpenAiModelNames(data) {
  const directModels = Array.isArray(data?.data) ? data.data : []
  const nestedModels =
    !directModels.length && Array.isArray(data?.data?.list) ? data.data.list : []
  const fallbackModels = Array.isArray(data?.models) ? data.models : []
  const rawModels = directModels.length
    ? directModels
    : nestedModels.length
      ? nestedModels
      : fallbackModels
  return rawModels
    .map((item) => {
      if (!item || typeof item !== 'object') return ''
      const id = item.id
      if (typeof id === 'string' && id.trim()) return id.trim()
      return ''
    })
    .filter(Boolean)
}

function toCloudModelName(name) {
  const value = String(name || '').trim()
  if (!value) return ''
  return /-cloud(?::|$)/i.test(value) ? value : `${value}-cloud`
}

async function requestOllamaChat(baseUrl, model, messages, temperature) {
  const { response, resolvedBaseUrl } = await fetchWithOllamaBaseUrlFallback(
    baseUrl,
    async (candidateBaseUrl) => {
      const response = await fetch(`${candidateBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          options: { temperature },
        }),
      })
      return { response }
    }
  )
  const rawText = await response.text()
  let data = null
  try {
    data = JSON.parse(rawText)
  } catch {
    data = null
  }
  return { response, data, rawText, resolvedBaseUrl }
}

async function listOllamaModels(_event, payload) {
  const baseUrl = normalizeBaseUrl(payload?.baseUrl, 'ollama')
  const includeCloud = Boolean(payload?.includeCloud)
  try {
    const { response } = await fetchWithOllamaBaseUrlFallback(
      baseUrl,
      async (candidateBaseUrl) => {
        const response = await fetch(`${candidateBaseUrl}/api/tags`)
        return { response }
      }
    )
    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status}`)
    }

    const data = await response.json().catch(() => ({}))
    const localModels = [...new Set(parseOllamaModelNames(data))].sort((a, b) =>
      a.localeCompare(b, 'zh-CN')
    )
    const activationReady = isActivationBoundToCurrentMachine()
    const allowedLocalModels = activationReady ? localModels : []
    let cloudModels = []
    if (includeCloud) {
      try {
        const cloudResponse = await fetch('https://ollama.com/api/tags')
        if (cloudResponse.ok) {
          const cloudData = await cloudResponse.json().catch(() => ({}))
          const remoteModels = parseOllamaModelNames(cloudData)
          cloudModels = remoteModels.map((name) => toCloudModelName(name)).filter(Boolean)
        }
      } catch {
        // ignore cloud fetch errors and keep local models available
      }
    }

    const sortedCloud = [...new Set(cloudModels)].sort((a, b) => a.localeCompare(b, 'zh-CN'))
    const models = [...new Set([...allowedLocalModels, ...sortedCloud])].sort((a, b) =>
      a.localeCompare(b, 'zh-CN')
    )
    return {
      models,
      localModels: allowedLocalModels,
      cloudModels: sortedCloud,
      reachable: true,
      error: '',
      activationRequiredForLocal: !activationReady,
    }
  } catch (error) {
    return {
      models: [],
      localModels: [],
      cloudModels: [],
      reachable: false,
      error: toReadableOllamaError(error, baseUrl),
      activationRequiredForLocal: !isActivationBoundToCurrentMachine(),
    }
  }
}

async function listOpenAiModels(_event, payload) {
  const baseUrl = normalizeBaseUrl(payload?.baseUrl, 'openai')
  const apiKey = String(payload?.apiKey || '').trim()
  if (!baseUrl) {
    return {
      models: [],
      reachable: false,
      error: '璇峰厛濉啓妯″瀷鎺ュ彛鍦板潃',
    }
  }

  try {
    const response = await fetch(buildOpenAiModelsUrl(baseUrl), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(getCurrentMachineMacAddress() ? { 'x-client-mac': getCurrentMachineMacAddress() } : {}),
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    })
    const rawText = await response.text()
    let data = {}
    try {
      data = rawText ? JSON.parse(rawText) : {}
    } catch {
      data = {}
    }

    if (!response.ok) {
      const detail =
        (data &&
          typeof data === 'object' &&
          data.error &&
          typeof data.error === 'object' &&
          typeof data.error.message === 'string' &&
          data.error.message.trim()) ||
        rawText.trim().slice(0, 180)
      throw new Error(`妯″瀷鍒楄〃璇锋眰澶辫触锛?{response.status}${detail ? `锛?{detail}` : ''}`)
    }

    const models = [...new Set(parseOpenAiModelNames(data))].sort((a, b) =>
      a.localeCompare(b, 'zh-CN')
    )
    return {
      models,
      reachable: true,
      error: '',
    }
  } catch (error) {
    return {
      models: [],
      reachable: false,
      error: error instanceof Error ? error.message : '璇诲彇妯″瀷鍒楄〃澶辫触',
    }
  }
}

async function signinOllama() {
  try {
    const child = spawn('ollama', ['signin'], {
      shell: true,
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    shell.openExternal('https://ollama.com/signin').catch(() => {})
    return { ok: true }
  } catch (error) {
    throw new Error(
      error instanceof Error ? `鍚姩 ollama signin 澶辫触锛?{error.message}` : '鍚姩 ollama signin 澶辫触'
    )
  }
}

async function getProjectSettings() {
  return getProjectSettingsPayload()
}

async function updateProjectSettings(_event, payload) {
  const previousAutoLaunch = appSettings.autoLaunch
  const nextLanguage =
    payload?.language === 'en-US' || payload?.language === 'zh-CN'
      ? payload.language
      : appSettings.language
  const nextAutoUpdate =
    typeof payload?.autoUpdate === 'boolean' ? payload.autoUpdate : appSettings.autoUpdate
  const nextAutoLaunch =
    typeof payload?.autoLaunch === 'boolean' ? payload.autoLaunch : appSettings.autoLaunch

  let nextProjectsDir = appSettings.projectsDir
  if (typeof payload?.projectsDir === 'string' && payload.projectsDir.trim()) {
    nextProjectsDir = await moveProjectStorageDirectory(payload.projectsDir)
  }

  appSettings = normalizeAppSettings({
    language: nextLanguage,
    projectsDir: nextProjectsDir,
    autoUpdate: nextAutoUpdate,
    autoLaunch: nextAutoLaunch,
  })
  await fs.mkdir(appSettings.projectsDir, { recursive: true })
  await saveAppSettings()
  if (previousAutoLaunch !== appSettings.autoLaunch) {
    applyLaunchAtLoginSetting(appSettings.autoLaunch)
  }
  return { ok: true, settings: getProjectSettingsPayload() }
}

async function checkAppUpgrade() {
  return {
    ok: true,
    currentVersion: APP_VERSION_LABEL,
    latestVersion: APP_VERSION_LABEL,
    hasUpdate: false,
    note: '当前已经是最新版本。',
  }
}

async function pickProjectStorageDir() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '閫夋嫨椤圭洰淇濆瓨鐩綍',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: appSettings.projectsDir,
  })
  if (result.canceled || !result.filePaths?.[0]) {
    return { canceled: true, path: '' }
  }
  return { canceled: false, path: result.filePaths[0] }
}

async function syncProjectsIndex(_event, payload) {
  const projects = Array.isArray(payload?.projects)
    ? payload.projects
        .map((item) => ({
          id: String(item?.id || '').trim(),
          name: String(item?.name || '').trim(),
          createdAt: String(item?.createdAt || '').trim(),
          updatedAt: String(item?.updatedAt || '').trim(),
        }))
        .filter((item) => item.id && item.name)
    : []
  const uniqueIds = [...new Set(projects.map((item) => item.id))]
  if (uniqueIds.length > ACTIVATION_FREE_PROJECT_LIMIT) {
    await ensureActivated('multiple-projects')
  }
  await fs.mkdir(appSettings.projectsDir, { recursive: true })
  const filePath = projectIndexFilePath()
  await fs.writeFile(
    filePath,
    JSON.stringify({ projects, updatedAt: new Date().toISOString() }, null, 2),
    'utf8'
  )
  return { ok: true, path: filePath }
}

async function syncProjectPackage(_event, payload) {
  const projectId = String(payload?.projectId || '').trim()
  if (!projectId) throw new Error('projectId is required')
  const projectName = String(payload?.projectName || '').trim() || projectId
  const workspace = payload?.workspace ?? {}

  const existingIds = await collectExistingProjectIds()
  const projectAlreadyExists = existingIds.includes(projectId)
  if (!projectAlreadyExists && existingIds.length >= ACTIVATION_FREE_PROJECT_LIMIT) {
    await ensureActivated('multiple-projects')
  }

  const dirPath = await resolveProjectPackageDir(projectId, projectName)
  await fs.mkdir(dirPath, { recursive: true })
  const filePath = projectPackageFilePath(dirPath)
  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        id: projectId,
        name: projectName,
        updatedAt: new Date().toISOString(),
        workspace,
      },
      null,
      2
    ),
    'utf8'
  )
  return { ok: true, dirPath, filePath }
}

async function openProjectPackage(_event, payload) {
  const projectId = String(payload?.projectId || '').trim()
  if (!projectId) throw new Error('projectId is required')
  const projectName = String(payload?.projectName || '').trim() || projectId
  const dirPath = await resolveProjectPackageDir(projectId, projectName)
  await fs.mkdir(dirPath, { recursive: true })
  const error = await shell.openPath(dirPath)
  return { ok: !error, path: dirPath, ...(error ? { error } : {}) }
}

async function deleteProjectPackage(_event, payload) {
  const projectId = String(payload?.projectId || '').trim()
  if (!projectId) throw new Error('projectId is required')
  const projectName = String(payload?.projectName || '').trim()
  const dirPath = await resolveProjectPackageDir(projectId, projectName || projectId)
  await fs.rm(dirPath, { recursive: true, force: true })
  return { ok: true, path: dirPath }
}

async function hasProjectPackage(dirPath) {
  return pathExists(projectPackageFilePath(dirPath))
}

async function collectImportProjectDirs(filePaths) {
  const found = new Set()
  for (const rawPath of filePaths) {
    const resolved = path.resolve(String(rawPath || '').trim())
    if (!resolved) continue
    const stat = await fs.stat(resolved).catch(() => null)
    if (!stat || !stat.isDirectory()) continue

    if (await hasProjectPackage(resolved)) {
      found.add(resolved)
      continue
    }

    const children = await fs.readdir(resolved, { withFileTypes: true }).catch(() => [])
    for (const child of children) {
      if (!child.isDirectory()) continue
      const childDir = path.join(resolved, child.name)
      if (await hasProjectPackage(childDir)) {
        found.add(childDir)
      }
    }
  }
  return [...found]
}

async function readImportProjectPackage(sourceDir) {
  const packagePath = projectPackageFilePath(sourceDir)
  const raw = await fs.readFile(packagePath, 'utf8')
  const parsed = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('invalid project package')
  }
  const id = String(parsed.id || '').trim() || createImportedProjectId()
  const name = String(parsed.name || '').trim() || sanitizeProjectDirName(path.basename(sourceDir))
  const createdAt = String(parsed.createdAt || '').trim() || new Date().toISOString()
  const updatedAt = String(parsed.updatedAt || '').trim() || new Date().toISOString()
  const workspace =
    parsed.workspace && typeof parsed.workspace === 'object' && !Array.isArray(parsed.workspace)
      ? parsed.workspace
      : {}

  return { id, name, createdAt, updatedAt, workspace }
}

async function importProjectPackages() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '瀵煎叆浣滃搧',
    properties: ['openDirectory', 'multiSelections'],
    defaultPath: appSettings.projectsDir,
  })
  if (result.canceled || !result.filePaths?.length) {
    return { canceled: true, imported: [], importedCount: 0, skippedCount: 0 }
  }

  await fs.mkdir(appSettings.projectsDir, { recursive: true })
  const sourceDirs = await collectImportProjectDirs(result.filePaths)
  if (!isActivationBoundToCurrentMachine()) {
    const existingIds = new Set(await collectExistingProjectIds())
    if (sourceDirs.length > 1 && existingIds.size >= 1) {
      await ensureActivated('multiple-projects')
    } else if (sourceDirs.length === 1 && existingIds.size >= 1) {
      const sourceMeta = await readImportProjectPackage(sourceDirs[0]).catch(() => null)
      const nextId = String(sourceMeta?.id || '').trim()
      if (!nextId || !existingIds.has(nextId)) {
        await ensureActivated('multiple-projects')
      }
    } else if (sourceDirs.length >= 1 && existingIds.size >= ACTIVATION_FREE_PROJECT_LIMIT) {
      await ensureActivated('multiple-projects')
    }
  }
  const imported = []
  let skippedCount = 0

  for (const sourceDir of sourceDirs) {
    try {
      const payload = await readImportProjectPackage(sourceDir)
      const targetDir = await resolveProjectPackageDir(payload.id, payload.name)
      const sourceResolved = path.resolve(sourceDir)
      const targetResolved = path.resolve(targetDir)

      if (!isSamePath(sourceResolved, targetResolved)) {
        if (await pathExists(targetResolved)) {
          await fs.rm(targetResolved, { recursive: true, force: true })
        }
        await fs.cp(sourceResolved, targetResolved, { recursive: true, force: true })
      }

      await fs.mkdir(targetResolved, { recursive: true })
      const nextUpdatedAt = new Date().toISOString()
      await fs.writeFile(
        projectPackageFilePath(targetResolved),
        JSON.stringify(
          {
            id: payload.id,
            name: payload.name,
            createdAt: payload.createdAt,
            updatedAt: nextUpdatedAt,
            workspace: payload.workspace,
          },
          null,
          2
        ),
        'utf8'
      )

      imported.push({
        id: payload.id,
        name: payload.name,
        createdAt: payload.createdAt,
        updatedAt: nextUpdatedAt,
        workspace: payload.workspace,
      })
    } catch {
      skippedCount += 1
    }
  }

  return {
    canceled: false,
    imported,
    importedCount: imported.length,
    skippedCount: skippedCount + Math.max(0, result.filePaths.length - sourceDirs.length),
  }
}

function registerIpc() {
  ipcMain.handle('novel:generate', generateWithSession)
  ipcMain.handle('novel:reset-session', async (_event, payload) => {
    const sessionId = String(payload?.sessionId || '').trim()
    if (!sessionId) return { ok: true }
    delete sessionStore.sessions[sessionId]
    await saveSessionStore()
    return { ok: true }
  })
  ipcMain.handle('novel:create-skill-model', createSkillModel)
  ipcMain.handle('novel:ollama-models', listOllamaModels)
  ipcMain.handle('novel:openai-models', listOpenAiModels)
  ipcMain.handle('novel:ollama-signin', signinOllama)
  ipcMain.handle('novel:skills-list', async () => getSkillsCenterPayload())
  ipcMain.handle('novel:skills-install', async (_event, payload) =>
    setSkillInstalled(payload, true)
  )
  ipcMain.handle('novel:skills-uninstall', async (_event, payload) =>
    setSkillInstalled(payload, false)
  )
  ipcMain.handle('novel:skills-create-custom', createCustomSkill)
  ipcMain.handle('novel:skills-rename-custom', renameCustomSkill)
  ipcMain.handle('novel:skills-delete-custom', deleteCustomSkill)
  ipcMain.handle('novel:activation-status', async () => ({
    ok: true,
    status: getActivationStatusPayload(),
  }))
  ipcMain.handle('novel:activation-activate', activateWithLicense)
  ipcMain.handle('novel:activation-unbind', unbindCurrentMachine)
  ipcMain.handle('novel:activation-open-dialog', async (_event, payload) =>
    showActivationDialog(String(payload?.reason || '').trim())
  )
  ipcMain.handle('novel:project-settings-get', getProjectSettings)
  ipcMain.handle('novel:project-settings-update', updateProjectSettings)
  ipcMain.handle('novel:app-check-upgrade', checkAppUpgrade)
  ipcMain.handle('novel:project-storage-pick-dir', pickProjectStorageDir)
  ipcMain.handle('novel:project-sync-index', syncProjectsIndex)
  ipcMain.handle('novel:project-sync-package', syncProjectPackage)
  ipcMain.handle('novel:project-open-package', openProjectPackage)
  ipcMain.handle('novel:project-delete-package', deleteProjectPackage)
  ipcMain.handle('novel:project-import-packages', importProjectPackages)
  ipcMain.handle('novel:window-close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close()
    }
    return { ok: true }
  })
  ipcMain.handle('novel:window-minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize()
      return { ok: true, isMaximized: mainWindow.isMaximized() }
    }
    return { ok: false, isMaximized: false }
  })
  ipcMain.handle('novel:window-toggle-maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
      } else {
        mainWindow.maximize()
      }
      return { ok: true, isMaximized: mainWindow.isMaximized() }
    }
    return { ok: false, isMaximized: false }
  })
  ipcMain.handle('novel:window-is-maximized', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      return { ok: true, isMaximized: mainWindow.isMaximized() }
    }
    return { ok: false, isMaximized: false }
  })
  ipcMain.handle('novel:window-apply-screen-mode', (_event, payload) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { ok: false, isMaximized: false }
    }

    const screen = String(payload?.screen || '')
    if (screen === 'writer') {
      if (!mainWindow.isMaximized()) {
        mainWindow.maximize()
      }
      return { ok: true, isMaximized: mainWindow.isMaximized() }
    }

    if (screen === 'projects') {
      if (mainWindow.isFullScreen()) {
        mainWindow.setFullScreen(false)
      }
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
      }
      const [width, height] = mainWindow.getSize()
      if (width !== 1200 || height !== 780) {
        mainWindow.setSize(1200, 780, true)
      }
      mainWindow.center()
      return { ok: true, isMaximized: mainWindow.isMaximized() }
    }

    return { ok: false, isMaximized: mainWindow.isMaximized() }
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: APP_DISPLAY_NAME,
    icon: APP_ICON_PATH,
    frame: false,
    width: 1460,
    height: 920,
    minWidth: 1200,
    minHeight: 760,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.webContents.on('context-menu', (event) => {
    event.preventDefault()
  })
  mainWindow.on('maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('novel:window-maximized-changed', { isMaximized: true })
    }
  })
  mainWindow.on('unmaximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('novel:window-maximized-changed', { isMaximized: false })
    }
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(async () => {
  app.setName(APP_DISPLAY_NAME)
  if (process.platform === 'win32') {
    app.setAppUserModelId(APP_ID)
  }
  cachePath = path.join(app.getPath('userData'), 'session-cache.json')
  skillsStorePath = path.join(app.getPath('userData'), 'skills-center.json')
  appSettingsPath = path.join(app.getPath('userData'), 'app-settings.json')
  activationStorePath = path.join(app.getPath('userData'), 'activation.json')
  await loadSessionStore()
  await loadSkillsStore()
  await loadAppSettings()
  await loadActivationStore()
  applyLaunchAtLoginSetting(appSettings.autoLaunch)
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

