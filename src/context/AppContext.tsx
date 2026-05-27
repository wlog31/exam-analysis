import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { AppSettings, ExamData } from '../types'
import { parseQuestionInfo } from '../utils/parseQuestionInfo'
import { parseAnswerSheet } from '../utils/parseAnswerSheet'
import { buildExamData } from '../utils/analytics'
import { readExcelRows } from '../services/excel'

const SETTINGS_KEY = 'exam_analysis_settings_v2'

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>
      return {
        questionInfoFileName: String(parsed.questionInfoFileName ?? '').trim(),
        answerFileName: String(parsed.answerFileName ?? '').trim(),
      }
    }
  } catch {
    // ignore
  }
  return { questionInfoFileName: '', answerFileName: '' }
}

interface LoadedFile {
  name: string
  rows: string[][]
  sheetName: string
}

interface AppContextValue {
  settings: AppSettings

  questionInfoFile: LoadedFile | null
  answerFile: LoadedFile | null

  selectQuestionInfoFile: (file: File) => Promise<void>
  selectAnswerFile: (file: File) => Promise<void>
  clearQuestionInfoFile: () => void
  clearAnswerFile: () => void

  examData: ExamData | null
  loading: boolean
  error: string | null
  loadData: () => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const [questionInfoFile, setQuestionInfoFile] = useState<LoadedFile | null>(null)
  const [answerFile, setAnswerFile] = useState<LoadedFile | null>(null)
  const [examData, setExamData] = useState<ExamData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectQuestionInfoFile = useCallback(async (file: File) => {
    setLoading(true)
    setError(null)
    setExamData(null)
    try {
      const { rows, sheetName } = await readExcelRows(file, /문항|정보|기준/)
      setQuestionInfoFile({ name: file.name, rows, sheetName })
      setSettings(prev => {
        const next = { ...prev, questionInfoFileName: file.name }
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
        return next
      })
    } catch (e) {
      setQuestionInfoFile(null)
      setError(e instanceof Error ? e.message : '문항정보표 파일을 읽는 데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  const selectAnswerFile = useCallback(async (file: File) => {
    setLoading(true)
    setError(null)
    setExamData(null)
    try {
      const { rows, sheetName } = await readExcelRows(file, /정오|응답|점수|결과/)
      setAnswerFile({ name: file.name, rows, sheetName })
      setSettings(prev => {
        const next = { ...prev, answerFileName: file.name }
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
        return next
      })
    } catch (e) {
      setAnswerFile(null)
      setError(e instanceof Error ? e.message : '정오표 파일을 읽는 데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  const clearQuestionInfoFile = useCallback(() => {
    setQuestionInfoFile(null)
    setExamData(null)
    setSettings(prev => {
      const next = { ...prev, questionInfoFileName: '' }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const clearAnswerFile = useCallback(() => {
    setAnswerFile(null)
    setExamData(null)
    setSettings(prev => {
      const next = { ...prev, answerFileName: '' }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const loadData = useCallback(async () => {
    if (!questionInfoFile) {
      setError('문항정보표 파일을 먼저 선택해 주세요.')
      return
    }
    if (!answerFile) {
      setError('정오표 파일을 먼저 선택해 주세요.')
      return
    }

    setLoading(true)
    setError(null)
    setExamData(null)
    try {
      const parsedQ = parseQuestionInfo(questionInfoFile.rows)
      const parsedA = parseAnswerSheet(answerFile.rows)

      if (parsedQ.questions.length === 0 || parsedA.students.length === 0) {
        setError(
          `데이터를 읽었지만 파싱 결과가 비어 있습니다. (문항 ${parsedQ.questions.length}개, 학생 ${parsedA.students.length}명) `
          + '파일을 다시 확인해 주세요.',
        )
        return
      }

      const data = buildExamData(parsedQ.examInfo, parsedQ.questions, parsedA)
      setExamData(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [questionInfoFile, answerFile])

  return (
    <AppContext.Provider
      value={{
        settings,
        questionInfoFile,
        answerFile,
        selectQuestionInfoFile,
        selectAnswerFile,
        clearQuestionInfoFile,
        clearAnswerFile,
        examData,
        loading,
        error,
        loadData,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
