import type { ExamInfo } from '../types'

export type ExamInfoMetadata = Partial<Pick<
  ExamInfo,
  'subject'
  | 'year'
  | 'semester'
  | 'examNumber'
  | 'grade'
  | 'date'
  | 'multipleChoiceTotal'
  | 'shortAnswerTotal'
>>

const UNKNOWN_SUBJECT = '과목 미상'

export function extractExamInfoMetadata(rows: string[][]): ExamInfoMetadata {
  const metadata: ExamInfoMetadata = {}
  const lines = rows
    .map(row => row.map(cell => String(cell ?? '').trim()).filter(Boolean))
    .filter(cells => cells.length > 0)

  const subject = extractSubject(lines)
  if (subject) metadata.subject = subject

  for (const cells of lines) {
    const joined = cells.join(' ')

    const yearMatch = joined.match(/(\d{4})\s*(?:학년도|년도)/)
    if (yearMatch) metadata.year = parseInt(yearMatch[1], 10)

    const semesterMatch = joined.match(/([12])\s*학기/)
    if (semesterMatch) metadata.semester = parseInt(semesterMatch[1], 10)

    const examMatch = joined.match(/(\d+)\s*차\s*(?:고사|지필|평가)?/)
    if (examMatch) {
      metadata.examNumber = parseInt(examMatch[1], 10)
    } else if (!metadata.examNumber && /중간\s*(?:고사|평가)?/.test(joined)) {
      metadata.examNumber = 1
    } else if (!metadata.examNumber && /기말\s*(?:고사|평가)?/.test(joined)) {
      metadata.examNumber = 2
    }

    const gradeMatch = joined.match(/(?:^|[^\d])([1-6])\s*학년(?!도)/)
    if (gradeMatch) metadata.grade = parseInt(gradeMatch[1], 10)

    const dateMatch = joined.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/)
    if (dateMatch) {
      metadata.date = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`
    }

    const mcTotalMatch = joined.match(/선택형\s*([\d,.]+)\s*점/)
    if (mcTotalMatch) metadata.multipleChoiceTotal = parseNumber(mcTotalMatch[1])

    const subjectiveTotalMatch = joined.match(/(?:서답형|단답형|서술형|주관식)\s*([\d,.]+)\s*점/)
    if (subjectiveTotalMatch) metadata.shortAnswerTotal = parseNumber(subjectiveTotalMatch[1])
  }

  return metadata
}

export function createExamInfo(metadata: ExamInfoMetadata): ExamInfo {
  return {
    subject: metadata.subject ?? UNKNOWN_SUBJECT,
    year: metadata.year ?? 0,
    semester: metadata.semester ?? 0,
    examNumber: metadata.examNumber ?? 0,
    grade: metadata.grade ?? 0,
    date: metadata.date ?? '',
    totalQuestions: 0,
    multipleChoiceCount: 0,
    shortAnswerCount: 0,
    multipleChoiceTotal: metadata.multipleChoiceTotal ?? 0,
    shortAnswerTotal: metadata.shortAnswerTotal ?? 0,
  }
}

export function mergeExamInfoMetadata(examInfo: ExamInfo, metadata?: ExamInfoMetadata): ExamInfo {
  if (!metadata) return examInfo

  return {
    ...examInfo,
    subject: isMissingString(examInfo.subject) ? (metadata.subject ?? examInfo.subject) : examInfo.subject,
    year: isMissingNumber(examInfo.year) ? (metadata.year ?? examInfo.year) : examInfo.year,
    semester: isMissingNumber(examInfo.semester) ? (metadata.semester ?? examInfo.semester) : examInfo.semester,
    examNumber: isMissingNumber(examInfo.examNumber) ? (metadata.examNumber ?? examInfo.examNumber) : examInfo.examNumber,
    grade: isMissingNumber(examInfo.grade) ? (metadata.grade ?? examInfo.grade) : examInfo.grade,
    date: isMissingString(examInfo.date) ? (metadata.date ?? examInfo.date) : examInfo.date,
    multipleChoiceTotal: isMissingNumber(examInfo.multipleChoiceTotal)
      ? (metadata.multipleChoiceTotal ?? examInfo.multipleChoiceTotal)
      : examInfo.multipleChoiceTotal,
    shortAnswerTotal: isMissingNumber(examInfo.shortAnswerTotal)
      ? (metadata.shortAnswerTotal ?? examInfo.shortAnswerTotal)
      : examInfo.shortAnswerTotal,
  }
}

export function metadataValueEquals(
  key: keyof ExamInfoMetadata,
  a: NonNullable<ExamInfoMetadata[keyof ExamInfoMetadata]>,
  b: NonNullable<ExamInfoMetadata[keyof ExamInfoMetadata]>,
) {
  if (key === 'subject') return normalizeSubject(String(a)) === normalizeSubject(String(b))
  if (typeof a === 'number' || typeof b === 'number') return Math.abs(Number(a) - Number(b)) < 0.000001
  return String(a).trim() === String(b).trim()
}

export function formatMetadataLabel(key: keyof ExamInfoMetadata) {
  const labels: Record<keyof ExamInfoMetadata, string> = {
    subject: '과목',
    year: '학년도',
    semester: '학기',
    examNumber: '고사 차수',
    grade: '학년',
    date: '고사일자',
    multipleChoiceTotal: '선택형 총점',
    shortAnswerTotal: '서답형 총점',
  }
  return labels[key]
}

function extractSubject(lines: string[][]): string | null {
  for (const cells of lines) {
    const joined = cells.join(' ')
    const trailingSubjectLabelMatch = joined.match(/^(.+?)\s*과목\s*$/)
    if (trailingSubjectLabelMatch && !joined.includes('코드')) {
      const subjectBeforeLabel = cleanSubjectCandidate(trailingSubjectLabelMatch[1])
      if (subjectBeforeLabel) return subjectBeforeLabel
    }

    const parenSubjectMatch = joined.match(/\(\s*([가-힣A-Za-z][^)]*?)\s*(?:\(\s*\d+\s*\))?\s*\)\s*과목/)
    const subject = cleanSubjectCandidate(parenSubjectMatch?.[1] ?? '')
    if (subject) return subject
  }

  for (const cells of lines) {
    const joined = cells.join(' ')
    const subjectMatch = joined.match(/(?:^|\s)[가-힣A-Za-z]+\s*[:：]\s*([가-힣A-Za-z][가-힣A-Za-z\s]*)(?:\(\s*\d+\s*\))?/)
    const subject = cleanSubjectCandidate(subjectMatch?.[1] ?? '')
    if (subject) return subject
  }

  for (const cells of lines) {
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]
      if (cell.includes('코드')) continue

      const inlineLabelMatch = cell.match(/(?:과목명|교과목|과목|교과)\s*[:：]?\s*([가-힣A-Za-z][가-힣A-Za-z0-9\s()_-]*)/)
      const inlineSubject = cleanSubjectCandidate(inlineLabelMatch?.[1] ?? '')
      if (inlineSubject) return inlineSubject

      if (/^(?:과목명|교과목|과목|교과)$/.test(cell)) {
        const nextSubject = cleanSubjectCandidate(cells[i + 1] ?? '')
        if (nextSubject) return nextSubject
      }
    }
  }

  return null
}

function cleanSubjectCandidate(raw: string) {
  let value = raw.trim()
  if (!value) return ''

  if (value.includes(':') || value.includes('：')) {
    value = value.split(/[:：]/).pop() ?? value
  }

  value = value
    .replace(/\(\s*\d+\s*\)/g, '')
    .replace(/\(\s*\d+\s*$/g, '')
    .replace(/[()]/g, ' ')
    .replace(/\b(?:과목명|교과목|과목|교과)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!value || value.includes('코드') || value.includes('학년도') || value.includes('고사')) return ''
  if (/^[\d.\s-]+$/.test(value)) return ''

  return value
}

function normalizeSubject(subject: string) {
  return cleanSubjectCandidate(subject).replace(/\s+/g, '')
}

function parseNumber(value: string) {
  const n = parseFloat(value.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

function isMissingString(value: string) {
  return value.trim() === '' || value.trim() === UNKNOWN_SUBJECT
}

function isMissingNumber(value: number) {
  return !Number.isFinite(value) || value <= 0
}
