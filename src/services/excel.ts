import * as XLSX from 'xlsx'

export interface ExcelWorkbookData {
  sheetNames: string[]
  rowsBySheet: Record<string, string[][]>
}

export async function readExcelWorkbook(file: File): Promise<ExcelWorkbookData> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })

  const rowsBySheet: Record<string, string[][]> = {}
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
      header: 1,
      blankrows: false,
      defval: '',
      raw: false,
    })
    rowsBySheet[sheetName] = rows.map(row => row.map(cell => String(cell ?? '').trim()))
  }

  return {
    sheetNames: wb.SheetNames,
    rowsBySheet,
  }
}

/**
 * 파일에서 첫 번째(또는 이름 기반 자동 선택) 시트의 rows를 바로 반환합니다.
 * 시트 선택 UI 없이 파일 하나 = 데이터 하나로 쓸 때 사용합니다.
 */
export async function readExcelRows(
  file: File,
  preferPattern?: RegExp,
): Promise<{ rows: string[][]; sheetName: string }> {
  const wb = await readExcelWorkbook(file)
  const { sheetNames, rowsBySheet } = wb

  // 이름 패턴 우선 → 없으면 첫 번째 시트
  const sheetName =
    (preferPattern && sheetNames.find(n => preferPattern.test(n))) ??
    sheetNames[0] ??
    ''

  return { rows: rowsBySheet[sheetName] ?? [], sheetName }
}
