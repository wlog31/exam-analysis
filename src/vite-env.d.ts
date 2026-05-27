/// <reference types="vite/client" />

interface Window {
  electronAPI?: {
    isElectron: boolean
    /** template 안의 {prompt}, {model}이 실제 값으로 치환되어 실행됩니다. */
    runCli: (template: string, model: string, prompt: string) => Promise<string>
  }
}
