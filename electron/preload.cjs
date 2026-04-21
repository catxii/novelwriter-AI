const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('novelDesktopApi', {
  isDesktop: true,
  generate(payload) {
    return ipcRenderer.invoke('novel:generate', payload)
  },
  resetSession(payload) {
    return ipcRenderer.invoke('novel:reset-session', payload)
  },
  createSkillModel(payload) {
    return ipcRenderer.invoke('novel:create-skill-model', payload)
  },
  listOllamaModels(payload) {
    return ipcRenderer.invoke('novel:ollama-models', payload)
  },
  signinOllama() {
    return ipcRenderer.invoke('novel:ollama-signin')
  },
  listSkills() {
    return ipcRenderer.invoke('novel:skills-list')
  },
  installSkill(payload) {
    return ipcRenderer.invoke('novel:skills-install', payload)
  },
  uninstallSkill(payload) {
    return ipcRenderer.invoke('novel:skills-uninstall', payload)
  },
  createCustomSkill(payload) {
    return ipcRenderer.invoke('novel:skills-create-custom', payload)
  },
  renameCustomSkill(payload) {
    return ipcRenderer.invoke('novel:skills-rename-custom', payload)
  },
  deleteCustomSkill(payload) {
    return ipcRenderer.invoke('novel:skills-delete-custom', payload)
  },
  getProjectSettings() {
    return ipcRenderer.invoke('novel:project-settings-get')
  },
  updateProjectSettings(payload) {
    return ipcRenderer.invoke('novel:project-settings-update', payload)
  },
  pickProjectStorageDir() {
    return ipcRenderer.invoke('novel:project-storage-pick-dir')
  },
  syncProjectsIndex(payload) {
    return ipcRenderer.invoke('novel:project-sync-index', payload)
  },
  syncProjectPackage(payload) {
    return ipcRenderer.invoke('novel:project-sync-package', payload)
  },
  openProjectPackage(payload) {
    return ipcRenderer.invoke('novel:project-open-package', payload)
  },
  deleteProjectPackage(payload) {
    return ipcRenderer.invoke('novel:project-delete-package', payload)
  },
  closeWindow() {
    return ipcRenderer.invoke('novel:window-close')
  },
  minimizeWindow() {
    return ipcRenderer.invoke('novel:window-minimize')
  },
  toggleMaximizeWindow() {
    return ipcRenderer.invoke('novel:window-toggle-maximize')
  },
  getWindowMaximizedState() {
    return ipcRenderer.invoke('novel:window-is-maximized')
  },
  applyWindowScreenMode(payload) {
    return ipcRenderer.invoke('novel:window-apply-screen-mode', payload)
  },
  onWindowMaximizedChange(callback) {
    if (typeof callback !== 'function') return () => {}
    const listener = (_event, payload) => {
      callback(Boolean(payload?.isMaximized))
    }
    ipcRenderer.on('novel:window-maximized-changed', listener)
    return () => {
      ipcRenderer.removeListener('novel:window-maximized-changed', listener)
    }
  },
})

window.addEventListener(
  'contextmenu',
  (event) => {
    event.preventDefault()
  },
  true
)
