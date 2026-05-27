const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

export async function fetchSheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string,
): Promise<string[][]> {
  const url = `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`)
  }
  const data = (await res.json()) as { values?: string[][] }
  return data.values ?? []
}

export async function fetchSpreadsheetMeta(
  accessToken: string,
  spreadsheetId: string,
): Promise<{ title: string; sheets: { title: string }[] }> {
  const url = `${SHEETS_BASE}/${spreadsheetId}?fields=properties.title,sheets.properties.title`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as {
    properties: { title: string }
    sheets: { properties: { title: string } }[]
  }
  return {
    title: data.properties.title,
    sheets: data.sheets.map(s => ({ title: s.properties.title })),
  }
}
