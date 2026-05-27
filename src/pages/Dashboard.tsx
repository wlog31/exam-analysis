import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { useApp } from '../context/AppContext'
import { calcScoreStats, calcScoreDistribution, groupByContentArea, groupByDifficulty } from '../utils/analytics'
import PrintButton from '../components/common/PrintButton'

const DIFFICULTY_COLORS: Record<string, string> = {
  쉬움: '#4ade80',
  보통: '#facc15',
  어려움: '#f87171',
}

export default function Dashboard() {
  const { examData } = useApp()
  const navigate = useNavigate()

  if (!examData) {
    return <Empty onHome={() => navigate('/')} />
  }

  const { examInfo, students, questionStats } = examData
  const isSubjectiveSplit = examData.subjectiveMode === 'split'
  const stats = calcScoreStats(students)
  const distribution = calcScoreDistribution(students)
  const areaData = groupByContentArea(questionStats)
  const diffData = groupByDifficulty(questionStats)
  const diffPieData = diffData.filter(d => d.count > 0)
  const diffTotalCount = diffPieData.reduce((sum, d) => sum + d.count, 0)
  const avgMc = students.length ? students.reduce((a, s) => a + s.mcScore, 0) / students.length : 0
  const avgSa = students.length ? students.reduce((a, s) => a + s.saScore, 0) / students.length : 0
  const avgShort = students.length ? students.reduce((a, s) => a + s.shortAnswerScore, 0) / students.length : 0
  const avgEssay = students.length ? students.reduce((a, s) => a + s.essayScore, 0) / students.length : 0

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <div className="flex justify-end">
        <PrintButton />
      </div>

      {/* 시험 정보 */}
      <div className="bg-white rounded-xl shadow p-5">
        <h2 className="text-lg font-bold text-gray-800 mb-1">
          {examInfo.subject} — {examInfo.year}년도 {examInfo.semester}학기 {examInfo.examNumber}차 고사
        </h2>
        <p className="text-sm text-gray-500">
          {examInfo.grade}학년 · 응시 {students.length}명 · 총 {examInfo.totalQuestions}문항
          (선택형 {examInfo.multipleChoiceCount}문항 {examInfo.multipleChoiceTotal}점,
          서답형 {examInfo.shortAnswerCount}문항 {examInfo.shortAnswerTotal}점
          {isSubjectiveSplit ? ' · 단답/서술 분리분석' : ''})
          {examInfo.date && ` · ${examInfo.date}`}
        </p>
      </div>

      {/* 핵심 지표 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="평균" value={stats.avg.toFixed(1)} unit="점" color="blue" />
        <StatCard label="최고" value={stats.max.toFixed(1)} unit="점" color="green" />
        <StatCard label="최저" value={stats.min.toFixed(1)} unit="점" color="red" />
        <StatCard label="표준편차" value={stats.stdDev.toFixed(1)} unit="점" color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 점수 분포 */}
        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="font-semibold text-gray-700 mb-4">점수 분포</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={distribution} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <XAxis dataKey="range" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [`${v}명`, '인원']} />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 내용영역별 정답률 */}
        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="font-semibold text-gray-700 mb-4">내용영역별 정답률 (선택형)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={areaData} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <YAxis dataKey="area" type="category" tick={{ fontSize: 11 }} width={55} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, '정답률']} />
              <Bar dataKey="correctRate" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 난이도별 문항 분포 */}
        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="font-semibold text-gray-700 mb-4">난이도별 정답률</h3>
          <div className="space-y-3">
            {diffData.map(d => (
              <div key={d.difficulty}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-gray-700">{d.difficulty}</span>
                  <span className="text-gray-500">{d.count}문항 · {d.avgCorrectRate.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-4">
                  <div
                    className="h-4 rounded-full transition-all"
                    style={{
                      width: `${d.avgCorrectRate}%`,
                      backgroundColor: DIFFICULTY_COLORS[d.difficulty] ?? '#94a3b8',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 문항 유형별 평균 */}
        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="font-semibold text-gray-700 mb-4">유형별 평균 점수</h3>
          <div className="space-y-4">
            <ScoreRow
              label="선택형"
              score={avgMc}
              total={examInfo.multipleChoiceTotal}
            />
            {isSubjectiveSplit && (
              <ScoreRow
                label="단답형"
                score={avgShort}
              />
            )}
            {isSubjectiveSplit && (
              <ScoreRow
                label="서술형"
                score={avgEssay}
              />
            )}
            <ScoreRow
              label={isSubjectiveSplit ? '서답형 합계' : '서답형'}
              score={avgSa}
              total={examInfo.shortAnswerTotal}
            />
            <ScoreRow
              label="전체"
              score={stats.avg}
              total={100}
            />
          </div>
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-xs font-medium text-gray-500 mb-2">문항 난이도 구성</h4>
            {diffPieData.length === 0 ? (
              <p className="text-xs text-gray-400">난이도 데이터가 없습니다.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-3 items-center">
                <div className="h-44 sm:h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={diffPieData}
                        dataKey="count"
                        nameKey="difficulty"
                        cx="50%"
                        cy="50%"
                        innerRadius={38}
                        outerRadius={66}
                        paddingAngle={2}
                        stroke="#ffffff"
                        strokeWidth={2}
                      >
                        {diffPieData.map(d => (
                          <Cell key={d.difficulty} fill={DIFFICULTY_COLORS[d.difficulty] ?? '#94a3b8'} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => {
                          const pct = diffTotalCount > 0 ? (value / diffTotalCount) * 100 : 0
                          return [`${value}문항 (${pct.toFixed(1)}%)`, '문항 수']
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {diffPieData.map(d => {
                    const pct = diffTotalCount > 0 ? (d.count / diffTotalCount) * 100 : 0
                    return (
                      <div key={d.difficulty} className="flex items-center justify-between rounded-lg border border-gray-200 px-2.5 py-2">
                        <span className="text-sm text-gray-700 flex items-center gap-2">
                          <span
                            className="inline-block w-3 h-3 rounded-full"
                            style={{ backgroundColor: DIFFICULTY_COLORS[d.difficulty] ?? '#94a3b8' }}
                          />
                          {d.difficulty}
                        </span>
                        <span className="text-xs text-gray-500">{d.count}문항 · {pct.toFixed(1)}%</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 문항별 정답률 개요 */}
      <div className="bg-white rounded-xl shadow p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-700">문항별 정답률 (선택형)</h3>
          <button
            onClick={() => navigate('/questions')}
            className="text-sm text-blue-600 hover:underline"
          >
            상세 분석 →
          </button>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart
            data={questionStats.map(q => ({
              name: formatChoiceNumber(q.questionNumber),
              rate: Math.round(q.correctRate),
              diff: q.question.difficulty,
            }))}
            margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
          >
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
            <Tooltip formatter={(v: number) => [`${v}%`, '정답률']} />
            <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
              {questionStats.map(q => (
                <Cell
                  key={q.questionNumber}
                  fill={DIFFICULTY_COLORS[q.question.difficulty] ?? '#94a3b8'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex gap-4 justify-end mt-2">
          {Object.entries(DIFFICULTY_COLORS).map(([d, c]) => (
            <span key={d} className="text-xs flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: c }} />
              {d}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function formatChoiceNumber(n: number) {
  return String(n).padStart(2, '0')
}

function StatCard({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    red: 'text-red-500',
    purple: 'text-purple-600',
  }
  return (
    <div className="bg-white rounded-xl shadow p-4 text-center">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colorMap[color] ?? 'text-gray-700'}`}>
        {value}<span className="text-sm font-normal ml-0.5">{unit}</span>
      </p>
    </div>
  )
}

function ScoreRow({ label, score, total }: { label: string; score: number; total?: number }) {
  const hasTotal = typeof total === 'number' && total > 0
  const pct = hasTotal ? (score / total) * 100 : 0
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="font-medium text-gray-700">{label}</span>
        {hasTotal ? (
          <span className="text-gray-500">{score.toFixed(1)} / {total}점 ({pct.toFixed(1)}%)</span>
        ) : (
          <span className="text-gray-500">{score.toFixed(1)}점</span>
        )}
      </div>
      <div className="w-full bg-gray-100 rounded-full h-3">
        <div className="h-3 bg-blue-500 rounded-full" style={{ width: `${hasTotal ? pct : 0}%` }} />
      </div>
    </div>
  )
}

function Empty({ onHome }: { onHome: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-gray-400 space-y-3">
      <p className="text-lg">데이터가 없습니다</p>
      <button onClick={onHome} className="text-blue-600 hover:underline text-sm">
        홈으로 돌아가서 데이터 불러오기
      </button>
    </div>
  )
}
