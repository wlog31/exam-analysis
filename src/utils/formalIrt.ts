import type {
  ExamData,
  Question,
  StudentRecord,
  SubjectiveIrtData,
  SubjectiveIrtItemSpec,
  SubjectiveIrtStudentScore,
} from '../types'
import { isCorrect } from './parseAnswerSheet'

export type FormalIrtModel = '1PL Rasch' | '2PL'

export interface IrtWarning {
  level: 'info' | 'warning' | 'danger'
  title: string
  detail: string
}

export interface IrtExcludedQuestion {
  questionNumber: number
  reason: string
}

export interface IrtItemEstimate {
  questionNumber: number
  contentArea: string
  achievementStandard: string
  difficultyLabel: string
  points: number
  answer: string
  n: number
  correct: number
  pValue: number
  missingRate: number
  pointBiserial: number | null
  a: number
  b: number
  infit: number | null
  outfit: number | null
  informationAtZero: number
  flags: string[]
}

export interface IrtStudentEstimate {
  studentId: string
  classNum: string
  seatNum: string
  name: string
  rawCorrect: number
  rawScore: number
  theta: number | null
  sem: number | null
  percentile: number | null
  expectedScore: number | null
  outfit: number | null
}

export interface IrtCurvePoint {
  theta: number
  information: number
  sem: number | null
}

export interface FormalIrtResult {
  model: FormalIrtModel
  modelNote: string
  studentCount: number
  itemCount: number
  includedItemCount: number
  missingRate: number
  iterations: number
  converged: boolean
  logLikelihood: number | null
  reliability: number | null
  warnings: IrtWarning[]
  excludedQuestions: IrtExcludedQuestion[]
  items: IrtItemEstimate[]
  students: IrtStudentEstimate[]
  curve: IrtCurvePoint[]
  subjectiveNote: string
  subjective: SubjectivePolytomousIrtResult | null
}

export interface SubjectiveIrtItemEstimate {
  itemId: string
  itemType: string
  contentArea: string
  achievementStandard: string
  maxScore: number
  categoryValues: number[]
  responseCount: number
  missingCount: number
  meanScore: number
  meanRate: number
  scoreTotalCorrelation: number | null
  location: number | null
  thresholds: number[]
  infit: number | null
  outfit: number | null
  flags: string[]
}

export interface SubjectiveIrtStudentEstimate {
  studentId: string
  classNum: string
  seatNum: string
  name: string
  rawScore: number
  maxScore: number
  answeredItems: number
  theta: number | null
  sem: number | null
  percentile: number | null
  expectedScore: number | null
  outfit: number | null
}

export interface SubjectivePolytomousIrtResult {
  model: string
  modelNote: string
  studentCount: number
  itemCount: number
  includedItemCount: number
  missingRate: number
  iterations: number
  converged: boolean
  logLikelihood: number | null
  reliability: number | null
  warnings: IrtWarning[]
  items: SubjectiveIrtItemEstimate[]
  students: SubjectiveIrtStudentEstimate[]
  curve: IrtCurvePoint[]
}

interface CalibrationItem {
  question: Question
  answer: string
  responses: number[]
  missing: boolean[]
  pointBiserial: number | null
  a: number
  b: number
}

interface CalibrationState {
  model: FormalIrtModel
  items: CalibrationItem[]
  theta: number[]
  iterations: number
  converged: boolean
  logLikelihood: number | null
}

interface SubjectiveCalibrationItem {
  spec: SubjectiveIrtItemSpec
  scores: Array<number | null>
  thresholds: number[]
  scoreTotalCorrelation: number | null
  thresholdOrderWarning: boolean
}

interface SubjectiveCalibrationState {
  items: SubjectiveCalibrationItem[]
  theta: number[]
  iterations: number
  converged: boolean
  logLikelihood: number | null
}

const MAX_OUTER_ITERATIONS = 40
const THETA_MIN = -4
const THETA_MAX = 4

export function buildFormalIrtAnalysis(examData: ExamData): FormalIrtResult {
  const { students, questions } = examData
  const mcQuestions = questions.filter(q => q.type === '선택형')
  const excludedQuestions: IrtExcludedQuestion[] = []
  const calibrationItems: CalibrationItem[] = []
  let missingCount = 0
  let responseCount = 0

  for (const question of mcQuestions) {
    const answer = question.answer?.trim()
    if (!answer) {
      excludedQuestions.push({ questionNumber: question.number, reason: '정답키 없음' })
      continue
    }

    const responses: number[] = []
    const missing: boolean[] = []
    for (const student of students) {
      const raw = student.mcAnswers[question.number] ?? ''
      const isMissing = raw.trim() === '' || raw.trim() === '-'
      missing.push(isMissing)
      if (isMissing) missingCount++
      responseCount++
      responses.push(isCorrect(raw, answer) ? 1 : 0)
    }

    const correct = responses.reduce((sum, value) => sum + value, 0)
    if (students.length === 0 || correct === 0 || correct === students.length) {
      excludedQuestions.push({
        questionNumber: question.number,
        reason: correct === 0 ? '전원 오답' : correct === students.length ? '전원 정답' : '응시자 없음',
      })
      continue
    }

    calibrationItems.push({
      question,
      answer,
      responses,
      missing,
      pointBiserial: null,
      a: 1,
      b: logitDifficulty(correct / students.length),
    })
  }

  const model = chooseModel(students.length, calibrationItems.length)
  const state = calibrate(calibrationItems, model)
  const responseMatrix = state.items.map(item => item.responses)
  const itemEstimates = buildItemEstimates(state, students, responseMatrix)
  const studentEstimates = buildStudentEstimates(state, students)
  const curve = buildInformationCurve(state.items)
  const reliability = estimateReliability(studentEstimates)
  const missingRate = responseCount > 0 ? missingCount / responseCount : 0
  const subjective = examData.subjectiveIrtData
    ? buildSubjectivePolytomousIrtAnalysis(examData.subjectiveIrtData, examData.students)
    : null
  const warnings = buildWarnings({
    studentCount: students.length,
    includedItemCount: state.items.length,
    excludedQuestions,
    missingRate,
    model,
    reliability,
    subjectiveMode: examData.subjectiveMode,
    subjectiveQuestionCount: examData.subjectiveQuestionStats.length,
    hasSubjectiveIrtData: !!examData.subjectiveIrtData,
  })

  return {
    model,
    modelNote: getModelNote(model),
    studentCount: students.length,
    itemCount: mcQuestions.length,
    includedItemCount: state.items.length,
    missingRate,
    iterations: state.iterations,
    converged: state.converged,
    logLikelihood: state.logLikelihood,
    reliability,
    warnings,
    excludedQuestions,
    items: itemEstimates,
    students: studentEstimates,
    curve,
    subjectiveNote: buildSubjectiveNote(examData),
    subjective,
  }
}

function chooseModel(studentCount: number, itemCount: number): FormalIrtModel {
  if (studentCount >= 100 && itemCount >= 10) return '2PL'
  return '1PL Rasch'
}

function getModelNote(model: FormalIrtModel): string {
  if (model === '2PL') {
    return '선택형 정오 반응을 이용해 2모수 로지스틱 모형(a: 변별도, b: 난이도)을 JMLE 방식으로 반복 추정했습니다.'
  }
  return '표본 또는 문항 수가 크지 않아 더 안정적인 1PL Rasch 모형으로 추정했습니다.'
}

function calibrate(inputItems: CalibrationItem[], model: FormalIrtModel): CalibrationState {
  const items = inputItems.map(item => ({
    ...item,
    pointBiserial: pearson(
      item.responses,
      inputItems[0]?.responses.map((_, studentIndex) =>
        inputItems.reduce((sum, target) => sum + target.responses[studentIndex], 0) - item.responses[studentIndex],
      ) ?? [],
    ),
  }))

  if (items.length === 0 || items[0].responses.length === 0) {
    return { model, items, theta: [], iterations: 0, converged: false, logLikelihood: null }
  }

  for (const item of items) {
    if (model === '2PL') {
      const r = item.pointBiserial ?? 0
      item.a = clamp(0.7 + Math.max(0, r) * 2.4, 0.25, 2.8)
    } else {
      item.a = 1
    }
  }

  let theta = initialTheta(items)
  let previousLogLikelihood = Number.NEGATIVE_INFINITY
  let converged = false
  let iterations = 0

  for (let iteration = 0; iteration < MAX_OUTER_ITERATIONS; iteration++) {
    theta = estimateAllTheta(items, theta)
    theta = standardize(theta)

    if (model === '2PL') {
      for (const item of items) estimateTwoPlItem(item, theta)
    } else {
      for (const item of items) {
        item.a = 1
        estimateRaschItem(item, theta)
      }
    }

    const currentLogLikelihood = logLikelihood(items, theta)
    iterations = iteration + 1
    if (Number.isFinite(previousLogLikelihood) && Math.abs(currentLogLikelihood - previousLogLikelihood) < 0.001) {
      converged = true
      previousLogLikelihood = currentLogLikelihood
      break
    }
    previousLogLikelihood = currentLogLikelihood
  }

  return {
    model,
    items,
    theta,
    iterations,
    converged,
    logLikelihood: Number.isFinite(previousLogLikelihood) ? previousLogLikelihood : null,
  }
}

function initialTheta(items: CalibrationItem[]): number[] {
  const studentCount = items[0]?.responses.length ?? 0
  return Array.from({ length: studentCount }, (_, studentIndex) => {
    const correct = items.reduce((sum, item) => sum + item.responses[studentIndex], 0)
    const p = clamp((correct + 0.5) / (items.length + 1), 0.01, 0.99)
    return clamp(Math.log(p / (1 - p)), THETA_MIN, THETA_MAX)
  })
}

function estimateAllTheta(items: CalibrationItem[], currentTheta: number[]): number[] {
  return currentTheta.map((theta, studentIndex) => estimateTheta(items, studentIndex, theta))
}

function estimateTheta(items: CalibrationItem[], studentIndex: number, startTheta: number): number {
  let theta = clamp(startTheta, THETA_MIN, THETA_MAX)
  for (let iteration = 0; iteration < 30; iteration++) {
    let gradient = 0
    let info = 0
    for (const item of items) {
      const p = probability(theta, item.a, item.b)
      const x = item.responses[studentIndex]
      const variance = clamp(p * (1 - p), 1e-6, 0.25)
      gradient += item.a * (x - p)
      info += item.a * item.a * variance
    }
    if (info <= 1e-8) break
    const step = clamp(gradient / info, -0.75, 0.75)
    theta = clamp(theta + step, THETA_MIN, THETA_MAX)
    if (Math.abs(step) < 0.001) break
  }
  return theta
}

function estimateTwoPlItem(item: CalibrationItem, theta: number[]) {
  let alpha = -item.a * item.b
  let beta = item.a
  const lambda = 0.08

  for (let iteration = 0; iteration < 30; iteration++) {
    let g0 = 0
    let g1 = -lambda * (beta - 1)
    let h00 = 0
    let h01 = 0
    let h11 = -lambda

    for (let i = 0; i < theta.length; i++) {
      const p = logistic(alpha + beta * theta[i])
      const x = item.responses[i]
      const variance = clamp(p * (1 - p), 1e-6, 0.25)
      g0 += x - p
      g1 += (x - p) * theta[i]
      h00 -= variance
      h01 -= variance * theta[i]
      h11 -= variance * theta[i] * theta[i]
    }

    const determinant = h00 * h11 - h01 * h01
    if (Math.abs(determinant) < 1e-10) break
    const delta0 = (h11 * g0 - h01 * g1) / determinant
    const delta1 = (-h01 * g0 + h00 * g1) / determinant
    alpha -= clamp(delta0, -0.8, 0.8)
    beta -= clamp(delta1, -0.5, 0.5)
    beta = clamp(beta, 0.2, 3)
    if (Math.abs(delta0) < 0.001 && Math.abs(delta1) < 0.001) break
  }

  item.a = clamp(beta, 0.2, 3)
  item.b = clamp(-alpha / item.a, THETA_MIN, THETA_MAX)
}

function estimateRaschItem(item: CalibrationItem, theta: number[]) {
  let alpha = -item.b
  for (let iteration = 0; iteration < 30; iteration++) {
    let gradient = 0
    let hessian = 0
    for (let i = 0; i < theta.length; i++) {
      const p = logistic(alpha + theta[i])
      const x = item.responses[i]
      const variance = clamp(p * (1 - p), 1e-6, 0.25)
      gradient += x - p
      hessian -= variance
    }
    if (Math.abs(hessian) < 1e-10) break
    const step = clamp(gradient / hessian, -0.8, 0.8)
    alpha -= step
    if (Math.abs(step) < 0.001) break
  }
  item.b = clamp(-alpha, THETA_MIN, THETA_MAX)
}

function buildItemEstimates(
  state: CalibrationState,
  students: StudentRecord[],
  responseMatrix: number[][],
): IrtItemEstimate[] {
  return state.items.map((item, itemIndex) => {
    const correct = item.responses.reduce((sum, value) => sum + value, 0)
    const missing = item.missing.filter(Boolean).length
    const fit = itemFit(item, state.theta)
    const pZero = probability(0, item.a, item.b)
    const flags = buildItemFlags(item, fit)

    return {
      questionNumber: item.question.number,
      contentArea: item.question.contentArea,
      achievementStandard: item.question.achievementStandard,
      difficultyLabel: item.question.difficulty,
      points: item.question.points,
      answer: item.answer,
      n: students.length,
      correct,
      pValue: students.length > 0 ? correct / students.length : 0,
      missingRate: students.length > 0 ? missing / students.length : 0,
      pointBiserial: item.pointBiserial,
      a: item.a,
      b: item.b,
      infit: fit.infit,
      outfit: fit.outfit,
      informationAtZero: item.a * item.a * pZero * (1 - pZero),
      flags: responseMatrix[itemIndex] ? flags : [...flags, '응답행렬 없음'],
    }
  }).sort((a, b) => a.questionNumber - b.questionNumber)
}

function buildStudentEstimates(state: CalibrationState, students: StudentRecord[]): IrtStudentEstimate[] {
  const raw = students.map((student, studentIndex) => {
    const theta = state.theta[studentIndex]
    const info = state.items.reduce((sum, item) => {
      const p = probability(theta, item.a, item.b)
      return sum + item.a * item.a * p * (1 - p)
    }, 0)
    const rawCorrect = state.items.reduce((sum, item) => sum + item.responses[studentIndex], 0)
    const rawScore = state.items.reduce((sum, item) => sum + item.responses[studentIndex] * item.question.points, 0)
    const expectedScore = state.items.reduce((sum, item) => {
      const p = probability(theta, item.a, item.b)
      return sum + p * item.question.points
    }, 0)

    return {
      student,
      rawCorrect,
      rawScore,
      theta,
      sem: info > 1e-8 ? 1 / Math.sqrt(info) : null,
      expectedScore,
      outfit: studentFit(state.items, theta, studentIndex),
    }
  })

  const sortedTheta = raw.map(row => row.theta).sort((a, b) => a - b)

  return raw
    .map(row => {
      const lower = sortedTheta.filter(theta => theta < row.theta).length
      const equal = sortedTheta.filter(theta => Math.abs(theta - row.theta) <= 1e-6).length
      const percentile = sortedTheta.length > 0 ? ((lower + equal * 0.5) / sortedTheta.length) * 100 : null
      return {
        studentId: row.student.studentId,
        classNum: row.student.classNum,
        seatNum: row.student.seatNum,
        name: row.student.name,
        rawCorrect: row.rawCorrect,
        rawScore: row.rawScore,
        theta: row.theta,
        sem: row.sem,
        percentile,
        expectedScore: row.expectedScore,
        outfit: row.outfit,
      }
    })
    .sort((a, b) => (b.theta ?? -Infinity) - (a.theta ?? -Infinity))
}

function buildInformationCurve(items: CalibrationItem[]): IrtCurvePoint[] {
  const points: IrtCurvePoint[] = []
  for (let theta = -4; theta <= 4.0001; theta += 0.25) {
    const information = items.reduce((sum, item) => {
      const p = probability(theta, item.a, item.b)
      return sum + item.a * item.a * p * (1 - p)
    }, 0)
    points.push({
      theta: Number(theta.toFixed(2)),
      information,
      sem: information > 1e-8 ? 1 / Math.sqrt(information) : null,
    })
  }
  return points
}

function buildSubjectivePolytomousIrtAnalysis(
  data: SubjectiveIrtData,
  examStudents: StudentRecord[],
): SubjectivePolytomousIrtResult {
  const includedItems = data.items
    .filter(item => item.includeInIrt && item.maxScore > 0 && item.orderedCategories)
    .map(item => ({
      spec: item,
      scores: data.students.map(student => normalizeSubjectiveScore(student.scores[item.itemId], item)),
      thresholds: initialSubjectiveThresholds(item, data.students),
      scoreTotalCorrelation: null,
      thresholdOrderWarning: false,
    }))
    .filter(item => countValidScores(item.scores) > 0)

  const excludedCount = data.items.filter(item => !includedItems.some(included => included.spec.itemId === item.itemId)).length
  const state = calibrateSubjectiveItems(includedItems)
  const itemEstimates = buildSubjectiveItemEstimates(state, data.students)
  const studentEstimates = buildSubjectiveStudentEstimates(state, data.students, examStudents)
  const curve = buildSubjectiveInformationCurve(state.items)
  const reliability = estimateSubjectiveReliability(studentEstimates)
  const missingRate = calcSubjectiveMissingRate(includedItems)
  const warnings = buildSubjectiveWarnings(data, state, missingRate, reliability, excludedCount)

  return {
    model: '다분형 순서형 IRT',
    modelNote: '서답형 문항별 부분점수를 순서형 범주로 보고 문항별 임계값, 학생 θ, 표준오차, 적합도를 추정합니다.',
    studentCount: data.students.length,
    itemCount: data.items.length,
    includedItemCount: state.items.length,
    missingRate,
    iterations: state.iterations,
    converged: state.converged,
    logLikelihood: state.logLikelihood,
    reliability,
    warnings,
    items: itemEstimates,
    students: studentEstimates,
    curve,
  }
}

function calibrateSubjectiveItems(inputItems: SubjectiveCalibrationItem[]): SubjectiveCalibrationState {
  if (inputItems.length === 0 || inputItems[0].scores.length === 0) {
    return { items: inputItems, theta: [], iterations: 0, converged: false, logLikelihood: null }
  }

  const items = inputItems.map(item => ({ ...item }))
  for (const item of items) {
    item.scoreTotalCorrelation = pearsonValid(
      item.scores,
      item.scores.map((_, studentIndex) =>
        items.reduce((sum, target) => sum + (target.scores[studentIndex] ?? 0), 0) - (item.scores[studentIndex] ?? 0),
      ),
    )
  }

  let theta = initialSubjectiveTheta(items)
  let previousLogLikelihood = Number.NEGATIVE_INFINITY
  let converged = false
  let iterations = 0

  for (let iteration = 0; iteration < MAX_OUTER_ITERATIONS; iteration++) {
    for (const item of items) {
      const rawThresholds = estimateSubjectiveThresholds(item, theta)
      item.thresholdOrderWarning = rawThresholds.some((value, index) =>
        index > 0 && value < rawThresholds[index - 1],
      )
      item.thresholds = enforceIncreasing(rawThresholds)
    }

    theta = estimateAllSubjectiveTheta(items, theta)
    theta = standardize(theta)

    const currentLogLikelihood = subjectiveLogLikelihood(items, theta)
    iterations = iteration + 1
    if (Number.isFinite(previousLogLikelihood) && Math.abs(currentLogLikelihood - previousLogLikelihood) < 0.001) {
      converged = true
      previousLogLikelihood = currentLogLikelihood
      break
    }
    previousLogLikelihood = currentLogLikelihood
  }

  return {
    items,
    theta,
    iterations,
    converged,
    logLikelihood: Number.isFinite(previousLogLikelihood) ? previousLogLikelihood : null,
  }
}

function initialSubjectiveTheta(items: SubjectiveCalibrationItem[]): number[] {
  const studentCount = items[0]?.scores.length ?? 0
  return Array.from({ length: studentCount }, (_, studentIndex) => {
    let earned = 0
    let total = 0
    for (const item of items) {
      const score = item.scores[studentIndex]
      if (score === null) continue
      earned += score
      total += item.spec.maxScore
    }
    const p = total > 0 ? clamp((earned + 0.5) / (total + 1), 0.01, 0.99) : 0.5
    return clamp(Math.log(p / (1 - p)), THETA_MIN, THETA_MAX)
  })
}

function estimateAllSubjectiveTheta(items: SubjectiveCalibrationItem[], currentTheta: number[]): number[] {
  return currentTheta.map((theta, studentIndex) => estimateSubjectiveTheta(items, studentIndex, theta))
}

function estimateSubjectiveTheta(items: SubjectiveCalibrationItem[], studentIndex: number, startTheta: number): number {
  let theta = clamp(startTheta, THETA_MIN, THETA_MAX)
  for (let iteration = 0; iteration < 30; iteration++) {
    let gradient = 0
    let info = 0
    for (const item of items) {
      const observed = item.scores[studentIndex]
      if (observed === null) continue
      const moments = subjectiveMoments(theta, item.thresholds, item.spec.maxScore)
      gradient += observed - moments.expected
      info += Math.max(moments.variance, 1e-6)
    }
    if (info <= 1e-8) break
    const step = clamp(gradient / info, -0.75, 0.75)
    theta = clamp(theta + step, THETA_MIN, THETA_MAX)
    if (Math.abs(step) < 0.001) break
  }
  return theta
}

function estimateSubjectiveThresholds(item: SubjectiveCalibrationItem, theta: number[]): number[] {
  const maxScore = Math.floor(item.spec.maxScore)
  const thresholds: number[] = []
  for (let step = 1; step <= maxScore; step++) {
    let tau = item.thresholds[step - 1] ?? 0
    for (let iteration = 0; iteration < 30; iteration++) {
      let gradient = 0
      let hessian = 0
      for (let i = 0; i < theta.length; i++) {
        const score = item.scores[i]
        if (score === null) continue
        const observed = score >= step ? 1 : 0
        const p = logistic(theta[i] - tau)
        const v = clamp(p * (1 - p), 1e-6, 0.25)
        gradient += p - observed
        hessian -= v
      }
      if (Math.abs(hessian) < 1e-10) break
      const update = clamp(gradient / hessian, -0.7, 0.7)
      tau -= update
      tau = clamp(tau, THETA_MIN, THETA_MAX)
      if (Math.abs(update) < 0.001) break
    }
    thresholds.push(tau)
  }
  return thresholds
}

function buildSubjectiveItemEstimates(
  state: SubjectiveCalibrationState,
  students: SubjectiveIrtStudentScore[],
): SubjectiveIrtItemEstimate[] {
  return state.items.map(item => {
    const validScores = item.scores.filter((score): score is number => score !== null)
    const meanScore = mean(validScores)
    const fit = subjectiveItemFit(item, state.theta)
    const flags = buildSubjectiveItemFlags(item, fit)

    return {
      itemId: item.spec.itemId,
      itemType: item.spec.itemType,
      contentArea: item.spec.contentArea,
      achievementStandard: item.spec.achievementStandard,
      maxScore: item.spec.maxScore,
      categoryValues: item.spec.categoryValues,
      responseCount: validScores.length,
      missingCount: students.length - validScores.length,
      meanScore,
      meanRate: item.spec.maxScore > 0 ? meanScore / item.spec.maxScore : 0,
      scoreTotalCorrelation: item.scoreTotalCorrelation,
      location: item.thresholds.length > 0 ? mean(item.thresholds) : null,
      thresholds: item.thresholds,
      infit: fit.infit,
      outfit: fit.outfit,
      flags,
    }
  })
}

function buildSubjectiveStudentEstimates(
  state: SubjectiveCalibrationState,
  students: SubjectiveIrtStudentScore[],
  examStudents: StudentRecord[],
): SubjectiveIrtStudentEstimate[] {
  const examStudentMap = new Map(examStudents.map(student => [student.studentId, student]))
  const estimates = students.map((student, studentIndex) => {
    const examStudent = examStudentMap.get(student.studentId)
    let rawScore = 0
    let maxScore = 0
    let answeredItems = 0
    let expectedScore = 0
    let info = 0
    const theta = state.theta[studentIndex] ?? null

    for (const item of state.items) {
      const score = item.scores[studentIndex]
      if (score !== null) {
        rawScore += score
        maxScore += item.spec.maxScore
        answeredItems++
      }
      if (theta !== null) {
        const moments = subjectiveMoments(theta, item.thresholds, item.spec.maxScore)
        expectedScore += moments.expected
        info += moments.variance
      }
    }

    return {
      studentId: student.studentId,
      classNum: student.classNum || examStudent?.classNum || '',
      seatNum: student.seatNum || examStudent?.seatNum || '',
      name: student.name || examStudent?.name || student.studentId,
      rawScore,
      maxScore,
      answeredItems,
      theta,
      sem: info > 1e-8 ? 1 / Math.sqrt(info) : null,
      percentile: null,
      expectedScore: theta === null ? null : expectedScore,
      outfit: theta === null ? null : subjectiveStudentFit(state.items, theta, studentIndex),
    }
  })

  const sortedTheta = estimates.map(row => row.theta).sort((a, b) => (a ?? 0) - (b ?? 0))
  return estimates
    .map(row => {
      if (row.theta === null) return row
      const lower = sortedTheta.filter(theta => theta !== null && theta < row.theta!).length
      const equal = sortedTheta.filter(theta => theta !== null && Math.abs(theta - row.theta!) <= 1e-6).length
      return {
        ...row,
        percentile: sortedTheta.length > 0 ? ((lower + equal * 0.5) / sortedTheta.length) * 100 : null,
      }
    })
    .sort((a, b) => (b.theta ?? -Infinity) - (a.theta ?? -Infinity))
}

function buildSubjectiveInformationCurve(items: SubjectiveCalibrationItem[]): IrtCurvePoint[] {
  const points: IrtCurvePoint[] = []
  for (let theta = -4; theta <= 4.0001; theta += 0.25) {
    const information = items.reduce((sum, item) => {
      const moments = subjectiveMoments(theta, item.thresholds, item.spec.maxScore)
      return sum + moments.variance
    }, 0)
    points.push({
      theta: Number(theta.toFixed(2)),
      information,
      sem: information > 1e-8 ? 1 / Math.sqrt(information) : null,
    })
  }
  return points
}

function buildSubjectiveWarnings(
  data: SubjectiveIrtData,
  state: SubjectiveCalibrationState,
  missingRate: number,
  reliability: number | null,
  excludedCount: number,
): IrtWarning[] {
  const warnings: IrtWarning[] = data.warnings.slice(0, 6).map(detail => ({
    level: 'warning',
    title: '입력 파일 점검',
    detail,
  }))

  if (data.students.length < 50) {
    warnings.push({
      level: 'danger',
      title: '서답형 표본 수 부족',
      detail: `서답형 IRT 입력파일의 학생 수가 ${data.students.length}명입니다. 개인 θ와 임계값은 참고용으로 해석하세요.`,
    })
  } else if (data.students.length < 100) {
    warnings.push({
      level: 'warning',
      title: '서답형 표본 수 제한',
      detail: `학생 수 ${data.students.length}명입니다. 다분형 모형은 가능하면 100~200명 이상에서 더 안정적입니다.`,
    })
  }

  if (state.items.length < 3) {
    warnings.push({
      level: 'danger',
      title: '서답형 문항 수 부족',
      detail: `보정 가능한 서답형 문항이 ${state.items.length}개입니다. 검사 수준의 능력 추정보다는 문항별 루브릭 점검에 초점을 두세요.`,
    })
  }

  if (excludedCount > 0) {
    warnings.push({
      level: 'warning',
      title: '서답형 제외 문항 있음',
      detail: `${excludedCount}개 문항은 include_in_irt=false, 비순서형 범주, 점수 부족 등으로 보정에서 제외되었습니다.`,
    })
  }

  if (missingRate >= 0.05) {
    warnings.push({
      level: 'warning',
      title: '서답형 결측 비율 확인',
      detail: `서답형 문항 점수의 ${(missingRate * 100).toFixed(1)}%가 결측입니다. 결측과 실제 0점을 구분했는지 확인하세요.`,
    })
  }

  if (reliability !== null && reliability < 0.6) {
    warnings.push({
      level: 'warning',
      title: '서답형 θ 신뢰도 낮음',
      detail: `분리 신뢰도 추정치가 ${reliability.toFixed(2)}입니다. 학생별 θ보다 문항/범주 진단을 우선하세요.`,
    })
  }

  warnings.push({
    level: 'info',
    title: '루브릭 순서성 가정',
    detail: '현재 서답형 IRT는 점수 범주가 낮은 성취에서 높은 성취로 순서화된다고 가정합니다.',
  })

  return warnings
}

function subjectiveMoments(theta: number, thresholds: number[], maxScore: number): { expected: number; variance: number } {
  const probs = subjectiveCategoryProbabilities(theta, thresholds, maxScore)
  const expected = probs.reduce((sum, p, score) => sum + score * p, 0)
  const second = probs.reduce((sum, p, score) => sum + score * score * p, 0)
  return {
    expected,
    variance: Math.max(0, second - expected * expected),
  }
}

function subjectiveCategoryProbabilities(theta: number, thresholds: number[], maxScore: number): number[] {
  const max = Math.max(0, Math.floor(maxScore))
  const cumulative = [1]
  for (let step = 1; step <= max; step++) {
    cumulative[step] = logistic(theta - (thresholds[step - 1] ?? 0))
  }
  cumulative[max + 1] = 0

  const probs: number[] = []
  for (let score = 0; score <= max; score++) {
    probs[score] = Math.max(0, cumulative[score] - cumulative[score + 1])
  }
  const total = probs.reduce((sum, p) => sum + p, 0)
  if (total <= 1e-10) return Array.from({ length: max + 1 }, () => 1 / (max + 1))
  return probs.map(p => p / total)
}

function initialSubjectiveThresholds(item: SubjectiveIrtItemSpec, students: SubjectiveIrtStudentScore[]): number[] {
  const max = Math.max(0, Math.floor(item.maxScore))
  return Array.from({ length: max }, (_, index) => {
    const step = index + 1
    let below = 0.5
    let above = 0.5
    for (const student of students) {
      const score = normalizeSubjectiveScore(student.scores[item.itemId], item)
      if (score === null) continue
      if (score >= step) above++
      else below++
    }
    return clamp(Math.log(below / above), THETA_MIN, THETA_MAX)
  })
}

function normalizeSubjectiveScore(score: number | null | undefined, item: SubjectiveIrtItemSpec): number | null {
  if (score === null || score === undefined || !Number.isFinite(score)) return null
  return clamp(Math.round(score), 0, Math.floor(item.maxScore))
}

function countValidScores(scores: Array<number | null>): number {
  return scores.filter(score => score !== null).length
}

function calcSubjectiveMissingRate(items: SubjectiveCalibrationItem[]): number {
  let total = 0
  let missing = 0
  for (const item of items) {
    for (const score of item.scores) {
      total++
      if (score === null) missing++
    }
  }
  return total > 0 ? missing / total : 0
}

function enforceIncreasing(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] <= sorted[i - 1]) sorted[i] = sorted[i - 1] + 0.05
  }
  return sorted.map(value => clamp(value, THETA_MIN, THETA_MAX))
}

function buildSubjectiveItemFlags(
  item: SubjectiveCalibrationItem,
  fit: { infit: number | null; outfit: number | null },
): string[] {
  const flags: string[] = []
  const validScores = item.scores.filter((score): score is number => score !== null)
  const meanScore = mean(validScores)
  const meanRate = item.spec.maxScore > 0 ? meanScore / item.spec.maxScore : 0
  if (validScores.length < Math.max(10, item.scores.length * 0.5)) flags.push('응답 부족')
  if (meanRate < 0.15) flags.push('매우 어려움')
  if (meanRate > 0.9) flags.push('매우 쉬움')
  if ((item.scoreTotalCorrelation ?? 0) < 0.15) flags.push('낮은 점수상관')
  if (item.thresholdOrderWarning) flags.push('임계값 순서 점검')
  if ((fit.outfit ?? 1) > 1.5) flags.push('부적합 가능')
  if ((fit.infit ?? 1) > 1.3) flags.push('중심부 부적합')
  return flags
}

function subjectiveItemFit(
  item: SubjectiveCalibrationItem,
  theta: number[],
): { infit: number | null; outfit: number | null } {
  let weightedResidual = 0
  let weightSum = 0
  let residualSum = 0
  let count = 0

  for (let i = 0; i < theta.length; i++) {
    const score = item.scores[i]
    if (score === null) continue
    const moments = subjectiveMoments(theta[i], item.thresholds, item.spec.maxScore)
    const variance = Math.max(moments.variance, 1e-6)
    const residualSquared = ((score - moments.expected) ** 2) / variance
    residualSum += residualSquared
    weightedResidual += variance * residualSquared
    weightSum += variance
    count++
  }

  return {
    infit: weightSum > 0 ? weightedResidual / weightSum : null,
    outfit: count > 0 ? residualSum / count : null,
  }
}

function subjectiveStudentFit(items: SubjectiveCalibrationItem[], theta: number, studentIndex: number): number | null {
  let residualSum = 0
  let count = 0
  for (const item of items) {
    const score = item.scores[studentIndex]
    if (score === null) continue
    const moments = subjectiveMoments(theta, item.thresholds, item.spec.maxScore)
    const variance = Math.max(moments.variance, 1e-6)
    residualSum += ((score - moments.expected) ** 2) / variance
    count++
  }
  return count > 0 ? residualSum / count : null
}

function subjectiveLogLikelihood(items: SubjectiveCalibrationItem[], theta: number[]): number {
  let value = 0
  for (const item of items) {
    for (let i = 0; i < theta.length; i++) {
      const score = item.scores[i]
      if (score === null) continue
      const probs = subjectiveCategoryProbabilities(theta[i], item.thresholds, item.spec.maxScore)
      value += Math.log(clamp(probs[score] ?? 1e-6, 1e-6, 1))
    }
  }
  return value
}

function estimateSubjectiveReliability(students: SubjectiveIrtStudentEstimate[]): number | null {
  const values = students
    .filter(student => student.theta !== null && student.sem !== null)
    .map(student => ({ theta: student.theta as number, sem: student.sem as number }))
  if (values.length < 2) return null
  const thetaVariance = variance(values.map(value => value.theta))
  const errorVariance = values.reduce((sum, value) => sum + value.sem * value.sem, 0) / values.length
  if (thetaVariance + errorVariance <= 1e-8) return null
  return clamp(thetaVariance / (thetaVariance + errorVariance), 0, 1)
}

function buildWarnings(input: {
  studentCount: number
  includedItemCount: number
  excludedQuestions: IrtExcludedQuestion[]
  missingRate: number
  model: FormalIrtModel
  reliability: number | null
  subjectiveMode: ExamData['subjectiveMode']
  subjectiveQuestionCount: number
  hasSubjectiveIrtData: boolean
}): IrtWarning[] {
  const warnings: IrtWarning[] = []

  if (input.studentCount < 50) {
    warnings.push({
      level: 'danger',
      title: '표본 수 부족',
      detail: `응시자 ${input.studentCount}명입니다. IRT 모수는 매우 불안정하므로 정성적 참고용으로만 보세요.`,
    })
  } else if (input.studentCount < 100) {
    warnings.push({
      level: 'warning',
      title: '2PL 추정에는 표본이 작음',
      detail: `응시자 ${input.studentCount}명입니다. Rasch/1PL 중심 해석이 더 안정적입니다.`,
    })
  } else if (input.studentCount < 200 && input.model === '2PL') {
    warnings.push({
      level: 'info',
      title: '2PL 추정 안정성 주의',
      detail: `응시자 ${input.studentCount}명입니다. 학교 단위 진단에는 유용하지만 고부담 평가 수준의 보정에는 더 큰 표본이 좋습니다.`,
    })
  }

  if (input.includedItemCount < 8) {
    warnings.push({
      level: 'danger',
      title: '문항 수 부족',
      detail: `보정 가능한 선택형 문항이 ${input.includedItemCount}개입니다. 능력 추정 표준오차가 커질 수 있습니다.`,
    })
  } else if (input.includedItemCount < 15) {
    warnings.push({
      level: 'warning',
      title: '문항 수 제한',
      detail: `보정 가능한 선택형 문항이 ${input.includedItemCount}개입니다. 세부 영역별 해석은 조심해야 합니다.`,
    })
  }

  if (input.excludedQuestions.length > 0) {
    warnings.push({
      level: 'warning',
      title: '제외 문항 있음',
      detail: `${input.excludedQuestions.length}개 문항은 정답키 없음, 전원 정답/오답 등으로 IRT 보정에서 제외되었습니다.`,
    })
  }

  if (input.missingRate >= 0.05) {
    warnings.push({
      level: 'warning',
      title: '무응답 비율 확인 필요',
      detail: `선택형 응답의 ${(input.missingRate * 100).toFixed(1)}%가 무응답으로 처리되었습니다. 현재는 오답으로 포함합니다.`,
    })
  }

  if (input.reliability !== null && input.reliability < 0.6) {
    warnings.push({
      level: 'warning',
      title: '능력 추정 신뢰도 낮음',
      detail: `분리 신뢰도 추정치가 ${input.reliability.toFixed(2)}입니다. 개인별 θ보다 문항 진단 중심으로 보세요.`,
    })
  }

  warnings.push({
    level: 'info',
    title: '단일 차원성은 별도 검증 필요',
    detail: '현재 모형은 선택형 문항이 하나의 잠재 능력을 측정한다고 가정합니다. 내용영역이 크게 갈리면 영역별 모형이 더 적절할 수 있습니다.',
  })

  if (!input.hasSubjectiveIrtData && (input.subjectiveMode === 'combined' || input.subjectiveQuestionCount === 0)) {
    warnings.push({
      level: 'info',
      title: '서답형은 정식 IRT에서 제외',
      detail: '서답형 문항별 부분점수 또는 채점 범주가 충분히 있어야 PCM/GRM 같은 다분형 IRT를 적용할 수 있습니다.',
    })
  }

  return warnings
}

function buildSubjectiveNote(examData: ExamData): string {
  if (examData.subjectiveIrtData) {
    return '서답형 IRT 입력파일이 감지되어 선택형 이분형 IRT와 서답형 다분형 IRT를 함께 표시합니다.'
  }
  if (examData.subjectiveMode === 'split' && examData.subjectiveQuestionStats.length > 0) {
    return '서답형 문항별 점수 열은 감지되었지만, 현재 전문 IRT 탭은 선택형 이분 반응 모형만 보정합니다. 부분점수 IRT를 위해서는 각 문항의 채점 범주와 원점수 분포를 별도 모형으로 처리해야 합니다.'
  }
  return '현재 데이터에서는 서답형 문항별 부분점수/채점 범주가 충분하지 않아 정식 IRT 보정에는 포함하지 않았습니다.'
}

function buildItemFlags(item: CalibrationItem, fit: { infit: number | null; outfit: number | null }): string[] {
  const flags: string[] = []
  const pValue = item.responses.reduce((sum, value) => sum + value, 0) / item.responses.length
  if (pValue < 0.15) flags.push('매우 어려움')
  if (pValue > 0.9) flags.push('매우 쉬움')
  if ((item.pointBiserial ?? 0) < 0.15) flags.push('낮은 점수상관')
  if ((fit.outfit ?? 1) > 1.5) flags.push('부적합 가능')
  if ((fit.infit ?? 1) > 1.3) flags.push('중심부 부적합')
  if (item.a < 0.35) flags.push('낮은 변별도')
  if (item.a > 2.5) flags.push('매우 높은 변별도')
  return flags
}

function itemFit(item: CalibrationItem, theta: number[]): { infit: number | null; outfit: number | null } {
  if (theta.length === 0) return { infit: null, outfit: null }
  let weightedResidual = 0
  let weightSum = 0
  let residualSum = 0

  for (let i = 0; i < theta.length; i++) {
    const p = probability(theta[i], item.a, item.b)
    const variance = clamp(p * (1 - p), 1e-6, 0.25)
    const residualSquared = ((item.responses[i] - p) ** 2) / variance
    residualSum += residualSquared
    weightedResidual += variance * residualSquared
    weightSum += variance
  }

  return {
    infit: weightSum > 0 ? weightedResidual / weightSum : null,
    outfit: residualSum / theta.length,
  }
}

function studentFit(items: CalibrationItem[], theta: number, studentIndex: number): number | null {
  if (items.length === 0) return null
  let residualSum = 0
  for (const item of items) {
    const p = probability(theta, item.a, item.b)
    const variance = clamp(p * (1 - p), 1e-6, 0.25)
    residualSum += ((item.responses[studentIndex] - p) ** 2) / variance
  }
  return residualSum / items.length
}

function estimateReliability(students: IrtStudentEstimate[]): number | null {
  const values = students
    .filter(student => student.theta !== null && student.sem !== null)
    .map(student => ({ theta: student.theta as number, sem: student.sem as number }))
  if (values.length < 2) return null
  const thetaVariance = variance(values.map(value => value.theta))
  const errorVariance = values.reduce((sum, value) => sum + value.sem * value.sem, 0) / values.length
  if (thetaVariance + errorVariance <= 1e-8) return null
  return clamp(thetaVariance / (thetaVariance + errorVariance), 0, 1)
}

function logLikelihood(items: CalibrationItem[], theta: number[]): number {
  let value = 0
  for (const item of items) {
    for (let i = 0; i < theta.length; i++) {
      const p = clamp(probability(theta[i], item.a, item.b), 1e-6, 1 - 1e-6)
      value += item.responses[i] ? Math.log(p) : Math.log(1 - p)
    }
  }
  return value
}

function probability(theta: number, a: number, b: number): number {
  return logistic(a * (theta - b))
}

function logistic(value: number): number {
  if (value >= 0) {
    const z = Math.exp(-value)
    return 1 / (1 + z)
  }
  const z = Math.exp(value)
  return z / (1 + z)
}

function logitDifficulty(p: number): number {
  const clamped = clamp(p, 0.01, 0.99)
  return Math.log((1 - clamped) / clamped)
}

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length === 0 || xs.length !== ys.length) return null
  const meanX = mean(xs)
  const meanY = mean(ys)
  let cov = 0
  let vx = 0
  let vy = 0
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - meanX
    const dy = ys[i] - meanY
    cov += dx * dy
    vx += dx * dx
    vy += dy * dy
  }
  if (vx <= 1e-10 || vy <= 1e-10) return null
  return cov / Math.sqrt(vx * vy)
}

function pearsonValid(xs: Array<number | null>, ys: Array<number | null>): number | null {
  const pairs = xs
    .map((x, index) => ({ x, y: ys[index] }))
    .filter((pair): pair is { x: number; y: number } => pair.x !== null && pair.y !== null)
  return pearson(
    pairs.map(pair => pair.x),
    pairs.map(pair => pair.y),
  )
}

function mean(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function variance(values: number[]): number {
  if (values.length < 2) return 0
  const avg = mean(values)
  return values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1)
}

function standardize(values: number[]): number[] {
  if (values.length === 0) return values
  const avg = mean(values)
  const sd = Math.sqrt(variance(values))
  if (sd <= 1e-8) return values.map(() => 0)
  return values.map(value => clamp((value - avg) / sd, THETA_MIN, THETA_MAX))
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
