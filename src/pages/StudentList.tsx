import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { rankStudents, getStudentWeakAreas } from '../utils/analytics'
import { buildStudentRecord, type StudentType } from '../utils/buildStudentRecord'
import PrintButton from '../components/common/PrintButton'
import { makeTeacherNoteKey } from '../hooks/useTeacherNote'
import * as XLSX from 'xlsx'

export default function StudentList() {
  const { examData } = useApp()
  const navigate = useNavigate()
  const [filterClass, setFilterClass] = useState('전체')
  const [search, setSearch] = useState('')

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
  const correctAnswers: Record<number, string> = {}
  for (const q of questions) if (q.answer) correctAnswers[q.number] = q.answer

  const ranked = rankStudents(students)
  const classes = ['전체', ...Array.from(new Set(students.map(s => s.classNum).filter(Boolean))).sort()]

  const filtered = ranked.filter(s => {
    const matchClass = filterClass === '전체' || s.classNum === filterClass
    const matchSearch = !search || s.name.includes(search) || s.studentId.includes(search)
    return matchClass && matchSearch
  })

  const n = students.length

  function readTeacherNote(studentId: string) {
    const key = makeTeacherNoteKey(studentId, examInfo)
    const note = localStorage.getItem(key)?.trim() ?? ''
    const savedAt = localStorage.getItem(`${key}_ts`)
    return {
      note,
      savedAt: savedAt ? formatDateTime(new Date(savedAt)) : '',
    }
  }

  function handleExportRecordsXlsx() {
    const title = `${examInfo.subject}_${examInfo.year}_${examInfo.semester}학기_${examInfo.examNumber}차_관찰기록`
    const rows = ranked.map(s => {
      const spec = buildStudentRecord(s, students, questions, questionStats, correctAnswers)
      const teacherNote = readTeacherNote(s.studentId)
      return {
        학년반번호: `${s.classNum}반 ${s.seatNum}번`,
        이름: s.name,
        총점: s.totalScore.toFixed(1),
        석차: spec.rank,
        상위퍼센트: `${spec.rankPct.toFixed(1)}%`,
        학습유형: spec.studentType,
        고난도정답률: `${spec.hardRate.toFixed(1)}%`,
        강점영역: spec.strong.map(g => g.code).join(', '),
        보완영역: spec.weak.map(g => g.code).join(', '),
        관찰기록초안: spec.draft,
        환류문장: spec.feedback,
        교사검수기록: teacherNote.note,
        교사검수저장시각: teacherNote.savedAt,
        초안글자수: spec.charCount,
      }
    })

    const summaryRows = ranked.map(s => {
      const spec = buildStudentRecord(s, students, questions, questionStats, correctAnswers)
      const teacherNote = readTeacherNote(s.studentId)
      return {
        학년반번호: `${s.classNum}반 ${s.seatNum}번`,
        이름: s.name,
        총점: s.totalScore.toFixed(1),
        석차: spec.rank,
        상위퍼센트: `${spec.rankPct.toFixed(1)}%`,
        학습유형: spec.studentType,
        고난도정답률: `${spec.hardRate.toFixed(1)}%`,
        강점영역: spec.strong.map(g => g.code).join(', '),
        보완영역: spec.weak.map(g => g.code).join(', '),
        교사검수여부: teacherNote.note ? '있음' : '',
      }
    })

    const wb = XLSX.utils.book_new()
    const ws1 = XLSX.utils.json_to_sheet(rows)
    const ws2 = XLSX.utils.json_to_sheet(summaryRows)

    // 열 너비 설정
    ws1['!cols'] = [
      { wch: 12 }, { wch: 8 }, { wch: 7 }, { wch: 6 }, { wch: 10 },
      { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 60 }, { wch: 40 },
      { wch: 60 }, { wch: 18 }, { wch: 10 },
    ]
    ws2['!cols'] = [
      { wch: 12 }, { wch: 8 }, { wch: 7 }, { wch: 6 }, { wch: 10 },
      { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 12 },
    ]

    XLSX.utils.book_append_sheet(wb, ws1, '관찰기록')
    XLSX.utils.book_append_sheet(wb, ws2, '학습유형요약')
    XLSX.writeFile(wb, `${title}.xlsx`)
  }

  function handleBatchPrint() {
    const title = `${examInfo.subject}_${examInfo.year}_${examInfo.semester}학기_${examInfo.examNumber}차_학생개별분석`
    const pages = ranked.map((s, idx) => {
      const weakAreas = getStudentWeakAreas(s, questions, correctAnswers)
      const spec = buildStudentRecord(s, students, questions, questionStats, correctAnswers)
      const mcQuestions = questions.filter(q => q.type === '선택형')
      const mcRows = mcQuestions.map(q => {
        const answer = s.mcAnswers[q.number] ?? '-'
        const correct = answer === '.' || answer === (correctAnswers[q.number] ?? '')
        const rate = questionStats.find(qs => qs.questionNumber === q.number)?.correctRate ?? 0
        return `<tr>
          <td>${q.number}</td>
          <td>${escapeHtml(q.contentArea)}</td>
          <td>${escapeHtml(answer || '-')}</td>
          <td>${correct ? '정답' : '오답/무응답'}</td>
          <td>${rate.toFixed(1)}%</td>
        </tr>`
      }).join('')

      const weakRows = weakAreas.map(a => `
        <tr>
          <td>${escapeHtml(a.area)}</td>
          <td>${a.correctRate.toFixed(1)}%</td>
        </tr>`).join('')

      return `
        <section class="page">
          <h1>${escapeHtml(examInfo.subject)} 학생 개별 분석</h1>
          <p class="meta">${examInfo.year}학년도 ${examInfo.semester}학기 ${examInfo.examNumber}차</p>
          <h2>${escapeHtml(s.name)} (${escapeHtml(s.studentId)})</h2>
          <p class="meta">${escapeHtml(s.classNum)}반 ${escapeHtml(s.seatNum)}번 | 전체 ${idx + 1} / ${ranked.length}위 | 학습 유형: ${escapeHtml(spec.studentType)}</p>

          <table class="score-table">
            <thead>
              <tr>
                <th>선택형</th>
                ${isSubjectiveSplit ? '<th>단답형</th><th>서술형</th>' : '<th>서답형</th>'}
                <th>총점</th>
                <th>고난도 정답률</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${s.mcScore.toFixed(1)}</td>
                ${isSubjectiveSplit ? `<td>${s.shortAnswerScore.toFixed(1)}</td><td>${s.essayScore.toFixed(1)}</td>` : `<td>${s.saScore.toFixed(1)}</td>`}
                <td><strong>${s.totalScore.toFixed(1)}</strong></td>
                <td>${spec.hardRate.toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>

          <h3>내용영역별 정답률</h3>
          <table>
            <thead><tr><th>영역</th><th>정답률</th></tr></thead>
            <tbody>${weakRows}</tbody>
          </table>

          <h3>선택형 문항별 응답</h3>
          <table>
            <thead><tr><th>문항</th><th>내용영역</th><th>응답</th><th>판정</th><th>전체 정답률</th></tr></thead>
            <tbody>${mcRows}</tbody>
          </table>

          <h3>세부능력 및 특기사항 초안</h3>
          <div class="note">${escapeHtml(spec.draft)}</div>

          <h3>학생 환류 문장</h3>
          <div class="note">${escapeHtml(spec.feedback)}</div>
        </section>
      `
    }).join('')

    const html = `
      <!doctype html>
      <html lang="ko">
        <head>
          <meta charset="UTF-8" />
          <title>${escapeHtml(title)}</title>
          <style>
            @page { size: A4; margin: 12mm; }
            body { font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; color: #111827; }
            .page { page-break-after: always; }
            .page:last-child { page-break-after: auto; }
            h1 { font-size: 18px; margin: 0 0 4px; }
            h2 { font-size: 16px; margin: 10px 0 4px; }
            h3 { font-size: 13px; margin: 12px 0 6px; }
            .meta { font-size: 12px; color: #4b5563; margin: 0 0 4px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 6px; }
            th, td { border: 1px solid #d1d5db; padding: 4px 6px; text-align: left; }
            th { background: #f3f4f6; }
            .score-table td, .score-table th { text-align: center; }
            .note { font-size: 11px; line-height: 1.7; border: 1px solid #d1d5db; border-radius: 4px; padding: 8px 10px; background: #f9fafb; white-space: pre-wrap; margin-top: 4px; }
            table, tr, .note { break-inside: avoid; page-break-inside: avoid; }
            thead { display: table-header-group; }
          </style>
        </head>
        <body>
          ${pages}
        </body>
      </html>
    `

    const printWindow = window.open('', '_blank', 'width=1200,height=900')
    if (!printWindow) {
      alert('팝업이 차단되어 일괄 출력 창을 열 수 없습니다. 팝업 허용 후 다시 시도해 주세요.')
      return
    }

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 300)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={handleExportRecordsXlsx}
          className="print:hidden text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg shadow-sm transition-colors"
        >
          관찰기록 XLSX 내보내기
        </button>
        <button
          type="button"
          onClick={handleBatchPrint}
          className="print:hidden text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg shadow-sm transition-colors"
        >
          개별 분석 일괄 출력
        </button>
        <PrintButton />
      </div>

      <div className="bg-white rounded-xl shadow p-5">
        <h2 className="font-bold text-gray-800 text-lg mb-1">학생 목록</h2>
        <p className="text-sm text-gray-500">
          {examInfo.subject} · {n}명 응시 · 클릭하면 개별 분석을 볼 수 있습니다
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1">
          {classes.map(cls => (
            <button
              key={cls}
              onClick={() => setFilterClass(cls)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filterClass === cls
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              }`}
            >
              {cls === '전체' ? '전체' : `${cls}반`}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="이름·학번 검색"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 w-40"
        />
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">순위</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">반/번</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">이름</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">선택형</th>
                {isSubjectiveSplit ? (
                  <>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">단답형</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">서술형</th>
                  </>
                ) : (
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">서답형</th>
                )}
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">총점</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">백분율</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">학습 유형</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">약점 영역</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(s => {
                const weakAreas = getStudentWeakAreas(s, questions, correctAnswers)
                const topWeak = weakAreas.filter(a => a.correctRate < 60).slice(0, 2)
                const percentile = Math.round(((n - s.rank) / n) * 100)
                const spec = buildStudentRecord(s, students, questions, questionStats, correctAnswers)

                return (
                  <tr
                    key={s.studentId}
                    onClick={() => navigate(`/students/${s.studentId}`)}
                    className="hover:bg-blue-50 cursor-pointer"
                  >
                    <td className="px-3 py-3 text-center">
                      <RankBadge rank={s.rank} total={n} />
                    </td>
                    <td className="px-3 py-3 text-gray-600">
                      {s.classNum && `${s.classNum}반`}{s.seatNum && ` ${s.seatNum}번`}
                    </td>
                    <td className="px-3 py-3 font-medium text-gray-900">{s.name}</td>
                    <td className="px-3 py-3 text-center text-gray-700">{s.mcScore.toFixed(1)}</td>
                    {isSubjectiveSplit ? (
                      <>
                        <td className="px-3 py-3 text-center text-gray-700">{s.shortAnswerScore.toFixed(1)}</td>
                        <td className="px-3 py-3 text-center text-gray-700">{s.essayScore.toFixed(1)}</td>
                      </>
                    ) : (
                      <td className="px-3 py-3 text-center text-gray-700">{s.saScore.toFixed(1)}</td>
                    )}
                    <td className="px-3 py-3 text-center font-bold text-gray-900">{s.totalScore.toFixed(1)}</td>
                    <td className="px-3 py-3 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <div className="w-16 bg-gray-100 rounded-full h-2">
                          <div className="h-2 bg-blue-500 rounded-full" style={{ width: `${percentile}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{percentile}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <StudentTypeChip type={spec.studentType} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {topWeak.map(a => (
                          <span key={a.area} className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded border border-red-100">
                            {a.area} {a.correctRate.toFixed(0)}%
                          </span>
                        ))}
                        {topWeak.length === 0 && (
                          <span className="text-xs text-green-600">양호</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// 학습 유형 칩 (목록용 인라인)
// ─────────────────────────────────────────────
const TYPE_CHIP_CLS: Record<StudentType, string> = {
  '우수·심화형':    'bg-blue-50 text-blue-700 border-blue-200',
  '안정·성실형':    'bg-green-50 text-green-700 border-green-200',
  '영역편차형':     'bg-yellow-50 text-yellow-700 border-yellow-200',
  '도전·잠재형':    'bg-purple-50 text-purple-700 border-purple-200',
  '기초보강필요형': 'bg-red-50 text-red-700 border-red-200',
  '발전가능형':     'bg-orange-50 text-orange-700 border-orange-200',
}

function StudentTypeChip({ type }: { type: StudentType }) {
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded border font-medium whitespace-nowrap ${TYPE_CHIP_CLS[type]}`}>
      {type}
    </span>
  )
}

function RankBadge({ rank, total }: { rank: number; total: number }) {
  const top = rank / total
  if (rank <= 3) {
    const medals = ['🥇', '🥈', '🥉']
    return <span className="text-lg">{medals[rank - 1]}</span>
  }
  if (top <= 0.1) return <span className="font-bold text-blue-600">{rank}</span>
  if (top <= 0.3) return <span className="font-medium text-gray-700">{rank}</span>
  return <span className="text-gray-500">{rank}</span>
}

function formatDateTime(date: Date): string {
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
