import type { Question } from '@/lib/types'

// ── Types ────────────────────────────────────────────────────────────────────

export interface QuestionMatch {
  csvHeader: string
  questionId: string | null
  questionText: string | null
  questionNumber: number | null
  similarity: number
  matched: boolean
}

export interface MatchResult {
  matches: QuestionMatch[]
  matchedCount: number
  unmatchedCsvCount: number
  unmatchedDbCount: number
  unmatchedDbQuestions: Question[]
}

// ── Normalization ────────────────────────────────────────────────────────────

/** Lowercase, strip punctuation, collapse whitespace, remove common suffixes */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*(within|in)\s*(the\s+)?(fieldpulse|fp)\s*(platform|app|mobile app)?\s*/g, ' ')
    .trim()
}

/** Extract meaningful words (drop very short stopwords) */
function extractWords(text: string): Set<string> {
  const STOPWORDS = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been',
    'do', 'does', 'did', 'to', 'of', 'in', 'on', 'at', 'by',
    'for', 'and', 'or', 'but', 'if', 'it', 'its', 'as', 'we',
    'i', 'you', 'he', 'she', 'they', 'my', 'your', 'our',
    'can', 'will', 'would', 'could', 'should', 'how', 'what',
    'when', 'where', 'which', 'who', 'that', 'this', 'with',
  ])

  const words = normalize(text).split(' ')
  return new Set(words.filter((w) => w.length > 1 && !STOPWORDS.has(w)))
}

// ── Similarity scoring ───────────────────────────────────────────────────────

/**
 * Compute word overlap ratio between two texts.
 * Returns 0-1 where 1 = perfect overlap.
 *
 * Uses Jaccard-like similarity but weighted towards the shorter text
 * (since CSV headers are often truncated or extended versions of the DB question).
 */
function wordOverlapScore(textA: string, textB: string): number {
  const wordsA = extractWords(textA)
  const wordsB = extractWords(textB)

  if (wordsA.size === 0 || wordsB.size === 0) return 0

  let overlapCount = 0
  for (const word of wordsA) {
    if (wordsB.has(word)) overlapCount++
  }

  // Weight by the smaller set – this handles cases where the CSV header
  // has extra words like "within FieldPulse?" appended
  const minSize = Math.min(wordsA.size, wordsB.size)
  return overlapCount / minSize
}

/**
 * Bonus: check if one normalized string contains the other.
 * This catches cases where the DB question is a substring of the CSV header
 * or vice versa (very common with Google Forms adding context).
 */
function containsBonus(textA: string, textB: string): number {
  const normA = normalize(textA)
  const normB = normalize(textB)

  if (normA.includes(normB) || normB.includes(normA)) return 0.15
  return 0
}

function computeSimilarity(csvHeader: string, dbQuestion: string): number {
  const overlap = wordOverlapScore(csvHeader, dbQuestion)
  const bonus = containsBonus(csvHeader, dbQuestion)
  return Math.min(1, overlap + bonus)
}

// ── Main matcher ─────────────────────────────────────────────────────────────

const MATCH_THRESHOLD = 0.55

export function matchQuestions(
  csvHeaders: string[],
  dbQuestions: Question[]
): MatchResult {
  const matches: QuestionMatch[] = []
  const usedQuestionIds = new Set<string>()

  // For each CSV header, find the best matching DB question
  for (const header of csvHeaders) {
    let bestMatch: Question | null = null
    let bestScore = 0

    for (const q of dbQuestions) {
      if (usedQuestionIds.has(q.id)) continue

      const score = computeSimilarity(header, q.question_text)
      if (score > bestScore) {
        bestScore = score
        bestMatch = q
      }
    }

    if (bestMatch && bestScore >= MATCH_THRESHOLD) {
      usedQuestionIds.add(bestMatch.id)
      matches.push({
        csvHeader: header,
        questionId: bestMatch.id,
        questionText: bestMatch.question_text,
        questionNumber: bestMatch.question_number,
        similarity: Math.round(bestScore * 100),
        matched: true,
      })
    } else {
      matches.push({
        csvHeader: header,
        questionId: null,
        questionText: bestMatch?.question_text || null,
        questionNumber: null,
        similarity: Math.round(bestScore * 100),
        matched: false,
      })
    }
  }

  const matchedCount = matches.filter((m) => m.matched).length
  const unmatchedCsvCount = matches.filter((m) => !m.matched).length
  const unmatchedDbQuestions = dbQuestions.filter(
    (q) => !usedQuestionIds.has(q.id)
  )

  return {
    matches,
    matchedCount,
    unmatchedCsvCount,
    unmatchedDbCount: unmatchedDbQuestions.length,
    unmatchedDbQuestions,
  }
}
