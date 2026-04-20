import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import MonacoEditor, { loader, type OnMount } from '@monaco-editor/react'
import * as monacoApi from 'monaco-editor'
import type * as Monaco from 'monaco-editor'
import './App.css'

loader.config({ monaco: monacoApi })

type ProviderKind = 'ollama' | 'openai'
type ActivePanel = 'memory' | 'settings' | 'result' | 'backup' | 'skills'
type ConnectionState = 'unknown' | 'checking' | 'connected' | 'failed'
type AppLanguage = 'zh-CN' | 'en-US'

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

type ChapterDropPosition = 'before' | 'after'
type ChapterKind = 'chapter' | 'special'
type SpecialPageType = 'frontispiece' | 'prologue' | 'interlude' | 'afterword' | 'special'

type Version = { id: number; title: string; draft: string; updatedAt: string }
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
  createdAt: string
  updatedAt: string
}

type MemoryItem = {
  id: number
  text: string
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
  versions?: Array<Partial<Version>>
  activeVersionId?: number
}

type WorkspaceData = {
  chapters?: LegacyChapter[]
  activeChapterId?: number
  memory?: Array<string | Partial<MemoryItem>>
  backups?: Array<Partial<BackupItem>>
  config?: Partial<ProviderConfig>
  customPrompt?: string
  skillsPrompt?: string
  sessionMap?: Record<string, string>
  skillModelName?: string
  draft?: string
}

type NormalizedWorkspace = {
  chapters: Chapter[]
  activeChapterId: number
  memory: MemoryItem[]
  backups: BackupItem[]
  config: ProviderConfig
  customPrompt: string
  skillsPrompt: string
  sessionMap: Record<string, string>
  skillModelName: string
}

type ProjectMeta = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = 'novelwriter.workspace.v3'
const LEGACY_KEYS = ['novelwriter.workspace.v2', 'novelwriter.workspace.v1']
const PROJECT_INDEX_KEY = 'novelwriter.projects.v1'
const PROJECT_DATA_PREFIX = 'novelwriter.project.v1.'
const LAST_PROJECT_KEY = 'novelwriter.project.last.v1'

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
const createSessionId = () => `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
const EMPTY_VERSIONS: Version[] = []
const VERSION_TAB_BASE_WIDTH = 132
const VERSION_TAB_CHAR_WIDTH = 14
const VERSION_TAB_CLOSE_WIDTH = 18
const VERSION_ADD_BUTTON_WIDTH = 112
const EDITOR_MENU_WIDTH = 260
const EDITOR_MENU_HEIGHT = 400
const EDITOR_THEME_ID = 'novelwriter-dark'
const SPECIAL_PAGE_META: Record<
  SpecialPageType,
  { title: string; railLabel: string }
> = {
  frontispiece: { title: '扉页', railLabel: '扉' },
  prologue: { title: '序章', railLabel: '序' },
  interlude: { title: '幕间', railLabel: '间' },
  afterword: { title: '后记', railLabel: '后' },
  special: { title: '特殊页', railLabel: '特' },
}

type LegacyBackupItem = Partial<{
  id: number
  title: string
  chapterId: number
  chapterTitle: string
  versionId: number
  versionTitle: string
  content: string
  createdAt: string
  updatedAt: string
}>
const SPECIAL_PAGE_OPTIONS: Array<{ type: SpecialPageType; label: string }> = [
  { type: 'frontispiece', label: '扉页' },
  { type: 'prologue', label: '序章' },
  { type: 'interlude', label: '幕间' },
  { type: 'afterword', label: '后记' },
  { type: 'special', label: '特殊页' },
]

function normalizeBaseUrl(baseUrl: string, provider: ProviderKind) {
  const clean = baseUrl.trim().replace(/\/+$/, '')
  if (!clean) return provider === 'ollama' ? 'http://localhost:11434' : ''
  return clean
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

const buildVersion = (id: number, index: number, draft: string, updatedAt = nowLabel()): Version => ({
  id,
  title: `版本${index}`,
  draft,
  updatedAt
})

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

function normalizeChapter(input: LegacyChapter, index: number): Chapter {
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
    const versions: Version[] = input.versions.map((version, versionIndex) => ({
      id: typeof version.id === 'number' ? version.id : versionIndex + 1,
      title:
        typeof version.title === 'string' && version.title.trim()
          ? version.title
          : `版本${versionIndex + 1}`,
      draft: typeof version.draft === 'string' ? version.draft : '',
      updatedAt:
        typeof version.updatedAt === 'string' && version.updatedAt.trim()
          ? version.updatedAt
          : nowLabel()
    }))
    const activeVersionId =
      typeof input.activeVersionId === 'number' &&
      versions.some((version) => version.id === input.activeVersionId)
        ? input.activeVersionId
        : versions[0].id
    return { id, kind, specialType, title, versions, activeVersionId }
  }

  const firstVersion = buildVersion(1, 1, typeof input.draft === 'string' ? input.draft : '')
  return { id, kind, specialType, title, versions: [firstVersion], activeVersionId: firstVersion.id }
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
    versions: [buildVersion(1, 1, '')],
    activeVersionId: 1
  }
  return {
    chapters: [firstChapter],
    activeChapterId: firstChapter.id,
    memory: [],
    backups: [],
    config: createDefaultConfig(),
    customPrompt: '为下一章提供 3 个悬念钩子。',
    skillsPrompt: '',
    sessionMap: {},
    skillModelName: ''
  }
}

function toWorkspaceData(snapshot: NormalizedWorkspace): WorkspaceData {
  return {
    chapters: snapshot.chapters,
    activeChapterId: snapshot.activeChapterId,
    memory: snapshot.memory,
    backups: snapshot.backups,
    config: snapshot.config,
    customPrompt: snapshot.customPrompt,
    skillsPrompt: snapshot.skillsPrompt,
    sessionMap: snapshot.sessionMap,
    skillModelName: snapshot.skillModelName
  }
}

function normalizeWorkspaceData(parsed: WorkspaceData): NormalizedWorkspace | null {
  let chapters: Chapter[] = []
  if (Array.isArray(parsed.chapters) && parsed.chapters.length > 0) {
    chapters = parsed.chapters.map(normalizeChapter)
  } else if (typeof parsed.draft === 'string') {
    chapters = [
      {
        id: 1,
        kind: 'chapter',
        title: '第1章',
        versions: [buildVersion(1, 1, parsed.draft)],
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

  const memory: MemoryItem[] = Array.isArray(parsed.memory)
    ? parsed.memory
        .map((entry, index) => {
          const text =
            typeof entry === 'string'
              ? entry
              : typeof entry?.text === 'string'
                ? entry.text
                : ''
          if (!text.trim()) return null

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

          return {
            id:
              typeof entry === 'object' && entry && typeof entry.id === 'number'
                ? entry.id
                : Date.now() + index,
            text: text.trim(),
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
          }
        })
        .filter((item): item is MemoryItem => item !== null)
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
          return {
            id: typeof backup.id === 'number' ? backup.id : Date.now() + index,
            title,
            content,
            createdAt,
            updatedAt
          }
        })
        .filter((item) => item.content.trim() || item.title.trim())
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
    memory,
    backups,
    config,
    customPrompt:
      typeof parsed.customPrompt === 'string'
        ? parsed.customPrompt
        : '为下一章提供 3 个悬念钩子。',
    skillsPrompt: typeof parsed.skillsPrompt === 'string' ? parsed.skillsPrompt : '',
    sessionMap:
      parsed.sessionMap && typeof parsed.sessionMap === 'object' ? parsed.sessionMap : {},
    skillModelName: typeof parsed.skillModelName === 'string' ? parsed.skillModelName : ''
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
  const editorContextMenuRef = useRef<HTMLDivElement | null>(null)
  const customSkillUploadRef = useRef<HTMLInputElement | null>(null)
  const versionTabsViewportRef = useRef<HTMLDivElement | null>(null)
  const versionMeasureRefs = useRef<Record<number, HTMLSpanElement | null>>({})
  const overflowMenuRef = useRef<HTMLDivElement | null>(null)
  const addPageMenuRef = useRef<HTMLDivElement | null>(null)
  const legacyWorkspace = useMemo(() => loadLegacyWorkspace(), [])
  const initialWorkspace = useMemo(
    () => legacyWorkspace ?? createDefaultWorkspace(),
    [legacyWorkspace]
  )

  const [projects, setProjects] = useState<ProjectMeta[]>(() => loadProjectIndex())
  const [activeProjectId, setActiveProjectId] = useState<string>(
    () => localStorage.getItem(LAST_PROJECT_KEY) ?? ''
  )
  const [activeScreen, setActiveScreen] = useState<'projects' | 'writer'>('projects')
  const [newProjectName, setNewProjectName] = useState('')
  const [appLanguage, setAppLanguage] = useState<AppLanguage>('zh-CN')
  const [projectStorageDir, setProjectStorageDir] = useState('')
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false)
  const [isApplyingProjectSettings, setIsApplyingProjectSettings] = useState(false)
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null)
  const [pendingDeleteProject, setPendingDeleteProject] = useState<ProjectMeta | null>(null)
  const [deleteProjectConfirmName, setDeleteProjectConfirmName] = useState('')

  const [chapters, setChapters] = useState<Chapter[]>(
    withOrderedChapterTitles(initialWorkspace.chapters)
  )
  const [activeChapterId, setActiveChapterId] = useState(initialWorkspace.activeChapterId)
  const [memory, setMemory] = useState<MemoryItem[]>(initialWorkspace.memory)
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
  const [isLoadingOllamaModels, setIsLoadingOllamaModels] = useState(false)
  const [result, setResult] = useState('')
  const [status, setStatus] = useState('就绪')
  const [connectionState, setConnectionState] = useState<ConnectionState>('unknown')
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
  const [backupSearchQuery, setBackupSearchQuery] = useState('')
  const [isAdvancedSettingsOpen, setIsAdvancedSettingsOpen] = useState(false)

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
  const currentDraft = activeVersion?.draft ?? ''
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
  const currentSessionKey =
    activeChapter && activeVersion ? `${activeChapter.id}:${activeVersion.id}` : ''
  const currentSessionId = currentSessionKey ? (sessionMap[currentSessionKey] ?? '') : ''
  const chapterVersions = activeChapter?.versions ?? EMPTY_VERSIONS
  const canDeleteVersion = chapterVersions.length > 1
  const visibleVersionSet = useMemo(() => new Set(visibleVersionIds), [visibleVersionIds])
  const overflowVersionSet = useMemo(() => new Set(overflowVersionIds), [overflowVersionIds])
  const visibleVersions =
    visibleVersionIds.length > 0
      ? chapterVersions.filter((version) => visibleVersionSet.has(version.id))
      : chapterVersions
  const overflowVersions = chapterVersions.filter((version) => overflowVersionSet.has(version.id))
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
    if (!keyword) return memory
    return memory.filter((item) => {
      const haystack = `${item.text}\n${item.chapterTitle}\n${item.versionTitle}`.toLowerCase()
      return haystack.includes(keyword)
    })
  }, [memory, memorySearchQuery])
  const filteredBackups = useMemo(() => {
    const keyword = backupSearchQuery.trim().toLowerCase()
    if (!keyword) return backups
    return backups.filter((item) => {
      const haystack = `${item.title}\n${item.content}`.toLowerCase()
      return haystack.includes(keyword)
    })
  }, [backups, backupSearchQuery])
  const railLabelByChapterId = useMemo(() => {
    let chapterSeq = 0
    const labelMap = new Map<number, string>()
    for (const chapter of chapters) {
      if (chapter.kind === 'chapter') {
        chapterSeq += 1
        labelMap.set(chapter.id, String(chapterSeq))
        continue
      }
      const type = chapter.specialType ?? 'special'
      labelMap.set(chapter.id, SPECIAL_PAGE_META[type].railLabel)
    }
    return labelMap
  }, [chapters])

  function buildWorkspaceSnapshot(): NormalizedWorkspace {
    return {
      chapters,
      activeChapterId,
      memory,
      backups,
      config,
      customPrompt,
      skillsPrompt,
      sessionMap,
      skillModelName
    }
  }

  function applyWorkspaceSnapshot(snapshot: NormalizedWorkspace) {
    setChapters(withOrderedChapterTitles(snapshot.chapters))
    setActiveChapterId(snapshot.activeChapterId)
    setMemory(snapshot.memory)
    setBackups(snapshot.backups)
    setConfig(snapshot.config)
    setCustomPrompt(snapshot.customPrompt)
    setSkillsPrompt(snapshot.skillsPrompt)
    setSessionMap(snapshot.sessionMap)
    setSkillModelName(snapshot.skillModelName)
    setActivePanel('memory')
    setResult('')
    setError('')
    setConnectionState('unknown')
    setMemorySearchQuery('')
    setBackupSearchQuery('')
    setIsAdvancedSettingsOpen(false)
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
    setPendingDeleteProject(project)
    setDeleteProjectConfirmName('')
  }

  function cancelDeleteProject() {
    setPendingDeleteProject(null)
    setDeleteProjectConfirmName('')
  }

  async function confirmDeleteProject() {
    const project = pendingDeleteProject
    if (!project) return
    const expectedName = project.name.trim()
    if (deleteProjectConfirmName.trim() !== expectedName) {
      setStatus(t('输入不匹配，已取消删除', 'Name mismatch. Deletion canceled.'))
      return
    }

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
        projectsDir: projectStorageDir
      })
      setAppLanguage(response.settings.language)
      setProjectStorageDir(response.settings.projectsDir)
      setStatus('项目设置已更新')
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新设置失败')
      setStatus('更新设置失败')
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

  function createProject() {
    const nextName =
      newProjectName.trim() ||
      (appLanguage === 'en-US' ? `New Project ${projects.length + 1}` : `新项目 ${projects.length + 1}`)
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
    setNewProjectName('')
    openProject(projectId, nextWorkspace)
    setStatus(`已创建项目：${nextName}`)
  }

  function openProjectCenter() {
    setProjects(loadProjectIndex())
    setActiveScreen('projects')
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
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (projects.length > 0 || !legacyWorkspace) return
    const now = nowLabel()
    const migrated: ProjectMeta = {
      id: createProjectId(),
      name: '迁移项目',
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
    activeProjectId,
    chapters,
    activeChapterId,
    memory,
    backups,
    config,
    customPrompt,
    skillsPrompt,
    sessionMap,
    skillModelName,
    activeScreen
  ])

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
  const canDeleteChapter = chapters.length > 1
  const hasSkillsCenter = Boolean(window.novelDesktopApi?.listSkills)
  const hasDesktopProjectStorage = Boolean(
    window.novelDesktopApi?.getProjectSettings && window.novelDesktopApi?.openProjectPackage
  )
  const editorContextMenuItems: EditorContextMenuItem[] = [
    {
      key: 'continue',
      label: '1 续写',
      shortcut: '',
      run: () => runAction(actions[0]),
      disabled: isRunning || !canRunSelectionActions
    },
    {
      key: 'polish',
      label: '2 润色',
      shortcut: '',
      run: () => runAction(actions[1]),
      disabled: isRunning || !canRunSelectionActions
    },
    {
      key: 'expand',
      label: '3 扩写',
      shortcut: '',
      run: () => runAction(actions[2]),
      disabled: isRunning || !canRunSelectionActions
    },
    {
      key: 'memory',
      label: '4 记忆',
      shortcut: '',
      run: () => runAction(actions[3]),
      disabled: isRunning || !canRunSelectionActions
    },
    {
      key: 'backup',
      label: '5 加入参考',
      shortcut: '',
      run: () => {
        const input = (selectedSnippet || readSelectedTextFromEditor()).trim()
        if (!input) return
        createBackup(input, '选中文本参考')
      },
      disabled: isRunning || !canRunSelectionActions
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

  async function refreshOllamaModels(options?: { silent?: boolean; syncModel?: boolean }) {
    const silent = Boolean(options?.silent)
    const syncModel = Boolean(options?.syncModel)
    if (config.kind !== 'ollama') return
    const baseUrl = normalizeBaseUrl(config.baseUrl, 'ollama')
    if (!baseUrl) return
    if (!silent) setIsLoadingOllamaModels(true)
    try {
      let models: string[] = []
      if (window.novelDesktopApi?.listOllamaModels) {
        const payload = await window.novelDesktopApi.listOllamaModels({ baseUrl })
        models = Array.isArray(payload?.models)
          ? payload.models.filter(
              (item): item is string => typeof item === 'string' && Boolean(item.trim())
            )
          : []
      } else {
        const response = await fetch(`${baseUrl}/api/tags`)
        if (!response.ok) throw new Error(`Ollama 请求失败：${response.status}`)
        const data = (await response.json()) as unknown
        models = pickOllamaModelNames(data)
      }

      const nextModels = [...new Set(models)].sort((a, b) => a.localeCompare(b, 'zh-CN'))
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

  useEffect(() => {
    if (config.kind !== 'ollama') return
    const baseUrl = normalizeBaseUrl(config.baseUrl, 'ollama')
    if (!baseUrl) return
    void (async () => {
      try {
        if (window.novelDesktopApi?.listOllamaModels) {
          const payload = await window.novelDesktopApi.listOllamaModels({ baseUrl })
          const next = Array.isArray(payload?.models)
            ? payload.models.filter(
                (item): item is string => typeof item === 'string' && Boolean(item.trim())
              )
            : []
          setOllamaModels([...new Set(next)].sort((a, b) => a.localeCompare(b, 'zh-CN')))
          return
        }
        const response = await fetch(`${baseUrl}/api/tags`)
        if (!response.ok) return
        const data = (await response.json()) as unknown
        setOllamaModels(pickOllamaModelNames(data))
      } catch {
        // silent sync on config change
      }
    })()
  }, [config.kind, config.baseUrl])

  useEffect(() => {
    setConnectionState('unknown')
  }, [config.kind, config.baseUrl, config.model, config.apiKey])

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

  function updateActiveDraft(nextDraft: string) {
    setChapters((previous) =>
      previous.map((chapter) => {
        if (chapter.id !== activeChapterId) return chapter
        return {
          ...chapter,
          versions: chapter.versions.map((version) =>
            version.id === chapter.activeVersionId
              ? version.draft === nextDraft
                ? version
                : { ...version, draft: nextDraft, updatedAt: nowLabel() }
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
    const firstVersion = buildVersion(1, 1, '')
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
    clearSelectionState()
    clearVersionRenameState()
    setStatus(`已切换到 ${activeChapter.title} / ${version.title}`)
  }

  function addVersion() {
    if (!activeChapter) return
    const nextId = Math.max(...activeChapter.versions.map((version) => version.id), 0) + 1
    const nextIndex = activeChapter.versions.length + 1
    const nextVersion = buildVersion(nextId, nextIndex, currentDraft)

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

  function createBackup(content: string, title?: string) {
    if (!content.trim()) return
    const now = nowLabel()
    const backup: BackupItem = {
      id: Date.now(),
      title: title?.trim() || '写作参考',
      content,
      createdAt: now,
      updatedAt: now
    }
    setBackups((previous) => [backup, ...previous].slice(0, 80))
    setStatus('已保存到共享参考库')
  }

  function deleteBackup(backupId: number) {
    setBackups((previous) => previous.filter((backup) => backup.id !== backupId))
    setStatus('已删除参考')
  }

  function updateBackup(backupId: number, patch: Partial<Pick<BackupItem, 'title' | 'content'>>) {
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

  function appendMemoryItems(items: string[]) {
    const normalized = items
      .map((item) => item.replace(/^[-*\d.\s]+/, '').trim())
      .filter(Boolean)
    if (!normalized.length) return

    const chapter = activeChapter ?? chapters[0]
    const version =
      activeVersion ??
      chapter?.versions.find((item) => item.id === chapter.activeVersionId) ??
      chapter?.versions[0]
    if (!chapter || !version) return

    const createdAt = nowLabel()

    setMemory((previous) => {
      const existing = new Set(
        previous.map((item) => `${item.chapterId}:${item.versionId}:${item.text}`)
      )
      const merged = [...previous]
      let nextId = previous.reduce((max, item) => Math.max(max, item.id), 0) + 1
      for (const text of normalized) {
        const key = `${chapter.id}:${version.id}:${text}`
        if (existing.has(key)) continue
        existing.add(key)
        merged.push({
          id: nextId,
          text,
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          versionId: version.id,
          versionTitle: version.title,
          createdAt
        })
        nextId += 1
      }
      return merged
    })
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
    clearSelectionState()
    setStatus(`已跳转到 ${chapter.title} / ${version.title}`)
  }

  async function askModel(instruction: string, input: string) {
    const provider = config.kind
    const baseUrl = normalizeBaseUrl(config.baseUrl, provider)
    const memoryItems = memory.map((item) => item.text)
    const sessionId = ensureCurrentSessionId()

    if (window.novelDesktopApi?.generate && sessionId) {
      const result = await window.novelDesktopApi.generate({
        provider,
        baseUrl,
        model: config.model,
        apiKey: config.apiKey,
        temperature: config.temperature,
        sessionId,
        instruction,
        input,
        memory: memoryItems,
        skillsPrompt,
      })
      return result.output?.trim() ?? ''
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
      return data.message?.content?.trim() ?? ''
    }

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
    return data.choices?.[0]?.message?.content?.trim() ?? ''
  }

  async function runAction(action: WriterAction | 'custom') {
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
      appendMemoryItems(items)
      setActivePanel('memory')
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

  async function testConnection() {
    setIsRunning(true)
    setError('')
    setConnectionState('checking')
    setStatus('正在测试连接')
    setActivePanel('result')
    try {
      const output = await askModel('只回复：OK', '连接测试')
      setResult(output || 'OK')
      setConnectionState('connected')
      setStatus('连接正常')
    } catch (err) {
      setError(err instanceof Error ? err.message : '连接失败')
      setConnectionState('failed')
      setStatus('连接失败')
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
      updateActiveDraft(result)
      return
    }
    const selections = (editor.getSelections() ?? []).filter(
      (selection) => selection && !selection.isEmpty()
    )
    if (!selections.length) {
      updateActiveDraft(result)
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

  const handleEditorMount: OnMount = (editor, monaco) => {
    defineEditorTheme(monaco)
    monaco.editor.setTheme(EDITOR_THEME_ID)
    editorRef.current = editor
    monacoRef.current = monaco

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, () => {
      const action = editor.getAction('editor.action.addSelectionToNextFindMatch')
      if (action) void action.run()
    })

    editor.onDidChangeCursorSelection(() => {
      refreshSelectionState()
    })
    editor.onDidChangeModelContent(() => {
      refreshSelectionState()
    })
    editor.onDidBlurEditorWidget(() => {
      closeEditorContextMenu()
    })
    editor.onDidScrollChange(() => {
      closeEditorContextMenu()
    })
    editor.onContextMenu((event) => {
      event.event.preventDefault()
      event.event.stopPropagation()
      refreshSelectionState()
      const browserEvent = event.event.browserEvent
      openEditorContextMenu(browserEvent.clientX, browserEvent.clientY)
    })

    refreshSelectionState()
  }

  if (activeScreen === 'projects') {
    return (
      <main className="project-shell">
        <section className="project-home">
          <header className="project-home-header">
            <div className="project-home-brand">
              <span className="brand-mark">N</span>
              <div>
                <strong>NovelWriter</strong>
                <span>{t('本地项目中心', 'Local Project Hub')}</span>
              </div>
            </div>
            <p>
              {t(
                '所有项目均保存在本地。每个项目会独立保存章节、版本、记忆、参考、Skills 和模型设置，可随时新建或继续续写。',
                'All projects are stored locally. Each project keeps chapters, versions, memory, references, Skills, and model settings independently.'
              )}
            </p>
          </header>

          <div className="project-create-row">
            <input
              placeholder={t(
                '输入项目名（可留空自动命名）',
                'Project name (optional; auto-generated if empty)'
              )}
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  createProject()
                }
              }}
            />
            <button className="primary-button" onClick={createProject}>
              {t('新建项目', 'Create Project')}
            </button>
            {activeProject && (
              <button className="text-button" onClick={() => openProject(activeProject.id)}>
                {t('继续上次项目', 'Resume Last Project')}
              </button>
            )}
          </div>

          {hasDesktopProjectStorage ? (
            <div className="project-settings">
              <button
                className="text-button project-settings-toggle"
                onClick={() => setIsProjectSettingsOpen((previous) => !previous)}
                type="button"
              >
                {isProjectSettingsOpen
                  ? t('收起设置', 'Hide Settings')
                  : t('设置', 'Settings')}
              </button>
              {isProjectSettingsOpen && (
                <div className="project-settings-panel">
                  <label>
                    <span>{t('软件语言', 'Language')}</span>
                    <select
                      value={appLanguage}
                      onChange={(event) => setAppLanguage(event.target.value as AppLanguage)}
                    >
                      <option value="zh-CN">中文</option>
                      <option value="en-US">English</option>
                    </select>
                  </label>
                  <label>
                    <span>{t('项目文件保存位置', 'Project Storage Directory')}</span>
                    <div className="project-storage-row">
                      <input
                        value={projectStorageDir}
                        onChange={(event) => setProjectStorageDir(event.target.value)}
                        placeholder={t('输入本地目录路径', 'Enter local directory path')}
                      />
                      <button className="text-button" onClick={() => void pickProjectStorageDir()}>
                        {t('选择目录', 'Browse')}
                      </button>
                    </div>
                  </label>
                  <p className="panel-note-tip project-settings-note">
                    {t(
                      '修改保存位置后，会将当前所有项目文件包迁移到新目录。',
                      'After changing the location, all existing project packages will be moved to the new directory.'
                    )}
                  </p>
                  <button
                    className="primary-button"
                    disabled={isApplyingProjectSettings}
                    onClick={() => void applyProjectSettings()}
                  >
                    {isApplyingProjectSettings
                      ? t('保存中...', 'Saving...')
                      : t('保存设置', 'Save Settings')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="panel-note-tip project-settings-note">
              {t(
                '当前环境不支持项目文件目录管理。',
                'Project file directory management is not available in this environment.'
              )}
            </p>
          )}

          <ul className="project-list">
            {projects.map((project) => (
              <li key={project.id}>
                <div>
                  <strong>{project.name}</strong>
                  <small>
                    {appLanguage === 'en-US'
                      ? `Updated ${project.updatedAt}`
                      : `更新于 ${project.updatedAt}`}
                  </small>
                </div>
                <div className="project-item-actions">
                  <button className="text-button" onClick={() => openProject(project.id)}>
                    {t('打开', 'Open')}
                  </button>
                  <button
                    className="text-button"
                    disabled={!hasDesktopProjectStorage}
                    onClick={() => void openProjectFiles(project)}
                  >
                    {t('查看文件', 'View Files')}
                  </button>
                  <button
                    className="text-button danger"
                    disabled={deletingProjectId === project.id}
                    onClick={() => requestDeleteProject(project)}
                  >
                    {deletingProjectId === project.id
                      ? t('删除中...', 'Deleting...')
                      : t('删除', 'Delete')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {!projects.length && (
            <p className="empty-tip">{t('还没有项目，先创建一个新项目。', 'No projects yet. Create one to start.')}</p>
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
                    `请输入项目名（文件名）"${pendingDeleteProject.name}" 以彻底删除。`,
                    `Type project name "${pendingDeleteProject.name}" to permanently delete.`
                  )}
                </p>
                <input
                  autoFocus
                  value={deleteProjectConfirmName}
                  onChange={(event) => setDeleteProjectConfirmName(event.target.value)}
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
                <div className="project-delete-modal-actions">
                  <button className="text-button" onClick={cancelDeleteProject}>
                    {t('取消', 'Cancel')}
                  </button>
                  <button
                    className="text-button danger"
                    disabled={deletingProjectId === pendingDeleteProject.id}
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
            <span className="brand-mark">N</span>
            <div>
              <strong>NovelWriter</strong>
              <span>{t('AI 写作辅助台', 'AI Writing Desk')}</span>
            </div>
          </div>
          <nav aria-label="菜单">
            <button>{t('文件', 'File')}</button>
            <button>{t('编辑', 'Edit')}</button>
            <button>{t('选择', 'Select')}</button>
            <button>{t('查找', 'Find')}</button>
            <button>{t('工具', 'Tools')}</button>
            <button onClick={openProjectCenter}>{t('项目', 'Projects')}</button>
          </nav>
          <div className="window-status">{status}</div>
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
          <section className="editor-pane" aria-label="正文编辑器">
            <div className="editor-toolbar">
              <div>
                <span>正文</span>
                <strong>
                  {activeChapter?.title ?? '第1章'} / {activeVersion?.title ?? '版本1'}
                </strong>
                {activeVersion?.updatedAt ? (
                  <span className="version-inline-time">路 {activeVersion.updatedAt}</span>
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
              {isRunning ? (
                <div className="command-strip-status">模型生成中，请稍后在输出面板查看....</div>
              ) : (
                actions.map((action) => (
                  <button
                    disabled={!canRunSelectionActions}
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
                  记忆会在每次生成时附加给模型，并进入当前章节会话上下文，适合存放世界观、人物设定和长期约束。
                </p>
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
                  <input
                    id="memory-search-input"
                    className="memory-search-input"
                    type="text"
                    value={memorySearchQuery}
                    onChange={(event) => setMemorySearchQuery(event.target.value)}
                    placeholder="输入关键词实时搜索全部记忆"
                  />
                </div>
                <ul className="memory-list">
                  {filteredMemory.map((item, index) => (
                    <li key={item.id} onClick={() => jumpToMemory(item)}>
                      <span>{index + 1}</span>
                      <div className="memory-content">
                        <button
                          className="memory-jump"
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            jumpToMemory(item)
                          }}
                        >
                          {item.chapterTitle} / {item.versionTitle}
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
                {!filteredMemory.length && (
                  <p className="empty-tip">
                    {memorySearchQuery.trim() ? '没有匹配的记忆。' : '暂无记忆。'}
                  </p>
                )}
                <button
                  className="text-button"
                  onClick={() => {
                    const chapter = activeChapter ?? chapters[0]
                    const version =
                      activeVersion ??
                      chapter?.versions.find((item) => item.id === chapter.activeVersionId) ??
                      chapter?.versions[0]
                    if (!chapter || !version) return
                    setMemory((previous) => {
                      const nextId =
                        previous.reduce((max, item) => Math.max(max, item.id), 0) + 1
                      return [
                        ...previous,
                        {
                          id: nextId,
                          text: '新记忆：',
                          chapterId: chapter.id,
                          chapterTitle: chapter.title,
                          versionId: version.id,
                          versionTitle: version.title,
                          createdAt: nowLabel()
                        }
                      ]
                    })
                  }}
                >
                  新增记忆
                </button>
              </section>
            )}

            {activePanel === 'backup' && (
              <section className="panel-section">
                <div className="paper-heading">
                  <p>参考</p>
                  <h2>共享参考库</h2>
                </div>
                <p className="backup-note-tip">仅用于写作参考，不会注入模型会话上下文。</p>
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
                  <input
                    id="backup-search-input"
                    className="memory-search-input"
                    type="text"
                    value={backupSearchQuery}
                    onChange={(event) => setBackupSearchQuery(event.target.value)}
                    placeholder="输入关键词实时搜索全部参考"
                  />
                </div>
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
                <button
                  className="text-button"
                  onClick={() => createBackup('写作参考内容', '新参考')}
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
                        onClick={() => void refreshOllamaModels({ syncModel: true })}
                        type="button"
                      >
                        {isLoadingOllamaModels ? '刷新中...' : '刷新模型'}
                      </button>
                    )}
                  </div>
                  {config.kind === 'ollama' && (
                    <small className="settings-inline-tip">
                      {ollamaModels.length
                        ? `可选 ${ollamaModels.length} 个本地模型`
                        : '未读取到本地模型（可手动输入）'}
                    </small>
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
                    disabled={isRunning}
                    onClick={() => void testConnection()}
                  >
                    测试连接
                  </button>
                  <div className={`settings-connection-state ${connectionStatusClass}`}>
                    <span className="settings-connection-dot" />
                    <span>{`当前模型连接：${connectionStatusLabel}`}</span>
                  </div>
                </div>
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
                <div className="result-actions">
                  <button onClick={insertResult} disabled={!result}>
                    插入到光标处
                  </button>
                  <button onClick={replaceSelection} disabled={!result}>
                    替换选中内容
                  </button>
                  <button onClick={addMemoryFromResult} disabled={!result}>
                    保存到记忆
                  </button>
                  <button onClick={() => createBackup(result)} disabled={!result}>
                    保存参考
                  </button>
                </div>
              </section>
            )}
          </aside>
        </div>
      </section>

      {editorContextMenu.open && (
        <div
          className="editor-context-menu"
          ref={editorContextMenuRef}
          style={{ left: editorContextMenu.x, top: editorContextMenu.y }}
        >
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
    </main>
  )
}

export default App

