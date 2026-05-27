import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { rankStudents, getStudentWeakAreas, calcScoreStats } from '../utils/analytics'
import { isCorrect, MULTIPLE_ANSWER_MAP } from '../utils/parseAnswerSheet'
import { buildStudentIrtProfile, type IrtAreaGap, type IrtUnexpectedResponse, type StudentIrtProfile } from '../utils/studentIrt'
import { buildStudentRecord, type StudentRecordSpec, type StudentType, type CheckItem, type EvidenceItem } from '../utils/buildStudentRecord'
import type { Question } from '../types'
import PrintButton from '../components/common/PrintButton'
import InfoModal from '../components/common/InfoModal'
import AiDraftSection from '../components/student/AiDraftSection'
import TeacherNoteSection from '../components/student/TeacherNoteSection'
import { useTeacherNote } from '../hooks/useTeacherNote'
import { buildSespecPrompt } from '../utils/buildAiPrompt'

const DIFF_BG: Record<string, string> = {
  쉬움: 'bg-green-100 text-green-700',
  보통: 'bg-yellow-100 text-yellow-700',
  어려움: 'bg-red-100 text-red-700',
}

export default function StudentDetail() {
  const { id } = useParams<{ id: string }>()
  const { examData } = useApp()
  const navigate = useNavigate()

  if (!examData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 space-y-3">
        <p>데이터가 없습니다</p>
        <button onClick={() => navigate('/')} className="text-blue-600 hover:underline text-sm">홈으로</button>
      </div>
    )
  }

  const { students, questions, examInfo, questionStats } = examData
  const isSubjectiveSplit = examData.subjectiveMode === 'split'
  const [filterDiff, setFilterDiff] = useState<'전체' | '쉬움' | '보통' | '어려움'>('전체')
  const [filterArea, setFilterArea] = useState('전체')
  const student = students.find(s => s.studentId === id)

  if (!student) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 space-y-3">
        <p>학생을 찾을 수 없습니다</p>
        <button onClick={() => navigate('/students')} className="text-blue-600 hover:underline text-sm">목록으로</button>
      </div>
    )
  }

  const ranked = rankStudents(students)
  const rankedStudent = ranked.find(s => s.studentId === id)!
  const classStats = calcScoreStats(students)
  const correctAnswers: Record<number, string> = {}
  for (const q of questions) if (q.answer) correctAnswers[q.number] = q.answer

  const mcQuestions = questions.filter(q => q.type === '선택형')
  const areaOptions = ['전체', ...Array.from(new Set(mcQuestions.map(q => q.contentArea)))]
  const filteredMcQuestions = mcQuestions.filter(q => {
    const diffOk = filterDiff === '전체' || q.difficulty === filterDiff
    const areaOk = filterArea === '전체' || q.contentArea === filterArea
    return diffOk && areaOk
  })
  const weakAreas = getStudentWeakAreas(student, questions, correctAnswers)
  const irtProfile = buildStudentIrtProfile(student, students, questionStats, correctAnswers)
  const recordSpec = buildStudentRecord(student, students, questions, questionStats, correctAnswers)
  const teacherNote = useTeacherNote(student.studentId, examInfo)
  const aiPrompt = buildSespecPrompt(recordSpec, examInfo, student.name)
  const avgMc = students.length > 0 ? students.reduce((a, s) => a + s.mcScore, 0) / students.length : 0
  const avgSa = students.length > 0 ? students.reduce((a, s) => a + s.saScore, 0) / students.length : 0
  const avgShort = students.length > 0 ? students.reduce((a, s) => a + s.shortAnswerScore, 0) / students.length : 0
  const avgEssay = students.length > 0 ? students.reduce((a, s) => a + s.essayScore, 0) / students.length : 0

  const percentile = Math.round(((students.length - rankedStudent.rank) / students.length) * 100)

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        {/* 뒤로가기 */}
        <button
          onClick={() => navigate('/students')}
          className="text-sm text-blue-600 hover:underline flex items-center gap-1 print:hidden"
        >
          ← 학생 목록
        </button>
        <PrintButton />
      </div>

      {/* 학생 기본 정보 */}
      <div className="bg-white rounded-xl shadow p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">{student.name}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {(() => {
                const admissionYear = parseInt(student.studentId.substring(0, 4))
                const grade = new Date().getFullYear() - admissionYear + 1
                const cls = student.classNum.padStart(2, '0')
                const seat = student.seatNum.padStart(2, '0')
                return `${grade}학년 ${cls}반 ${seat}번`
              })()}
            </p>
            <p className="text-sm text-gray-500">{examInfo.subject} {examInfo.year}년도 {examInfo.semester}학기 {examInfo.examNumber}차</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-blue-600">{student.totalScore.toFixed(1)}<span className="text-base font-normal text-gray-500">점</span></p>
            <p className="text-sm text-gray-500">전체 {rankedStudent.rank}위 / {students.length}명</p>
            <p className="text-sm text-gray-500">상위 {100 - percentile}%</p>
            <div className="mt-1 flex justify-end">
              <StudentTypeBadge type={recordSpec.studentType} />
            </div>
          </div>
        </div>

        {/* 점수 비교 */}
        <div className="mt-4 grid gap-3 grid-cols-1 md:grid-cols-3">
          <CompareCard
            label="선택형"
            student={student.mcScore}
            avg={avgMc}
            total={examInfo.multipleChoiceTotal}
            classScores={students.map(s => s.mcScore)}
          />
          <CompareCard
            label="서답형"
            student={student.saScore}
            avg={avgSa}
            total={examInfo.shortAnswerTotal}
            classScores={students.map(s => s.saScore)}
          />
          <CompareCard
            label="총점"
            student={student.totalScore}
            avg={classStats.avg}
            total={100}
            classScores={students.map(s => s.totalScore)}
          />
        </div>
      </div>

      {/* 내용영역별 분석 */}
      <div className="bg-white rounded-xl shadow p-5">
        <h3 className="font-semibold text-gray-700 mb-3">내용영역별 정답률</h3>
        <div className="space-y-2">
          {weakAreas.map(({ area, correctRate }) => {
            const classArea = questionStats
              .filter(qs => qs.question.contentArea === area && qs.type === '선택형')
            const classRate = classArea.length > 0
              ? classArea.reduce((a, qs) => a + qs.correctRate, 0) / classArea.length
              : 0
            return (
              <div key={area}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-gray-700">{area}</span>
                  <span className="text-gray-500">
                    본인 {correctRate.toFixed(0)}% / 반평균 {classRate.toFixed(0)}%
                  </span>
                </div>
                <div className="relative w-full bg-gray-100 rounded-full h-4">
                  <div
                    className="absolute h-4 bg-gray-300 rounded-full opacity-50"
                    style={{ width: `${classRate}%` }}
                  />
                  <div
                    className={`absolute h-4 rounded-full ${correctRate >= classRate ? 'bg-green-500' : 'bg-red-400'}`}
                    style={{ width: `${correctRate}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 문항별 응답 현황 */}
      <div className="bg-white rounded-xl shadow p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold text-gray-700">선택형 문항별 응답</h3>
          <div className="flex flex-wrap gap-2">
            <FilterPills
              label="난이도"
              value={filterDiff}
              options={['전체', '쉬움', '보통', '어려움']}
              onChange={v => setFilterDiff(v as '전체' | '쉬움' | '보통' | '어려움')}
            />
            <FilterPills
              label="내용영역"
              value={filterArea}
              options={areaOptions}
              onChange={setFilterArea}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {filteredMcQuestions.map(q => {
            const ans = student.mcAnswers[q.number] ?? '-'
            const correct = isCorrect(ans, correctAnswers[q.number] ?? '')
            const classRate = questionStats.find(qs => qs.questionNumber === q.number)?.correctRate ?? 0

            return (
              <QuestionCard
                key={q.number}
                question={q}
                answer={ans}
                correct={correct}
                classRate={classRate}
                correctAnswer={correctAnswers[q.number] ?? ''}
              />
            )
          })}
        </div>

        <div className="mt-4 pt-4 border-t flex gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-100 border border-green-300 rounded inline-block" /> 정답</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-100 border border-red-300 rounded inline-block" /> 오답</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-gray-100 border border-gray-200 rounded inline-block" /> 무응기</span>
        </div>
      </div>

      {/* 서답형 */}
      <div className="bg-white rounded-xl shadow p-5">
        <h3 className="font-semibold text-gray-700 mb-3">서답형</h3>
        {isSubjectiveSplit ? (
          <div className="space-y-3">
            <SimpleRow label="단답형" student={student.shortAnswerScore} avg={avgShort} prefix={formatSubjectiveNumber(1)} />
            <SimpleRow label="서술형" student={student.essayScore} avg={avgEssay} prefix={formatSubjectiveNumber(2)} />
            <SimpleRow label="서답형 합계" student={student.saScore} avg={avgSa} suffix={` / ${examInfo.shortAnswerTotal}점`} />
            <p className="text-xs text-gray-400">※ T열 이후 헤더값이 감지되어 단답형/서술형 분리 분석을 적용했습니다.</p>
          </div>
        ) : (
          <div className="flex items-center gap-6">
            <div>
              <p className="text-sm text-gray-500">서답형 점수</p>
              <p className="text-2xl font-bold text-gray-800">{student.saScore.toFixed(1)}<span className="text-sm font-normal text-gray-500"> / {examInfo.shortAnswerTotal}점</span></p>
            </div>
            <div className="flex-1">
              <div className="w-full bg-gray-100 rounded-full h-3">
                <div
                  className="h-3 bg-blue-500 rounded-full"
                  style={{ width: `${(student.saScore / examInfo.shortAnswerTotal) * 100}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                반 평균 {avgSa.toFixed(1)}점
              </p>
            </div>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-3">※ 서답형 개별 문항 응답 데이터는 정오표에 포함되지 않습니다.</p>
      </div>

      <IrtDeepAnalysis profile={irtProfile} />

      <ObservationRecordSection spec={recordSpec} />

      {/* AI 세특 초안 생성 */}
      <div className="bg-white rounded-xl shadow p-5 space-y-4">
        <h3 className="font-semibold text-gray-700">AI 세특 초안 생성</h3>
        <AiDraftSection prompt={aiPrompt} />
      </div>

      {/* 교사 검수 기록 */}
      <div className="bg-white rounded-xl shadow p-5 space-y-4">
        <h3 className="font-semibold text-gray-700">교사 검수 기록</h3>
        <TeacherNoteSection state={teacherNote} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// 학습 유형 스타일 맵
// ─────────────────────────────────────────────
const TYPE_STYLE: Record<StudentType, { ring: string; dot: string; text: string; bg: string }> = {
  '우수·심화형':    { ring: 'border-blue-200',   dot: 'bg-blue-500',   text: 'text-blue-700',   bg: 'bg-blue-50'   },
  '안정·성실형':    { ring: 'border-green-200',  dot: 'bg-green-500',  text: 'text-green-700',  bg: 'bg-green-50'  },
  '영역편차형':     { ring: 'border-yellow-200', dot: 'bg-yellow-500', text: 'text-yellow-700', bg: 'bg-yellow-50' },
  '도전·잠재형':    { ring: 'border-purple-200', dot: 'bg-purple-500', text: 'text-purple-700', bg: 'bg-purple-50' },
  '기초보강필요형': { ring: 'border-red-200',    dot: 'bg-red-500',    text: 'text-red-700',    bg: 'bg-red-50'    },
  '발전가능형':     { ring: 'border-orange-200', dot: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50' },
}

// ─────────────────────────────────────────────
// 학습 유형 뱃지
// ─────────────────────────────────────────────
function StudentTypeBadge({ type }: { type: StudentType }) {
  const s = TYPE_STYLE[type]
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-medium ${s.ring} ${s.text} ${s.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {type}
    </span>
  )
}

// ─────────────────────────────────────────────
// 관찰 기록 섹션
// ─────────────────────────────────────────────
function ObservationRecordSection({ spec }: { spec: StudentRecordSpec }) {
  const [draftOpen, setDraftOpen] = useState(true)
  const [fbOpen, setFbOpen] = useState(false)
  const [copied, setCopied] = useState<'draft' | 'fb' | null>(null)

  function copy(text: string, which: 'draft' | 'fb') {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(which)
      setTimeout(() => setCopied(null), 1800)
    })
  }

  return (
    <div className="bg-white rounded-xl shadow p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-700">학생 관찰 기록</h3>
        <StudentTypeBadge type={spec.studentType} />
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-100">
          <p className="text-xs text-gray-500">총점</p>
          <p className="text-lg font-bold text-gray-800">{spec.plainPct.toFixed(1)}<span className="text-xs font-normal text-gray-500">점</span></p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-100">
          <p className="text-xs text-gray-500">석차</p>
          <p className="text-lg font-bold text-gray-800">{spec.rank}<span className="text-xs font-normal text-gray-500">위</span></p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-100">
          <p className="text-xs text-gray-500">상위</p>
          <p className="text-lg font-bold text-gray-800">{spec.rankPct.toFixed(1)}<span className="text-xs font-normal text-gray-500">%</span></p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-100">
          <p className="text-xs text-gray-500">고난도 정답률</p>
          <p className="text-lg font-bold text-gray-800">{spec.hardRate.toFixed(1)}<span className="text-xs font-normal text-gray-500">%</span></p>
        </div>
      </div>

      {/* 강점/보완 영역 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: '강점 영역', items: spec.strong, cls: 'border-blue-100 bg-blue-50', badge: 'bg-blue-100 text-blue-700' },
          { label: '중간 영역', items: spec.mid,    cls: 'border-gray-100 bg-gray-50', badge: 'bg-gray-100 text-gray-600' },
          { label: '보완 영역', items: spec.weak,   cls: 'border-red-100 bg-red-50',   badge: 'bg-red-100 text-red-600'   },
        ].map(({ label, items, cls, badge }) => (
          <div key={label} className={`rounded-lg border p-3 ${cls}`}>
            <p className="text-xs font-medium text-gray-600 mb-2">{label}</p>
            {items.length === 0 ? (
              <p className="text-xs text-gray-400">해당 없음</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {items.map(g => (
                  <span key={g.code} className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge}`}>
                    {g.code} ({g.rate.toFixed(0)}%)
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 세특 체크리스트 */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">세특 체크리스트</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {spec.checklist.map((item: CheckItem) => (
            <div key={item.id} className={`rounded-lg border px-3 py-2 flex items-start gap-2 ${item.checked ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
              <span className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 flex items-center justify-center text-xs font-bold ${item.checked ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                {item.checked ? '✓' : ''}
              </span>
              <div>
                <p className="text-xs font-medium text-gray-700">{item.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{item.basis || item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 근거 목록 */}
      {spec.evidence.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">근거 목록</h4>
          <div className="space-y-1">
            {spec.evidence.map((ev: EvidenceItem) => (
              <div key={ev.key} className="text-xs text-gray-600 flex gap-2">
                <span className="font-medium text-gray-500 shrink-0">{ev.key}</span>
                <span>{ev.values.join(' / ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 관찰 기록 초안 */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700"
          onClick={() => setDraftOpen(o => !o)}
        >
          <span>세부능력 및 특기사항 초안 <span className="text-xs font-normal text-gray-400">({spec.charCount}자)</span></span>
          <span>{draftOpen ? '▲' : '▼'}</span>
        </button>
        {draftOpen && (
          <div className="p-4 space-y-2">
            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{spec.draft}</p>
            <button
              onClick={() => copy(spec.draft, 'draft')}
              className="mt-2 text-xs px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 text-gray-600"
            >
              {copied === 'draft' ? '복사됨 ✓' : '클립보드에 복사'}
            </button>
          </div>
        )}
      </div>

      {/* 학생 환류 문장 */}
      <div className="border border-indigo-100 rounded-lg overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-sm font-medium text-indigo-700"
          onClick={() => setFbOpen(o => !o)}
        >
          <span>학생 환류 문장 <span className="text-xs font-normal text-indigo-400">({spec.fbCharCount}자)</span></span>
          <span>{fbOpen ? '▲' : '▼'}</span>
        </button>
        {fbOpen && (
          <div className="p-4 space-y-2">
            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{spec.feedback}</p>
            <button
              onClick={() => copy(spec.feedback, 'fb')}
              className="mt-2 text-xs px-3 py-1 rounded border border-indigo-300 hover:bg-indigo-50 text-indigo-600"
            >
              {copied === 'fb' ? '복사됨 ✓' : '클립보드에 복사'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function CompareCard({ label, student, avg, total, classScores }: {
  label: string
  student: number
  avg: number
  total: number
  classScores: number[]
}) {
  const diff = student - avg
  const pct = total > 0 ? (student / total) * 100 : 0
  const dist = buildDistribution(classScores, total, 12)
  const maxCount = Math.max(...dist.map(d => d), 1)
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-800 mt-0.5">{student.toFixed(1)}<span className="text-xs font-normal text-gray-500 ml-1">/ {total}점</span></p>
      <p className={`text-xs font-medium mt-1 ${diff >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
        평균 {diff >= 0 ? '+' : ''}{diff.toFixed(1)}
      </p>
      <div className="mt-2">
        <div className="relative h-12 bg-white rounded border border-gray-200 px-1">
          <div className="h-full flex items-end gap-0.5">
            {dist.map((c, i) => (
              <div
                key={i}
                className="flex-1 bg-blue-200 rounded-t"
                style={{ height: `${(c / maxCount) * 100}%` }}
                title={`${c}명`}
              />
            ))}
          </div>
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500"
            style={{ left: `${Math.max(0, Math.min(100, pct))}%` }}
            title="내 위치"
          />
        </div>
        <p className="text-[11px] text-gray-500 mt-1">분포 내 내 위치: {pct.toFixed(1)}%</p>
      </div>
    </div>
  )
}

function SimpleRow({ label, student, avg, suffix = '점', prefix }: {
  label: string
  student: number
  avg: number
  suffix?: string
  prefix?: string
}) {
  const diff = student - avg
  return (
    <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
      <span className="text-sm text-gray-600">{prefix ? `${prefix} ${label}` : label}</span>
      <span className="text-sm text-gray-800">
        <strong>{student.toFixed(1)}</strong>{suffix}
        <span className={`ml-2 text-xs ${diff >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
          (평균 {avg.toFixed(1)}, {diff >= 0 ? '+' : ''}{diff.toFixed(1)})
        </span>
      </span>
    </div>
  )
}

function QuestionCard({ question, answer, correct, classRate, correctAnswer }: {
  question: Question
  answer: string
  correct: boolean
  classRate: number
  correctAnswer: string
}) {
  const isNoAnswer = answer === '-' || answer === ''
  const displayAnswer = MULTIPLE_ANSWER_MAP[answer]
    ? `${answer}(${MULTIPLE_ANSWER_MAP[answer].join(',')})`
    : answer

  return (
    <div className={`rounded-lg p-2 text-center border text-xs ${
      isNoAnswer ? 'bg-gray-50 border-gray-200'
      : correct ? 'bg-green-50 border-green-200'
      : 'bg-red-50 border-red-200'
    }`}>
      <p className="font-semibold text-gray-700 mb-0.5">{formatChoiceNumber(question.number)}</p>
      <p className={`font-bold text-sm ${
        isNoAnswer ? 'text-gray-400' : correct ? 'text-green-700' : 'text-red-600'
      }`}>
        {isNoAnswer ? '-' : displayAnswer}
      </p>
      {!correct && !isNoAnswer && (
        <p className="text-gray-400 text-xs">정답:{correctAnswer}</p>
      )}
      <p className="text-gray-400 mt-0.5">{classRate.toFixed(0)}%</p>
      <span className={`inline-block px-1.5 rounded text-xs ${DIFF_BG[question.difficulty] ?? ''}`}>
        {question.difficulty}
      </span>
    </div>
  )
}

function FilterPills({ label, value, options, onChange }: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-500">{label}:</span>
      <div className="flex gap-1">
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`px-2 py-1 rounded-full text-xs border ${
              value === opt ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}

function IrtDeepAnalysis({ profile }: { profile: StudentIrtProfile }) {
  const hasTheta = profile.theta !== null
  const consistencyScore = profile.consistency.score
  const hasConsistency = consistencyScore !== null
  const [showGuide, setShowGuide] = useState(false)

  return (
    <div className="bg-white rounded-xl shadow p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-700">IRT 기반 정밀 분석 (선택형)</h3>
          <p className="text-xs text-gray-500 mt-1">
            학생의 문항 반응 패턴과 문항 파라미터(a,b)를 이용한 보조 분석입니다.
          </p>
        </div>
        <button
          onClick={() => setShowGuide(true)}
          className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 hover:bg-gray-50 shrink-0 print:hidden"
        >
          해석 가이드
        </button>
      </div>

      {profile.itemCount === 0 ? (
        <div className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          IRT 분석에 사용할 수 있는 문항 파라미터가 부족합니다.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <IrtStatCard
              title="능력 추정 (θ)"
              value={hasTheta ? formatSigned(profile.theta) : '-'}
              sub={hasTheta ? describeTheta(profile.theta) : '추정 불가'}
              foot={hasTheta ? `표준오차 ${formatFixed(profile.thetaSE)}` : ''}
            />
            <IrtStatCard
              title="예상 대비 실제"
              value={`${profile.observedMcScore.toFixed(1)} / ${profile.expectedMcScore.toFixed(1)}`}
              sub={`정답 ${profile.observedCorrect}/${profile.itemCount}, 기대 ${profile.expectedCorrect.toFixed(1)}`}
              foot={hasTheta ? `능력 백분위 ${formatPercent(profile.thetaPercentile)}` : ''}
            />
            <IrtStatCard
              title="반응 일관성"
              value={hasConsistency ? `${consistencyScore.toFixed(1)}점` : '-'}
              sub={profile.consistency.label}
              foot={`${profile.consistency.description}${profile.consistency.correlation !== null ? ` · 상관 ${profile.consistency.correlation.toFixed(2)}` : ''}`}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg border border-gray-200 p-3">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">예상 밖 반응</h4>
              {profile.unexpectedResponses.length === 0 ? (
                <p className="text-sm text-gray-500">예상과 크게 벗어난 반응이 많지 않습니다.</p>
              ) : (
                <div className="space-y-2">
                  {profile.unexpectedResponses.map(item => (
                    <UnexpectedRow key={`${item.questionNumber}-${item.kind}`} item={item} />
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">적응형 평가/학습 제안</h4>
              <p className="text-xs text-gray-500 mb-3">{profile.adaptive.description}</p>
              {profile.adaptive.targetRange && (
                <p className="text-xs text-gray-600 mb-2">
                  적정 난이도 구간(b): {formatSigned(profile.adaptive.targetRange[0])} ~ {formatSigned(profile.adaptive.targetRange[1])}
                </p>
              )}
              <div className="space-y-2">
                <QuestionPills title="기초 보강" questions={profile.adaptive.supportQuestions} tone="blue" />
                <QuestionPills title="적정 도전" questions={profile.adaptive.targetQuestions} tone="green" />
                <QuestionPills title="상위 도전" questions={profile.adaptive.stretchQuestions} tone="amber" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AreaGapPanel title="강점 영역 (기대 대비 상회)" items={profile.strengths} positive />
            <AreaGapPanel title="약점 영역 (기대 대비 하회)" items={profile.weaknesses} positive={false} />
          </div>
        </>
      )}

      <InfoModal
        open={showGuide}
        title="학생 IRT 정밀 분석 해석 가이드"
        onClose={() => setShowGuide(false)}
      >
        <p><strong>능력 추정(θ)</strong>: 학생이 맞출 확률 패턴으로 추정한 상대 능력입니다. 0은 중간, 음수는 기초, 양수는 상위 경향으로 해석합니다.</p>
        <p><strong>예상 대비 실제</strong>: 추정 능력 기준 기대 점수와 실제 점수 차이입니다. 실제가 높으면 당일 수행이 좋았고, 낮으면 실수/취약 영역 가능성을 봅니다.</p>
        <p><strong>예상 밖 반응</strong>: 쉬운데 틀림, 어려운데 맞음 같은 반응입니다. 개념 공백 또는 강점 단서를 찾는 데 유용합니다.</p>
        <p><strong>강점/약점 영역</strong>: 같은 능력 수준에서 기대되는 정답률 대비 실제 편차입니다. 양수 편차는 상대 강점, 음수 편차는 보완 우선 영역입니다.</p>
        <p><strong>반응 일관성</strong>: 문항 난이도 흐름과 실제 정오답의 정합성입니다. 낮으면 실수, 시험 컨디션, 읽기 오류 등 비학력 요인도 함께 점검합니다.</p>
        <p><strong>적응형 제안</strong>: 기초 보강/적정 도전/상위 도전 문항군으로 복습 순서를 제안합니다.</p>
        <p className="text-xs text-gray-500">이 분석은 진단 보조용입니다. 최종 지도 판단은 서답형 수행, 오답 원인, 수업 관찰과 함께 종합해 주세요.</p>
      </InfoModal>
    </div>
  )
}

function IrtStatCard({ title, value, sub, foot }: {
  title: string
  value: string
  sub: string
  foot?: string
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
      <p className="text-xs text-gray-500">{title}</p>
      <p className="text-xl font-bold text-gray-800 mt-0.5">{value}</p>
      <p className="text-xs text-gray-600 mt-0.5">{sub}</p>
      {foot && <p className="text-[11px] text-gray-500 mt-1">{foot}</p>}
    </div>
  )
}

function UnexpectedRow({ item }: { item: IrtUnexpectedResponse }) {
  const badge = item.kind === 'highWrong'
    ? { label: '쉬운데 오답', cls: 'bg-red-50 text-red-600 border-red-100' }
    : { label: '어려운데 정답', cls: 'bg-green-50 text-green-700 border-green-100' }
  const answerLabel = item.studentAnswer === '-' || item.studentAnswer === '' ? '무응답' : item.studentAnswer

  return (
    <div className="rounded border border-gray-200 px-2 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-800">
          {formatChoiceNumber(item.questionNumber)} · {item.contentArea}
        </p>
        <span className={`text-[11px] px-1.5 py-0.5 rounded border ${badge.cls}`}>{badge.label}</span>
      </div>
      <p className="text-xs text-gray-600 mt-1">
        예상 정답확률 {Math.round(item.expectedProb * 100)}% · 학생 응답 {answerLabel} · 정답 {item.correctAnswer}
      </p>
    </div>
  )
}

function AreaGapPanel({ title, items, positive }: { title: string; items: IrtAreaGap[]; positive: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <h4 className="text-sm font-semibold text-gray-700 mb-2">{title}</h4>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">뚜렷한 편차가 나타난 영역이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.area} className="rounded bg-gray-50 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-gray-700">{item.area}</span>
                <span className={positive ? 'text-blue-600' : 'text-red-600'}>
                  {item.gap >= 0 ? '+' : ''}{item.gap.toFixed(1)}%p
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                관측 {item.observedRate.toFixed(1)}% · 기대 {item.expectedRate.toFixed(1)}% · {item.count}문항
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function QuestionPills({ title, questions, tone }: {
  title: string
  questions: number[]
  tone: 'blue' | 'green' | 'amber'
}) {
  const cls = tone === 'blue'
    ? 'bg-blue-50 text-blue-700 border-blue-100'
    : tone === 'green'
      ? 'bg-green-50 text-green-700 border-green-100'
      : 'bg-amber-50 text-amber-700 border-amber-100'

  return (
    <div>
      <p className="text-xs text-gray-600 mb-1">{title}</p>
      {questions.length === 0 ? (
        <p className="text-xs text-gray-400">추천 문항 없음</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {questions.map(q => (
            <span key={`${title}-${q}`} className={`text-xs px-2 py-0.5 rounded border ${cls}`}>
              {formatChoiceNumber(q)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function formatChoiceNumber(n: number) {
  return String(n).padStart(2, '0')
}

function formatSubjectiveNumber(n: number) {
  return `서${String(n).padStart(2, '0')}`
}

function formatSigned(v: number | null) {
  if (v === null || Number.isNaN(v)) return '-'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}`
}

function formatFixed(v: number | null) {
  if (v === null || Number.isNaN(v)) return '-'
  return v.toFixed(2)
}

function formatPercent(v: number | null) {
  if (v === null || Number.isNaN(v)) return '-'
  return `${v.toFixed(1)}%`
}

function describeTheta(theta: number | null) {
  if (theta === null || Number.isNaN(theta)) return '능력 추정 불가'
  if (theta <= -1.5) return '기초 보강이 필요한 수준'
  if (theta <= -0.5) return '기초~중간 난이도 중심 학습 권장'
  if (theta <= 0.5) return '중간 난이도 대응 수준'
  if (theta <= 1.5) return '중상 난이도 대응 수준'
  return '고난도 대응 수준'
}

function buildDistribution(values: number[], total: number, bins: number): number[] {
  const dist = Array.from({ length: bins }, () => 0)
  if (total <= 0 || bins <= 0) return dist
  for (const v of values) {
    const clamped = Math.max(0, Math.min(total, v))
    const ratio = clamped / total
    const idx = Math.min(bins - 1, Math.floor(ratio * bins))
    dist[idx]++
  }
  return dist
}
