import { supabase } from '@/lib/supabase'
// import { getDocContext } from '@/lib/mintlify' // Disabled — CORS issue, re-enable with Edge Function
import type { Question, AIGradeResult } from '@/lib/types'

// ── Constants ────────────────────────────────────────────────────────────────

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const RATE_LIMIT_DELAY_MS = 150

// ── System prompt (exact from spec) ──────────────────────────────────────────

const SYSTEM_PROMPT = `You are a grading assistant for FieldPulse's sales certification quiz. Your job is to evaluate a sales team member's response to a quiz question by comparing it against the official answer key.

GRADING CRITERIA:
- Focus on whether the student demonstrates understanding of the correct concepts
- Exact wording is NOT required – paraphrasing and synonyms are acceptable
- For yes/no questions: The yes/no must be correct. Additional context is a bonus but not required for correctness.
- For list questions: Student should cover at least 70% of the key items
- For short answer questions: Student should hit the major key points
- For long answer questions: Student should demonstrate understanding of the core concepts, even if they miss minor details

CONFIDENCE SCORING:
- 85-100: High confidence – you are very sure of your grade
- 60-84: Medium confidence – the answer is borderline or you're uncertain
- 0-59: Low confidence – significant ambiguity, needs human review

OUTPUT FORMAT (respond with ONLY this JSON, no other text):
{
  "grade": "correct" | "incorrect" | "clarify",
  "confidence": <number 0-100>,
  "reasoning": "<brief explanation of why you graded this way, noting what the student got right and what they missed>"
}`

// ── Prompt builder ───────────────────────────────────────────────────────────

interface PromptParts {
  system: string
  user: string
}

export function buildGradingPrompt(
  question: Question,
  rawResponse: string,
  docContext?: string
): PromptParts {
  const parts: string[] = []

  // Question
  parts.push(`QUESTION: ${question.question_text}`)

  // Answer key
  parts.push(`\nOFFICIAL ANSWER KEY:\n${question.answer_key}`)

  // Key points
  if (question.key_points.length > 0) {
    const bullets = question.key_points.map((kp) => `- ${kp}`).join('\n')
    parts.push(`\nKEY POINTS TO CHECK FOR:\n${bullets}`)
  }

  // Few-shot good examples
  if (question.few_shot_good.length > 0) {
    parts.push('\nEXAMPLES OF GOOD ANSWERS:')
    for (const ex of question.few_shot_good) {
      parts.push(`Response: "${ex.response}"\nExplanation: ${ex.explanation}`)
    }
  }

  // Few-shot bad examples
  if (question.few_shot_bad.length > 0) {
    parts.push('\nEXAMPLES OF BAD ANSWERS:')
    for (const ex of question.few_shot_bad) {
      parts.push(`Response: "${ex.response}"\nExplanation: ${ex.explanation}`)
    }
  }

  // Doc context
  if (docContext) {
    parts.push(
      `\nADDITIONAL CONTEXT FROM FIELDPULSE DOCUMENTATION:\n${docContext}`
    )
  }

  // Student response
  parts.push(`\nSTUDENT'S RESPONSE:\n${rawResponse}`)
  parts.push('\nGrade this response.')

  return {
    system: SYSTEM_PROMPT,
    user: parts.join('\n'),
  }
}

// ── OpenRouter API call ──────────────────────────────────────────────────────

async function callOpenRouter(
  system: string,
  user: string,
  model: string,
  apiKey: string
): Promise<AIGradeResult> {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    const errBody = await response.text().catch(() => '')
    throw new Error(
      `OpenRouter API error ${response.status}: ${errBody.substring(0, 200)}`
    )
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content

  if (!content) {
    throw new Error('OpenRouter returned empty response')
  }

  // Parse the JSON from the AI response
  let parsed: AIGradeResult
  try {
    const cleaned = content
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim()
    parsed = JSON.parse(cleaned)
  } catch {
    // Retry once — AI occasionally returns prose instead of JSON
    console.warn('JSON parse failed, retrying OpenRouter call...')
    const retryResponse = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
      }),
    })

    if (!retryResponse.ok) {
      throw new Error(`OpenRouter retry failed with status ${retryResponse.status}`)
    }

    const retryData = await retryResponse.json()
    const retryContent = retryData?.choices?.[0]?.message?.content
    if (!retryContent) {
      throw new Error('OpenRouter retry returned empty response')
    }

    try {
      const retryCleaned = retryContent
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim()
      parsed = JSON.parse(retryCleaned)
    } catch {
      throw new Error(`Failed to parse AI response after retry: ${retryContent.substring(0, 200)}`)
    }
  }

  // Validate
  if (!['correct', 'incorrect', 'clarify'].includes(parsed.grade)) {
    throw new Error(`Invalid grade value from AI: "${parsed.grade}"`)
  }
  if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 100) {
    parsed.confidence = 50 // fallback
  }
  if (typeof parsed.reasoning !== 'string') {
    parsed.reasoning = ''
  }

  return parsed
}

// ── Confidence threshold application ─────────────────────────────────────────

interface ThresholdConfig {
  auto_correct: number
  clarify_min: number
  flag_below: number
}

function applyThresholds(
  result: AIGradeResult,
  thresholds: ThresholdConfig
): { grade: string; reasoning: string } {
  if (result.confidence >= thresholds.auto_correct) {
    // High confidence: use AI grade as-is
    return { grade: result.grade, reasoning: result.reasoning }
  }

  if (result.confidence >= thresholds.clarify_min) {
    // Medium confidence: force to clarify
    return {
      grade: 'clarify',
      reasoning: `[Medium confidence – needs review] ${result.reasoning}`,
    }
  }

  // Low confidence: force to clarify, flag for manual review
  return {
    grade: 'clarify',
    reasoning: `[Low confidence – flagged for manual review] ${result.reasoning}`,
  }
}

// ── Get grading config from Supabase ─────────────────────────────────────────

async function getGradingConfig(): Promise<{
  model: string
  thresholds: ThresholdConfig
}> {
  const { data: configRows } = await supabase
    .from('grading_config')
    .select('key, value')
    .in('key', ['default_model', 'confidence_thresholds'])

  const configMap: Record<string, unknown> = {}
  for (const row of configRows || []) {
    configMap[row.key] = row.value
  }

  return {
    model: (configMap.default_model as string) || 'anthropic/claude-3.5-haiku',
    thresholds: (configMap.confidence_thresholds as ThresholdConfig) || {
      auto_correct: 85,
      clarify_min: 60,
      flag_below: 60,
    },
  }
}

// ── Grade a single response ──────────────────────────────────────────────────

export interface GradeResponseResult {
  responseId: string
  grade: string
  confidence: number
  reasoning: string
  skipped: boolean
  error?: string
}

export async function gradeResponse(
  responseId: string,
  modelOverride?: string
): Promise<GradeResponseResult> {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY
  if (!apiKey) {
    return {
      responseId,
      grade: 'pending',
      confidence: 0,
      reasoning: '',
      skipped: false,
      error: 'Missing VITE_OPENROUTER_API_KEY in .env.local',
    }
  }

  // Fetch response + question
  const { data: resp, error: respErr } = await supabase
    .from('responses')
    .select('*, questions(*)')
    .eq('id', responseId)
    .single()

  if (respErr || !resp) {
    return {
      responseId,
      grade: 'pending',
      confidence: 0,
      reasoning: '',
      skipped: false,
      error: `Failed to fetch response: ${respErr?.message || 'Not found'}`,
    }
  }

  const question = resp.questions as Question

  // If not scored, mark as skipped
  if (!question.is_scored) {
    await supabase
      .from('responses')
      .update({
        grade: 'skipped',
        graded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', responseId)

    return {
      responseId,
      grade: 'skipped',
      confidence: 100,
      reasoning: 'Question is not scored.',
      skipped: true,
    }
  }

  // If no student response, mark as incorrect
  if (!resp.raw_response || resp.raw_response.trim() === '') {
    await supabase
      .from('responses')
      .update({
        grade: 'incorrect',
        confidence: 100,
        ai_reasoning: 'No response provided by the student.',
        graded_at: new Date().toISOString(),
        model_used: 'system',
        needs_rescore: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', responseId)

    return {
      responseId,
      grade: 'incorrect',
      confidence: 100,
      reasoning: 'No response provided by the student.',
      skipped: false,
    }
  }

  // Get config
  const config = await getGradingConfig()
  const model = modelOverride || config.model

  // Doc context disabled — Mintlify API fails with CORS from the browser.
  // Re-enable once moved to a Supabase Edge Function.
  const docContext = ''

  // Build prompt
  const prompt = buildGradingPrompt(question, resp.raw_response, docContext || undefined)

  // Call OpenRouter
  try {
    const aiResult = await callOpenRouter(prompt.system, prompt.user, model, apiKey)

    // Apply thresholds
    const adjusted = applyThresholds(aiResult, config.thresholds)

    // Update response in DB
    await supabase
      .from('responses')
      .update({
        grade: adjusted.grade,
        confidence: aiResult.confidence,
        ai_reasoning: adjusted.reasoning,
        graded_at: new Date().toISOString(),
        model_used: model,
        needs_rescore: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', responseId)

    return {
      responseId,
      grade: adjusted.grade,
      confidence: aiResult.confidence,
      reasoning: adjusted.reasoning,
      skipped: false,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown grading error'
    console.error(`Grading error for response ${responseId}:`, errorMsg)

    // Write error to DB so it's visible in the UI instead of silently staying pending
    await supabase
      .from('responses')
      .update({
        grade: 'clarify',
        confidence: 0,
        ai_reasoning: `[Grading error — needs manual review] ${errorMsg}`,
        graded_at: new Date().toISOString(),
        model_used: 'system',
        needs_rescore: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', responseId)

    return {
      responseId,
      grade: 'clarify',
      confidence: 0,
      reasoning: `[Grading error] ${errorMsg}`,
      skipped: false,
      error: errorMsg,
    }
  }
}

// ── Batch grading ────────────────────────────────────────────────────────────

export interface BatchGradeProgress {
  total: number
  completed: number
  correct: number
  incorrect: number
  clarify: number
  skipped: number
  errors: number
  currentQuestion: string
}

export interface BatchGradeOptions {
  roundId: string
  submissionId?: string
  questionId?: string
  modelOverride?: string
  onProgress?: (progress: BatchGradeProgress) => void
  signal?: AbortSignal
}

export async function batchGrade(options: BatchGradeOptions): Promise<BatchGradeProgress> {
  const { roundId, submissionId, questionId, modelOverride, onProgress, signal } = options

  // Step 1: Get submission IDs for this round (avoids complex inner join filters)
  let subIds: string[] = []

  if (submissionId) {
    subIds = [submissionId]
  } else {
    const { data: subs, error: subErr } = await supabase
      .from('submissions')
      .select('id')
      .eq('round_id', roundId)
      .limit(10000)

    if (subErr) {
      console.error('Failed to fetch submissions:', subErr)
      throw new Error(`Failed to fetch submissions: ${subErr.message}`)
    }
    subIds = (subs || []).map((s) => s.id)
  }

  if (subIds.length === 0) {
    console.warn('No submissions found for round', roundId)
    return { total: 0, completed: 0, correct: 0, incorrect: 0, clarify: 0, skipped: 0, errors: 0, currentQuestion: '' }
  }

  // Step 2: Get pending/rescore responses for those submissions
  let query = supabase
    .from('responses')
    .select('id, question_id, questions(question_text)')
    .in('submission_id', subIds)
    .or('grade.eq.pending,needs_rescore.eq.true')
    .limit(10000)

  if (questionId) {
    query = query.eq('question_id', questionId)
  }

  const { data: responses, error: fetchErr } = await query

  if (fetchErr) {
    console.error('Failed to fetch responses to grade:', fetchErr)
    throw new Error(`Failed to fetch responses to grade: ${fetchErr.message}`)
  }

  console.log(`batchGrade: found ${responses?.length ?? 0} responses to grade for ${subIds.length} submissions`)

  if (!responses || responses.length === 0) {
    return {
      total: 0,
      completed: 0,
      correct: 0,
      incorrect: 0,
      clarify: 0,
      skipped: 0,
      errors: 0,
      currentQuestion: '',
    }
  }

  const progress: BatchGradeProgress = {
    total: responses.length,
    completed: 0,
    correct: 0,
    incorrect: 0,
    clarify: 0,
    skipped: 0,
    errors: 0,
    currentQuestion: '',
  }

  for (const resp of responses) {
    // Check for cancellation
    if (signal?.aborted) break

    const questionText =
      (resp.questions as unknown as { question_text: string })?.question_text || ''
    progress.currentQuestion =
      questionText.length > 60
        ? questionText.substring(0, 60) + '...'
        : questionText
    onProgress?.(structuredClone(progress))

    const result = await gradeResponse(resp.id, modelOverride)

    progress.completed++
    if (result.error) {
      progress.errors++
    } else if (result.skipped) {
      progress.skipped++
    } else {
      switch (result.grade) {
        case 'correct':
          progress.correct++
          break
        case 'incorrect':
          progress.incorrect++
          break
        case 'clarify':
          progress.clarify++
          break
      }
    }

    onProgress?.(structuredClone(progress))

    // Rate limit delay
    if (!signal?.aborted) {
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS))
    }
  }

  return progress
}
