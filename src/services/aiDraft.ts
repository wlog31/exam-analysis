/**
 * aiDraft.ts
 * Claude / GPT / Gemini  API 및 CLI 호출 래퍼
 *
 * API 키는 .env 파일의 VITE_* 환경 변수에서만 읽습니다.
 * CLI 명령어는 localStorage에 저장하여 앱 재실행 시에도 유지합니다.
 */

export type AiProvider = 'claude' | 'openai' | 'gemini'
export type ConnectionMode = 'api' | 'cli'

export interface ModelOption {
  id: string
  label: string
}

export const AI_MODELS: Record<AiProvider, ModelOption[]> = {
  claude: [
    { id: 'claude-opus-4-6',          label: 'Claude Opus 4'     },
    { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.5' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5'  },
  ],
  openai: [
    { id: 'gpt-5.5',           label: 'GPT-5.5'            },
    { id: 'gpt-5.4',           label: 'GPT-5.4'            },
    { id: 'gpt-5.2-codex',     label: 'GPT-5.2 Codex'      },
    { id: 'gpt-5.1-codex',     label: 'GPT-5.1 Codex'      },
    { id: 'gpt-5.1-codex-mini',label: 'GPT-5.1 Codex Mini' },
    { id: 'gpt-5.1-codex-max', label: 'GPT-5.1 Codex Max'  },
    { id: 'gpt-4o',            label: 'GPT-4o'             },
    { id: 'o4-mini',           label: 'o4-mini'            },
  ],
  gemini: [
    { id: 'flash',      label: 'Gemini Flash'      },
    { id: 'pro',        label: 'Gemini Pro'        },
    { id: 'auto',       label: 'Gemini Auto'       },
    { id: 'flash-lite', label: 'Gemini Flash Lite' },
  ],
}

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  claude: 'Claude',
  openai: 'GPT',
  gemini: 'Gemini',
}

/** .env 파일의 VITE_* 환경 변수에서 API 키를 읽습니다 (빌드 시 임베드). */
export function getEnvApiKey(provider: AiProvider): string {
  switch (provider) {
    case 'claude': return import.meta.env.VITE_ANTHROPIC_API_KEY ?? ''
    case 'openai': return import.meta.env.VITE_OPENAI_API_KEY ?? ''
    case 'gemini': return import.meta.env.VITE_GEMINI_API_KEY ?? ''
  }
}

// ─────────────────────────────────────────────
// CLI 명령어 (localStorage)
// ─────────────────────────────────────────────

/**
 * CLI 명령어 템플릿 기본값.
 * {prompt}와 {model}이 실행 시 실제 값으로 치환됩니다.
 */
const DEFAULT_CLI_TEMPLATES: Record<AiProvider, string> = {
  claude: 'claude --print --model {model} {prompt}',
  openai: 'codex exec --model {model} {prompt}',
  gemini: 'gemini --model {model} --prompt {prompt}',
}

const LEGACY_CLI_TEMPLATES: Partial<Record<AiProvider, string[]>> = {
  claude: ['claude -p {prompt} --model {model}'],
  openai: ['codex --model {model} {prompt}'],
  gemini: ['gemini --model {model} {prompt}'],
}

export function getCliCommand(provider: AiProvider): string {
  const key = `cli_cmd_${provider}`
  const saved = localStorage.getItem(key)
  if (!saved) return DEFAULT_CLI_TEMPLATES[provider]

  if (LEGACY_CLI_TEMPLATES[provider]?.includes(saved.trim())) {
    localStorage.setItem(key, DEFAULT_CLI_TEMPLATES[provider])
    return DEFAULT_CLI_TEMPLATES[provider]
  }

  return saved
}

export function setCliCommand(provider: AiProvider, cmd: string): void {
  localStorage.setItem(`cli_cmd_${provider}`, cmd.trim())
}

// ─────────────────────────────────────────────
// API 호출
// ─────────────────────────────────────────────

async function callClaude(prompt: string, model: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>
    const msg = (err?.error as Record<string, unknown>)?.message ?? res.statusText
    throw new Error(`Claude API 오류 (${res.status}): ${msg}`)
  }
  const data = await res.json() as { content?: Array<{ text?: string }> }
  return data.content?.[0]?.text?.trim() ?? ''
}

async function callOpenAI(prompt: string, model: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>
    const msg = (err?.error as Record<string, unknown>)?.message ?? res.statusText
    throw new Error(`OpenAI API 오류 (${res.status}): ${msg}`)
  }
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
  return data.choices?.[0]?.message?.content?.trim() ?? ''
}

async function callGemini(prompt: string, model: string, apiKey: string): Promise<string> {
  const apiModel = resolveGeminiApiModel(model)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1024 },
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>
    const msg = (err?.error as Record<string, unknown>)?.message ?? res.statusText
    throw new Error(`Gemini API 오류 (${res.status}): ${msg}`)
  }
  const data = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
}

function resolveGeminiApiModel(model: string): string {
  switch (model) {
    case 'auto':
    case 'pro':
      return 'gemini-2.5-pro'
    case 'flash':
      return 'gemini-2.5-flash'
    case 'flash-lite':
      return 'gemini-2.5-flash-lite'
    case 'gemini-2.0-flash':
    case 'gemini-1.5-flash':
      return 'gemini-2.5-flash'
    case 'gemini-1.5-pro':
      return 'gemini-2.5-pro'
    default:
      return model
  }
}

export interface ApiDraftRequest {
  provider: AiProvider
  model: string
  prompt: string
}

export async function generateApiDraft(req: ApiDraftRequest): Promise<string> {
  const apiKey = getEnvApiKey(req.provider)
  if (!apiKey) throw new Error(
    `API 키가 설정되지 않았습니다.\n.env 파일에 ${
      req.provider === 'claude' ? 'VITE_ANTHROPIC_API_KEY' :
      req.provider === 'openai' ? 'VITE_OPENAI_API_KEY' :
      'VITE_GEMINI_API_KEY'
    }를 추가한 뒤 재빌드하세요.`
  )
  switch (req.provider) {
    case 'claude': return callClaude(req.prompt, req.model, apiKey)
    case 'openai': return callOpenAI(req.prompt, req.model, apiKey)
    case 'gemini': return callGemini(req.prompt, req.model, apiKey)
  }
}

// ─────────────────────────────────────────────
// CLI 호출 (Electron 전용 – stdin으로 prompt 전달)
// ─────────────────────────────────────────────

export async function generateCliDraft(
  provider: AiProvider,
  model: string,
  prompt: string,
): Promise<string> {
  if (!window.electronAPI?.isElectron) {
    throw new Error('CLI 실행은 데스크톱 앱에서만 지원됩니다.')
  }
  if (!prompt.trim()) {
    throw new Error('AI에 전달할 프롬프트가 비어 있습니다. 학생 데이터가 정상적으로 로드되었는지 확인하세요.')
  }
  const template = getCliCommand(provider)
  if (!template.trim()) throw new Error('CLI 명령어 템플릿이 설정되지 않았습니다.')
  return window.electronAPI.runCli(template, model, prompt)
}

/**
 * 실행될 CLI 명령어 전체를 반환합니다 (UI 미리보기용).
 * {prompt}는 축약 표시, {model}은 실제 모델명으로 치환합니다.
 */
export function buildCliPreview(provider: AiProvider, model: string): string {
  const template = getCliCommand(provider)
  if (!template.trim()) return '(명령어 미설정)'
  return template
    .replace(/\{model\}/g, model)
    .replace(/\{prompt\}/g, '"<프롬프트>"')
}
