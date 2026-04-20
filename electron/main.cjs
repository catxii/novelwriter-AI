const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const fs = require('fs/promises')
const path = require('path')
const { spawn } = require('child_process')

const DEFAULT_SYSTEM_PROMPT =
  'You are a fiction writing assistant. Keep character motives consistent and return usable prose.'
const SESSION_HISTORY_LIMIT = 32
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown'])
const OFFICIAL_SKILLS_DIR = 'E:\\novelwriter\\skills'
const DEFAULT_LANGUAGE = 'zh-CN'
const PROJECTS_DIR_BASENAME = 'NovelWriter Projects'

let mainWindow = null
let cachePath = ''
let sessionStore = { sessions: {} }
let skillsStorePath = ''
let skillsStore = { installedOfficial: [], installedCustom: [], customSkills: [] }
let appSettingsPath = ''
let appSettings = { language: DEFAULT_LANGUAGE, projectsDir: '' }

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
  return { language, projectsDir }
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

function getProjectSettingsPayload() {
  return {
    language: appSettings.language,
    projectsDir: appSettings.projectsDir,
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
  const clean = String(baseUrl || '').trim().replace(/\/+$/, '')
  if (!clean) return provider === 'ollama' ? 'http://localhost:11434' : ''
  return clean
}

function buildOpenAiUrl(baseUrl) {
  const clean = baseUrl.replace(/\/+$/, '')
  if (clean.endsWith('/chat/completions')) return clean
  if (clean.endsWith('/v1')) return `${clean}/chat/completions`
  return `${clean}/v1/chat/completions`
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
    }
  }
  return sessionStore.sessions[sessionId]
}

async function callModel(payload, session) {
  const provider = payload.provider
  const baseUrl = normalizeBaseUrl(payload.baseUrl, provider)
  const messages = session.messages

  if (provider === 'ollama') {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: payload.model,
        messages,
        stream: false,
        options: { temperature: payload.temperature },
      }),
    })
    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status}`)
    }
    const data = await response.json()
    if (data.error) throw new Error(data.error)
    return String(data?.message?.content || '').trim()
  }

  const response = await fetch(buildOpenAiUrl(baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(payload.apiKey ? { Authorization: `Bearer ${payload.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: payload.model,
      messages,
      temperature: payload.temperature,
    }),
  })
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`)
  }
  const data = await response.json()
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

  const session = ensureSession(payload)
  if (!Array.isArray(session.messages)) session.messages = []

  if (session.messages.length === 0) {
    const systemParts = [DEFAULT_SYSTEM_PROMPT]
    if (payload.skillsPrompt && String(payload.skillsPrompt).trim()) {
      systemParts.push(
        `Writing skills and guardrails (apply consistently):\n${String(payload.skillsPrompt).trim()}`
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
  session.messages = trimSessionMessages(session.messages)
  session.updatedAt = new Date().toISOString()
  await saveSessionStore()

  return {
    sessionId: session.id,
    output,
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

async function listOllamaModels(_event, payload) {
  const baseUrl = normalizeBaseUrl(payload?.baseUrl, 'ollama')
  const response = await fetch(`${baseUrl}/api/tags`)
  if (!response.ok) {
    throw new Error(`Ollama request failed: ${response.status}`)
  }

  const data = await response.json().catch(() => ({}))
  const rawModels = Array.isArray(data?.models) ? data.models : []
  const names = rawModels
    .map((item) => {
      if (typeof item?.name === 'string' && item.name.trim()) return item.name.trim()
      if (typeof item?.model === 'string' && item.model.trim()) return item.model.trim()
      return ''
    })
    .filter(Boolean)

  const models = [...new Set(names)].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  return { models }
}

async function getProjectSettings() {
  return getProjectSettingsPayload()
}

async function updateProjectSettings(_event, payload) {
  const nextLanguage =
    payload?.language === 'en-US' || payload?.language === 'zh-CN'
      ? payload.language
      : appSettings.language

  let nextProjectsDir = appSettings.projectsDir
  if (typeof payload?.projectsDir === 'string' && payload.projectsDir.trim()) {
    nextProjectsDir = await moveProjectStorageDirectory(payload.projectsDir)
  }

  appSettings = normalizeAppSettings({
    language: nextLanguage,
    projectsDir: nextProjectsDir,
  })
  await fs.mkdir(appSettings.projectsDir, { recursive: true })
  await saveAppSettings()
  return { ok: true, settings: getProjectSettingsPayload() }
}

async function pickProjectStorageDir() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择项目保存目录',
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
  ipcMain.handle('novel:project-settings-get', getProjectSettings)
  ipcMain.handle('novel:project-settings-update', updateProjectSettings)
  ipcMain.handle('novel:project-storage-pick-dir', pickProjectStorageDir)
  ipcMain.handle('novel:project-sync-index', syncProjectsIndex)
  ipcMain.handle('novel:project-sync-package', syncProjectPackage)
  ipcMain.handle('novel:project-open-package', openProjectPackage)
  ipcMain.handle('novel:project-delete-package', deleteProjectPackage)
}

function createWindow() {
  mainWindow = new BrowserWindow({
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

  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(async () => {
  cachePath = path.join(app.getPath('userData'), 'session-cache.json')
  skillsStorePath = path.join(app.getPath('userData'), 'skills-center.json')
  appSettingsPath = path.join(app.getPath('userData'), 'app-settings.json')
  await loadSessionStore()
  await loadSkillsStore()
  await loadAppSettings()
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
