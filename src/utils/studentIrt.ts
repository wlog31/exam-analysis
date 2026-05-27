import type { QuestionStat, StudentRecord } from '../types'
import { isCorrect } from './parseAnswerSheet'

interface CalibratedItem {
  questionNumber: number
  contentArea: string
  difficultyLabel: string
  points: number
  correctAnswer: string
  discrimination: number
  difficulty: number
}

interface ItemOutcome extends CalibratedItem {
  studentAnswer: string
  isNoAnswer: boolean
  isCorrect: boolean
  observed: number
  expectedProb: number
  residualAbs: number
}

export interface IrtUnexpectedResponse {
  questionNumber: number
  contentArea: string
  difficultyLabel: string
  expectedProb: number
  observed: 0 | 1
  studentAnswer: string
  correctAnswer: string
  deviation: number
  kind: 'highWrong' | 'lowCorrect'
}

export interface IrtAreaGap {
  area: string
  count: number
  observedRate: number
  expectedRate: number
  gap: number
}

export interface StudentIrtProfile {
  itemCount: number
  theta: number | null
  thetaSE: number | null
  thetaPercentile: number | null
  observedCorrect: number
  expectedCorrect: number
  observedMcScore: number
  expectedMcScore: number
  unexpectedResponses: IrtUnexpectedResponse[]
  strengths: IrtAreaGap[]
  weaknesses: IrtAreaGap[]
  consistency: {
    score: number | null
    correlation: number | null
    meanAbsResidual: number | null
    mismatchCount: number
    label: string
    description: string
  }
  adaptive: {
    targetRange: [number, number] | null
    supportQuestions: number[]
    targetQuestions: number[]
    stretchQuestions: number[]
    description: string
  }
}

export function buildStudentIrtProfile(
  student: StudentRecord,
  students: StudentRecord[],
  questionStats: QuestionStat[],
  correctAnswers: Record<number, string>,
): StudentIrtProfile {
  const items = buildItems(questionStats, correctAnswers)
  if (items.length === 0) {
    return emptyProfile()
  }

  const targetResponses = buildResponses(student, items)
  const estimate = estimateTheta(items, targetResponses)
  const theta = estimate.theta
  const thetaSE = estimate.se

  let thetaPercentile: number | null = null
  if (theta !== null) {
    const peerThetas = students
      .map(s => estimateTheta(items, buildResponses(s, items)).theta)
      .filter((v): v is number => v !== null)
    if (peerThetas.length > 0) {
      const lower = peerThetas.filter(v => v < theta).length
      const equal = peerThetas.filter(v => Math.abs(v - theta) <= 1e-4).length
      thetaPercentile = ((lower + equal * 0.5) / peerThetas.length) * 100
    }
  }

  const scoringTheta = theta ?? 0
  const outcomes = items.map((item, idx) => {
    const observed = targetResponses[idx]
    const expectedProb = logistic(item.discrimination * (scoringTheta - item.difficulty))
    const studentAnswer = student.mcAnswers[item.questionNumber] ?? '-'
    const isNoAnswer = studentAnswer === '-' || studentAnswer === ''
    const correct = observed === 1
    return {
      ...item,
      studentAnswer,
      isNoAnswer,
      isCorrect: correct,
      observed,
      expectedProb,
      residualAbs: Math.abs(observed - expectedProb),
    }
  })

  const observedCorrect = outcomes.reduce((sum, o) => sum + o.observed, 0)
  const expectedCorrect = outcomes.reduce((sum, o) => sum + o.expectedProb, 0)
  const observedMcScore = outcomes.reduce((sum, o) => sum + o.points * o.observed, 0)
  const expectedMcScore = outcomes.reduce((sum, o) => sum + o.points * o.expectedProb, 0)

  const unexpectedResponses = buildUnexpected(outcomes)
  const { strengths, weaknesses } = buildAreaGaps(outcomes)
  const consistency = buildConsistency(outcomes)
  const adaptive = buildAdaptive(outcomes, theta)

  return {
    itemCount: items.length,
    theta,
    thetaSE,
    thetaPercentile,
    observedCorrect,
    expectedCorrect,
    observedMcScore,
    expectedMcScore,
    unexpectedResponses,
    strengths,
    weaknesses,
    consistency,
    adaptive,
  }
}

function emptyProfile(): StudentIrtProfile {
  return {
    itemCount: 0,
    theta: null,
    thetaSE: null,
    thetaPercentile: null,
    observedCorrect: 0,
    expectedCorrect: 0,
    observedMcScore: 0,
    expectedMcScore: 0,
    unexpectedResponses: [],
    strengths: [],
    weaknesses: [],
    consistency: {
      score: null,
      correlation: null,
      meanAbsResidual: null,
      mismatchCount: 0,
      label: '분석 불가',
      description: '문항 파라미터가 부족해 일관성 분석을 수행할 수 없습니다.',
    },
    adaptive: {
      targetRange: null,
      supportQuestions: [],
      targetQuestions: [],
      stretchQuestions: [],
      description: '추천 문항을 만들 수 있는 IRT 정보가 부족합니다.',
    },
  }
}

function buildItems(questionStats: QuestionStat[], correctAnswers: Record<number, string>): CalibratedItem[] {
  const items: CalibratedItem[] = []
  for (const stat of questionStats) {
    if (stat.type !== '선택형') continue
    if (stat.irtDifficulty === null || Number.isNaN(stat.irtDifficulty)) continue
    const correctAnswer = stat.question.answer ?? correctAnswers[stat.questionNumber] ?? ''
    if (!correctAnswer) continue
    const aRaw = stat.irtDiscrimination ?? 0.25
    const discrimination = clamp(Math.abs(aRaw), 0.15, 1.5)
    const difficulty = clamp(stat.irtDifficulty, -3, 3)
    items.push({
      questionNumber: stat.questionNumber,
      contentArea: stat.question.contentArea,
      difficultyLabel: stat.question.difficulty,
      points: stat.question.points,
      correctAnswer,
      discrimination,
      difficulty,
    })
  }
  return items.sort((a, b) => a.questionNumber - b.questionNumber)
}

function buildResponses(student: StudentRecord, items: CalibratedItem[]): number[] {
  return items.map(item => {
    const answer = student.mcAnswers[item.questionNumber] ?? '-'
    return isCorrect(answer, item.correctAnswer) ? 1 : 0
  })
}

function estimateTheta(items: CalibratedItem[], responses: number[]): { theta: number | null; se: number | null } {
  if (items.length === 0 || items.length !== responses.length) return { theta: null, se: null }

  const correctCount = responses.reduce((sum, r) => sum + r, 0)
  const p0 = clamp((correctCount + 0.5) / (responses.length + 1), 0.01, 0.99)
  let theta = clamp(Math.log(p0 / (1 - p0)), -3, 3)

  for (let iter = 0; iter < 24; iter++) {
    let score = 0
    let info = 0
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const p = logistic(item.discrimination * (theta - item.difficulty))
      score += item.discrimination * (responses[i] - p)
      info += item.discrimination * item.discrimination * p * (1 - p)
    }
    if (info <= 1e-9) break
    const step = score / info
    theta = clamp(theta + step, -4, 4)
    if (Math.abs(step) < 1e-3) break
  }

  let finalInfo = 0
  for (const item of items) {
    const p = logistic(item.discrimination * (theta - item.difficulty))
    finalInfo += item.discrimination * item.discrimination * p * (1 - p)
  }
  const se = finalInfo > 1e-9 ? 1 / Math.sqrt(finalInfo) : null
  return { theta, se }
}

function buildUnexpected(outcomes: ItemOutcome[]): IrtUnexpectedResponse[] {
  const flagged = outcomes
    .filter(o => (o.observed === 0 && o.expectedProb >= 0.7) || (o.observed === 1 && o.expectedProb <= 0.3))
    .map<IrtUnexpectedResponse>(o => ({
      questionNumber: o.questionNumber,
      contentArea: o.contentArea,
      difficultyLabel: o.difficultyLabel,
      expectedProb: o.expectedProb,
      observed: o.observed as 0 | 1,
      studentAnswer: o.studentAnswer,
      correctAnswer: o.correctAnswer,
      deviation: o.residualAbs,
      kind: o.observed === 0 ? 'highWrong' : 'lowCorrect',
    }))

  if (flagged.length >= 2) {
    return flagged
      .sort((a, b) => b.deviation - a.deviation)
      .slice(0, 8)
  }

  return outcomes
    .filter(o => o.residualAbs >= 0.55)
    .map<IrtUnexpectedResponse>(o => ({
      questionNumber: o.questionNumber,
      contentArea: o.contentArea,
      difficultyLabel: o.difficultyLabel,
      expectedProb: o.expectedProb,
      observed: o.observed as 0 | 1,
      studentAnswer: o.studentAnswer,
      correctAnswer: o.correctAnswer,
      deviation: o.residualAbs,
      kind: o.observed === 0 ? 'highWrong' : 'lowCorrect',
    }))
    .sort((a, b) => b.deviation - a.deviation)
    .slice(0, 6)
}

function buildAreaGaps(outcomes: ItemOutcome[]): { strengths: IrtAreaGap[]; weaknesses: IrtAreaGap[] } {
  const areaMap = new Map<string, { count: number; observed: number; expected: number }>()
  for (const o of outcomes) {
    const prev = areaMap.get(o.contentArea) ?? { count: 0, observed: 0, expected: 0 }
    prev.count += 1
    prev.observed += o.observed
    prev.expected += o.expectedProb
    areaMap.set(o.contentArea, prev)
  }

  const gaps: IrtAreaGap[] = Array.from(areaMap.entries()).map(([area, v]) => {
    const observedRate = v.count > 0 ? (v.observed / v.count) * 100 : 0
    const expectedRate = v.count > 0 ? (v.expected / v.count) * 100 : 0
    return {
      area,
      count: v.count,
      observedRate,
      expectedRate,
      gap: observedRate - expectedRate,
    }
  })

  const strengths = [...gaps]
    .sort((a, b) => b.gap - a.gap)
    .filter(g => g.gap > 0)
    .slice(0, 3)
  const weaknesses = [...gaps]
    .sort((a, b) => a.gap - b.gap)
    .filter(g => g.gap < 0)
    .slice(0, 3)

  return { strengths, weaknesses }
}

function buildConsistency(outcomes: ItemOutcome[]): StudentIrtProfile['consistency'] {
  if (outcomes.length < 2) {
    return {
      score: null,
      correlation: null,
      meanAbsResidual: null,
      mismatchCount: 0,
      label: '표본 부족',
      description: '일관성을 계산하기 위한 문항 수가 충분하지 않습니다.',
    }
  }

  const probs = outcomes.map(o => o.expectedProb)
  const obs = outcomes.map(o => o.observed)
  const corr = pearson(probs, obs)
  const meanAbsResidual = outcomes.reduce((sum, o) => sum + o.residualAbs, 0) / outcomes.length
  const mismatchCount = outcomes.filter(o =>
    (o.observed === 0 && o.expectedProb >= 0.65) ||
    (o.observed === 1 && o.expectedProb <= 0.35),
  ).length

  const base = clamp(100 - meanAbsResidual * 100, 0, 100)
  const corrScore = corr === null ? 50 : clamp((corr + 1) * 50, 0, 100)
  const score = clamp(base * 0.6 + corrScore * 0.4, 0, 100)

  let label = '일관성 낮음'
  if (score >= 75) label = '매우 일관적'
  else if (score >= 60) label = '대체로 일관적'
  else if (score >= 45) label = '보통'

  const description = `예상과 크게 다른 반응 ${mismatchCount}문항`
  return {
    score,
    correlation: corr,
    meanAbsResidual,
    mismatchCount,
    label,
    description,
  }
}

function buildAdaptive(outcomes: ItemOutcome[], theta: number | null): StudentIrtProfile['adaptive'] {
  if (theta === null) {
    return {
      targetRange: null,
      supportQuestions: [],
      targetQuestions: [],
      stretchQuestions: [],
      description: '능력 추정치가 없어 적응형 추천을 생성하지 못했습니다.',
    }
  }

  const wrong = outcomes.filter(o => o.observed === 0)
  const byNearTheta = (arr: ItemOutcome[]) =>
    [...arr].sort((a, b) => Math.abs(a.difficulty - theta) - Math.abs(b.difficulty - theta))

  const support = wrong
    .filter(o => o.difficulty <= theta - 0.3)
    .sort((a, b) => a.difficulty - b.difficulty)
    .slice(0, 5)
    .map(o => o.questionNumber)

  const targetCandidates = byNearTheta(wrong.filter(o => Math.abs(o.difficulty - theta) <= 0.6))
  const target = (targetCandidates.length > 0 ? targetCandidates : byNearTheta(wrong))
    .slice(0, 5)
    .map(o => o.questionNumber)

  const stretch = outcomes
    .filter(o => o.difficulty >= theta + 0.5)
    .sort((a, b) => a.difficulty - b.difficulty)
    .slice(0, 5)
    .map(o => o.questionNumber)

  return {
    targetRange: [theta - 0.4, theta + 0.4],
    supportQuestions: uniqueNumbers(support),
    targetQuestions: uniqueNumbers(target),
    stretchQuestions: uniqueNumbers(stretch),
    description: '현재 시험 문항 풀 기준으로 복습(기초)·성장(적정)·도전(상위) 문항을 제안합니다.',
  }
}

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values))
}

function logistic(z: number): number {
  if (z >= 0) {
    const ez = Math.exp(-z)
    return 1 / (1 + ez)
  }
  const ez = Math.exp(z)
  return ez / (1 + ez)
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
  if (vx <= 1e-12 || vy <= 1e-12) return null
  return cov / Math.sqrt(vx * vy)
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}
