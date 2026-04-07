import { supabase } from '@/lib/supabase'

const MINTLIFY_BASE_URL = 'https://fieldpulse.mintlify.app'
const MAX_CONTEXT_CHARS = 2000 // ~500 tokens

// ── Search interface ─────────────────────────────────────────────────────────

interface MintlifySearchResult {
  title?: string
  content?: string
  description?: string
  section?: string
}

/**
 * Search FieldPulse Mintlify Help Center for grading context.
 * Returns concatenated top results, capped at ~500 tokens.
 * Gracefully returns empty string on any failure.
 */
export async function searchFieldPulseDocs(query: string): Promise<string> {
  try {
    const url = `${MINTLIFY_BASE_URL}/api/search?query=${encodeURIComponent(query)}`

    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000), // 5s timeout
    })

    if (!response.ok) {
      console.warn(`Mintlify search failed: ${response.status} ${response.statusText}`)
      return ''
    }

    const data = await response.json()

    // Mintlify API returns an array of results (or an object with results key)
    const results: MintlifySearchResult[] = Array.isArray(data)
      ? data
      : data?.results || data?.hits || []

    if (results.length === 0) return ''

    // Take top 2 results, extract content
    const snippets: string[] = []
    let totalChars = 0

    for (const result of results.slice(0, 2)) {
      const text = result.content || result.description || ''
      if (!text) continue

      const title = result.title || result.section || ''
      const snippet = title ? `[${title}]\n${text}` : text

      if (totalChars + snippet.length > MAX_CONTEXT_CHARS) {
        const remaining = MAX_CONTEXT_CHARS - totalChars
        if (remaining > 100) {
          snippets.push(snippet.substring(0, remaining) + '...')
        }
        break
      }

      snippets.push(snippet)
      totalChars += snippet.length
    }

    return snippets.join('\n\n')
  } catch (err) {
    console.warn('Mintlify search error:', err)
    return ''
  }
}

/**
 * Extract 2-3 key search terms from a question for Mintlify lookup.
 * Drops common quiz phrasing, keeps FieldPulse feature keywords.
 */
export function extractSearchTerms(questionText: string): string {
  // Remove common quiz framing phrases
  const cleaned = questionText
    .replace(
      /\b(what|how|where|when|why|can|does|do|is|are|will|would|could|should|describe|explain|list|name)\b/gi,
      ''
    )
    .replace(
      /\b(the|a|an|in|on|at|to|for|of|by|with|from|within|inside|into)\b/gi,
      ''
    )
    .replace(/\b(fieldpulse|field pulse|platform)\b/gi, '')
    .replace(/[?.,!'"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  // Take the most meaningful words (longest first, up to 4)
  const words = cleaned
    .split(' ')
    .filter((w) => w.length > 2)
    .sort((a, b) => b.length - a.length)
    .slice(0, 4)

  return words.join(' ')
}

/**
 * Get doc context for a question, using cached value if available.
 * Fetches from Mintlify and caches on the question record.
 */
export async function getDocContext(
  questionId: string,
  questionText: string,
  existingContext: string | null,
  existingFetchedAt: string | null
): Promise<string> {
  // Use cached context if fetched within the last 7 days
  if (existingContext && existingFetchedAt) {
    const fetchedAt = new Date(existingFetchedAt)
    const daysSince = (Date.now() - fetchedAt.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSince < 7) return existingContext
  }

  // Fetch fresh context
  const searchTerms = extractSearchTerms(questionText)
  if (!searchTerms) return ''

  const docContext = await searchFieldPulseDocs(searchTerms)

  // Cache on the question record (fire-and-forget)
  if (docContext) {
    supabase
      .from('questions')
      .update({
        doc_context: docContext,
        doc_context_fetched_at: new Date().toISOString(),
      })
      .eq('id', questionId)
      .then(({ error }) => {
        if (error) console.warn('Failed to cache doc context:', error.message)
      })
  }

  return docContext
}
