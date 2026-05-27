import type {
  SubjectiveIrtCategorySpec,
  SubjectiveIrtData,
  SubjectiveIrtItemSpec,
  SubjectiveIrtStudentScore,
} from '../types'
import type { ExcelWorkbookData } from '../services/excel'

type HeaderMap = Record<string, number>

export function parseSubjectiveIrtWorkbook(workbook: ExcelWorkbookData, fileName: string): SubjectiveIrtData {
  const warnings: string[] = []
  const itemRows = getRequiredSheet(workbook, /문항.*루브릭|item/i)
  const scoreRows = getRequiredSheet(workbook, /학생.*문항점수|score/i)
  const categoryRows = getRequiredSheet(workbook, /범주.*채점기준|category/i)

  const items = parseItemSpecs(itemRows, warnings)
  const categories = parseCategorySpecs(categoryRows, warnings)
  const students = parseStudentScores(scoreRows, items, warnings)

  validateStructure(items, categories, students, warnings)

  return {
    fileName,
    items,
    categories,
    students,
    warnings,
  }
}

function getRequiredSheet(workbook: ExcelWorkbookData, pattern: RegExp): string[][] {
  const sheetName = workbook.sheetNames.find(name => pattern.test(name))
  if (!sheetName) {
    throw new Error(`서답형 IRT 파일에서 '${pattern.source}'에 해당하는 시트를 찾지 못했습니다.`)
  }
  return workbook.rowsBySheet[sheetName] ?? []
}

function parseItemSpecs(rows: string[][], warnings: string[]): SubjectiveIrtItemSpec[] {
  const headerIdx = findHeaderRow(rows, ['item_id', 'max_score'])
  if (headerIdx === -1) throw new Error('문항_루브릭 시트에서 item_id/max_score 헤더를 찾지 못했습니다.')
  const header = buildHeaderMap(rows[headerIdx])
  const items: SubjectiveIrtItemSpec[] = []

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    const itemId = cell(row, header, 'item_id')
    if (!itemId) continue

    const maxScore = parseNumber(cell(row, header, 'max_score'))
    if (maxScore === null || maxScore <= 0) {
      warnings.push(`${itemId}: max_score가 없거나 0 이하라 제외될 수 있습니다.`)
    }

    const categoryValues = parseNumberList(cell(row, header, 'category_values'))
    const fallbackMax = maxScore ?? Math.max(...categoryValues, 0)
    const categories = categoryValues.length > 0
      ? uniqueSorted(categoryValues)
      : Array.from({ length: Math.max(0, Math.floor(fallbackMax)) + 1 }, (_, index) => index)

    items.push({
      itemId,
      itemType: parseItemType(cell(row, header, 'item_type')),
      contentArea: cell(row, header, 'content_area'),
      achievementStandard: cell(row, header, 'achievement_standard'),
      maxScore: fallbackMax,
      categoryValues: categories,
      orderedCategories: parseBoolean(cell(row, header, 'ordered_categories'), true),
      modelHint: cell(row, header, 'model_hint') || 'PCM',
      includeInIrt: parseBoolean(cell(row, header, 'include_in_irt'), true),
      notes: cell(row, header, 'notes'),
    })
  }

  if (items.length === 0) throw new Error('문항_루브릭 시트에서 문항 정보를 찾지 못했습니다.')
  return items
}

function parseStudentScores(
  rows: string[][],
  items: SubjectiveIrtItemSpec[],
  warnings: string[],
): SubjectiveIrtStudentScore[] {
  const headerIdx = findHeaderRow(rows, ['student_id'])
  if (headerIdx === -1) throw new Error('학생_문항점수 시트에서 student_id 헤더를 찾지 못했습니다.')
  const headerRow = rows[headerIdx]
  const header = buildHeaderMap(headerRow)
  const itemIds = new Set(items.map(item => item.itemId))
  const itemColumns = headerRow
    .map((name, index) => ({ name: String(name ?? '').trim(), index }))
    .filter(col => itemIds.has(col.name))

  if (itemColumns.length === 0) {
    throw new Error('학생_문항점수 시트에서 문항_루브릭의 item_id와 일치하는 점수 열을 찾지 못했습니다.')
  }

  const students: SubjectiveIrtStudentScore[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    const studentId = cell(row, header, 'student_id')
    if (!studentId) continue

    const scores: Record<string, number | null> = {}
    for (const col of itemColumns) {
      const raw = String(row[col.index] ?? '').trim()
      scores[col.name] = raw === '' ? null : parseNumber(raw)
      if (raw !== '' && scores[col.name] === null) {
        warnings.push(`${studentId} ${col.name}: 숫자가 아닌 점수 '${raw}'는 결측으로 처리됩니다.`)
      }
    }

    students.push({
      studentId,
      classNum: cell(row, header, 'class'),
      seatNum: cell(row, header, 'seat'),
      name: cell(row, header, 'name') || studentId,
      scores,
    })
  }

  if (students.length === 0) throw new Error('학생_문항점수 시트에서 학생 데이터를 찾지 못했습니다.')
  return students
}

function parseCategorySpecs(rows: string[][], warnings: string[]): SubjectiveIrtCategorySpec[] {
  const headerIdx = findHeaderRow(rows, ['item_id', 'category_score'])
  if (headerIdx === -1) {
    warnings.push('범주_채점기준 시트에서 category_score 헤더를 찾지 못했습니다.')
    return []
  }
  const header = buildHeaderMap(rows[headerIdx])
  const categories: SubjectiveIrtCategorySpec[] = []

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    const itemId = cell(row, header, 'item_id')
    if (!itemId) continue
    const categoryScore = parseNumber(cell(row, header, 'category_score'))
    if (categoryScore === null) {
      warnings.push(`${itemId}: category_score가 숫자가 아니라 범주 설명에서 제외했습니다.`)
      continue
    }

    categories.push({
      itemId,
      categoryScore,
      categoryLabel: cell(row, header, 'category_label'),
      rubricDescription: cell(row, header, 'rubric_description'),
      orderedStep: parseNumber(cell(row, header, 'ordered_step')) ?? categoryScore + 1,
      interpretationNote: cell(row, header, 'interpretation_note'),
    })
  }

  return categories
}

function validateStructure(
  items: SubjectiveIrtItemSpec[],
  categories: SubjectiveIrtCategorySpec[],
  students: SubjectiveIrtStudentScore[],
  warnings: string[],
) {
  const categoryByItem = new Map<string, Set<number>>()
  for (const category of categories) {
    const set = categoryByItem.get(category.itemId) ?? new Set<number>()
    set.add(category.categoryScore)
    categoryByItem.set(category.itemId, set)
  }

  for (const item of items) {
    const categorySet = categoryByItem.get(item.itemId)
    if (!categorySet || categorySet.size === 0) {
      warnings.push(`${item.itemId}: 범주_채점기준에 점수 범주 설명이 없습니다.`)
    }
    for (const student of students) {
      const score = student.scores[item.itemId]
      if (score === null || score === undefined) continue
      if (score < 0 || score > item.maxScore) {
        warnings.push(`${student.studentId} ${item.itemId}: 점수 ${score}가 허용 범위 0~${item.maxScore}를 벗어났습니다.`)
      }
      if (!item.categoryValues.includes(score)) {
        warnings.push(`${student.studentId} ${item.itemId}: 점수 ${score}가 category_values에 없습니다.`)
      }
    }
  }
}

function findHeaderRow(rows: string[][], required: string[]): number {
  return rows.findIndex(row => {
    const normalized = row.map(normalizeHeader)
    return required.every(key => normalized.includes(key))
  })
}

function buildHeaderMap(row: string[]): HeaderMap {
  const map: HeaderMap = {}
  row.forEach((value, index) => {
    const key = normalizeHeader(value)
    if (key && map[key] === undefined) map[key] = index
  })
  return map
}

function normalizeHeader(value: string): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_')
}

function cell(row: string[], header: HeaderMap, key: string): string {
  const index = header[key]
  if (index === undefined) return ''
  return String(row[index] ?? '').trim()
}

function parseNumber(value: string): number | null {
  const normalized = String(value ?? '').trim().replace(',', '.')
  if (!normalized) return null
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

function parseNumberList(value: string): number[] {
  return String(value ?? '')
    .split(/[,\s/|]+/)
    .map(parseNumber)
    .filter((value): value is number => value !== null)
}

function uniqueSorted(values: number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b)
}

function parseBoolean(value: string, fallback: boolean): boolean {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return fallback
  return ['true', '1', 'y', 'yes', '예', '포함'].includes(normalized)
}

function parseItemType(value: string): SubjectiveIrtItemSpec['itemType'] {
  if (value.includes('단답')) return '단답형'
  if (value.includes('서술')) return '서술형'
  return '기타'
}
