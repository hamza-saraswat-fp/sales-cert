import { supabase } from './supabase'
import { IS_DEMO, demoStudents, demoQuestions } from './mock-data'
import type { Question } from './types'

export interface QuestionAnalytics {
  question: Question
  answered: number
  correct: number
  incorrect: number
  partial: number
  clarify: number
  pending: number
  skipped: number
  scoredTotal: number
  errorPoints: number
  errorRate: number
  scorePercent: number
  avgConfidence: number | null
}

export interface RoundAnalytics {
  totalStudents: number
  totalScoredResponses: number
  overallScorePercent: number
  questions: QuestionAnalytics[]
  topMissed: QuestionAnalytics[]
  bySection: { section: string; questions: QuestionAnalytics[]; errorRate: number }[]
}

interface ResponseRowLite {
  question_id: string
  grade: string
  admin_override_grade: string | null
  confidence: number | null
}

function summarize(
  question: Question,
  rows: ResponseRowLite[]
): QuestionAnalytics {
  let correct = 0
  let incorrect = 0
  let partial = 0
  let clarify = 0
  let pending = 0
  let skipped = 0
  let confidenceSum = 0
  let confidenceN = 0

  for (const r of rows) {
    const effective = r.admin_override_grade || r.grade
    switch (effective) {
      case 'correct':
        correct++
        break
      case 'incorrect':
        incorrect++
        break
      case 'partial':
        partial++
        break
      case 'clarify':
        clarify++
        break
      case 'pending':
        pending++
        break
      case 'skipped':
        skipped++
        break
    }
    if (typeof r.confidence === 'number') {
      confidenceSum += r.confidence
      confidenceN++
    }
  }

  const answered = correct + incorrect + partial + clarify
  const scoredTotal = answered + pending
  // Points lost: full for incorrect, half for partial, treat clarify as unresolved -> count half lost
  const errorPoints = incorrect + 0.5 * partial + 0.5 * clarify
  const errorRate = answered > 0 ? errorPoints / answered : 0
  const points = correct + 0.5 * partial
  const scorePercent = answered > 0 ? Math.round((points / answered) * 100) : 0
  const avgConfidence = confidenceN > 0 ? Math.round(confidenceSum / confidenceN) : null

  return {
    question,
    answered,
    correct,
    incorrect,
    partial,
    clarify,
    pending,
    skipped,
    scoredTotal,
    errorPoints,
    errorRate,
    scorePercent,
    avgConfidence,
  }
}

function assemble(
  questions: Question[],
  rowsByQuestion: Record<string, ResponseRowLite[]>,
  totalStudents: number
): RoundAnalytics {
  const analytics = questions
    .map((q) => summarize(q, rowsByQuestion[q.id] || []))
    .filter((a) => a.question.is_scored)

  const totalScoredResponses = analytics.reduce((sum, a) => sum + a.answered, 0)
  const totalPoints = analytics.reduce((sum, a) => sum + a.correct + 0.5 * a.partial, 0)
  const overallScorePercent =
    totalScoredResponses > 0 ? Math.round((totalPoints / totalScoredResponses) * 100) : 0

  const sorted = [...analytics].sort((a, b) => b.errorRate - a.errorRate || b.incorrect - a.incorrect)
  const topMissed = sorted.filter((a) => a.errorPoints > 0).slice(0, 10)

  // Section grouping
  const sectionMap = new Map<string, QuestionAnalytics[]>()
  for (const a of analytics) {
    const list = sectionMap.get(a.question.section) || []
    list.push(a)
    sectionMap.set(a.question.section, list)
  }
  const bySection = Array.from(sectionMap.entries())
    .map(([section, qs]) => {
      const secAnswered = qs.reduce((s, q) => s + q.answered, 0)
      const secError = qs.reduce((s, q) => s + q.errorPoints, 0)
      const errorRate = secAnswered > 0 ? secError / secAnswered : 0
      return { section, questions: qs, errorRate }
    })
    .sort((a, b) => b.errorRate - a.errorRate)

  return {
    totalStudents,
    totalScoredResponses,
    overallScorePercent,
    questions: sorted,
    topMissed,
    bySection,
  }
}

export async function getRoundAnalytics(roundId: string): Promise<RoundAnalytics> {
  if (IS_DEMO) {
    const rowsByQuestion: Record<string, ResponseRowLite[]> = {}
    for (const ds of demoStudents) {
      for (const r of ds.responses) {
        const q = demoQuestions.find((dq) => dq.id === r.questionId)
        if (!q) continue
        ;(rowsByQuestion[q.id] ||= []).push({
          question_id: q.id,
          grade: r.grade,
          admin_override_grade: r.adminOverrideGrade,
          confidence: r.confidence,
        })
      }
    }
    return assemble(demoQuestions, rowsByQuestion, demoStudents.length)
  }

  // Live: fetch questions + current-attempt submissions + all responses
  const { data: questions, error: qErr } = await supabase
    .from('questions')
    .select('*')
    .eq('round_id', roundId)
    .order('question_number')

  if (qErr) throw new Error(qErr.message)

  const { data: submissions, error: sErr } = await supabase
    .from('submissions')
    .select('id')
    .eq('round_id', roundId)
    .eq('is_current', true)

  if (sErr) throw new Error(sErr.message)

  const subIds = (submissions || []).map((s) => s.id)

  let rowsByQuestion: Record<string, ResponseRowLite[]> = {}
  if (subIds.length > 0) {
    const { data: responses, error: rErr } = await supabase
      .from('responses')
      .select('question_id, grade, admin_override_grade, confidence')
      .in('submission_id', subIds)
      .limit(100000)

    if (rErr) throw new Error(rErr.message)

    rowsByQuestion = (responses || []).reduce<Record<string, ResponseRowLite[]>>((acc, r) => {
      ;(acc[r.question_id] ||= []).push(r as ResponseRowLite)
      return acc
    }, {})
  }

  return assemble((questions as Question[]) || [], rowsByQuestion, subIds.length)
}
