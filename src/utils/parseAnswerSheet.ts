import type { StudentRecord, AnswerCode } from '../types'
import {
  extractExamInfoMetadata,
  formatMetadataLabel,
  metadataValueEquals,
  type ExamInfoMetadata,
} from './examMetadata'

const MULTIPLE_ANSWER_MAP: Record<string, number[]> = {
  A: [1, 2], B: [1, 3], C: [1, 4], D: [1, 5],
  E: [2, 3], F: [2, 4], G: [2, 5], H: [3, 4], I: [3, 5], J: [4, 5],
  K: [1, 2, 3], L: [1, 2, 4], M: [1, 2, 5], N: [1, 3, 4], O: [1, 3, 5],
  P: [1, 4, 5], Q: [2, 3, 4], R: [2, 3, 5], S: [2, 4, 5], T: [3, 4, 5],
  U: [1, 2, 3, 4], V: [1, 2, 3, 5], W: [1, 2, 4, 5], X: [1, 3, 4, 5],
  Y: [2, 3, 4, 5], Z: [1, 2, 3, 4, 5],
}

export { MULTIPLE_ANSWER_MAP }

export interface ParsedAnswerSheet {
  mcAnswerKey: Record<number, string>     // 선택형 정답 (문항번호 → 정답)
  mcPoints: Record<number, number>        // 선택형 배점
  students: StudentRecord[]
  subjectiveMode: 'combined' | 'split'
  examInfo: ExamInfoMetadata
}

export interface ParsedAnswerSheetSource {
  fileName: string
  sheet: ParsedAnswerSheet
}

// Google Sheets 2D 배열로부터 정오표를 파싱
export function parseAnswerSheet(rows: string[][]): ParsedAnswerSheet {
  // 1. 헤더 행 찾기 (반/번호, 번호, 이름, 1, 2, ... 가 있는 행)
  let headerRowIdx = -1
  let questionStartCol = -1
  let questionEndCol = -1
  let mcScoreCol = -1
  let saScoreCol = -1
  let totalScoreCol = -1

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const joined = row.map(c => String(c ?? '')).join(',')
    if (joined.includes('반') && joined.includes('번호') && row.some(c => String(c ?? '').trim() === '1')) {
      headerRowIdx = i
      // 문항 번호 컬럼 위치 파악
      let firstQCol = -1
      let lastQCol = -1
      for (let j = 0; j < row.length; j++) {
        const v = String(row[j] ?? '').trim()

        if (firstQCol === -1) {
          if (v === '1') {
            firstQCol = j
            lastQCol = j
          }
          continue
        }

        // 선택형 문항 번호 구간은 보통 연속 숫자 블록이므로,
        // 첫 비숫자 컬럼을 만나면 블록 종료로 간주한다.
        if (!/^\d+$/.test(v)) break
        lastQCol = j
      }

      // 점수 컬럼은 문항 번호 블록 이후에 있으므로 별도 루프로 탐색
      for (let j = 0; j < row.length; j++) {
        const v = String(row[j] ?? '').trim()
        if (v.includes('선택형') || v.includes('선택')) mcScoreCol = j
        if (v.includes('단답형') || v.includes('단답') || v.includes('서답')) saScoreCol = j
        if (v.includes('과목') || v.includes('총점') || v.includes('이총')) totalScoreCol = j
      }

      questionStartCol = firstQCol
      questionEndCol = lastQCol
      break
    }
  }

  if (headerRowIdx === -1 || questionStartCol === -1) {
    return { ...createEmptyParsedAnswerSheet(), examInfo: extractExamInfoMetadata(rows) }
  }

  const headerRow = rows[headerRowIdx]
  const mcCount = questionEndCol - questionStartCol + 1

  // 문항 번호 목록 (헤더에서 추출)
  const questionNumbers: number[] = []
  for (let j = questionStartCol; j <= questionEndCol; j++) {
    const v = parseInt(String(headerRow[j] ?? '').trim())
    questionNumbers.push(isNaN(v) ? j - questionStartCol + 1 : v)
  }

  // 점수 컬럼이 헤더에서 못 찾았으면 문항 끝 다음에서 찾기
  if (mcScoreCol === -1) mcScoreCol = questionEndCol + 1
  if (saScoreCol === -1) saScoreCol = questionEndCol + 2
  if (totalScoreCol === -1) totalScoreCol = questionEndCol + 4

  // ── 단답형·서술형 분리 여부 탐지 ──────────────────────────────────────
  // 정오표 3행(0-indexed rows[2])에 '단답형'과 '서술형'이 모두 있으면 분리 모드.
  // 분리 모드일 경우 그 아래 4행(headerRow)에 각 섹션의 문항 번호가 담긴다.
  const sectionLabelRow = rows[2] ?? []
  const sectionLabelText = sectionLabelRow.map(c => String(c ?? '')).join('')
  const hasSplitSubjective = sectionLabelText.includes('단답') && sectionLabelText.includes('서술')

  // 분리 모드: 3행 레이블 위치로 단답형·서술형 문항 컬럼 범위를 결정한다
  let shortAnswerColStart = -1
  let essayColStart = -1
  if (hasSplitSubjective) {
    for (let j = 0; j < sectionLabelRow.length; j++) {
      const v = String(sectionLabelRow[j] ?? '').trim()
      if (shortAnswerColStart === -1 && (v.includes('단답') || v.includes('주관'))) shortAnswerColStart = j
      if (essayColStart === -1 && (v.includes('서술') || v.includes('논술'))) essayColStart = j
    }
  }

  // 2. 정답 행 찾기 (정답 레이블이 있는 행)
  let answerRowIdx = -1
  let pointsRowIdx = -1

  for (let i = headerRowIdx + 1; i < Math.min(headerRowIdx + 5, rows.length); i++) {
    const row = rows[i]
    const joined = row.map(c => String(c ?? '')).join('')
    if (joined.includes('정답') || joined.includes('답안')) answerRowIdx = i
    if (joined.includes('배점')) pointsRowIdx = i
  }

  const mcAnswerKey: Record<number, string> = {}
  const mcPoints: Record<number, number> = {}

  if (answerRowIdx !== -1) {
    const aRow = rows[answerRowIdx]
    for (let k = 0; k < mcCount; k++) {
      mcAnswerKey[questionNumbers[k]] = String(aRow[questionStartCol + k] ?? '').trim()
    }
  }
  if (pointsRowIdx !== -1) {
    const pRow = rows[pointsRowIdx]
    for (let k = 0; k < mcCount; k++) {
      mcPoints[questionNumbers[k]] = parseFloat(String(pRow[questionStartCol + k] ?? '0').trim()) || 0
    }
  }

  // 3. 학생 데이터 행 파싱
  const students: StudentRecord[] = []
  const dataStartIdx = Math.max(answerRowIdx, pointsRowIdx, headerRowIdx) + 1

  for (let i = dataStartIdx; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length < questionStartCol) continue

    // 학생 식별 컬럼은 시트마다 위치가 다를 수 있음:
    // - 기존: col0=반/번호, col1=학번
    // - 현재 파일: col0=학번, col1=반/번호
    const col0 = (row[0] ?? '').trim()
    const col1 = (row[1] ?? '').trim()
    const col2 = (row[2] ?? '').trim()

    // 비고 행, 요약 행 스킵
    const rowText = row.join('')
    if (rowText.includes('※') || rowText.includes('합계') || rowText.includes('평균')) continue

    const classMatchCol0 = col0.match(/^(\d+)\s*[/／]\s*(\d+)$/)
    const classMatchCol1 = col1.match(/^(\d+)\s*[/／]\s*(\d+)$/)
    const isStudentIdCol0 = /^\d{10}$/.test(col0)
    const isStudentIdCol1 = /^\d{10}$/.test(col1)

    if (!classMatchCol0 && !classMatchCol1 && !isStudentIdCol0 && !isStudentIdCol1) continue

    const classNum = classMatchCol0?.[1] ?? classMatchCol1?.[1] ?? ''
    const seatNum = classMatchCol0?.[2] ?? classMatchCol1?.[2] ?? ''
    const studentId = isStudentIdCol0 ? col0 : (isStudentIdCol1 ? col1 : '')
    const fallbackName = classNum && seatNum ? `${classNum}반${seatNum}번` : (studentId || '미상')

    const mcAnswers: Record<number, AnswerCode> = {}
    for (let k = 0; k < mcCount; k++) {
      const code = (row[questionStartCol + k] ?? '').trim()
      mcAnswers[questionNumbers[k]] = code
    }
    const subjectiveScores: Record<string, number> = {}

    const mcScore = parseFloat((row[mcScoreCol] ?? '0').replace(',', '.')) || 0
    const combinedSaScore = parseScoreCell(row[saScoreCol])

    let shortAnswerScore: number
    let essayScore: number
    if (hasSplitSubjective && shortAnswerColStart >= 0 && essayColStart >= 0) {
      shortAnswerScore = 0
      for (let j = shortAnswerColStart; j < essayColStart; j++) {
        const score = parseScoreCell(row[j])
        const questionNumber = parseQuestionNumber(headerRow[j], j - shortAnswerColStart + 1)
        subjectiveScores[makeSubjectiveScoreKey('단답형', questionNumber)] = score
        shortAnswerScore += score
      }
      essayScore = 0
      const essayEnd = totalScoreCol > essayColStart ? totalScoreCol : row.length
      for (let j = essayColStart; j < essayEnd; j++) {
        const score = parseScoreCell(row[j])
        const questionNumber = parseQuestionNumber(headerRow[j], j - essayColStart + 1)
        subjectiveScores[makeSubjectiveScoreKey('서술형', questionNumber)] = score
        essayScore += score
      }
    } else {
      shortAnswerScore = combinedSaScore
      essayScore = 0
    }
    const saScore = hasSplitSubjective
      ? (shortAnswerScore + essayScore > 0 ? shortAnswerScore + essayScore : combinedSaScore)
      : combinedSaScore
    const extraScore = parseFloat((row[saScoreCol + 1] ?? '0').replace(',', '.')) || 0
    const totalScore = parseFloat((row[totalScoreCol] ?? '0').replace(',', '.')) || 0

    students.push({
      studentId,
      classNum,
      seatNum,
      name: col2 || fallbackName,
      mcAnswers,
      subjectiveScores,
      mcScore,
      saScore,
      shortAnswerScore,
      essayScore,
      extraScore,
      totalScore,
    })
  }

  return {
    mcAnswerKey,
    mcPoints,
    students,
    subjectiveMode: hasSplitSubjective ? 'split' : 'combined',
    examInfo: extractExamInfoMetadata(rows),
  }
}

export function mergeParsedAnswerSheets(sources: ParsedAnswerSheetSource[]): ParsedAnswerSheet {
  if (sources.length === 0) return createEmptyParsedAnswerSheet()

  const emptyStudentFiles = sources
    .filter(({ sheet }) => sheet.students.length === 0)
    .map(({ fileName }) => fileName)
  if (emptyStudentFiles.length > 0) {
    throw new Error(`학생 데이터를 읽지 못한 정오표 파일이 있습니다: ${formatList(emptyStudentFiles)}. 파일 구조를 확인해 주세요.`)
  }

  const merged = createEmptyParsedAnswerSheet()
  const subjectiveModes = new Set<ParsedAnswerSheet['subjectiveMode']>()
  const answerKeyConflicts: string[] = []
  const pointConflicts: string[] = []
  const metadataConflicts: string[] = []
  const duplicatedStudents: string[] = []
  const seenStudents = new Map<string, string>()

  for (const { fileName, sheet } of sources) {
    subjectiveModes.add(sheet.subjectiveMode)
    mergeAnswerKey(merged.mcAnswerKey, sheet.mcAnswerKey, fileName, answerKeyConflicts)
    mergePoints(merged.mcPoints, sheet.mcPoints, fileName, pointConflicts)
    mergeExamInfo(merged.examInfo, sheet.examInfo, fileName, metadataConflicts)

    for (const student of sheet.students) {
      const key = makeStudentIdentityKey(student)
      const previousFile = seenStudents.get(key)
      if (previousFile) {
        duplicatedStudents.push(`${formatStudentIdentity(student)} (${previousFile}, ${fileName})`)
        continue
      }

      seenStudents.set(key, fileName)
      merged.students.push(student)
    }
  }

  if (subjectiveModes.size > 1) {
    throw new Error('정오표 파일의 서답형 구조가 서로 다릅니다. 모든 학급 정오표를 통합형 또는 분리형 중 같은 형식으로 맞춰 주세요.')
  }
  if (answerKeyConflicts.length > 0) {
    throw new Error(`정오표 파일 간 선택형 정답키가 다릅니다: ${formatList(answerKeyConflicts)}.`)
  }
  if (pointConflicts.length > 0) {
    throw new Error(`정오표 파일 간 선택형 배점이 다릅니다: ${formatList(pointConflicts)}.`)
  }
  if (metadataConflicts.length > 0) {
    throw new Error(`정오표 파일 간 시험 정보가 다릅니다: ${formatList(metadataConflicts)}.`)
  }
  if (duplicatedStudents.length > 0) {
    throw new Error(`정오표 파일에 중복 학생이 있습니다: ${formatList(duplicatedStudents)}. 같은 학생이 두 번 포함되면 통합 분석이 왜곡됩니다.`)
  }

  merged.subjectiveMode = [...subjectiveModes][0] ?? 'combined'
  return merged
}

// 학생 응답이 정답인지 여부
export function isCorrect(answer: AnswerCode, correctAnswer: string): boolean {
  return answer === '.' || answer.trim() === correctAnswer.trim()
}

function createEmptyParsedAnswerSheet(): ParsedAnswerSheet {
  return { mcAnswerKey: {}, mcPoints: {}, students: [], subjectiveMode: 'combined', examInfo: {} }
}

function mergeAnswerKey(
  target: Record<number, string>,
  source: Record<number, string>,
  fileName: string,
  conflicts: string[],
) {
  for (const [questionNumber, rawValue] of Object.entries(source)) {
    const value = String(rawValue ?? '').trim()
    if (!value) continue

    const key = Number(questionNumber)
    const existing = target[key]
    if (!existing) {
      target[key] = value
    } else if (existing !== value) {
      conflicts.push(`${questionNumber}번: ${existing} ↔ ${value} (${fileName})`)
    }
  }
}

function mergePoints(
  target: Record<number, number>,
  source: Record<number, number>,
  fileName: string,
  conflicts: string[],
) {
  for (const [questionNumber, rawValue] of Object.entries(source)) {
    const value = Number(rawValue)
    if (!Number.isFinite(value) || value === 0) continue

    const key = Number(questionNumber)
    const existing = target[key]
    if (!existing) {
      target[key] = value
    } else if (Math.abs(existing - value) > 0.000001) {
      conflicts.push(`${questionNumber}번: ${existing}점 ↔ ${value}점 (${fileName})`)
    }
  }
}

function mergeExamInfo(
  target: ExamInfoMetadata,
  source: ExamInfoMetadata,
  fileName: string,
  conflicts: string[],
) {
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = rawKey as keyof ExamInfoMetadata
    if (rawValue === undefined || rawValue === null || rawValue === '') continue

    const existing = target[key]
    if (existing === undefined || existing === null || existing === '') {
      target[key] = rawValue as never
    } else if (!metadataValueEquals(key, existing as never, rawValue as never)) {
      conflicts.push(`${formatMetadataLabel(key)}: ${existing} ↔ ${rawValue} (${fileName})`)
    }
  }
}

function makeStudentIdentityKey(student: StudentRecord): string {
  const studentId = student.studentId.trim()
  if (studentId) return `studentId:${studentId}`

  const classNum = student.classNum.trim()
  const seatNum = student.seatNum.trim()
  if (classNum && seatNum) return `classSeat:${classNum}/${seatNum}`

  return `name:${student.name.trim()}`
}

function formatStudentIdentity(student: StudentRecord): string {
  const classSeat = student.classNum && student.seatNum
    ? `${student.classNum}반 ${student.seatNum}번`
    : ''
  const name = student.name.trim()
  const base = [classSeat, name].filter(Boolean).join(' ')
  return student.studentId ? `${base || '미상'}(${student.studentId})` : (base || '미상')
}

function formatList(items: string[], maxItems = 5): string {
  const visible = items.slice(0, maxItems).join(', ')
  const hiddenCount = items.length - maxItems
  return hiddenCount > 0 ? `${visible} 외 ${hiddenCount}건` : visible
}

function parseScoreCell(cell: string | undefined): number {
  const v = String(cell ?? '').trim()
  if (!v) return 0
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function parseQuestionNumber(cell: string | undefined, fallback: number): number {
  const n = parseInt(String(cell ?? '').trim(), 10)
  return Number.isFinite(n) ? n : fallback
}

function makeSubjectiveScoreKey(type: '단답형' | '서술형', questionNumber: number): string {
  return `${type}:${questionNumber}`
}

