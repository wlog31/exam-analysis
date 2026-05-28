import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { AppSettings, ExamData } from '../types'
import { parseQuestionInfo } from '../utils/parseQuestionInfo'
import { mergeParsedAnswerSheets, parseAnswerSheet } from '../utils/parseAnswerSheet'
import { parseSubjectiveIrtWorkbook } from '../utils/parseSubjectiveIrt'
import { buildExamData } from '../utils/analytics'
import { readExcelRows, readExcelWorkbook } from '../services/excel'
import { mergeExamInfoMetadata } from '../utils/examMetadata'

const SETTINGS_KEY = 'exam_analysis_settings_v2'
const SAVED_ANALYSIS_KEY = 'exam_analysis_last_analysis_v1'

interface SavedAnalysis {
  version: 1
  savedAt: string
  examData: ExamData
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>
      return {
        questionInfoFileName: String(parsed.questionInfoFileName ?? '').trim(),
        answerFileName: String(parsed.answerFileName ?? '').trim(),
        subjectiveIrtFileName: String(parsed.subjectiveIrtFileName ?? '').trim(),
      }
    }
  } catch {
    // ignore
  }
  return { questionInfoFileName: '', answerFileName: '', subjectiveIrtFileName: '' }
}

function loadSavedAnalysis(): SavedAnalysis | null {
  try {
    const raw = localStorage.getItem(SAVED_ANALYSIS_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<SavedAnalysis>
    if (
      parsed.version !== 1
      || typeof parsed.savedAt !== 'string'
      || !isValidSavedExamData(parsed.examData)
    ) {
      localStorage.removeItem(SAVED_ANALYSIS_KEY)
      return null
    }

    return parsed as SavedAnalysis
  } catch {
    localStorage.removeItem(SAVED_ANALYSIS_KEY)
    return null
  }
}

function saveAnalysis(examData: ExamData): string | null {
  const savedAt = new Date().toISOString()
  try {
    localStorage.setItem(SAVED_ANALYSIS_KEY, JSON.stringify({ version: 1, savedAt, examData }))
    return savedAt
  } catch {
    return null
  }
}

function isValidSavedExamData(value: unknown): value is ExamData {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<ExamData>
  return !!data.examInfo
    && Array.isArray(data.questions)
    && Array.isArray(data.students)
    && Array.isArray(data.questionStats)
    && Array.isArray(data.subjectiveQuestionStats)
}

function formatAnswerFileNames(files: Array<{ name: string }>): string {
  if (files.length === 0) return ''
  if (files.length === 1) return files[0].name
  return `${files.length}개 파일: ${files.map(file => file.name).join(', ')}`
}

interface LoadedFile {
  name: string
  rows: string[][]
  sheetName: string
}

interface LoadedSubjectiveIrtFile {
  name: string
  sheetName: string
  data: NonNullable<ExamData['subjectiveIrtData']>
}

interface AppContextValue {
  settings: AppSettings

  questionInfoFile: LoadedFile | null
  answerFiles: LoadedFile[]
  subjectiveIrtFile: LoadedSubjectiveIrtFile | null

  selectQuestionInfoFile: (file: File) => Promise<void>
  selectAnswerFiles: (files: File[]) => Promise<void>
  selectSubjectiveIrtFile: (file: File) => Promise<void>
  clearQuestionInfoFile: () => void
  clearAnswerFile: () => void
  clearSubjectiveIrtFile: () => void

  examData: ExamData | null
  lastAnalysisSavedAt: string | null
  clearSavedAnalysis: () => void
  loading: boolean
  error: string | null
  loadData: () => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const [questionInfoFile, setQuestionInfoFile] = useState<LoadedFile | null>(null)
  const [answerFiles, setAnswerFiles] = useState<LoadedFile[]>([])
  const [subjectiveIrtFile, setSubjectiveIrtFile] = useState<LoadedSubjectiveIrtFile | null>(null)
  const [savedAnalysis] = useState<SavedAnalysis | null>(loadSavedAnalysis)
  const [examData, setExamData] = useState<ExamData | null>(() => savedAnalysis?.examData ?? null)
  const [lastAnalysisSavedAt, setLastAnalysisSavedAt] = useState<string | null>(() => savedAnalysis?.savedAt ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clearCurrentAnalysis = useCallback(() => {
    setExamData(null)
    setLastAnalysisSavedAt(null)
  }, [])

  const selectQuestionInfoFile = useCallback(async (file: File) => {
    setLoading(true)
    setError(null)
    clearCurrentAnalysis()
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
  }, [clearCurrentAnalysis])

  const selectAnswerFiles = useCallback(async (files: File[]) => {
    const selectedFiles = files.filter(Boolean)
    if (selectedFiles.length === 0) return

    setLoading(true)
    setError(null)
    clearCurrentAnalysis()
    try {
      const loadedFiles = await Promise.all(selectedFiles.map(async file => {
        const { rows, sheetName } = await readExcelRows(file, /정오|응답|점수|결과/)
        return { name: file.name, rows, sheetName }
      }))

      setAnswerFiles(loadedFiles)
      setSettings(prev => {
        const next = { ...prev, answerFileName: formatAnswerFileNames(loadedFiles) }
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
        return next
      })
    } catch (e) {
      setAnswerFiles([])
      setError(e instanceof Error ? e.message : '정오표 파일을 읽는 데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }, [clearCurrentAnalysis])

  const selectSubjectiveIrtFile = useCallback(async (file: File) => {
    setLoading(true)
    setError(null)
    clearCurrentAnalysis()
    try {
      const workbook = await readExcelWorkbook(file)
      const data = parseSubjectiveIrtWorkbook(workbook, file.name)
      setSubjectiveIrtFile({
        name: file.name,
        sheetName: `${workbook.sheetNames.length}개 시트`,
        data,
      })
      setSettings(prev => {
        const next = { ...prev, subjectiveIrtFileName: file.name }
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
        return next
      })
    } catch (e) {
      setSubjectiveIrtFile(null)
      setError(e instanceof Error ? e.message : '서답형 IRT 파일을 읽는 데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }, [clearCurrentAnalysis])

  const clearQuestionInfoFile = useCallback(() => {
    setQuestionInfoFile(null)
    clearCurrentAnalysis()
    setSettings(prev => {
      const next = { ...prev, questionInfoFileName: '' }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
      return next
    })
  }, [clearCurrentAnalysis])

  const clearAnswerFile = useCallback(() => {
    setAnswerFiles([])
    clearCurrentAnalysis()
    setSettings(prev => {
      const next = { ...prev, answerFileName: '' }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
      return next
    })
  }, [clearCurrentAnalysis])

  const clearSubjectiveIrtFile = useCallback(() => {
    setSubjectiveIrtFile(null)
    clearCurrentAnalysis()
    setSettings(prev => {
      const next = { ...prev, subjectiveIrtFileName: '' }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
      return next
    })
  }, [clearCurrentAnalysis])

  const clearSavedAnalysis = useCallback(() => {
    localStorage.removeItem(SAVED_ANALYSIS_KEY)
    setExamData(null)
    setLastAnalysisSavedAt(null)
  }, [])

  const loadData = useCallback(async () => {
    if (!questionInfoFile) {
      setError('문항정보표 파일을 먼저 선택해 주세요.')
      return
    }
    if (answerFiles.length === 0) {
      setError('정오표 파일을 먼저 선택해 주세요.')
      return
    }

    setLoading(true)
    setError(null)
    clearCurrentAnalysis()
    try {
      const parsedQ = parseQuestionInfo(questionInfoFile.rows)
      const parsedAnswerSheets = answerFiles.map(file => ({
        fileName: file.name,
        sheet: parseAnswerSheet(file.rows),
      }))
      const parsedA = mergeParsedAnswerSheets(parsedAnswerSheets)

      if (parsedQ.questions.length === 0 || parsedA.students.length === 0) {
        setError(
          `데이터를 읽었지만 파싱 결과가 비어 있습니다. (문항 ${parsedQ.questions.length}개, 학생 ${parsedA.students.length}명) `
          + '파일을 다시 확인해 주세요.',
        )
        return
      }

      const examInfo = mergeExamInfoMetadata(parsedQ.examInfo, parsedA.examInfo)
      const data = buildExamData(examInfo, parsedQ.questions, parsedA, subjectiveIrtFile?.data)
      const savedAt = saveAnalysis(data)
      setExamData(data)
      setLastAnalysisSavedAt(savedAt)
      if (!savedAt) {
        setError('분석은 완료됐지만 저장 공간이 부족해 다음 실행 시 자동 복원되지 않을 수 있습니다.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [questionInfoFile, answerFiles, subjectiveIrtFile, clearCurrentAnalysis])

  return (
    <AppContext.Provider
      value={{
        settings,
        questionInfoFile,
        answerFiles,
        subjectiveIrtFile,
        selectQuestionInfoFile,
        selectAnswerFiles,
        selectSubjectiveIrtFile,
        clearQuestionInfoFile,
        clearAnswerFile,
        clearSubjectiveIrtFile,
        examData,
        lastAnalysisSavedAt,
        clearSavedAnalysis,
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

