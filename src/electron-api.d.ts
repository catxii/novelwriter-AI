type DesktopGeneratePayload = {
  provider: 'ollama' | 'openai'
  baseUrl: string
  model: string
  apiKey: string
  temperature: number
  sessionId: string
  instruction: string
  input: string
  memory: string[]
  skillsPrompt: string
}

type DesktopGenerateResult = {
  sessionId: string
  output: string
  diagnostics?: {
    generatedAt: string
    skillsLoaded: boolean
    skillsInjected: boolean
    skillsHit: boolean
    injectedThisRequest: boolean
    skillsPromptHash: string
    systemPromptHash: string
    systemPromptPreview: string
    latestRequest?: {
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
    requestLogs?: Array<{
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
    }>
  }
}

type DesktopCreateModelPayload = {
  baseModel: string
  modelName: string
  skillsPrompt: string
}

type DesktopCreateModelResult = {
  ok: boolean
  stdout?: string
  stderr?: string
  modelName?: string
}

type DesktopOllamaModelsResult = {
  models: string[]
  localModels?: string[]
  cloudModels?: string[]
  reachable?: boolean
  error?: string
  activationRequiredForLocal?: boolean
}

type DesktopActivationStatus = {
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

type DesktopSkillItem = {
  id: string
  key: string
  source: 'official' | 'custom'
  name: string
  fileName: string
  installed: boolean
  canRename: boolean
  canDelete: boolean
  updatedAt: string
  content: string
}

type DesktopSkillsPayload = {
  ok?: boolean
  catalog: DesktopSkillItem[]
  skillsPrompt: string
  officialDir?: string
}

type DesktopProjectMeta = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

type DesktopProjectSettings = {
  language: 'zh-CN' | 'en-US'
  projectsDir: string
  autoUpdate: boolean
  autoLaunch: boolean
  appVersion: string
}

type DesktopImportedProject = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  workspace: unknown
}

interface NovelDesktopApi {
  isDesktop: boolean
  generate(payload: DesktopGeneratePayload): Promise<DesktopGenerateResult>
  resetSession(payload: { sessionId: string }): Promise<{ ok: boolean }>
  createSkillModel(payload: DesktopCreateModelPayload): Promise<DesktopCreateModelResult>
  listOllamaModels(payload: {
    baseUrl: string
    includeCloud?: boolean
  }): Promise<DesktopOllamaModelsResult>
  signinOllama(): Promise<{ ok: boolean }>
  listSkills(): Promise<DesktopSkillsPayload>
  installSkill(payload: { id: string; source: 'official' | 'custom' }): Promise<DesktopSkillsPayload>
  uninstallSkill(payload: { id: string; source: 'official' | 'custom' }): Promise<DesktopSkillsPayload>
  createCustomSkill(payload: { name: string; content: string }): Promise<DesktopSkillsPayload>
  renameCustomSkill(payload: { id: string; name: string }): Promise<DesktopSkillsPayload>
  deleteCustomSkill(payload: { id: string }): Promise<DesktopSkillsPayload>
  getActivationStatus(): Promise<{ ok?: boolean; status?: DesktopActivationStatus } | DesktopActivationStatus>
  activateWithLicense(payload: {
    email: string
    activationCode: string
  }): Promise<{ ok: boolean; status: DesktopActivationStatus }>
  unbindCurrentMachine(): Promise<{ ok: boolean; status: DesktopActivationStatus }>
  openActivationDialog(payload?: { reason?: string }): Promise<{
    ok: boolean
    canceled?: boolean
    error?: string
    status?: DesktopActivationStatus
  }>
  getProjectSettings(): Promise<DesktopProjectSettings>
  updateProjectSettings(payload: {
    language?: 'zh-CN' | 'en-US'
    projectsDir?: string
    autoUpdate?: boolean
    autoLaunch?: boolean
  }): Promise<{ ok: boolean; settings: DesktopProjectSettings }>
  checkAppUpgrade(): Promise<{
    ok: boolean
    currentVersion: string
    latestVersion: string
    hasUpdate: boolean
    note: string
  }>
  pickProjectStorageDir(): Promise<{ canceled: boolean; path: string }>
  syncProjectsIndex(payload: { projects: DesktopProjectMeta[] }): Promise<{ ok: boolean; path: string }>
  syncProjectPackage(payload: {
    projectId: string
    projectName: string
    workspace: unknown
  }): Promise<{ ok: boolean; dirPath: string; filePath: string }>
  openProjectPackage(payload: { projectId: string; projectName?: string }): Promise<{
    ok: boolean
    path: string
    error?: string
  }>
  deleteProjectPackage(payload: { projectId: string; projectName?: string }): Promise<{
    ok: boolean
    path: string
  }>
  importProjectPackages(): Promise<{
    canceled: boolean
    imported: DesktopImportedProject[]
    importedCount: number
    skippedCount: number
  }>
  closeWindow(): Promise<{ ok: boolean }>
  minimizeWindow(): Promise<{ ok: boolean; isMaximized: boolean }>
  toggleMaximizeWindow(): Promise<{ ok: boolean; isMaximized: boolean }>
  getWindowMaximizedState(): Promise<{ ok: boolean; isMaximized: boolean }>
  applyWindowScreenMode(payload: {
    screen: 'projects' | 'writer'
  }): Promise<{ ok: boolean; isMaximized: boolean }>
  onWindowMaximizedChange(callback: (isMaximized: boolean) => void): () => void
}

declare global {
  interface Window {
    novelDesktopApi?: NovelDesktopApi
  }
}

export {}
