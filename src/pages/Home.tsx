import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

const EXCEL_FILE_ACCEPT = '.xlsx,.xls'
const EXCEL_FILE_EXTENSIONS = ['.xlsx', '.xls']

export default function Home() {
  const {
    settings,
    questionInfoFile,
    answerFile,
    selectQuestionInfoFile,
    selectAnswerFile,
    clearQuestionInfoFile,
    clearAnswerFile,
    loadData,
    loading,
    error,
    examData,
  } = useApp()

  const navigate = useNavigate()

  const isReady = !!questionInfoFile && !!answerFile

  async function handleQuestionInfoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) await handleQuestionInfoFile(file)
    e.target.value = ''
  }

  async function handleAnswerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) await handleAnswerFile(file)
    e.target.value = ''
  }

  async function handleQuestionInfoFile(file: File) {
    if (!validateExcelFile(file)) return
    await selectQuestionInfoFile(file)
  }

  async function handleAnswerFile(file: File) {
    if (!validateExcelFile(file)) return
    await selectAnswerFile(file)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* 상태 헤더 */}
      <div className="bg-white rounded-xl shadow p-5 space-y-3">
        <h1 className="text-xl font-bold text-gray-800">성적 분석 시스템</h1>
        <div className="flex flex-wrap gap-2 text-sm">
          <StatusBadge ok={!!questionInfoFile} label="문항정보표" />
          <StatusBadge ok={!!answerFile} label="정오표" />
          <StatusBadge ok={!!examData} label="데이터 로드" />
        </div>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">
            {error}
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
          description="학생별 선택형 응답 및 서답형 점수가 포함된 파일"
          loaded={answerFile}
          onSelect={handleAnswerChange}
          onDropFile={handleAnswerFile}
          onClear={clearAnswerFile}
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
      {(settings.questionInfoFileName || settings.answerFileName) && !questionInfoFile && !answerFile && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-600">마지막으로 사용한 파일</p>
          {settings.questionInfoFileName && <p>문항정보표: {settings.questionInfoFileName}</p>}
          {settings.answerFileName && <p>정오표: {settings.answerFileName}</p>}
          <p className="text-gray-400 mt-1">※ 새로고침 후에는 파일을 다시 선택해야 합니다.</p>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
      ok ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
    }`}>
      {ok ? '✓' : '○'} {label}
    </span>
  )
}

function validateExcelFile(file: File) {
  if (isExcelFile(file)) return true
  alert('엑셀 파일(.xlsx, .xls)만 올릴 수 있습니다.')
  return false
}

function isExcelFile(file: File) {
  const lowerName = file.name.toLowerCase()
  return EXCEL_FILE_EXTENSIONS.some(extension => lowerName.endsWith(extension))
}

function FileRow({
  label,
  description,
  loaded,
  onSelect,
  onDropFile,
  onClear,
  accept,
}: {
  label: string
  description: string
  loaded: { name: string; sheetName: string } | null
  onSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  onDropFile: (file: File) => Promise<void>
  onClear: () => void
  accept: string
}) {
  const [isDragging, setIsDragging] = useState(false)

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
    const file = files.find(isExcelFile) ?? files[0]
    if (!file) return

    await onDropFile(file)
  }

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <p className="text-xs text-gray-400">{description}</p>

      {loaded ? (
        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <div>
            <p className="text-sm font-medium text-green-800">{loaded.name}</p>
            <p className="text-xs text-green-600">시트: {loaded.sheetName}</p>
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
            onChange={onSelect}
            className="hidden"
          />
        </label>
      )}
    </div>
  )
}
