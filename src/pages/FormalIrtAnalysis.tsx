import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from 'recharts'
import { useApp } from '../context/AppContext'
import PrintButton from '../components/common/PrintButton'
import {
  buildFormalIrtAnalysis,
  type IrtItemEstimate,
  type IrtStudentEstimate,
  type IrtWarning,
  type SubjectiveIrtItemEstimate,
  type SubjectiveIrtStudentEstimate,
  type SubjectivePolytomousIrtResult,
} from '../utils/formalIrt'

type ItemFilter = '전체' | '점검 필요'

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
}: {
  result: SubjectivePolytomousIrtResult
  thetaBins: { range: string; count: number }[]
  topStudents: SubjectiveIrtStudentEstimate[]
  bottomStudents: SubjectiveIrtStudentEstimate[]
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
