import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import MonacoEditor, { loader, type OnMount } from '@monaco-editor/react'
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  WheelEvent as ReactWheelEvent
} from 'react'
import * as monacoApi from 'monaco-editor'
import type * as Monaco from 'monaco-editor'
import appLogo from '../icon/logo.png'
import aiBlotIcon from '../icon/ai-blot.png'
import writingIcon from '../icon/写作.png'
import createIcon from '../icon/新建.png'
import totalCharsIcon from '../icon/今日字数.png'
import streakIcon from '../icon/连续创作.png'
import worksIcon from '../icon/创作作品.png'
import todayCharsIcon from '../icon/新闻写作.png'
import homeBannerVideo from '../banner/banner1.mp4'
import titleBanner from '../banner/title-banner.png'
import './App.css'

loader.config({ monaco: monacoApi })

type ProviderKind = 'ollama' | 'openai'
type ActivePanel = 'memory' | 'settings' | 'result' | 'backup' | 'skills'
type ConnectionState = 'unknown' | 'checking' | 'connected' | 'failed'
type AppLanguage = 'zh-CN' | 'en-US'
type AssistantChatRole = 'user' | 'assistant'
type AssistantChatMessage = {
  id: number
  role: AssistantChatRole
  content: string
  createdAt: string
}

type ProviderConfig = {
  kind: ProviderKind
  baseUrl: string
  model: string
  apiKey: string
  temperature: number
}

type ActionKey = 'continue' | 'polish' | 'expand' | 'memory' | 'custom'
type WriterAction = {
  key: ActionKey
  hotkey: string
  title: string
  short: string
  instruction: string
}

type EditorContextMenuState = {
  open: boolean
  x: number
  y: number
}

type EditorContextMenuItem =
  | {
      key: string
      divider: true
    }
  | {
      key: string
      label: string
      shortcut?: string
      run: () => void | Promise<void>
      disabled: boolean
    }

type EditorSelectionRange = {
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
}

type SkillSource = 'official' | 'custom'
type SkillCatalogItem = {
  id: string
  key: string
  source: SkillSource
  name: string
  fileName: string
  installed: boolean
  canRename: boolean
  canDelete: boolean
  updatedAt: string
  content: string
}

type SkillsCenterPayload = {
  ok?: boolean
  catalog: SkillCatalogItem[]
  skillsPrompt: string
  officialDir?: string
}

type ModelRequestLogItem = {
  id: string
  createdAt: string
  provider: string
  model: string
  baseUrl: string
  instructionChars: number
  inputChars: number
  memoryCount: number
  skillsLoaded: boolean
  skillsInjected: boolean
  injectedThisRequest: boolean
}

type ModelRuntimeDiagnostics = {
  generatedAt: string
  skillsLoaded: boolean
  skillsInjected: boolean
  skillsHit: boolean
  injectedThisRequest: boolean
  skillsPromptHash: string
  systemPromptHash: string
  systemPromptPreview: string
  latestRequest?: ModelRequestLogItem
  requestLogs?: ModelRequestLogItem[]
}

type ChapterDropPosition = 'before' | 'after'
type ChapterKind = 'chapter' | 'special'
type SpecialPageType = 'frontispiece' | 'prologue' | 'interlude' | 'afterword' | 'special'
type WritingMode = 'novel' | 'script'
type MemoryKind = 'info' | 'role'
type RoleGraphView = 'list' | 'graph'
type BackupGraphView = 'list' | 'graph'
type GraphVisualSettings = {
  backgroundColor: string
  fontSize: number
  dimmedOpacity: number
}
type RoleLinkSide = 'top' | 'right' | 'bottom' | 'left'
type RoleRelationMode =
  | 'solid-directed'
  | 'solid-bidirectional'
  | 'dashed-directed'
  | 'dashed-bidirectional'
type ScriptLinePrefix = {
  lineNumber: number
  startColumn: number
  endColumn: number
  rawName: string
  normalizedName: string
  isNarrator: boolean
}

type ScriptRolePickerState = {
  lineNumber: number
  x: number
  y: number
  query: string
  currentName: string
}

type RoleRelation = {
  id: number
  fromMemoryId: number
  toMemoryId: number
  fromAnchor?: RoleLinkSide
  toAnchor?: RoleLinkSide
  curveOffsetX?: number
  curveOffsetY?: number
  mode: RoleRelationMode
  relation: string
  intimacy: number
  tags: string[]
  strokeColor: string
  createdAt: string
}

type BackupRelation = {
  id: number
  fromBackupId: number
  toBackupId: number
  fromAnchor?: RoleLinkSide
  toAnchor?: RoleLinkSide
  curveOffsetX?: number
  curveOffsetY?: number
  mode: RoleRelationMode
  causal: string
  strokeColor: string
  labelColor: string
  createdAt: string
}

type VersionHistoryItem = {
  id: number
  draft: string
  createdAt: string
  createdAtMs: number
}

type Version = {
  id: number
  title: string
  draft: string
  writingMode: WritingMode
  updatedAt: string
  history: VersionHistoryItem[]
  historyLastSavedAtMs: number
  assistantMessages: AssistantChatMessage[]
}
type Chapter = {
  id: number
  kind: ChapterKind
  specialType?: SpecialPageType
  title: string
  versions: Version[]
  activeVersionId: number
}

type BackupItem = {
  id: number
  title: string
  content: string
  backupX?: number
  backupY?: number
  createdAt: string
  updatedAt: string
}

type MemoryItem = {
  id: number
  kind: MemoryKind
  text: string
  roleName?: string
  roleNote?: string
  roleStance?: number
  roleX?: number
  roleY?: number
  chapterId: number
  chapterTitle: string
  versionId: number
  versionTitle: string
  createdAt: string
}

type LegacyChapter = {
  id?: number
  kind?: ChapterKind
  specialType?: SpecialPageType
  title?: string
  draft?: string
  versions?: Array<
    Partial<Version> & {
      history?: Array<Partial<VersionHistoryItem>>
      historyLastSavedAtMs?: number
    }
  >
  activeVersionId?: number
}

type WorkspaceData = {
  chapters?: LegacyChapter[]
  activeChapterId?: number
  memory?: Array<string | Partial<MemoryItem>>
  roleRelations?: Array<Partial<RoleRelation>>
  roleRelationTagOptions?: string[]
  backupRelations?: Array<Partial<BackupRelation>>
  writingMode?: WritingMode
  backups?: Array<Partial<BackupItem>>
  config?: Partial<ProviderConfig>
  customPrompt?: string
  skillsPrompt?: string
  sessionMap?: Record<string, string>
  skillModelName?: string
  roleGraphVisual?: Partial<GraphVisualSettings>
  backupGraphVisual?: Partial<GraphVisualSettings>
  draft?: string
}

type NormalizedWorkspace = {
  chapters: Chapter[]
  activeChapterId: number
  writingMode: WritingMode
  memory: MemoryItem[]
  roleRelations: RoleRelation[]
  roleRelationTagOptions: string[]
  backupRelations: BackupRelation[]
  backups: BackupItem[]
  config: ProviderConfig
  customPrompt: string
  skillsPrompt: string
  sessionMap: Record<string, string>
  skillModelName: string
  roleGraphVisual: GraphVisualSettings
  backupGraphVisual: GraphVisualSettings
}

type ProjectMeta = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

type ActivationStatus = {
  activated: boolean
  rawActivated?: boolean
  email: string
  activatedAt: string
  currentMachineMac?: string
  boundMachineMac?: string
  machineBound?: boolean
  mode: string
  projectLimit: number
  localModelAllowed: boolean
}

const STORAGE_KEY = 'novelwriter.workspace.v3'
const LEGACY_KEYS = ['novelwriter.workspace.v2', 'novelwriter.workspace.v1']
const PROJECT_INDEX_KEY = 'novelwriter.projects.v1'
const PROJECT_DATA_PREFIX = 'novelwriter.project.v1.'
const LAST_PROJECT_KEY = 'novelwriter.project.last.v1'
const LAST_SCREEN_KEY = 'novelwriter.screen.last.v1'
const MODEL_CONNECTION_SIGNATURE_KEY = 'novelwriter.model.connection.signature.v1'
const APP_DISPLAY_NAME = '超级兔子AI写作'
const APP_VERSION_FALLBACK = 'v 1.1 bate'

const actions: WriterAction[] = [
  {
    key: 'continue',
    hotkey: '1',
    title: '续写',
    short: '接住当前段落，继续推进冲突。',
    instruction:
      '请按当前文风续写 600 到 900 字，不要总结，不要解释，只输出可直接接在正文后的小说内容。'
  },
  {
    key: 'polish',
    hotkey: '2',
    title: '润色',
    short: '保留剧情，强化画面和节奏。',
    instruction:
      '请润色选中文本，保留剧情信息，增强动作、感官和句子节奏，只输出修改后的正文。'
  },
  {
    key: 'expand',
    hotkey: '3',
    title: '扩写',
    short: '把一句戏扩成一场戏。',
    instruction:
      '请扩写选中文本，补充动作细节、环境压力、人物心理和对话张力，只输出扩写后的正文。'
  },
  {
    key: 'memory',
    hotkey: '4',
    title: '记忆',
    short: '提取设定、人物、伏笔。',
    instruction:
      '请从文本中提取长期记忆，每条一行，格式为“类别：内容”，只输出记忆条目。'
  }
]

const nowLabel = () => new Date().toLocaleString('zh-CN', { hour12: false })
const lineCount = (text: string) => Math.max(1, text.split('\n').length)
const DAY_MS = 24 * 60 * 60 * 1000

function parseDayStartMs(label: string) {
  const match = label.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return null
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function countConsecutiveDays(dayMsList: number[]) {
  if (!dayMsList.length) return 0
  const daySet = new Set(dayMsList)
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  let streak = 0
  while (daySet.has(cursor.getTime())) {
    streak += 1
    cursor.setTime(cursor.getTime() - DAY_MS)
  }
  return streak
}
const createSessionId = () => `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
const EMPTY_VERSIONS: Version[] = []
const VERSION_TAB_BASE_WIDTH = 132
const VERSION_TAB_CHAR_WIDTH = 14
const VERSION_TAB_CLOSE_WIDTH = 18
const VERSION_ADD_BUTTON_WIDTH = 112
const VERSION_HISTORY_LIMIT = 10
const VERSION_HISTORY_INTERVAL_MS = 4 * 60 * 60 * 1000
const EDITOR_MENU_WIDTH = 260
const EDITOR_MENU_HEIGHT = 400
const ROLE_NODE_WIDTH = 188
const ROLE_NODE_HEIGHT = 94
const BACKUP_NODE_WIDTH = 228
const BACKUP_NODE_HEIGHT = 124
const ROLE_LINK_SIDES: RoleLinkSide[] = ['top', 'right', 'bottom', 'left']
const DEFAULT_ROLE_RELATION_MODE: RoleRelationMode = 'solid-directed'
const ROLE_RELATION_MIN_INTIMACY = -100
const ROLE_RELATION_MAX_INTIMACY = 100
const DEFAULT_ROLE_RELATION_TAG_OPTIONS = ['嫉妒', '崇拜', '深爱', '师徒', '暗恋', '同盟']
const ROLE_RELATION_TAG_MAX_OPTIONS = 64
const ROLE_RELATION_MODE_OPTIONS: Array<{
  mode: RoleRelationMode
  icon: string
  label: string
}> = [
  { mode: 'solid-directed', icon: '→', label: '单向实线' },
  { mode: 'solid-bidirectional', icon: '↔', label: '双向实线' },
  { mode: 'dashed-directed', icon: '⇢', label: '单向虚线' },
  { mode: 'dashed-bidirectional', icon: '⇄', label: '双向虚线' }
]
const DEFAULT_ROLE_RELATION_STROKE_COLOR = '#000000'
const DEFAULT_BACKUP_RELATION_STROKE_COLOR = '#000000'
const DEFAULT_BACKUP_RELATION_LABEL_COLOR = '#35506d'
const DEFAULT_ROLE_GRAPH_BG_COLOR = '#ffffff'
const DEFAULT_BACKUP_GRAPH_BG_COLOR = '#ffffff'
const DEFAULT_GRAPH_FONT_SIZE = 12
const GRAPH_FONT_SIZE_MIN = 10
const GRAPH_FONT_SIZE_MAX = 24
const DEFAULT_GRAPH_DIMMED_OPACITY = 0.3
const GRAPH_DIMMED_OPACITY_MIN = 0.1
const GRAPH_DIMMED_OPACITY_MAX = 0.9
const ROLE_GRAPH_MIN_SCALE = 0.4
const ROLE_GRAPH_MAX_SCALE = 2.4
const ROLE_GRAPH_ZOOM_FACTOR = 1.12
const SCRIPT_NARRATOR_NAMES = new Set(['旁白', 'narrator', 'narration'])
const SCRIPT_ROLE_COLOR_COUNT = 12
const SCRIPT_ROLE_PICKER_WIDTH = 640
const SCRIPT_ROLE_PICKER_HEIGHT = 360
const EDITOR_THEME_ID = 'novelwriter-dark'
const SPECIAL_PAGE_META: Record<
  SpecialPageType,
  { title: string; railLabel: string }
> = {
  frontispiece: { title: '扉页', railLabel: '扉' },
  prologue: { title: '序章', railLabel: '序' },
  interlude: { title: '幕间', railLabel: '间' },
  afterword: { title: '后记', railLabel: '后' },
  special: { title: '自定义页面', railLabel: '自' },
}

type LegacyBackupItem = Partial<{
  id: number
  title: string
  chapterId: number
  chapterTitle: string
  versionId: number
  versionTitle: string
  content: string
  backupX: number
  backupY: number
  createdAt: string
  updatedAt: string
}>
type LegacyBackupRelation = Partial<{
  id: number
  fromBackupId: number
  toBackupId: number
  fromAnchor: RoleLinkSide
  toAnchor: RoleLinkSide
  curveOffsetX: number
  curveOffsetY: number
  mode: RoleRelationMode
  causal: string
  strokeColor: string
  labelColor: string
  createdAt: string
}>
const SPECIAL_PAGE_OPTIONS: Array<{ type: SpecialPageType; label: string }> = [
  { type: 'frontispiece', label: '扉页' },
  { type: 'prologue', label: '序章' },
  { type: 'interlude', label: '幕间' },
  { type: 'afterword', label: '后记' },
  { type: 'special', label: '自定义页面' },
]

function normalizeBaseUrl(baseUrl: string, provider: ProviderKind) {
  const clean = baseUrl.trim().replace(/\/+$/, '')
  if (!clean) return provider === 'ollama' ? 'http://localhost:11434' : ''
  return clean
}

function buildModelConnectionSignature(config: ProviderConfig) {
  const normalizedBaseUrl = normalizeBaseUrl(config.baseUrl, config.kind)
  return [
    config.kind,
    normalizedBaseUrl,
    config.model.trim(),
    config.apiKey.trim()
  ].join('|')
}

function loadPersistedModelConnectionSignature() {
  try {
    return localStorage.getItem(MODEL_CONNECTION_SIGNATURE_KEY) ?? ''
  } catch {
    return ''
  }
}

function persistModelConnectionSignature(signature: string) {
  try {
    if (signature.trim()) {
      localStorage.setItem(MODEL_CONNECTION_SIGNATURE_KEY, signature.trim())
    }
  } catch {
    // ignore storage write errors
  }
}

function clearPersistedModelConnectionSignature(expectedSignature?: string) {
  try {
    if (!expectedSignature) {
      localStorage.removeItem(MODEL_CONNECTION_SIGNATURE_KEY)
      return
    }
    const current = localStorage.getItem(MODEL_CONNECTION_SIGNATURE_KEY) ?? ''
    if (current === expectedSignature) {
      localStorage.removeItem(MODEL_CONNECTION_SIGNATURE_KEY)
    }
  } catch {
    // ignore storage write errors
  }
}

function buildOpenAiUrl(baseUrl: string) {
  const clean = baseUrl.replace(/\/+$/, '')
  if (clean.endsWith('/chat/completions')) return clean
  if (clean.endsWith('/v1')) return `${clean}/chat/completions`
  return `${clean}/v1/chat/completions`
}

function defineEditorTheme(monaco: typeof Monaco) {
  monaco.editor.defineTheme(EDITOR_THEME_ID, {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#1f232a',
      'editorGutter.background': '#1f232a',
      'editor.lineHighlightBackground': '#1f232a',
      'editor.selectionBackground': '#ff8a3db8',
      'editor.inactiveSelectionBackground': '#ff8a3d96',
      'editor.selectionHighlightBackground': '#ff8a3d80',
      'editor.selectionHighlightBorder': '#00000000',
    }
  })
}

function pickOllamaModelNames(data: unknown) {
  if (!data || typeof data !== 'object') return []
  const models = Array.isArray((data as { models?: unknown[] }).models)
    ? (data as { models: unknown[] }).models
    : []
  const names = models
    .map((item) => {
      if (!item || typeof item !== 'object') return ''
      const name = (item as { name?: unknown }).name
      if (typeof name === 'string' && name.trim()) return name.trim()
      const model = (item as { model?: unknown }).model
      if (typeof model === 'string' && model.trim()) return model.trim()
      return ''
    })
    .filter(Boolean)
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

function pickPreferredOllamaModel(currentModel: string, models: string[]) {
  const current = currentModel.trim()
  if (current && models.includes(current)) return current
  return models[0] ?? ''
}

function toCloudModelName(name: string) {
  const value = name.trim()
  if (!value) return ''
  return /-cloud(?::|$)/i.test(value) ? value : `${value}-cloud`
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tagName = target.tagName.toLowerCase()
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return true
  if (target.closest('[contenteditable="true"]')) return true
  if (target.closest('.monaco-editor')) return true
  return false
}

function getRoleSidePoint(position: { x: number; y: number }, side: RoleLinkSide) {
  switch (side) {
    case 'top':
      return { x: position.x + ROLE_NODE_WIDTH / 2, y: position.y }
    case 'right':
      return { x: position.x + ROLE_NODE_WIDTH, y: position.y + ROLE_NODE_HEIGHT / 2 }
    case 'bottom':
      return { x: position.x + ROLE_NODE_WIDTH / 2, y: position.y + ROLE_NODE_HEIGHT }
    case 'left':
      return { x: position.x, y: position.y + ROLE_NODE_HEIGHT / 2 }
  }
}

function pickRoleSideForPoint(position: { x: number; y: number }, point: { x: number; y: number }) {
  const distances: Array<{ side: RoleLinkSide; distance: number }> = [
    { side: 'top', distance: Math.abs(point.y - position.y) },
    {
      side: 'right',
      distance: Math.abs(point.x - (position.x + ROLE_NODE_WIDTH))
    },
    {
      side: 'bottom',
      distance: Math.abs(point.y - (position.y + ROLE_NODE_HEIGHT))
    },
    { side: 'left', distance: Math.abs(point.x - position.x) }
  ]
  distances.sort((a, b) => a.distance - b.distance)
  return distances[0].side
}

function pickDefaultRoleSide(
  fromPos: { x: number; y: number },
  toPos: { x: number; y: number }
): RoleLinkSide {
  const fromCenterX = fromPos.x + ROLE_NODE_WIDTH / 2
  const fromCenterY = fromPos.y + ROLE_NODE_HEIGHT / 2
  const toCenterX = toPos.x + ROLE_NODE_WIDTH / 2
  const toCenterY = toPos.y + ROLE_NODE_HEIGHT / 2
  const dx = fromCenterX - toCenterX
  const dy = fromCenterY - toCenterY
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left'
  }
  return dy >= 0 ? 'bottom' : 'top'
}

function getBackupSidePoint(position: { x: number; y: number }, side: RoleLinkSide) {
  switch (side) {
    case 'top':
      return { x: position.x + BACKUP_NODE_WIDTH / 2, y: position.y }
    case 'right':
      return { x: position.x + BACKUP_NODE_WIDTH, y: position.y + BACKUP_NODE_HEIGHT / 2 }
    case 'bottom':
      return { x: position.x + BACKUP_NODE_WIDTH / 2, y: position.y + BACKUP_NODE_HEIGHT }
    case 'left':
      return { x: position.x, y: position.y + BACKUP_NODE_HEIGHT / 2 }
  }
}

function pickBackupSideForPoint(position: { x: number; y: number }, point: { x: number; y: number }) {
  const distances: Array<{ side: RoleLinkSide; distance: number }> = [
    { side: 'top', distance: Math.abs(point.y - position.y) },
    {
      side: 'right',
      distance: Math.abs(point.x - (position.x + BACKUP_NODE_WIDTH))
    },
    {
      side: 'bottom',
      distance: Math.abs(point.y - (position.y + BACKUP_NODE_HEIGHT))
    },
    { side: 'left', distance: Math.abs(point.x - position.x) }
  ]
  distances.sort((a, b) => a.distance - b.distance)
  return distances[0].side
}

function pickDefaultBackupSide(
  fromPos: { x: number; y: number },
  toPos: { x: number; y: number }
): RoleLinkSide {
  const fromCenterX = fromPos.x + BACKUP_NODE_WIDTH / 2
  const fromCenterY = fromPos.y + BACKUP_NODE_HEIGHT / 2
  const toCenterX = toPos.x + BACKUP_NODE_WIDTH / 2
  const toCenterY = toPos.y + BACKUP_NODE_HEIGHT / 2
  const dx = fromCenterX - toCenterX
  const dy = fromCenterY - toCenterY
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left'
  }
  return dy >= 0 ? 'bottom' : 'top'
}

function clampRoleStance(value: number) {
  if (!Number.isFinite(value)) return 5
  return Math.max(1, Math.min(10, Math.round(value)))
}

function getRoleStanceLabel(value: number) {
  if (value <= 3) return '正派'
  if (value >= 8) return '反派'
  return '中立'
}

function getRoleNodeToneStyle(stance: number): CSSProperties {
  const normalized = clampRoleStance(stance)

  if (normalized <= 3) {
    // 1 -> strongest green, 3 -> light green
    const strength = (4 - normalized) / 3
    const borderAlpha = 0.4 + strength * 0.35
    return {
      background: '#ffffff',
      borderColor: `rgba(36, 133, 63, ${borderAlpha.toFixed(3)})`
    }
  }

  if (normalized >= 8) {
    // 8 -> light red, 10 -> strongest red
    const strength = (normalized - 7) / 3
    const borderAlpha = 0.4 + strength * 0.35
    return {
      background: '#ffffff',
      borderColor: `rgba(189, 42, 23, ${borderAlpha.toFixed(3)})`
    }
  }

  // Neutral stays white
  return {
    background: '#ffffff',
    borderColor: 'rgba(36, 96, 160, 0.34)'
  }
}

function parseRoleRelationMode(value: unknown): RoleRelationMode {
  if (
    value === 'solid-directed' ||
    value === 'solid-bidirectional' ||
    value === 'dashed-directed' ||
    value === 'dashed-bidirectional'
  ) {
    return value
  }
  return 'solid-bidirectional'
}

function normalizeRelationColor(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase()
  return fallback
}

function normalizeGraphVisualSettings(
  value: unknown,
  fallbackBackgroundColor: string
): GraphVisualSettings {
  const next =
    value && typeof value === 'object'
      ? (value as Partial<GraphVisualSettings>)
      : ({} as Partial<GraphVisualSettings>)
  const backgroundColor = normalizeRelationColor(next.backgroundColor, fallbackBackgroundColor)
  const fontSizeRaw =
    typeof next.fontSize === 'number' && Number.isFinite(next.fontSize)
      ? next.fontSize
      : DEFAULT_GRAPH_FONT_SIZE
  const dimmedOpacityRaw =
    typeof next.dimmedOpacity === 'number' && Number.isFinite(next.dimmedOpacity)
      ? next.dimmedOpacity
      : DEFAULT_GRAPH_DIMMED_OPACITY
  return {
    backgroundColor,
    fontSize: clampNumber(Math.round(fontSizeRaw), GRAPH_FONT_SIZE_MIN, GRAPH_FONT_SIZE_MAX),
    dimmedOpacity:
      Math.round(
        clampNumber(dimmedOpacityRaw, GRAPH_DIMMED_OPACITY_MIN, GRAPH_DIMMED_OPACITY_MAX) * 100
      ) / 100
  }
}

function isRoleRelationDashed(mode: RoleRelationMode) {
  return mode === 'dashed-directed' || mode === 'dashed-bidirectional'
}

function isRoleRelationBidirectional(mode: RoleRelationMode) {
  return mode === 'solid-bidirectional' || mode === 'dashed-bidirectional'
}

function getRoleRelationModeText(mode: RoleRelationMode) {
  if (mode === 'solid-directed') return '单向实线'
  if (mode === 'solid-bidirectional') return '双向实线'
  if (mode === 'dashed-directed') return '单向虚线'
  return '双向虚线'
}

function normalizeRelationIntimacy(value: number) {
  if (!Number.isFinite(value)) return 0
  return clampNumber(Math.round(value), ROLE_RELATION_MIN_INTIMACY, ROLE_RELATION_MAX_INTIMACY)
}

function splitRelationTags(raw: string) {
  return [...new Set(
    raw
      .split(/[，,、\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  )].slice(0, 12)
}

function normalizeRoleRelationTagOptions(raw: unknown): string[] {
  const base = DEFAULT_ROLE_RELATION_TAG_OPTIONS
  if (!Array.isArray(raw)) return [...base]
  const seen = new Set<string>()
  const output: string[] = []
  for (const item of base) {
    const key = item.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    output.push(item.trim())
  }
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const tag = item.trim()
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    output.push(tag)
    if (output.length >= ROLE_RELATION_TAG_MAX_OPTIONS) break
  }
  return output
}

function mergeRoleRelationTagOptions(current: string[], rawInput: string): string[] {
  const incoming = splitRelationTags(rawInput)
  if (!incoming.length) return current
  const seen = new Set<string>()
  const output: string[] = []
  for (const item of current) {
    const tag = item.trim()
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    output.push(tag)
  }
  for (const tag of incoming) {
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    output.push(tag)
    if (output.length >= ROLE_RELATION_TAG_MAX_OPTIONS) break
  }
  return output
}

function getRoleIntimacyLabel(intimacy: number) {
  if (intimacy >= 75) return '生死相依'
  if (intimacy >= 45) return '亲密'
  if (intimacy >= 15) return '友好'
  if (intimacy <= -75) return '不共戴天'
  if (intimacy <= -45) return '敌对'
  if (intimacy <= -15) return '疏离'
  return '中性'
}

function getRoleRelationDisplayText(relation: Pick<RoleRelation, 'relation' | 'tags' | 'intimacy'>) {
  const relationText = relation.relation.trim()
  if (relationText) return relationText
  const tags = Array.isArray(relation.tags) ? relation.tags.filter(Boolean) : []
  if (tags.length > 0) return tags.join('、')
  const intimacy = normalizeRelationIntimacy(relation.intimacy ?? 0)
  return `亲密度 ${intimacy}`
}

function getRoleRelationControlPoint(
  fromPoint: { x: number; y: number },
  toPoint: { x: number; y: number },
  relation: Pick<RoleRelation, 'curveOffsetX' | 'curveOffsetY'>
) {
  const midX = (fromPoint.x + toPoint.x) / 2
  const midY = (fromPoint.y + toPoint.y) / 2
  return {
    x: midX + (Number.isFinite(relation.curveOffsetX as number) ? (relation.curveOffsetX as number) : 0),
    y: midY + (Number.isFinite(relation.curveOffsetY as number) ? (relation.curveOffsetY as number) : 0)
  }
}

function getQuadraticBezierPoint(
  start: { x: number; y: number },
  control: { x: number; y: number },
  end: { x: number; y: number },
  t: number
) {
  const clampedT = clampNumber(t, 0, 1)
  const oneMinusT = 1 - clampedT
  return {
    x: oneMinusT * oneMinusT * start.x + 2 * oneMinusT * clampedT * control.x + clampedT * clampedT * end.x,
    y: oneMinusT * oneMinusT * start.y + 2 * oneMinusT * clampedT * control.y + clampedT * clampedT * end.y
  }
}

function getRoleStanceEmoji(stance: number) {
  const normalized = clampRoleStance(stance)
  if (normalized <= 2) return '😃'
  if (normalized <= 4) return '😊'
  if (normalized <= 6) return '😐'
  if (normalized <= 8) return '😡'
  return '👿'
}

function buildRoleMemoryText(name: string, note: string) {
  const normalizedName = name.trim()
  const normalizedNote = note.trim()
  if (!normalizedName) return normalizedNote
  return normalizedNote ? `${normalizedName}：${normalizedNote}` : normalizedName
}

function parseLegacyRoleText(text: string) {
  const raw = text.trim()
  if (!raw) {
    return { roleName: '新角色', roleNote: '' }
  }
  const match = raw.match(/^([^：:|\n]{1,64})[：:|]\s*(.+)$/)
  if (!match) return { roleName: raw, roleNote: '' }
  return {
    roleName: match[1].trim() || raw,
    roleNote: match[2].trim()
  }
}

function countSnapshotChars(snapshot: NormalizedWorkspace) {
  return snapshot.chapters.reduce(
    (chapterSum, chapter) =>
      chapterSum +
      chapter.versions.reduce((versionSum, version) => {
        const compact = String(version.draft || '').replace(/\s/g, '')
        return versionSum + compact.length
      }, 0),
    0
  )
}

function parseAssistantModelOutput(raw: string) {
  type AssistantApplyScope = 'none' | 'selection' | 'full'
  const text = raw.trim()
  if (!text) {
    return {
      reply: '已处理。',
      apply: false,
      scope: 'none' as AssistantApplyScope,
      updatedDraft: '',
      updatedSelection: ''
    }
  }

  const parseFromString = (value: string) => {
    try {
      const parsed = JSON.parse(value) as {
        reply?: unknown
        apply?: unknown
        scope?: unknown
        updatedDraft?: unknown
        updatedSelection?: unknown
      }
      let scope: AssistantApplyScope = 'none'
      if (parsed.scope === 'selection' || parsed.scope === 'full' || parsed.scope === 'none') {
        scope = parsed.scope
      }
      return {
        reply: typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim() : '',
        apply: Boolean(parsed.apply),
        scope,
        updatedDraft:
          typeof parsed.updatedDraft === 'string' && parsed.updatedDraft.trim()
            ? parsed.updatedDraft.trim()
            : '',
        updatedSelection:
          typeof parsed.updatedSelection === 'string' && parsed.updatedSelection.trim()
            ? parsed.updatedSelection.trim()
            : ''
      }
    } catch {
      return null
    }
  }

  const normalizeParsedResult = (parsed: {
    reply: string
    apply: boolean
    scope: AssistantApplyScope
    updatedDraft: string
    updatedSelection: string
  }) => {
    const hasSelectionUpdate = Boolean(parsed.updatedSelection)
    const hasDraftUpdate = Boolean(parsed.updatedDraft)
    const normalizedScope =
      parsed.scope === 'selection'
        ? hasSelectionUpdate
          ? 'selection'
          : 'none'
        : parsed.scope === 'full'
          ? hasDraftUpdate
            ? 'full'
            : 'none'
          : hasSelectionUpdate
            ? 'selection'
            : hasDraftUpdate
              ? 'full'
              : 'none'
    const normalizedApply =
      (parsed.apply || hasSelectionUpdate || hasDraftUpdate) && normalizedScope !== 'none'
    return {
      reply: parsed.reply || (normalizedApply ? '已按你的要求更新正文。' : '已收到。'),
      apply: normalizedApply,
      scope: normalizedScope,
      updatedDraft: parsed.updatedDraft,
      updatedSelection: parsed.updatedSelection
    }
  }

  const direct = parseFromString(text)
  if (direct) {
    return normalizeParsedResult(direct)
  }

  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first >= 0 && last > first) {
    const sliced = parseFromString(text.slice(first, last + 1))
    if (sliced) {
      return normalizeParsedResult(sliced)
    }
  }

  return { reply: text, apply: false, scope: 'none' as const, updatedDraft: '', updatedSelection: '' }
}

function isAssistantEditRequest(message: string) {
  const normalized = message.replace(/\s+/g, '').toLowerCase()
  if (!normalized) return false
  const keywords = [
    '改',
    '修改',
    '替换',
    '润色',
    '扩写',
    '重写',
    '精简',
    '优化',
    '改成',
    '改为',
    '续写',
    '补充'
  ]
  return keywords.some((keyword) => normalized.includes(keyword))
}

function resolveAssistantFallbackScope(message: string, hasSelection: boolean): 'selection' | 'full' {
  const normalized = message.replace(/\s+/g, '')
  const fullPattern = /(整章|整篇|全文|全篇|整段|通篇|整体|当前版本|本章全部)/i
  if (fullPattern.test(normalized) || !hasSelection) {
    return 'full'
  }
  const selectionPattern = /(选中|这段|这一段|这句话|这句|局部|片段|选取)/i
  if (selectionPattern.test(normalized)) {
    return 'selection'
  }
  return 'selection'
}

function normalizeHistoryItems(items: unknown): VersionHistoryItem[] {
  if (!Array.isArray(items) || items.length === 0) return []
  return items
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null
      const raw = item as Partial<VersionHistoryItem>
      const draft = typeof raw.draft === 'string' ? raw.draft : ''
      const createdAt =
        typeof raw.createdAt === 'string' && raw.createdAt.trim()
          ? raw.createdAt
          : nowLabel()
      const createdAtMs =
        typeof raw.createdAtMs === 'number' && Number.isFinite(raw.createdAtMs)
          ? raw.createdAtMs
          : Date.now() + index
      const id =
        typeof raw.id === 'number' && Number.isFinite(raw.id) ? raw.id : createdAtMs + index
      return {
        id,
        draft,
        createdAt,
        createdAtMs
      }
    })
    .filter((item): item is VersionHistoryItem => item !== null)
    .sort((a, b) => a.createdAtMs - b.createdAtMs)
    .slice(-VERSION_HISTORY_LIMIT)
}

function normalizeAssistantMessages(items: unknown): AssistantChatMessage[] {
  if (!Array.isArray(items) || items.length === 0) return []
  return items
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null
      const raw = item as Partial<AssistantChatMessage>
      const role: AssistantChatRole = raw.role === 'assistant' ? 'assistant' : 'user'
      const content = typeof raw.content === 'string' ? raw.content : ''
      if (!content.trim()) return null
      const id =
        typeof raw.id === 'number' && Number.isFinite(raw.id) ? raw.id : Date.now() + index
      const createdAt =
        typeof raw.createdAt === 'string' && raw.createdAt.trim() ? raw.createdAt : nowLabel()
      return {
        id,
        role,
        content,
        createdAt
      }
    })
    .filter((item): item is AssistantChatMessage => item !== null)
}

function buildVersion(
  id: number,
  index: number,
  draft: string,
  writingMode: WritingMode = 'novel',
  updatedAt = nowLabel(),
  history: VersionHistoryItem[] = [],
  historyLastSavedAtMs?: number,
  assistantMessages: AssistantChatMessage[] = []
): Version {
  const normalizedHistory = normalizeHistoryItems(history)
  const fallbackSavedAt =
    normalizedHistory.length > 0
      ? normalizedHistory[normalizedHistory.length - 1].createdAtMs
      : Date.now()
  return {
    id,
    title: `版本${index}`,
    draft,
    writingMode,
    updatedAt,
    history: normalizedHistory,
    historyLastSavedAtMs:
      typeof historyLastSavedAtMs === 'number' && Number.isFinite(historyLastSavedAtMs)
        ? historyLastSavedAtMs
        : fallbackSavedAt,
    assistantMessages: normalizeAssistantMessages(assistantMessages)
  }
}

function withOrderedChapterTitles(items: Chapter[]) {
  let chapterIndex = 0
  return items.map((chapter) => {
    if (chapter.kind !== 'chapter') return chapter
    chapterIndex += 1
    const orderedTitle = `第${chapterIndex}章`
    return chapter.title === orderedTitle ? chapter : { ...chapter, title: orderedTitle }
  })
}

function buildUniqueSpecialTitle(items: Chapter[], baseTitle: string) {
  const used = new Set(items.filter((item) => item.kind === 'special').map((item) => item.title))
  if (!used.has(baseTitle)) return baseTitle
  let idx = 2
  while (used.has(`${baseTitle}${idx}`)) {
    idx += 1
  }
  return `${baseTitle}${idx}`
}

function inferChapterKind(input: LegacyChapter): ChapterKind {
  if (input.kind === 'special') return 'special'
  return 'chapter'
}

function estimateVersionTabWidth(title: string, canDelete: boolean) {
  const labelWidth = Math.max(title.trim().length * VERSION_TAB_CHAR_WIDTH, 56)
  const closeWidth = canDelete ? VERSION_TAB_CLOSE_WIDTH : 0
  return Math.max(VERSION_TAB_BASE_WIDTH, labelWidth + closeWidth + 38)
}

function areSameNumberList(a: number[], b: number[]) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function areSameAssistantMessages(a: AssistantChatMessage[], b: AssistantChatMessage[]) {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (
      a[i].id !== b[i].id ||
      a[i].role !== b[i].role ||
      a[i].content !== b[i].content ||
      a[i].createdAt !== b[i].createdAt
    ) {
      return false
    }
  }
  return true
}

function pickVisibleVersionIds(
  versions: Version[],
  widthById: Map<number, number>,
  availableWidth: number,
  activeVersionId: number
) {
  if (!versions.length) return []
  const safeWidth = Math.max(availableWidth, 0)
  if (safeWidth <= 24) return [activeVersionId]

  const visible: number[] = []
  let used = 0
  for (const version of versions) {
    const width = widthById.get(version.id) ?? VERSION_TAB_BASE_WIDTH
    if (used + width <= safeWidth) {
      visible.push(version.id)
      used += width
    }
  }

  if (visible.length === versions.length) return visible
  if (visible.includes(activeVersionId)) return visible

  const activeWidth = widthById.get(activeVersionId) ?? VERSION_TAB_BASE_WIDTH
  const budgetForOthers = Math.max(safeWidth - activeWidth, 0)
  const chosen = new Set<number>([activeVersionId])
  let usedByOthers = 0
  for (const version of versions) {
    if (version.id === activeVersionId) continue
    const width = widthById.get(version.id) ?? VERSION_TAB_BASE_WIDTH
    if (usedByOthers + width <= budgetForOthers) {
      chosen.add(version.id)
      usedByOthers += width
    }
  }

  return versions.filter((version) => chosen.has(version.id)).map((version) => version.id)
}

function normalizeChapter(
  input: LegacyChapter,
  index: number,
  fallbackWritingMode: WritingMode
): Chapter {
  const id = typeof input.id === 'number' ? input.id : index + 1
  const kind = inferChapterKind(input)
  const specialType =
    kind === 'special' && input.specialType && input.specialType in SPECIAL_PAGE_META
      ? input.specialType
      : undefined
  const fallbackTitle =
    kind === 'special'
      ? SPECIAL_PAGE_META[specialType ?? 'special'].title
      : `第${index + 1}章`
  const title =
    typeof input.title === 'string' && input.title.trim()
      ? input.title
      : fallbackTitle

  if (Array.isArray(input.versions) && input.versions.length > 0) {
    const versions: Version[] = input.versions.map((version, versionIndex) => {
      const normalizedHistory = normalizeHistoryItems(version.history)
      const fallbackSavedAt =
        normalizedHistory.length > 0
          ? normalizedHistory[normalizedHistory.length - 1].createdAtMs
          : Date.now()
      const normalizedAssistantMessages = normalizeAssistantMessages(version.assistantMessages)
      return {
        id: typeof version.id === 'number' ? version.id : versionIndex + 1,
        title:
          typeof version.title === 'string' && version.title.trim()
            ? version.title
            : `版本${versionIndex + 1}`,
        draft: typeof version.draft === 'string' ? version.draft : '',
        writingMode: version.writingMode === 'script' ? 'script' : fallbackWritingMode,
        updatedAt:
          typeof version.updatedAt === 'string' && version.updatedAt.trim()
            ? version.updatedAt
            : nowLabel(),
        history: normalizedHistory,
        historyLastSavedAtMs:
          typeof version.historyLastSavedAtMs === 'number' &&
          Number.isFinite(version.historyLastSavedAtMs)
            ? version.historyLastSavedAtMs
            : fallbackSavedAt,
        assistantMessages: normalizedAssistantMessages
      }
    })
    const activeVersionId =
      typeof input.activeVersionId === 'number' &&
      versions.some((version) => version.id === input.activeVersionId)
        ? input.activeVersionId
        : versions[0].id
    return { id, kind, specialType, title, versions, activeVersionId }
  }

  const firstVersion = buildVersion(
    1,
    1,
    typeof input.draft === 'string' ? input.draft : '',
    fallbackWritingMode
  )
  return { id, kind, specialType, title, versions: [firstVersion], activeVersionId: firstVersion.id }
}

function normalizeRoleName(raw: string) {
  return raw
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[|｜]/g, '')
    .replace(/^[：:【\[\s]+|[】\]\s：:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function createProjectId() {
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function projectStorageKey(projectId: string) {
  return `${PROJECT_DATA_PREFIX}${projectId}`
}

function createDefaultConfig(): ProviderConfig {
  return {
    kind: 'ollama',
    baseUrl: 'http://localhost:11434',
    model: 'gemma4:e2b',
    apiKey: '',
    temperature: 0.7
  }
}

function createDefaultWorkspace(): NormalizedWorkspace {
  const firstChapter: Chapter = {
    id: 1,
    kind: 'chapter',
    title: '第1章',
    versions: [buildVersion(1, 1, '', 'novel')],
    activeVersionId: 1
  }
  return {
    chapters: [firstChapter],
    activeChapterId: firstChapter.id,
    writingMode: 'novel',
    memory: [],
    roleRelations: [],
    roleRelationTagOptions: [...DEFAULT_ROLE_RELATION_TAG_OPTIONS],
    backupRelations: [],
    backups: [],
    config: createDefaultConfig(),
    customPrompt: '为下一章提供 3 个悬念钩子。',
    skillsPrompt: '',
    sessionMap: {},
    skillModelName: '',
    roleGraphVisual: {
      backgroundColor: DEFAULT_ROLE_GRAPH_BG_COLOR,
      fontSize: DEFAULT_GRAPH_FONT_SIZE,
      dimmedOpacity: DEFAULT_GRAPH_DIMMED_OPACITY
    },
    backupGraphVisual: {
      backgroundColor: DEFAULT_BACKUP_GRAPH_BG_COLOR,
      fontSize: DEFAULT_GRAPH_FONT_SIZE,
      dimmedOpacity: DEFAULT_GRAPH_DIMMED_OPACITY
    }
  }
}

function toWorkspaceData(snapshot: NormalizedWorkspace): WorkspaceData {
  return {
    chapters: snapshot.chapters,
    activeChapterId: snapshot.activeChapterId,
    writingMode: snapshot.writingMode,
    memory: snapshot.memory,
    roleRelations: snapshot.roleRelations,
    roleRelationTagOptions: snapshot.roleRelationTagOptions,
    backupRelations: snapshot.backupRelations,
    backups: snapshot.backups,
    config: snapshot.config,
    customPrompt: snapshot.customPrompt,
    skillsPrompt: snapshot.skillsPrompt,
    sessionMap: snapshot.sessionMap,
    skillModelName: snapshot.skillModelName,
    roleGraphVisual: snapshot.roleGraphVisual,
    backupGraphVisual: snapshot.backupGraphVisual
  }
}

function normalizeWorkspaceData(parsed: WorkspaceData): NormalizedWorkspace | null {
  const fallbackWritingMode: WritingMode = parsed.writingMode === 'script' ? 'script' : 'novel'
  let chapters: Chapter[] = []
  if (Array.isArray(parsed.chapters) && parsed.chapters.length > 0) {
    chapters = parsed.chapters.map((chapter, index) =>
      normalizeChapter(chapter, index, fallbackWritingMode)
    )
  } else if (typeof parsed.draft === 'string') {
    chapters = [
      {
        id: 1,
        kind: 'chapter',
        title: '第1章',
        versions: [buildVersion(1, 1, parsed.draft, fallbackWritingMode)],
        activeVersionId: 1
      }
    ]
  }
  if (chapters.length === 0) return null
  chapters = withOrderedChapterTitles(chapters)

  const activeChapterId =
    typeof parsed.activeChapterId === 'number' &&
    chapters.some((chapter) => chapter.id === parsed.activeChapterId)
      ? parsed.activeChapterId
      : chapters[0].id

  const activeChapter =
    chapters.find((chapter) => chapter.id === activeChapterId) ?? chapters[0]
  const activeVersion =
    activeChapter.versions.find((version) => version.id === activeChapter.activeVersionId) ??
    activeChapter.versions[0]

  let memory: MemoryItem[] = Array.isArray(parsed.memory)
    ? parsed.memory.reduce<MemoryItem[]>((acc, entry, index) => {
        const text =
          typeof entry === 'string'
            ? entry
            : typeof entry?.text === 'string'
              ? entry.text
              : ''
        if (!text.trim()) return acc

        const chapter =
          typeof entry === 'object' &&
          entry &&
          typeof entry.chapterId === 'number' &&
          chapters.some((item) => item.id === entry.chapterId)
            ? (chapters.find((item) => item.id === entry.chapterId) ?? activeChapter)
            : activeChapter
        const version =
          typeof entry === 'object' &&
          entry &&
          typeof entry.versionId === 'number' &&
          chapter.versions.some((item) => item.id === entry.versionId)
            ? (chapter.versions.find((item) => item.id === entry.versionId) ??
              chapter.versions[0])
            : (chapter.versions.find((item) => item.id === chapter.activeVersionId) ??
              chapter.versions[0])

        const kind: MemoryKind =
          typeof entry === 'object' &&
          entry &&
          (entry.kind === 'role' || entry.kind === 'info')
            ? entry.kind
            : 'info'
        const trimmedText = text.trim()
        const parsedRole = kind === 'role' ? parseLegacyRoleText(trimmedText) : null
        const roleName =
          kind === 'role'
            ? typeof entry === 'object' &&
              entry &&
              typeof entry.roleName === 'string' &&
              entry.roleName.trim()
              ? entry.roleName.trim()
              : (parsedRole?.roleName ?? '新角色')
            : undefined
        const roleNote =
          kind === 'role'
            ? typeof entry === 'object' &&
              entry &&
              typeof entry.roleNote === 'string'
              ? entry.roleNote
              : (parsedRole?.roleNote ?? '')
            : undefined
        const roleStance =
          kind === 'role'
            ? clampRoleStance(
                typeof entry === 'object' && entry && typeof entry.roleStance === 'number'
                  ? entry.roleStance
                  : 5
              )
            : undefined
        const roleX =
          kind === 'role' &&
          typeof entry === 'object' &&
          entry &&
          typeof entry.roleX === 'number' &&
          Number.isFinite(entry.roleX)
            ? entry.roleX
            : undefined
        const roleY =
          kind === 'role' &&
          typeof entry === 'object' &&
          entry &&
          typeof entry.roleY === 'number' &&
          Number.isFinite(entry.roleY)
            ? entry.roleY
            : undefined

        acc.push({
          id:
            typeof entry === 'object' && entry && typeof entry.id === 'number'
              ? entry.id
              : Date.now() + index,
          kind,
          text:
            kind === 'role' ? buildRoleMemoryText(roleName ?? '新角色', roleNote ?? '') : trimmedText,
          roleName,
          roleNote,
          roleStance,
          roleX,
          roleY,
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          versionId: version.id,
          versionTitle: version.title,
          createdAt:
            typeof entry === 'object' &&
            entry &&
            typeof entry.createdAt === 'string' &&
            entry.createdAt.trim()
              ? entry.createdAt
              : nowLabel()
        })
        return acc
      }, [])
    : []

  const roleIdRemap = new Map<number, number>()
  if (memory.length > 0) {
    const roleNameToCanonicalId = new Map<string, number>()
    memory = memory.filter((item) => {
      if (item.kind !== 'role') return true
      const baseRoleName =
        typeof item.roleName === 'string' && item.roleName.trim()
          ? item.roleName
          : parseLegacyRoleText(item.text).roleName
      const normalized = normalizeRoleName(baseRoleName).toLowerCase()
      if (!normalized) return true
      const existingId = roleNameToCanonicalId.get(normalized)
      if (typeof existingId === 'number') {
        roleIdRemap.set(item.id, existingId)
        return false
      }
      roleNameToCanonicalId.set(normalized, item.id)
      return true
    })
  }

  const roleMemoryIds = new Set(memory.filter((item) => item.kind === 'role').map((item) => item.id))
  const roleRelations: RoleRelation[] = Array.isArray(parsed.roleRelations)
    ? parsed.roleRelations.reduce<RoleRelation[]>((acc, entry, index) => {
        if (!entry || typeof entry !== 'object') return acc
        const fromMemoryIdRaw = typeof entry.fromMemoryId === 'number' ? entry.fromMemoryId : NaN
        const toMemoryIdRaw = typeof entry.toMemoryId === 'number' ? entry.toMemoryId : NaN
        const fromMemoryId = roleIdRemap.get(fromMemoryIdRaw) ?? fromMemoryIdRaw
        const toMemoryId = roleIdRemap.get(toMemoryIdRaw) ?? toMemoryIdRaw
        if (!Number.isFinite(fromMemoryId) || !Number.isFinite(toMemoryId)) return acc
        if (!roleMemoryIds.has(fromMemoryId) || !roleMemoryIds.has(toMemoryId)) return acc
        const relation =
          typeof entry.relation === 'string' && entry.relation.trim() ? entry.relation.trim() : ''
        const fromAnchor: RoleLinkSide | undefined =
          entry.fromAnchor === 'top' ||
          entry.fromAnchor === 'right' ||
          entry.fromAnchor === 'bottom' ||
          entry.fromAnchor === 'left'
            ? entry.fromAnchor
            : entry.fromAnchor === 'top-left' || entry.fromAnchor === 'top-right'
              ? 'top'
              : entry.fromAnchor === 'bottom-left' || entry.fromAnchor === 'bottom-right'
                ? 'bottom'
                : undefined
        const toAnchor: RoleLinkSide | undefined =
          entry.toAnchor === 'top' ||
          entry.toAnchor === 'right' ||
          entry.toAnchor === 'bottom' ||
          entry.toAnchor === 'left'
            ? entry.toAnchor
            : undefined
        const curveOffsetX =
          typeof (entry as { curveOffsetX?: unknown }).curveOffsetX === 'number' &&
          Number.isFinite((entry as { curveOffsetX?: number }).curveOffsetX)
            ? ((entry as { curveOffsetX?: number }).curveOffsetX as number)
            : 0
        const curveOffsetY =
          typeof (entry as { curveOffsetY?: unknown }).curveOffsetY === 'number' &&
          Number.isFinite((entry as { curveOffsetY?: number }).curveOffsetY)
            ? ((entry as { curveOffsetY?: number }).curveOffsetY as number)
            : 0
        const mode = parseRoleRelationMode((entry as { mode?: unknown }).mode)
        const strokeColor = normalizeRelationColor(
          (entry as { strokeColor?: unknown }).strokeColor,
          DEFAULT_ROLE_RELATION_STROKE_COLOR
        )
        const intimacy = normalizeRelationIntimacy(
          typeof (entry as { intimacy?: unknown }).intimacy === 'number'
            ? ((entry as { intimacy?: number }).intimacy as number)
            : 0
        )
        const tags = Array.isArray((entry as { tags?: unknown }).tags)
          ? [...new Set(
              ((entry as { tags?: unknown[] }).tags as unknown[])
                .map((item) => (typeof item === 'string' ? item.trim() : ''))
                .filter(Boolean)
            )].slice(0, 12)
          : []
        acc.push({
          id: typeof entry.id === 'number' ? entry.id : Date.now() + index,
          fromMemoryId,
          toMemoryId,
          ...(fromAnchor ? { fromAnchor } : {}),
          ...(toAnchor ? { toAnchor } : {}),
          curveOffsetX,
          curveOffsetY,
          mode,
          relation,
          intimacy,
          tags,
          strokeColor,
          createdAt:
            typeof entry.createdAt === 'string' && entry.createdAt.trim() ? entry.createdAt : nowLabel()
        })
        return acc
      }, [])
    : []

  const backups: BackupItem[] = Array.isArray(parsed.backups)
    ? parsed.backups
        .map((rawItem, index) => {
          const backup = rawItem as LegacyBackupItem
          const content = typeof backup.content === 'string' ? backup.content : ''
          const legacyTitleParts = [
            typeof backup.chapterTitle === 'string' ? backup.chapterTitle.trim() : '',
            typeof backup.versionTitle === 'string' ? backup.versionTitle.trim() : ''
          ].filter(Boolean)
          const title =
            typeof backup.title === 'string' && backup.title.trim()
              ? backup.title.trim()
              : legacyTitleParts.length > 0
                ? legacyTitleParts.join(' / ')
                : `参考${index + 1}`
          const createdAt =
            typeof backup.createdAt === 'string' && backup.createdAt.trim()
              ? backup.createdAt
              : nowLabel()
          const updatedAt =
            typeof backup.updatedAt === 'string' && backup.updatedAt.trim()
              ? backup.updatedAt
              : createdAt
          const backupX =
            typeof backup.backupX === 'number' && Number.isFinite(backup.backupX)
              ? backup.backupX
              : undefined
          const backupY =
            typeof backup.backupY === 'number' && Number.isFinite(backup.backupY)
              ? backup.backupY
              : undefined
          return {
            id: typeof backup.id === 'number' ? backup.id : Date.now() + index,
            title,
            content,
            ...(typeof backupX === 'number' ? { backupX } : {}),
            ...(typeof backupY === 'number' ? { backupY } : {}),
            createdAt,
            updatedAt
          }
        })
        .filter((item) => item.content.trim() || item.title.trim())
    : []
  const backupIdSet = new Set(backups.map((item) => item.id))
  const backupRelations: BackupRelation[] = Array.isArray(parsed.backupRelations)
    ? parsed.backupRelations.reduce<BackupRelation[]>((acc, entry, index) => {
        if (!entry || typeof entry !== 'object') return acc
        const relation = entry as LegacyBackupRelation
        const fromBackupId =
          typeof relation.fromBackupId === 'number' ? relation.fromBackupId : NaN
        const toBackupId = typeof relation.toBackupId === 'number' ? relation.toBackupId : NaN
        if (!Number.isFinite(fromBackupId) || !Number.isFinite(toBackupId)) return acc
        if (!backupIdSet.has(fromBackupId) || !backupIdSet.has(toBackupId)) return acc
        if (fromBackupId === toBackupId) return acc
        const fromAnchor: RoleLinkSide | undefined =
          relation.fromAnchor === 'top' ||
          relation.fromAnchor === 'right' ||
          relation.fromAnchor === 'bottom' ||
          relation.fromAnchor === 'left'
            ? relation.fromAnchor
            : undefined
        const toAnchor: RoleLinkSide | undefined =
          relation.toAnchor === 'top' ||
          relation.toAnchor === 'right' ||
          relation.toAnchor === 'bottom' ||
          relation.toAnchor === 'left'
            ? relation.toAnchor
            : undefined
        const curveOffsetX =
          typeof relation.curveOffsetX === 'number' && Number.isFinite(relation.curveOffsetX)
            ? relation.curveOffsetX
            : 0
        const curveOffsetY =
          typeof relation.curveOffsetY === 'number' && Number.isFinite(relation.curveOffsetY)
            ? relation.curveOffsetY
            : 0
        const mode = parseRoleRelationMode(relation.mode)
        const causal =
          typeof relation.causal === 'string' && relation.causal.trim()
            ? relation.causal.trim()
            : '因果'
        const strokeColor = normalizeRelationColor(
          relation.strokeColor,
          DEFAULT_BACKUP_RELATION_STROKE_COLOR
        )
        const labelColor = normalizeRelationColor(
          relation.labelColor,
          DEFAULT_BACKUP_RELATION_LABEL_COLOR
        )
        acc.push({
          id: typeof relation.id === 'number' ? relation.id : Date.now() + index,
          fromBackupId,
          toBackupId,
          ...(fromAnchor ? { fromAnchor } : {}),
          ...(toAnchor ? { toAnchor } : {}),
          curveOffsetX,
          curveOffsetY,
          mode,
          causal,
          strokeColor,
          labelColor,
          createdAt:
            typeof relation.createdAt === 'string' && relation.createdAt.trim()
              ? relation.createdAt
              : nowLabel()
        })
        return acc
      }, [])
    : []

  const config = createDefaultConfig()
  if (parsed.config) {
    if (parsed.config.kind === 'openai' || parsed.config.kind === 'ollama') {
      config.kind = parsed.config.kind
    }
    if (typeof parsed.config.baseUrl === 'string') {
      config.baseUrl = parsed.config.baseUrl
    }
    if (typeof parsed.config.model === 'string') {
      config.model = parsed.config.model
    }
    if (typeof parsed.config.apiKey === 'string') {
      config.apiKey = parsed.config.apiKey
    }
    if (typeof parsed.config.temperature === 'number' && Number.isFinite(parsed.config.temperature)) {
      config.temperature = parsed.config.temperature
    }
  }

  return {
    chapters,
    activeChapterId,
    writingMode: activeVersion?.writingMode === 'script' ? 'script' : fallbackWritingMode,
    memory,
    roleRelations,
    roleRelationTagOptions: normalizeRoleRelationTagOptions(parsed.roleRelationTagOptions),
    backupRelations,
    backups,
    config,
    customPrompt:
      typeof parsed.customPrompt === 'string'
        ? parsed.customPrompt
        : '为下一章提供 3 个悬念钩子。',
    skillsPrompt: typeof parsed.skillsPrompt === 'string' ? parsed.skillsPrompt : '',
    sessionMap:
      parsed.sessionMap && typeof parsed.sessionMap === 'object' ? parsed.sessionMap : {},
    skillModelName: typeof parsed.skillModelName === 'string' ? parsed.skillModelName : '',
    roleGraphVisual: normalizeGraphVisualSettings(
      parsed.roleGraphVisual,
      DEFAULT_ROLE_GRAPH_BG_COLOR
    ),
    backupGraphVisual: normalizeGraphVisualSettings(
      parsed.backupGraphVisual,
      DEFAULT_BACKUP_GRAPH_BG_COLOR
    )
  }
}

function loadLegacyWorkspace() {
  const keys = [STORAGE_KEY, ...LEGACY_KEYS]
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw) as WorkspaceData
      const normalized = normalizeWorkspaceData(parsed)
      if (normalized) return normalized
    } catch {
      // ignore bad storage payload
    }
  }
  return null
}

function loadProjectIndex() {
  try {
    const raw = localStorage.getItem(PROJECT_INDEX_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const project = item as Partial<ProjectMeta>
        if (!project.id || !project.name) return null
        return {
          id: String(project.id),
          name: String(project.name),
          createdAt: typeof project.createdAt === 'string' ? project.createdAt : nowLabel(),
          updatedAt: typeof project.updatedAt === 'string' ? project.updatedAt : nowLabel()
        }
      })
      .filter((item): item is ProjectMeta => item !== null)
  } catch {
    return []
  }
}

function saveProjectIndex(projects: ProjectMeta[]) {
  localStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify(projects))
}

function loadProjectWorkspace(projectId: string) {
  try {
    const raw = localStorage.getItem(projectStorageKey(projectId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as WorkspaceData
    return normalizeWorkspaceData(parsed)
  } catch {
    return null
  }
}

function saveProjectWorkspace(projectId: string, workspace: NormalizedWorkspace) {
  localStorage.setItem(projectStorageKey(projectId), JSON.stringify(toWorkspaceData(workspace)))
}

function touchProjectMeta(projectId: string, updatedAt: string) {
  const projects = loadProjectIndex()
  const touched = projects.map((project) =>
    project.id === projectId ? { ...project, updatedAt } : project
  )
  const active = touched.find((project) => project.id === projectId)
  const nextProjects = active
    ? [active, ...touched.filter((project) => project.id !== projectId)]
    : touched
  saveProjectIndex(nextProjects)
  return nextProjects
}

function App() {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof Monaco | null>(null)
  const scriptRolePickerRef = useRef<HTMLDivElement | null>(null)
  const scriptRolePickerInputRef = useRef<HTMLInputElement | null>(null)
  const scriptPrefixDecorationIdsRef = useRef<string[]>([])
  const scriptLinePrefixByLineRef = useRef<Map<number, ScriptLinePrefix>>(new Map())
  const scriptDecorationFrameRef = useRef<number | null>(null)
  const trackedScriptRoleNamesRef = useRef<Set<string>>(new Set())
  const editorContextMenuRef = useRef<HTMLDivElement | null>(null)
  const customSkillUploadRef = useRef<HTMLInputElement | null>(null)
  const versionTabsViewportRef = useRef<HTMLDivElement | null>(null)
  const versionMeasureRefs = useRef<Record<number, HTMLSpanElement | null>>({})
  const overflowMenuRef = useRef<HTMLDivElement | null>(null)
  const addPageMenuRef = useRef<HTMLDivElement | null>(null)
  const editorPaneRef = useRef<HTMLElement | null>(null)
  const assistantDialogRef = useRef<HTMLDivElement | null>(null)
  const assistantMessagesViewportRef = useRef<HTMLDivElement | null>(null)
  const autoConnectAttemptKeyRef = useRef('')
  const persistedConnectionSignatureRef = useRef(loadPersistedModelConnectionSignature())
  const legacyWorkspace = useMemo(() => loadLegacyWorkspace(), [])
  const initialWorkspace = useMemo(() => createDefaultWorkspace(), [])

  const [projects, setProjects] = useState<ProjectMeta[]>(() => loadProjectIndex())
  const [activeProjectId, setActiveProjectId] = useState<string>(
    () => localStorage.getItem(LAST_PROJECT_KEY) ?? ''
  )
  const [activeScreen, setActiveScreen] = useState<'projects' | 'writer'>(() =>
    localStorage.getItem(LAST_SCREEN_KEY) === 'writer' ? 'writer' : 'projects'
  )
  const [projectCenterView, setProjectCenterView] = useState<'home' | 'settings' | 'all'>('home')
  const [newProjectName, setNewProjectName] = useState('')
  const [appLanguage, setAppLanguage] = useState<AppLanguage>('zh-CN')
  const [projectStorageDir, setProjectStorageDir] = useState('')
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(true)
  const [autoLaunchEnabled, setAutoLaunchEnabled] = useState(true)
  const [appVersionLabel, setAppVersionLabel] = useState(APP_VERSION_FALLBACK)
  const [activationStatus, setActivationStatus] = useState<ActivationStatus>({
    activated: !Boolean(window.novelDesktopApi?.getActivationStatus),
    rawActivated: false,
    email: '',
    activatedAt: '',
    currentMachineMac: '',
    boundMachineMac: '',
    machineBound: true,
    mode: 'offline-v1',
    projectLimit: 1,
    localModelAllowed: Boolean(window.novelDesktopApi?.getActivationStatus)
      ? false
      : true
  })
  const [isOpeningActivationDialog, setIsOpeningActivationDialog] = useState(false)
  const [isUnbindingMachine, setIsUnbindingMachine] = useState(false)
  const [isCheckingAppUpgrade, setIsCheckingAppUpgrade] = useState(false)
  const [isApplyingProjectSettings, setIsApplyingProjectSettings] = useState(false)
  const [projectSettingsNotice, setProjectSettingsNotice] = useState<{
    kind: 'success' | 'error'
    message: string
  } | null>(null)
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null)
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null)
  const [isImportingProjects, setIsImportingProjects] = useState(false)
  const [pendingDeleteProject, setPendingDeleteProject] = useState<ProjectMeta | null>(null)
  const [deleteProjectConfirmName, setDeleteProjectConfirmName] = useState('')
  const [deleteProjectConfirmError, setDeleteProjectConfirmError] = useState('')
  const [pendingRenameProject, setPendingRenameProject] = useState<ProjectMeta | null>(null)
  const [renameProjectInputName, setRenameProjectInputName] = useState('')
  const [renameProjectError, setRenameProjectError] = useState('')
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false)
  const [projectActionMenuId, setProjectActionMenuId] = useState<string | null>(null)
  const [isWindowMaximized, setIsWindowMaximized] = useState(false)

  const [chapters, setChapters] = useState<Chapter[]>(
    withOrderedChapterTitles(initialWorkspace.chapters)
  )
  const [activeChapterId, setActiveChapterId] = useState(initialWorkspace.activeChapterId)
  const [writingMode, setWritingMode] = useState<WritingMode>(initialWorkspace.writingMode)
  const [memory, setMemory] = useState<MemoryItem[]>(initialWorkspace.memory)
  const [roleRelations, setRoleRelations] = useState<RoleRelation[]>(
    initialWorkspace.roleRelations
  )
  const [roleRelationTagOptions, setRoleRelationTagOptions] = useState<string[]>(
    normalizeRoleRelationTagOptions(initialWorkspace.roleRelationTagOptions)
  )
  const [backupRelations, setBackupRelations] = useState<BackupRelation[]>(
    initialWorkspace.backupRelations
  )
  const [backups, setBackups] = useState<BackupItem[]>(initialWorkspace.backups)
  const [config, setConfig] = useState<ProviderConfig>(initialWorkspace.config)
  const [activePanel, setActivePanel] = useState<ActivePanel>('memory')
  const [customPrompt, setCustomPrompt] = useState(initialWorkspace.customPrompt)
  const [skillsPrompt, setSkillsPrompt] = useState(initialWorkspace.skillsPrompt)
  const [sessionMap, setSessionMap] = useState<Record<string, string>>(
    initialWorkspace.sessionMap
  )
  const [skillModelName, setSkillModelName] = useState(initialWorkspace.skillModelName)
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [localOllamaModels, setLocalOllamaModels] = useState<string[]>([])
  const [cloudOllamaModels, setCloudOllamaModels] = useState<string[]>([])
  const [loadCloudModels, setLoadCloudModels] = useState(false)
  const [isLoadingOllamaModels, setIsLoadingOllamaModels] = useState(false)
  const [result, setResult] = useState('')
  const [status, setStatus] = useState('就绪')
  const [connectionState, setConnectionState] = useState<ConnectionState>('unknown')
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<ModelRuntimeDiagnostics | null>(null)
  const [runtimeRequestLogs, setRuntimeRequestLogs] = useState<ModelRequestLogItem[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState('')
  const [hasSelection, setHasSelection] = useState(false)
  const [selectedSnippet, setSelectedSnippet] = useState('')
  const [editingVersionId, setEditingVersionId] = useState<number | null>(null)
  const [editingVersionTitle, setEditingVersionTitle] = useState('')
  const [draggingChapterId, setDraggingChapterId] = useState<number | null>(null)
  const [dragOverChapterId, setDragOverChapterId] = useState<number | null>(null)
  const [dragInsertPosition, setDragInsertPosition] = useState<ChapterDropPosition>('before')
  const [isBuildingSkillModel, setIsBuildingSkillModel] = useState(false)
  const [visibleVersionIds, setVisibleVersionIds] = useState<number[]>([])
  const [overflowVersionIds, setOverflowVersionIds] = useState<number[]>([])
  const [isOverflowMenuOpen, setIsOverflowMenuOpen] = useState(false)
  const [isAddPageMenuOpen, setIsAddPageMenuOpen] = useState(false)
  const [editorContextMenu, setEditorContextMenu] = useState<EditorContextMenuState>({
    open: false,
    x: 0,
    y: 0
  })
  const [skillCatalog, setSkillCatalog] = useState<SkillCatalogItem[]>([])
  const [officialSkillsDir, setOfficialSkillsDir] = useState('E:\\novelwriter\\skills')
  const [isSkillsCenterBusy, setIsSkillsCenterBusy] = useState(false)
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null)
  const [editingSkillName, setEditingSkillName] = useState('')
  const [memorySearchQuery, setMemorySearchQuery] = useState('')
  const [memoryModule, setMemoryModule] = useState<MemoryKind>('info')
  const [roleGraphView, setRoleGraphView] = useState<RoleGraphView>('list')
  const [isRoleGraphFullscreen, setIsRoleGraphFullscreen] = useState(false)
  const [isRoleGraphVisualDialogOpen, setIsRoleGraphVisualDialogOpen] = useState(false)
  const [roleGraphViewport, setRoleGraphViewport] = useState({
    x: 0,
    y: 0,
    scale: 1
  })
  const [roleGraphVisual, setRoleGraphVisual] = useState<GraphVisualSettings>(
    initialWorkspace.roleGraphVisual
  )
  const [isRoleGraphSpacePressed, setIsRoleGraphSpacePressed] = useState(false)
  const [isRoleGraphPanning, setIsRoleGraphPanning] = useState(false)
  const [roleEditorDialog, setRoleEditorDialog] = useState<{
    roleId: number
    roleName: string
    roleNote: string
    roleStance: number
  } | null>(null)
  const [roleRelationEditorDialog, setRoleRelationEditorDialog] = useState<{
    relationId: number
    intimacy: number
    tagsInput: string
  } | null>(null)
  const [hoveredRoleRelationId, setHoveredRoleRelationId] = useState<number | null>(null)
  const [draggingRoleRelationCurve, setDraggingRoleRelationCurve] = useState<{
    relationId: number
  } | null>(null)
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<number>>(new Set())
  const [roleSelectionBox, setRoleSelectionBox] = useState<{
    start: { x: number; y: number }
    current: { x: number; y: number }
    additive: boolean
    baseSelectedIds: number[]
  } | null>(null)
  const [roleNodeMenu, setRoleNodeMenu] = useState<{
    open: boolean
    x: number
    y: number
    roleId: number | null
  }>({
    open: false,
    x: 0,
    y: 0,
    roleId: null
  })
  const [draggingRoleId, setDraggingRoleId] = useState<number | null>(null)
  const [hoveredRoleId, setHoveredRoleId] = useState<number | null>(null)
  const [roleDragOffset, setRoleDragOffset] = useState({ x: 0, y: 0 })
  const [scriptRolePickerRoleDraft, setScriptRolePickerRoleDraft] = useState<{
    roleId: number
    roleName: string
    roleNote: string
    roleStance: number
  } | null>(null)
  const [activeRoleRelationMode, setActiveRoleRelationMode] = useState<RoleRelationMode>(
    DEFAULT_ROLE_RELATION_MODE
  )
  const [activeRoleRelationStrokeColor, setActiveRoleRelationStrokeColor] = useState(
    DEFAULT_ROLE_RELATION_STROKE_COLOR
  )
  const [roleLinkStart, setRoleLinkStart] = useState<{
    roleId: number
    side: RoleLinkSide
    mode: RoleRelationMode
  } | null>(null)
  const [roleLinkTarget, setRoleLinkTarget] = useState<{
    roleId: number
    side: RoleLinkSide
  } | null>(null)
  const [roleLinkPreview, setRoleLinkPreview] = useState<{ x: number; y: number } | null>(null)
  const [roleRelationMenu, setRoleRelationMenu] = useState<{
    open: boolean
    x: number
    y: number
    relationId: number | null
  }>({
    open: false,
    x: 0,
    y: 0,
    relationId: null
  })
  const [backupSearchQuery, setBackupSearchQuery] = useState('')
  const [backupGraphView, setBackupGraphView] = useState<BackupGraphView>('list')
  const [isBackupGraphFullscreen, setIsBackupGraphFullscreen] = useState(false)
  const [isBackupGraphVisualDialogOpen, setIsBackupGraphVisualDialogOpen] = useState(false)
  const [backupGraphViewport, setBackupGraphViewport] = useState({
    x: 0,
    y: 0,
    scale: 1
  })
  const [backupGraphVisual, setBackupGraphVisual] = useState<GraphVisualSettings>(
    initialWorkspace.backupGraphVisual
  )
  const [isBackupGraphSpacePressed, setIsBackupGraphSpacePressed] = useState(false)
  const [isBackupGraphPanning, setIsBackupGraphPanning] = useState(false)
  const [draggingBackupId, setDraggingBackupId] = useState<number | null>(null)
  const [hoveredBackupId, setHoveredBackupId] = useState<number | null>(null)
  const [selectedBackupIds, setSelectedBackupIds] = useState<Set<number>>(new Set())
  const [backupSelectionBox, setBackupSelectionBox] = useState<{
    start: { x: number; y: number }
    current: { x: number; y: number }
    additive: boolean
    baseSelectedIds: number[]
  } | null>(null)
  const [backupDragOffset, setBackupDragOffset] = useState({ x: 0, y: 0 })
  const [backupActiveRelationMode, setBackupActiveRelationMode] = useState<RoleRelationMode>(
    DEFAULT_ROLE_RELATION_MODE
  )
  const [backupActiveRelationStrokeColor, setBackupActiveRelationStrokeColor] = useState(
    DEFAULT_BACKUP_RELATION_STROKE_COLOR
  )
  const [backupActiveRelationLabelColor, setBackupActiveRelationLabelColor] = useState(
    DEFAULT_BACKUP_RELATION_LABEL_COLOR
  )
  const [backupLinkStart, setBackupLinkStart] = useState<{
    backupId: number
    side: RoleLinkSide
    mode: RoleRelationMode
  } | null>(null)
  const [backupLinkTarget, setBackupLinkTarget] = useState<{
    backupId: number
    side: RoleLinkSide
  } | null>(null)
  const [backupLinkPreview, setBackupLinkPreview] = useState<{ x: number; y: number } | null>(null)
  const [hoveredBackupRelationId, setHoveredBackupRelationId] = useState<number | null>(null)
  const [draggingBackupRelationCurve, setDraggingBackupRelationCurve] = useState<{
    relationId: number
  } | null>(null)
  const [backupRelationEditorDialog, setBackupRelationEditorDialog] = useState<{
    relationId: number
    causal: string
  } | null>(null)
  const [backupRelationMenu, setBackupRelationMenu] = useState<{
    open: boolean
    x: number
    y: number
    relationId: number | null
  }>({
    open: false,
    x: 0,
    y: 0,
    relationId: null
  })
  const [backupNodeMenu, setBackupNodeMenu] = useState<{
    open: boolean
    x: number
    y: number
    backupId: number | null
  }>({
    open: false,
    x: 0,
    y: 0,
    backupId: null
  })
  const [backupEditorDialog, setBackupEditorDialog] = useState<{
    backupId: number
    title: string
    content: string
  } | null>(null)
  const [isAdvancedSettingsOpen, setIsAdvancedSettingsOpen] = useState(false)
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false)
  const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(null)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [assistantInput, setAssistantInput] = useState('')
  const [assistantMessages, setAssistantMessages] = useState<AssistantChatMessage[]>([])
  const [assistantRunning, setAssistantRunning] = useState(false)
  const [assistantProgressLogs, setAssistantProgressLogs] = useState<string[]>([])
  const [assistantDialogPos, setAssistantDialogPos] = useState({ x: 24, y: 24 })
  const [assistantDialogDragging, setAssistantDialogDragging] = useState(false)
  const [assistantDialogDragOffset, setAssistantDialogDragOffset] = useState({ x: 0, y: 0 })
  const [customPageRenameDialog, setCustomPageRenameDialog] = useState<{
    chapterId: number
    value: string
  } | null>(null)
  const [scriptRolePicker, setScriptRolePicker] = useState<ScriptRolePickerState | null>(null)
  const [isWorkspaceBootstrapping, setIsWorkspaceBootstrapping] = useState(true)
  const roleGraphBoardRef = useRef<HTMLDivElement | null>(null)
  const backupGraphBoardRef = useRef<HTMLDivElement | null>(null)
  const roleGraphPanStartRef = useRef<{
    clientX: number
    clientY: number
    originX: number
    originY: number
  } | null>(null)
  const backupGraphPanStartRef = useRef<{
    clientX: number
    clientY: number
    originX: number
    originY: number
  } | null>(null)
  const roleRelationMenuRef = useRef<HTMLDivElement | null>(null)
  const backupRelationMenuRef = useRef<HTMLDivElement | null>(null)
  const roleNodeMenuRef = useRef<HTMLDivElement | null>(null)
  const backupNodeMenuRef = useRef<HTMLDivElement | null>(null)
  const roleRelationsRef = useRef<RoleRelation[]>(roleRelations)
  const backupRelationsRef = useRef<BackupRelation[]>(backupRelations)
  const roleDragIdsRef = useRef<number[]>([])
  const roleDragOffsetsByIdRef = useRef<Record<number, { x: number; y: number }>>({})
  const backupDragIdsRef = useRef<number[]>([])
  const backupDragOffsetsByIdRef = useRef<Record<number, { x: number; y: number }>>({})

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  )
  const t = (zh: string, en: string) => (appLanguage === 'en-US' ? en : zh)
  const activeChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === activeChapterId) ?? chapters[0],
    [chapters, activeChapterId]
  )
  const activeVersion = useMemo(() => {
    if (!activeChapter) return null
    return (
      activeChapter.versions.find((version) => version.id === activeChapter.activeVersionId) ??
      activeChapter.versions[0]
    )
  }, [activeChapter])
  const chaptersRef = useRef<Chapter[]>(chapters)
  const activeChapterRef = useRef<Chapter | undefined>(activeChapter)
  const activeVersionRef = useRef<Version | null>(activeVersion)
  const activeVersionWritingMode: WritingMode =
    activeVersion?.writingMode === 'script' ? 'script' : 'novel'
  const activeVersionWritingModeRef = useRef<WritingMode>(activeVersionWritingMode)
  const currentDraft = activeVersion?.draft ?? ''
  const currentVersionHistory = activeVersion?.history ?? []
  const orderedVersionHistory = useMemo(
    () => [...currentVersionHistory].sort((a, b) => b.createdAtMs - a.createdAtMs),
    [currentVersionHistory]
  )
  const selectedHistoryItem =
    orderedVersionHistory.find((item) => item.id === selectedHistoryId) ?? orderedVersionHistory[0] ?? null
  const connectionStatusLabel =
    connectionState === 'connected'
      ? '已连接'
      : connectionState === 'failed'
        ? '连接失败'
        : connectionState === 'checking'
          ? '检测中'
          : '未连接'
  const connectionStatusClass =
    connectionState === 'connected'
      ? 'is-connected'
      : connectionState === 'failed'
        ? 'is-failed'
        : 'is-idle'
  const isConnecting = connectionState === 'checking'
  const connectionActionLabel =
    connectionState === 'connected'
      ? '测试连接'
      : isConnecting
        ? '连接中...'
        : '立即连接'
  const runtimeSkillsLoaded = runtimeDiagnostics?.skillsLoaded ?? Boolean(skillsPrompt.trim())
  const runtimeSkillsInjected = runtimeDiagnostics?.skillsInjected ?? false
  const runtimeSkillsHit = runtimeDiagnostics?.skillsHit ?? false
  const runtimeSystemPreview = runtimeDiagnostics?.systemPromptPreview ?? ''
  const visibleRuntimeLogs =
    runtimeRequestLogs.length > 0 ? runtimeRequestLogs : (runtimeDiagnostics?.requestLogs ?? [])
  const currentSessionKey =
    activeChapter && activeVersion ? `${activeChapter.id}:${activeVersion.id}` : ''

  useEffect(() => {
    roleRelationsRef.current = roleRelations
  }, [roleRelations])
  useEffect(() => {
    backupRelationsRef.current = backupRelations
  }, [backupRelations])
  const currentSessionId = currentSessionKey ? (sessionMap[currentSessionKey] ?? '') : ''
  const chapterVersions = activeChapter?.versions ?? EMPTY_VERSIONS
  const deleteProjectExpectedName = pendingDeleteProject?.name.trim() ?? ''
  const deleteProjectConfirmInput = deleteProjectConfirmName.trim()
  const isDeleteProjectNameMatch =
    Boolean(deleteProjectExpectedName) && deleteProjectConfirmInput === deleteProjectExpectedName
  const renameProjectExpectedName = pendingRenameProject?.name.trim() ?? ''
  const renameProjectInputTrimmed = renameProjectInputName.trim()
  const isRenameProjectUnchanged =
    Boolean(renameProjectExpectedName) && renameProjectInputTrimmed === renameProjectExpectedName
  const canDeleteVersion = chapterVersions.length > 1
  const visibleVersionSet = useMemo(() => new Set(visibleVersionIds), [visibleVersionIds])
  const overflowVersionSet = useMemo(() => new Set(overflowVersionIds), [overflowVersionIds])
  const visibleVersions =
    visibleVersionIds.length > 0
      ? chapterVersions.filter((version) => visibleVersionSet.has(version.id))
      : chapterVersions
  const overflowVersions = chapterVersions.filter((version) => overflowVersionSet.has(version.id))

  useEffect(() => {
    if (writingMode === activeVersionWritingMode) return
    setWritingMode(activeVersionWritingMode)
  }, [activeVersionWritingMode, writingMode])
  useEffect(() => {
    setAssistantMessages(activeVersion?.assistantMessages ?? [])
    setAssistantInput('')
    setAssistantRunning(false)
    setAssistantProgressLogs([])
  }, [activeChapterId, activeVersion?.id])
  useEffect(() => {
    chaptersRef.current = chapters
  }, [chapters])
  useEffect(() => {
    activeChapterRef.current = activeChapter
    activeVersionRef.current = activeVersion
  }, [activeChapter, activeVersion])
  useEffect(() => {
    activeVersionWritingModeRef.current = activeVersionWritingMode
    if (activeVersionWritingMode !== 'script') {
      setScriptRolePicker(null)
    }
  }, [activeVersionWritingMode])
  useEffect(() => {
    if (isWorkspaceBootstrapping) return
    if (!activeChapter || !activeVersion) return
    if (areSameAssistantMessages(activeVersion.assistantMessages, assistantMessages)) return
    setChapters((previous) =>
      previous.map((chapter) => {
        if (chapter.id !== activeChapter.id) return chapter
        return {
          ...chapter,
          versions: chapter.versions.map((version) =>
            version.id === activeVersion.id
              ? { ...version, assistantMessages: [...assistantMessages] }
              : version
          )
        }
      })
    )
  }, [assistantMessages, activeChapter, activeVersion, isWorkspaceBootstrapping])
  const isOverflowMenuVisible = isOverflowMenuOpen && overflowVersions.length > 0
  const installedSkillsCount = useMemo(
    () => skillCatalog.filter((skill) => skill.installed).length,
    [skillCatalog]
  )
  const installedSkillCatalog = useMemo(
    () =>
      skillCatalog
        .filter((skill) => skill.installed)
        .sort((a, b) => {
          if (a.source !== b.source) return a.source === 'official' ? -1 : 1
          return a.name.localeCompare(b.name, 'zh-CN')
        }),
    [skillCatalog]
  )
  const officialSkillCatalog = useMemo(
    () => skillCatalog.filter((skill) => skill.source === 'official'),
    [skillCatalog]
  )
  const customSkillCatalog = useMemo(
    () => skillCatalog.filter((skill) => skill.source === 'custom'),
    [skillCatalog]
  )
  const availableOfficialSkillCatalog = useMemo(
    () => officialSkillCatalog.filter((skill) => !skill.installed),
    [officialSkillCatalog]
  )
  const availableCustomSkillCatalog = useMemo(
    () => customSkillCatalog.filter((skill) => !skill.installed),
    [customSkillCatalog]
  )
  const filteredMemory = useMemo(() => {
    const keyword = memorySearchQuery.trim().toLowerCase()
    const scoped = memory.filter((item) => item.kind === memoryModule)
    if (!keyword) return scoped
    return scoped.filter((item) => {
      const haystack = `${item.text}\n${item.roleName ?? ''}\n${item.roleNote ?? ''}${
        item.kind === 'role' ? '' : `\n${item.chapterTitle}\n${item.versionTitle}`
      }`.toLowerCase()
      return haystack.includes(keyword)
    })
  }, [memory, memorySearchQuery, memoryModule])
  const allRoleMemory = useMemo(
    () => memory.filter((item) => item.kind === 'role'),
    [memory]
  )
  const roleMemoryById = useMemo(() => {
    const map = new Map<number, MemoryItem>()
    allRoleMemory.forEach((item) => {
      map.set(item.id, item)
    })
    return map
  }, [allRoleMemory])
  const roleMemoryByNormalizedName = useMemo(() => {
    const map = new Map<string, MemoryItem>()
    allRoleMemory.forEach((item) => {
      const normalized = normalizeScriptRoleName(getRoleName(item)).toLowerCase()
      if (!normalized) return
      if (!map.has(normalized)) {
        map.set(normalized, item)
      }
    })
    return map
  }, [allRoleMemory])
  const visibleRoleMemory = useMemo(
    () => filteredMemory.filter((item) => item.kind === 'role'),
    [filteredMemory]
  )
  useEffect(() => {
    const next = new Set<string>()
    allRoleMemory.forEach((item) => {
      const normalized = normalizeScriptRoleName(getRoleName(item))
      if (!normalized || isNarratorLabel(normalized)) return
      next.add(normalized)
    })
    trackedScriptRoleNamesRef.current = next
    scheduleScriptLineDecorations()
  }, [allRoleMemory])
  useEffect(() => {
    if (isWorkspaceBootstrapping) return
    setMemory((previous) => {
      const seen = new Map<string, number>()
      const duplicateRoleIdMap = new Map<number, number>()
      let changed = false
      const next = previous.filter((item) => {
        if (item.kind !== 'role') return true
        const key = normalizeScriptRoleName(getRoleName(item)).toLowerCase()
        if (!key) return true
        const existingId = seen.get(key)
        if (typeof existingId === 'number') {
          duplicateRoleIdMap.set(item.id, existingId)
          changed = true
          return false
        }
        seen.set(key, item.id)
        return true
      })
      if (!changed) return previous
      setRoleRelations((prevRelations) => {
        const relationKeySet = new Set<string>()
        return prevRelations
          .map((relation) => {
            const fromMemoryId = duplicateRoleIdMap.get(relation.fromMemoryId) ?? relation.fromMemoryId
            const toMemoryId = duplicateRoleIdMap.get(relation.toMemoryId) ?? relation.toMemoryId
            if (fromMemoryId === toMemoryId) return null
            const nextRelation: RoleRelation = {
              ...relation,
              fromMemoryId,
              toMemoryId,
              strokeColor: normalizeRelationColor(
                relation.strokeColor,
                DEFAULT_ROLE_RELATION_STROKE_COLOR
              ),
              intimacy: normalizeRelationIntimacy(relation.intimacy ?? 0),
              tags: Array.isArray(relation.tags) ? [...new Set(relation.tags.filter(Boolean))].slice(0, 12) : []
            }
            const dedupeKey = `${fromMemoryId}:${toMemoryId}:${nextRelation.mode}:${nextRelation.relation.trim()}:${nextRelation.intimacy}:${nextRelation.tags.join('|')}:${nextRelation.strokeColor}`
            if (relationKeySet.has(dedupeKey)) return null
            relationKeySet.add(dedupeKey)
            return nextRelation
          })
          .filter((item): item is RoleRelation => item !== null)
      })
      setStatus('已合并重复角色')
      return next
    })
  }, [isWorkspaceBootstrapping, memory])
  const scriptRolePickerOptions = useMemo(() => {
    const names = new Set<string>(['旁白'])
    allRoleMemory.forEach((item) => {
      const name = getRoleName(item).trim()
      if (name) names.add(name)
    })
    if (activeVersionWritingMode === 'script') {
      parseScriptLinePrefixes(currentDraft).forEach((prefix) => {
        if (prefix.normalizedName) names.add(prefix.normalizedName)
      })
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, [allRoleMemory, activeVersionWritingMode, currentDraft])
  const visibleRoleIds = useMemo(
    () => new Set(visibleRoleMemory.map((item) => item.id)),
    [visibleRoleMemory]
  )
  const visibleRoleRelations = useMemo(
    () =>
      roleRelations.filter(
        (relation) =>
          visibleRoleIds.has(relation.fromMemoryId) && visibleRoleIds.has(relation.toMemoryId)
      ),
    [roleRelations, visibleRoleIds]
  )
  const roleRelationPreviewLines = useMemo(() => {
    return roleRelations
      .map((relation) => {
        const from = roleMemoryById.get(relation.fromMemoryId)
        const to = roleMemoryById.get(relation.toMemoryId)
        if (!from || !to) return ''
        const fromName = getRoleName(from)
        const toName = getRoleName(to)
        const fromStance = getRoleStance(from)
        const toStance = getRoleStance(to)
        const relationText = getRoleRelationDisplayText(relation)
        const tags = Array.isArray(relation.tags) && relation.tags.length > 0 ? `；标签：${relation.tags.join('、')}` : ''
        const intimacy = normalizeRelationIntimacy(relation.intimacy ?? 0)
        if (isRoleRelationBidirectional(parseRoleRelationMode(relation.mode))) {
          return `${fromName}（立场 ${fromStance}/10-${getRoleStanceLabel(fromStance)}） 与 ${toName}（立场 ${toStance}/10-${getRoleStanceLabel(toStance)}）互为 ${relationText}（亲密度 ${intimacy}，${getRoleIntimacyLabel(intimacy)}${tags ? `${tags}` : ''}）`
        }
        return `${fromName}（立场 ${fromStance}/10-${getRoleStanceLabel(fromStance)}） → ${toName}（立场 ${toStance}/10-${getRoleStanceLabel(toStance)}）：${relationText}（亲密度 ${intimacy}，${getRoleIntimacyLabel(intimacy)}${tags ? `${tags}` : ''}）`
      })
      .filter(Boolean)
  }, [roleRelations, roleMemoryById])
  const visibleRolePositionById = useMemo(() => {
    const map = new Map<number, { x: number; y: number }>()
    visibleRoleMemory.forEach((item, index) => {
      map.set(item.id, getRoleNodePosition(item, index))
    })
    return map
  }, [visibleRoleMemory])
  const isRoleGraphActive = activeScreen === 'writer' && memoryModule === 'role' && roleGraphView === 'graph'
  const isRoleGraphBoardFullscreen =
    isRoleGraphFullscreen &&
    typeof document !== 'undefined' &&
    document.fullscreenElement === roleGraphBoardRef.current
  const shouldRenderRoleDialogsInsideGraph = isRoleGraphActive && isRoleGraphBoardFullscreen
  const roleGraphGridSize = Math.max(8, 24 * roleGraphViewport.scale)
  const roleGraphGridOffsetX =
    ((roleGraphViewport.x % roleGraphGridSize) + roleGraphGridSize) % roleGraphGridSize
  const roleGraphGridOffsetY =
    ((roleGraphViewport.y % roleGraphGridSize) + roleGraphGridSize) % roleGraphGridSize
  const roleGraphBoardStyle: CSSProperties = {
    '--role-graph-grid-size': `${roleGraphGridSize}px`,
    '--role-graph-grid-offset-x': `${roleGraphGridOffsetX}px`,
    '--role-graph-grid-offset-y': `${roleGraphGridOffsetY}px`,
    '--role-graph-bg-color': roleGraphVisual.backgroundColor,
    '--role-graph-font-size': `${roleGraphVisual.fontSize}px`,
    '--role-graph-dim-opacity': `${roleGraphVisual.dimmedOpacity}`
  } as CSSProperties
  const roleGraphViewportStyle: CSSProperties = {
    transform: `translate(${roleGraphViewport.x}px, ${roleGraphViewport.y}px) scale(${roleGraphViewport.scale})`
  }
  const roleSelectionBounds = useMemo(
    () =>
      roleSelectionBox
        ? getRoleSelectionBounds(roleSelectionBox.start, roleSelectionBox.current)
        : null,
    [roleSelectionBox]
  )
  const focusedRoleId = useMemo(() => {
    if (selectedRoleIds.size !== 1) return null
    return Array.from(selectedRoleIds)[0] ?? null
  }, [selectedRoleIds])
  const directlyConnectedRoleIds = useMemo(() => {
    const connected = new Set<number>()
    if (focusedRoleId === null) return connected
    connected.add(focusedRoleId)
    visibleRoleRelations.forEach((relation) => {
      if (relation.fromMemoryId === focusedRoleId) connected.add(relation.toMemoryId)
      if (relation.toMemoryId === focusedRoleId) connected.add(relation.fromMemoryId)
    })
    return connected
  }, [focusedRoleId, visibleRoleRelations])
  const shouldDimRoleGraph = focusedRoleId !== null
  const filteredBackups = useMemo(() => {
    const keyword = backupSearchQuery.trim().toLowerCase()
    if (!keyword) return backups
    return backups.filter((item) => {
      const haystack = `${item.title}\n${item.content}`.toLowerCase()
      return haystack.includes(keyword)
    })
  }, [backups, backupSearchQuery])
  const visibleBackupIds = useMemo(
    () => new Set(filteredBackups.map((item) => item.id)),
    [filteredBackups]
  )
  const visibleBackupRelations = useMemo(
    () =>
      backupRelations.filter(
        (relation) =>
          visibleBackupIds.has(relation.fromBackupId) && visibleBackupIds.has(relation.toBackupId)
      ),
    [backupRelations, visibleBackupIds]
  )
  const backupSelectionBounds = useMemo(
    () =>
      backupSelectionBox
        ? getRoleSelectionBounds(backupSelectionBox.start, backupSelectionBox.current)
        : null,
    [backupSelectionBox]
  )
  const focusedBackupId = useMemo(() => {
    if (selectedBackupIds.size !== 1) return null
    return Array.from(selectedBackupIds)[0] ?? null
  }, [selectedBackupIds])
  const directlyConnectedBackupIds = useMemo(() => {
    const connected = new Set<number>()
    if (focusedBackupId === null) return connected
    connected.add(focusedBackupId)
    visibleBackupRelations.forEach((relation) => {
      if (relation.fromBackupId === focusedBackupId) connected.add(relation.toBackupId)
      if (relation.toBackupId === focusedBackupId) connected.add(relation.fromBackupId)
    })
    return connected
  }, [focusedBackupId, visibleBackupRelations])
  const shouldDimBackupGraph = focusedBackupId !== null
  const backupPositionById = useMemo(() => {
    const map = new Map<number, { x: number; y: number }>()
    filteredBackups.forEach((item, index) => {
      map.set(item.id, getBackupNodePosition(item, index))
    })
    return map
  }, [filteredBackups])
  const isBackupGraphActive =
    activeScreen === 'writer' && activePanel === 'backup' && backupGraphView === 'graph'
  const isBackupGraphBoardFullscreen =
    isBackupGraphFullscreen &&
    typeof document !== 'undefined' &&
    document.fullscreenElement === backupGraphBoardRef.current
  const backupGraphGridSize = Math.max(8, 24 * backupGraphViewport.scale)
  const backupGraphGridOffsetX =
    ((backupGraphViewport.x % backupGraphGridSize) + backupGraphGridSize) % backupGraphGridSize
  const backupGraphGridOffsetY =
    ((backupGraphViewport.y % backupGraphGridSize) + backupGraphGridSize) % backupGraphGridSize
  const backupGraphBoardStyle: CSSProperties = {
    '--backup-graph-grid-size': `${backupGraphGridSize}px`,
    '--backup-graph-grid-offset-x': `${backupGraphGridOffsetX}px`,
    '--backup-graph-grid-offset-y': `${backupGraphGridOffsetY}px`,
    '--backup-graph-bg-color': backupGraphVisual.backgroundColor,
    '--backup-graph-font-size': `${backupGraphVisual.fontSize}px`,
    '--backup-graph-dim-opacity': `${backupGraphVisual.dimmedOpacity}`
  } as CSSProperties
  const backupGraphViewportStyle: CSSProperties = {
    transform: `translate(${backupGraphViewport.x}px, ${backupGraphViewport.y}px) scale(${backupGraphViewport.scale})`
  }
  const railLabelByChapterId = useMemo(() => {
    let chapterSeq = 0
    const labelMap = new Map<number, string>()
    for (const chapter of chapters) {
      if (chapter.kind === 'chapter') {
        chapterSeq += 1
        labelMap.set(chapter.id, `第${chapterSeq}章`)
        continue
      }
      const type = chapter.specialType ?? 'special'
      if (type === 'special') {
        labelMap.set(chapter.id, chapter.title || SPECIAL_PAGE_META[type].title)
        continue
      }
      labelMap.set(chapter.id, SPECIAL_PAGE_META[type].railLabel)
    }
    return labelMap
  }, [chapters])

  function getRoleName(item: MemoryItem) {
    if (item.kind !== 'role') return ''
    const parsed = parseLegacyRoleText(item.text)
    return (item.roleName?.trim() || parsed.roleName || `角色${item.id}`).trim()
  }

  function getRoleNote(item: MemoryItem) {
    if (item.kind !== 'role') return ''
    if (typeof item.roleNote === 'string') return item.roleNote
    const parsed = parseLegacyRoleText(item.text)
    return parsed.roleNote
  }

  function getRoleStance(item: MemoryItem) {
    if (item.kind !== 'role') return 5
    return clampRoleStance(typeof item.roleStance === 'number' ? item.roleStance : 5)
  }

  function getRoleNodePosition(item: MemoryItem, index: number) {
    const defaultX = 28 + (index % 2) * 236
    const defaultY = 28 + Math.floor(index / 2) * 132
    return {
      x: Number.isFinite(item.roleX as number) ? (item.roleX as number) : defaultX,
      y: Number.isFinite(item.roleY as number) ? (item.roleY as number) : defaultY
    }
  }

  function getBackupNodePosition(item: BackupItem, index: number) {
    const defaultX = 28 + (index % 2) * 276
    const defaultY = 28 + Math.floor(index / 2) * 170
    return {
      x: Number.isFinite(item.backupX as number) ? (item.backupX as number) : defaultX,
      y: Number.isFinite(item.backupY as number) ? (item.backupY as number) : defaultY
    }
  }

  function getRoleGraphPointFromClient(clientX: number, clientY: number) {
    const board = roleGraphBoardRef.current
    if (!board) return null
    const rect = board.getBoundingClientRect()
    return {
      x: (clientX - rect.left - roleGraphViewport.x) / roleGraphViewport.scale,
      y: (clientY - rect.top - roleGraphViewport.y) / roleGraphViewport.scale
    }
  }

  function getBackupGraphPointFromClient(clientX: number, clientY: number) {
    const board = backupGraphBoardRef.current
    if (!board) return null
    const rect = board.getBoundingClientRect()
    return {
      x: (clientX - rect.left - backupGraphViewport.x) / backupGraphViewport.scale,
      y: (clientY - rect.top - backupGraphViewport.y) / backupGraphViewport.scale
    }
  }

  function getRoleLinkTargetByPoint(
    point: { x: number; y: number },
    ignoreRoleId: number
  ): { roleId: number; side: RoleLinkSide } | null {
    const detectionMargin = 18
    for (const item of visibleRoleMemory) {
      if (item.id === ignoreRoleId) continue
      const position =
        visibleRolePositionById.get(item.id) ?? getRoleNodePosition(item, 0)
      const minX = position.x - detectionMargin
      const maxX = position.x + ROLE_NODE_WIDTH + detectionMargin
      const minY = position.y - detectionMargin
      const maxY = position.y + ROLE_NODE_HEIGHT + detectionMargin
      if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) continue
      return {
        roleId: item.id,
        side: pickRoleSideForPoint(position, point)
      }
    }
    return null
  }

  function getBackupLinkTargetByPoint(
    point: { x: number; y: number },
    ignoreBackupId: number
  ): { backupId: number; side: RoleLinkSide } | null {
    const detectionMargin = 18
    for (const item of filteredBackups) {
      if (item.id === ignoreBackupId) continue
      const position = backupPositionById.get(item.id) ?? getBackupNodePosition(item, 0)
      const minX = position.x - detectionMargin
      const maxX = position.x + BACKUP_NODE_WIDTH + detectionMargin
      const minY = position.y - detectionMargin
      const maxY = position.y + BACKUP_NODE_HEIGHT + detectionMargin
      if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) continue
      return {
        backupId: item.id,
        side: pickBackupSideForPoint(position, point)
      }
    }
    return null
  }

  function getRoleRelationGeometry(relation: RoleRelation) {
    const fromPos = visibleRolePositionById.get(relation.fromMemoryId)
    const toPos = visibleRolePositionById.get(relation.toMemoryId)
    if (!fromPos || !toPos) return null
    const fromAnchor = relation.fromAnchor ?? pickDefaultRoleSide(toPos, fromPos)
    const toAnchor = relation.toAnchor ?? pickDefaultRoleSide(fromPos, toPos)
    const fromPoint = getRoleSidePoint(fromPos, fromAnchor)
    const toPoint = getRoleSidePoint(toPos, toAnchor)
    const controlPoint = getRoleRelationControlPoint(fromPoint, toPoint, relation)
    const curveMidPoint = getQuadraticBezierPoint(fromPoint, controlPoint, toPoint, 0.5)
    const path = `M ${fromPoint.x} ${fromPoint.y} Q ${controlPoint.x} ${controlPoint.y} ${toPoint.x} ${toPoint.y}`
    return {
      fromAnchor,
      toAnchor,
      fromPoint,
      toPoint,
      controlPoint,
      curveMidPoint,
      path
    }
  }

  function getRoleRelationCurveOffsetFromMidpoint(
    targetMid: { x: number; y: number },
    fromPoint: { x: number; y: number },
    toPoint: { x: number; y: number }
  ) {
    const straightMidX = (fromPoint.x + toPoint.x) / 2
    const straightMidY = (fromPoint.y + toPoint.y) / 2
    return {
      x: (targetMid.x - straightMidX) * 2,
      y: (targetMid.y - straightMidY) * 2
    }
  }

  function getBackupRelationGeometry(relation: BackupRelation) {
    const fromPos = backupPositionById.get(relation.fromBackupId)
    const toPos = backupPositionById.get(relation.toBackupId)
    if (!fromPos || !toPos) return null
    const fromAnchor = relation.fromAnchor ?? pickDefaultBackupSide(toPos, fromPos)
    const toAnchor = relation.toAnchor ?? pickDefaultBackupSide(fromPos, toPos)
    const fromPoint = getBackupSidePoint(fromPos, fromAnchor)
    const toPoint = getBackupSidePoint(toPos, toAnchor)
    const controlPoint = {
      x:
        (fromPoint.x + toPoint.x) / 2 +
        (Number.isFinite(relation.curveOffsetX as number) ? (relation.curveOffsetX as number) : 0),
      y:
        (fromPoint.y + toPoint.y) / 2 +
        (Number.isFinite(relation.curveOffsetY as number) ? (relation.curveOffsetY as number) : 0)
    }
    const curveMidPoint = getQuadraticBezierPoint(fromPoint, controlPoint, toPoint, 0.5)
    const path = `M ${fromPoint.x} ${fromPoint.y} Q ${controlPoint.x} ${controlPoint.y} ${toPoint.x} ${toPoint.y}`
    return {
      fromAnchor,
      toAnchor,
      fromPoint,
      toPoint,
      controlPoint,
      curveMidPoint,
      path
    }
  }

  function getBackupRelationCurveOffsetFromMidpoint(
    targetMid: { x: number; y: number },
    fromPoint: { x: number; y: number },
    toPoint: { x: number; y: number }
  ) {
    const straightMidX = (fromPoint.x + toPoint.x) / 2
    const straightMidY = (fromPoint.y + toPoint.y) / 2
    return {
      x: (targetMid.x - straightMidX) * 2,
      y: (targetMid.y - straightMidY) * 2
    }
  }

  function beginRoleRelationCurveDrag(event: ReactMouseEvent<SVGCircleElement>, relationId: number) {
    if (event.button !== 0) return
    if (isRoleGraphSpacePressed || isRoleGraphPanning) return
    event.preventDefault()
    event.stopPropagation()
    const pointer = getRoleGraphPointFromClient(event.clientX, event.clientY)
    if (!pointer) return
    setRoleRelationMenu({ open: false, x: 0, y: 0, relationId: null })
    setRoleNodeMenu({ open: false, x: 0, y: 0, roleId: null })
    setDraggingRoleId(null)
    setRoleLinkStart(null)
    setRoleLinkTarget(null)
    setRoleLinkPreview(null)
    setDraggingRoleRelationCurve({ relationId })
  }

  function getRoleSelectionBounds(
    start: { x: number; y: number },
    current: { x: number; y: number }
  ) {
    const minX = Math.min(start.x, current.x)
    const minY = Math.min(start.y, current.y)
    const maxX = Math.max(start.x, current.x)
    const maxY = Math.max(start.y, current.y)
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY
    }
  }

  function collectRoleIdsInBounds(bounds: {
    minX: number
    minY: number
    maxX: number
    maxY: number
  }) {
    const ids: number[] = []
    for (const item of visibleRoleMemory) {
      const position = visibleRolePositionById.get(item.id) ?? getRoleNodePosition(item, 0)
      const nodeMinX = position.x
      const nodeMinY = position.y
      const nodeMaxX = position.x + ROLE_NODE_WIDTH
      const nodeMaxY = position.y + ROLE_NODE_HEIGHT
      const intersects =
        bounds.maxX >= nodeMinX &&
        bounds.minX <= nodeMaxX &&
        bounds.maxY >= nodeMinY &&
        bounds.minY <= nodeMaxY
      if (intersects) ids.push(item.id)
    }
    return ids
  }

  function applyRoleSelectionByBox(box: {
    start: { x: number; y: number }
    current: { x: number; y: number }
    additive: boolean
    baseSelectedIds: number[]
  }) {
    const bounds = getRoleSelectionBounds(box.start, box.current)
    const idsInBounds = collectRoleIdsInBounds(bounds)
    const next = new Set<number>(box.additive ? box.baseSelectedIds : [])
    idsInBounds.forEach((id) => next.add(id))
    setSelectedRoleIds(next)
  }

  function deleteRoleMemories(roleIds: number[]) {
    const uniqueIds = [...new Set(roleIds)]
    if (!uniqueIds.length) return
    const roleIdSet = new Set(uniqueIds)
    setMemory((previous) =>
      previous.filter((item) => !(item.kind === 'role' && roleIdSet.has(item.id)))
    )
    const nextRelations = roleRelationsRef.current.filter(
      (relation) =>
        !roleIdSet.has(relation.fromMemoryId) && !roleIdSet.has(relation.toMemoryId)
    )
    setRoleRelations(nextRelations)
    roleRelationsRef.current = nextRelations
    persistWorkspaceWithRoleRelations(nextRelations)
    setSelectedRoleIds((previous) => {
      if (!previous.size) return previous
      const next = new Set<number>()
      previous.forEach((id) => {
        if (!roleIdSet.has(id)) next.add(id)
      })
      return next
    })
    setRoleSelectionBox(null)
    setRoleNodeMenu({ open: false, x: 0, y: 0, roleId: null })
    setRoleRelationMenu({ open: false, x: 0, y: 0, relationId: null })
    setRoleRelationEditorDialog((previous) =>
      previous && nextRelations.some((item) => item.id === previous.relationId) ? previous : null
    )
    setRoleEditorDialog((previous) =>
      previous && roleIdSet.has(previous.roleId) ? null : previous
    )
    setStatus(`已删除 ${uniqueIds.length} 个角色`)
  }

  function openRoleNodeContextMenu(event: ReactMouseEvent<HTMLElement>, roleId: number) {
    event.preventDefault()
    event.stopPropagation()
    setRoleRelationMenu({ open: false, x: 0, y: 0, relationId: null })
    if (!selectedRoleIds.has(roleId)) {
      setSelectedRoleIds(new Set([roleId]))
    }
    setRoleNodeMenu({
      open: true,
      x: event.clientX,
      y: event.clientY,
      roleId
    })
  }

  function centerRoleGraphToNodes(mode: 'fit' | 'one-to-one' = 'fit') {
    const board = roleGraphBoardRef.current
    if (!board) return
    if (!visibleRoleMemory.length) {
      setRoleGraphViewport({ x: 0, y: 0, scale: 1 })
      return
    }
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    visibleRoleMemory.forEach((item, index) => {
      const position = visibleRolePositionById.get(item.id) ?? getRoleNodePosition(item, index)
      minX = Math.min(minX, position.x)
      minY = Math.min(minY, position.y)
      maxX = Math.max(maxX, position.x + ROLE_NODE_WIDTH)
      maxY = Math.max(maxY, position.y + ROLE_NODE_HEIGHT)
    })
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      setRoleGraphViewport({ x: 0, y: 0, scale: 1 })
      return
    }
    const boardWidth = Math.max(1, board.clientWidth)
    const boardHeight = Math.max(1, board.clientHeight)
    const padding = 32
    const boundsWidth = Math.max(1, maxX - minX)
    const boundsHeight = Math.max(1, maxY - minY)
    const fitScale = Math.min(
      (boardWidth - padding * 2) / boundsWidth,
      (boardHeight - padding * 2) / boundsHeight
    )
    const desiredScale =
      mode === 'one-to-one'
        ? 1
        : Math.min(1, Number.isFinite(fitScale) ? fitScale : 1)
    const nextScale = clampNumber(
      desiredScale,
      ROLE_GRAPH_MIN_SCALE,
      ROLE_GRAPH_MAX_SCALE
    )
    const nextX = (boardWidth - boundsWidth * nextScale) / 2 - minX * nextScale
    const nextY = (boardHeight - boundsHeight * nextScale) / 2 - minY * nextScale
    setRoleGraphViewport({
      x: Number.isFinite(nextX) ? nextX : 0,
      y: Number.isFinite(nextY) ? nextY : 0,
      scale: Number.isFinite(nextScale) ? nextScale : 1
    })
  }

  function centerBackupGraphToNodes(mode: 'fit' | 'one-to-one' = 'fit') {
    const board = backupGraphBoardRef.current
    if (!board) return
    if (!filteredBackups.length) {
      setBackupGraphViewport({ x: 0, y: 0, scale: 1 })
      return
    }
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    filteredBackups.forEach((item, index) => {
      const position = backupPositionById.get(item.id) ?? getBackupNodePosition(item, index)
      minX = Math.min(minX, position.x)
      minY = Math.min(minY, position.y)
      maxX = Math.max(maxX, position.x + BACKUP_NODE_WIDTH)
      maxY = Math.max(maxY, position.y + BACKUP_NODE_HEIGHT)
    })
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      setBackupGraphViewport({ x: 0, y: 0, scale: 1 })
      return
    }
    const boardWidth = Math.max(1, board.clientWidth)
    const boardHeight = Math.max(1, board.clientHeight)
    const padding = 32
    const boundsWidth = Math.max(1, maxX - minX)
    const boundsHeight = Math.max(1, maxY - minY)
    const fitScale = Math.min(
      (boardWidth - padding * 2) / boundsWidth,
      (boardHeight - padding * 2) / boundsHeight
    )
    const desiredScale =
      mode === 'one-to-one'
        ? 1
        : Math.min(1, Number.isFinite(fitScale) ? fitScale : 1)
    const nextScale = clampNumber(desiredScale, ROLE_GRAPH_MIN_SCALE, ROLE_GRAPH_MAX_SCALE)
    const nextX = (boardWidth - boundsWidth * nextScale) / 2 - minX * nextScale
    const nextY = (boardHeight - boundsHeight * nextScale) / 2 - minY * nextScale
    setBackupGraphViewport({
      x: Number.isFinite(nextX) ? nextX : 0,
      y: Number.isFinite(nextY) ? nextY : 0,
      scale: Number.isFinite(nextScale) ? nextScale : 1
    })
  }

  function buildWorkspaceSnapshot(): NormalizedWorkspace {
    const chapterId = activeChapterRef.current?.id ?? activeChapterId
    const versionId = activeVersionRef.current?.id ?? null
    const normalizedChapters =
      versionId === null
        ? chapters
        : chapters.map((chapter) => {
            if (chapter.id !== chapterId) return chapter
            return {
              ...chapter,
              versions: chapter.versions.map((version) =>
                version.id === versionId && !areSameAssistantMessages(version.assistantMessages, assistantMessages)
                  ? { ...version, assistantMessages: [...assistantMessages] }
                  : version
              )
            }
          })
    return {
      chapters: normalizedChapters,
      activeChapterId,
      writingMode,
      memory,
      roleRelations,
      roleRelationTagOptions,
      backupRelations,
      backups,
      config,
      customPrompt,
      skillsPrompt,
      sessionMap,
      skillModelName,
      roleGraphVisual,
      backupGraphVisual
    }
  }

  function applyWorkspaceSnapshot(snapshot: NormalizedWorkspace) {
    const snapshotActiveChapter =
      snapshot.chapters.find((chapter) => chapter.id === snapshot.activeChapterId) ??
      snapshot.chapters[0]
    const snapshotActiveVersion =
      snapshotActiveChapter?.versions.find(
        (version) => version.id === snapshotActiveChapter.activeVersionId
      ) ?? snapshotActiveChapter?.versions[0]
    setChapters(withOrderedChapterTitles(snapshot.chapters))
    setActiveChapterId(snapshot.activeChapterId)
    setWritingMode(snapshot.writingMode)
    setMemory(snapshot.memory)
    setRoleRelations(snapshot.roleRelations)
    setRoleRelationTagOptions(normalizeRoleRelationTagOptions(snapshot.roleRelationTagOptions))
    setBackupRelations(snapshot.backupRelations)
    setBackups(snapshot.backups)
    setConfig(snapshot.config)
    setCustomPrompt(snapshot.customPrompt)
    setSkillsPrompt(snapshot.skillsPrompt)
    setSessionMap(snapshot.sessionMap)
    setSkillModelName(snapshot.skillModelName)
    setRoleGraphVisual(snapshot.roleGraphVisual)
    setBackupGraphVisual(snapshot.backupGraphVisual)
    setActivePanel('memory')
    setResult('')
    setError('')
    setAssistantMessages(snapshotActiveVersion?.assistantMessages ?? [])
    setAssistantInput('')
    setAssistantRunning(false)
    setAssistantProgressLogs([])
    setMemorySearchQuery('')
    setMemoryModule('info')
    setRoleGraphView('list')
    setIsRoleGraphVisualDialogOpen(false)
    setRoleGraphViewport({ x: 0, y: 0, scale: 1 })
    setIsRoleGraphSpacePressed(false)
    setIsRoleGraphPanning(false)
    roleGraphPanStartRef.current = null
    setRoleEditorDialog(null)
    setRoleRelationEditorDialog(null)
    setHoveredRoleRelationId(null)
    setDraggingRoleRelationCurve(null)
    setSelectedRoleIds(new Set())
    setRoleSelectionBox(null)
    setRoleNodeMenu({ open: false, x: 0, y: 0, roleId: null })
    setDraggingRoleId(null)
    roleDragIdsRef.current = []
    roleDragOffsetsByIdRef.current = {}
    setHoveredRoleId(null)
    setRoleLinkStart(null)
    setRoleLinkTarget(null)
    setRoleLinkPreview(null)
    setRoleRelationMenu({ open: false, x: 0, y: 0, relationId: null })
    setActiveRoleRelationMode(DEFAULT_ROLE_RELATION_MODE)
    setActiveRoleRelationStrokeColor(DEFAULT_ROLE_RELATION_STROKE_COLOR)
    setBackupGraphView('list')
    setIsBackupGraphVisualDialogOpen(false)
    setBackupActiveRelationMode(DEFAULT_ROLE_RELATION_MODE)
    setBackupActiveRelationStrokeColor(DEFAULT_BACKUP_RELATION_STROKE_COLOR)
    setBackupActiveRelationLabelColor(DEFAULT_BACKUP_RELATION_LABEL_COLOR)
    setDraggingBackupId(null)
    backupDragIdsRef.current = []
    backupDragOffsetsByIdRef.current = {}
    setHoveredBackupId(null)
    setSelectedBackupIds(new Set())
    setBackupSelectionBox(null)
    setBackupLinkStart(null)
    setBackupLinkTarget(null)
    setBackupLinkPreview(null)
    setHoveredBackupRelationId(null)
    setDraggingBackupRelationCurve(null)
    setBackupRelationEditorDialog(null)
    setBackupRelationMenu({ open: false, x: 0, y: 0, relationId: null })
    setBackupNodeMenu({ open: false, x: 0, y: 0, backupId: null })
    setBackupEditorDialog(null)
    setBackupSearchQuery('')
    setIsBackupGraphFullscreen(false)
    setBackupGraphViewport({ x: 0, y: 0, scale: 1 })
    setIsBackupGraphSpacePressed(false)
    setIsBackupGraphPanning(false)
    backupGraphPanStartRef.current = null
    setIsAdvancedSettingsOpen(false)
  }

  function persistWorkspaceWithRoleRelations(nextRoleRelations: RoleRelation[]) {
    if (isWorkspaceBootstrapping) return
    if (activeScreen !== 'writer') return
    if (!activeProjectId) return
    const snapshot: NormalizedWorkspace = {
      chapters,
      activeChapterId,
      writingMode,
      memory,
      roleRelations: nextRoleRelations,
      roleRelationTagOptions,
      backupRelations,
      backups,
      config,
      customPrompt,
      skillsPrompt,
      sessionMap,
      skillModelName,
      roleGraphVisual,
      backupGraphVisual
    }
    saveProjectWorkspace(activeProjectId, snapshot)
    const currentProject = projects.find((item) => item.id === activeProjectId)
    if (currentProject) {
      void syncProjectPackageToDisk(currentProject.id, currentProject.name, snapshot)
    }
  }

  async function syncProjectsIndexToDisk(nextProjects: ProjectMeta[]) {
    if (!window.novelDesktopApi?.syncProjectsIndex) return
    await window.novelDesktopApi.syncProjectsIndex({ projects: nextProjects })
  }

  async function syncProjectPackageToDisk(
    projectId: string,
    projectName: string,
    snapshot: NormalizedWorkspace
  ) {
    if (!window.novelDesktopApi?.syncProjectPackage) return
    await window.novelDesktopApi.syncProjectPackage({
      projectId,
      projectName,
      workspace: toWorkspaceData(snapshot)
    })
  }

  async function syncAllProjectsToDisk(nextProjects: ProjectMeta[]) {
    if (!window.novelDesktopApi?.syncProjectsIndex || !window.novelDesktopApi?.syncProjectPackage) {
      return
    }
    await syncProjectsIndexToDisk(nextProjects)
    for (const project of nextProjects) {
      let snapshot: NormalizedWorkspace | null = null
      if (project.id === activeProjectId && activeScreen === 'writer') {
        snapshot = buildWorkspaceSnapshot()
      } else {
        snapshot = loadProjectWorkspace(project.id)
      }
      if (!snapshot) continue
      await syncProjectPackageToDisk(project.id, project.name, snapshot)
    }
  }

  async function openProjectFiles(project: ProjectMeta) {
    if (!window.novelDesktopApi?.openProjectPackage) {
      setStatus('仅桌面版支持查看文件')
      window.alert(t('仅桌面版支持查看文件', 'View Files is only available in desktop app.'))
      return
    }
    try {
      const snapshot =
        project.id === activeProjectId && activeScreen === 'writer'
          ? buildWorkspaceSnapshot()
          : loadProjectWorkspace(project.id)
      if (snapshot) {
        await syncProjectPackageToDisk(project.id, project.name, snapshot).catch(() => {})
      }
      const response = await window.novelDesktopApi.openProjectPackage({
        projectId: project.id,
        projectName: project.name
      })
      if (!response.ok) {
        const message = response.error || '未知错误'
        setStatus(`打开项目目录失败：${message}`)
        setError(`打开项目目录失败：${message}`)
        window.alert(
          t(
            `打开项目目录失败：${message}`,
            `Failed to open project folder: ${message}`
          )
        )
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误'
      setStatus(`打开项目目录失败：${message}`)
      setError(`打开项目目录失败：${message}`)
      window.alert(
        t(
          `打开项目目录失败：${message}\n请重启桌面应用后重试。`,
          `Failed to open project folder: ${message}\nPlease restart the desktop app and try again.`
        )
      )
    }
  }

  function requestDeleteProject(project: ProjectMeta) {
    setPendingRenameProject(null)
    setRenameProjectInputName('')
    setRenameProjectError('')
    setPendingDeleteProject(project)
    setDeleteProjectConfirmName('')
    setDeleteProjectConfirmError('')
  }

  function cancelDeleteProject() {
    setPendingDeleteProject(null)
    setDeleteProjectConfirmName('')
    setDeleteProjectConfirmError('')
  }

  function requestRenameProject(project: ProjectMeta) {
    setPendingDeleteProject(null)
    setDeleteProjectConfirmName('')
    setDeleteProjectConfirmError('')
    setPendingRenameProject(project)
    setRenameProjectInputName(project.name)
    setRenameProjectError('')
  }

  function cancelRenameProject() {
    setPendingRenameProject(null)
    setRenameProjectInputName('')
    setRenameProjectError('')
  }

  async function confirmRenameProject() {
    const project = pendingRenameProject
    if (!project) return
    const nextName = renameProjectInputName.trim()
    if (!nextName) {
      setRenameProjectError(
        t('项目名称不能为空。', 'Project name cannot be empty.')
      )
      setStatus(t('项目名称不能为空', 'Project name cannot be empty'))
      return
    }

    if (nextName === project.name.trim()) {
      cancelRenameProject()
      return
    }

    const hasSameName = projects.some(
      (item) => item.id !== project.id && item.name.trim().toLowerCase() === nextName.toLowerCase()
    )
    if (hasSameName) {
      setRenameProjectError(
        t('项目名称已存在，请换一个名称。', 'Project name already exists. Please choose another name.')
      )
      setStatus(t('项目名称已存在', 'Project name already exists'))
      return
    }

    setRenamingProjectId(project.id)
    try {
      const updatedAt = nowLabel()
      const nextProjects = projects.map((item) =>
        item.id === project.id
          ? {
              ...item,
              name: nextName,
              updatedAt
            }
          : item
      )
      setProjects(nextProjects)
      saveProjectIndex(nextProjects)
      await syncProjectsIndexToDisk(nextProjects)

      const snapshot =
        project.id === activeProjectId && activeScreen === 'writer'
          ? buildWorkspaceSnapshot()
          : loadProjectWorkspace(project.id)
      if (snapshot) {
        await syncProjectPackageToDisk(project.id, nextName, snapshot)
      }

      setStatus(
        appLanguage === 'en-US' ? `Project renamed: ${nextName}` : `已重命名项目：${nextName}`
      )
      cancelRenameProject()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('重命名项目失败', 'Failed to rename project'))
      setStatus(t('重命名项目失败', 'Failed to rename project'))
    } finally {
      setRenamingProjectId((current) => (current === project.id ? null : current))
    }
  }

  async function confirmDeleteProject() {
    const project = pendingDeleteProject
    if (!project) return
    const expectedName = project.name.trim()
    if (deleteProjectConfirmName.trim() !== expectedName) {
      setDeleteProjectConfirmError(
        t('项目名不匹配，请完整输入后再删除。', 'Project name mismatch. Please type the full name.')
      )
      setStatus(t('输入不匹配，请检查项目名', 'Name mismatch. Check the project name.'))
      return
    }

    setDeleteProjectConfirmError('')
    setDeletingProjectId(project.id)
    try {
      localStorage.removeItem(projectStorageKey(project.id))
      if (window.novelDesktopApi?.deleteProjectPackage) {
        await window.novelDesktopApi.deleteProjectPackage({
          projectId: project.id,
          projectName: project.name
        })
      }

      const nextProjects = projects.filter((item) => item.id !== project.id)
      setProjects(nextProjects)
      saveProjectIndex(nextProjects)
      await syncProjectsIndexToDisk(nextProjects)

      if (activeProjectId === project.id) {
        setActiveProjectId('')
        localStorage.removeItem(LAST_PROJECT_KEY)
      }

      setStatus(
        appLanguage === 'en-US' ? `Project deleted: ${project.name}` : `已删除项目：${project.name}`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : t('删除项目失败', 'Delete project failed'))
      setStatus(t('删除项目失败', 'Delete project failed'))
    } finally {
      setDeletingProjectId((current) => (current === project.id ? null : current))
      cancelDeleteProject()
    }
  }

  async function applyProjectSettings() {
    if (!window.novelDesktopApi?.updateProjectSettings) return
    setIsApplyingProjectSettings(true)
    try {
      await syncAllProjectsToDisk(projects)
      const response = await window.novelDesktopApi.updateProjectSettings({
        language: appLanguage,
        projectsDir: projectStorageDir,
        autoUpdate: autoUpdateEnabled,
        autoLaunch: autoLaunchEnabled
      })
      setAppLanguage(response.settings.language)
      setProjectStorageDir(response.settings.projectsDir)
      setAutoUpdateEnabled(response.settings.autoUpdate)
      setAutoLaunchEnabled(response.settings.autoLaunch)
      setAppVersionLabel(response.settings.appVersion || 'v 1.1 bate')
      setStatus('项目设置已更新')
      setProjectSettingsNotice({
        kind: 'success',
        message: t('设置保存成功', 'Settings saved successfully')
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : '更新设置失败'
      setError(message)
      setStatus('更新设置失败')
      setProjectSettingsNotice({
        kind: 'error',
        message: `${t('设置保存失败', 'Failed to save settings')}${message ? `：${message}` : ''}`
      })
    } finally {
      setIsApplyingProjectSettings(false)
    }
  }

  async function pickProjectStorageDir() {
    if (!window.novelDesktopApi?.pickProjectStorageDir) return
    const response = await window.novelDesktopApi.pickProjectStorageDir()
    if (!response.canceled && response.path) {
      setProjectStorageDir(response.path)
    }
  }

  async function checkAppUpgrade() {
    if (!window.novelDesktopApi?.checkAppUpgrade) {
      setProjectSettingsNotice({
        kind: 'error',
        message: t('当前环境不支持软件升级检测', 'Upgrade check is not available in this environment')
      })
      return
    }
    if (isCheckingAppUpgrade) return
    setIsCheckingAppUpgrade(true)
    try {
      const payload = await window.novelDesktopApi.checkAppUpgrade()
      setAppVersionLabel(payload.currentVersion || appVersionLabel)
      setProjectSettingsNotice({
        kind: 'success',
        message: payload.hasUpdate
          ? t(
              `发现新版本：${payload.latestVersion}`,
              `New version available: ${payload.latestVersion}`
            )
          : t(
              `已是最新版本（${payload.currentVersion}）`,
              `You're up to date (${payload.currentVersion})`
            )
      })
    } catch (err) {
      setProjectSettingsNotice({
        kind: 'error',
        message: err instanceof Error ? err.message : t('检查升级失败', 'Upgrade check failed')
      })
    } finally {
      setIsCheckingAppUpgrade(false)
    }
  }

  function toActivationStatus(payload: unknown): ActivationStatus {
    const data = (payload && typeof payload === 'object' ? payload : {}) as Partial<ActivationStatus>
    return {
      activated: Boolean(data.activated),
      rawActivated: Boolean(data.rawActivated ?? data.activated),
      email: String(data.email || ''),
      activatedAt: String(data.activatedAt || ''),
      currentMachineMac: String(data.currentMachineMac || ''),
      boundMachineMac: String(data.boundMachineMac || ''),
      machineBound: Boolean(data.machineBound ?? true),
      mode: String(data.mode || 'offline-v1'),
      projectLimit: Number.isFinite(Number(data.projectLimit))
        ? Number(data.projectLimit)
        : 1,
      localModelAllowed: Boolean(data.localModelAllowed ?? data.activated)
    }
  }

  async function refreshActivationStatus() {
    if (!window.novelDesktopApi?.getActivationStatus) return
    try {
      const payload = await window.novelDesktopApi.getActivationStatus()
      const raw =
        payload && typeof payload === 'object' && 'status' in payload
          ? (payload as { status?: unknown }).status
          : payload
      setActivationStatus(toActivationStatus(raw))
    } catch {
      // ignore activation status errors
    }
  }

  async function openActivationDialog(reason?: string) {
    if (!window.novelDesktopApi?.openActivationDialog) return
    if (isOpeningActivationDialog) return
    setIsOpeningActivationDialog(true)
    try {
      const result = await window.novelDesktopApi.openActivationDialog({
        reason:
          reason ||
          t(
            '未激活版本仅支持一个项目且无法使用本地模型，请先激活。',
            'Free mode supports one project only and no local models. Please activate.'
          )
      })
      if (result?.status) {
        setActivationStatus(toActivationStatus(result.status))
      } else {
        await refreshActivationStatus()
      }
      await refreshActivationStatus()
      setStatus(result?.ok ? t('激活成功', 'Activated successfully') : t('激活状态已刷新', 'Activation status refreshed'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('打开激活窗口失败', 'Failed to open activation dialog'))
      setStatus(t('打开激活窗口失败', 'Failed to open activation dialog'))
    } finally {
      setIsOpeningActivationDialog(false)
    }
  }

  async function unbindCurrentMachine() {
    if (!window.novelDesktopApi?.unbindCurrentMachine) return
    if (isUnbindingMachine) return
    const confirmed = window.confirm(
      t(
        '确认取消本机绑定吗？取消后本机将回到未激活状态。',
        'Unbind this machine now? This device will return to not activated state.'
      )
    )
    if (!confirmed) return

    setIsUnbindingMachine(true)
    try {
      const result = await window.novelDesktopApi.unbindCurrentMachine()
      if (result?.status) {
        setActivationStatus(toActivationStatus(result.status))
      } else {
        await refreshActivationStatus()
      }
      setStatus(t('已取消本机绑定', 'Machine unbound successfully'))
    } catch (err) {
      const message = err instanceof Error ? err.message : t('取消绑定失败', 'Failed to unbind machine')
      setError(message)
      setStatus(message)
    } finally {
      setIsUnbindingMachine(false)
    }
  }

  function openProject(projectId: string, loadedSnapshot?: NormalizedWorkspace) {
    const snapshot = loadedSnapshot ?? loadProjectWorkspace(projectId)
    if (!snapshot) {
      setStatus('项目数据读取失败')
      return
    }
    applyWorkspaceSnapshot(snapshot)
    setActiveProjectId(projectId)
    localStorage.setItem(LAST_PROJECT_KEY, projectId)
    setActiveScreen('writer')
    const project = projects.find((item) => item.id === projectId)
    setStatus(project ? `已打开项目：${project.name}` : '已打开项目')
  }

  function openCreateProjectModal() {
    if (
      hasActivationSupport &&
      !activationStatus.activated &&
      projects.length >= activationStatus.projectLimit
    ) {
      setStatus(
        t(
          `未激活版本最多创建 ${activationStatus.projectLimit} 个项目，请先激活。`,
          `Free mode allows up to ${activationStatus.projectLimit} project(s). Please activate first.`
        )
      )
      void openActivationDialog('Free mode supports one project only. Activate to create more projects.')
      return
    }
    setNewProjectName('')
    setIsCreateProjectModalOpen(true)
  }

  function closeCreateProjectModal() {
    setIsCreateProjectModalOpen(false)
    setNewProjectName('')
  }

  function createProject(inputName?: string) {
    if (
      hasActivationSupport &&
      !activationStatus.activated &&
      projects.length >= activationStatus.projectLimit
    ) {
      setStatus(
        t(
          `未激活版本最多创建 ${activationStatus.projectLimit} 个项目，请先激活。`,
          `Free mode allows up to ${activationStatus.projectLimit} project(s). Please activate first.`
        )
      )
      void openActivationDialog('Free mode supports one project only. Activate to create more projects.')
      return
    }
    const nextName = String(inputName ?? newProjectName).trim()
    if (!nextName) {
      setStatus(t('请输入作品名称', 'Please enter a project name'))
      return
    }
    const now = nowLabel()
    const projectId = createProjectId()
    const nextMeta: ProjectMeta = {
      id: projectId,
      name: nextName,
      createdAt: now,
      updatedAt: now
    }
    const nextWorkspace = createDefaultWorkspace()
    saveProjectWorkspace(projectId, nextWorkspace)
    const nextProjects = [nextMeta, ...projects]
    setProjects(nextProjects)
    saveProjectIndex(nextProjects)
    void syncProjectsIndexToDisk(nextProjects)
    void syncProjectPackageToDisk(projectId, nextName, nextWorkspace)
    closeCreateProjectModal()
    openProject(projectId, nextWorkspace)
    setStatus(`已创建项目：${nextName}`)
  }

  async function importProjectsFromDisk() {
    if (!window.novelDesktopApi?.importProjectPackages) {
      const message = t('仅桌面版支持导入作品', 'Import is only available in desktop app.')
      setStatus(message)
      window.alert(message)
      return
    }
    if (isImportingProjects) return
    setIsImportingProjects(true)
    try {
      const response = await window.novelDesktopApi.importProjectPackages()
      if (response.canceled) {
        setStatus(t('已取消导入作品', 'Import canceled'))
        return
      }

      const importedItems = Array.isArray(response.imported) ? response.imported : []
      const importedMetas = importedItems
        .map((item) => {
          const id = String(item?.id || '').trim()
          const name = String(item?.name || '').trim()
          if (!id || !name) return null
          const normalized =
            normalizeWorkspaceData((item.workspace ?? {}) as WorkspaceData) ?? createDefaultWorkspace()
          saveProjectWorkspace(id, normalized)
          const existing = projects.find((project) => project.id === id)
          const now = nowLabel()
          return {
            id,
            name,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now
          } as ProjectMeta
        })
        .filter((item): item is ProjectMeta => item !== null)

      if (importedMetas.length === 0) {
        setStatus(t('未发现可导入的项目', 'No importable projects found'))
        return
      }

      const dedupImported: ProjectMeta[] = []
      const importedIdSet = new Set<string>()
      for (const meta of importedMetas) {
        if (importedIdSet.has(meta.id)) continue
        importedIdSet.add(meta.id)
        dedupImported.push(meta)
      }
      const nextProjects = [
        ...dedupImported,
        ...projects.filter((project) => !importedIdSet.has(project.id))
      ]
      setProjects(nextProjects)
      saveProjectIndex(nextProjects)
      await syncProjectsIndexToDisk(nextProjects)
      setError('')
      if (response.skippedCount > 0) {
        setStatus(`已导入 ${dedupImported.length} 个作品，跳过 ${response.skippedCount} 个`)
      } else {
        setStatus(`已导入 ${dedupImported.length} 个作品`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('导入作品失败', 'Import failed')
      setError(message)
      setStatus(message)
      window.alert(t(`导入作品失败：${message}`, `Failed to import projects: ${message}`))
    } finally {
      setIsImportingProjects(false)
    }
  }

  function openProjectCenter() {
    setProjects(loadProjectIndex())
    setProjectCenterView('home')
    setActiveScreen('projects')
  }

  async function closeDesktopWindow() {
    if (!window.novelDesktopApi?.closeWindow) return
    try {
      await window.novelDesktopApi.closeWindow()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('关闭窗口失败', 'Failed to close window'))
      setStatus(t('关闭窗口失败', 'Failed to close window'))
    }
  }

  async function minimizeDesktopWindow() {
    if (!window.novelDesktopApi?.minimizeWindow) return
    try {
      const response = await window.novelDesktopApi.minimizeWindow()
      if (response?.ok) setIsWindowMaximized(Boolean(response.isMaximized))
    } catch {
      // ignore
    }
  }

  async function toggleDesktopMaximizeWindow() {
    if (!window.novelDesktopApi?.toggleMaximizeWindow) return
    try {
      const response = await window.novelDesktopApi.toggleMaximizeWindow()
      if (response?.ok) setIsWindowMaximized(Boolean(response.isMaximized))
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!window.novelDesktopApi?.getProjectSettings) return
    let cancelled = false
    void window.novelDesktopApi
      .getProjectSettings()
      .then((settings) => {
        if (cancelled) return
        setAppLanguage(settings.language)
        setProjectStorageDir(settings.projectsDir)
        setAutoUpdateEnabled(settings.autoUpdate)
        setAutoLaunchEnabled(settings.autoLaunch)
        setAppVersionLabel(settings.appVersion || 'v 1.1 bate')
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!window.novelDesktopApi?.getActivationStatus) return
    void window.novelDesktopApi
      .getActivationStatus()
      .then((payload) => {
        if (cancelled) return
        const raw =
          payload && typeof payload === 'object' && 'status' in payload
            ? (payload as { status?: unknown }).status
            : payload
        setActivationStatus(toActivationStatus(raw))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!window.novelDesktopApi?.getActivationStatus) return
    const timer = window.setInterval(() => {
      void refreshActivationStatus()
    }, 30000)
    const onFocus = () => {
      void refreshActivationStatus()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  useEffect(() => {
    if (activeScreen === 'writer' && activeProjectId) {
      const snapshot = loadProjectWorkspace(activeProjectId)
      if (snapshot) {
        applyWorkspaceSnapshot(snapshot)
      } else {
        setActiveScreen('projects')
        setStatus(t('未找到上次项目数据，已返回项目页', 'Last project data not found. Returned to project page.'))
      }
    }
    setIsWorkspaceBootstrapping(false)
  }, [])

  useEffect(() => {
    if (!window.novelDesktopApi?.getWindowMaximizedState) return
    let cancelled = false
    void window.novelDesktopApi
      .getWindowMaximizedState()
      .then((payload) => {
        if (cancelled) return
        setIsWindowMaximized(Boolean(payload?.isMaximized))
      })
      .catch(() => {})
    const off =
      window.novelDesktopApi?.onWindowMaximizedChange?.((next) => {
        if (!cancelled) setIsWindowMaximized(Boolean(next))
      }) ?? (() => {})
    return () => {
      cancelled = true
      off()
    }
  }, [])

  useEffect(() => {
    if (!window.novelDesktopApi?.applyWindowScreenMode) return
    void window.novelDesktopApi
      .applyWindowScreenMode({ screen: activeScreen })
      .then((response) => {
        if (response?.ok) {
          setIsWindowMaximized(Boolean(response.isMaximized))
        }
      })
      .catch(() => {})
  }, [activeScreen])

  useEffect(() => {
    if (!projectSettingsNotice) return
    const timer = window.setTimeout(() => {
      setProjectSettingsNotice(null)
    }, 2600)
    return () => window.clearTimeout(timer)
  }, [projectSettingsNotice])

  useEffect(() => {
    setProjectActionMenuId(null)
  }, [projectCenterView, activeScreen])

  useEffect(() => {
    if (!projectActionMenuId) return

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && target.closest('.project-item-menu')) return
      setProjectActionMenuId(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setProjectActionMenuId(null)
      }
    }

    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [projectActionMenuId])

  useEffect(() => {
    if (projects.length > 0 || !legacyWorkspace) return
    const now = nowLabel()
    const migrated: ProjectMeta = {
      id: createProjectId(),
      name: '示范项目',
      createdAt: now,
      updatedAt: now
    }
    saveProjectWorkspace(migrated.id, legacyWorkspace)
    saveProjectIndex([migrated])
    void syncProjectsIndexToDisk([migrated])
    void syncProjectPackageToDisk(migrated.id, migrated.name, legacyWorkspace)
    setProjects([migrated])
    setActiveProjectId(migrated.id)
    localStorage.setItem(LAST_PROJECT_KEY, migrated.id)
    setStatus('已导入历史数据到项目列表')
  }, [projects.length, legacyWorkspace])

  useEffect(() => {
    if (isWorkspaceBootstrapping) return
    if (activeScreen !== 'writer') return
    if (!activeProjectId) return
    const snapshot = buildWorkspaceSnapshot()
    saveProjectWorkspace(activeProjectId, snapshot)
    const nextProjects = touchProjectMeta(activeProjectId, nowLabel())
    setProjects(nextProjects)
    const project = nextProjects.find((item) => item.id === activeProjectId)
    if (project) {
      void syncProjectPackageToDisk(project.id, project.name, snapshot)
      void syncProjectsIndexToDisk(nextProjects)
    }
  }, [
    activeScreen,
    activeProjectId,
    chapters,
    activeChapterId,
    memory,
    roleRelations,
    roleRelationTagOptions,
    backupRelations,
    backups,
    config,
    customPrompt,
    skillsPrompt,
    sessionMap,
    skillModelName,
    roleGraphVisual,
    backupGraphVisual,
    isWorkspaceBootstrapping
  ])

  useEffect(() => {
    if (isWorkspaceBootstrapping) return
    if (activeScreen !== 'writer') return
    if (!activeProjectId) return

    const persistNow = () => {
      const snapshot = buildWorkspaceSnapshot()
      saveProjectWorkspace(activeProjectId, snapshot)
      const currentProject = projects.find((item) => item.id === activeProjectId)
      if (currentProject) {
        void syncProjectPackageToDisk(currentProject.id, currentProject.name, snapshot)
      }
    }

    const onBeforeUnload = () => {
      persistNow()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return
      persistNow()
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [
    activeScreen,
    activeProjectId,
    projects,
    chapters,
    activeChapterId,
    memory,
    roleRelations,
    roleRelationTagOptions,
    backupRelations,
    backups,
    config,
    customPrompt,
    skillsPrompt,
    sessionMap,
    skillModelName,
    roleGraphVisual,
    backupGraphVisual,
    isWorkspaceBootstrapping
  ])

  useEffect(() => {
    if (activeScreen === 'writer') return
    autoConnectAttemptKeyRef.current = ''
  }, [activeScreen])

  useEffect(() => {
    if (memoryModule === 'role') return
    setRoleEditorDialog(null)
    setRoleRelationEditorDialog(null)
    setHoveredRoleRelationId(null)
    setDraggingRoleRelationCurve(null)
    setSelectedRoleIds(new Set())
    setRoleSelectionBox(null)
    setRoleNodeMenu({ open: false, x: 0, y: 0, roleId: null })
    setDraggingRoleId(null)
    setHoveredRoleId(null)
    setRoleLinkStart(null)
    setRoleLinkTarget(null)
    setRoleLinkPreview(null)
    setRoleRelationMenu({ open: false, x: 0, y: 0, relationId: null })
    setIsRoleGraphVisualDialogOpen(false)
    setIsRoleGraphSpacePressed(false)
    setIsRoleGraphPanning(false)
    roleGraphPanStartRef.current = null
  }, [memoryModule])

  useEffect(() => {
    if (isRoleGraphActive) return
    setHoveredRoleRelationId(null)
    setDraggingRoleRelationCurve(null)
    setSelectedRoleIds(new Set())
    setRoleSelectionBox(null)
    setRoleNodeMenu({ open: false, x: 0, y: 0, roleId: null })
    setHoveredRoleId(null)
    roleDragIdsRef.current = []
    roleDragOffsetsByIdRef.current = {}
    setRoleLinkStart(null)
    setRoleLinkTarget(null)
    setRoleLinkPreview(null)
    setRoleRelationMenu({ open: false, x: 0, y: 0, relationId: null })
    setIsRoleGraphVisualDialogOpen(false)
    setIsRoleGraphSpacePressed(false)
    setIsRoleGraphPanning(false)
    roleGraphPanStartRef.current = null
  }, [isRoleGraphActive])

  useEffect(() => {
    if (isBackupGraphActive) return
    setDraggingBackupId(null)
    backupDragIdsRef.current = []
    backupDragOffsetsByIdRef.current = {}
    setHoveredBackupId(null)
    setSelectedBackupIds(new Set())
    setBackupSelectionBox(null)
    setBackupLinkStart(null)
    setBackupLinkTarget(null)
    setBackupLinkPreview(null)
    setHoveredBackupRelationId(null)
    setDraggingBackupRelationCurve(null)
    setBackupRelationEditorDialog(null)
    setBackupRelationMenu({ open: false, x: 0, y: 0, relationId: null })
    setIsBackupGraphVisualDialogOpen(false)
    setIsBackupGraphSpacePressed(false)
    setIsBackupGraphPanning(false)
    backupGraphPanStartRef.current = null
  }, [isBackupGraphActive])

  useEffect(() => {
    if (!isRoleGraphActive || !isRoleGraphFullscreen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      if (isTypingTarget(event.target)) return
      event.preventDefault()
      setIsRoleGraphSpacePressed(true)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      setIsRoleGraphSpacePressed(false)
      setIsRoleGraphPanning(false)
      roleGraphPanStartRef.current = null
    }
    const onBlur = () => {
      setIsRoleGraphSpacePressed(false)
      setIsRoleGraphPanning(false)
      roleGraphPanStartRef.current = null
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [isRoleGraphActive, isRoleGraphFullscreen])

  useEffect(() => {
    if (isRoleGraphFullscreen) return
    setIsRoleGraphSpacePressed(false)
    setIsRoleGraphPanning(false)
    roleGraphPanStartRef.current = null
  }, [isRoleGraphFullscreen])

  useEffect(() => {
    if (isBackupGraphFullscreen) return
    setIsBackupGraphSpacePressed(false)
    setIsBackupGraphPanning(false)
    backupGraphPanStartRef.current = null
  }, [isBackupGraphFullscreen])

  useEffect(() => {
    if (!isRoleGraphActive || isRoleGraphFullscreen) return
    centerRoleGraphToNodes()
  }, [isRoleGraphActive, isRoleGraphFullscreen, visibleRoleMemory.length])

  useEffect(() => {
    if (!isBackupGraphActive || isBackupGraphFullscreen) return
    centerBackupGraphToNodes()
  }, [isBackupGraphActive, isBackupGraphFullscreen, filteredBackups.length, backupSearchQuery])

  useEffect(() => {
    if (!isRoleGraphActive || isRoleGraphFullscreen) return
    const board = roleGraphBoardRef.current
    if (!board || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      centerRoleGraphToNodes()
    })
    observer.observe(board)
    return () => {
      observer.disconnect()
    }
  }, [isRoleGraphActive, isRoleGraphFullscreen])

  useEffect(() => {
    if (!isBackupGraphActive || isBackupGraphFullscreen) return
    const board = backupGraphBoardRef.current
    if (!board || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      centerBackupGraphToNodes()
    })
    observer.observe(board)
    return () => {
      observer.disconnect()
    }
  }, [isBackupGraphActive, isBackupGraphFullscreen, backupSearchQuery])

  useEffect(() => {
    if (!isRoleGraphActive || !isRoleGraphFullscreen) return
    let raf1 = 0
    let raf2 = 0
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        centerRoleGraphToNodes('one-to-one')
      })
    })
    return () => {
      if (raf1) window.cancelAnimationFrame(raf1)
      if (raf2) window.cancelAnimationFrame(raf2)
    }
  }, [isRoleGraphActive, isRoleGraphFullscreen])

  useEffect(() => {
    if (!isBackupGraphActive || !isBackupGraphFullscreen) return
    let raf1 = 0
    let raf2 = 0
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        centerBackupGraphToNodes('one-to-one')
      })
    })
    return () => {
      if (raf1) window.cancelAnimationFrame(raf1)
      if (raf2) window.cancelAnimationFrame(raf2)
    }
  }, [isBackupGraphActive, isBackupGraphFullscreen])

  useEffect(() => {
    if (!isBackupGraphActive || !isBackupGraphFullscreen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      if (isTypingTarget(event.target)) return
      event.preventDefault()
      setIsBackupGraphSpacePressed(true)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      setIsBackupGraphSpacePressed(false)
      setIsBackupGraphPanning(false)
      backupGraphPanStartRef.current = null
    }
    const onBlur = () => {
      setIsBackupGraphSpacePressed(false)
      setIsBackupGraphPanning(false)
      backupGraphPanStartRef.current = null
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [isBackupGraphActive, isBackupGraphFullscreen])

  useEffect(() => {
    localStorage.setItem(LAST_SCREEN_KEY, activeScreen)
  }, [activeScreen])

  useEffect(() => {
    if (activeScreen !== 'writer') return
    if (activeProjectId) return
    setActiveScreen('projects')
  }, [activeScreen, activeProjectId])

  useEffect(() => {
    if (!activeProjectId) return
    if (projects.some((project) => project.id === activeProjectId)) return
    setActiveProjectId('')
    localStorage.removeItem(LAST_PROJECT_KEY)
  }, [projects, activeProjectId])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'd' &&
        editorRef.current?.hasTextFocus()
      ) {
        event.preventDefault()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [])

  useEffect(() => {
    const viewport = versionTabsViewportRef.current
    if (!viewport) return

    let frameId = 0
    const syncVersionLayout = () => {
      if (!chapterVersions.length) {
        setVisibleVersionIds((previous) => (previous.length === 0 ? previous : []))
        setOverflowVersionIds((previous) => (previous.length === 0 ? previous : []))
        return
      }

      const widthById = new Map<number, number>()
      for (const version of chapterVersions) {
        const measureNode = versionMeasureRefs.current[version.id]
        const measuredWidth = measureNode ? Math.ceil(measureNode.getBoundingClientRect().width) : 0
        const fallbackWidth = estimateVersionTabWidth(version.title, canDeleteVersion)
        widthById.set(version.id, measuredWidth > 0 ? measuredWidth : fallbackWidth)
      }

      const availableWidth = Math.max(0, viewport.clientWidth - VERSION_ADD_BUTTON_WIDTH)
      const visibleIds =
        availableWidth > 0
          ? pickVisibleVersionIds(
              chapterVersions,
              widthById,
              availableWidth,
              activeChapter?.activeVersionId ?? chapterVersions[0].id
            )
          : chapterVersions.map((version) => version.id)
      const visibleIdSet = new Set(visibleIds)
      const overflowIds = chapterVersions
        .filter((version) => !visibleIdSet.has(version.id))
        .map((version) => version.id)

      setVisibleVersionIds((previous) =>
        areSameNumberList(previous, visibleIds) ? previous : visibleIds
      )
      setOverflowVersionIds((previous) =>
        areSameNumberList(previous, overflowIds) ? previous : overflowIds
      )
    }

    const scheduleSync = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId)
      }
      frameId = window.requestAnimationFrame(() => {
        syncVersionLayout()
      })
    }

    scheduleSync()
    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        scheduleSync()
      })
      observer.observe(viewport)
    }
    window.addEventListener('resize', scheduleSync)

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId)
      }
      observer?.disconnect()
      window.removeEventListener('resize', scheduleSync)
    }
  }, [
    activeChapter?.activeVersionId,
    canDeleteVersion,
    chapterVersions,
    editingVersionId,
    editingVersionTitle,
  ])

  useEffect(() => {
    if (!isOverflowMenuVisible) return

    const onPointerDown = (event: MouseEvent) => {
      if (overflowMenuRef.current?.contains(event.target as Node)) return
      setIsOverflowMenuOpen(false)
    }

    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [isOverflowMenuVisible])

  useEffect(() => {
    if (!isVersionHistoryOpen) return
    if (!orderedVersionHistory.length) {
      setSelectedHistoryId(null)
      return
    }
    setSelectedHistoryId((previous) =>
      previous && orderedVersionHistory.some((item) => item.id === previous)
        ? previous
        : orderedVersionHistory[0].id
    )
  }, [isVersionHistoryOpen, orderedVersionHistory])

  useEffect(() => {
    if (!isAddPageMenuOpen) return

    const onPointerDown = (event: MouseEvent) => {
      if (addPageMenuRef.current?.contains(event.target as Node)) return
      setIsAddPageMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsAddPageMenuOpen(false)
      }
    }

    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [isAddPageMenuOpen])

  useEffect(() => {
    if (!editorContextMenu.open) return

    const onPointerDown = (event: MouseEvent) => {
      if (editorContextMenuRef.current?.contains(event.target as Node)) return
      closeEditorContextMenu()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeEditorContextMenu()
      }
    }
    const onBlur = () => closeEditorContextMenu()

    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [editorContextMenu.open])

  useEffect(() => {
    scheduleScriptLineDecorations()
  }, [activeVersion?.id, activeVersionWritingMode])

  useEffect(() => {
    return () => {
      if (scriptDecorationFrameRef.current !== null) {
        window.cancelAnimationFrame(scriptDecorationFrameRef.current)
        scriptDecorationFrameRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!scriptRolePicker) return
    const timer = window.setTimeout(() => {
      scriptRolePickerInputRef.current?.focus()
      scriptRolePickerInputRef.current?.select()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [scriptRolePicker])

  useEffect(() => {
    if (!scriptRolePicker) {
      setScriptRolePickerRoleDraft(null)
      return
    }
    const currentName = normalizeScriptRoleName(
      scriptRolePicker.query.trim() || scriptRolePicker.currentName || ''
    ).toLowerCase()
    const currentRole = roleMemoryByNormalizedName.get(currentName) ?? null
    if (!currentRole) {
      setScriptRolePickerRoleDraft(null)
      return
    }
    setScriptRolePickerRoleDraft((previous) => {
      if (previous && previous.roleId === currentRole.id) return previous
      return {
        roleId: currentRole.id,
        roleName: getRoleName(currentRole),
        roleNote: getRoleNote(currentRole),
        roleStance: getRoleStance(currentRole)
      }
    })
  }, [scriptRolePicker, roleMemoryByNormalizedName])

  useEffect(() => {
    if (!scriptRolePicker) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (scriptRolePickerRef.current?.contains(target)) return
      closeScriptRolePicker()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeScriptRolePicker()
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [scriptRolePicker])

  useEffect(() => {
    if (activeScreen !== 'writer') {
      closeScriptRolePicker()
    }
  }, [activeScreen, activeChapterId, activeVersion?.id])

  useEffect(() => {
    if (activeScreen !== 'writer') return
    if (activeVersionWritingMode !== 'script') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key.toLowerCase() !== 'a') return
      const target = event.target
      if (
        isTypingTarget(target) &&
        !(target instanceof HTMLElement && target.closest('.monaco-editor'))
      ) {
        return
      }
      event.preventDefault()
      closeEditorContextMenu()
      closeScriptRolePicker()
      editorRef.current?.focus()
      editorRef.current?.trigger('keyboard', 'editor.action.selectAll', null)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [activeScreen, activeVersionWritingMode])

  useEffect(() => {
    if (!roleRelationMenu.open) return

    const closeMenu = () => {
      setRoleRelationMenu({ open: false, x: 0, y: 0, relationId: null })
    }
    const onPointerDown = (event: MouseEvent) => {
      if (roleRelationMenuRef.current?.contains(event.target as Node)) return
      closeMenu()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMenu()
      }
    }

    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [roleRelationMenu.open])

  useEffect(() => {
    if (!backupRelationMenu.open) return

    const closeMenu = () => {
      setBackupRelationMenu({ open: false, x: 0, y: 0, relationId: null })
    }
    const onPointerDown = (event: MouseEvent) => {
      if (backupRelationMenuRef.current?.contains(event.target as Node)) return
      closeMenu()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMenu()
      }
    }

    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [backupRelationMenu.open])

  useEffect(() => {
    if (!roleNodeMenu.open) return

    const closeMenu = () => {
      setRoleNodeMenu({ open: false, x: 0, y: 0, roleId: null })
    }
    const onPointerDown = (event: MouseEvent) => {
      if (roleNodeMenuRef.current?.contains(event.target as Node)) return
      closeMenu()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMenu()
      }
    }

    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [roleNodeMenu.open])

  useEffect(() => {
    if (!backupNodeMenu.open) return

    const closeMenu = () => {
      setBackupNodeMenu({ open: false, x: 0, y: 0, backupId: null })
    }
    const onPointerDown = (event: MouseEvent) => {
      if (backupNodeMenuRef.current?.contains(event.target as Node)) return
      closeMenu()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMenu()
      }
    }

    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [backupNodeMenu.open])

  useEffect(() => {
    if (!isRoleGraphActive) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete') return
      if (selectedRoleIds.size === 0) return
      if (isTypingTarget(event.target)) return
      if (roleEditorDialog || roleRelationEditorDialog) return
      event.preventDefault()
      deleteRoleMemories(Array.from(selectedRoleIds))
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [
    isRoleGraphActive,
    selectedRoleIds,
    roleEditorDialog,
    roleRelationEditorDialog
  ])

  useEffect(() => {
    if (!isBackupGraphActive) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete') return
      if (selectedBackupIds.size === 0) return
      if (isTypingTarget(event.target)) return
      if (backupEditorDialog || backupRelationEditorDialog || backupNodeMenu.open) return
      event.preventDefault()
      deleteBackups(Array.from(selectedBackupIds))
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [
    isBackupGraphActive,
    selectedBackupIds,
    backupEditorDialog,
    backupRelationEditorDialog,
    backupNodeMenu.open
  ])

  useEffect(() => {
    if (!window.novelDesktopApi?.listSkills) return
    let cancelled = false
    void window.novelDesktopApi
      .listSkills()
      .then((payload) => {
        if (cancelled) return
        applySkillsCenterPayload(payload as SkillsCenterPayload)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '加载 Skills 失败')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const counts = useMemo(() => {
    const compact = currentDraft.replace(/\s/g, '')
    return {
      chars: compact.length,
      lines: lineCount(currentDraft),
      versions: activeChapter?.versions.length ?? 0,
      memories: memory.length,
      backups: backups.length
    }
  }, [currentDraft, activeChapter, memory, backups])

  const canRunSelectionActions =
    hasSelection || selectedSnippet.trim().length > 0
  const isModelBusy = isRunning || assistantRunning
  const isModelUnavailable = connectionState === 'checking' || connectionState === 'failed'
  const assistantSendDisabled =
    assistantRunning || isModelUnavailable || !assistantInput.trim()
  const assistantSendLoading = assistantRunning || connectionState === 'checking'
  const assistantSendLabel = assistantRunning
    ? '发送中'
    : connectionState === 'checking'
      ? '模型启动中'
      : connectionState === 'failed'
        ? '模型不可用'
        : '发送'
  const editorContextModelStatusState = isModelBusy
    ? 'busy'
    : connectionState === 'checking'
      ? 'checking'
      : connectionState === 'failed'
        ? 'failed'
        : ''
  const editorContextModelStatusTip =
    editorContextModelStatusState === 'busy'
      ? '模型正在运行中...'
      : editorContextModelStatusState === 'checking'
        ? '大模型启动中，请稍后再试'
        : editorContextModelStatusState === 'failed'
          ? '当前大模型不可用，可能未启动'
          : ''
  const filteredScriptRolePickerOptions = useMemo(() => {
    if (!scriptRolePicker) return scriptRolePickerOptions
    const keyword = scriptRolePicker.query.trim().toLowerCase()
    if (!keyword) return scriptRolePickerOptions
    return scriptRolePickerOptions.filter((name) => name.toLowerCase().includes(keyword))
  }, [scriptRolePicker, scriptRolePickerOptions])
  const scriptRolePickerCurrentName = normalizeScriptRoleName(
    scriptRolePicker?.query?.trim() || scriptRolePicker?.currentName || ''
  )
  const scriptRolePickerCurrentKey = scriptRolePickerCurrentName.toLowerCase()
  const scriptRolePickerCurrentRoleMemory =
    roleMemoryByNormalizedName.get(scriptRolePickerCurrentKey) ?? null
  const isScriptRolePickerCurrentTracked =
    !!scriptRolePickerCurrentName && !isNarratorLabel(scriptRolePickerCurrentName) && !!scriptRolePickerCurrentRoleMemory
  const isScriptRolePickerRoleDraftDirty = useMemo(() => {
    if (!scriptRolePickerCurrentRoleMemory || !scriptRolePickerRoleDraft) return false
    if (scriptRolePickerRoleDraft.roleId !== scriptRolePickerCurrentRoleMemory.id) return false
    const currentName = getRoleName(scriptRolePickerCurrentRoleMemory).trim()
    const currentNote = getRoleNote(scriptRolePickerCurrentRoleMemory)
    const currentStance = getRoleStance(scriptRolePickerCurrentRoleMemory)
    return (
      scriptRolePickerRoleDraft.roleName.trim() !== currentName ||
      scriptRolePickerRoleDraft.roleNote !== currentNote ||
      scriptRolePickerRoleDraft.roleStance !== currentStance
    )
  }, [scriptRolePickerCurrentRoleMemory, scriptRolePickerRoleDraft])
  const canDeleteChapter = chapters.length > 1
  const hasSkillsCenter = Boolean(window.novelDesktopApi?.listSkills)
  const hasDesktopOllamaSignin = Boolean(window.novelDesktopApi?.signinOllama)
  const hasDesktopProjectStorage = Boolean(
    window.novelDesktopApi?.getProjectSettings && window.novelDesktopApi?.openProjectPackage
  )
  const hasDesktopProjectImport = Boolean(window.novelDesktopApi?.importProjectPackages)
  const hasDesktopWindowClose = Boolean(window.novelDesktopApi?.closeWindow)
  const hasDesktopWindowControls = Boolean(window.novelDesktopApi?.isDesktop)
  const hasActivationSupport = Boolean(window.novelDesktopApi?.getActivationStatus)
  const activationLabel = activationStatus.activated
    ? t('已激活', 'Activated')
    : t('未激活', 'Not Activated')
  const activationTooltip = activationStatus.activated
    ? t('软件已激活，可使用全部功能', 'Software activated. Full features available.')
    : t(
        '当前未激活：仅可创建 1 个项目，且不能使用本地模型',
        'Not activated: only 1 project and no local models.'
      )
  const canUnbindCurrentMachine = Boolean(
    hasActivationSupport && (activationStatus.rawActivated ?? activationStatus.activated)
  )
  const currentMachineMacLabel = activationStatus.currentMachineMac || '--'
  const boundMachineMacLabel = activationStatus.boundMachineMac || '--'
  const dashboardGreeting =
    appLanguage === 'en-US'
      ? new Date().getHours() < 6
        ? 'Late night, creator'
        : new Date().getHours() < 12
          ? 'Good morning, creator'
          : new Date().getHours() < 18
            ? 'Good afternoon, creator'
            : 'Good evening, creator'
      : new Date().getHours() < 6
        ? '夜深了，创作者'
        : new Date().getHours() < 12
          ? '早上好，创作者'
          : new Date().getHours() < 18
            ? '下午好，创作者'
            : '晚上好，创作者'
  const recentProjects = projects.slice(0, 5)
  const dashboardMetrics = useMemo(() => {
    let totalChars = 0
    let totalProjects = 0
    let todayChars = 0
    const writingDays: number[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayMs = today.getTime()

    for (const project of projects) {
      const snapshot = loadProjectWorkspace(project.id)
      if (!snapshot) continue
      totalProjects += 1
      const projectChars = countSnapshotChars(snapshot)
      totalChars += projectChars
      const updatedDayMs = parseDayStartMs(project.updatedAt)
      if (typeof updatedDayMs === 'number') {
        writingDays.push(updatedDayMs)
        if (updatedDayMs === todayMs) {
          todayChars += projectChars
        }
      }
    }

    return {
      totalChars,
      totalProjects,
      todayChars,
      streakDays: countConsecutiveDays(writingDays)
    }
  }, [projects])
  const totalCharsLabel =
    dashboardMetrics.totalChars >= 10000
      ? `${(dashboardMetrics.totalChars / 10000).toFixed(dashboardMetrics.totalChars >= 100000 ? 0 : 1)}万`
      : dashboardMetrics.totalChars.toLocaleString('zh-CN')
  const todayCharsLabel = dashboardMetrics.todayChars.toLocaleString('zh-CN')
  const editorContextMenuItems: EditorContextMenuItem[] = [
    {
      key: 'continue',
      label: '1 续写',
      shortcut: '',
      run: () => runAction(actions[0]),
      disabled: isModelBusy || isModelUnavailable || !canRunSelectionActions
    },
    {
      key: 'polish',
      label: '2 润色',
      shortcut: '',
      run: () => runAction(actions[1]),
      disabled: isModelBusy || isModelUnavailable || !canRunSelectionActions
    },
    {
      key: 'expand',
      label: '3 扩写',
      shortcut: '',
      run: () => runAction(actions[2]),
      disabled: isModelBusy || isModelUnavailable || !canRunSelectionActions
    },
    {
      key: 'memory',
      label: '4 记忆',
      shortcut: '',
      run: () => runAction(actions[3]),
      disabled: isModelBusy || isModelUnavailable || !canRunSelectionActions
    },
    {
      key: 'role-memory',
      label: '5 角色',
      shortcut: '',
      run: () => {
        const input = (selectedSnippet || readSelectedTextFromEditor()).trim()
        if (!input) return
        const roleNames = writingMode === 'script' ? extractRoleNamesFromDraft(input) : []
        const items = roleNames.length > 0 ? roleNames : input.split('\n')
        appendMemoryItems(items, 'role')
        setActivePanel('memory')
        setMemoryModule('role')
        setStatus('已保存到角色')
      },
      disabled: isModelBusy || !canRunSelectionActions
    },
    {
      key: 'backup',
      label: '6 加入参考',
      shortcut: '',
      run: () => {
        const input = (selectedSnippet || readSelectedTextFromEditor()).trim()
        if (!input) return
        createBackup(input, '选中文本参考')
      },
      disabled: isModelBusy || !canRunSelectionActions
    },
    { key: 'divider-ai', divider: true },
    {
      key: 'next-match',
      label: '选取下一个',
      shortcut: 'Ctrl+D',
      run: () => runEditorAction('editor.action.addSelectionToNextFindMatch'),
      disabled: !canRunSelectionActions
    },
    {
      key: 'change-all',
      label: 'Change All Occurrences',
      shortcut: 'Ctrl+F2',
      run: () => runEditorAction('editor.action.changeAll', 'editor.action.selectHighlights'),
      disabled: !canRunSelectionActions
    },
    { key: 'divider-edit', divider: true },
    {
      key: 'cut',
      label: 'Cut',
      shortcut: '',
      run: () => runEditorAction('editor.action.clipboardCutAction'),
      disabled: !canRunSelectionActions
    },
    {
      key: 'copy',
      label: 'Copy',
      shortcut: '',
      run: () => runEditorAction('editor.action.clipboardCopyAction'),
      disabled: !canRunSelectionActions
    },
    {
      key: 'paste',
      label: 'Paste',
      shortcut: '',
      run: () => runEditorAction('editor.action.clipboardPasteAction'),
      disabled: false
    },
    { key: 'divider-command', divider: true },
    {
      key: 'command-palette',
      label: 'Command Palette',
      shortcut: 'F1',
      run: () => runEditorAction('editor.action.quickCommand'),
      disabled: false
    }
  ]

  function applySkillsCenterPayload(payload: SkillsCenterPayload) {
    const catalog = Array.isArray(payload?.catalog) ? payload.catalog : []
    setSkillCatalog(catalog)
    if (typeof payload?.skillsPrompt === 'string') {
      setSkillsPrompt(payload.skillsPrompt)
    }
    if (typeof payload?.officialDir === 'string' && payload.officialDir.trim()) {
      setOfficialSkillsDir(payload.officialDir)
    }
  }

  async function refreshSkillsCenter() {
    if (!window.novelDesktopApi?.listSkills) return
    setIsSkillsCenterBusy(true)
    try {
      const payload = (await window.novelDesktopApi.listSkills()) as SkillsCenterPayload
      applySkillsCenterPayload(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载 Skills 失败')
      setStatus('加载 Skills 失败')
    } finally {
      setIsSkillsCenterBusy(false)
    }
  }

  async function toggleSkillInstall(skill: SkillCatalogItem) {
    if (!window.novelDesktopApi?.installSkill || !window.novelDesktopApi?.uninstallSkill) return
    setIsSkillsCenterBusy(true)
    try {
      const payload = skill.installed
        ? await window.novelDesktopApi.uninstallSkill({ id: skill.id, source: skill.source })
        : await window.novelDesktopApi.installSkill({ id: skill.id, source: skill.source })
      applySkillsCenterPayload(payload as SkillsCenterPayload)
      setStatus(`${skill.name} 已${skill.installed ? '停用' : '应用'}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新 Skills 状态失败')
      setStatus('更新 Skills 状态失败')
    } finally {
      setIsSkillsCenterBusy(false)
    }
  }

  async function handleCustomSkillUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const lowerName = file.name.toLowerCase()
    const isMarkdown =
      lowerName.endsWith('.md') || lowerName.endsWith('.markdown') || file.type === 'text/markdown'
    if (!isMarkdown) {
      setStatus('请选择 Markdown 文件（.md）')
      return
    }

    try {
      const content = await file.text()
      const baseName = file.name.replace(/\.[^.]+$/, '').trim() || '自定义 Skills'
      if (window.novelDesktopApi?.createCustomSkill) {
        setIsSkillsCenterBusy(true)
        const payload = await window.novelDesktopApi.createCustomSkill({ name: baseName, content })
        applySkillsCenterPayload(payload as SkillsCenterPayload)
        setStatus(`已上传并应用 Skills：${baseName}`)
      } else {
        setSkillsPrompt(content)
        setStatus(`已导入 Skills：${file.name}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取 Skills 文件失败')
      setStatus('读取 Skills 文件失败')
    } finally {
      setIsSkillsCenterBusy(false)
    }
  }

  function startSkillRename(skill: SkillCatalogItem) {
    if (!skill.canRename) return
    setEditingSkillId(skill.id)
    setEditingSkillName(skill.name)
  }

  function cancelSkillRename() {
    setEditingSkillId(null)
    setEditingSkillName('')
  }

  async function commitSkillRename(skillId: string) {
    const nextName = editingSkillName.trim()
    if (!nextName || !window.novelDesktopApi?.renameCustomSkill) {
      cancelSkillRename()
      return
    }
    setIsSkillsCenterBusy(true)
    try {
      const payload = await window.novelDesktopApi.renameCustomSkill({ id: skillId, name: nextName })
      applySkillsCenterPayload(payload as SkillsCenterPayload)
      setStatus(`已重命名 Skills：${nextName}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '重命名 Skills 失败')
      setStatus('重命名 Skills 失败')
    } finally {
      setIsSkillsCenterBusy(false)
      cancelSkillRename()
    }
  }

  async function deleteSkill(skill: SkillCatalogItem) {
    if (!skill.canDelete || !window.novelDesktopApi?.deleteCustomSkill) return
    setIsSkillsCenterBusy(true)
    try {
      const payload = await window.novelDesktopApi.deleteCustomSkill({ id: skill.id })
      applySkillsCenterPayload(payload as SkillsCenterPayload)
      setStatus(`${skill.name} 已${skill.installed ? '停用' : '应用'}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除 Skills 失败')
      setStatus('删除 Skills 失败')
    } finally {
      setIsSkillsCenterBusy(false)
      if (editingSkillId === skill.id) cancelSkillRename()
    }
  }

  async function refreshOllamaModels(options?: {
    silent?: boolean
    syncModel?: boolean
    includeCloud?: boolean
  }) {
    const silent = Boolean(options?.silent)
    const syncModel = Boolean(options?.syncModel)
    const includeCloud = options?.includeCloud ?? loadCloudModels
    if (config.kind !== 'ollama') return
    const baseUrl = normalizeBaseUrl(config.baseUrl, 'ollama')
    if (!baseUrl) return
    if (!silent) setIsLoadingOllamaModels(true)
    try {
      let models: string[] = []
      let nextLocalModels: string[] = []
      let nextCloudModels: string[] = []
      if (window.novelDesktopApi?.listOllamaModels) {
        const payload = await window.novelDesktopApi.listOllamaModels({
          baseUrl,
          includeCloud
        })
        if (typeof payload?.error === 'string' && payload.error.trim()) {
          if (!silent) {
            setError(payload.error)
            setStatus('加载 Ollama 模型失败')
          }
          setLocalOllamaModels([])
          setCloudOllamaModels([])
          setOllamaModels([])
          return
        }
        models = Array.isArray(payload?.models)
          ? payload.models.filter(
              (item): item is string => typeof item === 'string' && Boolean(item.trim())
            )
          : []
        nextLocalModels = Array.isArray(payload?.localModels)
          ? payload.localModels.filter(
              (item): item is string => typeof item === 'string' && Boolean(item.trim())
            )
          : []
        nextCloudModels = Array.isArray(payload?.cloudModels)
          ? payload.cloudModels.filter(
              (item): item is string => typeof item === 'string' && Boolean(item.trim())
            )
          : []
        if (!nextLocalModels.length && models.length > 0) {
          nextLocalModels = models.filter((name) => !/-cloud(?::|$)/i.test(name))
        }
        if (includeCloud && !nextCloudModels.length && models.length > 0) {
          nextCloudModels = models.filter((name) => /-cloud(?::|$)/i.test(name))
        }
      } else {
        const response = await fetch(`${baseUrl}/api/tags`)
        if (!response.ok) throw new Error(`Ollama 请求失败：${response.status}`)
        const data = (await response.json()) as unknown
        nextLocalModels = pickOllamaModelNames(data)
        if (includeCloud) {
          try {
            const cloudResponse = await fetch('https://ollama.com/api/tags')
            if (cloudResponse.ok) {
              const cloudData = (await cloudResponse.json()) as unknown
              const remoteModels = pickOllamaModelNames(cloudData)
              nextCloudModels = remoteModels
                .map((name) => toCloudModelName(name))
                .filter(Boolean)
            }
          } catch {
            // ignore cloud fetch failure and keep local models
          }
        }
        models = [...nextLocalModels, ...nextCloudModels]
      }

      const nextModels = [...new Set(models)].sort((a, b) => a.localeCompare(b, 'zh-CN'))
      setLocalOllamaModels(
        [...new Set(nextLocalModels)].sort((a, b) => a.localeCompare(b, 'zh-CN'))
      )
      setCloudOllamaModels(
        [...new Set(nextCloudModels)].sort((a, b) => a.localeCompare(b, 'zh-CN'))
      )
      setOllamaModels(nextModels)

      if (syncModel) {
        const preferred = pickPreferredOllamaModel(config.model, nextModels)
        if (preferred && preferred !== config.model) {
          setConfig((current) => ({ ...current, model: preferred }))
          if (!silent) setStatus(`已同步模型：${preferred}`)
        }
      }
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : '加载 Ollama 模型失败')
        setStatus('加载 Ollama 模型失败')
      }
    } finally {
      if (!silent) setIsLoadingOllamaModels(false)
    }
  }

  async function toggleCloudModelLoading(nextValue: boolean) {
    setLoadCloudModels(nextValue)
    if (config.kind !== 'ollama') return

    if (nextValue && hasDesktopOllamaSignin && window.novelDesktopApi?.signinOllama) {
      try {
        await window.novelDesktopApi.signinOllama()
        setStatus('已触发 Ollama 登录流程')
      } catch (err) {
        setError(err instanceof Error ? err.message : '启动 Ollama 登录失败')
        setStatus('启动 Ollama 登录失败')
      }
    }

    await refreshOllamaModels({ syncModel: true, includeCloud: nextValue })
  }

  useEffect(() => {
    if (config.kind !== 'ollama') return
    const baseUrl = normalizeBaseUrl(config.baseUrl, 'ollama')
    if (!baseUrl) return
    void refreshOllamaModels({ silent: true, includeCloud: loadCloudModels })
  }, [config.kind, config.baseUrl, loadCloudModels])

  useEffect(() => {
    const signature = buildModelConnectionSignature(config)
    const restoredConnected =
      Boolean(signature) && persistedConnectionSignatureRef.current === signature
    setConnectionState(restoredConnected ? 'connected' : 'unknown')
    setRuntimeDiagnostics(null)
    setRuntimeRequestLogs([])
  }, [config.kind, config.baseUrl, config.model, config.apiKey])

  useEffect(() => {
    if (isWorkspaceBootstrapping) return
    const roleIds = new Set(allRoleMemory.map((item) => item.id))
    setRoleRelations((previous) => {
      const filtered = previous.filter(
        (relation) => roleIds.has(relation.fromMemoryId) && roleIds.has(relation.toMemoryId)
      )
      if (filtered.length === previous.length) return previous
      return filtered
    })
  }, [allRoleMemory, isWorkspaceBootstrapping])

  useEffect(() => {
    if (isWorkspaceBootstrapping) return
    const backupIds = new Set(backups.map((item) => item.id))
    setBackupRelations((previous) => {
      const filtered = previous.filter(
        (relation) =>
          backupIds.has(relation.fromBackupId) &&
          backupIds.has(relation.toBackupId) &&
          relation.fromBackupId !== relation.toBackupId
      )
      if (filtered.length === previous.length) return previous
      return filtered
    })
  }, [backups, isWorkspaceBootstrapping])

  useEffect(() => {
    const roleIds = new Set(allRoleMemory.map((item) => item.id))
    setSelectedRoleIds((previous) => {
      if (!previous.size) return previous
      const next = new Set<number>()
      previous.forEach((id) => {
        if (roleIds.has(id)) next.add(id)
      })
      return next.size === previous.size ? previous : next
    })
  }, [allRoleMemory])

  useEffect(() => {
    const onFullscreenChange = () => {
      const roleBoard = roleGraphBoardRef.current
      const backupBoard = backupGraphBoardRef.current
      setIsRoleGraphFullscreen(Boolean(roleBoard) && document.fullscreenElement === roleBoard)
      setIsBackupGraphFullscreen(Boolean(backupBoard) && document.fullscreenElement === backupBoard)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    onFullscreenChange()
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
    }
  }, [])

  useEffect(() => {
    if (
      draggingRoleId === null &&
      roleLinkStart === null &&
      !isRoleGraphPanning &&
      draggingRoleRelationCurve === null &&
      roleSelectionBox === null
    ) {
      return
    }
    const onPointerMove = (event: MouseEvent) => {
      if (isRoleGraphPanning) {
        const start = roleGraphPanStartRef.current
        if (!start) return
        setRoleGraphViewport((previous) => ({
          ...previous,
          x: start.originX + (event.clientX - start.clientX),
          y: start.originY + (event.clientY - start.clientY)
        }))
        return
      }
      const pointer = getRoleGraphPointFromClient(event.clientX, event.clientY)
      if (!pointer) return
      if (roleSelectionBox !== null) {
        const nextBox = {
          ...roleSelectionBox,
          current: pointer
        }
        setRoleSelectionBox(nextBox)
        applyRoleSelectionByBox(nextBox)
        return
      }
      if (draggingRoleRelationCurve !== null) {
        const relation = roleRelationsRef.current.find(
          (item) => item.id === draggingRoleRelationCurve.relationId
        )
        if (!relation) return
        const geometry = getRoleRelationGeometry(relation)
        if (!geometry) return
        const nextOffset = getRoleRelationCurveOffsetFromMidpoint(
          pointer,
          geometry.fromPoint,
          geometry.toPoint
        )
        setRoleRelations((previous) => {
          const nextRelations = previous.map((item) =>
            item.id === draggingRoleRelationCurve.relationId
              ? {
                  ...item,
                  curveOffsetX: nextOffset.x,
                  curveOffsetY: nextOffset.y
                }
              : item
          )
          roleRelationsRef.current = nextRelations
          return nextRelations
        })
        return
      }
      if (roleLinkStart !== null) {
        const nextTarget = getRoleLinkTargetByPoint(pointer, roleLinkStart.roleId)
        setRoleLinkTarget(nextTarget)
        if (nextTarget) {
          const nextPosition = visibleRolePositionById.get(nextTarget.roleId)
          if (nextPosition) {
            setRoleLinkPreview(getRoleSidePoint(nextPosition, nextTarget.side))
          } else {
            setRoleLinkPreview(pointer)
          }
        } else {
          setRoleLinkPreview(pointer)
        }
      }
      if (draggingRoleId === null) return
      const dragIds = roleDragIdsRef.current
      const offsetById = roleDragOffsetsByIdRef.current
      if (!dragIds.length || !Object.keys(offsetById).length) {
        const nextX = Math.max(0, pointer.x - roleDragOffset.x)
        const nextY = Math.max(0, pointer.y - roleDragOffset.y)
        updateRoleMemory(draggingRoleId, { roleX: nextX, roleY: nextY })
        return
      }
      const dragIdSet = new Set(dragIds)
      setMemory((previous) =>
        previous.map((item) => {
          if (item.kind !== 'role') return item
          if (!dragIdSet.has(item.id)) return item
          const offset = offsetById[item.id]
          if (!offset) return item
          return {
            ...item,
            roleX: Math.max(0, pointer.x - offset.x),
            roleY: Math.max(0, pointer.y - offset.y)
          }
        })
      )
    }
    const onPointerUp = (event: MouseEvent) => {
      const wasPanning = isRoleGraphPanning
      if (isRoleGraphPanning) {
        setIsRoleGraphPanning(false)
        roleGraphPanStartRef.current = null
      }
      if (wasPanning) return
      if (roleSelectionBox !== null) {
        const pointer = getRoleGraphPointFromClient(event.clientX, event.clientY)
        if (pointer) {
          const nextBox = {
            ...roleSelectionBox,
            current: pointer
          }
          applyRoleSelectionByBox(nextBox)
        }
        setRoleSelectionBox(null)
        return
      }
      if (draggingRoleRelationCurve !== null) {
        setDraggingRoleRelationCurve(null)
        persistWorkspaceWithRoleRelations(roleRelationsRef.current)
        return
      }
      if (draggingRoleId !== null) {
        setDraggingRoleId(null)
        roleDragIdsRef.current = []
        roleDragOffsetsByIdRef.current = {}
      }
      if (roleLinkStart !== null) {
        const pointer = getRoleGraphPointFromClient(event.clientX, event.clientY)
        const finalTarget =
          pointer !== null ? getRoleLinkTargetByPoint(pointer, roleLinkStart.roleId) : null
        if (finalTarget && finalTarget.roleId !== roleLinkStart.roleId) {
          updateOrCreateRoleRelation(
            roleLinkStart.roleId,
            finalTarget.roleId,
            roleLinkStart.side,
            finalTarget.side,
            roleLinkStart.mode
          )
        }
      }
      setRoleLinkStart(null)
      setRoleLinkTarget(null)
      setRoleLinkPreview(null)
    }
    window.addEventListener('mousemove', onPointerMove)
    window.addEventListener('mouseup', onPointerUp)
    return () => {
      window.removeEventListener('mousemove', onPointerMove)
      window.removeEventListener('mouseup', onPointerUp)
    }
  }, [
    draggingRoleId,
    draggingRoleRelationCurve,
    roleDragOffset.x,
    roleDragOffset.y,
    roleLinkStart,
    roleSelectionBox,
    isRoleGraphPanning,
    roleGraphViewport.x,
    roleGraphViewport.y,
    roleGraphViewport.scale
  ])

  useEffect(() => {
    if (isWorkspaceBootstrapping) return
    if (activeScreen !== 'writer') return
    if (!activeProjectId) return
    if (config.kind !== 'ollama') return
    if (!config.model.trim()) return
    if (connectionState === 'connected' || connectionState === 'checking') return
    const baseUrl = normalizeBaseUrl(config.baseUrl, 'ollama')
    if (!baseUrl) return

    const attemptKey = `${activeProjectId}|${baseUrl}|${config.model.trim()}`
    if (autoConnectAttemptKeyRef.current === attemptKey) return
    autoConnectAttemptKeyRef.current = attemptKey
    void testConnection({ auto: true })
  }, [
    activeScreen,
    activeProjectId,
    config.kind,
    config.baseUrl,
    config.model,
    connectionState,
    isWorkspaceBootstrapping
  ])

  useEffect(() => {
    if (!assistantDialogDragging) return

    const onPointerMove = (event: MouseEvent) => {
      const pane = editorPaneRef.current
      if (!pane) return
      const paneRect = pane.getBoundingClientRect()
      const dialogWidth = assistantDialogRef.current?.offsetWidth ?? 430
      const dialogHeight = assistantDialogRef.current?.offsetHeight ?? 420
      const rawX = event.clientX - paneRect.left - assistantDialogDragOffset.x
      const rawY = event.clientY - paneRect.top - assistantDialogDragOffset.y
      const maxX = Math.max(8, pane.clientWidth - dialogWidth - 8)
      const maxY = Math.max(8, pane.clientHeight - dialogHeight - 8)
      setAssistantDialogPos({
        x: Math.min(Math.max(rawX, 8), maxX),
        y: Math.min(Math.max(rawY, 8), maxY)
      })
    }
    const onPointerUp = () => {
      setAssistantDialogDragging(false)
    }

    window.addEventListener('mousemove', onPointerMove)
    window.addEventListener('mouseup', onPointerUp)
    return () => {
      window.removeEventListener('mousemove', onPointerMove)
      window.removeEventListener('mouseup', onPointerUp)
    }
  }, [assistantDialogDragging, assistantDialogDragOffset.x, assistantDialogDragOffset.y])

  useEffect(() => {
    if (!assistantOpen) return
    const viewport = assistantMessagesViewportRef.current
    if (!viewport) return
    viewport.scrollTop = viewport.scrollHeight
  }, [assistantMessages, assistantRunning, assistantOpen])

  useEffect(() => {
    if (!assistantOpen) return
    const clamp = () => {
      const pane = editorPaneRef.current
      const dialog = assistantDialogRef.current
      if (!pane || !dialog) return
      const maxX = Math.max(8, pane.clientWidth - dialog.offsetWidth - 8)
      const maxY = Math.max(8, pane.clientHeight - dialog.offsetHeight - 8)
      setAssistantDialogPos((previous) => ({
        x: Math.min(Math.max(previous.x, 8), maxX),
        y: Math.min(Math.max(previous.y, 8), maxY)
      }))
    }
    window.addEventListener('resize', clamp)
    return () => window.removeEventListener('resize', clamp)
  }, [assistantOpen])

  function clearSelectionState() {
    setHasSelection(false)
    setSelectedSnippet('')
  }

  function clearVersionRenameState() {
    setEditingVersionId(null)
    setEditingVersionTitle('')
  }

  function ensureCurrentSessionId() {
    if (!activeChapter || !activeVersion) return ''
    const key = `${activeChapter.id}:${activeVersion.id}`
    const existing = sessionMap[key]
    if (existing) return existing
    const nextId = createSessionId()
    setSessionMap((previous) => ({ ...previous, [key]: nextId }))
    return nextId
  }

  function maybeAppendVersionHistory(version: Version, nextDraft: string) {
    if (version.draft === nextDraft) return version
    const nowMs = Date.now()
    if (nowMs - version.historyLastSavedAtMs < VERSION_HISTORY_INTERVAL_MS) {
      return {
        ...version,
        draft: nextDraft,
        updatedAt: nowLabel()
      }
    }

    const nextHistoryItem: VersionHistoryItem = {
      id: nowMs,
      draft: nextDraft,
      createdAt: nowLabel(),
      createdAtMs: nowMs
    }
    const nextHistory = [...version.history, nextHistoryItem].slice(-VERSION_HISTORY_LIMIT)
    return {
      ...version,
      draft: nextDraft,
      updatedAt: nowLabel(),
      history: nextHistory,
      historyLastSavedAtMs: nowMs
    }
  }

  function updateActiveDraft(nextDraft: string) {
    setChapters((previous) =>
      previous.map((chapter) => {
        if (chapter.id !== activeChapterId) return chapter
        return {
          ...chapter,
          versions: chapter.versions.map((version) =>
            version.id === chapter.activeVersionId
              ? maybeAppendVersionHistory(version, nextDraft)
              : version
          )
        }
      })
    )
  }

  function readSelectedTextFromEditor() {
    const editor = editorRef.current
    const model = editor?.getModel()
    if (!editor || !model) return ''
    const selections = editor.getSelections() ?? []
    const texts = selections
      .filter((selection) => selection && !selection.isEmpty())
      .map((selection) => model.getValueInRange(selection))
      .filter((text) => text.trim().length > 0)
    return texts.join('\n\n')
  }

  function readSelectionRangesFromEditor(): EditorSelectionRange[] {
    const editor = editorRef.current
    if (!editor) return []
    return (editor.getSelections() ?? [])
      .filter((selection) => selection && !selection.isEmpty())
      .map((selection) => ({
        startLineNumber: selection.startLineNumber,
        startColumn: selection.startColumn,
        endLineNumber: selection.endLineNumber,
        endColumn: selection.endColumn
      }))
  }

  function applyAssistantSelectionUpdate(
    selectionRanges: EditorSelectionRange[],
    updatedSelection: string,
    originalSelectedText: string
  ) {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (editor && monaco && selectionRanges.length > 0) {
      editor.executeEdits(
        'assistant-selection-update',
        selectionRanges.map((selection) => ({
          range: new monaco.Range(
            selection.startLineNumber,
            selection.startColumn,
            selection.endLineNumber,
            selection.endColumn
          ),
          text: updatedSelection
        }))
      )
      editor.focus()
      refreshSelectionState()
      return true
    }

    const source = originalSelectedText.trim()
    if (!source) return false
    const index = currentDraft.indexOf(source)
    if (index < 0) return false
    const nextDraft =
      currentDraft.slice(0, index) + updatedSelection + currentDraft.slice(index + source.length)
    updateActiveDraft(nextDraft)
    return true
  }

  function refreshSelectionState() {
    const text = readSelectedTextFromEditor()
    setSelectedSnippet(text)
    setHasSelection(text.trim().length > 0)
  }

  function closeEditorContextMenu() {
    setEditorContextMenu((previous) => (previous.open ? { ...previous, open: false } : previous))
  }

  function openEditorContextMenu(clientX: number, clientY: number) {
    const maxX = Math.max(8, window.innerWidth - EDITOR_MENU_WIDTH - 8)
    const maxY = Math.max(8, window.innerHeight - EDITOR_MENU_HEIGHT - 8)
    const x = Math.max(8, Math.min(clientX, maxX))
    const y = Math.max(8, Math.min(clientY, maxY))
    setEditorContextMenu({ open: true, x, y })
  }

  function closeScriptRolePicker() {
    setScriptRolePicker(null)
  }

  function scheduleScriptLineDecorations() {
    if (scriptDecorationFrameRef.current !== null) return
    scriptDecorationFrameRef.current = window.requestAnimationFrame(() => {
      scriptDecorationFrameRef.current = null
      applyScriptLineDecorations()
    })
  }

  function shouldRefreshScriptDecorationsFromChange(
    event: Monaco.editor.IModelContentChangedEvent
  ) {
    if (activeVersionWritingModeRef.current !== 'script') return false
    return event.changes.some((change) => {
      if (change.text.includes('|')) return true
      if (change.text.includes('\n')) return true
      if (change.range.startColumn <= 40) return true
      if (change.range.endColumn <= 40) return true
      return false
    })
  }

  function syncScriptRolesFromContentChanges(event: Monaco.editor.IModelContentChangedEvent) {
    if (activeVersionWritingModeRef.current !== 'script') return
    const model = editorRef.current?.getModel()
    if (!model) return
    const roleSet = new Set<string>()
    for (const change of event.changes) {
      if (!change.text.includes('|')) continue
      const insertedLines = change.text.split('\n').length
      const startLine = change.range.startLineNumber
      const endLine = Math.min(model.getLineCount(), startLine + insertedLines - 1)
      for (let line = startLine; line <= endLine; line += 1) {
        const content = model.getLineContent(line)
        const match = content.match(/^(\s*)([^|\n]{1,32})\|/)
        if (!match) continue
        const normalized = normalizeScriptRoleName(match[2] ?? '')
        if (!normalized || isNarratorLabel(normalized)) continue
        roleSet.add(normalized)
      }
    }
    if (roleSet.size > 0) {
      appendMemoryItems([...roleSet], 'role')
    }
  }

  function isScriptRoleTracked(roleName: string) {
    const normalized = normalizeScriptRoleName(roleName)
    if (!normalized || isNarratorLabel(normalized)) return true
    return trackedScriptRoleNamesRef.current.has(normalized)
  }

  function addScriptRoleToMemoryIfNeeded(roleName: string) {
    const normalized = normalizeScriptRoleName(roleName)
    if (!normalized || isNarratorLabel(normalized)) return false
    if (trackedScriptRoleNamesRef.current.has(normalized)) return false
    appendMemoryItems([normalized], 'role')
    trackedScriptRoleNamesRef.current = new Set(trackedScriptRoleNamesRef.current).add(normalized)
    scheduleScriptLineDecorations()
    setStatus(`已加入角色库：${normalized}`)
    return true
  }

  function buildScriptPrefixClassName(prefix: ScriptLinePrefix) {
    if (prefix.isNarrator) return 'script-line-prefix script-line-prefix--narrator'
    if (!isScriptRoleTracked(prefix.normalizedName)) {
      return 'script-line-prefix script-line-prefix--role script-line-prefix--untracked'
    }
    return `script-line-prefix script-line-prefix--role script-line-prefix-color-${getScriptRoleColorIndex(prefix.normalizedName)}`
  }

  function applyScriptLineDecorations() {
    const editor = editorRef.current
    const monaco = monacoRef.current
    const model = editor?.getModel()
    if (!editor || !monaco || !model) return

    if (activeVersionWritingModeRef.current !== 'script') {
      if (scriptPrefixDecorationIdsRef.current.length > 0) {
        scriptPrefixDecorationIdsRef.current = editor.deltaDecorations(
          scriptPrefixDecorationIdsRef.current,
          []
        )
      }
      scriptLinePrefixByLineRef.current = new Map()
      return
    }

    const draft = model.getValue()
    if (!draft.includes('|')) {
      if (scriptPrefixDecorationIdsRef.current.length > 0) {
        scriptPrefixDecorationIdsRef.current = editor.deltaDecorations(
          scriptPrefixDecorationIdsRef.current,
          []
        )
      }
      scriptLinePrefixByLineRef.current = new Map()
      return
    }

    const prefixes = parseScriptLinePrefixes(draft)
    const decorations = prefixes.map((prefix) => ({
      range: new monaco.Range(
        prefix.lineNumber,
        prefix.startColumn,
        prefix.lineNumber,
        prefix.endColumn
      ),
      options: {
        inlineClassName: buildScriptPrefixClassName(prefix),
        hoverMessage: (() => {
          if (prefix.isNarrator) return undefined
          const roleItem = roleMemoryByNormalizedName.get(prefix.normalizedName.toLowerCase()) ?? null
          if (!roleItem) {
            return [{ value: '未加入角色库。点击标签可弹出菜单并加入角色库。' }]
          }
          const stance = getRoleStance(roleItem)
          const note = getRoleNote(roleItem).trim()
          return [
            {
              value: [
                `**${getRoleName(roleItem)}**`,
                `立场：${stance}/10（${getRoleStanceLabel(stance)}）`,
                note ? `备注：${note}` : '备注：无',
                '点击标签可切换角色；弹窗里可查看关系。'
              ].join('\n\n')
            }
          ]
        })(),
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
      }
    }))

    scriptPrefixDecorationIdsRef.current = editor.deltaDecorations(
      scriptPrefixDecorationIdsRef.current,
      decorations
    )
    scriptLinePrefixByLineRef.current = new Map(prefixes.map((prefix) => [prefix.lineNumber, prefix]))
  }

  function getScriptPrefixAtPosition(lineNumber: number, column: number) {
    const prefix = scriptLinePrefixByLineRef.current.get(lineNumber)
    if (!prefix) return null
    // Monaco range endColumn is exclusive, so only treat [startColumn, endColumn) as prefix.
    // This avoids swallowing the first content character after `角色名|`.
    if (column < prefix.startColumn || column >= prefix.endColumn) return null
    return prefix
  }

  function openScriptRolePickerAt(prefix: ScriptLinePrefix, clientX: number, clientY: number) {
    const maxX = Math.max(8, window.innerWidth - SCRIPT_ROLE_PICKER_WIDTH - 8)
    const maxY = Math.max(8, window.innerHeight - SCRIPT_ROLE_PICKER_HEIGHT - 8)
    const preferredX = clientX - Math.round(SCRIPT_ROLE_PICKER_WIDTH * 0.18)
    const preferredTopY = clientY - SCRIPT_ROLE_PICKER_HEIGHT - 10
    const preferredBottomY = clientY + 10
    const nextY =
      preferredTopY >= 8 ? preferredTopY : Math.max(8, Math.min(preferredBottomY, maxY))
    setScriptRolePicker({
      lineNumber: prefix.lineNumber,
      x: Math.max(8, Math.min(preferredX, maxX)),
      y: nextY,
      query: '',
      currentName: prefix.normalizedName
    })
  }

  function centerRoleGraphOnRole(roleId: number, retry = 6) {
    const board = roleGraphBoardRef.current
    const position = visibleRolePositionById.get(roleId)
    if (!board || !position) {
      if (retry > 0) {
        window.setTimeout(() => {
          centerRoleGraphOnRole(roleId, retry - 1)
        }, 24)
      }
      return
    }

    const boardWidth = Math.max(1, board.clientWidth)
    const boardHeight = Math.max(1, board.clientHeight)
    setRoleGraphViewport((previous) => {
      const scale = clampNumber(
        Number.isFinite(previous.scale) ? previous.scale : 1,
        ROLE_GRAPH_MIN_SCALE,
        ROLE_GRAPH_MAX_SCALE
      )
      const nodeCenterX = position.x + ROLE_NODE_WIDTH / 2
      const nodeCenterY = position.y + ROLE_NODE_HEIGHT / 2
      return {
        ...previous,
        x: boardWidth / 2 - nodeCenterX * scale,
        y: boardHeight / 2 - nodeCenterY * scale
      }
    })
  }

  function openRoleRelationsPanel(roleId: number, source: 'script-tag' | 'memory-card' = 'script-tag') {
    setActivePanel('memory')
    setMemoryModule('role')
    setRoleGraphView('graph')
    setMemorySearchQuery('')
    setSelectedRoleIds(new Set([roleId]))
    centerRoleGraphOnRole(roleId)
    setStatus(
      source === 'memory-card'
        ? '已定位到角色脑图中的角色卡片'
        : '已打开角色脑图，可直接拖拽连线或双击连线编辑关系'
    )
  }

  function applyScriptRoleSwitch(lineNumber: number, nextRoleName: string) {
    const editor = editorRef.current
    const monaco = monacoRef.current
    const model = editor?.getModel()
    if (!editor || !monaco || !model) return
    const normalizedRole = normalizeScriptRoleName(nextRoleName) || '旁白'
    const lineContent = model.getLineContent(lineNumber)
    const lineRange = new monaco.Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber))
    const match = lineContent.match(/^(\s*)([^|\n]{1,32})\|(\s*)(.*)$/)
    const indent = match?.[1] ?? lineContent.match(/^(\s*)/)?.[1] ?? ''
    const body = (match?.[4] ?? lineContent.slice(indent.length)).replace(/^\s+/, '')
    const nextLine = `${indent}${normalizedRole}| ${body}`

    editor.executeEdits('script-role-switch', [{ range: lineRange, text: nextLine }])
    editor.setPosition({ lineNumber, column: `${indent}${normalizedRole}| `.length + 1 })
    editor.focus()

    if (!isNarratorLabel(normalizedRole)) {
      appendMemoryItems([normalizedRole], 'role')
    }
    setStatus(`已切换为：${normalizedRole}`)
    closeScriptRolePicker()
    refreshSelectionState()
  }

  function normalizeScriptClipboardText(text: string) {
    return text.replace(/^(\s*)([^|\n]{1,32})\|(?=\S)/gm, '$1$2| ')
  }

  function commitScriptRolePicker(roleName?: string) {
    if (!scriptRolePicker) return
    const nextRole = normalizeScriptRoleName(roleName ?? scriptRolePicker.query)
    if (!nextRole) return
    applyScriptRoleSwitch(scriptRolePicker.lineNumber, nextRole)
  }

  function saveScriptRolePickerRoleDraft() {
    if (!scriptRolePickerRoleDraft) return
    updateRoleMemory(scriptRolePickerRoleDraft.roleId, {
      roleName: scriptRolePickerRoleDraft.roleName,
      roleNote: scriptRolePickerRoleDraft.roleNote,
      roleStance: scriptRolePickerRoleDraft.roleStance
    })
    setStatus('角色信息已同步到记忆库')
  }

  async function runEditorAction(primary: string, fallback?: string) {
    const editor = editorRef.current
    if (!editor) return

    const tryAction = async (id: string) => {
      const action = editor.getAction(id)
      if (!action) return false
      await action.run()
      return true
    }

    if (await tryAction(primary)) return
    if (fallback && (await tryAction(fallback))) return
    editor.trigger('editor-context-menu', primary, null)
  }

  function applyContextMenuCommand(task: () => void | Promise<void>) {
    closeEditorContextMenu()
    editorRef.current?.focus()
    void Promise.resolve(task()).finally(() => {
      window.setTimeout(() => {
        refreshSelectionState()
      }, 0)
    })
  }

  function focusEditorToStart() {
    window.setTimeout(() => {
      const editor = editorRef.current
      if (!editor) return
      editor.focus()
      editor.setSelection({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 1
      })
      editor.setPosition({ lineNumber: 1, column: 1 })
    }, 0)
  }

  function createEmptyPage(items: Chapter[], kind: ChapterKind, specialType?: SpecialPageType) {
    const nextId = Math.max(...items.map((chapter) => chapter.id), 0) + 1
    const firstVersion = buildVersion(1, 1, '', writingMode)
    const title =
      kind === 'chapter'
        ? `第${items.filter((item) => item.kind === 'chapter').length + 1}章`
        : buildUniqueSpecialTitle(items, SPECIAL_PAGE_META[specialType ?? 'special'].title)
    const page: Chapter = {
      id: nextId,
      kind,
      specialType: kind === 'special' ? (specialType ?? 'special') : undefined,
      title,
      versions: [firstVersion],
      activeVersionId: firstVersion.id
    }
    return page
  }

  function addPage(kind: ChapterKind, specialType?: SpecialPageType) {
    const nextPage = createEmptyPage(chapters, kind, specialType)
    setChapters((previous) => withOrderedChapterTitles([...previous, nextPage]))
    setActiveChapterId(nextPage.id)
    setIsAddPageMenuOpen(false)
    clearSelectionState()
    focusEditorToStart()
    setStatus(`已新增 ${nextPage.title}`)
  }

  function addChapter() {
    addPage('chapter')
  }

  function addSpecialPage(type: SpecialPageType) {
    addPage('special', type)
  }

  function switchChapter(chapterId: number) {
    const chapter = chapters.find((item) => item.id === chapterId)
    if (!chapter) return
    setActiveChapterId(chapterId)
    clearSelectionState()
    clearVersionRenameState()
    setStatus(`已切换到 ${chapter.title}`)
  }

  function renameCustomPage(chapterId: number) {
    const chapter = chapters.find((item) => item.id === chapterId)
    if (!chapter || chapter.kind !== 'special') return
    if ((chapter.specialType ?? 'special') !== 'special') return
    setCustomPageRenameDialog({
      chapterId,
      value: chapter.title
    })
  }

  function cancelCustomPageRename() {
    setCustomPageRenameDialog(null)
  }

  function commitCustomPageRename() {
    if (!customPageRenameDialog) return
    const { chapterId, value } = customPageRenameDialog
    const chapter = chapters.find((item) => item.id === chapterId)
    if (!chapter || chapter.kind !== 'special') {
      setCustomPageRenameDialog(null)
      return
    }
    if ((chapter.specialType ?? 'special') !== 'special') {
      setCustomPageRenameDialog(null)
      return
    }

    const trimmedTitle = value.trim()
    if (!trimmedTitle) {
      setStatus(t('页面名称不能为空', 'Page name cannot be empty'))
      return
    }
    if (trimmedTitle === chapter.title) {
      setCustomPageRenameDialog(null)
      return
    }

    setChapters((previous) =>
      withOrderedChapterTitles(
        previous.map((item) =>
          item.id === chapterId
            ? {
                ...item,
                title: trimmedTitle
              }
            : item
        )
      )
    )
    setMemory((previous) =>
      previous.map((item) =>
        item.chapterId === chapter.id
          ? {
              ...item,
              chapterTitle: trimmedTitle
            }
          : item
      )
    )
    setCustomPageRenameDialog(null)
    setStatus(`已重命名为 ${trimmedTitle}`)
  }

  function deleteChapter(chapterId: number) {
    if (chapters.length <= 1) {
      setStatus('至少保留 1 个页面')
      return
    }

    const chapterIndex = chapters.findIndex((item) => item.id === chapterId)
    if (chapterIndex < 0) return

    const chapter = chapters[chapterIndex]
    const remaining = chapters.filter((item) => item.id !== chapterId)
    const orderedRemaining = withOrderedChapterTitles(remaining)
    const fallbackChapter =
      orderedRemaining[Math.min(chapterIndex, orderedRemaining.length - 1)] ??
      orderedRemaining[0]
    const fallbackVersion =
      fallbackChapter.versions.find((item) => item.id === fallbackChapter.activeVersionId) ??
      fallbackChapter.versions[0]
    const nextActiveChapterId =
      activeChapterId === chapterId ? fallbackChapter.id : activeChapterId

    setChapters(orderedRemaining)
    setActiveChapterId(nextActiveChapterId)
    const chapterTitleMap = new Map(orderedRemaining.map((item) => [item.id, item.title]))
    setMemory((previous) =>
      previous.map((item) =>
        item.chapterId === chapterId
          ? {
              ...item,
              chapterId: fallbackChapter.id,
              chapterTitle: fallbackChapter.title,
              versionId: fallbackVersion.id,
              versionTitle: fallbackVersion.title
            }
          : (() => {
              const mappedTitle = chapterTitleMap.get(item.chapterId)
              if (!mappedTitle || mappedTitle === item.chapterTitle) return item
              return { ...item, chapterTitle: mappedTitle }
            })()
      )
    )
    clearSelectionState()
    clearVersionRenameState()
    setStatus(`已删除 ${chapter.title}`)
  }

  function moveChapter(
    fromChapterId: number,
    toChapterId: number,
    dropPosition: ChapterDropPosition = 'before'
  ) {
    if (fromChapterId === toChapterId) return
    const fromIndex = chapters.findIndex((chapter) => chapter.id === fromChapterId)
    if (fromIndex < 0) return

    const next = [...chapters]
    const [dragged] = next.splice(fromIndex, 1)
    const targetIndex = next.findIndex((chapter) => chapter.id === toChapterId)
    if (targetIndex < 0) return
    const insertIndex = dropPosition === 'after' ? targetIndex + 1 : targetIndex
    next.splice(insertIndex, 0, dragged)
    const orderedChapters = withOrderedChapterTitles(next)
    const chapterTitleMap = new Map(orderedChapters.map((item) => [item.id, item.title]))

    setChapters(orderedChapters)
    setMemory((previous) =>
      previous.map((item) => {
        const mappedTitle = chapterTitleMap.get(item.chapterId)
        if (!mappedTitle || mappedTitle === item.chapterTitle) return item
        return { ...item, chapterTitle: mappedTitle }
      })
    )
    setStatus('已调整章节顺序')
  }

  function switchVersion(versionId: number) {
    if (!activeChapter) return
    const version = activeChapter.versions.find((item) => item.id === versionId)
    if (!version) return
    setChapters((previous) =>
      previous.map((chapter) =>
        chapter.id === activeChapter.id
          ? { ...chapter, activeVersionId: versionId }
          : chapter
      )
    )
    setWritingMode(version.writingMode)
    clearSelectionState()
    clearVersionRenameState()
    setStatus(`已切换到 ${activeChapter.title} / ${version.title}`)
  }

  function setActiveVersionMode(nextMode: WritingMode) {
    if (!activeChapter || !activeVersion) return
    setChapters((previous) =>
      previous.map((chapter) => {
        if (chapter.id !== activeChapter.id) return chapter
        return {
          ...chapter,
          versions: chapter.versions.map((version) =>
            version.id === activeVersion.id
              ? { ...version, writingMode: nextMode }
              : version
          )
        }
      })
    )
    setWritingMode(nextMode)
  }

  function addVersion() {
    if (!activeChapter) return
    const nextId = Math.max(...activeChapter.versions.map((version) => version.id), 0) + 1
    const nextIndex = activeChapter.versions.length + 1
    const nextVersion = buildVersion(nextId, nextIndex, currentDraft, writingMode)

    setChapters((previous) =>
      previous.map((chapter) =>
        chapter.id === activeChapter.id
          ? {
              ...chapter,
              versions: [...chapter.versions, nextVersion],
              activeVersionId: nextVersion.id
            }
          : chapter
      )
    )
    clearSelectionState()
    clearVersionRenameState()
    setStatus(`已新增 ${activeChapter.title} / ${nextVersion.title}`)
  }

  function deleteVersion(versionId: number) {
    if (!activeChapter) return
    if (activeChapter.versions.length <= 1) {
      setStatus('至少保留 1 个版本')
      return
    }

    const versionIndex = activeChapter.versions.findIndex((item) => item.id === versionId)
    if (versionIndex < 0) return

    const version = activeChapter.versions[versionIndex]
    const remainingVersions = activeChapter.versions.filter((item) => item.id !== versionId)
    const fallbackVersion =
      remainingVersions[Math.min(versionIndex, remainingVersions.length - 1)] ??
      remainingVersions[0]
    const nextActiveVersionId =
      activeChapter.activeVersionId === versionId
        ? fallbackVersion.id
        : activeChapter.activeVersionId

    setChapters((previous) =>
      previous.map((chapter) =>
        chapter.id === activeChapter.id
          ? {
              ...chapter,
              versions: remainingVersions,
              activeVersionId: nextActiveVersionId
            }
          : chapter
      )
    )
    setMemory((previous) =>
      previous.map((item) =>
        item.chapterId === activeChapter.id && item.versionId === versionId
          ? {
              ...item,
              versionId: fallbackVersion.id,
              versionTitle: fallbackVersion.title
            }
          : item
      )
    )
    clearSelectionState()
    clearVersionRenameState()
    setStatus(`已删除 ${activeChapter.title} / ${version.title}`)
  }

  function startVersionRename(version: Version) {
    setEditingVersionId(version.id)
    setEditingVersionTitle(version.title)
  }

  function cancelVersionRename() {
    clearVersionRenameState()
  }

  function commitVersionRename(versionId: number) {
    if (!activeChapter) {
      clearVersionRenameState()
      return
    }

    const originalTitle =
      activeChapter.versions.find((version) => version.id === versionId)?.title ?? ''
    const nextTitle = editingVersionTitle.trim()
    if (!nextTitle || nextTitle === originalTitle) {
      clearVersionRenameState()
      return
    }

    setChapters((previous) =>
      previous.map((chapter) =>
        chapter.id === activeChapter.id
          ? {
              ...chapter,
              versions: chapter.versions.map((version) =>
                version.id === versionId
                  ? { ...version, title: nextTitle, updatedAt: nowLabel() }
                  : version
              )
            }
          : chapter
      )
    )
    setMemory((previous) =>
      previous.map((item) =>
        item.chapterId === activeChapter.id && item.versionId === versionId
          ? { ...item, versionTitle: nextTitle }
          : item
      )
    )

    clearVersionRenameState()
    setStatus(`已重命名为 ${nextTitle}`)
  }

  function createBackup(
    content: string,
    title?: string,
    options?: { backupX?: number; backupY?: number }
  ) {
    if (!content.trim()) return
    const now = nowLabel()
    const backup: BackupItem = {
      id: Date.now(),
      title: title?.trim() || '写作参考',
      content,
      ...(typeof options?.backupX === 'number' ? { backupX: options.backupX } : {}),
      ...(typeof options?.backupY === 'number' ? { backupY: options.backupY } : {}),
      createdAt: now,
      updatedAt: now
    }
    setBackups((previous) => [backup, ...previous].slice(0, 80))
    setStatus('已保存到共享参考库')
  }

  function collectBackupIdsInBounds(bounds: {
    minX: number
    minY: number
    maxX: number
    maxY: number
  }) {
    const ids: number[] = []
    for (const item of filteredBackups) {
      const position = backupPositionById.get(item.id) ?? getBackupNodePosition(item, 0)
      const nodeMinX = position.x
      const nodeMinY = position.y
      const nodeMaxX = position.x + BACKUP_NODE_WIDTH
      const nodeMaxY = position.y + BACKUP_NODE_HEIGHT
      const intersects =
        bounds.maxX >= nodeMinX &&
        bounds.minX <= nodeMaxX &&
        bounds.maxY >= nodeMinY &&
        bounds.minY <= nodeMaxY
      if (intersects) ids.push(item.id)
    }
    return ids
  }

  function applyBackupSelectionByBox(box: {
    start: { x: number; y: number }
    current: { x: number; y: number }
    additive: boolean
    baseSelectedIds: number[]
  }) {
    const bounds = getRoleSelectionBounds(box.start, box.current)
    const idsInBounds = collectBackupIdsInBounds(bounds)
    const next = new Set<number>(box.additive ? box.baseSelectedIds : [])
    idsInBounds.forEach((id) => next.add(id))
    setSelectedBackupIds(next)
  }

  function deleteBackups(backupIds: number[]) {
    const uniqueIds = [...new Set(backupIds)]
    if (!uniqueIds.length) return
    const backupIdSet = new Set(uniqueIds)
    const nextRelations = backupRelationsRef.current.filter(
      (relation) =>
        !backupIdSet.has(relation.fromBackupId) && !backupIdSet.has(relation.toBackupId)
    )
    setBackups((previous) => previous.filter((backup) => !backupIdSet.has(backup.id)))
    setBackupRelations(nextRelations)
    backupRelationsRef.current = nextRelations
    setSelectedBackupIds((previous) => {
      if (!previous.size) return previous
      const next = new Set<number>()
      previous.forEach((id) => {
        if (!backupIdSet.has(id)) next.add(id)
      })
      return next
    })
    setBackupSelectionBox(null)
    backupDragIdsRef.current = []
    backupDragOffsetsByIdRef.current = {}
    setDraggingBackupId(null)
    setBackupNodeMenu({ open: false, x: 0, y: 0, backupId: null })
    setBackupRelationMenu({ open: false, x: 0, y: 0, relationId: null })
    setBackupEditorDialog((previous) =>
      previous && backupIdSet.has(previous.backupId) ? null : previous
    )
    setBackupRelationEditorDialog((previous) =>
      previous && nextRelations.some((item) => item.id === previous.relationId) ? previous : null
    )
    setStatus(`已删除 ${uniqueIds.length} 个参考事件`)
  }

  function deleteBackup(backupId: number) {
    deleteBackups([backupId])
  }

  function updateBackup(
    backupId: number,
    patch: Partial<Pick<BackupItem, 'title' | 'content' | 'backupX' | 'backupY'>>
  ) {
    const now = nowLabel()
    setBackups((previous) =>
      previous.map((backup) =>
        backup.id === backupId
          ? {
              ...backup,
              ...patch,
              updatedAt: now
            }
          : backup
      )
    )
  }

  function appendMemoryItems(items: string[], kind: MemoryKind = 'info') {
    const normalized = items
      .map((item) => item.replace(/^[-*\d.\s]+/, '').trim())
      .filter(Boolean)
    if (!normalized.length) return

    const chapter = activeChapterRef.current ?? chaptersRef.current[0]
    const version =
      activeVersionRef.current ??
      chapter?.versions.find((item) => item.id === chapter.activeVersionId) ??
      chapter?.versions[0]
    if (!chapter || !version) return

    const createdAt = nowLabel()

    setMemory((previous) => {
      const existing = new Set(
        previous.map((item) =>
          item.kind === 'role'
            ? `role:${normalizeScriptRoleName(getRoleName(item)).toLowerCase()}`
            : `${item.kind}:${item.chapterId}:${item.versionId}:${item.text}`
        )
      )
      const merged = [...previous]
      let nextId = previous.reduce((max, item) => Math.max(max, item.id), 0) + 1
      let changed = false
      for (const text of normalized) {
        const parsedRole = kind === 'role' ? parseLegacyRoleText(text) : null
        const roleKey =
          kind === 'role'
            ? normalizeScriptRoleName(parsedRole?.roleName ?? text).toLowerCase()
            : ''
        const key =
          kind === 'role'
            ? `role:${roleKey}`
            : `${kind}:${chapter.id}:${version.id}:${text}`
        if (existing.has(key)) continue
        existing.add(key)
        merged.push({
          id: nextId,
          kind,
          text:
            kind === 'role'
              ? buildRoleMemoryText(parsedRole?.roleName ?? text, parsedRole?.roleNote ?? '')
              : text,
          roleName: kind === 'role' ? (parsedRole?.roleName ?? text) : undefined,
          roleNote: kind === 'role' ? (parsedRole?.roleNote ?? '') : undefined,
          roleStance: kind === 'role' ? 5 : undefined,
          roleX: kind === 'role' ? 28 + (merged.length % 2) * 236 : undefined,
          roleY: kind === 'role' ? 28 + Math.floor(merged.length / 2) * 132 : undefined,
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          versionId: version.id,
          versionTitle: version.title,
          createdAt
        })
        changed = true
        nextId += 1
      }
      return changed ? merged : previous
    })
  }

  function appendMemoryItem(
    kind: MemoryKind,
    options?: {
      text?: string
      roleName?: string
      roleNote?: string
      roleStance?: number
      roleX?: number
      roleY?: number
    }
  ) {
    const chapter = activeChapterRef.current ?? chaptersRef.current[0]
    const version =
      activeVersionRef.current ??
      chapter?.versions.find((item) => item.id === chapter.activeVersionId) ??
      chapter?.versions[0]
    if (!chapter || !version) return

    const createdAt = nowLabel()
    setMemory((previous) => {
      const nextId = previous.reduce((max, item) => Math.max(max, item.id), 0) + 1
      const roleIndex = previous.filter((item) => item.kind === 'role').length
      const requestedRoleName = (options?.roleName ?? '新角色').trim() || `角色${nextId}`
      let roleName = requestedRoleName
      const existingRoleNames = new Set(
        previous
          .filter((item) => item.kind === 'role')
          .map((item) => normalizeScriptRoleName(getRoleName(item)).toLowerCase())
          .filter(Boolean)
      )
      if (kind === 'role') {
        const normalizedRequested = normalizeScriptRoleName(requestedRoleName).toLowerCase()
        if (normalizedRequested && existingRoleNames.has(normalizedRequested)) {
          if (typeof options?.roleName === 'string' && options.roleName.trim()) {
            return previous
          }
          const base = normalizeScriptRoleName(requestedRoleName) || '新角色'
          let suffix = 2
          let candidate = `${base}${suffix}`
          while (existingRoleNames.has(normalizeScriptRoleName(candidate).toLowerCase())) {
            suffix += 1
            candidate = `${base}${suffix}`
          }
          roleName = candidate
        } else {
          roleName = normalizeScriptRoleName(requestedRoleName) || `角色${nextId}`
        }
      }
      const roleNote = options?.roleNote ?? ''
      const nextRoleX =
        typeof options?.roleX === 'number'
          ? Math.max(0, options.roleX)
          : 28 + (roleIndex % 2) * 236
      const nextRoleY =
        typeof options?.roleY === 'number'
          ? Math.max(0, options.roleY)
          : 28 + Math.floor(roleIndex / 2) * 132
      return [
        ...previous,
        {
          id: nextId,
          kind,
          text:
            kind === 'role'
              ? buildRoleMemoryText(roleName, roleNote)
              : (options?.text?.trim() || '新记忆：'),
          roleName: kind === 'role' ? roleName : undefined,
          roleNote: kind === 'role' ? roleNote : undefined,
          roleStance:
            kind === 'role'
              ? clampRoleStance(typeof options?.roleStance === 'number' ? options.roleStance : 5)
              : undefined,
          roleX: kind === 'role' ? nextRoleX : undefined,
          roleY: kind === 'role' ? nextRoleY : undefined,
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          versionId: version.id,
          versionTitle: version.title,
          createdAt
        }
      ]
    })
  }

function normalizeScriptRoleName(raw: string) {
  return normalizeRoleName(raw)
}

  function isNarratorLabel(name: string) {
    return SCRIPT_NARRATOR_NAMES.has(name.trim().toLowerCase())
  }

  function getScriptRoleColorIndex(name: string) {
    const text = name.trim().toLowerCase()
    if (!text) return 0
    let hash = 0
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash * 31 + text.charCodeAt(i)) | 0
    }
    return Math.abs(hash) % SCRIPT_ROLE_COLOR_COUNT
  }

  function parseScriptLinePrefixes(draft: string): ScriptLinePrefix[] {
    const lines = draft.split('\n')
    const output: ScriptLinePrefix[] = []

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const match = line.match(/^(\s*)([^|\n]{1,32})\|/)
      if (!match) continue
      const indent = match[1] ?? ''
      const rawName = (match[2] ?? '').trim()
      const normalizedName = normalizeScriptRoleName(rawName)
      if (!normalizedName) continue
      const startColumn = indent.length + 1
      const endColumn = startColumn + rawName.length + 1
      output.push({
        lineNumber: index + 1,
        startColumn,
        endColumn,
        rawName,
        normalizedName,
        isNarrator: isNarratorLabel(normalizedName)
      })
    }

    return output
  }

  function extractRoleNamesFromDraft(draft: string) {
    const roleNames: string[] = []
    const roleRegex = /^\s*([^|\n]{1,32})\|/gm
    for (const match of draft.matchAll(roleRegex)) {
      const raw = String(match[1] || '').trim()
      if (!raw) continue
      const normalized = normalizeScriptRoleName(raw)
      if (!normalized) continue
      if (isNarratorLabel(normalized)) continue
      roleNames.push(normalized)
    }
    return [...new Set(roleNames)]
  }

  function syncScriptRolesToMemory(draft: string) {
    if (writingMode !== 'script') return
    const roleNames = extractRoleNamesFromDraft(draft)
    if (!roleNames.length) return
    appendMemoryItems(roleNames, 'role')
  }

  function updateRoleMemory(
    roleId: number,
    patch: Partial<Pick<MemoryItem, 'roleName' | 'roleNote' | 'roleStance' | 'roleX' | 'roleY'>>
  ) {
    setMemory((previous) =>
      previous.map((item) => {
        if (item.id !== roleId || item.kind !== 'role') return item
        const nextName = (patch.roleName ?? getRoleName(item)).trim() || `角色${item.id}`
        const nextNote = patch.roleNote ?? getRoleNote(item)
        const nextStance =
          typeof patch.roleStance === 'number'
            ? clampRoleStance(patch.roleStance)
            : getRoleStance(item)
        return {
          ...item,
          roleName: nextName,
          roleNote: nextNote,
          roleStance: nextStance,
          roleX: typeof patch.roleX === 'number' ? patch.roleX : item.roleX,
          roleY: typeof patch.roleY === 'number' ? patch.roleY : item.roleY,
          text: buildRoleMemoryText(nextName, nextNote)
        }
      })
    )
  }

  function openRoleEditor(item: MemoryItem) {
    if (item.kind !== 'role') return
    setRoleEditorDialog({
      roleId: item.id,
      roleName: getRoleName(item),
      roleNote: getRoleNote(item),
      roleStance: getRoleStance(item)
    })
  }

  function closeRoleEditor() {
    setRoleEditorDialog(null)
  }

  function commitRoleEditor() {
    if (!roleEditorDialog) return
    updateRoleMemory(roleEditorDialog.roleId, {
      roleName: roleEditorDialog.roleName,
      roleNote: roleEditorDialog.roleNote,
      roleStance: roleEditorDialog.roleStance
    })
    setRoleEditorDialog(null)
    setStatus('角色信息已更新')
  }

  function beginRoleDrag(event: ReactMouseEvent<HTMLElement>, roleId: number) {
    if (isRoleGraphSpacePressed || isRoleGraphPanning) return
    if (event.button !== 0) return
    if (roleLinkStart !== null || draggingRoleRelationCurve !== null) return
    event.preventDefault()
    event.stopPropagation()
    setRoleSelectionBox(null)
    setRoleNodeMenu({ open: false, x: 0, y: 0, roleId: null })
    setRoleRelationMenu({ open: false, x: 0, y: 0, relationId: null })
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      setSelectedRoleIds((previous) => {
        const next = new Set(previous)
        if (next.has(roleId)) next.delete(roleId)
        else next.add(roleId)
        return next
      })
      return
    }
    const pointer = getRoleGraphPointFromClient(event.clientX, event.clientY)
    if (!pointer) return
    const currentSelected = new Set(selectedRoleIds)
    const nextSelected =
      currentSelected.has(roleId) && currentSelected.size > 1
        ? currentSelected
        : new Set([roleId])
    setSelectedRoleIds(nextSelected)
    const dragIds = Array.from(nextSelected)
    const nextOffsets: Record<number, { x: number; y: number }> = {}
    dragIds.forEach((id) => {
      const nodePosition = visibleRolePositionById.get(id)
      if (!nodePosition) return
      nextOffsets[id] = {
        x: pointer.x - nodePosition.x,
        y: pointer.y - nodePosition.y
      }
    })
    if (Object.keys(nextOffsets).length === 0) return
    roleDragIdsRef.current = dragIds
    roleDragOffsetsByIdRef.current = nextOffsets
    const anchorOffset = nextOffsets[roleId]
    if (anchorOffset) {
      setRoleDragOffset(anchorOffset)
    }
    setDraggingRoleId(roleId)
  }

  function beginRoleGraphPan(event: ReactMouseEvent<HTMLDivElement>) {
    const isPrimaryDrag = event.button === 0
    const isSpaceLeftDrag = isRoleGraphSpacePressed && event.button === 0
    const isMiddleDrag = event.button === 1
    if (isRoleGraphFullscreen && (isSpaceLeftDrag || isMiddleDrag)) {
      event.preventDefault()
      roleGraphPanStartRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        originX: roleGraphViewport.x,
        originY: roleGraphViewport.y
      }
      setIsRoleGraphPanning(true)
      if (draggingRoleId !== null) setDraggingRoleId(null)
      roleDragIdsRef.current = []
      roleDragOffsetsByIdRef.current = {}
      if (roleLinkStart !== null) {
        setRoleLinkStart(null)
        setRoleLinkTarget(null)
        setRoleLinkPreview(null)
      }
      setRoleSelectionBox(null)
      setRoleNodeMenu({ open: false, x: 0, y: 0, roleId: null })
      setRoleRelationMenu({ open: false, x: 0, y: 0, relationId: null })
      return
    }
    if (!isPrimaryDrag) return
    const target = event.target
    if (
      target instanceof Element &&
      target.closest(
        '.role-graph-node, .role-link-handle, .role-graph-edge, .role-graph-corner-fullscreen, .role-graph-exit-button, .role-link-mode-picker, .editor-context-menu, .role-relation-menu, .role-node-menu, .role-graph-visual-button, .graph-visual-panel'
      )
    ) {
      return
    }
    const pointer = getRoleGraphPointFromClient(event.clientX, event.clientY)
    if (!pointer) return
    const additive = event.ctrlKey || event.metaKey || event.shiftKey
    setRoleSelectionBox({
      start: pointer,
      current: pointer,
      additive,
      baseSelectedIds: additive ? Array.from(selectedRoleIds) : []
    })
    if (!additive) setSelectedRoleIds(new Set())
    setRoleNodeMenu({ open: false, x: 0, y: 0, roleId: null })
    setRoleRelationMenu({ open: false, x: 0, y: 0, relationId: null })
  }

  function handleRoleGraphDoubleClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!isRoleGraphActive) return
    if (draggingRoleId !== null || roleLinkStart !== null || isRoleGraphPanning) return
    const target = event.target
    if (
      target instanceof Element &&
      target.closest(
        '.role-graph-node, .role-link-handle, .role-graph-edge, .role-graph-corner-fullscreen, .role-graph-exit-button, .role-graph-visual-button, .graph-visual-panel'
      )
    ) {
      return
    }
    const pointer = getRoleGraphPointFromClient(event.clientX, event.clientY)
    if (!pointer) return
    appendMemoryItem('role', {
      roleX: pointer.x - ROLE_NODE_WIDTH / 2,
      roleY: pointer.y - ROLE_NODE_HEIGHT / 2
    })
    setStatus('已新增角色节点')
  }

  function handleRoleGraphWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!isRoleGraphFullscreen) return
    event.preventDefault()
    const board = roleGraphBoardRef.current
    if (!board) return
    const rect = board.getBoundingClientRect()
    const anchorX = event.clientX - rect.left
    const anchorY = event.clientY - rect.top
    const zoomFactor = event.deltaY < 0 ? ROLE_GRAPH_ZOOM_FACTOR : 1 / ROLE_GRAPH_ZOOM_FACTOR
    setRoleGraphViewport((previous) => {
      const nextScale = clampNumber(
        previous.scale * zoomFactor,
        ROLE_GRAPH_MIN_SCALE,
        ROLE_GRAPH_MAX_SCALE
      )
      if (nextScale === previous.scale) return previous
      const graphX = (anchorX - previous.x) / previous.scale
      const graphY = (anchorY - previous.y) / previous.scale
      return {
        scale: nextScale,
        x: anchorX - graphX * nextScale,
        y: anchorY - graphY * nextScale
      }
    })
  }

  async function toggleRoleGraphFullscreen() {
    const board = roleGraphBoardRef.current
    if (!board) return
    if (document.fullscreenElement === board) {
      await document.exitFullscreen().catch(() => {})
      return
    }
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {})
    }
    await board.requestFullscreen().catch(() => {})
  }

  function beginRoleLink(
    event: ReactMouseEvent<HTMLButtonElement>,
    roleId: number,
    side: RoleLinkSide,
    mode?: RoleRelationMode
  ) {
    if (isRoleGraphSpacePressed || isRoleGraphPanning) return
    event.preventDefault()
    event.stopPropagation()
    const nextMode = mode ?? activeRoleRelationMode
    setActiveRoleRelationMode(nextMode)
    const pointer = getRoleGraphPointFromClient(event.clientX, event.clientY)
    if (!pointer) return
    setRoleRelationMenu({ open: false, x: 0, y: 0, relationId: null })
    setRoleNodeMenu({ open: false, x: 0, y: 0, roleId: null })
    const nextTarget = getRoleLinkTargetByPoint(pointer, roleId)
    setRoleLinkStart({ roleId, side, mode: nextMode })
    setRoleLinkTarget(nextTarget)
    if (nextTarget) {
      const nextPosition = visibleRolePositionById.get(nextTarget.roleId)
      if (nextPosition) {
        setRoleLinkPreview(getRoleSidePoint(nextPosition, nextTarget.side))
        return
      }
    }
    setRoleLinkPreview(pointer)
  }

  function updateOrCreateRoleRelation(
    fromId: number,
    toId: number,
    fromAnchor: RoleLinkSide,
    toAnchor: RoleLinkSide,
    mode: RoleRelationMode
  ) {
    if (fromId === toId) return
    const strokeColor = normalizeRelationColor(
      activeRoleRelationStrokeColor,
      DEFAULT_ROLE_RELATION_STROKE_COLOR
    )
    const pairA = Math.min(fromId, toId)
    const pairB = Math.max(fromId, toId)
    const index = roleRelations.findIndex((relation) => {
      const a = Math.min(relation.fromMemoryId, relation.toMemoryId)
      const b = Math.max(relation.fromMemoryId, relation.toMemoryId)
      return a === pairA && b === pairB
    })
    const nextRelations =
      index >= 0
        ? roleRelations.map((relation, relationIndex) =>
            relationIndex === index
              ? {
                  ...relation,
                  fromMemoryId: fromId,
                  toMemoryId: toId,
                  fromAnchor,
                  toAnchor,
                  mode,
                  strokeColor
                }
              : relation
          )
        : [
            ...roleRelations,
            {
              id: Date.now(),
              fromMemoryId: fromId,
              toMemoryId: toId,
              fromAnchor,
              toAnchor,
              curveOffsetX: 0,
              curveOffsetY: 0,
              mode,
              relation: '',
              intimacy: 0,
              tags: [],
              strokeColor,
              createdAt: nowLabel()
            }
          ]
    setRoleRelations(nextRelations)
    persistWorkspaceWithRoleRelations(nextRelations)
  }

  function openRoleRelationContextMenu(event: ReactMouseEvent<SVGElement>, relationId: number) {
    event.preventDefault()
    event.stopPropagation()
    setRoleNodeMenu({ open: false, x: 0, y: 0, roleId: null })
    setRoleRelationMenu({
      open: true,
      x: event.clientX,
      y: event.clientY,
      relationId
    })
  }

  function editRoleRelation(relationId: number) {
    const current = roleRelations.find((item) => item.id === relationId)
    if (!current) return
    setRoleRelationEditorDialog({
      relationId,
      intimacy: normalizeRelationIntimacy(current.intimacy ?? 0),
      tagsInput: Array.isArray(current.tags) ? current.tags.join('、') : ''
    })
    setRoleRelationMenu({ open: false, x: 0, y: 0, relationId: null })
  }

  function removeRoleRelation(relationId: number) {
    const nextRelations = roleRelations.filter((item) => item.id !== relationId)
    setRoleRelations(nextRelations)
    persistWorkspaceWithRoleRelations(nextRelations)
    setRoleRelationMenu({ open: false, x: 0, y: 0, relationId: null })
    setRoleRelationEditorDialog((previous) =>
      previous && previous.relationId === relationId ? null : previous
    )
  }

  function closeRoleRelationEditor() {
    setRoleRelationEditorDialog(null)
  }

  function saveRoleRelationTagOptions(rawInput: string) {
    const nextOptions = mergeRoleRelationTagOptions(roleRelationTagOptions, rawInput)
    const unchanged =
      nextOptions.length === roleRelationTagOptions.length &&
      nextOptions.every((item, index) => item === roleRelationTagOptions[index])
    if (unchanged) return 0
    const previousLength = roleRelationTagOptions.length
    setRoleRelationTagOptions(nextOptions)
    return Math.max(0, nextOptions.length - previousLength)
  }

  function handleRoleRelationTagsInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (!roleRelationEditorDialog) return
    const rawInput = roleRelationEditorDialog.tagsInput.trim()
    if (!rawInput) return
    const nextTags = splitRelationTags(rawInput)
    const addedCount = saveRoleRelationTagOptions(rawInput)
    setRoleRelationEditorDialog((previous) =>
      previous
        ? {
            ...previous,
            tagsInput: nextTags.join('、')
          }
        : previous
    )
    setStatus(addedCount > 0 ? `已新增 ${addedCount} 个关系标签` : '这些关系标签已在可选列表中')
  }

  function commitRoleRelationEditor() {
    if (!roleRelationEditorDialog) return
    const nextTags = splitRelationTags(roleRelationEditorDialog.tagsInput)
    saveRoleRelationTagOptions(roleRelationEditorDialog.tagsInput)
    const nextRelations = roleRelations.map((item) =>
      item.id === roleRelationEditorDialog.relationId
        ? {
            ...item,
            relation: '',
            intimacy: normalizeRelationIntimacy(roleRelationEditorDialog.intimacy),
            tags: nextTags
          }
        : item
    )
    setRoleRelations(nextRelations)
    persistWorkspaceWithRoleRelations(nextRelations)
    setRoleRelationEditorDialog(null)
    setStatus('角色关系已更新')
  }

  function handleRoleGraphMouseMove(event: ReactMouseEvent<HTMLDivElement>) {
    if (isRoleGraphPanning) {
      const start = roleGraphPanStartRef.current
      if (!start) return
      setRoleGraphViewport((previous) => ({
        ...previous,
        x: start.originX + (event.clientX - start.clientX),
        y: start.originY + (event.clientY - start.clientY)
      }))
      return
    }
    const pointer = getRoleGraphPointFromClient(event.clientX, event.clientY)
    if (!pointer) return
    if (roleSelectionBox !== null) {
      const nextBox = {
        ...roleSelectionBox,
        current: pointer
      }
      setRoleSelectionBox(nextBox)
      applyRoleSelectionByBox(nextBox)
      return
    }
    if (draggingRoleRelationCurve !== null) {
      const relation = roleRelationsRef.current.find(
        (item) => item.id === draggingRoleRelationCurve.relationId
      )
      if (!relation) return
      const geometry = getRoleRelationGeometry(relation)
      if (!geometry) return
      const nextOffset = getRoleRelationCurveOffsetFromMidpoint(
        pointer,
        geometry.fromPoint,
        geometry.toPoint
      )
      setRoleRelations((previous) => {
        const nextRelations = previous.map((item) =>
          item.id === draggingRoleRelationCurve.relationId
            ? {
                ...item,
                curveOffsetX: nextOffset.x,
                curveOffsetY: nextOffset.y
              }
            : item
        )
        roleRelationsRef.current = nextRelations
        return nextRelations
      })
      return
    }
    if (roleLinkStart !== null) {
      const nextTarget = getRoleLinkTargetByPoint(pointer, roleLinkStart.roleId)
      setRoleLinkTarget(nextTarget)
      if (nextTarget) {
        const nextPosition = visibleRolePositionById.get(nextTarget.roleId)
        if (nextPosition) {
          setRoleLinkPreview(getRoleSidePoint(nextPosition, nextTarget.side))
        } else {
          setRoleLinkPreview(pointer)
        }
      } else {
        setRoleLinkPreview(pointer)
      }
    }
    if (draggingRoleId === null) return
    const dragIds = roleDragIdsRef.current
    const offsetById = roleDragOffsetsByIdRef.current
    if (!dragIds.length || !Object.keys(offsetById).length) {
      const nextX = Math.max(0, pointer.x - roleDragOffset.x)
      const nextY = Math.max(0, pointer.y - roleDragOffset.y)
      updateRoleMemory(draggingRoleId, { roleX: nextX, roleY: nextY })
      return
    }
    const dragIdSet = new Set(dragIds)
    setMemory((previous) =>
      previous.map((item) => {
        if (item.kind !== 'role') return item
        if (!dragIdSet.has(item.id)) return item
        const offset = offsetById[item.id]
        if (!offset) return item
        return {
          ...item,
          roleX: Math.max(0, pointer.x - offset.x),
          roleY: Math.max(0, pointer.y - offset.y)
        }
      })
    )
  }

  function handleRoleGraphMouseUp(event: ReactMouseEvent<HTMLDivElement>) {
    const wasPanning = isRoleGraphPanning
    if (isRoleGraphPanning) {
      setIsRoleGraphPanning(false)
      roleGraphPanStartRef.current = null
    }
    if (wasPanning) return
    if (roleSelectionBox !== null) {
      const pointer = getRoleGraphPointFromClient(event.clientX, event.clientY)
      if (pointer) {
        const nextBox = {
          ...roleSelectionBox,
          current: pointer
        }
        applyRoleSelectionByBox(nextBox)
      }
      setRoleSelectionBox(null)
      return
    }
    if (draggingRoleRelationCurve !== null) {
      setDraggingRoleRelationCurve(null)
      persistWorkspaceWithRoleRelations(roleRelationsRef.current)
      return
    }
    if (draggingRoleId !== null) {
      setDraggingRoleId(null)
      roleDragIdsRef.current = []
      roleDragOffsetsByIdRef.current = {}
    }
    if (roleLinkStart === null) return
    const pointer = getRoleGraphPointFromClient(event.clientX, event.clientY)
    const finalTarget =
      pointer !== null ? getRoleLinkTargetByPoint(pointer, roleLinkStart.roleId) : null
    if (finalTarget && finalTarget.roleId !== roleLinkStart.roleId) {
      updateOrCreateRoleRelation(
        roleLinkStart.roleId,
        finalTarget.roleId,
        roleLinkStart.side,
        finalTarget.side,
        roleLinkStart.mode
      )
    }
    setRoleLinkStart(null)
    setRoleLinkTarget(null)
    setRoleLinkPreview(null)
  }

  function beginBackupDrag(event: ReactMouseEvent<HTMLElement>, backupId: number) {
    if (isBackupGraphSpacePressed || isBackupGraphPanning) return
    if (event.button !== 0) return
    if (backupLinkStart !== null || draggingBackupRelationCurve !== null) return
    event.preventDefault()
    event.stopPropagation()
    setBackupSelectionBox(null)
    setBackupRelationMenu({ open: false, x: 0, y: 0, relationId: null })
    setBackupNodeMenu({ open: false, x: 0, y: 0, backupId: null })
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      setSelectedBackupIds((previous) => {
        const next = new Set(previous)
        if (next.has(backupId)) next.delete(backupId)
        else next.add(backupId)
        return next
      })
      return
    }
    const boardPoint = getBackupGraphPointFromClient(event.clientX, event.clientY)
    if (!boardPoint) return
    if (!backupPositionById.has(backupId)) return
    const currentSelected = new Set(selectedBackupIds)
    const nextSelected =
      currentSelected.has(backupId) && currentSelected.size > 1
        ? currentSelected
        : new Set([backupId])
    setSelectedBackupIds(nextSelected)
    const dragIds = Array.from(nextSelected)
    const nextOffsets: Record<number, { x: number; y: number }> = {}
    dragIds.forEach((id) => {
      const nodePosition = backupPositionById.get(id)
      if (!nodePosition) return
      nextOffsets[id] = {
        x: boardPoint.x - nodePosition.x,
        y: boardPoint.y - nodePosition.y
      }
    })
    if (Object.keys(nextOffsets).length === 0) return
    backupDragIdsRef.current = dragIds
    backupDragOffsetsByIdRef.current = nextOffsets
    const anchorOffset = nextOffsets[backupId]
    if (anchorOffset) {
      setBackupDragOffset(anchorOffset)
    }
    setDraggingBackupId(backupId)
  }

  function beginBackupGraphPan(event: ReactMouseEvent<HTMLDivElement>) {
    const isPrimaryDrag = event.button === 0
    const isSpaceLeftDrag = isBackupGraphSpacePressed && event.button === 0
    const isMiddleDrag = event.button === 1
    if (isBackupGraphFullscreen && (isSpaceLeftDrag || isMiddleDrag)) {
      event.preventDefault()
      backupGraphPanStartRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        originX: backupGraphViewport.x,
        originY: backupGraphViewport.y
      }
      setIsBackupGraphPanning(true)
      if (draggingBackupId !== null) setDraggingBackupId(null)
      backupDragIdsRef.current = []
      backupDragOffsetsByIdRef.current = {}
      if (backupLinkStart !== null) {
        setBackupLinkStart(null)
        setBackupLinkTarget(null)
        setBackupLinkPreview(null)
      }
      setBackupSelectionBox(null)
      setBackupNodeMenu({ open: false, x: 0, y: 0, backupId: null })
      setBackupRelationMenu({ open: false, x: 0, y: 0, relationId: null })
      return
    }
    if (!isPrimaryDrag) return
    const target = event.target
    if (
      target instanceof Element &&
      target.closest(
        '.backup-graph-node, .backup-link-handle, .backup-graph-edge, .role-graph-corner-fullscreen, .role-graph-exit-button, .editor-context-menu, .backup-relation-menu, .backup-node-menu, .backup-link-mode-picker, .role-graph-visual-button, .graph-visual-panel'
      )
    ) {
      return
    }
    const pointer = getBackupGraphPointFromClient(event.clientX, event.clientY)
    if (!pointer) return
    const additive = event.ctrlKey || event.metaKey || event.shiftKey
    setBackupSelectionBox({
      start: pointer,
      current: pointer,
      additive,
      baseSelectedIds: additive ? Array.from(selectedBackupIds) : []
    })
    if (!additive) setSelectedBackupIds(new Set())
    if (backupRelationMenu.open) {
      setBackupRelationMenu({ open: false, x: 0, y: 0, relationId: null })
    }
    if (backupNodeMenu.open) {
      setBackupNodeMenu({ open: false, x: 0, y: 0, backupId: null })
    }
  }

  function handleBackupGraphDoubleClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!isBackupGraphActive) return
    if (draggingBackupId !== null || backupLinkStart !== null || isBackupGraphPanning) return
    const target = event.target
    if (
      target instanceof Element &&
      target.closest(
        '.backup-graph-node, .backup-link-handle, .backup-graph-edge, .role-graph-corner-fullscreen, .role-graph-exit-button, .role-graph-visual-button, .graph-visual-panel'
      )
    ) {
      return
    }
    const pointer = getBackupGraphPointFromClient(event.clientX, event.clientY)
    if (!pointer) return
    createBackup('事件内容', '新事件', {
      backupX: pointer.x - BACKUP_NODE_WIDTH / 2,
      backupY: pointer.y - BACKUP_NODE_HEIGHT / 2
    })
    setStatus('已新增事件卡')
  }

  function handleBackupGraphWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!isBackupGraphFullscreen) return
    event.preventDefault()
    const board = backupGraphBoardRef.current
    if (!board) return
    const rect = board.getBoundingClientRect()
    const anchorX = event.clientX - rect.left
    const anchorY = event.clientY - rect.top
    const zoomFactor = event.deltaY < 0 ? ROLE_GRAPH_ZOOM_FACTOR : 1 / ROLE_GRAPH_ZOOM_FACTOR
    setBackupGraphViewport((previous) => {
      const nextScale = clampNumber(
        previous.scale * zoomFactor,
        ROLE_GRAPH_MIN_SCALE,
        ROLE_GRAPH_MAX_SCALE
      )
      if (nextScale === previous.scale) return previous
      const graphX = (anchorX - previous.x) / previous.scale
      const graphY = (anchorY - previous.y) / previous.scale
      return {
        scale: nextScale,
        x: anchorX - graphX * nextScale,
        y: anchorY - graphY * nextScale
      }
    })
  }

  async function toggleBackupGraphFullscreen() {
    const board = backupGraphBoardRef.current
    if (!board) return
    if (document.fullscreenElement === board) {
      await document.exitFullscreen().catch(() => {})
      return
    }
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {})
    }
    await board.requestFullscreen().catch(() => {})
  }

  function beginBackupLink(
    event: ReactMouseEvent<HTMLButtonElement>,
    backupId: number,
    side: RoleLinkSide,
    mode?: RoleRelationMode
  ) {
    if (isBackupGraphSpacePressed || isBackupGraphPanning) return
    event.preventDefault()
    event.stopPropagation()
    const nextMode = mode ?? backupActiveRelationMode
    setBackupActiveRelationMode(nextMode)
    const pointer = getBackupGraphPointFromClient(event.clientX, event.clientY)
    if (!pointer) return
    setBackupRelationMenu({ open: false, x: 0, y: 0, relationId: null })
    setBackupNodeMenu({ open: false, x: 0, y: 0, backupId: null })
    const nextTarget = getBackupLinkTargetByPoint(pointer, backupId)
    setBackupLinkStart({ backupId, side, mode: nextMode })
    setBackupLinkTarget(nextTarget)
    if (nextTarget) {
      const nextPosition = backupPositionById.get(nextTarget.backupId)
      if (nextPosition) {
        setBackupLinkPreview(getBackupSidePoint(nextPosition, nextTarget.side))
        return
      }
    }
    setBackupLinkPreview(pointer)
  }

  function beginBackupRelationCurveDrag(event: ReactMouseEvent<SVGCircleElement>, relationId: number) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    setDraggingBackupRelationCurve({ relationId })
    setBackupRelationMenu({ open: false, x: 0, y: 0, relationId: null })
  }

  function updateOrCreateBackupRelation(
    fromId: number,
    toId: number,
    fromAnchor: RoleLinkSide,
    toAnchor: RoleLinkSide,
    mode: RoleRelationMode = DEFAULT_ROLE_RELATION_MODE
  ) {
    if (fromId === toId) return
    const strokeColor = normalizeRelationColor(
      backupActiveRelationStrokeColor,
      DEFAULT_BACKUP_RELATION_STROKE_COLOR
    )
    const labelColor = normalizeRelationColor(
      backupActiveRelationLabelColor,
      DEFAULT_BACKUP_RELATION_LABEL_COLOR
    )
    const index = backupRelations.findIndex(
      (relation) => relation.fromBackupId === fromId && relation.toBackupId === toId
    )
    const nextRelations =
      index >= 0
        ? backupRelations.map((relation, relationIndex) =>
            relationIndex === index
              ? {
                  ...relation,
                  fromBackupId: fromId,
                  toBackupId: toId,
                  fromAnchor,
                  toAnchor,
                  mode,
                  strokeColor,
                  labelColor
                }
              : relation
          )
        : [
            ...backupRelations,
            {
              id: Date.now(),
              fromBackupId: fromId,
              toBackupId: toId,
              fromAnchor,
              toAnchor,
              curveOffsetX: 0,
              curveOffsetY: 0,
              mode,
              causal: '因果',
              strokeColor,
              labelColor,
              createdAt: nowLabel()
            }
          ]
    setBackupRelations(nextRelations)
  }

  function openBackupNodeContextMenu(event: ReactMouseEvent<HTMLElement>, backupId: number) {
    event.preventDefault()
    event.stopPropagation()
    if (!selectedBackupIds.has(backupId)) {
      setSelectedBackupIds(new Set([backupId]))
    }
    setBackupNodeMenu({
      open: true,
      x: event.clientX,
      y: event.clientY,
      backupId
    })
    if (backupRelationMenu.open) {
      setBackupRelationMenu({ open: false, x: 0, y: 0, relationId: null })
    }
  }

  function openBackupEditor(backupId: number) {
    const current = backups.find((item) => item.id === backupId)
    if (!current) return
    setBackupEditorDialog({
      backupId,
      title: current.title,
      content: current.content
    })
    if (backupNodeMenu.open) {
      setBackupNodeMenu({ open: false, x: 0, y: 0, backupId: null })
    }
  }

  function closeBackupEditor() {
    setBackupEditorDialog(null)
  }

  function commitBackupEditor() {
    if (!backupEditorDialog) return
    updateBackup(backupEditorDialog.backupId, {
      title: backupEditorDialog.title.trim() || '新事件',
      content: backupEditorDialog.content
    })
    setBackupEditorDialog(null)
    setStatus('事件卡已更新')
  }

  function openBackupRelationContextMenu(event: ReactMouseEvent<SVGElement>, relationId: number) {
    event.preventDefault()
    event.stopPropagation()
    setBackupRelationMenu({
      open: true,
      x: event.clientX,
      y: event.clientY,
      relationId
    })
  }

  function editBackupRelation(relationId: number) {
    const current = backupRelations.find((item) => item.id === relationId)
    if (!current) return
    setBackupRelationEditorDialog({
      relationId,
      causal: current.causal || '因果'
    })
    setBackupRelationMenu({ open: false, x: 0, y: 0, relationId: null })
  }

  function removeBackupRelation(relationId: number) {
    setBackupRelations((previous) => previous.filter((item) => item.id !== relationId))
    setBackupRelationMenu({ open: false, x: 0, y: 0, relationId: null })
    setBackupRelationEditorDialog((previous) =>
      previous && previous.relationId === relationId ? null : previous
    )
  }

  function closeBackupRelationEditor() {
    setBackupRelationEditorDialog(null)
  }

  function commitBackupRelationEditor() {
    if (!backupRelationEditorDialog) return
    const nextCausal = backupRelationEditorDialog.causal.trim() || '因果'
    setBackupRelations((previous) =>
      previous.map((item) =>
        item.id === backupRelationEditorDialog.relationId
          ? { ...item, causal: nextCausal }
          : item
      )
    )
    setBackupRelationEditorDialog(null)
    setStatus('事件因果已更新')
  }

  function handleBackupGraphMouseMove(event: ReactMouseEvent<HTMLDivElement>) {
    if (isBackupGraphPanning) {
      const start = backupGraphPanStartRef.current
      if (!start) return
      setBackupGraphViewport((previous) => ({
        ...previous,
        x: start.originX + (event.clientX - start.clientX),
        y: start.originY + (event.clientY - start.clientY)
      }))
      return
    }
    const pointer = getBackupGraphPointFromClient(event.clientX, event.clientY)
    if (!pointer) return
    if (backupSelectionBox !== null) {
      const nextBox = {
        ...backupSelectionBox,
        current: pointer
      }
      setBackupSelectionBox(nextBox)
      applyBackupSelectionByBox(nextBox)
      return
    }
    if (draggingBackupRelationCurve !== null) {
      const relation = backupRelationsRef.current.find(
        (item) => item.id === draggingBackupRelationCurve.relationId
      )
      if (!relation) return
      const geometry = getBackupRelationGeometry(relation)
      if (!geometry) return
      const nextOffset = getBackupRelationCurveOffsetFromMidpoint(
        pointer,
        geometry.fromPoint,
        geometry.toPoint
      )
      setBackupRelations((previous) => {
        const nextRelations = previous.map((item) =>
          item.id === draggingBackupRelationCurve.relationId
            ? {
                ...item,
                curveOffsetX: nextOffset.x,
                curveOffsetY: nextOffset.y
              }
            : item
        )
        backupRelationsRef.current = nextRelations
        return nextRelations
      })
      return
    }
    if (backupLinkStart !== null) {
      const nextTarget = getBackupLinkTargetByPoint(pointer, backupLinkStart.backupId)
      setBackupLinkTarget(nextTarget)
      if (nextTarget) {
        const nextPosition = backupPositionById.get(nextTarget.backupId)
        if (nextPosition) {
          setBackupLinkPreview(getBackupSidePoint(nextPosition, nextTarget.side))
        } else {
          setBackupLinkPreview(pointer)
        }
      } else {
        setBackupLinkPreview(pointer)
      }
    }
    if (draggingBackupId === null) return
    const dragIds = backupDragIdsRef.current
    const offsetById = backupDragOffsetsByIdRef.current
    if (!dragIds.length || !Object.keys(offsetById).length) {
      const nextX = Math.max(0, pointer.x - backupDragOffset.x)
      const nextY = Math.max(0, pointer.y - backupDragOffset.y)
      updateBackup(draggingBackupId, { backupX: nextX, backupY: nextY })
      return
    }
    const dragIdSet = new Set(dragIds)
    setBackups((previous) =>
      previous.map((item) => {
        if (!dragIdSet.has(item.id)) return item
        const offset = offsetById[item.id]
        if (!offset) return item
        return {
          ...item,
          backupX: Math.max(0, pointer.x - offset.x),
          backupY: Math.max(0, pointer.y - offset.y)
        }
      })
    )
  }

  function handleBackupGraphMouseUp(event: ReactMouseEvent<HTMLDivElement>) {
    const wasPanning = isBackupGraphPanning
    if (isBackupGraphPanning) {
      setIsBackupGraphPanning(false)
      backupGraphPanStartRef.current = null
    }
    if (wasPanning) return
    if (backupSelectionBox !== null) {
      const pointer = getBackupGraphPointFromClient(event.clientX, event.clientY)
      if (pointer) {
        const nextBox = {
          ...backupSelectionBox,
          current: pointer
        }
        applyBackupSelectionByBox(nextBox)
      }
      setBackupSelectionBox(null)
      return
    }
    if (draggingBackupRelationCurve !== null) {
      setDraggingBackupRelationCurve(null)
      return
    }
    if (draggingBackupId !== null) {
      setDraggingBackupId(null)
      backupDragIdsRef.current = []
      backupDragOffsetsByIdRef.current = {}
    }
    if (backupLinkStart === null) return
    const pointer = getBackupGraphPointFromClient(event.clientX, event.clientY)
    const finalTarget =
      pointer !== null ? getBackupLinkTargetByPoint(pointer, backupLinkStart.backupId) : null
    if (finalTarget && finalTarget.backupId !== backupLinkStart.backupId) {
      updateOrCreateBackupRelation(
        backupLinkStart.backupId,
        finalTarget.backupId,
        backupLinkStart.side,
        finalTarget.side,
        backupLinkStart.mode
      )
    }
    setBackupLinkStart(null)
    setBackupLinkTarget(null)
    setBackupLinkPreview(null)
  }

  function jumpToMemory(memoryItem: MemoryItem) {
    const chapter = chapters.find((item) => item.id === memoryItem.chapterId)
    if (!chapter) {
      setStatus('该记忆对应章节不存在')
      return
    }
    const version = chapter.versions.find((item) => item.id === memoryItem.versionId)
    if (!version) {
      setStatus('该记忆对应版本不存在')
      return
    }

    setChapters((previous) =>
      previous.map((item) =>
        item.id === chapter.id ? { ...item, activeVersionId: version.id } : item
      )
    )
    setActiveChapterId(chapter.id)
    setMemoryModule(memoryItem.kind)
    clearSelectionState()
    setStatus(`已跳转到 ${chapter.title} / ${version.title}`)
  }

  async function askModel(
    instruction: string,
    input: string,
    options?: { onProgress?: (message: string) => void }
  ) {
    const reportProgress = (message: string) => {
      options?.onProgress?.(message)
    }
    reportProgress('整理当前章节上下文')
    const provider = config.kind
    const baseUrl = normalizeBaseUrl(config.baseUrl, provider)
    const infoMemoryItems = memory
      .filter((item) => item.kind === 'info')
      .map((item) => item.text.trim())
      .filter(Boolean)
    const roleMemoryItems = memory
      .filter((item) => item.kind === 'role')
      .map((item) => {
        const roleName = getRoleName(item)
        const roleNote = getRoleNote(item).trim()
        const stance = getRoleStance(item)
        const stanceLabel = getRoleStanceLabel(stance)
        return `角色：${roleName}（立场 ${stance}/10，${stanceLabel}）${roleNote ? `；备注：${roleNote}` : ''}`
      })
      .filter(Boolean)
    const relationItems = roleRelations
      .map((relation) => {
        const fromRole = roleMemoryById.get(relation.fromMemoryId)
        const toRole = roleMemoryById.get(relation.toMemoryId)
        if (!fromRole || !toRole) return ''
        const fromName = getRoleName(fromRole)
        const toName = getRoleName(toRole)
        const fromStance = getRoleStance(fromRole)
        const toStance = getRoleStance(toRole)
        const mode = parseRoleRelationMode(relation.mode)
        const relationText = getRoleRelationDisplayText(relation)
        const intimacy = normalizeRelationIntimacy(relation.intimacy ?? 0)
        const tags = Array.isArray(relation.tags) && relation.tags.length > 0 ? `；标签：${relation.tags.join('、')}` : ''
        if (isRoleRelationBidirectional(mode)) {
          return `角色关系：${fromName}（立场 ${fromStance}/10-${getRoleStanceLabel(fromStance)}） 与 ${toName}（立场 ${toStance}/10-${getRoleStanceLabel(toStance)}）互为 ${relationText}（亲密度 ${intimacy}，${getRoleIntimacyLabel(intimacy)}${tags}）`
        }
        return `角色关系：${fromName}（立场 ${fromStance}/10-${getRoleStanceLabel(fromStance)}） 对 ${toName}（立场 ${toStance}/10-${getRoleStanceLabel(toStance)}）${relationText}（亲密度 ${intimacy}，${getRoleIntimacyLabel(intimacy)}${tags}）`
      })
      .filter(Boolean)
    const memoryItems = [...infoMemoryItems, ...roleMemoryItems, ...relationItems]
    reportProgress(`已汇总记忆与关系：${memoryItems.length} 条`)
    const sessionId = ensureCurrentSessionId()
    const nowIso = new Date().toISOString()
    const buildFallbackDiagnostics = (systemContent: string, output: string): ModelRuntimeDiagnostics => {
      const skillsLoaded = Boolean(skillsPrompt.trim())
      return {
        generatedAt: nowIso,
        skillsLoaded,
        skillsInjected: skillsLoaded,
        skillsHit: skillsLoaded && Boolean(output.trim()),
        injectedThisRequest: skillsLoaded,
        skillsPromptHash: skillsLoaded ? `inline-${skillsPrompt.trim().length}` : '',
        systemPromptHash: `inline-${systemContent.length}`,
        systemPromptPreview: systemContent,
        latestRequest: {
          id: `inline-${Date.now()}`,
          createdAt: nowIso,
          provider,
          model: config.model,
          baseUrl,
          instructionChars: instruction.length,
          inputChars: input.length,
          memoryCount: memoryItems.length,
          skillsLoaded,
          skillsInjected: skillsLoaded,
          injectedThisRequest: skillsLoaded
        },
        requestLogs: runtimeRequestLogs
      }
    }

    if (window.novelDesktopApi?.generate && sessionId) {
      reportProgress('正在请求推理模型')
      const response = await window.novelDesktopApi.generate({
        provider,
        baseUrl,
        model: config.model,
        apiKey: config.apiKey,
        temperature: config.temperature,
        sessionId,
        instruction,
        input,
        memory: memoryItems,
        skillsPrompt
      })
      const diagnostics = (response as { diagnostics?: ModelRuntimeDiagnostics }).diagnostics
      if (diagnostics) {
        setRuntimeDiagnostics(diagnostics)
        setRuntimeRequestLogs(
          Array.isArray(diagnostics.requestLogs) ? diagnostics.requestLogs : []
        )
      }
      reportProgress('模型返回完成，正在整理结果')
      return response.output?.trim() ?? ''
    }

    const systemContent = [
      'You are a fiction writing assistant. Keep character motives consistent and return usable prose.',
      skillsPrompt.trim() ? `Writing skills and guardrails:\n${skillsPrompt.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')
    const messages = [
      {
        role: 'system',
        content: systemContent,
      },
      {
        role: 'user',
        content: `Long-term memory:\n${memoryItems.join('\n')}\n\nTask:\n${instruction}\n\nText:\n${input}`,
      },
    ]

    if (provider === 'ollama') {
      reportProgress('通过 Ollama 接口请求模型')
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model,
          messages,
          stream: false,
          options: { temperature: config.temperature },
        }),
      })
      if (!response.ok) throw new Error(`Ollama 请求失败：${response.status}`)
      const data = (await response.json()) as {
        message?: { content?: string }
        error?: string
      }
      if (data.error) throw new Error(data.error)
      const output = data.message?.content?.trim() ?? ''
      const diagnostics = buildFallbackDiagnostics(systemContent, output)
      setRuntimeDiagnostics(diagnostics)
      setRuntimeRequestLogs((previous) => [diagnostics.latestRequest!, ...previous].slice(0, 12))
      reportProgress('模型返回完成，正在整理结果')
      return output
    }

    reportProgress('通过 OpenAI 接口请求模型')
    const response = await fetch(buildOpenAiUrl(baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: config.temperature,
      }),
    })
    if (!response.ok) throw new Error(`接口请求失败：${response.status}`)
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      error?: { message?: string }
    }
    if (data.error?.message) throw new Error(data.error.message)
    const output = data.choices?.[0]?.message?.content?.trim() ?? ''
    const diagnostics = buildFallbackDiagnostics(systemContent, output)
    setRuntimeDiagnostics(diagnostics)
    setRuntimeRequestLogs((previous) => [diagnostics.latestRequest!, ...previous].slice(0, 12))
    reportProgress('模型返回完成，正在整理结果')
    return output
  }

  async function runAction(action: WriterAction | 'custom') {
    if (assistantRunning) {
      setStatus('小助手处理中，请稍后再执行扩写/润色')
      return
    }
    const input = (selectedSnippet || readSelectedTextFromEditor()).trim()
    if (!input) {
      setStatus('请先选中文本')
      return
    }

    const currentAction =
      action === 'custom'
        ? {
            key: 'custom' as const,
            hotkey: '+',
            title: '自定义',
            short: '对当前选中文本执行自定义指令。',
            instruction: customPrompt
          }
        : action

    if (currentAction.key === 'memory') {
      const items = input.split('\n')
      if (!items.length) {
        setStatus('未从选中文本提取到记忆')
        return
      }
      appendMemoryItems(items, 'info')
      setActivePanel('memory')
      setMemoryModule('info')
      setStatus('已保存到记忆')
      return
    }

    setIsRunning(true)
    setError('')
    setResult('')
    setActivePanel('result')
    setStatus(`${currentAction.title} 执行中`)

    try {
      const output = await askModel(currentAction.instruction, input)
      setResult(output || '模型未返回内容。')
      setStatus('已生成')
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误')
      setStatus('请求失败')
    } finally {
      setIsRunning(false)
    }
  }

  async function testConnection(options?: { auto?: boolean }) {
    if (assistantRunning) {
      setStatus('小助手处理中，请稍后再测试连接')
      return
    }
    const isAuto = options?.auto === true
    const connectionSignature = buildModelConnectionSignature(config)
    setIsRunning(true)
    setError('')
    setConnectionState('checking')
    setStatus(isAuto ? '正在连接当前模型' : '正在测试连接')
    if (!isAuto) {
      setActivePanel('result')
    }
    try {
      const output = await askModel('只回复：OK', '连接测试')
      if (!isAuto) {
        setResult(output || 'OK')
      }
      persistedConnectionSignatureRef.current = connectionSignature
      persistModelConnectionSignature(connectionSignature)
      setConnectionState('connected')
      setStatus('连接正常')
    } catch (err) {
      const message = err instanceof Error ? err.message : '连接失败'
      setError(message)
      if (persistedConnectionSignatureRef.current === connectionSignature) {
        persistedConnectionSignatureRef.current = ''
      }
      clearPersistedModelConnectionSignature(connectionSignature)
      setConnectionState('failed')
      setStatus('连接失败')
      if (isAuto) {
        console.error('模型自动连接失败', err)
        window.alert('当前推理模型没有成功加载，请检查模型接口或者本地模型是否启动')
      }
    } finally {
      setIsRunning(false)
    }
  }

  async function resetCurrentSession() {
    const sessionId = ensureCurrentSessionId()
    if (!sessionId) return
    if (!window.novelDesktopApi?.resetSession) {
      setStatus('仅桌面版支持会话缓存重置')
      return
    }

    await window.novelDesktopApi.resetSession({ sessionId })
    if (!currentSessionKey) return
    const nextSessionId = createSessionId()
    setSessionMap((previous) => ({ ...previous, [currentSessionKey]: nextSessionId }))
    setRuntimeDiagnostics(null)
    setRuntimeRequestLogs([])
    setStatus('已重置当前会话')
  }

  async function buildSkillModel() {
    if (config.kind !== 'ollama') {
      setStatus('仅 Ollama 支持 Modelfile 生成')
      return
    }
    if (!window.novelDesktopApi?.createSkillModel) {
      setStatus('仅桌面版支持一键生成 Modelfile 模型')
      return
    }
    const modelName = skillModelName.trim()
    if (!modelName || !skillsPrompt.trim()) {
      setStatus('请先填写模型名和 Skills')
      return
    }

    setIsBuildingSkillModel(true)
    setError('')
    setStatus('正在生成 Skills 模型')
    try {
      const result = await window.novelDesktopApi.createSkillModel({
        baseModel: config.model,
        modelName,
        skillsPrompt,
      })
      if (result.ok) {
        setConfig((current) => ({ ...current, model: modelName }))
        if (result.stdout?.trim()) {
          setResult(result.stdout.trim())
          setActivePanel('result')
        }
        setStatus(`已生成并切换模型：${modelName}`)
      } else {
        throw new Error(result.stderr || '模型生成失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '模型生成失败')
      setStatus('模型生成失败')
    } finally {
      setIsBuildingSkillModel(false)
    }
  }

  function insertResult() {
    if (!result) return
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) {
      updateActiveDraft(`${currentDraft}\n\n${result}`)
      return
    }
    const selections = editor.getSelections() ?? []
    const targets =
      selections.length > 0
        ? selections
        : editor.getSelection()
          ? [editor.getSelection()!]
          : []
    if (!targets.length) {
      updateActiveDraft(`${currentDraft}\n\n${result}`)
      return
    }
    const edits = targets.map((selection) => ({
      range: new monaco.Range(
        selection.endLineNumber,
        selection.endColumn,
        selection.endLineNumber,
        selection.endColumn
      ),
      text: `\n\n${result}`
    }))
    editor.executeEdits('insert-result', edits)
    editor.focus()
  }

  function replaceSelection() {
    if (!result) return
    const editor = editorRef.current
    if (!editor) {
      setStatus('未检测到编辑器选区，请先选中文本后再替换')
      return
    }
    const selections = (editor.getSelections() ?? []).filter(
      (selection) => selection && !selection.isEmpty()
    )
    if (!selections.length) {
      setStatus('请先选中文本后再替换')
      return
    }
    editor.executeEdits(
      'replace-selection',
      selections.map((selection) => ({ range: selection, text: result }))
    )
    editor.focus()
    refreshSelectionState()
  }

  function addMemoryFromResult() {
    if (!result) return
    const items = result.split('\n')
    appendMemoryItems(items)
    setStatus('已保存到记忆')
  }

  async function copyResultToClipboard() {
    if (!result) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(result)
      } else {
        const helper = document.createElement('textarea')
        helper.value = result
        helper.style.position = 'fixed'
        helper.style.left = '-9999px'
        helper.style.top = '0'
        document.body.appendChild(helper)
        helper.focus()
        helper.select()
        document.execCommand('copy')
        document.body.removeChild(helper)
      }
      setStatus('已复制输出')
    } catch {
      setStatus('复制失败，请手动复制')
    }
  }

  function appendResultToDraft() {
    if (!result) return
    const prefix = currentDraft.trim() ? '\n\n' : ''
    updateActiveDraft(`${currentDraft}${prefix}${result}`)
    setStatus('已追加到正文末尾')
  }

  function overwriteDraftWithResult() {
    if (!result) return
    updateActiveDraft(result)
    setStatus('已用输出覆盖正文')
  }

  function clearResultOutput() {
    if (!result) return
    setResult('')
    setStatus('已清空输出')
  }

  function openAssistantDialog() {
    setAssistantOpen((previous) => {
      const nextOpen = !previous
      if (!nextOpen) return false
      window.setTimeout(() => {
        const pane = editorPaneRef.current
        const dialog = assistantDialogRef.current
        if (!pane || !dialog) return
        const margin = 12
        const x = Math.max(margin, pane.clientWidth - dialog.offsetWidth - margin)
        const y = Math.max(margin, pane.clientHeight - dialog.offsetHeight - margin - 56)
        setAssistantDialogPos({ x, y })
      }, 0)
      return true
    })
  }

  function startAssistantDialogDrag(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    const pane = editorPaneRef.current
    if (!pane) return
    const paneRect = pane.getBoundingClientRect()
    setAssistantDialogDragOffset({
      x: event.clientX - paneRect.left - assistantDialogPos.x,
      y: event.clientY - paneRect.top - assistantDialogPos.y
    })
    setAssistantDialogDragging(true)
  }

  async function sendAssistantMessage() {
    if (isRunning) {
      setStatus('模型正在执行其他任务，请稍后再使用小助手')
      return
    }
    if (connectionState === 'checking') {
      setStatus('大模型启动中，请稍后再试')
      return
    }
    if (connectionState === 'failed') {
      setStatus('当前大模型不可用，请先连接模型')
      return
    }
    const message = assistantInput.trim()
    if (!message) return
    const selectedText = (selectedSnippet || readSelectedTextFromEditor()).trim()
    const selectionRanges = readSelectionRangesFromEditor()
    const hasSelection = selectedText.length > 0
    const editRequested = isAssistantEditRequest(message)
    const pushProgress = (step: string) => {
      const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
      setAssistantProgressLogs((previous) => {
        const line = `${time} · ${step}`
        if (previous[previous.length - 1] === line) return previous
        return [...previous, line]
      })
    }
    const nextUserMessage: AssistantChatMessage = {
      id: Date.now(),
      role: 'user',
      content: message,
      createdAt: nowLabel()
    }
    const conversation = [...assistantMessages, nextUserMessage]
    setAssistantMessages(conversation)
    setAssistantInput('')
    setAssistantRunning(true)
    setAssistantProgressLogs([])
    setError('')
    setStatus('小助手思考中')
    pushProgress('已接收你的需求')

    try {
      pushProgress('正在读取当前版本正文')
      const conversationText = conversation
        .slice(-14)
        .map((item) => `${item.role === 'user' ? '用户' : '助手'}：${item.content}`)
        .join('\n')
      pushProgress('正在整理历史对话与记忆上下文')
      const output = await askModel(
        `你是桌面写作软件中的“小助手”。你需要与用户多轮聊天，并在用户要求时直接修改当前版本正文。
必须返回 JSON，格式固定为：
{"reply":"回复用户的话","apply":true或false,"scope":"none|selection|full","updatedSelection":"当scope=selection时返回改写后的选中内容","updatedDraft":"当scope=full时返回完整新正文"}

规则：
1) reply 用中文，简洁直接；
2) 只要用户输入出现“改/替换/扩写/润色/精简/重写”等修改请求，apply 必须为 true；
3) 当用户要求“扩写/润色/改写选中内容”且存在选中内容时：scope 必须为 selection，只返回 updatedSelection，不能改动整篇；
4) 只有用户明确要求整章/整篇重写时，scope 才为 full，并返回 updatedDraft；
5) apply=false 时 scope 必须为 none，updatedSelection 和 updatedDraft 置空；
6) 不要输出 JSON 以外的内容。`,
        `当前正文：
${currentDraft}

当前选中内容（无则为空）：
${selectedText || '(空)'}

最近对话：
${conversationText}

用户最新消息：
${message}`,
        {
          onProgress: (msg) => pushProgress(msg)
        }
      )
      pushProgress('正在解析返回内容')
      const parsed = parseAssistantModelOutput(output)
      const assistantReply: AssistantChatMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: parsed.reply,
        createdAt: nowLabel()
      }
      setAssistantMessages((previous) => [...previous, assistantReply])
      let appliedByModel = false
      if (parsed.apply) {
        if (parsed.scope === 'selection') {
          if (!hasSelection || !parsed.updatedSelection.trim()) {
            setStatus('当前没有可应用的选中内容，请重新选择后再试')
          } else {
            pushProgress('正在应用选中片段改稿')
            const applied = applyAssistantSelectionUpdate(
              selectionRanges,
              parsed.updatedSelection.trim(),
              selectedText
            )
            if (applied) {
              setResult(parsed.updatedSelection.trim())
              setActivePanel('result')
              setStatus('小助手已更新选中片段')
              appliedByModel = true
            } else {
              setStatus('未能定位原选中片段，请重新选择后再试')
            }
          }
        } else if (parsed.scope === 'full' && parsed.updatedDraft.trim()) {
          pushProgress('正在应用整篇改稿到当前版本')
          updateActiveDraft(parsed.updatedDraft.trim())
          setResult(parsed.updatedDraft.trim())
          setActivePanel('result')
          setStatus('小助手已更新当前版本')
          appliedByModel = true
        } else {
          setStatus('小助手已回复')
        }
      } else {
        setStatus('小助手已回复')
      }
      if (editRequested && !appliedByModel) {
        const fallbackScope = resolveAssistantFallbackScope(message, hasSelection)
        pushProgress('模型未返回可应用改稿，正在进行自然语言改稿重试')
        const fallbackInput =
          fallbackScope === 'selection'
            ? `用户要求（必须执行）：${message}

选中原文：
${selectedText || '(空)'}`
            : `用户要求（必须执行）：${message}

当前正文：
${currentDraft}`
        const fallbackOutput = (
          await askModel(
            fallbackScope === 'selection'
              ? `你是中文小说改稿引擎。请根据用户要求直接改写“选中原文”，并严格遵守：
1) 只输出改写后的正文，不要解释，不要引号，不要代码块；
2) 必须保留原有剧情事实，不得改写成无关内容；
3) 只改这一段，不得新增“已收到/说明文字”。`
              : `你是中文小说改稿引擎。请根据用户要求直接改写“当前正文”，并严格遵守：
1) 只输出改写后的完整正文，不要解释，不要引号，不要代码块；
2) 必须保留主线剧情与角色关系，不得偏题；
3) 不要输出“已收到/处理中”等确认语。`,
            fallbackInput,
            {
              onProgress: (msg) => pushProgress(msg)
            }
          )
        ).trim()

        if (fallbackOutput) {
          if (fallbackScope === 'selection' && hasSelection) {
            const applied = applyAssistantSelectionUpdate(selectionRanges, fallbackOutput, selectedText)
            if (applied) {
              setResult(fallbackOutput)
              setActivePanel('result')
              setStatus('小助手已更新选中片段')
              setAssistantMessages((previous) => [
                ...previous,
                {
                  id: Date.now() + 3,
                  role: 'assistant',
                  content: '已按你的自然语言要求完成选中片段改稿。',
                  createdAt: nowLabel()
                }
              ])
              appliedByModel = true
            }
          } else {
            updateActiveDraft(fallbackOutput)
            setResult(fallbackOutput)
            setActivePanel('result')
            setStatus('小助手已更新当前版本')
            setAssistantMessages((previous) => [
              ...previous,
              {
                id: Date.now() + 3,
                role: 'assistant',
                content: '已按你的自然语言要求完成当前版本改稿。',
                createdAt: nowLabel()
              }
            ])
            appliedByModel = true
          }
        }
        if (!appliedByModel) {
          setStatus('未得到可应用的改稿结果，请换个说法再试')
        }
      }
      pushProgress('处理完成')
    } catch (err) {
      setError(err instanceof Error ? err.message : '小助手请求失败')
      setStatus('小助手请求失败')
      setAssistantMessages((previous) => [
        ...previous,
        {
          id: Date.now() + 2,
          role: 'assistant',
          content: '请求失败，请稍后重试。',
          createdAt: nowLabel()
        }
      ])
    } finally {
      setAssistantRunning(false)
      setAssistantProgressLogs([])
    }
  }

  function handleAssistantInputKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    const isEnterKey =
      event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter'
    if (!isEnterKey || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
    const nativeEvent = event.nativeEvent as KeyboardEvent
    if (nativeEvent.isComposing || (nativeEvent as { keyCode?: number }).keyCode === 229) return
    event.preventDefault()
    if (assistantSendDisabled) return
    void sendAssistantMessage()
  }

  const handleEditorMount: OnMount = (editor, monaco) => {
    defineEditorTheme(monaco)
    monaco.editor.setTheme(EDITOR_THEME_ID)
    editorRef.current = editor
    monacoRef.current = monaco

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, () => {
      const action = editor.getAction('editor.action.addSelectionToNextFindMatch')
      if (action) void action.run()
    })
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyA, () => {
      editor.focus()
      editor.trigger('keyboard', 'editor.action.selectAll', null)
    })

    editor.onDidChangeCursorSelection(() => {
      refreshSelectionState()
    })
    editor.onDidChangeModelContent((event) => {
      refreshSelectionState()
      if (shouldRefreshScriptDecorationsFromChange(event)) {
        scheduleScriptLineDecorations()
      }
      syncScriptRolesFromContentChanges(event)
    })
    editor.onDidBlurEditorWidget(() => {
      closeEditorContextMenu()
    })
    editor.onDidScrollChange(() => {
      closeEditorContextMenu()
      closeScriptRolePicker()
    })
    editor.onContextMenu((event) => {
      event.event.preventDefault()
      event.event.stopPropagation()
      refreshSelectionState()
      closeScriptRolePicker()
      const browserEvent = event.event.browserEvent
      openEditorContextMenu(browserEvent.clientX, browserEvent.clientY)
    })
    editor.onMouseDown((event) => {
      if (activeVersionWritingModeRef.current !== 'script') return
      const position = event.target.position
      if (!position) return
      const prefix = getScriptPrefixAtPosition(position.lineNumber, position.column)
      if (!prefix) return
      event.event.preventDefault()
      event.event.stopPropagation()
      const browserEvent = event.event.browserEvent
      openScriptRolePickerAt(prefix, browserEvent.clientX, browserEvent.clientY)
    })

    const domNode = editor.getDomNode()
    if (domNode) {
      const onCopy = (event: ClipboardEvent) => {
        if (activeVersionWritingModeRef.current !== 'script') return
        const model = editor.getModel()
        if (!model) return
        const selections = editor.getSelections() ?? []
        const text = selections
          .filter((selection) => selection && !selection.isEmpty())
          .map((selection) => model.getValueInRange(selection))
          .join('\n')
        if (!text) return
        const normalized = normalizeScriptClipboardText(text)
        event.preventDefault()
        event.clipboardData?.setData('text/plain', normalized)
      }
      domNode.addEventListener('copy', onCopy, true)
      editor.onDidDispose(() => {
        domNode.removeEventListener('copy', onCopy, true)
      })
    }

    refreshSelectionState()
    scheduleScriptLineDecorations()
  }

  if (activeScreen === 'projects') {
    if (projectCenterView === 'settings') {
      return (
        <main className="project-shell">
          <section className="project-home project-settings-page">
            <header className="project-settings-page-header">
              <button
                className="text-button project-settings-back"
                onClick={() => setProjectCenterView('home')}
                type="button"
              >
                {t('← 返回项目', '← Back To Projects')}
              </button>
              <strong>{t('设置', 'Settings')}</strong>
            </header>

            {hasDesktopProjectStorage ? (
              <div className="project-settings-panel">
                <section className="project-settings-group is-wide">
                  <header className="project-settings-group-header">
                    <h3>{t('基础设置', 'Basic Settings')}</h3>
                    <p>
                      {t(
                        '管理语言与项目存储路径。',
                        'Configure language and project storage location.'
                      )}
                    </p>
                  </header>
                  <div className="project-settings-group-body">
                    <label className="project-settings-field">
                      <span>{t('软件语言', 'Language')}</span>
                      <select
                        value={appLanguage}
                        onChange={(event) => setAppLanguage(event.target.value as AppLanguage)}
                      >
                        <option value="zh-CN">中文</option>
                        <option value="en-US">English</option>
                      </select>
                    </label>
                    <label className="project-settings-field is-full">
                      <span>{t('项目文件保存位置', 'Project Storage Directory')}</span>
                      <div className="project-storage-row">
                        <input
                          value={projectStorageDir}
                          onChange={(event) => setProjectStorageDir(event.target.value)}
                          placeholder={t('输入本地目录路径', 'Enter local directory path')}
                        />
                        <button
                          className="text-button project-storage-pick-button"
                          onClick={() => void pickProjectStorageDir()}
                          title={t('选择目录', 'Browse')}
                          aria-label={t('选择目录', 'Browse')}
                        >
                          <svg
                            className="project-storage-pick-icon"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            focusable="false"
                          >
                            <path d="M10 4l2 2h8v12H4V4h6z" />
                            <path d="M4 9h16" />
                          </svg>
                        </button>
                      </div>
                    </label>
                    <p className="panel-note-tip project-settings-note">
                      {t(
                        '修改保存位置后，会将当前所有项目文件包迁移到新目录。',
                        'After changing the location, all existing project packages will be moved to the new directory.'
                      )}
                    </p>
                  </div>
                </section>

                <section className="project-settings-group">
                  <header className="project-settings-group-header">
                    <h3>{t('版本与授权', 'Version & Activation')}</h3>
                    <p>
                      {t(
                        '查看版本信息与本机授权状态。',
                        'Check version and machine activation status.'
                      )}
                    </p>
                  </header>
                  <div className="project-settings-group-body">
                    <div className="project-settings-field">
                      <span>{t('软件升级', 'Software Upgrade')}</span>
                      <p className="project-settings-version">
                        <span>{appVersionLabel}</span>
                        {hasActivationSupport && (
                          <button
                            className={`activation-chip ${activationStatus.activated ? 'is-active' : ''}`}
                            onClick={() => void openActivationDialog()}
                            title={activationTooltip}
                            type="button"
                          >
                            {activationLabel}
                          </button>
                        )}
                      </p>
                      <p className="panel-note-tip project-settings-note-inline">
                        {t(
                          '当前版本说明：v 1.1 bate（内测版本）。',
                          'Current version note: v 1.1 bate (beta).'
                        )}
                      </p>
                      <button
                        className="text-button project-upgrade-button"
                        disabled={isCheckingAppUpgrade}
                        onClick={() => void checkAppUpgrade()}
                        type="button"
                      >
                        {isCheckingAppUpgrade ? t('检查中...', 'Checking...') : t('软件升级', 'Check Upgrade')}
                      </button>
                    </div>
                    {hasActivationSupport && (
                      <div className="project-activation-box">
                        <div className="project-activation-row">
                          <span>{t('当前计算机 MAC', 'Current MAC')}</span>
                          <code>{currentMachineMacLabel}</code>
                        </div>
                        <div className="project-activation-row">
                          <span>{t('已绑定 MAC', 'Bound MAC')}</span>
                          <code>{boundMachineMacLabel}</code>
                        </div>
                        <div className="project-activation-actions">
                          <button
                            className="text-button danger"
                            disabled={!canUnbindCurrentMachine || isUnbindingMachine}
                            onClick={() => void unbindCurrentMachine()}
                            type="button"
                          >
                            {isUnbindingMachine
                              ? t('取消绑定中...', 'Unbinding...')
                              : t('取消本机绑定', 'Unbind This Machine')}
                          </button>
                          {!canUnbindCurrentMachine && (
                            <small>{t('当前未绑定，无需取消。', 'Not bound on this machine.')}</small>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                <section className="project-settings-group">
                  <header className="project-settings-group-header">
                    <h3>{t('启动选项', 'Startup Options')}</h3>
                    <p>
                      {t(
                        '控制开机自动启动和自动升级行为。',
                        'Control auto-launch and auto-upgrade behavior.'
                      )}
                    </p>
                  </header>
                  <div className="project-settings-group-body">
                    <label className="project-settings-switch-card">
                      <input
                        checked={autoUpdateEnabled}
                        onChange={(event) => setAutoUpdateEnabled(event.target.checked)}
                        type="checkbox"
                      />
                      <span>{t('自动升级（默认开启）', 'Auto upgrade (enabled by default)')}</span>
                    </label>
                    <label className="project-settings-switch-card">
                      <input
                        checked={autoLaunchEnabled}
                        onChange={(event) => setAutoLaunchEnabled(event.target.checked)}
                        type="checkbox"
                      />
                      <span>{t('软件随系统启动（默认开启）', 'Launch on system startup (enabled by default)')}</span>
                    </label>
                  </div>
                </section>

                <section className="project-settings-actions is-wide">
                  <button
                    className="primary-button project-settings-save"
                    disabled={isApplyingProjectSettings}
                    onClick={() => void applyProjectSettings()}
                  >
                    {isApplyingProjectSettings
                      ? t('保存中...', 'Saving...')
                      : t('保存设置', 'Save Settings')}
                  </button>
                  {projectSettingsNotice && (
                    <p
                      className={`project-settings-notice ${projectSettingsNotice.kind === 'success' ? 'is-success' : 'is-error'}`}
                      role="status"
                    >
                      {projectSettingsNotice.message}
                    </p>
                  )}
                </section>
              </div>
            ) : (
              <p className="panel-note-tip project-settings-note">
                {t(
                  '当前环境不支持项目文件目录管理。',
                  'Project file directory management is not available in this environment.'
                )}
              </p>
            )}
          </section>
        </main>
      )
    }

    if (projectCenterView === 'all') {
      return (
        <main className="project-shell">
          <section className="project-home project-all-projects-page">
            <header className="project-all-header">
              <button
                className="text-button project-all-back"
                onClick={() => setProjectCenterView('home')}
                type="button"
              >
                {t('← 返回首页', '← Back To Home')}
              </button>
              <div className="project-all-title">
                <strong>{t('全部项目', 'All Projects')}</strong>
                <p>{t(`共 ${projects.length} 个项目`, `${projects.length} projects`)}</p>
              </div>
            </header>

            <ul className="project-recent-list project-recent-list-all">
              {projects.map((project, index) => (
                <li key={project.id}>
                  <div className={`project-cover project-cover-${(index % 6) + 1}`} aria-hidden="true" />
                  <div className="project-recent-meta">
                    <strong>{project.name}</strong>
                    <small>
                      {appLanguage === 'en-US'
                        ? `Updated ${project.updatedAt}`
                        : `更新于 ${project.updatedAt}`}
                    </small>
                  </div>
                  <div className="project-item-actions">
                    <button
                      className={`text-button ${
                        project.id === activeProjectId ? 'project-resume-button' : ''
                      }`}
                      onClick={() => {
                        setProjectActionMenuId(null)
                        openProject(project.id)
                      }}
                    >
                      {project.id === activeProjectId ? t('继续', 'Resume') : t('打开', 'Open')}
                    </button>
                    <div className="project-item-menu">
                      <button
                        aria-expanded={projectActionMenuId === project.id}
                        className="text-button project-item-menu-trigger"
                        onClick={() =>
                          setProjectActionMenuId((current) =>
                            current === project.id ? null : project.id
                          )
                        }
                        title={t('更多操作', 'More actions')}
                        type="button"
                      >
                        ⋯
                      </button>
                      {projectActionMenuId === project.id && (
                        <div className="project-item-menu-dropdown" role="menu">
                          <button
                            className="text-button"
                            disabled={renamingProjectId === project.id}
                            onClick={() => {
                              setProjectActionMenuId(null)
                              requestRenameProject(project)
                            }}
                            type="button"
                          >
                            {renamingProjectId === project.id
                              ? t('重命名中...', 'Renaming...')
                              : t('重命名', 'Rename')}
                          </button>
                          <button
                            className="text-button"
                            disabled={!hasDesktopProjectStorage}
                            onClick={() => {
                              setProjectActionMenuId(null)
                              void openProjectFiles(project)
                            }}
                            type="button"
                          >
                            {t('查看文件', 'View Files')}
                          </button>
                          <button
                            className="text-button danger"
                            disabled={deletingProjectId === project.id}
                            onClick={() => {
                              setProjectActionMenuId(null)
                              requestDeleteProject(project)
                            }}
                            type="button"
                          >
                            {deletingProjectId === project.id
                              ? t('删除中...', 'Deleting...')
                              : t('删除', 'Delete')}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {!projects.length && (
              <p className="empty-tip">{t('还没有项目，先创建一个新项目。', 'No projects yet. Create one to start.')}</p>
            )}

            {pendingRenameProject && (
              <div
                className="project-create-modal-backdrop"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) cancelRenameProject()
                }}
              >
                <div className="project-create-modal" onMouseDown={(event) => event.stopPropagation()}>
                  <h3>{t('重命名项目', 'Rename Project')}</h3>
                  <p>{t('请输入新的项目名称。', 'Please enter a new project name.')}</p>
                  <input
                    autoFocus
                    value={renameProjectInputName}
                    onChange={(event) => {
                      setRenameProjectInputName(event.target.value)
                      if (renameProjectError) setRenameProjectError('')
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void confirmRenameProject()
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        cancelRenameProject()
                      }
                    }}
                    placeholder={t('输入新项目名', 'Enter new project name')}
                  />
                  {renameProjectError ? (
                    <p className="project-delete-feedback is-error">{renameProjectError}</p>
                  ) : isRenameProjectUnchanged ? (
                    <p className="project-delete-feedback">{t('名称未变化。', 'Name is unchanged.')}</p>
                  ) : null}
                  <div className="project-create-modal-actions">
                    <button className="text-button" onClick={cancelRenameProject}>
                      {t('取消', 'Cancel')}
                    </button>
                    <button
                      className="primary-button"
                      disabled={!renameProjectInputTrimmed || renamingProjectId === pendingRenameProject.id}
                      onClick={() => void confirmRenameProject()}
                    >
                      {renamingProjectId === pendingRenameProject.id
                        ? t('保存中...', 'Saving...')
                        : t('保存名称', 'Save Name')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {pendingDeleteProject && (
              <div
                className="project-delete-modal-backdrop"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) cancelDeleteProject()
                }}
              >
                <div className="project-delete-modal" onMouseDown={(event) => event.stopPropagation()}>
                  <h3>{t('确认删除项目', 'Confirm Project Deletion')}</h3>
                  <p>
                    {t(
                      `为了防止误删，请输入完整项目名“${pendingDeleteProject.name}”确认项目并删除。`,
                      `To prevent accidental deletion, type the full project name "${pendingDeleteProject.name}" to confirm and delete.`
                    )}
                  </p>
                  <input
                    autoFocus
                    className={
                      deleteProjectConfirmInput.length > 0
                        ? isDeleteProjectNameMatch
                          ? 'is-success'
                          : 'is-error'
                        : undefined
                    }
                    value={deleteProjectConfirmName}
                    onChange={(event) => {
                      const nextValue = event.target.value
                      setDeleteProjectConfirmName(nextValue)
                      const nextInput = nextValue.trim()
                      if (!nextInput) {
                        setDeleteProjectConfirmError('')
                        return
                      }
                      if (nextInput === (pendingDeleteProject?.name.trim() ?? '')) {
                        setDeleteProjectConfirmError('')
                        return
                      }
                      setDeleteProjectConfirmError(
                        t('项目名不匹配，请确认后重试。', 'Project name mismatch. Please check and retry.')
                      )
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void confirmDeleteProject()
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        cancelDeleteProject()
                      }
                    }}
                    placeholder={t('输入完整项目名', 'Type full project name')}
                  />
                  {deleteProjectConfirmInput.length > 0 ? (
                    isDeleteProjectNameMatch ? (
                      <p className="project-delete-feedback is-success">
                        {t('名称匹配，可执行删除。', 'Name matched. You can delete now.')}
                      </p>
                    ) : (
                      <p className="project-delete-feedback is-error">
                        {deleteProjectConfirmError ||
                          t('项目名不匹配，请确认后重试。', 'Project name mismatch. Please check and retry.')}
                      </p>
                    )
                  ) : null}
                  <p className="project-delete-feedback is-error">
                    {t('删除项目不可恢复，请谨慎操作。', 'Project deletion cannot be undone. Please proceed carefully.')}
                  </p>
                  <div className="project-delete-modal-actions">
                    <button className="text-button" onClick={cancelDeleteProject}>
                      {t('取消', 'Cancel')}
                    </button>
                    <button
                      className="text-button danger"
                      disabled={
                        deletingProjectId === pendingDeleteProject.id || !isDeleteProjectNameMatch
                      }
                      onClick={() => void confirmDeleteProject()}
                    >
                      {deletingProjectId === pendingDeleteProject.id
                        ? t('删除中...', 'Deleting...')
                        : t('确认删除', 'Delete')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </main>
      )
    }

    return (
      <main className="project-shell">
        <section className="project-home project-home-dashboard">
          <header className="project-home-header">
            <div className="project-home-header-top">
              <div className="project-home-brand">
                <img className="brand-logo" src={appLogo} alt={APP_DISPLAY_NAME} />
                <div className="project-home-brand-copy">
                  <strong>{APP_DISPLAY_NAME}</strong>
                  <span>{t('让AI写作更可控', 'Make AI Writing More Controllable')}</span>
                </div>
                <div className="project-home-version" aria-label="Software version">
                  <span>{appVersionLabel || APP_VERSION_FALLBACK}</span>
                  {hasActivationSupport && (
                    <button
                      className={`activation-chip ${activationStatus.activated ? 'is-active' : ''}`}
                      onClick={() => void openActivationDialog()}
                      title={activationTooltip}
                      type="button"
                    >
                      {activationLabel}
                    </button>
                  )}
                </div>
              </div>
              <div className="project-home-header-actions">
                {hasDesktopProjectStorage && (
                  <button
                    className="project-settings-entry"
                    onClick={() => setProjectCenterView('settings')}
                    title={t('打开设置', 'Open Settings')}
                    type="button"
                  >
                    <span aria-hidden>⚙</span>
                  </button>
                )}
                {hasDesktopWindowClose && (
                  <button
                    className="project-close-entry"
                    onClick={() => void closeDesktopWindow()}
                    title={t('关闭', 'Close')}
                    type="button"
                  >
                    <span aria-hidden>✕</span>
                  </button>
                )}
              </div>
            </div>
          </header>

          <div className="project-dashboard-grid">
            <section className="project-dashboard-left">
              <article className="project-greeting-panel">
                <div className="project-mascot-scene">
                  <video
                    autoPlay
                    className="project-mascot-image"
                    loop
                    muted
                    playsInline
                    preload="metadata"
                  >
                    <source src={homeBannerVideo} type="video/mp4" />
                  </video>
                  <div className="project-greeting-copy">
                    <h2>
                      {dashboardGreeting}
                      <span aria-hidden> 👋</span>
                    </h2>
                    <p>{t('今天也要快乐写作啊~~··', "Let's write happily today too~~··")}</p>
                  </div>
                </div>
                <div className="project-quick-cards project-quick-cards-overlay">
                  <article className="project-quick-card is-primary">
                    <div className="project-quick-card-title">
                      <img
                        className="project-quick-card-icon"
                        src={writingIcon}
                        alt={t('继续写作', 'Resume Writing')}
                      />
                      <h3>{t('继续写作', 'Resume Writing')}</h3>
                    </div>
                    <p>
                      {activeProject
                        ? `${t('上次编辑：', 'Last edited: ')}${activeProject.name}`
                        : t('暂无可继续项目。', 'No recent project to resume.')}
                    </p>
                    <button
                      className="primary-button"
                      disabled={!activeProject}
                      onClick={() => activeProject && openProject(activeProject.id)}
                    >
                      {t('继续写作', 'Continue')}
                    </button>
                  </article>
                  <article className="project-quick-card">
                    <div className="project-quick-card-title">
                      <img
                        className="project-quick-card-icon"
                        src={createIcon}
                        alt={t('新建作品', 'Create Project')}
                      />
                      <h3>{t('新建作品', 'Create Project')}</h3>
                    </div>
                    <p>{t('快速创建一个全新故事。', 'Start a brand-new story quickly.')}</p>
                    <button className="text-button" onClick={openCreateProjectModal}>
                      {t('新建作品', 'Create')}
                    </button>
                  </article>
                </div>
              </article>
            </section>

            <section className="project-recent-panel">
              <header className="project-recent-header">
                <strong>{t('最近项目', 'Recent Projects')}</strong>
                <button
                  className="project-all-link"
                  onClick={() => setProjectCenterView('all')}
                  type="button"
                >
                  {t('全部项目 >', 'All Projects >')}
                </button>
              </header>
              <div className={`project-recent-body ${!recentProjects.length ? 'is-empty' : ''}`}>
                <ul className="project-recent-list">
                  {recentProjects.map((project, index) => (
                    <li key={project.id}>
                      <div className={`project-cover project-cover-${(index % 6) + 1}`} aria-hidden="true" />
                      <div className="project-recent-meta">
                        <strong>{project.name}</strong>
                        <small>
                          {appLanguage === 'en-US'
                            ? `Updated ${project.updatedAt}`
                            : `更新于 ${project.updatedAt}`}
                        </small>
                      </div>
                      <div className="project-item-actions">
                        <button
                          className={`text-button ${
                            project.id === activeProjectId ? 'project-resume-button' : ''
                          }`}
                          onClick={() => {
                            setProjectActionMenuId(null)
                            openProject(project.id)
                          }}
                        >
                          {project.id === activeProjectId ? t('继续', 'Resume') : t('打开', 'Open')}
                        </button>
                        <div className="project-item-menu">
                          <button
                            aria-expanded={projectActionMenuId === project.id}
                            className="text-button project-item-menu-trigger"
                            onClick={() =>
                              setProjectActionMenuId((current) =>
                                current === project.id ? null : project.id
                              )
                            }
                            title={t('更多操作', 'More actions')}
                            type="button"
                          >
                            ⋯
                          </button>
                          {projectActionMenuId === project.id && (
                            <div className="project-item-menu-dropdown" role="menu">
                              <button
                                className="text-button"
                                disabled={renamingProjectId === project.id}
                                onClick={() => {
                                  setProjectActionMenuId(null)
                                  requestRenameProject(project)
                                }}
                                type="button"
                              >
                                {renamingProjectId === project.id
                                  ? t('重命名中...', 'Renaming...')
                                  : t('重命名', 'Rename')}
                              </button>
                              <button
                                className="text-button"
                                disabled={!hasDesktopProjectStorage}
                                onClick={() => {
                                  setProjectActionMenuId(null)
                                  void openProjectFiles(project)
                                }}
                                type="button"
                              >
                                {t('查看文件', 'View Files')}
                              </button>
                              <button
                                className="text-button danger"
                                disabled={deletingProjectId === project.id}
                                onClick={() => {
                                  setProjectActionMenuId(null)
                                  requestDeleteProject(project)
                                }}
                                type="button"
                              >
                                {deletingProjectId === project.id
                                  ? t('删除中...', 'Deleting...')
                                  : t('删除', 'Delete')}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                {!recentProjects.length && (
                  <p className="project-recent-empty-tip">
                    {t('还没有项目，先在左侧创建一个。', 'No projects yet. Create one from the left panel.')}
                  </p>
                )}
              </div>
              {hasDesktopProjectImport && (
                <button
                  className="text-button project-import-button"
                  disabled={isImportingProjects}
                  onClick={() => void importProjectsFromDisk()}
                  type="button"
                >
                  {isImportingProjects ? t('导入中...', 'Importing...') : t('⇪ 导入作品', '⇪ Import Project')}
                </button>
              )}
            </section>
          </div>

          <section className="project-data-strip" aria-label={t('创作数据', 'Writing Stats')}>
            <header className="project-data-header">
              <strong>{t('创作数据', 'Writing Stats')}</strong>
            </header>
            <div className="project-data-grid">
              <div className="project-stat-item">
                <img className="project-stat-icon" src={worksIcon} alt={t('累计字数', 'Total characters')} />
                <div className="project-stat-text">
                  <strong>{totalCharsLabel}</strong>
                  <span>{t('累计字数', 'Total characters')}</span>
                </div>
              </div>
              <div className="project-stat-item">
                <img className="project-stat-icon" src={streakIcon} alt={t('连续创作', 'Writing streak')} />
                <div className="project-stat-text">
                  <strong>{dashboardMetrics.streakDays}</strong>
                  <span>{t('连续创作', 'Writing streak')}</span>
                </div>
              </div>
              <div className="project-stat-item">
                <img className="project-stat-icon" src={todayCharsIcon} alt={t('创作作品', 'Works')} />
                <div className="project-stat-text">
                  <strong>{dashboardMetrics.totalProjects}</strong>
                  <span>{t('创作作品', 'Works')}</span>
                </div>
              </div>
              <div className="project-stat-item">
                <img className="project-stat-icon" src={totalCharsIcon} alt={t('今日字数', "Today's words")} />
                <div className="project-stat-text">
                  <strong>{todayCharsLabel}</strong>
                  <span>{t('今日字数', "Today's words")}</span>
                </div>
              </div>
              <div
                aria-label={t('标题横幅', 'Title banner')}
                className="project-data-title-banner"
                role="img"
                style={{ backgroundImage: `url(${titleBanner})` }}
              />
            </div>
          </section>

          {isCreateProjectModalOpen && (
            <div
              className="project-create-modal-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeCreateProjectModal()
              }}
            >
              <div className="project-create-modal" onMouseDown={(event) => event.stopPropagation()}>
                <h3>{t('新建作品', 'Create Project')}</h3>
                <p>{t('请输入作品名称。', 'Please enter a project name.')}</p>
                <input
                  autoFocus
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      createProject(newProjectName)
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      closeCreateProjectModal()
                    }
                  }}
                  placeholder={t('输入作品名称', 'Enter project name')}
                />
                <div className="project-create-modal-actions">
                  <button className="text-button" onClick={closeCreateProjectModal}>
                    {t('取消', 'Cancel')}
                  </button>
                  <button
                    className="primary-button"
                    disabled={!newProjectName.trim()}
                    onClick={() => createProject(newProjectName)}
                  >
                    {t('创建', 'Create')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {pendingRenameProject && (
            <div
              className="project-create-modal-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) cancelRenameProject()
              }}
            >
              <div className="project-create-modal" onMouseDown={(event) => event.stopPropagation()}>
                <h3>{t('重命名项目', 'Rename Project')}</h3>
                <p>{t('请输入新的项目名称。', 'Please enter a new project name.')}</p>
                <input
                  autoFocus
                  value={renameProjectInputName}
                  onChange={(event) => {
                    setRenameProjectInputName(event.target.value)
                    if (renameProjectError) setRenameProjectError('')
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void confirmRenameProject()
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      cancelRenameProject()
                    }
                  }}
                  placeholder={t('输入新项目名', 'Enter new project name')}
                />
                {renameProjectError ? (
                  <p className="project-delete-feedback is-error">{renameProjectError}</p>
                ) : isRenameProjectUnchanged ? (
                  <p className="project-delete-feedback">{t('名称未变化。', 'Name is unchanged.')}</p>
                ) : null}
                <div className="project-create-modal-actions">
                  <button className="text-button" onClick={cancelRenameProject}>
                    {t('取消', 'Cancel')}
                  </button>
                  <button
                    className="primary-button"
                    disabled={!renameProjectInputTrimmed || renamingProjectId === pendingRenameProject.id}
                    onClick={() => void confirmRenameProject()}
                  >
                    {renamingProjectId === pendingRenameProject.id
                      ? t('保存中...', 'Saving...')
                      : t('保存名称', 'Save Name')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {pendingDeleteProject && (
            <div
              className="project-delete-modal-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) cancelDeleteProject()
              }}
            >
              <div className="project-delete-modal" onMouseDown={(event) => event.stopPropagation()}>
                <h3>{t('确认删除项目', 'Confirm Project Deletion')}</h3>
                <p>
                  {t(
                      `为了防止误删，请输入完整项目名“${pendingDeleteProject.name}”确认项目并删除。`,
                      `To prevent accidental deletion, type the full project name "${pendingDeleteProject.name}" to confirm and delete.`
                  )}
                </p>
                <input
                  autoFocus
                  className={
                    deleteProjectConfirmInput.length > 0
                      ? isDeleteProjectNameMatch
                        ? 'is-success'
                        : 'is-error'
                      : undefined
                  }
                  value={deleteProjectConfirmName}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    setDeleteProjectConfirmName(nextValue)
                    const nextInput = nextValue.trim()
                    if (!nextInput) {
                      setDeleteProjectConfirmError('')
                      return
                    }
                    if (nextInput === (pendingDeleteProject?.name.trim() ?? '')) {
                      setDeleteProjectConfirmError('')
                      return
                    }
                    setDeleteProjectConfirmError(
                      t('项目名不匹配，请确认后重试。', 'Project name mismatch. Please check and retry.')
                    )
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void confirmDeleteProject()
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      cancelDeleteProject()
                    }
                  }}
                  placeholder={t('输入完整项目名', 'Type full project name')}
                />
                {deleteProjectConfirmInput.length > 0 ? (
                  isDeleteProjectNameMatch ? (
                    <p className="project-delete-feedback is-success">
                      {t('名称匹配，可执行删除。', 'Name matched. You can delete now.')}
                    </p>
                  ) : (
                    <p className="project-delete-feedback is-error">
                      {deleteProjectConfirmError ||
                        t('项目名不匹配，请确认后重试。', 'Project name mismatch. Please check and retry.')}
                    </p>
                  )
                ) : null}
                <p className="project-delete-feedback is-error">
                  {t('删除项目不可恢复，请谨慎操作。', 'Project deletion cannot be undone. Please proceed carefully.')}
                </p>
                <div className="project-delete-modal-actions">
                  <button className="text-button" onClick={cancelDeleteProject}>
                    {t('取消', 'Cancel')}
                  </button>
                  <button
                    className="text-button danger"
                    disabled={
                      deletingProjectId === pendingDeleteProject.id || !isDeleteProjectNameMatch
                    }
                    onClick={() => void confirmDeleteProject()}
                  >
                    {deletingProjectId === pendingDeleteProject.id
                      ? t('删除中...', 'Deleting...')
                      : t('确认删除', 'Delete')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    )
  }

  return (
    <main className="writer-shell">
      <aside className="quick-rail" aria-label="页面列表">
        <button
          className="rail-back-button"
          onClick={openProjectCenter}
          title={t('返回项目页', 'Back To Projects')}
          type="button"
        >
          {appLanguage === 'en-US' ? '← Projects' : '← 返回项目'}
        </button>
        {chapters.map((chapter) => (
          <button
            className={`rail-button ${chapter.id === activeChapterId ? 'active' : ''} ${draggingChapterId === chapter.id ? 'dragging' : ''} ${dragOverChapterId === chapter.id && draggingChapterId !== chapter.id ? `drag-over drag-over-${dragInsertPosition}` : ''}`}
            draggable
            key={chapter.id}
            onClick={() => switchChapter(chapter.id)}
            onMouseDown={(event) => {
              const isCustomPage =
                chapter.kind === 'special' && (chapter.specialType ?? 'special') === 'special'
              if (!isCustomPage || event.button !== 2) return
              event.preventDefault()
              event.stopPropagation()
              renameCustomPage(chapter.id)
            }}
            onDragEnd={() => {
              setDraggingChapterId(null)
              setDragOverChapterId(null)
              setDragInsertPosition('before')
            }}
            onDragOver={(event) => {
              if (draggingChapterId === null || draggingChapterId === chapter.id) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              const target = event.currentTarget as HTMLButtonElement
              const rect = target.getBoundingClientRect()
              const nextPosition: ChapterDropPosition =
                event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
              setDragInsertPosition(nextPosition)
              setDragOverChapterId(chapter.id)
            }}
            onDragStart={(event) => {
              setDraggingChapterId(chapter.id)
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', String(chapter.id))
            }}
            onContextMenu={(event) => {
              const isCustomPage =
                chapter.kind === 'special' && (chapter.specialType ?? 'special') === 'special'
              if (!isCustomPage) return
              event.preventDefault()
              event.stopPropagation()
              renameCustomPage(chapter.id)
            }}
            onDrop={(event) => {
              event.preventDefault()
              const payload = event.dataTransfer.getData('text/plain')
              const sourceId = Number(payload || draggingChapterId)
              if (Number.isFinite(sourceId)) {
                moveChapter(sourceId, chapter.id, dragInsertPosition)
              }
              setDraggingChapterId(null)
              setDragOverChapterId(null)
              setDragInsertPosition('before')
            }}
            title={chapter.title}
          >
            <span className="rail-index">{railLabelByChapterId.get(chapter.id) ?? '?'}</span>
            {canDeleteChapter && (
              <span
                className="rail-close"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  deleteChapter(chapter.id)
                }}
              >
                x
              </span>
            )}
          </button>
        ))}
        <div className="rail-add-row" ref={addPageMenuRef}>
          <button className="rail-button rail-button-plus" onClick={addChapter} title="新增章节">
            <span className="rail-index">+</span>
          </button>
          <button
            className={`rail-add-trigger ${isAddPageMenuOpen ? 'open' : ''}`}
            onClick={() => setIsAddPageMenuOpen((previous) => !previous)}
            title="新增其他页面"
            type="button"
          >
            ▾
          </button>
          {isAddPageMenuOpen && (
            <ul className="rail-add-menu">
              {SPECIAL_PAGE_OPTIONS.map((option) => (
                <li key={option.type}>
                  <button
                    onClick={() => addSpecialPage(option.type)}
                    type="button"
                  >
                    新增{option.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <section className="app-frame">
        <header className="menu-bar">
          <div className="brand">
            <img className="brand-logo" src={appLogo} alt={APP_DISPLAY_NAME} />
            <div className="brand-copy">
              <strong>{APP_DISPLAY_NAME}</strong>
              <span>{t('让AI写作更可控', 'Make AI Writing More Controllable')}</span>
            </div>
            <div className="brand-meta-row brand-meta-row-inline">
              <span>{appVersionLabel || APP_VERSION_FALLBACK}</span>
              {hasActivationSupport && (
                <button
                  className={`activation-chip is-compact ${activationStatus.activated ? 'is-active' : ''}`}
                  onClick={() => void openActivationDialog()}
                  title={activationTooltip}
                  type="button"
                >
                  {activationLabel}
                </button>
              )}
            </div>
          </div>
          <div className="menu-project-name" title={activeProject?.name ?? ''}>
            {activeProject?.name ?? ''}
          </div>
          <div className="menu-bar-right">
            <div className="window-status">{status}</div>
            {hasDesktopWindowControls && (
              <div className="window-controls">
                <button
                  className="window-control-button"
                  onClick={() => void minimizeDesktopWindow()}
                  title={t('最小化', 'Minimize')}
                  type="button"
                >
                  <span aria-hidden>─</span>
                </button>
                <button
                  className="window-control-button"
                  onClick={() => void toggleDesktopMaximizeWindow()}
                  title={isWindowMaximized ? t('向下还原', 'Restore') : t('最大化', 'Maximize')}
                  type="button"
                >
                  <span aria-hidden>{isWindowMaximized ? '❐' : '□'}</span>
                </button>
                <button
                  className="window-control-button is-close"
                  onClick={() => void closeDesktopWindow()}
                  title={t('关闭', 'Close')}
                  type="button"
                >
                  <span aria-hidden>✕</span>
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="tab-row">
          <div className="version-tabs-viewport" ref={versionTabsViewportRef}>
            {visibleVersions.map((version) => (
              <button
                key={version.id}
                className={`tab version-tab ${version.id === activeChapter?.activeVersionId ? 'active' : ''}`}
                onClick={() => switchVersion(version.id)}
                onDoubleClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  startVersionRename(version)
                }}
              >
                {editingVersionId === version.id ? (
                  <input
                    autoFocus
                    className="tab-title-input"
                    onBlur={() => commitVersionRename(version.id)}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => setEditingVersionTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        commitVersionRename(version.id)
                        return
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        cancelVersionRename()
                      }
                    }}
                    value={editingVersionTitle}
                  />
                ) : (
                  <span className="tab-label">{version.title}</span>
                )}
                {canDeleteVersion && editingVersionId !== version.id && (
                  <span
                    className="tab-close"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      deleteVersion(version.id)
                    }}
                  >
                    x
                  </span>
                )}
              </button>
            ))}
            <button className="tab tab-add-version" onClick={addVersion}>
              + 版本
            </button>
          </div>

          <div className="tab-actions">
            {overflowVersions.length > 0 && (
              <div className="tab-overflow" ref={overflowMenuRef}>
                <button
                  className="tab tab-overflow-trigger"
                  onClick={() => setIsOverflowMenuOpen((previous) => !previous)}
                  title="更多版本"
                >
                  ▾
                </button>
                {isOverflowMenuOpen && (
                  <ul className="tab-overflow-menu">
                    {overflowVersions.map((version) => (
                      <li key={version.id}>
                        <button
                          className={`tab-overflow-item ${version.id === activeChapter?.activeVersionId ? 'active' : ''}`}
                          onClick={() => {
                            switchVersion(version.id)
                            setIsOverflowMenuOpen(false)
                          }}
                        >
                          {version.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="tab-measure-row" aria-hidden="true">
            {chapterVersions.map((version) => (
              <span
                key={version.id}
                className="tab version-tab tab-measure"
                ref={(node) => {
                  versionMeasureRefs.current[version.id] = node
                }}
              >
                <span className="tab-label">{version.title}</span>
                {canDeleteVersion && <span className="tab-close">x</span>}
              </span>
            ))}
          </div>
        </div>

        <div className="workspace">
          <section className="editor-pane" aria-label="正文编辑器" ref={editorPaneRef}>
            <div className="editor-toolbar">
              <div className="editor-toolbar-main">
                <span>正文</span>
                <div className="editor-version-row">
                  <strong>
                    {activeChapter?.title ?? '第1章'} / {activeVersion?.title ?? '版本1'}
                  </strong>
                  <span className="editor-version-divider" aria-hidden="true" />
                  <div className="editor-version-actions">
                    <button
                      className={`version-history-button ${isVersionHistoryOpen ? 'active' : ''}`}
                      type="button"
                      onClick={() => setIsVersionHistoryOpen((previous) => !previous)}
                      title="查看历史版本"
                      aria-label="查看历史版本"
                    >
                      👁
                    </button>
                    <div className="writing-mode-switch" role="group" aria-label="写作模式">
                      <button
                        className={writingMode === 'novel' ? 'active' : ''}
                        type="button"
                        onClick={() => {
                          setActiveVersionMode('novel')
                          setStatus('已切换到小说模式')
                        }}
                      >
                        小说模式
                      </button>
                      <button
                        className={writingMode === 'script' ? 'active' : ''}
                        type="button"
                        onClick={() => {
                          setActiveVersionMode('script')
                          syncScriptRolesToMemory(currentDraft)
                          setStatus('已切换到剧本模式')
                        }}
                      >
                        剧本模式
                      </button>
                    </div>
                  </div>
                </div>
                {activeVersion?.updatedAt ? (
                  <span className="version-inline-time">{`最后修改时间：${activeVersion.updatedAt}`}</span>
                ) : null}
                <small className="version-updated-at">
                  {`最后修改 ${activeVersion?.updatedAt ?? '--'}`}
                </small>
              </div>
              <dl>
                <div>
                  <dt>字数</dt>
                  <dd>{counts.chars}</dd>
                </div>
                <div>
                  <dt>行数</dt>
                  <dd>{counts.lines}</dd>
                </div>
                <div>
                  <dt>版本</dt>
                  <dd>{counts.versions}</dd>
                </div>
                <div>
                  <dt>记忆</dt>
                  <dd>{counts.memories}</dd>
                </div>
                <div>
                  <dt>参考</dt>
                  <dd>{counts.backups}</dd>
                </div>
              </dl>
            </div>

            {isVersionHistoryOpen && (
              <div
                className="version-history-overlay"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) setIsVersionHistoryOpen(false)
                }}
              >
                <div className="version-history-panel" onMouseDown={(event) => event.stopPropagation()}>
                  <header>
                    <strong>
                      历史版本：{activeChapter?.title ?? '第1章'} / {activeVersion?.title ?? '版本1'}
                    </strong>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => setIsVersionHistoryOpen(false)}
                    >
                      关闭
                    </button>
                  </header>
                  <p>仅自动保存当前正在编辑的版本，每 4 小时保存一次，最多保留 10 条。</p>
                  {orderedVersionHistory.length > 0 ? (
                    <>
                      <ul className="version-history-list">
                        {orderedVersionHistory.map((item) => (
                          <li key={item.id}>
                            <button
                              className={selectedHistoryItem?.id === item.id ? 'active' : ''}
                              type="button"
                              onClick={() => setSelectedHistoryId(item.id)}
                            >
                              <strong>{item.createdAt}</strong>
                              <span>{item.draft.slice(0, 70) || '（空内容）'}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      <textarea
                        className="version-history-preview"
                        readOnly
                        value={selectedHistoryItem?.draft ?? ''}
                      />
                    </>
                  ) : (
                    <p className="empty-tip">暂无历史版本</p>
                  )}
                </div>
              </div>
            )}

            <div className="code-editor">
              <MonacoEditor
                language="plaintext"
                value={currentDraft}
                onChange={(value) => updateActiveDraft(value ?? '')}
                onMount={handleEditorMount}
                theme={EDITOR_THEME_ID}
                height="100%"
                options={{
                  contextmenu: false,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  glyphMargin: false,
                  folding: false,
                  lineNumbers: 'on',
                  lineNumbersMinChars: 3,
                  lineDecorationsWidth: 16,
                  renderLineHighlight: 'none',
                  fontSize: 22,
                  lineHeight: 34,
                  wordWrap: 'on',
                  padding: { top: 10, bottom: 14 },
                  automaticLayout: true,
                  overviewRulerLanes: 0
                }}
              />
            </div>

            <footer className="command-strip">
              {isModelBusy ? (
                <div className="command-strip-status">
                  {assistantRunning
                    ? '小助手思考中，请稍后再执行扩写/润色....'
                    : connectionState === 'checking'
                    ? '模型启动中，请稍后在输出面板查看....'
                    : '模型生成中，请稍后在输出面板查看....'}
                </div>
              ) : (
                actions.map((action) => (
                  <button
                    disabled={!canRunSelectionActions || assistantRunning}
                    key={action.key}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void runAction(action)}
                    title={action.short}
                  >
                    <kbd>{action.hotkey}</kbd>
                    {action.title}
                  </button>
                ))
              )}
            </footer>

            <button
              className="assistant-entry-button"
              onClick={openAssistantDialog}
              title="写作小助手"
              type="button"
            >
              <img alt="写作小助手" src={aiBlotIcon} />
            </button>

            {assistantOpen && (
              <div
                className="assistant-chat-panel"
                ref={assistantDialogRef}
                style={{ left: assistantDialogPos.x, top: assistantDialogPos.y }}
              >
                <header className="assistant-chat-header" onMouseDown={startAssistantDialogDrag}>
                  <strong>写作小助手</strong>
                  <button
                    className="assistant-chat-close"
                    onClick={() => setAssistantOpen(false)}
                    title="关闭"
                    aria-label="关闭写作小助手"
                    type="button"
                  >
                    ×
                  </button>
                </header>
                <div className="assistant-chat-messages" ref={assistantMessagesViewportRef}>
                  {assistantMessages.length === 0 ? (
                    <p className="assistant-chat-empty">
                      仅对当前版本有效，可对剧本做整体修改（比如让本章剧情更曲折、让本章篇幅更简洁等），局部修改使用润色、扩写等功能效果更好。
                    </p>
                  ) : (
                    assistantMessages.map((item) => (
                      <div
                        className={`assistant-chat-bubble ${item.role === 'user' ? 'is-user' : 'is-assistant'}`}
                        key={item.id}
                      >
                        <p>{item.content}</p>
                        <small>{item.createdAt}</small>
                      </div>
                    ))
                  )}
                  {assistantRunning && (
                    <div className="assistant-chat-bubble is-assistant is-thinking">
                      <p>正在思考...</p>
                      {assistantProgressLogs.length > 0 ? (
                        <ul className="assistant-thinking-steps">
                          {assistantProgressLogs.map((line, index) => (
                            <li key={`${index}-${line}`}>{line}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  )}
                </div>
                <div className="assistant-chat-input-row">
                  <textarea
                    placeholder="例如：把主角的语气改得更冷一点，但不要改剧情走向。"
                    value={assistantInput}
                    onChange={(event) => setAssistantInput(event.target.value)}
                    onKeyDown={handleAssistantInputKeyDown}
                  />
                  <button
                    className={`primary-button assistant-chat-send${
                      isModelUnavailable ? ' is-unavailable' : ''
                    }`}
                    disabled={assistantSendDisabled}
                    onClick={() => void sendAssistantMessage()}
                    type="button"
                  >
                    {assistantSendLoading ? (
                      <span className="assistant-chat-send-content">
                        <span className="assistant-chat-send-spinner" aria-hidden="true" />
                        <span>{assistantSendLabel}</span>
                      </span>
                    ) : (
                      assistantSendLabel
                    )}
                  </button>
                </div>
              </div>
            )}
          </section>

          <aside className="side-pane" aria-label="辅助面板">
            <div className="panel-tabs">
              <button
                className={activePanel === 'memory' ? 'active' : ''}
                onClick={() => setActivePanel('memory')}
              >
                记忆
              </button>
              <button
                className={activePanel === 'backup' ? 'active' : ''}
                onClick={() => setActivePanel('backup')}
              >
                参考
              </button>
              <button
                className={activePanel === 'settings' ? 'active' : ''}
                onClick={() => setActivePanel('settings')}
              >
                API
              </button>
              <button
                className={activePanel === 'skills' ? 'active' : ''}
                onClick={() => setActivePanel('skills')}
              >
                Skills
              </button>
              <button
                className={activePanel === 'result' ? 'active' : ''}
                onClick={() => setActivePanel('result')}
              >
                输出
              </button>
            </div>

            {activePanel === 'memory' && (
              <section className="panel-section">
                <div className="paper-heading">
                  <p>记忆</p>
                  <h2>共享记忆库</h2>
                </div>
                <p className="panel-note-tip">
                  信息记忆会在每次生成时附加给模型；角色模块用于统一管理出场角色。
                </p>
                <div className="memory-module-tabs">
                  <button
                    className={memoryModule === 'info' ? 'active' : ''}
                    type="button"
                    onClick={() => setMemoryModule('info')}
                  >
                    信息记忆
                  </button>
                  <button
                    className={memoryModule === 'role' ? 'active' : ''}
                    type="button"
                    onClick={() => setMemoryModule('role')}
                  >
                    角色
                  </button>
                </div>
                {memoryModule === 'role' && (
                  <div className="memory-view-row">
                    <div className="memory-view-tabs">
                      <button
                        className={roleGraphView === 'list' ? 'active' : ''}
                        type="button"
                        onClick={() => setRoleGraphView('list')}
                      >
                        列表
                      </button>
                      <button
                        className={roleGraphView === 'graph' ? 'active' : ''}
                        type="button"
                        onClick={() => setRoleGraphView('graph')}
                      >
                        脑图
                      </button>
                    </div>
                  </div>
                )}
                <div className="memory-search-row">
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      const input = document.getElementById('memory-search-input')
                      if (input instanceof HTMLInputElement) input.focus()
                    }}
                  >
                    搜索
                  </button>
                  <div className="memory-search-input-wrap">
                    <input
                      id="memory-search-input"
                      className="memory-search-input"
                      type="text"
                      value={memorySearchQuery}
                      onChange={(event) => setMemorySearchQuery(event.target.value)}
                      placeholder={
                        memoryModule === 'role'
                          ? '输入关键词实时搜索角色'
                          : '输入关键词实时搜索信息记忆'
                      }
                    />
                    {memorySearchQuery.trim() ? (
                      <button
                        aria-label="清空搜索"
                        className="memory-search-clear"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setMemorySearchQuery('')
                          const input = document.getElementById('memory-search-input')
                          if (input instanceof HTMLInputElement) input.focus()
                        }}
                        type="button"
                      >
                        x
                      </button>
                    ) : null}
                  </div>
                </div>
                {memoryModule === 'role' && roleGraphView === 'graph' ? (
                  <div
                    className={`role-graph-board${isRoleGraphSpacePressed ? ' is-space' : ''}${isRoleGraphPanning ? ' is-panning' : ''}`}
                    onMouseDown={beginRoleGraphPan}
                    onMouseMove={handleRoleGraphMouseMove}
                    onMouseUp={handleRoleGraphMouseUp}
                    onDoubleClick={handleRoleGraphDoubleClick}
                    onWheel={handleRoleGraphWheel}
                    onAuxClick={(event) => {
                      if (event.button === 1) event.preventDefault()
                    }}
                    onContextMenu={(event) => {
                      const target = event.target
                      if (
                        target instanceof Element &&
                        target.closest('.role-graph-node, .role-graph-edge, .role-relation-menu, .role-node-menu')
                      ) {
                        return
                      }
                      if (roleRelationMenu.open || roleNodeMenu.open) {
                        event.preventDefault()
                        setRoleRelationMenu({ open: false, x: 0, y: 0, relationId: null })
                        setRoleNodeMenu({ open: false, x: 0, y: 0, roleId: null })
                      }
                    }}
                    ref={roleGraphBoardRef}
                    style={roleGraphBoardStyle}
                  >
                    {isRoleGraphBoardFullscreen && (
                      <button
                        className="text-button role-graph-exit-button"
                        onClick={() => void toggleRoleGraphFullscreen()}
                        type="button"
                      >
                        退出全屏
                      </button>
                    )}
                    <div className="role-graph-viewport" style={roleGraphViewportStyle}>
                      <svg className="role-graph-lines" width="100%" height="100%">
                        <defs>
                          <marker
                            id="role-graph-arrowhead"
                            viewBox="0 0 10 10"
                            refX="9"
                            refY="5"
                            markerWidth="7"
                            markerHeight="7"
                            orient="auto-start-reverse"
                          >
                            <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" stroke="context-stroke" />
                          </marker>
                        </defs>
                        {visibleRoleRelations.map((relation) => {
                          const geometry = getRoleRelationGeometry(relation)
                          if (!geometry) return null
                          const relationMode = parseRoleRelationMode(relation.mode)
                          const dashed = isRoleRelationDashed(relationMode)
                          const bidirectional = isRoleRelationBidirectional(relationMode)
                          const relationStrokeColor = normalizeRelationColor(
                            relation.strokeColor,
                            DEFAULT_ROLE_RELATION_STROKE_COLOR
                          )
                          const relationHovered =
                            hoveredRoleRelationId === relation.id ||
                            draggingRoleRelationCurve?.relationId === relation.id
                          const relationIsDirectFocus =
                            focusedRoleId !== null &&
                            (relation.fromMemoryId === focusedRoleId ||
                              relation.toMemoryId === focusedRoleId)
                          return (
                            <g
                              key={relation.id}
                              className={`role-graph-edge${relationHovered ? ' is-hovered' : ''}${draggingRoleRelationCurve?.relationId === relation.id ? ' is-dragging' : ''}${shouldDimRoleGraph && !relationIsDirectFocus ? ' is-dimmed' : ''}`}
                              onMouseEnter={() => setHoveredRoleRelationId(relation.id)}
                              onMouseLeave={() =>
                                setHoveredRoleRelationId((previous) =>
                                  previous === relation.id ? null : previous
                                )
                              }
                            >
                              <path
                                className="role-graph-edge-path"
                                d={geometry.path}
                                style={{ stroke: relationStrokeColor }}
                                strokeDasharray={dashed ? '6 4' : undefined}
                                markerEnd="url(#role-graph-arrowhead)"
                                markerStart={bidirectional ? 'url(#role-graph-arrowhead)' : undefined}
                                onDoubleClick={() => editRoleRelation(relation.id)}
                                onContextMenu={(event) =>
                                  openRoleRelationContextMenu(event, relation.id)
                                }
                              />
                              <circle
                                className="role-graph-edge-handle"
                                cx={geometry.curveMidPoint.x}
                                cy={geometry.curveMidPoint.y}
                                style={{ stroke: relationStrokeColor }}
                                onMouseDown={(event) => beginRoleRelationCurveDrag(event, relation.id)}
                                r={9}
                              />
                              <text
                                x={geometry.curveMidPoint.x}
                                y={geometry.curveMidPoint.y - 12}
                                onDoubleClick={() => editRoleRelation(relation.id)}
                                onContextMenu={(event) => openRoleRelationContextMenu(event, relation.id)}
                              >
                                {getRoleRelationDisplayText(relation)}
                              </text>
                            </g>
                          )
                        })}
                        {roleLinkStart !== null && roleLinkPreview ? (
                          (() => {
                            const startPos = visibleRolePositionById.get(roleLinkStart.roleId)
                            if (!startPos) return null
                            const startPoint = getRoleSidePoint(startPos, roleLinkStart.side)
                            const previewDashed = isRoleRelationDashed(roleLinkStart.mode)
                            const previewBidirectional = isRoleRelationBidirectional(roleLinkStart.mode)
                            return (
                              <line
                                className="role-graph-preview-line"
                                x1={startPoint.x}
                                y1={startPoint.y}
                                x2={roleLinkPreview.x}
                                y2={roleLinkPreview.y}
                                strokeDasharray={previewDashed ? '6 4' : undefined}
                                markerEnd="url(#role-graph-arrowhead)"
                                markerStart={
                                  previewBidirectional ? 'url(#role-graph-arrowhead)' : undefined
                                }
                                style={{
                                  stroke: normalizeRelationColor(
                                    activeRoleRelationStrokeColor,
                                    DEFAULT_ROLE_RELATION_STROKE_COLOR
                                  )
                                }}
                              />
                            )
                          })()
                        ) : null}
                      </svg>
                      {roleSelectionBounds && (
                        <div
                          className="role-graph-selection-box"
                          style={{
                            left: roleSelectionBounds.minX,
                            top: roleSelectionBounds.minY,
                            width: roleSelectionBounds.width,
                            height: roleSelectionBounds.height
                          }}
                        />
                      )}
                      {visibleRoleMemory.map((item, index) => {
                        const position = visibleRolePositionById.get(item.id) ?? getRoleNodePosition(item, index)
                        const roleName = getRoleName(item)
                        const roleNote = getRoleNote(item)
                        const roleStance = getRoleStance(item)
                        const roleEmoji = getRoleStanceEmoji(roleStance)
                        const roleNodeToneStyle = getRoleNodeToneStyle(roleStance)
                        const showHandles =
                          hoveredRoleId === item.id || roleLinkStart?.roleId === item.id
                        const isDirectRoleNode =
                          !shouldDimRoleGraph || directlyConnectedRoleIds.has(item.id)
                        const linkTargetForNode =
                          roleLinkStart !== null && roleLinkTarget?.roleId === item.id
                            ? roleLinkTarget
                            : null
                        return (
                          <article
                            className={`role-graph-node ${draggingRoleId === item.id ? 'dragging' : ''}${showHandles ? ' show-handles' : ''}${selectedRoleIds.has(item.id) ? ' selected' : ''}${!isDirectRoleNode ? ' is-dimmed' : ''}`}
                            data-role-id={item.id}
                            key={item.id}
                            onMouseDown={(event) => beginRoleDrag(event, item.id)}
                            onContextMenu={(event) => openRoleNodeContextMenu(event, item.id)}
                            onDoubleClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              openRoleEditor(item)
                            }}
                            onMouseEnter={() => setHoveredRoleId(item.id)}
                            onMouseLeave={() =>
                              setHoveredRoleId((previous) => (previous === item.id ? null : previous))
                            }
                            style={{
                              left: position.x,
                              top: position.y,
                              ...roleNodeToneStyle
                            }}
                          >
                            {ROLE_LINK_SIDES.map((side) => (
                              <button
                                className={`role-link-handle side-${side}`}
                                key={side}
                                onMouseDown={(event) => beginRoleLink(event, item.id, side)}
                                title={`拖动建立${getRoleRelationModeText(activeRoleRelationMode)}关系`}
                                type="button"
                              >
                                ●
                              </button>
                            ))}
                            {showHandles && (
                              <div className="role-link-mode-picker" onMouseDown={(event) => event.stopPropagation()}>
                                {ROLE_RELATION_MODE_OPTIONS.map((option) => (
                                  <button
                                    className={`role-link-mode-option${activeRoleRelationMode === option.mode ? ' active' : ''}`}
                                    key={option.mode}
                                    onClick={(event) => {
                                      event.preventDefault()
                                      event.stopPropagation()
                                      setActiveRoleRelationMode(option.mode)
                                    }}
                                    title={option.label}
                                    type="button"
                                  >
                                    {option.icon}
                                  </button>
                                ))}
                                <label className="relation-color-control" title="线条颜色">
                                  <input
                                    className="relation-color-input"
                                    type="color"
                                    aria-label="线条颜色"
                                    value={activeRoleRelationStrokeColor}
                                    onChange={(event) => {
                                      event.stopPropagation()
                                      setActiveRoleRelationStrokeColor(event.target.value)
                                    }}
                                  />
                                </label>
                              </div>
                            )}
                            {linkTargetForNode && (
                              <span
                                className={`role-link-target-indicator side-${linkTargetForNode.side}`}
                              >
                                ●
                              </span>
                            )}
                            <span className="role-node-stance-emoji" title={`立场：${roleStance}/10`}>
                              {roleEmoji}
                            </span>
                            <h4
                              onDoubleClick={() => openRoleEditor(item)}
                              title="双击编辑角色信息"
                            >
                              {roleName}
                            </h4>
                            <p>{roleNote || '双击名称编辑名称、备注与立场'}</p>
                            <small>{`立场 ${roleStance}/10 · ${getRoleStanceLabel(roleStance)}`}</small>
                          </article>
                        )
                      })}
                    </div>
                    <button
                      className="role-graph-corner-fullscreen"
                      onClick={() => void toggleRoleGraphFullscreen()}
                      title={isRoleGraphBoardFullscreen ? '退出全屏' : '全屏'}
                      type="button"
                    >
                      {isRoleGraphBoardFullscreen ? '⤡' : '⛶'}
                    </button>
                    <button
                      className="text-button role-graph-visual-button"
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        setIsRoleGraphVisualDialogOpen((previous) => !previous)
                      }}
                      title="脑图视觉设置"
                      type="button"
                    >
                      ⚙
                    </button>
                    {isRoleGraphVisualDialogOpen && (
                      <div
                        className="graph-visual-panel"
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                        <h4>脑图设置</h4>
                        <label>
                          <span>背景色</span>
                          <input
                            aria-label="角色脑图背景色"
                            type="color"
                            value={roleGraphVisual.backgroundColor}
                            onChange={(event) =>
                              setRoleGraphVisual((previous) => ({
                                ...previous,
                                backgroundColor: normalizeRelationColor(
                                  event.target.value,
                                  DEFAULT_ROLE_GRAPH_BG_COLOR
                                )
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>{`字体大小 ${roleGraphVisual.fontSize}px`}</span>
                          <div className="graph-visual-size-row">
                            <input
                              aria-label="角色脑图字体大小滑杆"
                              max={GRAPH_FONT_SIZE_MAX}
                              min={GRAPH_FONT_SIZE_MIN}
                              type="range"
                              value={roleGraphVisual.fontSize}
                              onChange={(event) => {
                                const nextSize = clampNumber(
                                  Number(event.target.value) || DEFAULT_GRAPH_FONT_SIZE,
                                  GRAPH_FONT_SIZE_MIN,
                                  GRAPH_FONT_SIZE_MAX
                                )
                                setRoleGraphVisual((previous) => ({
                                  ...previous,
                                  fontSize: Math.round(nextSize)
                                }))
                              }}
                            />
                            <input
                              aria-label="角色脑图字体大小数值"
                              max={GRAPH_FONT_SIZE_MAX}
                              min={GRAPH_FONT_SIZE_MIN}
                              type="number"
                              value={roleGraphVisual.fontSize}
                              onChange={(event) => {
                                const nextSize = clampNumber(
                                  Number(event.target.value) || DEFAULT_GRAPH_FONT_SIZE,
                                  GRAPH_FONT_SIZE_MIN,
                                  GRAPH_FONT_SIZE_MAX
                                )
                                setRoleGraphVisual((previous) => ({
                                  ...previous,
                                  fontSize: Math.round(nextSize)
                                }))
                              }}
                            />
                          </div>
                        </label>
                        <label>
                          <span>{`弱化透明度 ${roleGraphVisual.dimmedOpacity.toFixed(2)}`}</span>
                          <div className="graph-visual-size-row">
                            <input
                              aria-label="角色脑图弱化透明度滑杆"
                              max={GRAPH_DIMMED_OPACITY_MAX}
                              min={GRAPH_DIMMED_OPACITY_MIN}
                              step={0.01}
                              type="range"
                              value={roleGraphVisual.dimmedOpacity}
                              onChange={(event) => {
                                const nextOpacity = clampNumber(
                                  Number(event.target.value) || DEFAULT_GRAPH_DIMMED_OPACITY,
                                  GRAPH_DIMMED_OPACITY_MIN,
                                  GRAPH_DIMMED_OPACITY_MAX
                                )
                                setRoleGraphVisual((previous) => ({
                                  ...previous,
                                  dimmedOpacity: Math.round(nextOpacity * 100) / 100
                                }))
                              }}
                            />
                            <input
                              aria-label="角色脑图弱化透明度数值"
                              max={GRAPH_DIMMED_OPACITY_MAX}
                              min={GRAPH_DIMMED_OPACITY_MIN}
                              step={0.01}
                              type="number"
                              value={roleGraphVisual.dimmedOpacity}
                              onChange={(event) => {
                                const nextOpacity = clampNumber(
                                  Number(event.target.value) || DEFAULT_GRAPH_DIMMED_OPACITY,
                                  GRAPH_DIMMED_OPACITY_MIN,
                                  GRAPH_DIMMED_OPACITY_MAX
                                )
                                setRoleGraphVisual((previous) => ({
                                  ...previous,
                                  dimmedOpacity: Math.round(nextOpacity * 100) / 100
                                }))
                              }}
                            />
                          </div>
                        </label>
                        <div className="graph-visual-actions">
                          <button
                            className="text-button"
                            type="button"
                            onClick={() =>
                              setRoleGraphVisual({
                                backgroundColor: DEFAULT_ROLE_GRAPH_BG_COLOR,
                                fontSize: DEFAULT_GRAPH_FONT_SIZE,
                                dimmedOpacity: DEFAULT_GRAPH_DIMMED_OPACITY
                              })
                            }
                          >
                            重置
                          </button>
                          <button
                            className="text-button"
                            type="button"
                            onClick={() => setIsRoleGraphVisualDialogOpen(false)}
                          >
                            关闭
                          </button>
                        </div>
                      </div>
                    )}
                    {roleRelationMenu.open && roleRelationMenu.relationId !== null && (
                      <div
                        className="editor-context-menu role-relation-menu"
                        ref={roleRelationMenuRef}
                        style={{ left: roleRelationMenu.x, top: roleRelationMenu.y }}
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                        <button
                          className="editor-context-item"
                          onClick={(event) => {
                            event.stopPropagation()
                            editRoleRelation(roleRelationMenu.relationId as number)
                          }}
                          type="button"
                        >
                          重命名
                        </button>
                        <button
                          className="editor-context-item"
                          onClick={(event) => {
                            event.stopPropagation()
                            removeRoleRelation(roleRelationMenu.relationId as number)
                          }}
                          type="button"
                        >
                          删除
                        </button>
                      </div>
                    )}
                    {roleNodeMenu.open && roleNodeMenu.roleId !== null && (
                      <div
                        className="editor-context-menu role-node-menu"
                        onMouseDown={(event) => event.stopPropagation()}
                        ref={roleNodeMenuRef}
                        style={{ left: roleNodeMenu.x, top: roleNodeMenu.y }}
                      >
                        <button
                          className="editor-context-item"
                          onClick={(event) => {
                            event.stopPropagation()
                            const targetRoleId = roleNodeMenu.roleId as number
                            const nextIds = selectedRoleIds.has(targetRoleId)
                              ? Array.from(selectedRoleIds)
                              : [targetRoleId]
                            deleteRoleMemories(nextIds)
                            setRoleNodeMenu({ open: false, x: 0, y: 0, roleId: null })
                          }}
                          type="button"
                        >
                          {selectedRoleIds.size > 1 && selectedRoleIds.has(roleNodeMenu.roleId)
                            ? `删除已选角色（${selectedRoleIds.size}）`
                            : '删除角色'}
                        </button>
                      </div>
                    )}
                    {isRoleGraphBoardFullscreen ? (
                      <>
                        <div className="role-graph-help">
                          滚轮缩放 · 中键或空格+拖动平移 · 拖拽框选多选 · Delete 删除角色 · 双击空白新增角色 · 双击节点/连线编辑 · 拖动连线中点可弯曲
                        </div>
                        <aside className="role-graph-ai-preview">
                          <h4>AI 可见关系预览</h4>
                          {roleRelationPreviewLines.length > 0 ? (
                            <ul>
                              {roleRelationPreviewLines.map((line, index) => (
                                <li key={`${index}-${line.slice(0, 12)}`}>{line}</li>
                              ))}
                            </ul>
                          ) : (
                            <p>暂无关系。建立连线后会在这里实时展示模型可见关系描述。</p>
                          )}
                        </aside>
                      </>
                    ) : null}
                    {shouldRenderRoleDialogsInsideGraph && roleEditorDialog && (
                      <div
                        className="role-editor-modal-backdrop role-editor-modal-backdrop--inside-graph"
                        onMouseDown={(event) => {
                          if (event.target === event.currentTarget) closeRoleEditor()
                        }}
                      >
                        <div className="role-editor-modal" onMouseDown={(event) => event.stopPropagation()}>
                          <h3>编辑角色</h3>
                          <label>
                            <span>名称</span>
                            <input
                              autoFocus
                              type="text"
                              value={roleEditorDialog.roleName}
                              onChange={(event) =>
                                setRoleEditorDialog((previous) =>
                                  previous
                                    ? {
                                        ...previous,
                                        roleName: event.target.value
                                      }
                                    : previous
                                )
                              }
                            />
                          </label>
                          <label>
                            <span>备注</span>
                            <textarea
                              value={roleEditorDialog.roleNote}
                              onChange={(event) =>
                                setRoleEditorDialog((previous) =>
                                  previous
                                    ? {
                                        ...previous,
                                        roleNote: event.target.value
                                      }
                                    : previous
                                )
                              }
                            />
                          </label>
                          <label>
                            <span>{`立场 ${roleEditorDialog.roleStance}/10（${getRoleStanceLabel(roleEditorDialog.roleStance)}）`}</span>
                            <input
                              type="range"
                              min={1}
                              max={10}
                              step={1}
                              value={roleEditorDialog.roleStance}
                              onChange={(event) =>
                                setRoleEditorDialog((previous) =>
                                  previous
                                    ? {
                                        ...previous,
                                        roleStance: Number(event.target.value)
                                      }
                                    : previous
                                )
                              }
                            />
                          </label>
                          <div className="role-editor-actions">
                            <button className="text-button" type="button" onClick={closeRoleEditor}>
                              取消
                            </button>
                            <button className="primary-button" type="button" onClick={commitRoleEditor}>
                              保存
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    {shouldRenderRoleDialogsInsideGraph && roleRelationEditorDialog && (
                      <div
                        className="role-editor-modal-backdrop role-editor-modal-backdrop--inside-graph"
                        onMouseDown={(event) => {
                          if (event.target === event.currentTarget) closeRoleRelationEditor()
                        }}
                      >
                        <div className="role-editor-modal" onMouseDown={(event) => event.stopPropagation()}>
                          <h3>编辑角色关系</h3>
                          <label>
                            <span>{`亲密度 ${roleRelationEditorDialog.intimacy}（${getRoleIntimacyLabel(roleRelationEditorDialog.intimacy)}）`}</span>
                            <input
                              type="range"
                              min={ROLE_RELATION_MIN_INTIMACY}
                              max={ROLE_RELATION_MAX_INTIMACY}
                              step={1}
                              value={roleRelationEditorDialog.intimacy}
                              onChange={(event) =>
                                setRoleRelationEditorDialog((previous) =>
                                  previous
                                    ? {
                                        ...previous,
                                        intimacy: Number(event.target.value)
                                      }
                                    : previous
                                )
                              }
                            />
                          </label>
                          <label>
                            <span>关系标签（可自定义）</span>
                            <input
                              autoFocus
                              type="text"
                              value={roleRelationEditorDialog.tagsInput}
                              onChange={(event) =>
                                setRoleRelationEditorDialog((previous) =>
                                  previous
                                    ? {
                                        ...previous,
                                        tagsInput: event.target.value
                                      }
                                    : previous
                                )
                              }
                              onKeyDown={handleRoleRelationTagsInputKeyDown}
                              placeholder="多个标签用逗号分隔"
                            />
                            <div className="role-relation-tag-suggestions">
                              {roleRelationTagOptions.map((tag) => (
                                <button
                                  key={tag}
                                  className="text-button"
                                  type="button"
                                  onClick={() =>
                                    setRoleRelationEditorDialog((previous) => {
                                      if (!previous) return previous
                                      const tags = splitRelationTags(previous.tagsInput)
                                      if (tags.includes(tag)) return previous
                                      return {
                                        ...previous,
                                        tagsInput: [...tags, tag].join('、')
                                      }
                                    })
                                  }
                                >
                                  {tag}
                                </button>
                              ))}
                            </div>
                          </label>
                          <div className="role-editor-actions">
                            <button className="text-button" type="button" onClick={closeRoleRelationEditor}>
                              取消
                            </button>
                            <button className="primary-button" type="button" onClick={commitRoleRelationEditor}>
                              保存
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <ul className="memory-list">
                    {filteredMemory.map((item, index) => (
                      <li
                        key={item.id}
                        onClick={(event) => {
                          if (event.detail > 1) return
                          if (memoryModule === 'role') {
                            openRoleRelationsPanel(item.id, 'memory-card')
                            return
                          }
                          jumpToMemory(item)
                        }}
                      >
                        <span>{index + 1}</span>
                        <div className="memory-content">
                          {memoryModule === 'role' ? (
                            <div className="role-memory-card role-memory-card--jumpable">
                              <strong
                                className="role-memory-card-name"
                                onDoubleClick={() => openRoleEditor(item)}
                                title="双击编辑角色信息"
                              >
                                {getRoleName(item)}
                              </strong>
                            </div>
                          ) : (
                            <>
                              <button
                                className="memory-jump"
                                onClick={(event) => {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  jumpToMemory(item)
                                }}
                              >
                                {item.chapterTitle} / {item.versionTitle}
                                <em>信息</em>
                              </button>
                              <textarea
                                value={item.text}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => {
                                  setMemory((previous) =>
                                    previous.map((memoryItem) =>
                                      memoryItem.id === item.id
                                        ? { ...memoryItem, text: event.target.value }
                                        : memoryItem
                                    )
                                  )
                                }}
                              />
                            </>
                          )}
                        </div>
                        <button
                          className="memory-delete"
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            setMemory((previous) =>
                              previous.filter((memoryItem) => memoryItem.id !== item.id)
                            )
                          }}
                        >
                          x
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!filteredMemory.length && (
                  <p className="empty-tip">
                    {memorySearchQuery.trim()
                      ? memoryModule === 'role'
                        ? '没有匹配的角色。'
                        : '没有匹配的信息记忆。'
                      : memoryModule === 'role'
                        ? '暂无角色。'
                        : '暂无信息记忆。'}
                  </p>
                )}
                <button
                  className="text-button"
                  onClick={() => appendMemoryItem(memoryModule)}
                >
                  {memoryModule === 'role' ? '新增角色' : '新增记忆'}
                </button>
                {!shouldRenderRoleDialogsInsideGraph && roleEditorDialog && (
                  <div
                    className="role-editor-modal-backdrop"
                    onMouseDown={(event) => {
                      if (event.target === event.currentTarget) closeRoleEditor()
                    }}
                  >
                    <div className="role-editor-modal" onMouseDown={(event) => event.stopPropagation()}>
                      <h3>编辑角色</h3>
                      <label>
                        <span>名称</span>
                        <input
                          autoFocus
                          type="text"
                          value={roleEditorDialog.roleName}
                          onChange={(event) =>
                            setRoleEditorDialog((previous) =>
                              previous
                                ? {
                                    ...previous,
                                    roleName: event.target.value
                                  }
                                : previous
                            )
                          }
                        />
                      </label>
                      <label>
                        <span>备注</span>
                        <textarea
                          value={roleEditorDialog.roleNote}
                          onChange={(event) =>
                            setRoleEditorDialog((previous) =>
                              previous
                                ? {
                                    ...previous,
                                    roleNote: event.target.value
                                  }
                                : previous
                            )
                          }
                        />
                      </label>
                      <label>
                        <span>{`立场 ${roleEditorDialog.roleStance}/10（${getRoleStanceLabel(roleEditorDialog.roleStance)}）`}</span>
                        <input
                          type="range"
                          min={1}
                          max={10}
                          step={1}
                          value={roleEditorDialog.roleStance}
                          onChange={(event) =>
                            setRoleEditorDialog((previous) =>
                              previous
                                ? {
                                    ...previous,
                                    roleStance: Number(event.target.value)
                                  }
                                : previous
                            )
                          }
                        />
                      </label>
                      <div className="role-editor-actions">
                        <button className="text-button" type="button" onClick={closeRoleEditor}>
                          取消
                        </button>
                        <button className="primary-button" type="button" onClick={commitRoleEditor}>
                          保存
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {!shouldRenderRoleDialogsInsideGraph && roleRelationEditorDialog && (
                  <div
                    className="role-editor-modal-backdrop"
                    onMouseDown={(event) => {
                      if (event.target === event.currentTarget) closeRoleRelationEditor()
                    }}
                  >
                    <div className="role-editor-modal" onMouseDown={(event) => event.stopPropagation()}>
                      <h3>编辑角色关系</h3>
                      <label>
                        <span>{`亲密度 ${roleRelationEditorDialog.intimacy}（${getRoleIntimacyLabel(roleRelationEditorDialog.intimacy)}）`}</span>
                        <input
                          type="range"
                          min={ROLE_RELATION_MIN_INTIMACY}
                          max={ROLE_RELATION_MAX_INTIMACY}
                          step={1}
                          value={roleRelationEditorDialog.intimacy}
                          onChange={(event) =>
                            setRoleRelationEditorDialog((previous) =>
                              previous
                                ? {
                                    ...previous,
                                    intimacy: Number(event.target.value)
                                  }
                                : previous
                            )
                          }
                        />
                      </label>
                      <label>
                        <span>关系标签（可自定义）</span>
                        <input
                          autoFocus
                          type="text"
                          value={roleRelationEditorDialog.tagsInput}
                          onChange={(event) =>
                            setRoleRelationEditorDialog((previous) =>
                              previous
                                ? {
                                    ...previous,
                                    tagsInput: event.target.value
                                  }
                                : previous
                            )
                          }
                          onKeyDown={handleRoleRelationTagsInputKeyDown}
                          placeholder="多个标签用逗号分隔"
                        />
                        <div className="role-relation-tag-suggestions">
                          {roleRelationTagOptions.map((tag) => (
                            <button
                              key={tag}
                              className="text-button"
                              type="button"
                              onClick={() =>
                                setRoleRelationEditorDialog((previous) => {
                                  if (!previous) return previous
                                  const tags = splitRelationTags(previous.tagsInput)
                                  if (tags.includes(tag)) return previous
                                  return {
                                    ...previous,
                                    tagsInput: [...tags, tag].join('、')
                                  }
                                })
                              }
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </label>
                      <div className="role-editor-actions">
                        <button className="text-button" type="button" onClick={closeRoleRelationEditor}>
                          取消
                        </button>
                        <button className="primary-button" type="button" onClick={commitRoleRelationEditor}>
                          保存
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}

            {activePanel === 'backup' && (
              <section className="panel-section">
                <div className="paper-heading">
                  <p>参考</p>
                  <h2>共享参考库</h2>
                </div>
                <p className="backup-note-tip">仅用于写作参考，不会注入模型会话上下文。</p>
                <div className="memory-view-row">
                  <div className="memory-view-tabs">
                    <button
                      className={backupGraphView === 'list' ? 'active' : ''}
                      type="button"
                      onClick={() => setBackupGraphView('list')}
                    >
                      列表
                    </button>
                    <button
                      className={backupGraphView === 'graph' ? 'active' : ''}
                      type="button"
                      onClick={() => setBackupGraphView('graph')}
                    >
                      脑图
                    </button>
                  </div>
                </div>
                <div className="memory-search-row">
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      const input = document.getElementById('backup-search-input')
                      if (input instanceof HTMLInputElement) input.focus()
                    }}
                  >
                    搜索
                  </button>
                  <div className="memory-search-input-wrap">
                    <input
                      id="backup-search-input"
                      className="memory-search-input"
                      type="text"
                      value={backupSearchQuery}
                      onChange={(event) => setBackupSearchQuery(event.target.value)}
                      placeholder="输入关键词实时搜索全部参考"
                    />
                    {backupSearchQuery.trim() ? (
                      <button
                        aria-label="清空搜索"
                        className="memory-search-clear"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setBackupSearchQuery('')
                          const input = document.getElementById('backup-search-input')
                          if (input instanceof HTMLInputElement) input.focus()
                        }}
                        type="button"
                      >
                        x
                      </button>
                    ) : null}
                  </div>
                </div>
                {backupGraphView === 'graph' ? (
                  <div
                    className={`backup-graph-board${isBackupGraphSpacePressed ? ' is-space' : ''}${isBackupGraphPanning ? ' is-panning' : ''}`}
                    ref={backupGraphBoardRef}
                    style={backupGraphBoardStyle}
                    onMouseDown={beginBackupGraphPan}
                    onMouseMove={handleBackupGraphMouseMove}
                    onMouseUp={handleBackupGraphMouseUp}
                    onDoubleClick={handleBackupGraphDoubleClick}
                    onWheel={handleBackupGraphWheel}
                    onAuxClick={(event) => {
                      if (event.button === 1) event.preventDefault()
                    }}
                    onMouseLeave={() => {
                      setIsBackupGraphPanning(false)
                      backupGraphPanStartRef.current = null
                      setDraggingBackupId(null)
                      backupDragIdsRef.current = []
                      backupDragOffsetsByIdRef.current = {}
                      setBackupSelectionBox(null)
                      setBackupLinkStart(null)
                      setBackupLinkTarget(null)
                      setBackupLinkPreview(null)
                      setBackupNodeMenu({ open: false, x: 0, y: 0, backupId: null })
                    }}
                    onContextMenu={(event) => {
                      const target = event.target
                      if (
                        target instanceof Element &&
                        target.closest(
                          '.backup-graph-node, .backup-graph-edge, .backup-relation-menu, .backup-node-menu'
                        )
                      ) {
                        return
                      }
                      if (backupRelationMenu.open) {
                        event.preventDefault()
                        setBackupRelationMenu({ open: false, x: 0, y: 0, relationId: null })
                      }
                      if (backupNodeMenu.open) {
                        event.preventDefault()
                        setBackupNodeMenu({ open: false, x: 0, y: 0, backupId: null })
                      }
                    }}
                  >
                    {isBackupGraphBoardFullscreen && (
                      <button
                        className="text-button role-graph-exit-button"
                        onClick={() => void toggleBackupGraphFullscreen()}
                        type="button"
                      >
                        退出全屏
                      </button>
                    )}
                    <div className="backup-graph-viewport" style={backupGraphViewportStyle}>
                      <svg className="backup-graph-lines" width="100%" height="100%">
                      <defs>
                        <marker
                          id="backup-graph-arrowhead"
                          viewBox="0 0 10 10"
                          refX="9"
                          refY="5"
                          markerWidth="7"
                          markerHeight="7"
                          orient="auto-start-reverse"
                        >
                          <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" stroke="context-stroke" />
                        </marker>
                      </defs>
                      {visibleBackupRelations.map((relation) => {
                        const geometry = getBackupRelationGeometry(relation)
                        if (!geometry) return null
                        const relationMode = parseRoleRelationMode(relation.mode)
                        const dashed = isRoleRelationDashed(relationMode)
                        const bidirectional = isRoleRelationBidirectional(relationMode)
                        const relationStrokeColor = normalizeRelationColor(
                          relation.strokeColor,
                          DEFAULT_BACKUP_RELATION_STROKE_COLOR
                        )
                        const relationLabelColor = normalizeRelationColor(
                          relation.labelColor,
                          DEFAULT_BACKUP_RELATION_LABEL_COLOR
                        )
                        const relationIsDirectFocus =
                          focusedBackupId !== null &&
                          (relation.fromBackupId === focusedBackupId ||
                            relation.toBackupId === focusedBackupId)
                        const relationHovered =
                          hoveredBackupRelationId === relation.id ||
                          draggingBackupRelationCurve?.relationId === relation.id
                        return (
                          <g
                            key={relation.id}
                            className={`backup-graph-edge${relationHovered ? ' is-hovered' : ''}${draggingBackupRelationCurve?.relationId === relation.id ? ' is-dragging' : ''}${shouldDimBackupGraph && !relationIsDirectFocus ? ' is-dimmed' : ''}`}
                            onMouseEnter={() => setHoveredBackupRelationId(relation.id)}
                            onMouseLeave={() =>
                              setHoveredBackupRelationId((previous) =>
                                previous === relation.id ? null : previous
                              )
                            }
                          >
                              <path
                                className="backup-graph-edge-path"
                                d={geometry.path}
                                strokeDasharray={dashed ? '6 4' : undefined}
                                markerEnd="url(#backup-graph-arrowhead)"
                                markerStart={bidirectional ? 'url(#backup-graph-arrowhead)' : undefined}
                                style={{ stroke: relationStrokeColor }}
                                onDoubleClick={() => editBackupRelation(relation.id)}
                                onContextMenu={(event) =>
                                  openBackupRelationContextMenu(event, relation.id)
                              }
                            />
                            <circle
                              className="backup-graph-edge-handle"
                              cx={geometry.curveMidPoint.x}
                              cy={geometry.curveMidPoint.y}
                              onMouseDown={(event) =>
                                beginBackupRelationCurveDrag(event, relation.id)
                              }
                              r={9}
                            />
                            <text
                              x={geometry.curveMidPoint.x}
                              y={geometry.curveMidPoint.y - 12}
                              style={{ fill: relationLabelColor }}
                              onDoubleClick={() => editBackupRelation(relation.id)}
                              onContextMenu={(event) =>
                                openBackupRelationContextMenu(event, relation.id)
                              }
                            >
                              {relation.causal || '因果'}
                            </text>
                          </g>
                        )
                      })}
                        {backupLinkStart !== null && backupLinkPreview ? (
                          (() => {
                            const startPos = backupPositionById.get(backupLinkStart.backupId)
                            if (!startPos) return null
                            const startPoint = getBackupSidePoint(startPos, backupLinkStart.side)
                            const previewDashed = isRoleRelationDashed(backupLinkStart.mode)
                            const previewBidirectional = isRoleRelationBidirectional(backupLinkStart.mode)
                            return (
                              <line
                                className="backup-graph-preview-line"
                                x1={startPoint.x}
                                y1={startPoint.y}
                                x2={backupLinkPreview.x}
                                y2={backupLinkPreview.y}
                                strokeDasharray={previewDashed ? '6 4' : undefined}
                                markerEnd="url(#backup-graph-arrowhead)"
                                markerStart={previewBidirectional ? 'url(#backup-graph-arrowhead)' : undefined}
                                style={{
                                  stroke: normalizeRelationColor(
                                    backupActiveRelationStrokeColor,
                                    DEFAULT_BACKUP_RELATION_STROKE_COLOR
                                  )
                                }}
                              />
                            )
                          })()
                      ) : null}
                      </svg>
                      {backupSelectionBounds && (
                        <div
                          className="backup-graph-selection-box"
                          style={{
                            left: backupSelectionBounds.minX,
                            top: backupSelectionBounds.minY,
                            width: backupSelectionBounds.width,
                            height: backupSelectionBounds.height
                          }}
                        />
                      )}
                      {filteredBackups.map((backup, index) => {
                        const position =
                          backupPositionById.get(backup.id) ?? getBackupNodePosition(backup, index)
                        const showHandles =
                          hoveredBackupId === backup.id || backupLinkStart?.backupId === backup.id
                        const isDirectBackupNode =
                          !shouldDimBackupGraph || directlyConnectedBackupIds.has(backup.id)
                        const linkTargetForNode =
                          backupLinkStart !== null && backupLinkTarget?.backupId === backup.id
                            ? backupLinkTarget
                            : null
                        return (
                          <article
                            className={`backup-graph-node ${draggingBackupId === backup.id ? 'dragging' : ''}${showHandles ? ' show-handles' : ''}${selectedBackupIds.has(backup.id) ? ' selected' : ''}${!isDirectBackupNode ? ' is-dimmed' : ''}`}
                            data-backup-id={backup.id}
                            key={backup.id}
                            onMouseDown={(event) => beginBackupDrag(event, backup.id)}
                            onContextMenu={(event) => openBackupNodeContextMenu(event, backup.id)}
                            onDoubleClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              openBackupEditor(backup.id)
                            }}
                            onMouseEnter={() => setHoveredBackupId(backup.id)}
                            onMouseLeave={() =>
                              setHoveredBackupId((previous) =>
                                previous === backup.id ? null : previous
                              )
                            }
                            style={{
                              left: position.x,
                              top: position.y
                            }}
                          >
                            {ROLE_LINK_SIDES.map((side) => (
                              <button
                                className={`backup-link-handle side-${side}`}
                                key={side}
                                onMouseDown={(event) => beginBackupLink(event, backup.id, side)}
                                title="拖动建立因果线"
                                type="button"
                              >
                                ●
                              </button>
                            ))}
                            {showHandles && (
                              <div className="backup-link-mode-picker" onMouseDown={(event) => event.stopPropagation()}>
                                {ROLE_RELATION_MODE_OPTIONS.map((option) => (
                                  <button
                                    className={`role-link-mode-option${backupActiveRelationMode === option.mode ? ' active' : ''}`}
                                    key={option.mode}
                                    onClick={(event) => {
                                      event.preventDefault()
                                      event.stopPropagation()
                                      setBackupActiveRelationMode(option.mode)
                                    }}
                                    title={option.label}
                                    type="button"
                                  >
                                    {option.icon}
                                  </button>
                                ))}
                                <label className="relation-color-control" title="线条颜色">
                                  <input
                                    className="relation-color-input"
                                    type="color"
                                    aria-label="线条颜色"
                                    value={backupActiveRelationStrokeColor}
                                    onChange={(event) => {
                                      event.stopPropagation()
                                      setBackupActiveRelationStrokeColor(event.target.value)
                                    }}
                                  />
                                </label>
                                <label className="relation-color-control" title="字体颜色">
                                  <input
                                    className="relation-color-input"
                                    type="color"
                                    aria-label="字体颜色"
                                    value={backupActiveRelationLabelColor}
                                    onChange={(event) => {
                                      event.stopPropagation()
                                      setBackupActiveRelationLabelColor(event.target.value)
                                    }}
                                  />
                                </label>
                              </div>
                            )}
                            {linkTargetForNode && (
                              <span
                                className={`backup-link-target-indicator side-${linkTargetForNode.side}`}
                              >
                                ●
                              </span>
                            )}
                            <h4>{backup.title || `事件${index + 1}`}</h4>
                            <p>{backup.content.trim() || '事件内容'}</p>
                            <small>{`改 ${backup.updatedAt}`}</small>
                          </article>
                        )
                      })}
                    </div>
                    <button
                      className="role-graph-corner-fullscreen"
                      onClick={() => void toggleBackupGraphFullscreen()}
                      title={isBackupGraphBoardFullscreen ? '退出全屏' : '全屏'}
                      type="button"
                    >
                      {isBackupGraphBoardFullscreen ? '⤡' : '⛶'}
                    </button>
                    <button
                      className="text-button role-graph-visual-button"
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        setIsBackupGraphVisualDialogOpen((previous) => !previous)
                      }}
                      title="脑图视觉设置"
                      type="button"
                    >
                      ⚙
                    </button>
                    {isBackupGraphVisualDialogOpen && (
                      <div
                        className="graph-visual-panel"
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                        <h4>脑图设置</h4>
                        <label>
                          <span>背景色</span>
                          <input
                            aria-label="事件脑图背景色"
                            type="color"
                            value={backupGraphVisual.backgroundColor}
                            onChange={(event) =>
                              setBackupGraphVisual((previous) => ({
                                ...previous,
                                backgroundColor: normalizeRelationColor(
                                  event.target.value,
                                  DEFAULT_BACKUP_GRAPH_BG_COLOR
                                )
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>{`字体大小 ${backupGraphVisual.fontSize}px`}</span>
                          <div className="graph-visual-size-row">
                            <input
                              aria-label="事件脑图字体大小滑杆"
                              max={GRAPH_FONT_SIZE_MAX}
                              min={GRAPH_FONT_SIZE_MIN}
                              type="range"
                              value={backupGraphVisual.fontSize}
                              onChange={(event) => {
                                const nextSize = clampNumber(
                                  Number(event.target.value) || DEFAULT_GRAPH_FONT_SIZE,
                                  GRAPH_FONT_SIZE_MIN,
                                  GRAPH_FONT_SIZE_MAX
                                )
                                setBackupGraphVisual((previous) => ({
                                  ...previous,
                                  fontSize: Math.round(nextSize)
                                }))
                              }}
                            />
                            <input
                              aria-label="事件脑图字体大小数值"
                              max={GRAPH_FONT_SIZE_MAX}
                              min={GRAPH_FONT_SIZE_MIN}
                              type="number"
                              value={backupGraphVisual.fontSize}
                              onChange={(event) => {
                                const nextSize = clampNumber(
                                  Number(event.target.value) || DEFAULT_GRAPH_FONT_SIZE,
                                  GRAPH_FONT_SIZE_MIN,
                                  GRAPH_FONT_SIZE_MAX
                                )
                                setBackupGraphVisual((previous) => ({
                                  ...previous,
                                  fontSize: Math.round(nextSize)
                                }))
                              }}
                            />
                          </div>
                        </label>
                        <label>
                          <span>{`弱化透明度 ${backupGraphVisual.dimmedOpacity.toFixed(2)}`}</span>
                          <div className="graph-visual-size-row">
                            <input
                              aria-label="事件脑图弱化透明度滑杆"
                              max={GRAPH_DIMMED_OPACITY_MAX}
                              min={GRAPH_DIMMED_OPACITY_MIN}
                              step={0.01}
                              type="range"
                              value={backupGraphVisual.dimmedOpacity}
                              onChange={(event) => {
                                const nextOpacity = clampNumber(
                                  Number(event.target.value) || DEFAULT_GRAPH_DIMMED_OPACITY,
                                  GRAPH_DIMMED_OPACITY_MIN,
                                  GRAPH_DIMMED_OPACITY_MAX
                                )
                                setBackupGraphVisual((previous) => ({
                                  ...previous,
                                  dimmedOpacity: Math.round(nextOpacity * 100) / 100
                                }))
                              }}
                            />
                            <input
                              aria-label="事件脑图弱化透明度数值"
                              max={GRAPH_DIMMED_OPACITY_MAX}
                              min={GRAPH_DIMMED_OPACITY_MIN}
                              step={0.01}
                              type="number"
                              value={backupGraphVisual.dimmedOpacity}
                              onChange={(event) => {
                                const nextOpacity = clampNumber(
                                  Number(event.target.value) || DEFAULT_GRAPH_DIMMED_OPACITY,
                                  GRAPH_DIMMED_OPACITY_MIN,
                                  GRAPH_DIMMED_OPACITY_MAX
                                )
                                setBackupGraphVisual((previous) => ({
                                  ...previous,
                                  dimmedOpacity: Math.round(nextOpacity * 100) / 100
                                }))
                              }}
                            />
                          </div>
                        </label>
                        <div className="graph-visual-actions">
                          <button
                            className="text-button"
                            type="button"
                            onClick={() =>
                              setBackupGraphVisual({
                                backgroundColor: DEFAULT_BACKUP_GRAPH_BG_COLOR,
                                fontSize: DEFAULT_GRAPH_FONT_SIZE,
                                dimmedOpacity: DEFAULT_GRAPH_DIMMED_OPACITY
                              })
                            }
                          >
                            重置
                          </button>
                          <button
                            className="text-button"
                            type="button"
                            onClick={() => setIsBackupGraphVisualDialogOpen(false)}
                          >
                            关闭
                          </button>
                        </div>
                      </div>
                    )}
                    {backupRelationMenu.open && backupRelationMenu.relationId !== null && (
                      <div
                        className="editor-context-menu backup-relation-menu"
                        ref={backupRelationMenuRef}
                        style={{ left: backupRelationMenu.x, top: backupRelationMenu.y }}
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                        <button
                          className="editor-context-item"
                          onClick={(event) => {
                            event.stopPropagation()
                            editBackupRelation(backupRelationMenu.relationId as number)
                          }}
                          type="button"
                        >
                          编辑因果
                        </button>
                        <button
                          className="editor-context-item"
                          onClick={(event) => {
                            event.stopPropagation()
                            removeBackupRelation(backupRelationMenu.relationId as number)
                          }}
                          type="button"
                        >
                          删除连线
                        </button>
                      </div>
                    )}
                    {backupNodeMenu.open && backupNodeMenu.backupId !== null && (
                      <div
                        className="editor-context-menu backup-node-menu"
                        ref={backupNodeMenuRef}
                        style={{ left: backupNodeMenu.x, top: backupNodeMenu.y }}
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                        <button
                          className="editor-context-item"
                          onClick={(event) => {
                            event.stopPropagation()
                            openBackupEditor(backupNodeMenu.backupId as number)
                          }}
                          type="button"
                        >
                          编辑事件
                        </button>
                        <button
                          className="editor-context-item"
                          onClick={(event) => {
                            event.stopPropagation()
                            const targetBackupId = backupNodeMenu.backupId as number
                            const nextIds = selectedBackupIds.has(targetBackupId)
                              ? Array.from(selectedBackupIds)
                              : [targetBackupId]
                            deleteBackups(nextIds)
                            setBackupNodeMenu({ open: false, x: 0, y: 0, backupId: null })
                          }}
                          type="button"
                        >
                          {selectedBackupIds.size > 1 && selectedBackupIds.has(backupNodeMenu.backupId)
                            ? `删除已选事件（${selectedBackupIds.size}）`
                            : '删除事件'}
                        </button>
                      </div>
                    )}
                    {isBackupGraphBoardFullscreen ? (
                      <div className="backup-graph-help">
                        滚轮缩放 · 中键或空格+拖动平移 · 拖拽框选多选 · Delete 删除事件 · 拖拽四边连接点建立因果 · 双击事件/连线编辑 · 拖拽连线中点可弯曲
                      </div>
                    ) : null}
                    {backupRelationEditorDialog && (
                      <div
                        className="role-editor-modal-backdrop role-editor-modal-backdrop--inside-graph"
                        onMouseDown={(event) => {
                          if (event.target === event.currentTarget) closeBackupRelationEditor()
                        }}
                      >
                        <div className="role-editor-modal" onMouseDown={(event) => event.stopPropagation()}>
                          <h3>编辑事件因果</h3>
                          <label>
                            <span>因果描述</span>
                            <input
                              autoFocus
                              type="text"
                              value={backupRelationEditorDialog.causal}
                              onChange={(event) =>
                                setBackupRelationEditorDialog((previous) =>
                                  previous
                                    ? {
                                        ...previous,
                                        causal: event.target.value
                                      }
                                    : previous
                                )
                              }
                              placeholder="例如：导火索、引发、反噬、连锁反应"
                            />
                          </label>
                          <div className="role-editor-actions">
                            <button
                              className="text-button"
                              type="button"
                              onClick={closeBackupRelationEditor}
                            >
                              取消
                            </button>
                            <button
                              className="primary-button"
                              type="button"
                              onClick={commitBackupRelationEditor}
                            >
                              保存
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    {backupEditorDialog && (
                      <div
                        className="role-editor-modal-backdrop role-editor-modal-backdrop--inside-graph"
                        onMouseDown={(event) => {
                          if (event.target === event.currentTarget) closeBackupEditor()
                        }}
                      >
                        <div className="role-editor-modal" onMouseDown={(event) => event.stopPropagation()}>
                          <h3>编辑事件卡</h3>
                          <label>
                            <span>标题</span>
                            <input
                              autoFocus
                              type="text"
                              value={backupEditorDialog.title}
                              onChange={(event) =>
                                setBackupEditorDialog((previous) =>
                                  previous
                                    ? {
                                        ...previous,
                                        title: event.target.value
                                      }
                                    : previous
                                )
                              }
                              placeholder="输入事件标题"
                            />
                          </label>
                          <label>
                            <span>内容</span>
                            <textarea
                              value={backupEditorDialog.content}
                              onChange={(event) =>
                                setBackupEditorDialog((previous) =>
                                  previous
                                    ? {
                                        ...previous,
                                        content: event.target.value
                                      }
                                    : previous
                                )
                              }
                              placeholder="输入事件内容"
                            />
                          </label>
                          <div className="role-editor-actions">
                            <button className="text-button" type="button" onClick={closeBackupEditor}>
                              取消
                            </button>
                            <button className="primary-button" type="button" onClick={commitBackupEditor}>
                              保存
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <ul className="backup-list">
                      {filteredBackups.map((backup) => (
                        <li key={backup.id}>
                          <header>
                            <input
                              className="backup-title-input"
                              value={backup.title}
                              onChange={(event) =>
                                updateBackup(backup.id, { title: event.target.value })
                              }
                            />
                            <span>{`改 ${backup.updatedAt}`}</span>
                          </header>
                          <textarea
                            value={backup.content}
                            onChange={(event) =>
                              updateBackup(backup.id, { content: event.target.value })
                            }
                          />
                          <div className="backup-actions">
                            <button
                              className="backup-delete"
                              onClick={() => deleteBackup(backup.id)}
                            >
                              删除
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    {!filteredBackups.length && (
                      <p className="empty-tip">
                        {backupSearchQuery.trim() ? '没有匹配的参考。' : '暂无参考。'}
                      </p>
                    )}
                  </>
                )}
                {backupGraphView === 'graph' && !filteredBackups.length && (
                  <p className="empty-tip">
                    {backupSearchQuery.trim() ? '没有匹配的事件。' : '暂无事件卡。'}
                  </p>
                )}
                <button
                  className="text-button"
                  onClick={() => {
                    const index = backups.length
                    createBackup('写作参考内容', '新参考', {
                      backupX: 28 + (index % 2) * 276,
                      backupY: 28 + Math.floor(index / 2) * 170
                    })
                  }}
                >
                  新增参考
                </button>
              </section>
            )}

            {activePanel === 'settings' && (
              <section className="panel-section settings">
                <div className="paper-heading">
                  <p>模型</p>
                  <h2>模型接口</h2>
                </div>
                <label>
                    <span>类型</span>
                  <select
                    value={config.kind}
                    onChange={(event) => {
                      const kind = event.target.value as ProviderKind
                      setConfig((current) => ({
                        ...current,
                        kind,
                        baseUrl:
                          kind === 'ollama'
                            ? 'http://localhost:11434'
                            : current.baseUrl
                      }))
                    }}
                  >
                    <option value="ollama">Ollama</option>
                    <option value="openai">OpenAI 兼容接口</option>
                  </select>
                </label>
                <label>
                  <span>基础地址</span>
                  <input
                    value={config.baseUrl}
                    onChange={(event) =>
                      setConfig((current) => ({ ...current, baseUrl: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>模型</span>
                  <div className="settings-model-row">
                    {config.kind === 'ollama' && ollamaModels.length > 0 ? (
                      <select
                        value={config.model}
                        onChange={(event) =>
                          setConfig((current) => ({ ...current, model: event.target.value }))
                        }
                      >
                        {!ollamaModels.includes(config.model) && (
                          <option value={config.model}>{`${config.model}（当前）`}</option>
                        )}
                        {ollamaModels.map((modelName) => (
                          <option key={modelName} value={modelName}>
                            {modelName}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={config.model}
                        onChange={(event) =>
                          setConfig((current) => ({ ...current, model: event.target.value }))
                        }
                      />
                    )}
                    {config.kind === 'ollama' && (
                      <button
                        className="text-button"
                        disabled={isLoadingOllamaModels}
                        onClick={() =>
                          void refreshOllamaModels({
                            syncModel: true,
                            includeCloud: loadCloudModels
                          })
                        }
                        type="button"
                      >
                        {isLoadingOllamaModels ? '刷新中...' : '刷新模型'}
                      </button>
                    )}
                  </div>
                  {config.kind === 'ollama' && (
                    <div className="settings-checkbox-row">
                      <input
                        checked={loadCloudModels}
                        onChange={(event) => void toggleCloudModelLoading(event.target.checked)}
                        type="checkbox"
                      />
                      <span>加载云端模型（如需登录会自动触发 Ollama 登录）</span>
                    </div>
                  )}
                  {config.kind === 'ollama' && (
                    <small className="settings-inline-tip">
                      {ollamaModels.length
                        ? `可选 ${ollamaModels.length} 个模型（本地 ${localOllamaModels.length}${loadCloudModels ? `，云端 ${cloudOllamaModels.length}` : ''}）`
                        : '未读取到模型（可手动输入）'}
                    </small>
                  )}
                  {config.kind === 'ollama' && hasActivationSupport && !activationStatus.activated && (
                    <div className="settings-activation-warning">
                      <span>
                        {t(
                          '当前未激活：本地模型不可用，仅可使用云端模型。',
                          'Not activated: local models are unavailable. Cloud models only.'
                        )}
                      </span>
                      <button
                        className="text-button"
                        onClick={() => void openActivationDialog()}
                        type="button"
                      >
                        {isOpeningActivationDialog ? t('打开中...', 'Opening...') : t('立即激活', 'Activate Now')}
                      </button>
                    </div>
                  )}
                </label>
                {config.kind === 'openai' && (
                  <label>
                    <span>API 密钥</span>
                    <input
                      value={config.apiKey}
                      onChange={(event) =>
                        setConfig((current) => ({ ...current, apiKey: event.target.value }))
                      }
                      placeholder="sk-..."
                      type="password"
                    />
                  </label>
                )}
                <label>
                  <span>温度 {config.temperature.toFixed(1)}</span>
                  <input
                    max="1.4"
                    min="0"
                    step="0.1"
                    type="range"
                    value={config.temperature}
                    onChange={(event) =>
                      setConfig((current) => ({
                        ...current,
                        temperature: Number(event.target.value)
                      }))
                    }
                  />
                </label>
                <div className="settings-connection-row">
                  <button
                    className="text-button"
                    disabled={isConnecting}
                    onClick={() => void testConnection()}
                  >
                    {connectionActionLabel}
                  </button>
                  <div className={`settings-connection-state ${connectionStatusClass}`}>
                    <span className="settings-connection-dot" />
                    <span>{`当前模型连接：${connectionStatusLabel}`}</span>
                  </div>
                </div>
                <section className="settings-runtime-card">
                  <header className="settings-runtime-card-header">
                    <strong>Skills 生效诊断</strong>
                    <small>
                      {runtimeDiagnostics?.generatedAt
                        ? `最近请求：${new Date(runtimeDiagnostics.generatedAt).toLocaleString('zh-CN', {
                            hour12: false
                          })}`
                        : '尚未发送请求'}
                    </small>
                  </header>
                  <div className="settings-runtime-status-row">
                    <span
                      className={`settings-runtime-pill ${runtimeSkillsLoaded ? 'is-on' : 'is-off'}`}
                    >
                      已加载
                    </span>
                    <span
                      className={`settings-runtime-pill ${runtimeSkillsInjected ? 'is-on' : 'is-off'}`}
                    >
                      已注入
                    </span>
                    <span
                      className={`settings-runtime-pill ${runtimeSkillsHit ? 'is-on' : 'is-off'}`}
                    >
                      已命中
                    </span>
                  </div>
                  <p className="settings-runtime-tip">
                    已加载：有可用 Skills；已注入：system 中包含 Skills；已命中：本次请求在带 Skills 的上下文中执行。
                  </p>
                  <div className="settings-runtime-hash-row">
                    <small>
                      Skills Hash：{runtimeDiagnostics?.skillsPromptHash || '暂无'}
                    </small>
                    <small>
                      System Hash：{runtimeDiagnostics?.systemPromptHash || '暂无'}
                    </small>
                  </div>
                  <div className="settings-runtime-preview">
                    <div className="settings-runtime-preview-head">
                      <span>注入预览（System）</span>
                    </div>
                    <textarea
                      readOnly
                      value={runtimeSystemPreview || '暂无注入预览。先执行一次“测试连接”或写作动作。'}
                    />
                  </div>
                  <div className="settings-runtime-log">
                    <div className="settings-runtime-log-head">最近请求日志</div>
                    {visibleRuntimeLogs.length > 0 ? (
                      <ul className="settings-runtime-log-list">
                        {visibleRuntimeLogs.slice(0, 10).map((log) => (
                          <li key={log.id}>
                            <strong>{`${new Date(log.createdAt).toLocaleTimeString('zh-CN', {
                              hour12: false
                            })} · ${log.model}`}</strong>
                            <small>{`${log.provider} · memory ${log.memoryCount} · input ${log.inputChars} chars · skills ${log.skillsInjected ? 'yes' : 'no'}`}</small>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="empty-tip">暂无请求日志。</p>
                    )}
                  </div>
                </section>
                <label>
                  <span>自定义动作</span>
                  <textarea
                    className="custom-prompt"
                    value={customPrompt}
                    onChange={(event) => setCustomPrompt(event.target.value)}
                  />
                </label>
                <label>
                  <span>写作 Skills（由应用中心已应用 Skills 生成，每个会话首次注入）</span>
                  <p className="panel-note-tip settings-note-tip">
                    已应用 Skills 会汇总为写作规则，在当前章节会话首次注入到 system，用于稳定文风与写作约束。
                  </p>
                  <ul className="settings-skills-list">
                    {installedSkillCatalog.map((skill) => (
                      <li key={skill.id}>
                        <div className="skills-item-main">
                          <strong>{skill.name}</strong>
                          <small className="skills-source-tag">
                            {skill.source === 'official' ? '官方' : '自定义'}
                          </small>
                        </div>
                        <div className="skills-item-actions">
                          <button
                            className="text-button danger"
                            disabled={isSkillsCenterBusy || !hasSkillsCenter}
                            onClick={() => void toggleSkillInstall(skill)}
                          >
                            停用
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {!installedSkillCatalog.length && <p className="empty-tip">暂无已安装 Skills。</p>}
                </label>
                <div className="settings-advanced">
                  <button
                    className="settings-advanced-toggle"
                    type="button"
                    onClick={() => setIsAdvancedSettingsOpen((previous) => !previous)}
                  >
                    {isAdvancedSettingsOpen ? '收起高级功能' : '展开高级功能'}
                  </button>
                  {isAdvancedSettingsOpen && (
                    <div className="settings-advanced-content">
                      <label>
                        <span>Skills 模型名（用于 Modelfile 生成）</span>
                        <input
                          value={skillModelName}
                          onChange={(event) => setSkillModelName(event.target.value)}
                          placeholder="novelwriter-style:v1"
                        />
                      </label>
                      <div className="result-actions">
                        <div className="session-reset-wrap">
                          <button onClick={() => void resetCurrentSession()} disabled={isRunning}>
                            重置当前章节会话
                          </button>
                          <span className="session-reset-tip">
                            切换模型一般无需重置；仅在要清空当前章节历史时使用。
                          </span>
                        </div>
                        <button
                          onClick={() => void buildSkillModel()}
                          disabled={
                            isBuildingSkillModel ||
                            config.kind !== 'ollama' ||
                            (hasActivationSupport && !activationStatus.activated) ||
                            !skillModelName.trim() ||
                            !skillsPrompt.trim()
                          }
                        >
                          {isBuildingSkillModel ? '正在生成模型...' : '生成 Skills 模型'}
                        </button>
                      </div>
                      <p className="empty-tip settings-session-id">
                        当前会话 ID：{currentSessionId || '未初始化'}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {activePanel === 'skills' && (
              <section className="panel-section skills-center">
                <div className="paper-heading">
                  <p>Skills</p>
                  <h2>应用中心</h2>
                </div>
                <p className="panel-note-tip">
                  应用后的 Skills 会参与生成“写作 Skills”提示，并在每个章节会话首次注入，帮助统一文风、叙事习惯和禁忌规则。
                </p>
                <div className="skills-center-toolbar">
                  <label className="text-button skills-upload-button">
                    上传自定义 .md
                    <input
                      accept=".md,.markdown,text/markdown"
                      className="skills-upload-input"
                      onChange={handleCustomSkillUpload}
                      ref={customSkillUploadRef}
                      type="file"
                    />
                  </label>
                  <button
                    className="text-button"
                    disabled={!hasSkillsCenter || isSkillsCenterBusy}
                    onClick={() => void refreshSkillsCenter()}
                  >
                    刷新
                  </button>
                </div>
                <p className="skills-center-summary">
                  已应用 {installedSkillsCount} 个 Skills
                  {!hasSkillsCenter ? '（当前仅桌面版支持应用中心）' : ''}
                </p>

                <div className="skills-group">
                  <h3>已安装 Skills</h3>
                  <ul className="skills-list">
                    {installedSkillCatalog.map((skill) => (
                      <li key={skill.id}>
                        <div className="skills-item-main">
                          {editingSkillId === skill.id && skill.source === 'custom' ? (
                            <input
                              autoFocus
                              className="skills-rename-input"
                              onBlur={() => void commitSkillRename(skill.id)}
                              onChange={(event) => setEditingSkillName(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  void commitSkillRename(skill.id)
                                }
                                if (event.key === 'Escape') {
                                  event.preventDefault()
                                  cancelSkillRename()
                                }
                              }}
                              value={editingSkillName}
                            />
                          ) : (
                            <strong>{skill.name}</strong>
                          )}
                          <small className="skills-source-tag">
                            {skill.source === 'official' ? '官方' : '自定义'}
                          </small>
                          <small>{skill.updatedAt ? `更新于 ${skill.updatedAt}` : ''}</small>
                        </div>
                        <div className="skills-item-actions">
                          <button
                            className="text-button danger"
                            disabled={isSkillsCenterBusy || !hasSkillsCenter}
                            onClick={() => void toggleSkillInstall(skill)}
                          >
                            停用
                          </button>
                          {skill.source === 'custom' && (
                            <button
                              className="text-button"
                              disabled={isSkillsCenterBusy || !hasSkillsCenter}
                              onClick={() => startSkillRename(skill)}
                            >
                              重命名
                            </button>
                          )}
                          {skill.source === 'custom' && (
                            <button
                              className="text-button danger"
                              disabled={isSkillsCenterBusy || !hasSkillsCenter}
                              onClick={() => void deleteSkill(skill)}
                            >
                              删除
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {!installedSkillCatalog.length && <p className="empty-tip">暂无已安装 Skills。</p>}
                </div>

                <div className="skills-group">
                  <h3>{`官方 Skills（来源 ${officialSkillsDir}，仅可应用/停用）`}</h3>
                  <ul className="skills-list">
                    {availableOfficialSkillCatalog.map((skill) => (
                      <li key={skill.id}>
                        <div className="skills-item-main">
                          <strong>{skill.name}</strong>
                          <small>{skill.updatedAt ? `更新于 ${skill.updatedAt}` : ''}</small>
                        </div>
                        <div className="skills-item-actions">
                          <button
                            className="text-button"
                            disabled={isSkillsCenterBusy || !hasSkillsCenter}
                            onClick={() => void toggleSkillInstall(skill)}
                          >
                            应用
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {!availableOfficialSkillCatalog.length && (
                    <p className="empty-tip">官方 Skills 均已应用。</p>
                  )}
                </div>

                <div className="skills-group">
                  <h3>自定义 Skills（可上传/重命名/删除）</h3>
                  <ul className="skills-list">
                    {availableCustomSkillCatalog.map((skill) => (
                      <li key={skill.id}>
                        <div className="skills-item-main">
                          {editingSkillId === skill.id ? (
                            <input
                              autoFocus
                              className="skills-rename-input"
                              onBlur={() => void commitSkillRename(skill.id)}
                              onChange={(event) => setEditingSkillName(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  void commitSkillRename(skill.id)
                                }
                                if (event.key === 'Escape') {
                                  event.preventDefault()
                                  cancelSkillRename()
                                }
                              }}
                              value={editingSkillName}
                            />
                          ) : (
                            <strong>{skill.name}</strong>
                          )}
                          <small>{skill.updatedAt ? `更新于 ${skill.updatedAt}` : ''}</small>
                        </div>
                        <div className="skills-item-actions">
                          <button
                            className="text-button"
                            disabled={isSkillsCenterBusy || !hasSkillsCenter}
                            onClick={() => void toggleSkillInstall(skill)}
                          >
                            应用
                          </button>
                          <button
                            className="text-button"
                            disabled={isSkillsCenterBusy || !hasSkillsCenter}
                            onClick={() => startSkillRename(skill)}
                          >
                            重命名
                          </button>
                          <button
                            className="text-button danger"
                            disabled={isSkillsCenterBusy || !hasSkillsCenter}
                            onClick={() => void deleteSkill(skill)}
                          >
                            删除
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {!availableCustomSkillCatalog.length && <p className="empty-tip">暂无可用自定义 Skills。</p>}
                </div>
              </section>
            )}

            {activePanel === 'result' && (
              <section className="panel-section result-panel">
                <div className="paper-heading">
                  <p>助手</p>
                  <h2>生成结果</h2>
                </div>
                {isRunning && <div className="loading-line">模型正在生成...</div>}
                {error && <p className="error-text">{error}</p>}
                <textarea
                  value={result}
                  onChange={(event) => setResult(event.target.value)}
                  placeholder="输出会显示在这里。"
                />
                <div className="result-actions result-actions-main">
                  <button
                    className="result-action-btn"
                    onClick={insertResult}
                    disabled={!result}
                    title="插入到光标处"
                  >
                    <span className="result-action-icon" aria-hidden>↧</span>
                    <span className="result-action-label">插入</span>
                  </button>
                  <button
                    className="result-action-btn"
                    onClick={replaceSelection}
                    disabled={!result}
                    title="替换选中内容"
                  >
                    <span className="result-action-icon" aria-hidden>⇆</span>
                    <span className="result-action-label">替换</span>
                  </button>
                  <button
                    className="result-action-btn"
                    onClick={addMemoryFromResult}
                    disabled={!result}
                    title="保存到记忆"
                  >
                    <span className="result-action-icon" aria-hidden>◎</span>
                    <span className="result-action-label">记忆</span>
                  </button>
                  <button
                    className="result-action-btn"
                    onClick={() => createBackup(result)}
                    disabled={!result}
                    title="保存参考"
                  >
                    <span className="result-action-icon" aria-hidden>※</span>
                    <span className="result-action-label">参考</span>
                  </button>
                  <button
                    className="result-action-btn"
                    onClick={() => void copyResultToClipboard()}
                    disabled={!result}
                    title="复制输出"
                  >
                    <span className="result-action-icon" aria-hidden>⧉</span>
                    <span className="result-action-label">复制</span>
                  </button>
                  <button
                    className="result-action-btn"
                    onClick={appendResultToDraft}
                    disabled={!result}
                    title="追加到正文末尾"
                  >
                    <span className="result-action-icon" aria-hidden>＋</span>
                    <span className="result-action-label">追加</span>
                  </button>
                  <button
                    className="result-action-btn"
                    onClick={overwriteDraftWithResult}
                    disabled={!result}
                    title="用输出覆盖正文"
                  >
                    <span className="result-action-icon" aria-hidden>▣</span>
                    <span className="result-action-label">覆盖</span>
                  </button>
                  <button
                    className="result-action-btn"
                    onClick={clearResultOutput}
                    disabled={!result}
                    title="清空输出"
                  >
                    <span className="result-action-icon" aria-hidden>×</span>
                    <span className="result-action-label">清空</span>
                  </button>
                </div>
              </section>
            )}
          </aside>
        </div>
      </section>

      {customPageRenameDialog && (
        <div
          className="page-rename-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              cancelCustomPageRename()
            }
          }}
        >
          <div className="page-rename-modal" onMouseDown={(event) => event.stopPropagation()}>
            <h3>{t('重命名自定义页面', 'Rename Custom Page')}</h3>
            <p>{t('输入新的页面名称。', 'Enter a new page name.')}</p>
            <input
              autoFocus
              onChange={(event) =>
                setCustomPageRenameDialog((previous) =>
                  previous
                    ? {
                        ...previous,
                        value: event.target.value
                      }
                    : previous
                )
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitCustomPageRename()
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  cancelCustomPageRename()
                }
              }}
              placeholder={t('请输入页面名称', 'Enter page name')}
              value={customPageRenameDialog.value}
            />
            <div className="page-rename-modal-actions">
              <button className="text-button" onClick={cancelCustomPageRename} type="button">
                {t('取消', 'Cancel')}
              </button>
              <button
                className="text-button"
                disabled={!customPageRenameDialog.value.trim()}
                onClick={commitCustomPageRename}
                type="button"
              >
                {t('确认', 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {editorContextMenu.open && (
        <div
          className="editor-context-menu"
          ref={editorContextMenuRef}
          style={{ left: editorContextMenu.x, top: editorContextMenu.y }}
        >
          {editorContextModelStatusTip ? (
            <div
              className={`editor-context-status-tip is-${editorContextModelStatusState}`}
            >
              {editorContextModelStatusTip}
            </div>
          ) : null}
          {editorContextMenuItems.map((item) => {
            if ('divider' in item) {
              return <div className="editor-context-divider" key={item.key} />
            }
            return (
              <button
                className="editor-context-item"
                disabled={item.disabled}
                key={item.key}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  applyContextMenuCommand(item.run)
                }}
              >
                <span>{item.label}</span>
                {item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
              </button>
            )
          })}
        </div>
      )}

      {scriptRolePicker && (
        <div
          className="script-role-picker"
          ref={scriptRolePickerRef}
          style={{ left: scriptRolePicker.x, top: scriptRolePicker.y }}
        >
          <header>
            <strong>
              {scriptRolePickerCurrentName
                ? `切换角色：${scriptRolePickerCurrentName}`
                : '角色切换'}
            </strong>
            <div className="script-role-picker-actions">
              {scriptRolePickerCurrentName && !isNarratorLabel(scriptRolePickerCurrentName) ? (
                isScriptRolePickerCurrentTracked ? (
                  <>
                    {scriptRolePickerCurrentRoleMemory ? (
                      <button
                        className="text-button"
                        onClick={() => openRoleRelationsPanel(scriptRolePickerCurrentRoleMemory.id, 'script-tag')}
                        type="button"
                      >
                        查看关系
                      </button>
                    ) : null}
                  </>
                ) : (
                  <button
                    className="text-button"
                    onClick={() => addScriptRoleToMemoryIfNeeded(scriptRolePickerCurrentName)}
                    type="button"
                  >
                    加入角色库
                  </button>
                )
              ) : null}
              <button
                className="text-button"
                onClick={() => closeScriptRolePicker()}
                type="button"
              >
                关闭
              </button>
            </div>
          </header>
          {scriptRolePickerCurrentRoleMemory ? (
            <div className="script-role-picker-role-meta">
              <span>{`立场 ${getRoleStance(scriptRolePickerCurrentRoleMemory)}/10 · ${getRoleStanceLabel(getRoleStance(scriptRolePickerCurrentRoleMemory))}`}</span>
              <small>{getRoleNote(scriptRolePickerCurrentRoleMemory).trim() || '暂无备注'}</small>
            </div>
          ) : null}
          <div className="script-role-picker-body">
            <div className="script-role-picker-left">
              <div className="script-role-picker-search">
                <input
                  autoFocus
                  ref={scriptRolePickerInputRef}
                  onChange={(event) =>
                    setScriptRolePicker((previous) =>
                      previous
                        ? {
                            ...previous,
                            query: event.target.value
                          }
                        : previous
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      const preferred = filteredScriptRolePickerOptions[0] ?? scriptRolePicker.query
                      commitScriptRolePicker(preferred)
                    } else if (event.key === 'Escape') {
                      event.preventDefault()
                      closeScriptRolePicker()
                    }
                  }}
                  placeholder="搜索或输入角色名称"
                  value={scriptRolePicker.query}
                />
                {scriptRolePicker.query.trim() ? (
                  <button
                    aria-label="清空搜索"
                    className="script-role-picker-clear"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() =>
                      setScriptRolePicker((previous) =>
                        previous
                          ? {
                              ...previous,
                              query: ''
                            }
                          : previous
                      )
                    }
                    type="button"
                  >
                    x
                  </button>
                ) : null}
              </div>
              <ul>
                {filteredScriptRolePickerOptions.length > 0 ? (
                  filteredScriptRolePickerOptions.map((name) => {
                    const normalized = normalizeScriptRoleName(name)
                    const isNarrator = isNarratorLabel(normalized)
                    const colorClass = isNarrator
                      ? 'script-role-picker-tag--narrator'
                      : `script-role-picker-tag--color-${getScriptRoleColorIndex(normalized)}`
                    return (
                      <li key={name}>
                        <button
                          className={scriptRolePicker.currentName === normalized ? 'active' : ''}
                          onClick={() => commitScriptRolePicker(normalized)}
                          type="button"
                        >
                          <span className={`script-role-picker-tag ${colorClass}`}>{normalized}</span>
                        </button>
                      </li>
                    )
                  })
                ) : (
                  <li className="script-role-picker-empty">没有匹配角色，按 Enter 使用当前输入</li>
                )}
              </ul>
            </div>
            <section className="script-role-picker-detail">
              <h5>角色信息</h5>
              {scriptRolePickerRoleDraft ? (
                <>
                  <label>
                    <span>名称</span>
                    <input
                      onChange={(event) =>
                        setScriptRolePickerRoleDraft((previous) =>
                          previous
                            ? {
                                ...previous,
                                roleName: event.target.value
                              }
                            : previous
                        )
                      }
                      placeholder="角色名称"
                      value={scriptRolePickerRoleDraft.roleName}
                    />
                  </label>
                  <label>
                    <span>备注</span>
                    <textarea
                      onChange={(event) =>
                        setScriptRolePickerRoleDraft((previous) =>
                          previous
                            ? {
                                ...previous,
                                roleNote: event.target.value
                              }
                            : previous
                        )
                      }
                      placeholder="角色备注"
                      value={scriptRolePickerRoleDraft.roleNote}
                    />
                  </label>
                  <label>
                    <span>{`立场 ${scriptRolePickerRoleDraft.roleStance}/10（${getRoleStanceLabel(scriptRolePickerRoleDraft.roleStance)}）`}</span>
                    <input
                      max={10}
                      min={1}
                      onChange={(event) =>
                        setScriptRolePickerRoleDraft((previous) =>
                          previous
                            ? {
                                ...previous,
                                roleStance: clampRoleStance(Number(event.target.value))
                              }
                            : previous
                        )
                      }
                      type="range"
                      value={scriptRolePickerRoleDraft.roleStance}
                    />
                  </label>
                  <button
                    className="primary-button"
                    disabled={!isScriptRolePickerRoleDraftDirty}
                    onClick={saveScriptRolePickerRoleDraft}
                    type="button"
                  >
                    保存到角色库
                  </button>
                </>
              ) : (
                <p className="script-role-picker-detail-empty">
                  当前标签还没加入角色库。点击上方“加入角色库”后可在这里编辑并同步。
                </p>
              )}
            </section>
          </div>
        </div>
      )}
    </main>
  )
}

export default App

