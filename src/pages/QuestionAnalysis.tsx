import { Fragment, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { MULTIPLE_ANSWER_MAP } from '../utils/parseAnswerSheet'
import type { QuestionStat } from '../types'
import PrintButton from '../components/common/PrintButton'
import InfoModal from '../components/common/InfoModal'

type SortKey = 'number' | 'correctRate' | 'difficulty' | 'contentArea'
type FilterDiff = '전체' | '쉬움' | '보통' | '어려움'

const DIFF_BG: Record<string, string> = {
  쉬움: 'bg-green-100 text-green-700',
  보통: 'bg-yellow-100 text-yellow-700',
  어려움: 'bg-red-100 text-red-700',
}

function correctRateColor(rate: number) {
  if (rate >= 70) return 'text-green-600 font-bold'
  if (rate >= 40) return 'text-yellow-600 font-bold'
  return 'text-red-600 font-bold'
}

export default function QuestionAnalysis() {
  const { examData } = useApp()
  const navigate = useNavigate()
  const [sortKey, setSortKey] = useState<SortKey>('number')
  const [sortAsc, setSortAsc] = useState(true)
  const [filterDiff, setFilterDiff] = useState<FilterDiff>('전체')
  const [filterArea, setFilterArea] = useState('전체')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [showIrtGuide, setShowIrtGuide] = useState(false)

  if (!examData) {
    return <Empty onHome={() => navigate('/')} />
  }

  const { questionStats, subjectiveQuestionStats, examInfo } = examData
  const isSubjectiveSplit = examData.subjectiveMode === 'split'
  const areas = ['전체', ...Array.from(new Set(questionStats.map(q => q.question.contentArea)))]
  const subjectiveQuestions = examData.questions.filter(q => q.type === '단답형' || q.type === '서술형')
  const shortQuestions = subjectiveQuestions.filter(q => q.type === '단답형')
  const essayQuestions = subjectiveQuestions.filter(q => q.type === '서술형')
  const shortTotal = shortQuestions.reduce((sum, q) => sum + q.points, 0)
  const essayTotal = essayQuestions.reduce((sum, q) => sum + q.points, 0)

  let filtered = questionStats.filter(q => q.type === '선택형')
  if (filterDiff !== '전체') filtered = filtered.filter(q => q.question.difficulty === filterDiff)
  if (filterArea !== '전체') filtered = filtered.filter(q => q.question.contentArea === filterArea)

  const sorted = [...filtered].sort((a, b) => {
    let diff = 0
    if (sortKey === 'number') diff = a.questionNumber - b.questionNumber
    else if (sortKey === 'correctRate') diff = a.correctRate - b.correctRate
    else if (sortKey === 'difficulty') {
      const order = { 쉬움: 0, 보통: 1, 어려움: 2 }
      diff = (order[a.question.difficulty] ?? 0) - (order[b.question.difficulty] ?? 0)
    } else if (sortKey === 'contentArea') diff = a.question.contentArea.localeCompare(b.question.contentArea)
    return sortAsc ? diff : -diff
  })

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(true) }
  }

  function SortTh({ col, label, hint }: { col: SortKey; label: string; hint?: string }) {
    return (
      <th
        onClick={() => toggleSort(col)}
        className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer hover:text-blue-600 select-none"
      >
        <TermHint text={label} hint={hint} /> {sortKey === col ? (sortAsc ? '▲' : '▼') : ''}
      </th>
    )
  }

  const n = examData.students.length
  const avgSa = n > 0 ? examData.students.reduce((a, s) => a + s.saScore, 0) / n : 0
  const avgShort = n > 0 ? examData.students.reduce((a, s) => a + s.shortAnswerScore, 0) / n : 0
  const avgEssay = n > 0 ? examData.students.reduce((a, s) => a + s.essayScore, 0) / n : 0
  const shortRate = shortTotal > 0 ? (avgShort / shortTotal) * 100 : null
  const essayRate = essayTotal > 0 ? (avgEssay / essayTotal) * 100 : null
  const essayMode = modeOfScores(examData.students.map(s => s.essayScore))
  const shortMode = modeOfScores(examData.students.map(s => s.shortAnswerScore))

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <div className="flex justify-end gap-2 print:hidden">
        <button
          onClick={() => setShowIrtGuide(true)}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
        >
          IRT 해석 가이드
        </button>
        <PrintButton />
      </div>

      <div className="bg-white rounded-xl shadow p-5">
        <h2 className="font-bold text-gray-800 text-lg mb-1">문항 분석</h2>
        <p className="text-sm text-gray-500">
          {examInfo.subject} · 총 {questionStats.filter(q => q.type === '선택형').length}문항 · 응시 {n}명
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
          <IrtSummaryCard
            title="선택형 IRT 요약"
            difficulty={examData.irtSummary.multipleChoice.difficulty}
            discrimination={examData.irtSummary.multipleChoice.discrimination}
            note={examData.irtSummary.multipleChoice.note}
          />
          <IrtSummaryCard
            title={`${examData.irtSummary.shortAnswer.label} IRT 요약`}
            difficulty={examData.irtSummary.shortAnswer.difficulty}
            discrimination={examData.irtSummary.shortAnswer.discrimination}
            note={examData.irtSummary.shortAnswer.note}
          />
          {examData.irtSummary.essay && (
            <IrtSummaryCard
              title={`${examData.irtSummary.essay.label} IRT 요약`}
              difficulty={examData.irtSummary.essay.difficulty}
              discrimination={examData.irtSummary.essay.discrimination}
              note={examData.irtSummary.essay.note}
            />
          )}
        </div>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-3">
        <FilterGroup
          label="난이도"
          options={['전체', '쉬움', '보통', '어려움']}
          value={filterDiff}
          onChange={v => setFilterDiff(v as FilterDiff)}
        />
        <FilterGroup
          label="내용영역"
          options={areas}
          value={filterArea}
          onChange={setFilterArea}
        />
      </div>

      {/* 선택형 테이블 */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-700">선택형 문항별 분석</h3>
          <p className="text-xs text-gray-500 mt-1">변별도 a는 선택형 점수에서 해당 문항 점수를 제외한 선택형 내부 나머지 점수 기준입니다.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <SortTh col="number" label="문항" />
                <SortTh col="contentArea" label="내용영역" />
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">성취기준</th>
                <SortTh col="difficulty" label="난이도" />
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">배점</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">정답</th>
                <SortTh col="correctRate" label="정답률" hint="해당 문항을 맞힌 학생 비율(%)입니다." />
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">
                  <TermHint text="IRT a" hint="변별도 지표입니다. 값이 클수록 상·하위 학생을 잘 구분합니다." />
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">
                  <TermHint text="IRT b" hint="난이도 지표(logit)입니다. 음수일수록 쉬운 문항, 양수일수록 어려운 문항입니다." />
                </th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">오답 분포</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map(stat => (
                <Fragment key={stat.questionNumber}>
                  <tr
                    onClick={() => setExpanded(expanded === stat.questionNumber ? null : stat.questionNumber)}
                    className="hover:bg-blue-50 cursor-pointer"
                  >
                    <td className="px-3 py-3 font-medium text-gray-900">{formatQuestionNumber(stat.questionNumber)}</td>
                    <td className="px-3 py-3 text-gray-600">{stat.question.contentArea}</td>
                    <td className="px-3 py-3 text-gray-500 max-w-xs truncate text-xs">
                      {stat.question.achievementStandard}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${DIFF_BG[stat.question.difficulty] ?? ''}`}>
                        {stat.question.difficulty}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center text-gray-600">{stat.question.points}</td>
                    <td className="px-3 py-3 text-center font-medium text-gray-800">{stat.question.answer ?? '-'}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-gray-100 rounded-full h-2">
                          <div
                            className="h-2 rounded-full"
                            style={{
                              width: `${stat.correctRate}%`,
                              backgroundColor: stat.correctRate >= 70 ? '#4ade80' : stat.correctRate >= 40 ? '#facc15' : '#f87171',
                            }}
                          />
                        </div>
                        <span className={correctRateColor(stat.correctRate)}>
                          {stat.correctRate.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center text-gray-700 font-mono text-xs">
                      {formatIrt(stat.irtDiscrimination)}
                      {stat.irtDiscrimination !== null && (stat.irtDiscrimination < 0 || stat.irtDiscrimination < 0.1) && (
                        <span className="ml-1 text-[10px] text-red-500 font-sans" title="학생 IRT(θ) 계산에서 제외됩니다">IRT제외</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center text-gray-700 font-mono text-xs">
                      {formatIrt(stat.irtDifficulty)}
                    </td>
                    <td className="px-3 py-3">
                      <WrongDistMini dist={stat.wrongDist} n={n} />
                    </td>
                  </tr>
                  {expanded === stat.questionNumber && (
                    <tr>
                      <td colSpan={10} className="px-4 py-4 bg-blue-50">
                        <QuestionDetail stat={stat} n={n} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {subjectiveQuestionStats.length > 0 && (
        <SubjectiveStatsTable stats={subjectiveQuestionStats} />
      )}

      {/* 서답형 요약 */}
      <div className="bg-white rounded-xl shadow p-5">
        <h3 className="font-semibold text-gray-700 mb-3">{isSubjectiveSplit ? '서답형 점수 현황 (단답형/서술형 분리)' : '서답형 점수 현황'}</h3>
        {!isSubjectiveSplit && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <MiniStat label="서답형 평균" value={n > 0 ? avgSa.toFixed(1) : '-'} sub={`/ ${examInfo.shortAnswerTotal}점`} />
              <MiniStat
                label="서답형 평균률"
                value={n > 0 && examInfo.shortAnswerTotal > 0 ? ((avgSa / examInfo.shortAnswerTotal) * 100).toFixed(1) : '-'}
                sub="%"
              />
              <MiniStat label="서답형 최고" value={n > 0 ? Math.max(...examData.students.map(s => s.saScore)).toFixed(1) : '-'} sub="점" />
              <MiniStat label="서답형 최저" value={n > 0 ? Math.min(...examData.students.map(s => s.saScore)).toFixed(1) : '-'} sub="점" />
            </div>
            <p className="text-xs text-gray-400 mt-3">
              ※ 분리 데이터가 없어 서답형 통합 점수로만 분석합니다.
            </p>
          </>
        )}
        {isSubjectiveSplit && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <MiniStat label="단답형 평균" value={n > 0 ? avgShort.toFixed(1) : '-'} sub={shortTotal > 0 ? `/ ${shortTotal.toFixed(1)}점` : '점'} />
              <MiniStat label="단답형 평균 득점률" value={shortRate !== null ? shortRate.toFixed(1) : '-'} sub="%" />
              <MiniStat label="단답형 최빈값" value={shortMode.value} sub={shortMode.count > 0 ? `(${shortMode.count}명)` : ''} />
              <MiniStat label="단답형 최고" value={n > 0 ? Math.max(...examData.students.map(s => s.shortAnswerScore)).toFixed(1) : '-'} sub="점" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <MiniStat label="서술형 평균 부분점수" value={n > 0 ? avgEssay.toFixed(1) : '-'} sub={essayTotal > 0 ? `/ ${essayTotal.toFixed(1)}점` : '점'} />
              <MiniStat label="서술형 평균 득점률" value={essayRate !== null ? essayRate.toFixed(1) : '-'} sub="%" />
              <MiniStat label="서술형 최빈값" value={essayMode.value} sub={essayMode.count > 0 ? `(${essayMode.count}명)` : ''} />
              <MiniStat label="서술형 최고" value={n > 0 ? Math.max(...examData.students.map(s => s.essayScore)).toFixed(1) : '-'} sub="점" />
            </div>
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-3 py-2 text-xs text-gray-600 font-medium">서답형 문항 번호 (문항정보표 기준)</div>
              <div className="p-3 flex flex-wrap gap-2">
                {subjectiveQuestions.map((q, i) => (
                  <span key={`${q.type}-${q.number}-${i}`} className="text-xs bg-white border border-gray-200 rounded px-2 py-1 text-gray-700">
                    {formatSubjectiveNumber(i + 1)} · {q.type} · {q.points}점
                  </span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center pt-2 border-t border-gray-100">
              <MiniStat label="서답형 합계 평균" value={n > 0 ? avgSa.toFixed(1) : '-'} sub={`/ ${examInfo.shortAnswerTotal}점`} />
              <MiniStat
                label="서답형 합계 평균률"
                value={n > 0 && examInfo.shortAnswerTotal > 0 ? ((avgSa / examInfo.shortAnswerTotal) * 100).toFixed(1) : '-'}
                sub="%"
              />
              <MiniStat label="서답형 합계 최저" value={n > 0 ? Math.min(...examData.students.map(s => s.saScore)).toFixed(1) : '-'} sub="점" />
              <MiniStat label="서답형 합계 최고" value={n > 0 ? Math.max(...examData.students.map(s => s.saScore)).toFixed(1) : '-'} sub="점" />
            </div>
            <p className="text-xs text-gray-400">
              {subjectiveQuestionStats.length > 0
                ? '※ 정오표의 단답형/서술형 문항별 점수 열을 이용해 문항별 득점률과 유형 내부 변별도를 계산합니다.'
                : '※ 정오표에 서답형 문항별 점수 열이 없으면, 위 값은 문항별 통계가 아니라 섹션 점수(단답형/서술형 합계 열) 기준 분석입니다.'}
            </p>
          </div>
        )}
      </div>

      <InfoModal
        open={showIrtGuide}
        title="문항반응이론(IRT) 해석 가이드"
        onClose={() => setShowIrtGuide(false)}
      >
        <p>IRT는 문항의 난이도와 변별도를 이용해 문항과 학생 반응을 함께 해석하는 방법입니다.</p>
        <p><strong>a(변별도)</strong>: 클수록 학생 실력 차이를 잘 구분합니다. 0에 가깝거나 음수면 문항 점검이 필요할 수 있습니다.</p>
        <p><strong>b(난이도)</strong>: 음수면 쉬운 문항, 0 근처면 중간 난이도, 양수면 어려운 문항으로 봅니다.</p>
        <p><strong>실무 해석 순서</strong>: 1) 음수 a 문항 우선 점검 2) a가 너무 낮은 문항 개선 3) 시험 전체 b 분포가 목표 난이도와 맞는지 확인</p>
        <p className="text-xs text-gray-500">현재 화면의 IRT 값은 운영 편의를 위한 근사치이며, 최종 판단은 정답률/오답분포/문항 내용과 함께 보시는 것을 권장합니다.</p>
      </InfoModal>
    </div>
  )
}

function TermHint({ text, hint }: { text: string; hint?: string }) {
  if (!hint) return <>{text}</>
  return (
    <span
      title={hint}
      className="underline decoration-dotted underline-offset-2 cursor-help"
    >
      {text}
    </span>
  )
}

function SubjectiveStatsTable({ stats }: { stats: QuestionStat[] }) {
  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="font-semibold text-gray-700">단답형/서술형 문항별 분석</h3>
        <p className="text-xs text-gray-500 mt-1">
          평균득점률은 문항 배점 대비 평균 점수이며, 변별도 a는 각 유형 안에서 해당 문항 점수를 제외한 나머지 점수 기준입니다.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">유형</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">문항</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">내용영역</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">성취기준</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">난이도</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">배점</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">평균득점</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">득점률</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">
                <TermHint text="IRT a" hint="유형 내부 나머지 점수와의 변별도 근사치입니다." />
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">
                <TermHint text="IRT b" hint="평균득점률을 logit 척도로 바꾼 난이도 근사치입니다." />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {stats.map(stat => (
              <tr key={`${stat.type}-${stat.questionNumber}`}>
                <td className="px-3 py-3 text-gray-700">{stat.type}</td>
                <td className="px-3 py-3 font-medium text-gray-900">{formatSubjectiveStatNumber(stat)}</td>
                <td className="px-3 py-3 text-gray-600">{stat.question.contentArea}</td>
                <td className="px-3 py-3 text-gray-500 max-w-xs truncate text-xs">{stat.question.achievementStandard}</td>
                <td className="px-3 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${DIFF_BG[stat.question.difficulty] ?? ''}`}>
                    {stat.question.difficulty}
                  </span>
                </td>
                <td className="px-3 py-3 text-center text-gray-600">{stat.question.points}</td>
                <td className="px-3 py-3 text-center text-gray-700">{stat.avgPointsEarned.toFixed(1)}</td>
                <td className="px-3 py-3 text-center">
                  <span className={correctRateColor(stat.correctRate)}>
                    {stat.correctRate.toFixed(0)}%
                  </span>
                </td>
                <td className="px-3 py-3 text-center text-gray-700 font-mono text-xs">{formatIrt(stat.irtDiscrimination)}</td>
                <td className="px-3 py-3 text-center text-gray-700 font-mono text-xs">{formatIrt(stat.irtDifficulty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function WrongDistMini({ dist, n }: { dist: Record<string, number>; n: number }) {
  const total = Object.values(dist).reduce((a, b) => a + b, 0)
  if (total === 0) return <span className="text-xs text-gray-400">-</span>

  return (
    <div className="flex gap-1 flex-wrap">
      {Object.entries(dist)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([code, cnt]) => {
          const label = MULTIPLE_ANSWER_MAP[code] ? `${code}(${MULTIPLE_ANSWER_MAP[code].join(',')})` : code
          return (
            <span key={code} className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded border border-red-100">
              ①{label}: {((cnt / n) * 100).toFixed(0)}%
            </span>
          )
        })}
    </div>
  )
}

function QuestionDetail({ stat, n }: { stat: QuestionStat; n: number }) {
  const correctCount = Math.round((stat.correctRate / 100) * n)

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-700 font-medium">성취기준</p>
      <p className="text-sm text-gray-600">{stat.question.achievementStandard}</p>
      <div className="grid grid-cols-5 gap-2 mt-2">
        {[1, 2, 3, 4, 5].map(opt => {
          const isAnswer = String(opt) === stat.question.answer
          const code = Object.entries(MULTIPLE_ANSWER_MAP)
            .filter(([, arr]) => arr.includes(opt) && arr.length === 2)
            .map(([k]) => k)

          let cnt = isAnswer ? correctCount : (stat.wrongDist[String(opt)] ?? 0)
          // 복수답안 포함 계산
          for (const k of code) {
            cnt += stat.wrongDist[k] ?? 0
          }
          const pct = n > 0 ? (cnt / n) * 100 : 0

          return (
            <div
              key={opt}
              className={`rounded-lg p-2 text-center border ${isAnswer ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200'}`}
            >
              <p className={`text-sm font-bold ${isAnswer ? 'text-green-700' : 'text-gray-700'}`}>
                {isAnswer ? `✓ ${opt}번` : `${opt}번`}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{cnt}명 ({pct.toFixed(0)}%)</p>
              <div className="mt-1 bg-gray-100 rounded h-1.5">
                <div
                  className={`h-1.5 rounded ${isAnswer ? 'bg-green-500' : 'bg-gray-400'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FilterGroup({ label, options, value, onChange }: {
  label: string
  options: string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 font-medium">{label}:</span>
      <div className="flex gap-1">
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              value === opt
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xl font-bold text-gray-800 mt-0.5">{value}<span className="text-sm font-normal ml-0.5">{sub}</span></p>
    </div>
  )
}

function formatIrt(value: number | null) {
  return value === null || Number.isNaN(value) ? '-' : value.toFixed(2)
}

function formatQuestionNumber(n: number) {
  return String(n).padStart(2, '0')
}

function formatSubjectiveNumber(n: number) {
  return `서${String(n).padStart(2, '0')}`
}

function formatSubjectiveStatNumber(stat: QuestionStat) {
  const prefix = stat.type === '서술형' ? '술' : '단'
  return `${prefix}${String(stat.questionNumber).padStart(2, '0')}`
}

function IrtSummaryCard({ title, difficulty, discrimination, note }: {
  title: string
  difficulty: number | null
  discrimination: number | null
  note?: string
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      <div className="flex gap-4 mt-2 text-sm">
        <p className="text-gray-600">a(변별도): <span className="font-mono text-gray-800">{formatIrt(discrimination)}</span></p>
        <p className="text-gray-600">b(난이도): <span className="font-mono text-gray-800">{formatIrt(difficulty)}</span></p>
      </div>
      <div className="text-xs text-gray-600 mt-2 space-y-1">
        <p>해석: {interpretDiscrimination(discrimination)}</p>
        <p>해석: {interpretDifficulty(difficulty)}</p>
      </div>
      {note && <p className="text-xs text-gray-500 mt-1">{note}</p>}
    </div>
  )
}

function interpretDiscrimination(a: number | null) {
  if (a === null || Number.isNaN(a)) return '변별도를 계산할 수 없습니다.'
  if (a < 0) return '음수 변별도입니다. 정답키/문항 품질 점검이 필요합니다.'
  if (a < 0.2) return '변별도가 낮습니다. 상·하위권 구분력이 약한 문항군입니다.'
  if (a < 0.4) return '변별도는 보통 수준입니다.'
  if (a < 0.7) return '변별도가 양호합니다.'
  return '변별도가 매우 높습니다.'
}

function interpretDifficulty(b: number | null) {
  if (b === null || Number.isNaN(b)) return '난이도를 계산할 수 없습니다.'
  if (b <= -1.5) return '전체적으로 매우 쉬운 문항군입니다.'
  if (b <= -0.5) return '전체적으로 쉬운 편의 문항군입니다.'
  if (b <= 0.5) return '전체적으로 중간 난이도의 문항군입니다.'
  if (b <= 1.5) return '전체적으로 어려운 편의 문항군입니다.'
  return '전체적으로 매우 어려운 문항군입니다.'
}

function modeOfScores(values: number[]): { value: string; count: number } {
  if (values.length === 0) return { value: '-', count: 0 }
  const freq = new Map<string, number>()
  for (const v of values) {
    const key = v.toFixed(1)
    freq.set(key, (freq.get(key) ?? 0) + 1)
  }
  let best = '-'
  let bestCnt = 0
  for (const [key, cnt] of freq.entries()) {
    if (cnt > bestCnt) {
      best = key
      bestCnt = cnt
    }
  }
  return { value: best, count: bestCnt }
}

function Empty({ onHome }: { onHome: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-gray-400 space-y-3">
      <p>데이터가 없습니다</p>
      <button onClick={onHome} className="text-blue-600 hover:underline text-sm">홈으로</button>
    </div>
  )
}
