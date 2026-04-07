/**
 * Seed Script: Import questions from answer_key.json into Supabase
 *
 * Usage:
 *   npx tsx scripts/seed-questions.ts
 *
 * Requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local
 * (or pass SUPABASE_URL and SUPABASE_ANON_KEY as env vars)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { config } from 'dotenv'

// Load .env.local from project root
config({ path: resolve(__dirname, '..', '.env.local') })

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const supabaseKey =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseKey) {
  console.error(
    'Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_ prefixed) in .env.local'
  )
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// ── Types ────────────────────────────────────────────────────────────────────

interface AnswerKeyQuestion {
  col: number
  section: string
  question: string
  answer: string
  type: string
  correct_answer?: string
  key_points: string[]
}

interface AnswerKeyData {
  questions: AnswerKeyQuestion[]
}

interface GradingResult {
  email: string
  name: string
  timestamp: string
  grades: {
    col: number
    section: string
    question: string
    answer_key: string
    key_points: string[]
    student_response: string | null
    grade: 'correct' | 'wrong' | 'clarify'
    comment: string
    confidence: string
  }[]
}

interface FewShotExample {
  response: string
  explanation: string
}

// ── Question type mapping ────────────────────────────────────────────────────

const VALID_TYPES = ['yes_no', 'short', 'long', 'list', 'screenshot'] as const
type QuestionType = (typeof VALID_TYPES)[number]

function mapQuestionType(rawType: string): QuestionType {
  switch (rawType) {
    case 'yes_no':
      return 'yes_no'
    case 'short':
      return 'short'
    case 'long':
      return 'long'
    case 'list':
      return 'list'
    case 'screenshot':
      return 'screenshot'
    case 'no_answer':
    case 'ignore':
      return 'short' // fallback type for unscored questions
    default:
      return 'short'
  }
}

function isUnscored(rawType: string): boolean {
  return ['no_answer', 'screenshot', 'ignore'].includes(rawType)
}

// ── Few-shot example generation ──────────────────────────────────────────────

function buildFewShotExamples(
  question: AnswerKeyQuestion,
  gradingData: GradingResult[]
): { good: FewShotExample[]; bad: FewShotExample[] } {
  const good: FewShotExample[] = []
  const bad: FewShotExample[] = []

  // For yes/no questions, generate synthetic examples
  if (question.type === 'yes_no') {
    const correctAnswer = question.correct_answer || 'Yes'
    const wrongAnswer =
      correctAnswer.toLowerCase() === 'yes' ? 'No' : 'Yes'

    good.push({
      response: correctAnswer,
      explanation: `Correct. The answer is "${correctAnswer}". ${question.key_points.length > 1 ? question.key_points.slice(1).join('. ') + '.' : ''}`.trim(),
    })
    bad.push({
      response: wrongAnswer,
      explanation: `Incorrect. The answer is "${correctAnswer}", not "${wrongAnswer}". ${question.key_points.length > 1 ? question.key_points.slice(1).join('. ') + '.' : ''}`.trim(),
    })
    return { good, bad }
  }

  // For list questions, generate synthetic good (all items) and bad (partial) examples
  if (question.type === 'list') {
    good.push({
      response: question.key_points.join(', '),
      explanation: `Lists all ${question.key_points.length} items correctly: ${question.key_points.join(', ')}.`,
    })
    const halfPoints = question.key_points.slice(
      0,
      Math.ceil(question.key_points.length / 2)
    )
    const missingPoints = question.key_points.slice(halfPoints.length)
    bad.push({
      response: halfPoints.join(', '),
      explanation: `Incomplete. Only lists ${halfPoints.length} of ${question.key_points.length} items. Missing: ${missingPoints.join(', ')}.`,
    })
  }

  // For short/long questions, mine real examples from grading data
  if (question.type === 'short' || question.type === 'long' || question.type === 'list') {
    for (const student of gradingData) {
      const grade = student.grades.find((g) => g.col === question.col)
      if (!grade || !grade.student_response) continue

      if (
        grade.grade === 'correct' &&
        grade.confidence === 'high' &&
        good.length < 2
      ) {
        good.push({
          response: grade.student_response.substring(0, 500),
          explanation: `Correct. ${grade.comment || 'Covers all key points from the answer key.'}`,
        })
      }

      if (grade.grade === 'wrong' && bad.length < 2) {
        bad.push({
          response: grade.student_response.substring(0, 500),
          explanation: `Incorrect. ${grade.comment || 'Missing key concepts from the answer key.'}`,
        })
      }

      if (good.length >= 2 && bad.length >= 2) break
    }

    // If we found no "wrong" examples, check for "clarify" with low confidence
    if (bad.length === 0) {
      for (const student of gradingData) {
        const grade = student.grades.find((g) => g.col === question.col)
        if (!grade || !grade.student_response) continue

        if (grade.grade === 'clarify' && grade.comment && bad.length < 1) {
          bad.push({
            response: grade.student_response.substring(0, 500),
            explanation: `Borderline. ${grade.comment}`,
          })
        }
        if (bad.length >= 1) break
      }
    }
  }

  return { good, bad }
}

// ── Main seed function ───────────────────────────────────────────────────────

async function seed() {
  console.log('Loading data files...')

  const answerKeyPath = resolve(__dirname, 'answer_key.json')
  const gradingDataPath = resolve(__dirname, 'grading_results.json')

  const answerKey: AnswerKeyData = JSON.parse(
    readFileSync(answerKeyPath, 'utf-8')
  )
  const gradingData: GradingResult[] = JSON.parse(
    readFileSync(gradingDataPath, 'utf-8')
  )

  console.log(`Loaded ${answerKey.questions.length} questions from answer key`)
  console.log(`Loaded ${gradingData.length} student grading results for few-shot mining`)

  // Step 1: Create the quiz round
  console.log('\nCreating quiz round...')
  const { data: round, error: roundError } = await supabase
    .from('quiz_rounds')
    .insert({
      name: 'Q2 2026 Sales Certification - Platform Knowledge',
      description:
        'FieldPulse sales team certification quiz covering platform knowledge across User Roles, Customer Management, ClearPath, Scheduling, QuickBooks, and more.',
      is_active: true,
    })
    .select()
    .single()

  if (roundError) {
    console.error('Failed to create quiz round:', roundError.message)
    process.exit(1)
  }

  console.log(`  Created round: "${round.name}" (${round.id})`)

  // Step 2: Build and insert all questions
  console.log('\nSeeding questions...')

  const questionRows = answerKey.questions.map((q, index) => {
    const { good, bad } = buildFewShotExamples(q, gradingData)

    return {
      round_id: round.id,
      question_number: index + 1,
      section: q.section,
      question_text: q.question,
      answer_key: q.answer,
      key_points: q.key_points,
      question_type: mapQuestionType(q.type),
      is_scored: !isUnscored(q.type),
      few_shot_good: good,
      few_shot_bad: bad,
    }
  })

  // Insert in batches of 50 (Supabase has row limits)
  const BATCH_SIZE = 50
  let insertedCount = 0
  let fewShotGoodCount = 0
  let fewShotBadCount = 0

  for (let i = 0; i < questionRows.length; i += BATCH_SIZE) {
    const batch = questionRows.slice(i, i + BATCH_SIZE)
    const { error: insertError } = await supabase
      .from('questions')
      .insert(batch)

    if (insertError) {
      console.error(
        `Failed to insert batch ${i / BATCH_SIZE + 1}:`,
        insertError.message
      )
      process.exit(1)
    }

    insertedCount += batch.length
    batch.forEach((q) => {
      fewShotGoodCount += (q.few_shot_good as FewShotExample[]).length
      fewShotBadCount += (q.few_shot_bad as FewShotExample[]).length
    })
  }

  // Step 3: Summary
  const scoredCount = questionRows.filter((q) => q.is_scored).length
  const unscoredCount = questionRows.filter((q) => !q.is_scored).length
  const sections = [...new Set(questionRows.map((q) => q.section))]
  const typeBreakdown: Record<string, number> = {}
  questionRows.forEach((q) => {
    typeBreakdown[q.question_type] =
      (typeBreakdown[q.question_type] || 0) + 1
  })

  console.log(`\n=== Seed Complete ===`)
  console.log(`Round: ${round.name}`)
  console.log(`Round ID: ${round.id}`)
  console.log(`Questions inserted: ${insertedCount}`)
  console.log(`  Scored: ${scoredCount}`)
  console.log(`  Unscored (skipped): ${unscoredCount}`)
  console.log(`  Sections: ${sections.length}`)
  console.log(`  Few-shot good examples: ${fewShotGoodCount}`)
  console.log(`  Few-shot bad examples: ${fewShotBadCount}`)
  console.log(`\nType breakdown:`)
  Object.entries(typeBreakdown)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`)
    })
  console.log(`\nSections:`)
  sections.forEach((s) => console.log(`  - ${s}`))
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
