type SupportLinkColumn = { key: string; type: string }
type SupportLinkAnswer = {
  id?: string | number
  question_id?: string | number
  question?: { is_header?: boolean; satker_lock_mode?: string }
  link?: string | null
  custom_values?: Record<string, unknown> | null
}

export function containsWebLink(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return false
  return /(?:https?:\/\/|ftp:\/\/|www\.)[^\s]+|(?:^|[^a-z0-9@])(?:[a-z0-9-]+\.)+[a-z]{2,63}(?::\d+)?(?:[/?#][^\s]*)?/i.test(value)
    || /(?:^|[^a-z0-9@])(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:[/?#][^\s]*)?/.test(value)
}

export function normalizeSupportLink(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const raw = value.trim()
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    const trackingParams = new Set(['usp', 'fbclid', 'gclid', 'mc_cid', 'mc_eid'])
    const retainedParams = [...url.searchParams.entries()]
      .filter(([key]) => !trackingParams.has(key.toLowerCase()) && !key.toLowerCase().startsWith('utm_'))
      .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue))
    const query = new URLSearchParams(retainedParams).toString()
    const pathname = url.pathname.replace(/\/+$/, '') || '/'
    return `${url.hostname.toLowerCase()}${pathname}${query ? `?${query}` : ''}`
  } catch {
    return null
  }
}

export function findDuplicateSupportLinkCells(
  answers: SupportLinkAnswer[],
  columns: SupportLinkColumn[],
  values: Record<string, any> = {},
) {
  const occurrences = new Map<string, string[]>()
  for (const answer of answers) {
    if (answer.question?.is_header || answer.question?.satker_lock_mode === 'ROW') continue
    const row = values[String(answer.id)] ?? answer
    for (const column of columns) {
      if (column.type !== 'url') continue
      const customValues = row.custom_values && typeof row.custom_values === 'object' ? row.custom_values : {}
      const value = customValues[column.key] ?? (column.key === 'link' ? row.link : undefined)
      const normalized = normalizeSupportLink(value)
      if (!normalized) continue
      const cellId = `${answer.id ?? answer.question_id}:${column.key}`
      occurrences.set(normalized, [...(occurrences.get(normalized) ?? []), cellId])
    }
  }
  return new Set([...occurrences.values()].filter((cells) => cells.length > 1).flat())
}

export function findLinksInTextCells(
  answers: SupportLinkAnswer[],
  columns: SupportLinkColumn[],
  values: Record<string, any> = {},
) {
  const invalidCells = new Set<string>()
  for (const answer of answers) {
    if (answer.question?.is_header || answer.question?.satker_lock_mode === 'ROW') continue
    const row = values[String(answer.id)] ?? answer
    const customValues = row.custom_values && typeof row.custom_values === 'object' ? row.custom_values : {}
    for (const column of columns) {
      if (!['text', 'textarea'].includes(column.type)) continue
      const value = customValues[column.key] ?? (column.key === 'catatan_string' ? row.catatan_string : undefined)
      if (!containsWebLink(value)) continue
      invalidCells.add(`${answer.id ?? answer.question_id}:${column.key}`)
    }
  }
  return invalidCells
}
