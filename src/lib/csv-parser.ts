import Papa from 'papaparse'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ParsedCsvData {
  headers: string[]
  /** Column headers from index 2+ (question columns only, no Timestamp/Email) */
  questionHeaders: string[]
  rows: CsvStudentRow[]
  warnings: string[]
}

export interface CsvStudentRow {
  email: string
  timestamp: string | null
  /** Maps question column header -> student response (null if empty) */
  responses: Record<string, string | null>
}

// ── URL / screenshot detection ───────────────────────────────────────────────

const URL_PATTERN = /^https?:\/\//i
const DRIVE_PATTERN = /drive\.google\.com/i
const PHOTO_KEYWORDS = /attach.*photo|upload.*image|screenshot/i

function isScreenshotColumn(header: string, values: string[]): boolean {
  // Check if header suggests a screenshot/photo upload
  if (PHOTO_KEYWORDS.test(header)) return true

  // Check if most values are URLs (image uploads from Google Forms)
  const nonEmpty = values.filter((v) => v.trim().length > 0)
  if (nonEmpty.length === 0) return false

  const urlCount = nonEmpty.filter(
    (v) => URL_PATTERN.test(v.trim()) || DRIVE_PATTERN.test(v.trim())
  ).length
  return urlCount / nonEmpty.length > 0.5
}

// ── Skip columns ─────────────────────────────────────────────────────────────

const SKIP_HEADERS = ['score', 'timestamp', 'email address', 'email']

function shouldSkipHeader(header: string): boolean {
  const lower = header.toLowerCase().trim()
  return SKIP_HEADERS.includes(lower)
}

// ── Main parser ──────────────────────────────────────────────────────────────

export function parseCsvFile(file: File): Promise<ParsedCsvData> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete(results) {
        try {
          const parsed = processRawCsv(results.data as string[][])
          resolve(parsed)
        } catch (err) {
          reject(err)
        }
      },
      error(err) {
        reject(new Error(`CSV parse error: ${err.message}`))
      },
    })
  })
}

function processRawCsv(raw: string[][]): ParsedCsvData {
  const warnings: string[] = []

  if (raw.length < 2) {
    throw new Error('CSV must have a header row and at least one data row.')
  }

  const headers = raw[0].map((h) => h.trim())
  const dataRows = raw.slice(1)

  // Validate: find email column (expected at index 1)
  let emailColIndex = -1
  for (let i = 0; i < Math.min(headers.length, 5); i++) {
    if (headers[i].toLowerCase().includes('email')) {
      emailColIndex = i
      break
    }
  }

  if (emailColIndex === -1) {
    throw new Error(
      'Cannot find an "Email" column in the first 5 columns. Expected Google Forms format with Email Address in column 2.'
    )
  }

  // Determine timestamp column (expected at index 0)
  const timestampColIndex = headers[0].toLowerCase().includes('timestamp')
    ? 0
    : -1

  // Build list of question column indices (skip timestamp, email, score, screenshot cols)
  const questionColIndices: number[] = []
  const questionHeaders: string[] = []

  // Collect all values per column for screenshot detection
  const colValues: string[][] = headers.map((_, colIdx) =>
    dataRows.map((row) => (row[colIdx] || '').trim())
  )

  for (let i = 0; i < headers.length; i++) {
    if (i === emailColIndex || i === timestampColIndex) continue
    if (shouldSkipHeader(headers[i])) {
      warnings.push(`Skipping column "${headers[i]}" (non-question column)`)
      continue
    }
    if (isScreenshotColumn(headers[i], colValues[i])) {
      warnings.push(
        `Skipping column "${headers[i].substring(0, 60)}..." (screenshot/image upload)`
      )
      continue
    }
    questionColIndices.push(i)
    questionHeaders.push(headers[i])
  }

  // Parse student rows
  const rows: CsvStudentRow[] = []
  const seenEmails = new Set<string>()

  for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
    const row = dataRows[rowIdx]
    const email = (row[emailColIndex] || '').trim().toLowerCase()

    if (!email) {
      warnings.push(`Row ${rowIdx + 2}: missing email address, skipping.`)
      continue
    }

    if (!email.includes('@')) {
      warnings.push(
        `Row ${rowIdx + 2}: "${email}" doesn't look like a valid email, importing anyway.`
      )
    }

    if (seenEmails.has(email)) {
      warnings.push(
        `Row ${rowIdx + 2}: duplicate email "${email}" – only the first entry will be used.`
      )
      continue
    }
    seenEmails.add(email)

    const timestamp =
      timestampColIndex >= 0 ? (row[timestampColIndex] || '').trim() || null : null

    const responses: Record<string, string | null> = {}
    let emptyCount = 0

    for (const colIdx of questionColIndices) {
      const header = headers[colIdx]
      let value = (row[colIdx] || '').trim()

      if (!value) {
        responses[header] = null
        emptyCount++
        continue
      }

      // Truncate very long responses
      if (value.length > 5000) {
        value = value.substring(0, 5000)
        warnings.push(
          `Row ${rowIdx + 2}, "${header.substring(0, 40)}...": response truncated to 5000 chars.`
        )
      }

      responses[header] = value
    }

    if (emptyCount > questionColIndices.length * 0.5) {
      warnings.push(
        `${email}: more than half the responses are empty (${emptyCount}/${questionColIndices.length}).`
      )
    }

    rows.push({ email, timestamp, responses })
  }

  if (rows.length === 0) {
    throw new Error('No valid student rows found in the CSV.')
  }

  return {
    headers,
    questionHeaders,
    rows,
    warnings,
  }
}
