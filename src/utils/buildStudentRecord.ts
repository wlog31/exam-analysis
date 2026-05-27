/**
 * buildStudentRecord.ts
 *
 * 시험 응답 데이터를 바탕으로 학생별 관찰 기록 초안·환류 문장·
 * 세특 체크리스트·근거 목록을 생성합니다.
 *
 * 참고: 정기시험_결과분석_도우미.html (buildSpec 로직 포팅)
 */

import type { StudentRecord, Question, QuestionStat } from '../types'
import { isCorrect } from './parseAnswerSheet'

// ─────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────

export type StudentType =
  | '우수·심화형'
  | '안정·성실형'
  | '영역편차형'
  | '도전·잠재형'
  | '기초보강필요형'
  | '발전가능형'

export interface StdGroup {
  /** achievementStandard 문자열을 키로 사용 */
  code: string
  areas: string[]
  /** 이 학생의 해당 기준 정답률(%) */
  rate: number
  got: number
  tot: number
  hardGot: number
  hardTot: number
  items: StdItem[]
}

export interface StdItem {
  qNumber: number
  correct: boolean
  difficulty: string
  /** 전체 학생 정답률 */
  correctRate: number
  area: string
}

export interface CheckItem {
  id: string
  label: string
  desc: string
  checked: boolean
  basis: string
}

export interface EvidenceItem {
  key: string
  values: string[]
}

export interface StudentRecordSpec {
  studentType: StudentType
  rank: number
  /** 학년 상위 % (rank/total*100) */
  rankPct: number
  /** totalScore (0~100) */
  plainPct: number
  /** 어려움 문항 정답률(%) */
  hardRate: number
  /** 세특 관찰 기록 초안 */
  draft: string
  /** 학생에게 전하는 환류 문장 */
  feedback: string
  evidence: EvidenceItem[]
  checklist: CheckItem[]
  strong: StdGroup[]
  mid: StdGroup[]
  weak: StdGroup[]
  /** 공백 제외 초안 글자 수 */
  charCount: number
  /** 공백 제외 환류 글자 수 */
  fbCharCount: number
}

// ─────────────────────────────────────────────
// 한국어 조사 헬퍼
// ─────────────────────────────────────────────

function hasJong(word: string): boolean {
  if (!word) return false
  const ch = word[word.length - 1]
  const code = ch.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) {
    return /[0-9]/.test(ch) ? [2, 4, 9].indexOf(+ch) < 0 : true
  }
  return (code - 0xac00) % 28 !== 0
}

function josa(word: string, withJong: string, withoutJong: string): string {
  return word + (hasJong(word) ? withJong : withoutJong)
}

function shortArea(area: string): string {
  return (area ?? '').replace(/\s+/g, '')
}

// ─────────────────────────────────────────────
// 메인 함수
// ─────────────────────────────────────────────

export function buildStudentRecord(
  student: StudentRecord,
  allStudents: StudentRecord[],
  questions: Question[],
  questionStats: QuestionStat[],
  correctAnswers: Record<number, string>,
): StudentRecordSpec {
  const mcQuestions = questions.filter(q => q.type === '선택형')

  // 문항 통계 빠른 조회용 맵
  const statMap: Record<number, QuestionStat> = {}
  for (const qs of questionStats) statMap[qs.questionNumber] = qs

  // ── 성취기준별 그룹화 ──
  const byStd: Record<string, StdGroup> = {}

  for (const q of mcQuestions) {
    const ans = student.mcAnswers[q.number] ?? '-'
    const correct = isCorrect(ans, correctAnswers[q.number] ?? '')
    const key = q.achievementStandard?.trim() || q.contentArea || '기타'

    if (!byStd[key]) {
      byStd[key] = {
        code: key,
        areas: [],
        rate: 0,
        got: 0,
        tot: 0,
        hardGot: 0,
        hardTot: 0,
        items: [],
      }
    }
    const g = byStd[key]
    if (!g.areas.includes(q.contentArea)) g.areas.push(q.contentArea)
    g.got += correct ? 1 : 0
    g.tot++
    if (q.difficulty === '어려움') {
      g.hardTot++
      if (correct) g.hardGot++
    }
    g.items.push({
      qNumber: q.number,
      correct,
      difficulty: q.difficulty,
      correctRate: statMap[q.number]?.correctRate ?? 0,
      area: q.contentArea,
    })
  }

  // 정답률 계산 후 정렬
  const stds: StdGroup[] = Object.values(byStd)
    .map(g => ({ ...g, rate: g.tot > 0 ? Math.round((g.got / g.tot) * 100) : 0 }))
    .sort((a, b) => b.rate - a.rate)

  const strong = stds.filter(s => s.rate >= 80)
  const mid = stds.filter(s => s.rate >= 50 && s.rate < 80)
  const weak = stds.filter(s => s.rate < 50)
  const hardWins = stds
    .filter(s => s.hardTot > 0 && s.hardGot >= s.hardTot * 0.5)
    .sort((a, b) => b.hardGot - a.hardGot)

  // ── 고난도 통계 ──
  const hardQuestions = mcQuestions.filter(q => q.difficulty === '어려움')
  const hardCorrect = hardQuestions.filter(q =>
    isCorrect(student.mcAnswers[q.number] ?? '-', correctAnswers[q.number] ?? ''),
  )
  const hardRate =
    hardQuestions.length > 0
      ? Math.round((hardCorrect.length / hardQuestions.length) * 100)
      : 0

  const hardSolvedLabels = hardCorrect.map(q => `${q.number}번`)
  const lowSolvedLabels = mcQuestions
    .filter(
      q =>
        (statMap[q.number]?.correctRate ?? 100) < 45 &&
        isCorrect(student.mcAnswers[q.number] ?? '-', correctAnswers[q.number] ?? ''),
    )
    .map(q => `${q.number}번`)

  // ── 학년 순위 ──
  const ranked = [...allStudents].sort((a, b) => b.totalScore - a.totalScore)
  const rank = ranked.findIndex(s => s.studentId === student.studentId) + 1
  const rankPct = Math.round((rank / allStudents.length) * 100)
  const plainPct = student.totalScore

  // ── 학습 유형 분류 ──
  let studentType: StudentType
  if (plainPct >= 80 && hardRate >= 70) studentType = '우수·심화형'
  else if (plainPct >= 65) studentType = '안정·성실형'
  else if (strong.length >= 2 && weak.length >= 2) studentType = '영역편차형'
  else if (hardRate >= 60 && plainPct < 65) studentType = '도전·잠재형'
  else if (plainPct < 45) studentType = '기초보강필요형'
  else studentType = '발전가능형'

  // ── 세특 체크리스트 ──
  const topStrong = strong
    .slice(0, 2)
    .map(s => shortArea(s.areas[0]))
    .join(', ')
  const topWeak = weak
    .slice(0, 2)
    .map(s => shortArea(s.areas[0]))
    .join(', ')

  const checklist: CheckItem[] = [
    {
      id: 'concept',
      label: '개념 이해',
      desc: '핵심 개념 구분, 정의 적용, 성질 활용',
      checked: strong.length > 0 || plainPct >= 65,
      basis: topStrong ? `${topStrong} 강점` : '전체 성취 기반',
    },
    {
      id: 'condition',
      label: '조건 해석',
      desc: '문항 조건 파악, 조건 누락 없이 처리',
      checked: plainPct >= 60 && weak.length <= 2,
      basis: weak.length <= 2 ? '오답 영역이 제한적' : '교사 확인 권장',
    },
    {
      id: 'strategy',
      label: '풀이 전략',
      desc: '식 세우기, 경우 나누기, 해결 전략 선택',
      checked: hardSolvedLabels.length > 0,
      basis: hardSolvedLabels.length
        ? `고난도 ${hardSolvedLabels.slice(0, 3).join(', ')}`
        : '교사 확인 권장',
    },
    {
      id: 'reasoning',
      label: '논리적 추론',
      desc: '단계적 추론, 관계 파악, 복합 조건 처리',
      checked: lowSolvedLabels.length > 0 || hardRate >= 60,
      basis: lowSolvedLabels.length
        ? `낮은 정답률 ${lowSolvedLabels.slice(0, 3).join(', ')}`
        : '교사 확인 권장',
    },
    {
      id: 'hard',
      label: '고난도 대응',
      desc: '낯선 문항 적응, 심화 개념 적용',
      checked: hardWins.length > 0,
      basis: hardWins.length
        ? `${shortArea(hardWins[0].areas[0])} 고난도 해결`
        : '해당 근거 적음',
    },
    {
      id: 'supplement',
      label: '보완 영역',
      desc: '특정 성취기준 보완, 개념 혼동 점검',
      checked: weak.length > 0 || mid.length > 0,
      basis: topWeak
        ? `${topWeak} 보완`
        : mid.length
          ? `${shortArea(mid[0].areas[0])} 응용 보완`
          : '뚜렷한 보완 적음',
    },
    {
      id: 'growth',
      label: '성장 가능성',
      desc: '학습 전략 조정, 다음 단원 연계 학습',
      checked: plainPct < 80 || weak.length > 0 || mid.length > 0,
      basis: studentType,
    },
  ]

  // ── 관찰 기록 초안 생성 ──
  const sentences: string[] = []

  // 강점 서술
  if (strong.length > 0) {
    const top = strong.slice(0, 3)
    const areas = top.map(s => shortArea(s.areas[0])).join(', ')
    sentences.push(
      `${areas} 관련 문항을 정확히 해결하여 ${josa(areas, '에', '에')} 관한 개념 이해가 안정적으로 확인됨(${top.map(s => s.code.slice(0, 20)).join(', ')}).`,
    )
  }

  // 고난도 문항 해결
  if (hardWins.length > 0) {
    const h = hardWins[0]
    const ex = h.items
      .filter(i => i.difficulty === '어려움' && i.correct)
      .map(i => `${i.qNumber}번`)
      .slice(0, 3)
    if (ex.length > 0) {
      sentences.push(
        `학년 정답률이 낮았던 고난도 문항(${ex.join(', ')})을 해결하였으며, 해당 문항은 ${shortArea(h.areas[0])} 영역의 심화 사고를 요구함.`,
      )
    }
  }

  // 중간 영역
  if (mid.length > 0) {
    const m = mid.slice(0, 2)
    sentences.push(
      `${m.map(s => shortArea(s.areas[0])).join(', ')} 영역은 기본 개념은 갖추었으나 복합적 적용에서 부분적 보완이 필요함.`,
    )
  }

  // 보완 필요
  if (weak.length > 0) {
    const w = weak.slice(0, 2)
    sentences.push(
      `${w.map(s => shortArea(s.areas[0])).join(', ')} 관련 문항의 정답률이 낮아 해당 개념에 대한 보완 지도가 필요함.`,
    )
  }

  // 학습 유형별 마무리
  const typeDesc: Record<StudentType, string> = {
    '우수·심화형':
      '전 영역에 걸쳐 고른 성취를 보이며 고난도 문항까지 정확히 해결하는 심화된 이해를 갖춤.',
    '안정·성실형':
      '대부분의 성취기준에서 안정적인 이해를 보이며 기본 개념이 견고하게 형성되어 있음.',
    '영역편차형':
      '특정 영역은 뛰어난 성취를 보이는 반면 일부 영역은 보완이 필요해, 영역 간 학습 편차를 좁히는 지도가 효과적일 것으로 판단됨.',
    '도전·잠재형':
      '전체 점수에 비해 고난도 문항 해결력이 높아, 사고력과 잠재력이 점수 이상으로 평가됨.',
    '기초보강필요형':
      '주요 성취기준 전반에서 기초 개념 형성이 충분하지 않아 단계적 보충 지도가 필요함.',
    '발전가능형':
      '기본 개념은 형성되어 있으며 꾸준한 학습을 통해 성취 향상이 기대됨.',
  }
  sentences.push(typeDesc[studentType])

  const draft = sentences.join(' ')

  // ── 근거 목록 ──
  const evidence: EvidenceItem[] = []
  if (strong.length > 0) {
    evidence.push({
      key: '강점 성취기준',
      values: strong
        .slice(0, 4)
        .map(s => `${shortArea(s.areas[0])} ${s.rate}% (${s.got}/${s.tot})`),
    })
  }
  if (hardWins.length > 0) {
    evidence.push({
      key: '고난도 정복',
      values: hardWins
        .slice(0, 3)
        .map(s => `${shortArea(s.areas[0])} — 어려움 ${s.hardGot}/${s.hardTot} 정답`),
    })
  }
  if (weak.length > 0) {
    evidence.push({
      key: '보완 필요',
      values: weak
        .slice(0, 4)
        .map(s => `${shortArea(s.areas[0])} ${s.rate}% (${s.got}/${s.tot})`),
    })
  }
  evidence.push({
    key: '전체 위치',
    values: [
      `총점 ${plainPct.toFixed(1)}점 · 학년 상위 약 ${rankPct}% (${rank}/${allStudents.length}위)`,
      `고난도 정답률 ${hardRate}%`,
    ],
  })

  // ── 학생 환류 문장 ──
  const fb: string[] = []

  if (strong.length > 0) {
    fb.push(
      `${shortArea(strong[0].areas[0])} 영역은 정확하게 이해하고 있어요. 이 부분은 자신감을 가져도 좋습니다.`,
    )
  } else if (hardWins.length > 0) {
    const ex = hardWins[0].items.find(i => i.correct && i.difficulty === '어려움')
    if (ex) {
      fb.push(`어려운 문항인 ${ex.qNumber}번을 풀어낸 점이 인상적이에요.`)
    } else {
      fb.push('한 문제씩 차근차근 점검하면 충분히 끌어올릴 수 있어요.')
    }
  } else {
    fb.push('한 문제씩 차근차근 점검하면 충분히 끌어올릴 수 있어요.')
  }

  if (weak.length > 0) {
    weak.slice(0, 2).forEach(w => {
      fb.push(
        `${shortArea(w.areas[0])} 영역은 ${w.rate}% 수준이라 개념 복습이 필요해요. 교과서 기본 문제부터 다시 풀어 보세요.`,
      )
    })
  } else if (mid.length > 0) {
    fb.push(
      `${shortArea(mid[0].areas[0])} 영역은 기본은 잡혀 있으니, 응용 문제를 더 연습하면 안정될 거예요.`,
    )
  }

  if (plainPct < 45) {
    fb.push('욕심내지 말고 자주 틀리는 한 단원을 골라 집중적으로 보완하는 것을 추천합니다.')
  } else if (plainPct < 65) {
    fb.push('맞힐 수 있었는데 놓친 문항을 오답노트로 정리하면 점수가 더 오를 거예요.')
  } else {
    fb.push('지금 수준을 유지하면서 고난도 문항 풀이 경험을 늘려 보세요.')
  }

  const feedback = fb.join(' ')

  return {
    studentType,
    rank,
    rankPct,
    plainPct,
    hardRate,
    draft,
    feedback,
    evidence,
    checklist,
    strong,
    mid,
    weak,
    charCount: draft.replace(/\s/g, '').length,
    fbCharCount: feedback.replace(/\s/g, '').length,
  }
}
