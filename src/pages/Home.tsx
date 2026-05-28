import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

const EXCEL_FILE_ACCEPT = '.xlsx,.xls'
const EXCEL_FILE_EXTENSIONS = ['.xlsx', '.xls']

export default function Home() {
  const {
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
    loadData,
    loading,
    error,
    examData,
    lastAnalysisSavedAt,
    clearSavedAnalysis,
  } = useApp()

  const navigate = useNavigate()

  const isReady = !!questionInfoFile && answerFiles.length > 0

  async function handleQuestionInfoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) await handleQuestionInfoFile(file)
    e.target.value = ''
  }

  async function handleAnswerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) await handleAnswerFiles(files)
    e.target.value = ''
  }

  async function handleSubjectiveIrtChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) await handleSubjectiveIrtFile(file)
    e.target.value = ''
  }

  async function handleQuestionInfoFile(file: File) {
    if (!validateExcelFile(file)) return
    await selectQuestionInfoFile(file)
  }

  async function handleAnswerFiles(files: File[]) {
    if (!validateExcelFiles(files)) return
    await selectAnswerFiles(files)
  }

  async function handleSubjectiveIrtFile(file: File) {
    if (!validateExcelFile(file)) return
    await selectSubjectiveIrtFile(file)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* 상태 헤더 */}
      <div className="bg-white rounded-xl shadow p-5 space-y-3">
        <h1 className="text-xl font-bold text-gray-800">성적 분석 시스템</h1>
        <div className="flex flex-wrap gap-2 text-sm">
          <StatusBadge ok={!!questionInfoFile} label="문항정보표" />
          <StatusBadge
            ok={answerFiles.length > 0}
            label={answerFiles.length > 1 ? `정오표 ${answerFiles.length}개` : '정오표'}
          />
          <StatusBadge ok={!!subjectiveIrtFile} label="서답형 IRT" optional />
          <StatusBadge ok={!!examData} label="데이터 로드" />
        </div>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">
            {error}
          </div>
        )}
        {examData && questionInfoFile === null && answerFiles.length === 0 && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">마지막 분석 결과를 복원했습니다.</p>
                <p className="text-xs text-green-700">
                  {examData.examInfo.subject} · 응시 {examData.students.length}명
                  {lastAnalysisSavedAt ? ` · 저장 ${formatSavedAt(lastAnalysisSavedAt)}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={clearSavedAnalysis}
                className="self-start text-xs font-medium text-green-700 underline-offset-2 hover:underline sm:self-auto"
              >
                저장된 기록 지우기
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 파일 선택 */}
      <div className="bg-white rounded-xl shadow p-5 space-y-5">
        <h2 className="font-semibold text-gray-700">파일 선택</h2>

        {/* 문항정보표 */}
        <FileRow
          label="문항정보표"
          description="문항 번호, 유형, 내용영역, 성취기준, 난이도, 배점, 정답이 포함된 파일"
          loaded={questionInfoFile}
          onSelect={handleQuestionInfoChange}
          onDropFile={handleQuestionInfoFile}
          onClear={clearQuestionInfoFile}
          accept={EXCEL_FILE_ACCEPT}
        />

        {/* 정오표 */}
        <FileRow
          label="정오표"
          description="여러 학급의 정오표 파일을 한 번에 선택하거나 드래그하면 통합 분석합니다"
          loaded={answerFiles}
          onSelect={handleAnswerChange}
          onDropFiles={handleAnswerFiles}
          onClear={clearAnswerFile}
          accept={EXCEL_FILE_ACCEPT}
          multiple
        />

        <FileRow
          label="서답형 IRT 입력파일"
          description="선택 사항: 문항_루브릭, 학생_문항점수, 범주_채점기준 시트가 있으면 서답형 다분형 IRT까지 분석"
          loaded={subjectiveIrtFile}
          onSelect={handleSubjectiveIrtChange}
          onDropFile={handleSubjectiveIrtFile}
          onClear={clearSubjectiveIrtFile}
          accept={EXCEL_FILE_ACCEPT}
        />
      </div>

      {/* 액션 버튼 */}
      <div className="space-y-3">
        <button
          onClick={loadData}
          disabled={loading || !isReady}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-3 rounded-xl font-medium text-sm shadow transition-colors"
        >
          {loading ? '데이터 불러오는 중...' : '데이터 불러오기'}
        </button>

        {examData && (
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-medium text-sm shadow transition-colors"
          >
            분석 결과 보기 ({examData.students.length}명, {examData.questions.length}문항)
          </button>
        )}
      </div>

      {/* 최근 파일 이름 표시 (localStorage 기반) */}
      {(settings.questionInfoFileName || settings.answerFileName || settings.subjectiveIrtFileName) && !questionInfoFile && answerFiles.length === 0 && !subjectiveIrtFile && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-600">마지막으로 사용한 파일</p>
          {settings.questionInfoFileName && <p>문항정보표: {settings.questionInfoFileName}</p>}
          {settings.answerFileName && <p>정오표: {settings.answerFileName}</p>}
          {settings.subjectiveIrtFileName && <p>서답형 IRT: {settings.subjectiveIrtFileName}</p>}
          <p className="text-gray-400 mt-1">※ 새로고침 후에는 파일을 다시 선택해야 합니다.</p>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ ok, label, optional = false }: { ok: boolean; label: string; optional?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
      ok ? 'bg-green-100 text-green-700' : optional ? 'bg-blue-50 text-blue-500' : 'bg-gray-100 text-gray-500'
    }`}>
      {ok ? '✓' : optional ? '+' : '○'} {label}
    </span>
  )
}

function validateExcelFile(file: File) {
  if (isExcelFile(file)) return true
  alert('엑셀 파일(.xlsx, .xls)만 올릴 수 있습니다.')
  return false
}

function validateExcelFiles(files: File[]) {
  const hasInvalidFile = files.some(file => !isExcelFile(file))
  if (!hasInvalidFile) return true

  alert('엑셀 파일(.xlsx, .xls)만 올릴 수 있습니다.')
  return false
}

function isExcelFile(file: File) {
  const lowerName = file.name.toLowerCase()
  return EXCEL_FILE_EXTENSIONS.some(extension => lowerName.endsWith(extension))
}

function formatSavedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function FileRow({
  label,
  description,
  loaded,
  onSelect,
  onDropFile,
  onDropFiles,
  onClear,
  accept,
  multiple = false,
}: {
  label: string
  description: string
  loaded: { name: string; sheetName: string } | { name: string; sheetName: string }[] | null
  onSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  onDropFile?: (file: File) => Promise<void>
  onDropFiles?: (files: File[]) => Promise<void>
  onClear: () => void
  accept: string
  multiple?: boolean
}) {
  const [isDragging, setIsDragging] = useState(false)
  const loadedFiles = Array.isArray(loaded) ? loaded : (loaded ? [loaded] : [])

  function handleDragOver(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDragging(true)
  }

  function handleDragLeave(e: React.DragEvent<HTMLLabelElement>) {
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return
    setIsDragging(false)
  }

  async function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    if (multiple) {
      if (!validateExcelFiles(files)) return
      await onDropFiles?.(files)
      return
    }

    const file = files.find(isExcelFile) ?? files[0]
    if (!file || !validateExcelFile(file)) return

    await onDropFile?.(file)
  }

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <p className="text-xs text-gray-400">{description}</p>

      {loadedFiles.length > 0 ? (
        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-green-800">
              {loadedFiles.length === 1 ? loadedFiles[0].name : `${loadedFiles.length}개 파일 선택됨`}
            </p>
            {loadedFiles.length === 1 ? (
              <p className="text-xs text-green-600">시트: {loadedFiles[0].sheetName}</p>
            ) : (
              <div className="mt-0.5 max-h-24 space-y-0.5 overflow-y-auto pr-2">
                {loadedFiles.map((file, index) => (
                  <p key={`${file.name}-${file.sheetName}-${index}`} className="truncate text-xs text-green-600">
                    {file.name} · 시트: {file.sheetName}
                  </p>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-red-500 hover:text-red-700 ml-3 shrink-0"
          >
            제거
          </button>
        </div>
      ) : (
        <label
          onDragEnter={handleDragOver}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-4 text-center transition-colors ${
            isDragging
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-gray-200 text-gray-500 hover:border-blue-300 hover:bg-blue-50'
          }`}
        >
          <span className="text-sm font-medium">파일을 드래그하거나 클릭해서 선택</span>
          <span className="mt-1 text-xs text-gray-400">.xlsx / .xls</span>
          <input
            type="file"
            accept={accept}
            multiple={multiple}
            onChange={onSelect}
            className="hidden"
          />
        </label>
      )}
    </div>
  )
}
