/**
 * AiDraftSection.tsx
 * Claude / GPT / Gemini  API 또는 CLI로 세특 초안을 생성하는 UI 컴포넌트
 */

import { useState, useEffect } from 'react'
import {
  AI_MODELS,
  PROVIDER_LABELS,
  generateApiDraft,
  generateCliDraft,
  buildCliPreview,
  getEnvApiKey,
  getCliCommand,
  setCliCommand,
  type AiProvider,
  type ConnectionMode,
} from '../../services/aiDraft'

interface Props {
  prompt: string
}

const PROVIDERS: AiProvider[] = ['claude', 'openai', 'gemini']

const CLI_PLACEHOLDER: Record<AiProvider, string> = {
  claude: 'claude --print --model {model} {prompt}',
  openai: 'codex exec --model {model} {prompt}',
  gemini: 'gemini --model {model} --prompt {prompt}',
}

const CLI_HINT: Record<AiProvider, string> = {
  claude: 'Claude Code CLI — npm i -g @anthropic-ai/claude-code',
  openai: 'OpenAI Codex CLI — npm i -g @openai/codex',
  gemini: 'Google Gemini CLI — npm i -g @google/gemini-cli',
}

export default function AiDraftSection({ prompt }: Props) {
  const [provider, setProvider] = useState<AiProvider>('claude')
  const [mode, setMode]         = useState<ConnectionMode>('api')
  const [model, setModel]       = useState<string>(AI_MODELS.claude[0].id)
  const [cliCmd, setCliCmd]     = useState<string>('')
  const [draft, setDraft]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [copied, setCopied]     = useState(false)

  const isElectron = !!window.electronAPI?.isElectron
  const envKey     = getEnvApiKey(provider)

  // provider 변경 시 모델·CLI 명령어 리셋
  useEffect(() => {
    setModel(AI_MODELS[provider][0].id)
    setCliCmd(getCliCommand(provider))
    setDraft('')
    setError(null)
  }, [provider])

  // CLI 모드인데 Electron이 아니면 API로 강제
  useEffect(() => {
    if (mode === 'cli' && !isElectron) setMode('api')
  }, [mode, isElectron])

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    setDraft('')
    try {
      let result: string
      if (mode === 'api') {
        result = await generateApiDraft({ provider, model, prompt })
      } else {
        setCliCommand(provider, cliCmd)
        result = await generateCliDraft(provider, model, prompt)
      }
      setDraft(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : '생성 실패')
    } finally {
      setLoading(false)
    }
  }

  function handleCopy() {
    if (!draft) return
    navigator.clipboard.writeText(draft).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  const charCount    = draft.replace(/\s/g, '').length
  const cliPreview   = mode === 'cli' ? buildCliPreview(provider, model) : ''
  const canGenerate  = !loading &&
    (mode === 'api' ? !!envKey : !!cliCmd.trim())

  return (
    <div className="border border-violet-100 rounded-lg overflow-hidden">
      {/* 헤더 */}
      <div className="px-4 py-2.5 bg-violet-50 flex items-center justify-between">
        <span className="text-sm font-semibold text-violet-700">AI 세특 초안 생성</span>
        <span className="text-xs text-violet-400">결과물은 반드시 교사가 검수하세요</span>
      </div>

      <div className="p-4 space-y-4">

        {/* Provider 탭 */}
        <div className="flex gap-1">
          {PROVIDERS.map(p => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                provider === p
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300'
              }`}
            >
              {PROVIDER_LABELS[p]}
            </button>
          ))}
        </div>

        {/* 연결 방식 토글 */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          {(['api', 'cli'] as ConnectionMode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              disabled={m === 'cli' && !isElectron}
              title={m === 'cli' && !isElectron ? '데스크톱 앱에서만 사용 가능합니다' : undefined}
              className={`px-4 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                mode === m
                  ? 'bg-white text-violet-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {m === 'api' ? 'API 키' : 'CLI'}
            </button>
          ))}
        </div>

        {/* ── 공통: 모델 선택 ── */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">모델</label>
          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
          >
            {AI_MODELS[provider].map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* ── API 모드 전용: 키 상태 ── */}
        {mode === 'api' && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border ${
            envKey
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}>
            <span>{envKey ? '✓' : '!'}</span>
            {envKey
              ? `${PROVIDER_LABELS[provider]} API 키 설정됨 (.env)`
              : `.env 파일에 ${
                  provider === 'claude' ? 'VITE_ANTHROPIC_API_KEY' :
                  provider === 'openai' ? 'VITE_OPENAI_API_KEY' :
                  'VITE_GEMINI_API_KEY'
                }를 추가한 뒤 재빌드하세요`
            }
          </div>
        )}

        {/* ── CLI 모드 전용: 명령어 + 미리보기 ── */}
        {mode === 'cli' && (
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                CLI 명령어 템플릿
                <span className="ml-2 font-normal text-gray-400">{'{prompt}'} · {'{model}'} 위치에 값이 자동 삽입됩니다</span>
              </label>
              <input
                type="text"
                value={cliCmd}
                onChange={e => setCliCmd(e.target.value)}
                placeholder={CLI_PLACEHOLDER[provider]}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>
            {/* 실행 명령어 미리보기 */}
            <div className="bg-gray-900 text-green-400 rounded-lg px-3 py-2 text-xs font-mono flex items-center gap-2">
              <span className="text-gray-500 select-none">$</span>
              <span className="break-all">{cliPreview || '(명령어를 입력하세요)'}</span>
            </div>
            {/* CLI 도구 안내 */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-500 space-y-0.5">
              <p className="font-medium text-gray-600">권장 CLI 도구</p>
              <p>{CLI_HINT[provider]}</p>
              <p className="text-gray-400 pt-0.5">PATH에 설치 후 사용하세요. 설정한 템플릿은 앱 재시작 후에도 유지됩니다.</p>
            </div>
          </div>
        )}

        {/* 생성 버튼 */}
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white text-sm font-medium transition-colors"
        >
          {loading
            ? '생성 중...'
            : `${PROVIDER_LABELS[provider]} ${mode === 'cli' ? 'CLI' : 'API'}로 초안 생성`}
        </button>

        {/* 오류 */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg whitespace-pre-wrap">
            {error}
          </div>
        )}

        {/* 결과 */}
        {draft && (
          <div className="space-y-2">
            <div className="bg-violet-50 border border-violet-200 rounded-lg p-3">
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{draft}</p>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">{charCount}자 (공백 제외)</span>
              <button
                onClick={handleCopy}
                className="text-xs px-3 py-1 rounded border border-violet-200 hover:bg-violet-50 text-violet-600"
              >
                {copied ? '복사됨 ✓' : '클립보드에 복사'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
