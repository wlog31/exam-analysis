import type { Question, StudentRecord, QuestionStat, ExamData, ExamInfo } from '../types'
import type { SubjectiveIrtData } from '../types'
import type { ParsedAnswerSheet } from './parseAnswerSheet'
import { isCorrect } from './parseAnswerSheet'

export function buildExamData(
  examInfo: ExamInfo,
  questions: Question[],
  sheet: ParsedAnswerSheet,
  subjectiveIrtData?: SubjectiveIrtData,
): ExamData {
  const { students, mcAnswerKey, subjectiveMode } = sheet

  // 문항 수 채우기
  const mcQuestions = questions.filter(q => q.type === '선택형')
  const subjectiveQuestions = questions.filter(q => q.type === '단답형' || q.type === '서술형')
  const shortQuestions = subjectiveQuestions.filter(q => q.type === '단답형')
  const essayQuestions = subjectiveQuestions.filter(q => q.type === '서술형')
  const shortTotal = shortQuestions.reduce((sum, q) => sum + q.points, 0)
  const essayTotal = essayQuestions.reduce((sum, q) => sum + q.points, 0)
  examInfo.multipleChoiceCount = mcQuestions.length
  examInfo.shortAnswerCount = subjectiveQuestions.length
  examInfo.totalQuestions = questions.length
  if (!Number.isFinite(examInfo.multipleChoiceTotal) || examInfo.multipleChoiceTotal <= 0) {
    examInfo.multipleChoiceTotal = mcQuestions.reduce((sum, q) => sum + q.points, 0)
  }
  if (!Number.isFinite(examInfo.shortAnswerTotal) || examInfo.shortAnswerTotal <= 0) {
    examInfo.shortAnswerTotal = subjectiveQuestions.reduce((sum, q) => sum + q.points, 0)
  }

  // 정오표 정답키로 Question.answer 보완
  for (const q of mcQuestions) {
    if (!q.answer && mcAnswerKey[q.number]) {
      q.answer = mcAnswerKey[q.number]
    }
  }

  // 문항별 통계 계산
  const questionStats: QuestionStat[] = mcQuestions.map(q => {
    const correctAnswer = q.answer ?? mcAnswerKey[q.number] ?? ''
    let correctCount = 0
    const wrongDist: Record<string, number> = {}
    const binaryResponses: number[] = []

    for (const s of students) {
      const ans = s.mcAnswers[q.number] ?? '-'
      if (isCorrect(ans, correctAnswer)) {
        correctCount++
        binaryResponses.push(1)
      } else if (ans !== '-' && ans !== '') {
        wrongDist[ans] = (wrongDist[ans] ?? 0) + 1
        binaryResponses.push(0)
      } else {
        binaryResponses.push(0)
      }
    }

    const n = students.length || 1
    const correctRate = (correctCount / n) * 100
    const p = clamp(correctRate / 100, 0.01, 0.99)
    const irtDifficulty = Math.log((1 - p) / p)
    const irtDiscrimination = pearson(
      binaryResponses,
      students.map(s => s.mcScore - ((isCorrect(s.mcAnswers[q.number] ?? '-', correctAnswer) ? q.points : 0))),
    )

    return {
      questionNumber: q.number,
      type: q.type,
      correctRate,
      wrongDist,
      avgPointsEarned: (correctRate / 100) * q.points,
      irtDifficulty,
      irtDiscrimination,
      question: q,
    }
  })

  const shortQuestionStats = buildSubjectiveQuestionStats(
    shortQuestions,
    students,
    '단답형',
    student => student.shortAnswerScore,
  )
  const essayQuestionStats = buildSubjectiveQuestionStats(
    essayQuestions,
    students,
    '서술형',
    student => student.essayScore,
  )
  const subjectiveQuestionStats = [...shortQuestionStats, ...essayQuestionStats]

  const mcIrt = summarizeQuestionIrt(questionStats)
  const shortAnswerSummary = subjectiveMode === 'split'
    ? summarizeSubjectiveSection(
      '단답형',
      shortQuestionStats,
      students.map(s => s.shortAnswerScore),
      shortTotal,
      shortQuestionStats.length > 0
        ? '단답형 문항별 점수와 단답형 내부 나머지 점수 기준 IRT 근사치'
        : '단답형 문항별 점수 열을 찾지 못해 단답형 섹션 점수 기준으로 표시됨',
    )
    : summarizeSubjectiveSection(
      '서답형',
      [],
      students.map(s => s.saScore),
      examInfo.shortAnswerTotal,
      '서답형은 문항별 원점수 데이터가 없어 섹션 점수 기준 IRT 근사치로 계산됨',
      students.map(s => s.totalScore - s.saScore),
    )
  const essaySummary = subjectiveMode === 'split'
    ? summarizeSubjectiveSection(
      '서술형',
      essayQuestionStats,
      students.map(s => s.essayScore),
      essayTotal,
      essayQuestionStats.length > 0
        ? '서술형 문항별 점수와 서술형 내부 나머지 점수 기준 IRT 근사치'
        : '서술형 문항별 점수 열을 찾지 못해 서술형 섹션 점수 기준으로 표시됨',
    )
    : undefined

  const irtSummary: ExamData['irtSummary'] = {
    multipleChoice: {
      label: '선택형',
      difficulty: mcIrt.difficulty,
      discrimination: mcIrt.discrimination,
      note: '선택형 문항별 정오 반응과 선택형 내부 나머지 점수 기준',
    },
    shortAnswer: shortAnswerSummary,
  }
  if (essaySummary) {
    irtSummary.essay = essaySummary
  }

  return {
    examInfo,
    questions,
    students,
    questionStats,
    subjectiveQuestionStats,
    subjectiveMode,
    irtSummary,
    subjectiveIrtData,
  }
}

function buildSubjectiveQuestionStats(
  questions: Question[],
  students: StudentRecord[],
  type: '단답형' | '서술형',
  sectionScoreOf: (student: StudentRecord) => number,
): QuestionStat[] {
  return questions.flatMap(question => {
    const key = makeSubjectiveScoreKey(type, question.number)
    const hasScoreData = students.some(student =>
      Object.prototype.hasOwnProperty.call(student.subjectiveScores ?? {}, key),
    )
    if (!hasScoreData) return []

    const scores = students.map(student => (student.subjectiveScores ?? {})[key] ?? 0)
    const n = students.length || 1
    const avgPointsEarned = scores.reduce((sum, score) => sum + score, 0) / n
    const correctRate = question.points > 0
      ? clamp(avgPointsEarned / question.points, 0, 1) * 100
      : 0
    const p = clamp(correctRate / 100, 0.01, 0.99)
    const irtDifficulty = Math.log((1 - p) / p)
    const irtDiscrimination = pearson(
      scores,
      students.map((student, index) => sectionScoreOf(student) - scores[index]),
    )

    return [{
      questionNumber: question.number,
      type: question.type,
      correctRate,
      wrongDist: {},
      avgPointsEarned,
      irtDifficulty,
      irtDiscrimination,
      question,
    }]
  })
}

function summarizeSubjectiveSection(
  label: string,
  questionStats: QuestionStat[],
  scores: number[],
  total: number,
  note: string,
  restScores?: number[],
) {
  if (questionStats.length > 0) {
    const summary = summarizeQuestionIrt(questionStats)
    return {
      label,
      difficulty: summary.difficulty,
      discrimination: summary.discrimination,
      note,
    }
  }

  const avg = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0
  const p = total > 0 ? clamp(avg / total, 0.01, 0.99) : null
  return {
    label,
    difficulty: p === null ? null : Math.log((1 - p) / p),
    discrimination: restScores ? pearson(scores, restScores) : null,
    note,
  }
}

function makeSubjectiveScoreKey(type: '단답형' | '서술형', questionNumber: number): string {
  return `${type}:${questionNumber}`
}

// ---- 집계 헬퍼 함수들 ----

export function calcScoreStats(students: StudentRecord[]) {
  if (students.length === 0) return { avg: 0, max: 0, min: 0, median: 0, stdDev: 0 }
  const scores = students.map(s => s.totalScore).sort((a, b) => a - b)
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length
  const max = scores[scores.length - 1]
  const min = scores[0]
  const median = scores.length % 2 === 0
    ? (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2
    : scores[Math.floor(scores.length / 2)]
  const variance = scores.reduce((acc, s) => acc + (s - avg) ** 2, 0) / scores.length
  return { avg, max, min, median, stdDev: Math.sqrt(variance) }
}

export function calcScoreDistribution(students: StudentRecord[], bucketSize = 10) {
  const buckets: { range: string; count: number }[] = []
  for (let lo = 0; lo < 100; lo += bucketSize) {
    const hi = lo + bucketSize
    const count = students.filter(s => s.totalScore >= lo && s.totalScore < hi).length
    buckets.push({ range: `${lo}~${hi}`, count })
  }
  // 100점 처리
  const perfect = students.filter(s => s.totalScore >= 100).length
  if (perfect > 0) buckets[buckets.length - 1].count += perfect
  return buckets
}

export function groupByContentArea(stats: QuestionStat[]) {
  const map: Record<string, { total: number; correct: number; count: number }> = {}
  for (const s of stats) {
    const area = s.question.contentArea
    if (!map[area]) map[area] = { total: 0, correct: 0, count: 0 }
    map[area].total += s.question.points
    map[area].correct += s.avgPointsEarned
    map[area].count++
  }
  return Object.entries(map).map(([area, v]) => ({
    area,
    correctRate: v.total > 0 ? (v.correct / v.total) * 100 : 0,
    count: v.count,
  }))
}

export function groupByDifficulty(stats: QuestionStat[]) {
  const order = ['쉬움', '보통', '어려움'] as const
  return order.map(diff => {
    const items = stats.filter(s => s.question.difficulty === diff)
    const avg = items.length > 0
      ? items.reduce((a, s) => a + s.correctRate, 0) / items.length
      : 0
    return { difficulty: diff, avgCorrectRate: avg, count: items.length }
  })
}

// 학생별 약점 내용영역 (정답률 낮은 순)
export function getStudentWeakAreas(
  student: StudentRecord,
  questions: Question[],
  correctAnswers: Record<number, string>,
): { area: string; correctRate: number }[] {
  const areaMap: Record<string, { correct: number; total: number }> = {}

  for (const q of questions.filter(q => q.type === '선택형')) {
    const area = q.contentArea
    if (!areaMap[area]) areaMap[area] = { correct: 0, total: 0 }
    areaMap[area].total++
    const ans = student.mcAnswers[q.number] ?? '-'
    if (isCorrect(ans, correctAnswers[q.number] ?? '')) areaMap[area].correct++
  }

  return Object.entries(areaMap)
    .map(([area, v]) => ({ area, correctRate: v.total > 0 ? (v.correct / v.total) * 100 : 0 }))
    .sort((a, b) => a.correctRate - b.correctRate)
}

export function rankStudents(students: StudentRecord[]): (StudentRecord & { rank: number })[] {
  const sorted = [...students].sort((a, b) => b.totalScore - a.totalScore)
  return sorted.map((s, i) => ({ ...s, rank: i + 1 }))
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length === 0 || ys.length === 0 || xs.length !== ys.length) return null
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let cov = 0
  let vx = 0
  let vy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    cov += dx * dy
    vx += dx * dx
    vy += dy * dy
  }
  if (vx === 0 || vy === 0) return null
  return cov / Math.sqrt(vx * vy)
}

function summarizeQuestionIrt(stats: QuestionStat[]) {
  const diffs = stats.map(s => s.irtDifficulty).filter((v): v is number => v !== null)
  const discs = stats.map(s => s.irtDiscrimination).filter((v): v is number => v !== null)
  return {
    difficulty: diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null,
    discrimination: discs.length ? discs.reduce((a, b) => a + b, 0) / discs.length : null,
  }
}
