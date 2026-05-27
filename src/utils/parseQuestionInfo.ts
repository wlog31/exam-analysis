import type { Question, QuestionType, Difficulty, ExamInfo } from '../types'

// Google Sheets API가 반환하는 2D 배열을 파싱하여 문항정보표를 추출
export function parseQuestionInfo(rows: string[][]): { examInfo: ExamInfo; questions: Question[] } {
  const questions: Question[] = []

  // 시험 메타 정보를 행에서 추출
  const examInfo = extractExamInfo(rows)

  // 선택형 / 단답형 섹션을 탐색하며 문항 파싱
  let currentType: QuestionType | null = null
  let inQuestionSection = false
  let questionSeqNum = 0  // 선택형·단답형 내 순번

  for (const row of rows) {
    const first = String(row[0] ?? '').trim()
    const joined = row.map(c => String(c ?? '')).join('').trim()
    const compact = joined.replace(/\s+/g, '')

    // 섹션 감지
    if ((compact.includes('선택형문항') || compact.includes('객관식문항')) && !compact.includes('성취기준')) {
      currentType = '선택형'
      inQuestionSection = false
      questionSeqNum = 0
      continue
    }
    if ((compact.includes('단답형문항') || compact.includes('주관식문항')) && !compact.includes('성취기준')) {
      currentType = '단답형'
      inQuestionSection = false
      questionSeqNum = 0
      continue
    }
    if ((compact.includes('서답형문항') || compact === '서답형') && !compact.includes('성취기준')) {
      // 일부 학교 양식은 단답/서술을 '서답형' 섹션으로 묶어서 제공한다.
      // 정오표에 문항별 응답이 없으므로 여기서는 서답형 통합 섹션으로 처리한다.
      currentType = '단답형'
      inQuestionSection = false
      questionSeqNum = 0
      continue
    }
    if (compact.includes('서술형문항') && !compact.includes('성취기준')) {
      currentType = '서술형'
      inQuestionSection = false
      questionSeqNum = 0
      continue
    }

    // 컬럼 헤더 행 감지 (문항번호, 내용영역, 성취기준이 있는 행)
    if (compact.includes('문항번호') && compact.includes('내용영역')) {
      // 섹션 라벨을 못 찾은 경우 선택형부터 시작한다고 가정
      if (!currentType) currentType = '선택형'
      inQuestionSection = true
      continue
    }
    if (compact.includes('어려움') && compact.includes('보통') && compact.includes('쉬움')) {
      continue  // 난이도 소헤더 행 스킵
    }

    // 이합계, 비율, 빈 행 → 종료
    if (compact.includes('이합계') || compact.includes('합계') || compact.includes('비율')) {
      inQuestionSection = false
      continue
    }

    if (!inQuestionSection || !currentType) continue

    // 첫 컬럼이 숫자인 행 = 문항 데이터
    const num = parseInt(first)
    if (isNaN(num)) continue

    const question = parseQuestionRow(row, num, currentType)
    if (question) {
      questions.push(question)
      questionSeqNum++
    }
  }

  return { examInfo, questions }
}

function extractExamInfo(rows: string[][]): ExamInfo {
  let subject = '기하'
  let year = new Date().getFullYear()
  let semester = 1
  let examNumber = 1
  let grade = 2
  let date = ''
  let mcTotal = 50
  let saTotal = 50

  for (const row of rows) {
    const joined = row.map(c => String(c ?? '')).join(' ')

    if (joined.includes('학년도') && joined.includes('학기')) {
      const yearMatch = joined.match(/(\d{4})학년도/)
      const semMatch = joined.match(/(\d)학기/)
      const examMatch = joined.match(/(\d)차고사/)
      const gradeMatch = joined.match(/(?:^|\s)(\d)\s*학년(?!도)/)
      if (yearMatch) year = parseInt(yearMatch[1])
      if (semMatch) semester = parseInt(semMatch[1])
      if (examMatch) examNumber = parseInt(examMatch[1])
      if (gradeMatch) grade = parseInt(gradeMatch[1])
    }
    if (joined.includes('고사일자') || (joined.includes('년') && joined.includes('월') && joined.includes('일'))) {
      const dateMatch = joined.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/)
      if (dateMatch) date = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`
    }
    if (joined.includes('선택형') && joined.includes('점') && (joined.includes('단답형') || joined.includes('서답형'))) {
      const mcMatch = joined.match(/선택형\s*([\d.]+)\s*점/)
      const saMatch = joined.match(/(?:단답형|서답형)\s*([\d.]+)\s*점/)
      if (mcMatch) mcTotal = parseFloat(mcMatch[1])
      if (saMatch) saTotal = parseFloat(saMatch[1])
    }
    // 과목명 추출 (첫 몇 행에서)
    for (const cell of row) {
      if (cell.includes('기하') && cell.includes('과목')) subject = '기하'
      if (cell.includes('수학') && cell.includes('과목')) subject = '수학'
    }
  }

  return {
    subject,
    year,
    semester,
    examNumber,
    grade,
    date,
    totalQuestions: 0,  // 파싱 후 채워짐
    multipleChoiceCount: 0,
    shortAnswerCount: 0,
    multipleChoiceTotal: mcTotal,
    shortAnswerTotal: saTotal,
  }
}

function parseQuestionRow(row: string[], num: number, type: QuestionType): Question | null {
  // row 구조: [번호, 내용영역, 성취기준, 어려움, 보통, 쉬움, 배점, 정답, ...]
  // Sheets API는 빈 trailing 셀을 생략하므로 길이가 짧을 수 있음
  const contentArea = String(row[1] ?? '').trim()
  const standard = String(row[2] ?? '').trim()

  if (!contentArea) return null

  // 난이도 판별: col3=어려움, col4=보통, col5=쉬움
  let difficulty: Difficulty = '보통'
  let pointsColIdx = 6
  let answerColIdx = 7

  const col3 = String(row[3] ?? '').trim()
  const col4 = String(row[4] ?? '').trim()
  const col5 = String(row[5] ?? '').trim()

  if (col3 && col3 !== '' && !isNumeric(col3)) {
    difficulty = '어려움'
    // 어려움일 때 배점이 col4 또는 col5에 있을 수 있음 (빈 셀 생략 때문)
    pointsColIdx = findPointsCol(row, 3)
    answerColIdx = pointsColIdx + 1
  } else if (col4 && col4 !== '' && !isNumeric(col4)) {
    difficulty = '보통'
    pointsColIdx = findPointsCol(row, 4)
    answerColIdx = pointsColIdx + 1
  } else if (col5 && col5 !== '' && !isNumeric(col5)) {
    difficulty = '쉬움'
    pointsColIdx = 6
    answerColIdx = 7
  } else {
    // 난이도 마커가 없으면 숫자로 배점 위치 추정
    difficulty = guessDifficultyFromPoints(
      parseCellNumber(col3) ?? parseCellNumber(col4) ?? parseCellNumber(col5) ?? 0,
    )
    pointsColIdx = findPointsCol(row, 3)
    answerColIdx = pointsColIdx + 1
  }

  const points = parseCellNumber(String(row[pointsColIdx] ?? '')) ?? 0
  const answerRaw = String(row[answerColIdx] ?? '').trim()
  // 선택형인데 정답 칸이 "서답형 답지 별도 첨부" 같은 문장인 경우,
  // 섹션 오인식으로 들어온 행일 가능성이 크므로 제외한다.
  if (type === '선택형' && answerRaw && !isValidChoiceAnswer(answerRaw)) return null
  const answer = type === '선택형' ? (answerRaw || null) : null

  if (points === 0) return null

  return {
    number: num,
    type,
    contentArea,
    achievementStandard: standard,
    difficulty,
    points,
    answer,
  }
}

// 배점 컬럼 위치를 추정 (startIdx 이후에서 숫자 값을 찾음)
function findPointsCol(row: string[], startIdx: number): number {
  for (let i = startIdx + 1; i < Math.min(row.length, 10); i++) {
    const v = String(row[i] ?? '').trim()
    if (v && isNumeric(v)) return i
  }
  return 6
}

function isNumeric(s: string): boolean {
  return parseCellNumber(s) !== null
}

function parseCellNumber(cell: string): number | null {
  const normalized = cell.replace(',', '.')
  const m = normalized.match(/-?\d+(?:\.\d+)?/)
  if (!m) return null
  const n = parseFloat(m[0])
  return Number.isFinite(n) ? n : null
}

function guessDifficultyFromPoints(points: number): Difficulty {
  if (points >= 7) return '어려움'
  if (points >= 4.5) return '보통'
  return '쉬움'
}

function isValidChoiceAnswer(s: string): boolean {
  const v = s.trim().toUpperCase()
  if (!v) return false
  return /^([1-5]|[A-Z]|\.)$/.test(v)
}
