import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from 'recharts'
import { useApp } from '../context/AppContext'
import PrintButton from '../components/common/PrintButton'
import type { ExamData } from '../types'
import {
  buildFormalIrtAnalysis,
  type IrtItemEstimate,
  type IrtStudentEstimate,
  type IrtWarning,
  type SubjectiveIrtItemEstimate,
  type SubjectiveIrtStudentEstimate,
  type SubjectivePolytomousIrtResult,
} from '../utils/formalIrt'
import { isCorrect } from '../utils/parseAnswerSheet'

type ItemFilter = '전체' | '점검 필요'

type GuidanceStudent = {
  studentId: string
  name: string
  classNum: string
  seatNum: string
  theta: number | null
  sem: number | null
  percentile: number | null
  scoreLabel: string
  focus: string[]
  note: string
}

type GuidanceArea = {
  label: string
  itemCount: number
  scoreRate: number
  difficulty: number | null
  discrimination: number | null
  flaggedCount: number
  reason: string
}

type GuidanceItem = {
  id: string
  area: string
  metricLabel: string
  flags: string[]
  detail: string
}

type TeachingGuidanceSummary = {
  areas: GuidanceArea[]
  foundationalStudents: GuidanceStudent[]
  challengeStudents: GuidanceStudent[]
  reviewItems: GuidanceItem[]
}

const WARNING_STYLE: Record<IrtWarning['level'], string> = {
  info: 'bg-blue-50 border-blue-100 text-blue-700',
  warning: 'bg-amber-50 border-amber-100 text-amber-700',
  danger: 'bg-red-50 border-red-100 text-red-700',
}

export default function FormalIrtAnalysis() {
  const { examData } = useApp()
  const navigate = useNavigate()
  const [itemFilter, setItemFilter] = useState<ItemFilter>('전체')

  const result = useMemo(() => examData ? buildFormalIrtAnalysis(examData) : null, [examData])
  const thetaBins = useMemo(() => result ? buildThetaBins(result.students) : [], [result])
  const subjectiveThetaBins = useMemo(
    () => result?.subjective ? buildThetaBins(result.subjective.students) : [],
    [result],
  )
  const objectiveGuidance = useMemo(
    () => result && examData ? buildObjectiveGuidance(result.items, result.students, examData) : null,
    [examData, result],
  )
  const subjectiveGuidance = useMemo(
    () => result?.subjective && examData?.subjectiveIrtData
      ? buildSubjectiveGuidance(result.subjective, examData)
      : null,
    [examData, result],
  )

  if (!result || !examData) {
    return <Empty onHome={() => navigate('/')} />
  }

  const filteredItems = result.items.filter(item => itemFilter === '전체' || item.flags.length > 0)
  const highRiskCount = result.items.filter(item => item.flags.length > 0).length
  const maxInfo = Math.max(...result.curve.map(point => point.information), 1)
  const validStudents = result.students.filter(student => student.theta !== null)
  const topStudents = validStudents.slice(0, 12)
  const bottomStudents = [...validStudents].slice(-12).reverse()
  const subjectiveTopStudents = result.subjective?.students.slice(0, 12) ?? []
  const subjectiveBottomStudents = result.subjective ? [...result.subjective.students].slice(-12).reverse() : []

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <div className="flex justify-end print:hidden">
        <PrintButton />
      </div>

      <section className="bg-white rounded-xl shadow p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="font-bold text-gray-800 text-lg">선택형 전문 IRT 분석</h2>
            <p className="text-sm text-gray-500 mt-1">{result.modelNote}</p>
          </div>
          <div className="text-xs text-gray-500 md:text-right">
            <p>반복 {result.iterations}회 · {result.converged ? '수렴' : '수렴 기준 미도달'}</p>
            <p>로그우도 {formatFixed(result.logLikelihood, 1)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <SummaryCard label="적용 모형" value={result.model} sub={result.model === '2PL' ? '변별도·난이도 추정' : '공통 변별도 가정'} tone="blue" />
          <SummaryCard label="응시자" value={`${result.studentCount}명`} sub={sampleStatus(result.studentCount)} tone="green" />
          <SummaryCard label="보정 문항" value={`${result.includedItemCount}/${result.itemCount}`} sub={`제외 ${result.excludedQuestions.length}문항`} tone="amber" />
          <SummaryCard label="분리 신뢰도" value={formatFixed(result.reliability, 2)} sub={reliabilityLabel(result.reliability)} tone="purple" />
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-5">
        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="font-semibold text-gray-700 mb-3">데이터 적합성 점검</h3>
          <div className="space-y-2">
            {result.warnings.map((warning, index) => (
              <WarningRow key={`${warning.title}-${index}`} warning={warning} />
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 leading-relaxed">
            {result.subjectiveNote}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="font-semibold text-gray-700 mb-3">능력 추정 분포</h3>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={thetaBins} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <XAxis dataKey="range" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value: number) => [`${value}명`, '인원']} />
              <Bar dataKey="count" fill="#14b8a6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-500 mt-2">
            θ는 평균 0, 표준편차 1에 가깝게 표준화한 상대 능력 척도입니다.
          </p>
        </div>
      </section>

      {objectiveGuidance && (
        <TeachingGuidanceSection
          title="선택형 IRT 기반 지도 요약"
          subtitle="θ, SE, 문항 난이도·변별도와 실제 반응을 함께 보아 우선 지도 대상과 심화 대상, 문항 점검 대상을 정리했습니다."
          summary={objectiveGuidance}
        />
      )}

      <section className="bg-white rounded-xl shadow p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h3 className="font-semibold text-gray-700">검사 정보함수</h3>
            <p className="text-xs text-gray-500 mt-1">
              정보량이 높을수록 해당 θ 구간에서 학생 능력을 더 정밀하게 구분합니다.
            </p>
          </div>
          <span className="text-xs text-gray-500">최대 정보량 {maxInfo.toFixed(2)}</span>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={result.curve} margin={{ top: 8, right: 15, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="theta" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="info" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="sem" orientation="right" tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value: number, name: string) => [
                typeof value === 'number' ? value.toFixed(2) : value,
                name === 'information' ? '정보량' : '표준오차',
              ]}
              labelFormatter={label => `θ ${label}`}
            />
            <Line yAxisId="info" type="monotone" dataKey="information" stroke="#2563eb" strokeWidth={2} dot={false} />
            <Line yAxisId="sem" type="monotone" dataKey="sem" stroke="#f97316" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </section>

      {result.subjective && (
        <SubjectiveIrtSection
          result={result.subjective}
          thetaBins={subjectiveThetaBins}
          topStudents={subjectiveTopStudents}
          bottomStudents={subjectiveBottomStudents}
          guidance={subjectiveGuidance}
        />
      )}

      <section className="bg-white rounded-xl shadow overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-gray-700">선택형 문항 모수 및 적합도</h3>
            <p className="text-xs text-gray-500 mt-1">a는 변별도, b는 난이도, infit/outfit은 모형 적합도 점검 지표입니다.</p>
          </div>
          <div className="flex items-center gap-1 print:hidden">
            {(['전체', '점검 필요'] as ItemFilter[]).map(value => (
              <button
                key={value}
                onClick={() => setItemFilter(value)}
                className={`px-3 py-1 rounded-full text-xs border ${
                  itemFilter === value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                }`}
              >
                {value}{value === '점검 필요' ? ` ${highRiskCount}` : ''}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <Th>문항</Th>
                <Th>영역</Th>
                <Th align="center">정답률</Th>
                <Th align="center">a</Th>
                <Th align="center">b</Th>
                <Th align="center">점수상관</Th>
                <Th align="center">infit</Th>
                <Th align="center">outfit</Th>
                <Th>진단</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredItems.map(item => <ItemRow key={item.questionNumber} item={item} />)}
            </tbody>
          </table>
        </div>
      </section>

      {result.excludedQuestions.length > 0 && (
        <section className="bg-white rounded-xl shadow p-5">
          <h3 className="font-semibold text-gray-700 mb-3">보정 제외 문항</h3>
          <div className="flex flex-wrap gap-2">
            {result.excludedQuestions.map(item => (
              <span key={item.questionNumber} className="text-xs rounded border border-gray-200 bg-gray-50 px-2 py-1 text-gray-600">
                {formatQuestionNumber(item.questionNumber)} · {item.reason}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <StudentPanel title="선택형 상위 θ 학생" students={topStudents} />
        <StudentPanel title="선택형 보완 우선 θ 학생" students={bottomStudents} />
      </section>
    </div>
  )
}

function SubjectiveIrtSection({
  result,
  thetaBins,
  topStudents,
  bottomStudents,
  guidance,
}: {
  result: SubjectivePolytomousIrtResult
  thetaBins: { range: string; count: number }[]
  topStudents: SubjectiveIrtStudentEstimate[]
  bottomStudents: SubjectiveIrtStudentEstimate[]
  guidance: TeachingGuidanceSummary | null
}) {
  const maxInfo = Math.max(...result.curve.map(point => point.information), 1)

  return (
    <section className="space-y-5">
      <div className="bg-white rounded-xl shadow p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="font-bold text-gray-800 text-lg">서답형 다분형 IRT</h3>
            <p className="text-sm text-gray-500 mt-1">{result.modelNote}</p>
          </div>
          <div className="text-xs text-gray-500 md:text-right">
            <p>반복 {result.iterations}회 · {result.converged ? '수렴' : '수렴 기준 미도달'}</p>
            <p>로그우도 {formatFixed(result.logLikelihood, 1)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <SummaryCard label="적용 모형" value={result.model} sub="순서형 부분점수" tone="blue" />
          <SummaryCard label="서답형 학생" value={`${result.studentCount}명`} sub={sampleStatus(result.studentCount)} tone="green" />
          <SummaryCard label="보정 문항" value={`${result.includedItemCount}/${result.itemCount}`} sub={`결측 ${(result.missingRate * 100).toFixed(1)}%`} tone="amber" />
          <SummaryCard label="분리 신뢰도" value={formatFixed(result.reliability, 2)} sub={reliabilityLabel(result.reliability)} tone="purple" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-5">
        <div className="bg-white rounded-xl shadow p-5">
          <h4 className="font-semibold text-gray-700 mb-3">서답형 데이터 점검</h4>
          <div className="space-y-2">
            {result.warnings.map((warning, index) => (
              <WarningRow key={`${warning.title}-${index}`} warning={warning} />
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-5">
          <h4 className="font-semibold text-gray-700 mb-3">서답형 θ 분포</h4>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={thetaBins} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <XAxis dataKey="range" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value: number) => [`${value}명`, '인원']} />
              <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {guidance && (
        <TeachingGuidanceSection
          title="서답형 IRT 기반 지도 요약"
          subtitle="부분점수 θ와 SE, 문항 위치값·임계값 점검 결과를 활용해 서답형 지도 우선순위를 정리했습니다."
          summary={guidance}
        />
      )}

      <div className="bg-white rounded-xl shadow p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h4 className="font-semibold text-gray-700">서답형 검사 정보함수</h4>
            <p className="text-xs text-gray-500 mt-1">
              부분점수 범주가 어느 θ 구간의 학생을 잘 구분하는지 보여줍니다.
            </p>
          </div>
          <span className="text-xs text-gray-500">최대 정보량 {maxInfo.toFixed(2)}</span>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={result.curve} margin={{ top: 8, right: 15, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="theta" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="info" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="sem" orientation="right" tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value: number, name: string) => [
                typeof value === 'number' ? value.toFixed(2) : value,
                name === 'information' ? '정보량' : '표준오차',
              ]}
              labelFormatter={label => `θ ${label}`}
            />
            <Line yAxisId="info" type="monotone" dataKey="information" stroke="#7c3aed" strokeWidth={2} dot={false} />
            <Line yAxisId="sem" type="monotone" dataKey="sem" stroke="#f97316" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h4 className="font-semibold text-gray-700">서답형 문항 모수 및 범주 임계값</h4>
          <p className="text-xs text-gray-500 mt-1">
            location은 문항 평균 임계값, τ는 각 부분점수 단계로 올라가는 데 필요한 θ 기준점입니다.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <Th>문항</Th>
                <Th>유형</Th>
                <Th>영역</Th>
                <Th align="center">평균득점률</Th>
                <Th align="center">location</Th>
                <Th align="center">점수상관</Th>
                <Th align="center">infit</Th>
                <Th align="center">outfit</Th>
                <Th>임계값</Th>
                <Th>진단</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {result.items.map(item => <SubjectiveItemRow key={item.itemId} item={item} />)}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <SubjectiveStudentPanel title="서답형 상위 θ 학생" students={topStudents} />
        <SubjectiveStudentPanel title="서답형 보완 우선 θ 학생" students={bottomStudents} />
      </div>
    </section>
  )
}

function SummaryCard({ label, value, sub, tone }: {
  label: string
  value: string
  sub: string
  tone: 'blue' | 'green' | 'amber' | 'purple'
}) {
  const toneClass = {
    blue: 'text-blue-600',
    green: 'text-emerald-600',
    amber: 'text-amber-600',
    purple: 'text-violet-600',
  }[tone]
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold mt-0.5 ${toneClass}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{sub}</p>
    </div>
  )
}

function WarningRow({ warning }: { warning: IrtWarning }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${WARNING_STYLE[warning.level]}`}>
      <p className="text-sm font-semibold">{warning.title}</p>
      <p className="text-xs mt-0.5 opacity-90">{warning.detail}</p>
    </div>
  )
}

function TeachingGuidanceSection({
  title,
  subtitle,
  summary,
}: {
  title: string
  subtitle: string
  summary: TeachingGuidanceSummary
}) {
  return (
    <section className="bg-white rounded-xl shadow overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-700">{title}</h3>
        <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-4 divide-y xl:divide-y-0 xl:divide-x divide-gray-300">
        <GuidanceColumn title="기초학력 지도 영역" emptyText="뚜렷하게 낮은 영역이 없습니다." headerBg="bg-amber-50" headerText="text-amber-800">
          {summary.areas.map(area => (
            <AreaGuidanceRow key={area.label} area={area} />
          ))}
        </GuidanceColumn>
        <GuidanceColumn title="기초학력 지도 학생" emptyText="우선 지도 대상이 뚜렷하지 않습니다." headerBg="bg-red-50" headerText="text-red-800">
          {summary.foundationalStudents.map(student => (
            <StudentGuidanceRow key={student.studentId} student={student} />
          ))}
        </GuidanceColumn>
        <GuidanceColumn title="더 높은 도전 학생" emptyText="심화 도전 대상이 뚜렷하지 않습니다." headerBg="bg-blue-50" headerText="text-blue-800">
          {summary.challengeStudents.map(student => (
            <StudentGuidanceRow key={student.studentId} student={student} />
          ))}
        </GuidanceColumn>
        <GuidanceColumn title="검토해볼 문항" emptyText="우선 검토 문항이 없습니다." headerBg="bg-purple-50" headerText="text-purple-800">
          {summary.reviewItems.map(item => (
            <ItemGuidanceRow key={item.id} item={item} />
          ))}
        </GuidanceColumn>
      </div>
    </section>
  )
}

function GuidanceColumn({
  title,
  emptyText,
  children,
  headerBg = 'bg-gray-50',
  headerText = 'text-gray-700',
}: {
  title: string
  emptyText: string
  children: ReactNode
  headerBg?: string
  headerText?: string
}) {
  const hasRows = Array.isArray(children) ? children.length > 0 : !!children

  return (
    <div className="flex flex-col">
      <div className={`px-4 py-3 border-b border-gray-300 ${headerBg}`}>
        <h4 className={`text-sm font-semibold ${headerText}`}>{title}</h4>
      </div>
      <div className="p-4 space-y-3 flex-1">
        {hasRows ? children : <p className="text-xs text-gray-400 py-3">{emptyText}</p>}
      </div>
    </div>
  )
}

function AreaGuidanceRow({ area }: { area: GuidanceArea }) {
  return (
    <div className="border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-gray-800 leading-snug">{area.label}</p>
        <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
          {area.reason}
        </span>
      </div>
      <p className="text-xs text-gray-500 mt-1">
        {area.itemCount}문항 · 평균 {formatPercent(area.scoreRate)} · b {formatSigned(area.difficulty)}
      </p>
      <p className="text-xs text-gray-500 mt-0.5">
        a {formatFixed(area.discrimination, 2)} · 점검 {area.flaggedCount}문항
      </p>
    </div>
  )
}

function StudentGuidanceRow({ student }: { student: GuidanceStudent }) {
  return (
    <div className="border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-800">{student.name}</p>
          <p className="text-xs text-gray-500">{student.classNum}반 {student.seatNum}번</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${semBadgeClass(student.sem)}`}>
          SE {formatFixed(student.sem, 2)}
        </span>
      </div>
      <p className="text-xs text-gray-500 mt-1">
        θ {formatSigned(student.theta)} · 백분위 {formatFixed(student.percentile, 1)}% · {student.scoreLabel}
      </p>
      {student.focus.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {student.focus.map(focus => (
            <span key={focus} className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-600">
              {focus}
            </span>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-500 mt-2 leading-relaxed">{student.note}</p>
    </div>
  )
}

function ItemGuidanceRow({ item }: { item: GuidanceItem }) {
  return (
    <div className="border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-800">{item.id}</p>
          <p className="text-xs text-gray-500">{item.area}</p>
        </div>
        <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
          점검
        </span>
      </div>
      <p className="text-xs text-gray-500 mt-1">{item.metricLabel}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {item.flags.map(flag => (
          <span key={flag} className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">
            {flag}
          </span>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-2 leading-relaxed">{item.detail}</p>
    </div>
  )
}

function ItemRow({ item }: { item: IrtItemEstimate }) {
  return (
    <tr className={item.flags.length > 0 ? 'bg-amber-50/40' : undefined}>
      <td className="px-3 py-3 font-medium text-gray-900">{formatQuestionNumber(item.questionNumber)}</td>
      <td className="px-3 py-3 text-gray-600 max-w-[180px] truncate" title={item.achievementStandard}>
        {item.contentArea}
      </td>
      <td className="px-3 py-3 text-center text-gray-700">{formatPercent(item.pValue)}</td>
      <td className={`px-3 py-3 text-center font-mono text-xs ${item.a < 0.35 ? 'text-red-600 font-bold' : 'text-gray-700'}`}>
        {item.a.toFixed(2)}
      </td>
      <td className="px-3 py-3 text-center font-mono text-xs text-gray-700">{item.b.toFixed(2)}</td>
      <td className="px-3 py-3 text-center font-mono text-xs text-gray-700">{formatFixed(item.pointBiserial, 2)}</td>
      <td className={fitClass(item.infit)}>{formatFixed(item.infit, 2)}</td>
      <td className={fitClass(item.outfit)}>{formatFixed(item.outfit, 2)}</td>
      <td className="px-3 py-3">
        {item.flags.length === 0 ? (
          <span className="text-xs text-emerald-600">양호</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {item.flags.map(flag => (
              <span key={flag} className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                {flag}
              </span>
            ))}
          </div>
        )}
      </td>
    </tr>
  )
}

function SubjectiveItemRow({ item }: { item: SubjectiveIrtItemEstimate }) {
  return (
    <tr className={item.flags.length > 0 ? 'bg-amber-50/40' : undefined}>
      <td className="px-3 py-3 font-medium text-gray-900">{item.itemId}</td>
      <td className="px-3 py-3 text-gray-600">{item.itemType}</td>
      <td className="px-3 py-3 text-gray-600 max-w-[180px] truncate" title={item.achievementStandard}>
        {item.contentArea}
      </td>
      <td className="px-3 py-3 text-center text-gray-700">{formatPercent(item.meanRate)}</td>
      <td className="px-3 py-3 text-center font-mono text-xs text-gray-700">{formatFixed(item.location, 2)}</td>
      <td className="px-3 py-3 text-center font-mono text-xs text-gray-700">{formatFixed(item.scoreTotalCorrelation, 2)}</td>
      <td className={fitClass(item.infit)}>{formatFixed(item.infit, 2)}</td>
      <td className={fitClass(item.outfit)}>{formatFixed(item.outfit, 2)}</td>
      <td className="px-3 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">
        {item.thresholds.map((value, index) => `τ${index + 1}=${value.toFixed(2)}`).join(' / ')}
      </td>
      <td className="px-3 py-3">
        {item.flags.length === 0 ? (
          <span className="text-xs text-emerald-600">양호</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {item.flags.map(flag => (
              <span key={flag} className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                {flag}
              </span>
            ))}
          </div>
        )}
      </td>
    </tr>
  )
}

function StudentPanel({ title, students }: { title: string; students: IrtStudentEstimate[] }) {
  return (
    <section className="bg-white rounded-xl shadow overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="font-semibold text-gray-700">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <Th>학생</Th>
              <Th align="center">θ</Th>
              <Th align="center">SE</Th>
              <Th align="center">백분위</Th>
              <Th align="center">정답</Th>
              <Th align="center">기대점수</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {students.map(student => (
              <tr key={student.studentId}>
                <td className="px-3 py-2.5">
                  <p className="font-medium text-gray-800">{student.name}</p>
                  <p className="text-xs text-gray-500">{student.classNum}반 {student.seatNum}번</p>
                </td>
                <td className="px-3 py-2.5 text-center font-mono text-xs text-gray-700">{formatSigned(student.theta)}</td>
                <td className="px-3 py-2.5 text-center font-mono text-xs text-gray-700">{formatFixed(student.sem, 2)}</td>
                <td className="px-3 py-2.5 text-center text-gray-700">{formatFixed(student.percentile, 1)}%</td>
                <td className="px-3 py-2.5 text-center text-gray-700">{student.rawCorrect}</td>
                <td className="px-3 py-2.5 text-center text-gray-700">{formatFixed(student.expectedScore, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function SubjectiveStudentPanel({ title, students }: { title: string; students: SubjectiveIrtStudentEstimate[] }) {
  return (
    <section className="bg-white rounded-xl shadow overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="font-semibold text-gray-700">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <Th>학생</Th>
              <Th align="center">θ</Th>
              <Th align="center">SE</Th>
              <Th align="center">백분위</Th>
              <Th align="center">원점수</Th>
              <Th align="center">기대점수</Th>
              <Th align="center">응답문항</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {students.map(student => (
              <tr key={student.studentId}>
                <td className="px-3 py-2.5">
                  <p className="font-medium text-gray-800">{student.name}</p>
                  <p className="text-xs text-gray-500">{student.classNum}반 {student.seatNum}번</p>
                </td>
                <td className="px-3 py-2.5 text-center font-mono text-xs text-gray-700">{formatSigned(student.theta)}</td>
                <td className="px-3 py-2.5 text-center font-mono text-xs text-gray-700">{formatFixed(student.sem, 2)}</td>
                <td className="px-3 py-2.5 text-center text-gray-700">{formatFixed(student.percentile, 1)}%</td>
                <td className="px-3 py-2.5 text-center text-gray-700">{student.rawScore.toFixed(1)} / {student.maxScore.toFixed(1)}</td>
                <td className="px-3 py-2.5 text-center text-gray-700">{formatFixed(student.expectedScore, 1)}</td>
                <td className="px-3 py-2.5 text-center text-gray-700">{student.answeredItems}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Th({ children, align = 'left' }: { children: string; align?: 'left' | 'center' }) {
  const alignClass = align === 'center' ? 'text-center' : 'text-left'
  return (
    <th className={`px-3 py-2 ${alignClass} text-xs font-medium text-gray-500 uppercase tracking-wide`}>
      {children}
    </th>
  )
}

function buildObjectiveGuidance(
  items: IrtItemEstimate[],
  students: IrtStudentEstimate[],
  examData: ExamData,
): TeachingGuidanceSummary {
  const studentMap = new Map(examData.students.map(student => [student.studentId, student]))
  const areaStats = buildObjectiveAreaStats(items)
  const validStudents = students.filter(student => student.theta !== null)
  const foundationalCandidates = validStudents
    .filter(student => (student.percentile ?? 100) <= 25 || (student.theta ?? 0) <= -0.75)
    .sort((a, b) => (a.theta ?? Infinity) - (b.theta ?? Infinity))
    .slice(0, 8)
  const challengeCandidates = validStudents
    .filter(student => (student.percentile ?? 0) >= 85 || (student.theta ?? 0) >= 1)
    .sort((a, b) => (b.theta ?? -Infinity) - (a.theta ?? -Infinity))
    .slice(0, 8)

  return {
    areas: areaStats
      .filter(area => area.scoreRate < 0.65 || (area.difficulty ?? 0) > 0.45 || area.flaggedCount > 0)
      .sort((a, b) => {
        const scorePriority = a.scoreRate - b.scoreRate
        if (Math.abs(scorePriority) > 0.08) return scorePriority
        return (b.difficulty ?? 0) - (a.difficulty ?? 0)
      })
      .slice(0, 6)
      .map(area => ({
        ...area,
        reason: objectiveAreaReason(area),
      })),
    foundationalStudents: foundationalCandidates.map(student => {
      const record = studentMap.get(student.studentId)
      return {
        studentId: student.studentId,
        name: student.name,
        classNum: student.classNum,
        seatNum: student.seatNum,
        theta: student.theta,
        sem: student.sem,
        percentile: student.percentile,
        scoreLabel: `${student.rawCorrect}/${items.length}개 정답`,
        focus: objectiveStudentFocus(record, items, 'foundation', areaStats),
        note: student.sem !== null && student.sem > 0.85
          ? 'SE가 높아 보충 대상 여부를 원점수와 수업 관찰로 한 번 더 확인하세요.'
          : '낮은 θ와 취약 영역을 함께 보아 기본 개념 재지도와 짧은 확인 평가를 권장합니다.',
      }
    }),
    challengeStudents: challengeCandidates.map(student => {
      const record = studentMap.get(student.studentId)
      return {
        studentId: student.studentId,
        name: student.name,
        classNum: student.classNum,
        seatNum: student.seatNum,
        theta: student.theta,
        sem: student.sem,
        percentile: student.percentile,
        scoreLabel: `${student.rawCorrect}/${items.length}개 정답`,
        focus: objectiveStudentFocus(record, items, 'challenge', areaStats),
        note: student.sem !== null && student.sem > 0.85
          ? '상위권이지만 SE가 높으므로 추가 문항으로 안정성을 확인한 뒤 심화 과제를 배정하세요.'
          : '현재 시험 범위의 기본 성취가 안정적이므로 고난도 문항, 설명형 풀이, 확장 과제를 권장합니다.',
      }
    }),
    reviewItems: items
      .filter(item => item.flags.length > 0)
      .sort((a, b) => reviewItemPriority(b) - reviewItemPriority(a))
      .slice(0, 8)
      .map(item => ({
        id: `${formatQuestionNumber(item.questionNumber)}번`,
        area: item.contentArea,
        metricLabel: `정답률 ${formatPercent(item.pValue)} · a ${formatFixed(item.a, 2)} · b ${formatSigned(item.b)}`,
        flags: item.flags,
        detail: itemReviewDetail(item),
      })),
  }
}

function buildSubjectiveGuidance(
  result: SubjectivePolytomousIrtResult,
  examData: ExamData,
): TeachingGuidanceSummary {
  const data = examData.subjectiveIrtData
  const areaStats = buildSubjectiveAreaStats(result.items)
  const validStudents = result.students.filter(student => student.theta !== null)
  const foundationalCandidates = validStudents
    .filter(student => (student.percentile ?? 100) <= 25 || (student.theta ?? 0) <= -0.75)
    .sort((a, b) => (a.theta ?? Infinity) - (b.theta ?? Infinity))
    .slice(0, 8)
  const challengeCandidates = validStudents
    .filter(student => (student.percentile ?? 0) >= 85 || (student.theta ?? 0) >= 1)
    .sort((a, b) => (b.theta ?? -Infinity) - (a.theta ?? -Infinity))
    .slice(0, 8)

  return {
    areas: areaStats
      .filter(area => area.scoreRate < 0.65 || (area.difficulty ?? 0) > 0.45 || area.flaggedCount > 0)
      .sort((a, b) => {
        const scorePriority = a.scoreRate - b.scoreRate
        if (Math.abs(scorePriority) > 0.08) return scorePriority
        return (b.difficulty ?? 0) - (a.difficulty ?? 0)
      })
      .slice(0, 6)
      .map(area => ({
        ...area,
        reason: subjectiveAreaReason(area),
      })),
    foundationalStudents: foundationalCandidates.map(student => ({
      studentId: student.studentId,
      name: student.name,
      classNum: student.classNum,
      seatNum: student.seatNum,
      theta: student.theta,
      sem: student.sem,
      percentile: student.percentile,
      scoreLabel: `${student.rawScore.toFixed(1)}/${student.maxScore.toFixed(1)}점`,
      focus: subjectiveStudentFocus(student.studentId, data, 'foundation', areaStats),
      note: student.sem !== null && student.sem > 0.85
        ? '서답형 응답 수 또는 범주 정보가 부족할 수 있어 루브릭별 채점 기록과 함께 확인하세요.'
        : '부분점수 단계에서 막힌 영역을 우선 확인하고, 해당 루브릭 단계의 예시 답안을 다시 다루세요.',
    })),
    challengeStudents: challengeCandidates.map(student => ({
      studentId: student.studentId,
      name: student.name,
      classNum: student.classNum,
      seatNum: student.seatNum,
      theta: student.theta,
      sem: student.sem,
      percentile: student.percentile,
      scoreLabel: `${student.rawScore.toFixed(1)}/${student.maxScore.toFixed(1)}점`,
      focus: subjectiveStudentFocus(student.studentId, data, 'challenge', areaStats),
      note: student.sem !== null && student.sem > 0.85
        ? '상위 수행으로 보이지만 SE가 높아 추가 서술형 과제로 안정성을 확인하세요.'
        : '답안 설명, 풀이 비교, 조건 변형 문항처럼 사고 과정을 확장하는 과제를 권장합니다.',
    })),
    reviewItems: result.items
      .filter(item => item.flags.length > 0)
      .sort((a, b) => subjectiveReviewItemPriority(b) - subjectiveReviewItemPriority(a))
      .slice(0, 8)
      .map(item => ({
        id: item.itemId,
        area: item.contentArea,
        metricLabel: `득점률 ${formatPercent(item.meanRate)} · location ${formatSigned(item.location)}`,
        flags: item.flags,
        detail: subjectiveItemReviewDetail(item),
      })),
  }
}

function buildObjectiveAreaStats(items: IrtItemEstimate[]): GuidanceArea[] {
  const groups = new Map<string, IrtItemEstimate[]>()
  for (const item of items) {
    const key = item.contentArea || '미분류'
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return Array.from(groups.entries()).map(([label, group]) => ({
    label,
    itemCount: group.length,
    scoreRate: meanNumbers(group.map(item => item.pValue)),
    difficulty: meanNullable(group.map(item => item.b)),
    discrimination: meanNullable(group.map(item => item.a)),
    flaggedCount: group.filter(item => item.flags.length > 0).length,
    reason: '',
  }))
}

function buildSubjectiveAreaStats(items: SubjectiveIrtItemEstimate[]): GuidanceArea[] {
  const groups = new Map<string, SubjectiveIrtItemEstimate[]>()
  for (const item of items) {
    const key = item.contentArea || '미분류'
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return Array.from(groups.entries()).map(([label, group]) => ({
    label,
    itemCount: group.length,
    scoreRate: meanNumbers(group.map(item => item.meanRate)),
    difficulty: meanNullable(group.map(item => item.location)),
    discrimination: meanNullable(group.map(item => item.scoreTotalCorrelation)),
    flaggedCount: group.filter(item => item.flags.length > 0).length,
    reason: '',
  }))
}

function objectiveStudentFocus(
  student: ExamData['students'][number] | undefined,
  items: IrtItemEstimate[],
  mode: 'foundation' | 'challenge',
  areaStats: GuidanceArea[],
): string[] {
  if (!student) return []
  const areaByLabel = new Map(areaStats.map(area => [area.label, area]))
  const groups = new Map<string, { correct: number; total: number }>()
  for (const item of items) {
    const key = item.contentArea || '미분류'
    const group = groups.get(key) ?? { correct: 0, total: 0 }
    const raw = student.mcAnswers[item.questionNumber] ?? ''
    group.correct += isCorrect(raw, item.answer) ? 1 : 0
    group.total++
    groups.set(key, group)
  }

  const rows = Array.from(groups.entries()).map(([label, group]) => ({
    label,
    rate: group.total > 0 ? group.correct / group.total : 0,
    difficulty: areaByLabel.get(label)?.difficulty ?? 0,
  }))

  if (mode === 'foundation') {
    const weak = rows
      .filter(row => row.rate < 0.7)
      .sort((a, b) => a.rate - b.rate || (b.difficulty ?? 0) - (a.difficulty ?? 0))
      .slice(0, 3)
    return (weak.length > 0 ? weak : rows.sort((a, b) => a.rate - b.rate).slice(0, 2))
      .map(row => `${row.label} ${formatPercent(row.rate)}`)
  }

  const challenge = rows
    .filter(row => row.rate >= 0.75)
    .sort((a, b) => (b.difficulty ?? 0) - (a.difficulty ?? 0) || b.rate - a.rate)
    .slice(0, 3)
  return (challenge.length > 0 ? challenge : rows.sort((a, b) => b.rate - a.rate).slice(0, 2))
    .map(row => `${row.label} 심화`)
}

function subjectiveStudentFocus(
  studentId: string,
  data: ExamData['subjectiveIrtData'],
  mode: 'foundation' | 'challenge',
  areaStats: GuidanceArea[],
): string[] {
  if (!data) return []
  const student = data.students.find(row => row.studentId === studentId)
  if (!student) return []
  const areaByLabel = new Map(areaStats.map(area => [area.label, area]))
  const groups = new Map<string, { earned: number; total: number }>()
  for (const item of data.items) {
    if (!item.includeInIrt || item.maxScore <= 0) continue
    const score = student.scores[item.itemId]
    if (score === null || score === undefined || !Number.isFinite(score)) continue
    const key = item.contentArea || '미분류'
    const group = groups.get(key) ?? { earned: 0, total: 0 }
    group.earned += Math.max(0, Math.min(score, item.maxScore))
    group.total += item.maxScore
    groups.set(key, group)
  }

  const rows = Array.from(groups.entries()).map(([label, group]) => ({
    label,
    rate: group.total > 0 ? group.earned / group.total : 0,
    difficulty: areaByLabel.get(label)?.difficulty ?? 0,
  }))

  if (mode === 'foundation') {
    const weak = rows
      .filter(row => row.rate < 0.7)
      .sort((a, b) => a.rate - b.rate || (b.difficulty ?? 0) - (a.difficulty ?? 0))
      .slice(0, 3)
    return (weak.length > 0 ? weak : rows.sort((a, b) => a.rate - b.rate).slice(0, 2))
      .map(row => `${row.label} ${formatPercent(row.rate)}`)
  }

  const challenge = rows
    .filter(row => row.rate >= 0.75)
    .sort((a, b) => (b.difficulty ?? 0) - (a.difficulty ?? 0) || b.rate - a.rate)
    .slice(0, 3)
  return (challenge.length > 0 ? challenge : rows.sort((a, b) => b.rate - a.rate).slice(0, 2))
    .map(row => `${row.label} 심화`)
}

function objectiveAreaReason(area: GuidanceArea) {
  if (area.scoreRate < 0.45) return '정답률 낮음'
  if ((area.difficulty ?? 0) > 0.7) return '난이도 높음'
  if (area.flaggedCount > 0) return '문항 점검'
  return '보완 권장'
}

function subjectiveAreaReason(area: GuidanceArea) {
  if (area.scoreRate < 0.45) return '득점률 낮음'
  if ((area.difficulty ?? 0) > 0.7) return '위치값 높음'
  if (area.flaggedCount > 0) return '루브릭 점검'
  return '보완 권장'
}

function reviewItemPriority(item: IrtItemEstimate) {
  let score = item.flags.length
  if (item.a < 0.35) score += 3
  if ((item.pointBiserial ?? 0) < 0.15) score += 2
  if ((item.outfit ?? 1) > 1.5 || (item.infit ?? 1) > 1.3) score += 2
  if (item.pValue < 0.15 || item.pValue > 0.9) score += 1
  return score
}

function subjectiveReviewItemPriority(item: SubjectiveIrtItemEstimate) {
  let score = item.flags.length
  if ((item.scoreTotalCorrelation ?? 0) < 0.15) score += 2
  if ((item.outfit ?? 1) > 1.5 || (item.infit ?? 1) > 1.3) score += 2
  if (item.meanRate < 0.15 || item.meanRate > 0.9) score += 1
  if (item.flags.includes('임계값 순서 점검')) score += 2
  return score
}

function itemReviewDetail(item: IrtItemEstimate) {
  if (item.a < 0.35 || (item.pointBiserial ?? 0) < 0.15) {
    return '상하위 학생 구분력이 낮아 정답키, 발문, 보기 매력도를 함께 확인하세요.'
  }
  if ((item.outfit ?? 1) > 1.5 || (item.infit ?? 1) > 1.3) {
    return '예상 밖 반응이 많아 오답 선택지나 특정 학생군의 풀이 패턴을 살펴보세요.'
  }
  if (item.pValue < 0.15) return '대부분이 어려워한 문항이므로 선행 개념 또는 문항 표현을 점검하세요.'
  if (item.pValue > 0.9) return '대부분이 맞힌 문항이라 성취 확인용인지, 변별 문항인지 목적을 확인하세요.'
  return '문항 지표에 점검 신호가 있어 내용 검토가 필요합니다.'
}

function subjectiveItemReviewDetail(item: SubjectiveIrtItemEstimate) {
  if (item.flags.includes('임계값 순서 점검')) {
    return '부분점수 단계가 성취 수준 순서대로 작동하는지 루브릭 설명과 채점 사례를 확인하세요.'
  }
  if ((item.scoreTotalCorrelation ?? 0) < 0.15) {
    return '문항 점수와 전체 수행의 연결이 약해 채점 기준 또는 문항 목표를 점검하세요.'
  }
  if ((item.outfit ?? 1) > 1.5 || (item.infit ?? 1) > 1.3) {
    return '예상 밖 부분점수 반응이 많아 특정 오류 유형과 채점 일관성을 확인하세요.'
  }
  if (item.meanRate < 0.15) return '대부분 낮은 점수를 받은 문항으로 루브릭 단계별 재지도가 필요합니다.'
  if (item.meanRate > 0.9) return '대부분 높은 점수를 받은 문항이라 심화 변별력이 충분한지 확인하세요.'
  return '서답형 문항 지표에 점검 신호가 있어 루브릭과 채점 사례를 함께 보세요.'
}

function semBadgeClass(value: number | null) {
  if (value === null) return 'bg-gray-100 text-gray-500'
  if (value <= 0.55) return 'bg-emerald-50 text-emerald-700'
  if (value <= 0.85) return 'bg-blue-50 text-blue-700'
  return 'bg-amber-50 text-amber-700'
}

function meanNumbers(values: number[]) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function meanNullable(values: Array<number | null>) {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value))
  return valid.length > 0 ? meanNumbers(valid) : null
}

function buildThetaBins(students: Array<{ theta: number | null }>) {
  const bins = [
    { lo: -Infinity, hi: -2, range: '< -2', count: 0 },
    { lo: -2, hi: -1, range: '-2~-1', count: 0 },
    { lo: -1, hi: 0, range: '-1~0', count: 0 },
    { lo: 0, hi: 1, range: '0~1', count: 0 },
    { lo: 1, hi: 2, range: '1~2', count: 0 },
    { lo: 2, hi: Infinity, range: '2 <', count: 0 },
  ]
  for (const student of students) {
    if (student.theta === null) continue
    const bin = bins.find(item => student.theta! >= item.lo && student.theta! < item.hi)
    if (bin) bin.count++
  }
  return bins.map(({ range, count }) => ({ range, count }))
}

function sampleStatus(n: number) {
  if (n >= 200) return '안정적'
  if (n >= 100) return '2PL 가능'
  if (n >= 50) return '탐색적'
  return '부족'
}

function reliabilityLabel(value: number | null) {
  if (value === null) return '계산 불가'
  if (value >= 0.8) return '높음'
  if (value >= 0.7) return '양호'
  if (value >= 0.6) return '주의'
  return '낮음'
}

function fitClass(value: number | null) {
  const base = 'px-3 py-3 text-center font-mono text-xs '
  if (value === null) return `${base}text-gray-400`
  if (value > 1.5 || value < 0.5) return `${base}text-red-600 font-bold`
  if (value > 1.3 || value < 0.7) return `${base}text-amber-600 font-bold`
  return `${base}text-gray-700`
}

function formatQuestionNumber(n: number) {
  return String(n).padStart(2, '0')
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function formatSigned(value: number | null) {
  if (value === null || Number.isNaN(value)) return '-'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`
}

function formatFixed(value: number | null, digits: number) {
  if (value === null || Number.isNaN(value)) return '-'
  return value.toFixed(digits)
}

function Empty({ onHome }: { onHome: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-gray-400 space-y-3">
      <p>데이터가 없습니다</p>
      <button onClick={onHome} className="text-blue-600 hover:underline text-sm">홈으로</button>
    </div>
  )
}
