const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  /**
   * CLI 명령어 템플릿을 실행합니다.
   * template 안의 {prompt}, {model} 이 실제 값으로 치환됩니다.
   * 예: 'claude -p {prompt} --model {model}'
   */
  runCli: (template, model, prompt) =>
    ipcRenderer.invoke('run-cli', { template, model, prompt }),
})
