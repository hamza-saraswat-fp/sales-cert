import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import { Alert } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { GradeBadge, TypeBadge } from '@/components/GradeBadge'
import { AttemptComparison, type AttemptData } from '@/components/AttemptComparison'
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  HelpCircle,
  SkipForward,
  ChevronDown,
  ChevronRight,
  BookmarkPlus,
  Download,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { IS_DEMO, getDemoStudent, demoQuestions, demoRound } from '@/lib/mock-data'
import { exportStudentGradesCsv } from '@/lib/csv-export'
import type { Question, Student, GradeValue } from '@/lib/types'

// ── Types ────────────────────────────────────────────────────────────────────

interface ResponseRow {
  id: string
  questionId: string
  rawResponse: string | null
  grade: GradeValue
  confidence: number | null
  aiReasoning: string | null
  modelUsed: string | null
  adminOverrideGrade: string | null
  adminNotes: string | null
}

interface QuestionWithResponse {
  question: Question
  response: ResponseRow
  effectiveGrade: string
}

interface AttemptMeta {
  id: string
  attemptNumber: number
  isCurrent: boolean
  submittedAt: string | null
}

interface ScoreSummary {
  correct: number
  incorrect: number
  partial: number
  clarify: number
  pending: number
  skipped: number
  totalScored: number
  scorePercent: number
}

// ── Score calculation ────────────────────────────────────────────────────────

function calculateScores(items: QuestionWithResponse[]): ScoreSummary {
  let correct = 0
  let incorrect = 0
  let partial = 0
  let clarify = 0
  let pending = 0
  let skipped = 0

  for (const item of items) {
    switch (item.effectiveGrade) {
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
  }

  const totalScored = correct + incorrect + partial + clarify + pending
  const points = correct + 0.5 * partial
  const scorePercent = totalScored > 0 ? Math.round((points / totalScored) * 100) : 0

  return { correct, incorrect, partial, clarify, pending, skipped, totalScored, scorePercent }
}

// ── Expanded response detail ─────────────────────────────────────────────────

function ResponseDetail({ item }: { item: QuestionWithResponse }) {
  const { question, response, effectiveGrade } = item
  const isClarify = effectiveGrade === 'clarify'

  return (
    <div className={`space-y-4 pb-2 ${isClarify ? 'pl-3 border-l-2 border-yellow-400' : ''}`}>
      {/* Full question text */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
          Question
        </h4>
        <p className="text-sm">{question.question_text}</p>
      </div>

      {/* Student's response */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
          Student Response
        </h4>
        {response.rawResponse ? (
          <div className="text-sm bg-muted/50 rounded-md p-3 whitespace-pre-wrap">
            {response.rawResponse}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No response provided.</p>
        )}
      </div>

      {/* Answer key */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
          Answer Key
        </h4>
        <div className="text-sm bg-green-50 rounded-md p-3 border border-green-100">
          {question.answer_key}
        </div>
      </div>

      {/* Key points */}
      {question.key_points.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
            Key Points
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {question.key_points.map((kp, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {kp}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* AI reasoning */}
      {response.aiReasoning && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            AI Reasoning
          </h4>
          <div
            className={`text-sm rounded-md p-3 border ${
              isClarify
                ? 'bg-yellow-50 border-yellow-200'
                : effectiveGrade === 'correct'
                  ? 'bg-green-50 border-green-100'
                  : effectiveGrade === 'incorrect'
                    ? 'bg-red-50 border-red-100'
                    : 'bg-muted/50 border-border'
            }`}
          >
            {response.aiReasoning}
          </div>
          {response.confidence !== null && (
            <p className="text-xs text-muted-foreground mt-1">
              Confidence: {response.confidence}% · Model: {response.modelUsed || 'N/A'}
            </p>
          )}
        </div>
      )}

      {/* Admin override / notes */}
      {response.adminOverrideGrade && (
        <div className="border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground">
            Admin Override: <GradeBadge grade={response.adminOverrideGrade as GradeValue} />
          </p>
          {response.adminNotes && (
            <p className="text-xs text-muted-foreground mt-1">{response.adminNotes}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Section group ────────────────────────────────────────────────────────────

// ── Override buttons ─────────────────────────────────────────────────────────

function OverrideButtons({
  item,
  onOverride,
  onAddToSet,
}: {
  item: QuestionWithResponse
  onOverride: (responseId: string, grade: 'correct' | 'incorrect' | 'partial' | null) => void
  onAddToSet: (item: QuestionWithResponse) => void
}) {
  const overrideGrade = item.response.adminOverrideGrade
  const effectiveGrade = overrideGrade || item.response.grade
  const canAddToSet =
    (effectiveGrade === 'correct' || effectiveGrade === 'incorrect') &&
    item.response.rawResponse
  const allowPartial = item.question.allow_partial_credit

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() =>
          onOverride(
            item.response.id,
            overrideGrade === 'correct' ? null : 'correct'
          )
        }
        className={`p-0.5 rounded transition-colors ${
          overrideGrade === 'correct'
            ? 'text-green-600 bg-green-100'
            : 'text-muted-foreground/40 hover:text-green-600 hover:bg-green-50'
        }`}
        title={overrideGrade === 'correct' ? 'Clear override' : 'Mark correct'}
      >
        <CheckCircle className="size-3.5" />
      </button>
      {allowPartial && (
        <button
          onClick={() =>
            onOverride(
              item.response.id,
              overrideGrade === 'partial' ? null : 'partial'
            )
          }
          className={`px-1 rounded transition-colors text-[10px] font-semibold leading-none h-[18px] ${
            overrideGrade === 'partial'
              ? 'text-amber-700 bg-amber-100'
              : 'text-muted-foreground/40 hover:text-amber-700 hover:bg-amber-50'
          }`}
          title={overrideGrade === 'partial' ? 'Clear override' : 'Mark half credit'}
        >
          ½
        </button>
      )}
      <button
        onClick={() =>
          onOverride(
            item.response.id,
            overrideGrade === 'incorrect' ? null : 'incorrect'
          )
        }
        className={`p-0.5 rounded transition-colors ${
          overrideGrade === 'incorrect'
            ? 'text-red-600 bg-red-100'
            : 'text-muted-foreground/40 hover:text-red-600 hover:bg-red-50'
        }`}
        title={overrideGrade === 'incorrect' ? 'Clear override' : 'Mark incorrect'}
      >
        <XCircle className="size-3.5" />
      </button>
      {canAddToSet && (
        <button
          onClick={() => onAddToSet(item)}
          className="p-0.5 rounded transition-colors text-muted-foreground/40 hover:text-blue-600 hover:bg-blue-50"
          title="Add to answer set (few-shot example)"
        >
          <BookmarkPlus className="size-3.5" />
        </button>
      )}
    </div>
  )
}

function SectionGroup({
  section,
  items,
  onOverride,
  onAddToSet,
}: {
  section: string
  items: QuestionWithResponse[]
  onOverride: (responseId: string, grade: 'correct' | 'incorrect' | 'partial' | null) => void
  onAddToSet: (item: QuestionWithResponse) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const sectionScores = calculateScores(items)

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {collapsed ? (
            <ChevronRight className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
          <span className="font-medium text-sm">{section}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-green-700">{sectionScores.correct}✓</span>
          <span className="text-xs text-red-700">{sectionScores.incorrect}✗</span>
          {sectionScores.partial > 0 && (
            <span className="text-xs text-amber-700">{sectionScores.partial}½</span>
          )}
          {sectionScores.clarify > 0 && (
            <span className="text-xs text-yellow-700">{sectionScores.clarify}?</span>
          )}
          <span className="text-xs text-muted-foreground">
            {items.length} Qs
          </span>
        </div>
      </button>

      {!collapsed && (
        <Accordion type="single" collapsible className="px-0">
          {items.map((item) => (
            <AccordionItem key={item.response.id} value={item.response.id}>
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center gap-3 w-full pr-2">
                  <span className="text-xs text-muted-foreground font-mono w-6 shrink-0">
                    {item.question.question_number}
                  </span>
                  <span className="text-sm text-left flex-1 line-clamp-1">
                    {item.question.question_text}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.response.confidence !== null && (
                      <span className="text-xs text-muted-foreground">
                        {item.response.confidence}%
                      </span>
                    )}
                    <OverrideButtons item={item} onOverride={onOverride} onAddToSet={onAddToSet} />
                    <GradeBadge grade={item.effectiveGrade as GradeValue} />
                    {item.response.adminOverrideGrade && (
                      <span className="text-[10px] text-muted-foreground italic">override</span>
                    )}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4">
                <ResponseDetail item={item} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function StudentDetail() {
  const { roundId, studentId } = useParams<{
    roundId: string
    studentId: string
  }>()

  const [student, setStudent] = useState<Student | null>(null)
  const [items, setItems] = useState<QuestionWithResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [roundName, setRoundName] = useState<string>('')
  const [exporting, setExporting] = useState(false)
  const [attempts, setAttempts] = useState<AttemptMeta[]>([])
  const [compareAttempts, setCompareAttempts] = useState<AttemptData[]>([])

  const fetchData = useCallback(async () => {
    if (!roundId || !studentId) return
    setLoading(true)
    setError(null)

    // ── Demo mode ───────────────────────────────────────────────────────
    if (IS_DEMO) {
      const ds = getDemoStudent(studentId)
      if (!ds) {
        setError('Student not found in demo data')
        setLoading(false)
        return
      }
      setStudent(ds.student)
      setSubmissionId(ds.submissionId)
      setRoundName(demoRound.name)
      setAttempts([
        {
          id: ds.submissionId,
          attemptNumber: 1,
          isCurrent: true,
          submittedAt: null,
        },
      ])
      setCompareAttempts([])

      const mapped: QuestionWithResponse[] = ds.responses.map((r) => {
        const question = demoQuestions.find((q) => q.id === r.questionId)!
        const effectiveGrade = r.adminOverrideGrade || r.grade || 'pending'
        return { question, response: r, effectiveGrade }
      })
      mapped.sort((a, b) => a.question.question_number - b.question.question_number)
      setItems(mapped)
      setLoading(false)
      return
    }

    // ── Live Supabase mode ──────────────────────────────────────────────
    try {
      // Fetch student
      const { data: studentData, error: sErr } = await supabase
        .from('students')
        .select('*')
        .eq('id', studentId)
        .single()

      if (sErr) throw sErr
      setStudent(studentData as Student)

      // Fetch round name (for export filename)
      const { data: roundData } = await supabase
        .from('quiz_rounds')
        .select('name')
        .eq('id', roundId)
        .single()
      if (roundData) setRoundName((roundData as { name: string }).name)

      // Fetch ALL attempts for this (student, round).
      const { data: allAttempts, error: attemptsErr } = await supabase
        .from('submissions')
        .select('id, attempt_number, is_current, submitted_at')
        .eq('student_id', studentId)
        .eq('round_id', roundId)
        .order('attempt_number', { ascending: true })

      if (attemptsErr) throw attemptsErr

      const attemptList: AttemptMeta[] = (allAttempts || []).map((a) => ({
        id: (a as { id: string }).id,
        attemptNumber: (a as { attempt_number: number }).attempt_number,
        isCurrent: (a as { is_current: boolean }).is_current,
        submittedAt: (a as { submitted_at: string | null }).submitted_at,
      }))

      if (attemptList.length === 0) {
        throw new Error('No submission found for this student in this round')
      }

      setAttempts(attemptList)

      // Default to the current attempt (freshest one flagged is_current).
      const currentAttempt = attemptList.find((a) => a.isCurrent) || attemptList[attemptList.length - 1]
      const targetSubmissionId = currentAttempt.id
      setSubmissionId(targetSubmissionId)

      // Fetch responses for the selected attempt only.
      const { data: responses, error: rErr } = await supabase
        .from('responses')
        .select('*, questions(*)')
        .eq('submission_id', targetSubmissionId)

      if (rErr) throw rErr

      // If more than 1 attempt, prefetch the comparison payload so the Compare tab is instant.
      if (attemptList.length > 1) {
        const allIds = attemptList.map((a) => a.id)
        const { data: allResponses } = await supabase
          .from('responses')
          .select('submission_id, question_id, raw_response, grade, admin_override_grade, confidence, questions(*)')
          .in('submission_id', allIds)

        type CompareRow = {
          submission_id: string
          question_id: string
          raw_response: string | null
          grade: GradeValue
          admin_override_grade: string | null
          confidence: number | null
          questions: Question
        }
        const rowsTyped = (allResponses || []) as unknown as CompareRow[]

        const byAttempt = new Map<string, CompareRow[]>()
        for (const r of rowsTyped) {
          const list = byAttempt.get(r.submission_id) || []
          list.push(r)
          byAttempt.set(r.submission_id, list)
        }

        const prepared: AttemptData[] = attemptList.map((a) => {
          const rows = byAttempt.get(a.id) || []
          return {
            attemptNumber: a.attemptNumber,
            isCurrent: a.isCurrent,
            submittedAt: a.submittedAt,
            responses: rows.map((r) => ({
              questionId: r.question_id,
              question: r.questions,
              rawResponse: r.raw_response,
              grade: r.grade,
              adminOverrideGrade: r.admin_override_grade,
              confidence: r.confidence,
              effectiveGrade: (r.admin_override_grade || r.grade || 'pending') as string,
            })),
          }
        })
        setCompareAttempts(prepared)
      } else {
        setCompareAttempts([])
      }

      // Map to our display type
      const mapped: QuestionWithResponse[] = (responses || []).map((r) => {
        const question = r.questions as unknown as Question
        const effectiveGrade = r.admin_override_grade || r.grade || 'pending'

        return {
          question,
          response: {
            id: r.id,
            questionId: r.question_id,
            rawResponse: r.raw_response,
            grade: r.grade,
            confidence: r.confidence,
            aiReasoning: r.ai_reasoning,
            modelUsed: r.model_used,
            adminOverrideGrade: r.admin_override_grade,
            adminNotes: r.admin_notes,
          },
          effectiveGrade,
        }
      })

      // Sort by question number
      mapped.sort((a, b) => a.question.question_number - b.question.question_number)
      setItems(mapped)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load student data')
    } finally {
      setLoading(false)
    }
  }, [roundId, studentId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Attempt selector ──────────────────────────────────────────────────────

  const selectAttempt = async (nextSubmissionId: string) => {
    if (nextSubmissionId === submissionId) return
    setSubmissionId(nextSubmissionId)

    if (IS_DEMO) return

    try {
      const { data: responses, error: rErr } = await supabase
        .from('responses')
        .select('*, questions(*)')
        .eq('submission_id', nextSubmissionId)

      if (rErr) throw rErr

      const mapped: QuestionWithResponse[] = (responses || []).map((r) => {
        const question = r.questions as unknown as Question
        const effectiveGrade = r.admin_override_grade || r.grade || 'pending'
        return {
          question,
          response: {
            id: r.id,
            questionId: r.question_id,
            rawResponse: r.raw_response,
            grade: r.grade,
            confidence: r.confidence,
            aiReasoning: r.ai_reasoning,
            modelUsed: r.model_used,
            adminOverrideGrade: r.admin_override_grade,
            adminNotes: r.admin_notes,
          },
          effectiveGrade,
        }
      })
      mapped.sort((a, b) => a.question.question_number - b.question.question_number)
      setItems(mapped)
    } catch (err) {
      toast.error('Failed to load attempt', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  // ── Override handler ─────────────────────────────────────────────────────

  const handleOverride = async (responseId: string, grade: 'correct' | 'incorrect' | 'partial' | null) => {
    // Optimistic update
    setItems((prev) =>
      prev.map((item) => {
        if (item.response.id !== responseId) return item
        const newResponse = { ...item.response, adminOverrideGrade: grade }
        const effectiveGrade = grade || item.response.grade || 'pending'
        return { ...item, response: newResponse, effectiveGrade }
      })
    )

    if (!IS_DEMO) {
      const { error } = await supabase
        .from('responses')
        .update({
          admin_override_grade: grade,
          updated_at: new Date().toISOString(),
        })
        .eq('id', responseId)

      if (error) {
        toast.error('Failed to save override')
        await fetchData() // revert
        return
      }
    }

    toast.success(
      grade
        ? `Overridden to ${grade}`
        : 'Override cleared'
    )
  }

  // ── Add to answer set ──────────────────────────────────────────────────

  const [answerSetDialog, setAnswerSetDialog] = useState<{
    open: boolean
    item: QuestionWithResponse | null
    reason: string
  }>({ open: false, item: null, reason: '' })

  const handleAddToSet = (item: QuestionWithResponse) => {
    const effectiveGrade = item.response.adminOverrideGrade || item.response.grade
    const isGood = effectiveGrade === 'correct'
    setAnswerSetDialog({
      open: true,
      item,
      reason: isGood ? 'Marked correct by admin review.' : 'Marked incorrect by admin review.',
    })
  }

  const confirmAddToSet = async () => {
    const { item, reason } = answerSetDialog
    if (!item) return

    const effectiveGrade = item.response.adminOverrideGrade || item.response.grade
    const isGood = effectiveGrade === 'correct'
    const field = isGood ? 'few_shot_good' : 'few_shot_bad'
    const rawResponse = item.response.rawResponse || ''

    if (IS_DEMO) {
      toast.success(`Added to ${isGood ? 'good' : 'bad'} examples (demo mode)`)
      setAnswerSetDialog({ open: false, item: null, reason: '' })
      return
    }

    // Fetch current few-shot examples for this question
    const { data: question, error: fetchErr } = await supabase
      .from('questions')
      .select('few_shot_good, few_shot_bad')
      .eq('id', item.question.id)
      .single()

    if (fetchErr || !question) {
      toast.error('Failed to fetch question data')
      return
    }

    const questionData = question as { few_shot_good: Array<{ response: string; explanation: string }>; few_shot_bad: Array<{ response: string; explanation: string }> }
    const currentExamples = questionData[field] || []

    const newExample = {
      response: rawResponse.substring(0, 500),
      explanation: reason.trim() || (isGood ? 'Marked correct by admin review.' : 'Marked incorrect by admin review.'),
    }

    const updatedExamples = [...currentExamples, newExample]

    const { error: updateErr } = await supabase
      .from('questions')
      .update({
        [field]: updatedExamples,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.question.id)

    if (updateErr) {
      toast.error('Failed to add to answer set')
      return
    }

    // Mark other responses for this question as needing rescore
    const { error: rescoreErr } = await supabase
      .from('responses')
      .update({ needs_rescore: true, updated_at: new Date().toISOString() })
      .eq('question_id', item.question.id)
      .neq('id', item.response.id)

    if (rescoreErr) {
      console.warn('Failed to flag other responses for rescore:', rescoreErr.message)
    }

    toast.success(
      `Added to ${isGood ? 'good' : 'bad'} examples. Other responses flagged for rescore.`
    )
    setAnswerSetDialog({ open: false, item: null, reason: '' })
  }

  // ── Derived data ───────────────────────────────────────────────────────────

  const scores = calculateScores(items)

  // Split into graded (scored questions with grades) vs ungraded/skipped
  const gradedItems = items.filter(
    (i) => i.question.is_scored && i.effectiveGrade !== 'skipped' && i.effectiveGrade !== 'pending'
  )
  const pendingItems = items.filter(
    (i) => i.question.is_scored && i.effectiveGrade === 'pending'
  )
  const skippedItems = items.filter(
    (i) => !i.question.is_scored || i.effectiveGrade === 'skipped'
  )

  // Group graded items by section
  const gradedBySection = gradedItems.reduce<Record<string, QuestionWithResponse[]>>(
    (acc, item) => {
      const section = item.question.section
      if (!acc[section]) acc[section] = []
      acc[section].push(item)
      return acc
    },
    {}
  )

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="container mx-auto py-16 flex flex-col items-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Loading student detail...</p>
      </div>
    )
  }

  if (error || !student) {
    return (
      <div className="container mx-auto py-16 max-w-3xl">
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <p className="text-sm">{error || 'Student not found'}</p>
        </Alert>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      {/* Back button */}
      <div className="mb-6">
        <Link to={`/rounds/${roundId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-4" />
            Back to Round
          </Button>
        </Link>
      </div>

      {/* Student header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{student.display_name}</h1>
          <p className="text-sm text-muted-foreground">{student.email}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!submissionId || exporting}
          onClick={async () => {
            if (!submissionId) return
            setExporting(true)
            try {
              await exportStudentGradesCsv(submissionId, { roundName })
              toast.success('Result exported')
            } catch (err) {
              toast.error('Export failed', {
                description: err instanceof Error ? err.message : 'Unknown error',
              })
            } finally {
              setExporting(false)
            }
          }}
        >
          {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          Export Result
        </Button>
      </div>

      {/* Attempt selector (only visible when 2+ attempts exist) */}
      {attempts.length > 1 && (
        <div className="mb-6 flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">Viewing</span>
          <Select value={submissionId || undefined} onValueChange={selectAttempt}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...attempts].reverse().map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  Attempt {a.attemptNumber}
                  {a.isCurrent ? ' (current)' : ''}
                  {a.submittedAt ? ` — ${new Date(a.submittedAt).toLocaleDateString()}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {attempts.length > 1 ? (
        <Tabs defaultValue="detail">
          <TabsList>
            <TabsTrigger value="detail">Detail</TabsTrigger>
            <TabsTrigger value="compare">Compare Attempts</TabsTrigger>
          </TabsList>
          <TabsContent value="compare" className="mt-4">
            <AttemptComparison attempts={compareAttempts} />
          </TabsContent>
          <TabsContent value="detail" className="mt-4">
            {renderDetailView()}
          </TabsContent>
        </Tabs>
      ) : (
        renderDetailView()
      )}
    </div>
  )

  function renderDetailView() {
    return (
      <>
      {/* Score summary */}
      <div className={`grid ${scores.partial > 0 ? 'grid-cols-6' : 'grid-cols-5'} gap-3 mb-8`}>
        {/* Big score card */}
        <Card className="col-span-1 row-span-1">
          <CardContent className="pt-5 pb-5 flex flex-col items-center justify-center h-full">
            <p className="text-4xl font-bold">
              {scores.totalScored > 0 ? `${scores.scorePercent}%` : '–'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {scores.pending > 0 ? `Score (${scores.pending} pending)` : 'Overall Score'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle className="size-3 text-green-600" />
              <p className="text-xs font-medium text-muted-foreground">Correct</p>
            </div>
            <p className="text-2xl font-bold text-green-700">{scores.correct}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1.5 mb-1">
              <XCircle className="size-3 text-red-600" />
              <p className="text-xs font-medium text-muted-foreground">Incorrect</p>
            </div>
            <p className="text-2xl font-bold text-red-700">{scores.incorrect}</p>
          </CardContent>
        </Card>

        {scores.partial > 0 && (
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] font-bold text-amber-600 leading-none">½</span>
                <p className="text-xs font-medium text-muted-foreground">Half</p>
              </div>
              <p className="text-2xl font-bold text-amber-700">{scores.partial}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1.5 mb-1">
              <HelpCircle className="size-3 text-yellow-600" />
              <p className="text-xs font-medium text-muted-foreground">Clarify</p>
            </div>
            <p className="text-2xl font-bold text-yellow-700">{scores.clarify}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1.5 mb-1">
              <SkipForward className="size-3 text-slate-400" />
              <p className="text-xs font-medium text-muted-foreground">Skipped</p>
            </div>
            <p className="text-2xl font-bold text-slate-500">{scores.skipped}</p>
          </CardContent>
        </Card>
      </div>

      {/* Score bar */}
      {scores.totalScored > 0 && (
        <div className="mb-8">
          <div className="flex h-3 rounded-full overflow-hidden bg-muted">
            {scores.correct > 0 && (
              <div
                className="bg-green-500 transition-all"
                style={{ width: `${(scores.correct / scores.totalScored) * 100}%` }}
              />
            )}
            {scores.partial > 0 && (
              <div
                className="bg-amber-400 transition-all"
                style={{ width: `${(scores.partial / scores.totalScored) * 100}%` }}
              />
            )}
            {scores.incorrect > 0 && (
              <div
                className="bg-red-500 transition-all"
                style={{ width: `${(scores.incorrect / scores.totalScored) * 100}%` }}
              />
            )}
            {scores.clarify > 0 && (
              <div
                className="bg-yellow-400 transition-all"
                style={{ width: `${(scores.clarify / scores.totalScored) * 100}%` }}
              />
            )}
            {scores.pending > 0 && (
              <div
                className="bg-slate-300 transition-all"
                style={{ width: `${(scores.pending / scores.totalScored) * 100}%` }}
              />
            )}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-muted-foreground">
              {scores.correct + scores.incorrect + scores.partial + scores.clarify} graded of {scores.totalScored} scored
            </span>
            {scores.pending > 0 && (
              <span className="text-xs text-yellow-700">{scores.pending} pending</span>
            )}
          </div>
        </div>
      )}

      {/* Graded questions by section */}
      {Object.keys(gradedBySection).length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Graded Questions</h2>
          <div className="space-y-4">
            {Object.entries(gradedBySection).map(([section, sectionItems]) => (
              <SectionGroup
                key={section}
                section={section}
                items={sectionItems}
                onOverride={handleOverride}
                onAddToSet={handleAddToSet}
              />
            ))}
          </div>
        </div>
      )}

      {/* Pending questions */}
      {pendingItems.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Loader2 className="size-4 text-muted-foreground" />
            Pending Grading ({pendingItems.length})
          </h2>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {pendingItems.map((item) => (
                  <div key={item.response.id} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground font-mono w-6">
                        {item.question.question_number}
                      </span>
                      <p className="text-sm flex-1 line-clamp-1">
                        {item.question.question_text}
                      </p>
                      <GradeBadge grade="pending" />
                    </div>
                    {item.response.rawResponse && (
                      <p className="text-xs text-muted-foreground mt-1 ml-9 line-clamp-2">
                        {item.response.rawResponse}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Ungraded / Skipped section */}
      {skippedItems.length > 0 && (
        <div>
          <Separator className="mb-8" />
          <h2 className="text-lg font-semibold mb-2 text-muted-foreground flex items-center gap-2">
            <SkipForward className="size-4" />
            Ungraded / Skipped Questions ({skippedItems.length})
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            These questions are marked as unscored (screenshots, informational, etc.) and don't affect the final score.
          </p>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {skippedItems.map((item) => (
                  <div key={item.response.id} className="px-4 py-3">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-xs text-muted-foreground font-mono w-6">
                        {item.question.question_number}
                      </span>
                      <p className="text-sm text-muted-foreground flex-1 line-clamp-1">
                        {item.question.question_text}
                      </p>
                      <TypeBadge type={item.question.question_type} />
                    </div>
                    {item.response.rawResponse && (
                      <div className="ml-9 mt-1">
                        <p className="text-xs text-muted-foreground line-clamp-3">
                          {item.response.rawResponse}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No Responses</CardTitle>
            <CardDescription>
              This student has no responses imported yet. Import a CSV on the round detail page.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Add to Answer Set Dialog */}
      <Dialog
        open={answerSetDialog.open}
        onOpenChange={(open) => {
          if (!open) setAnswerSetDialog({ open: false, item: null, reason: '' })
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Add to {answerSetDialog.item && (answerSetDialog.item.response.adminOverrideGrade || answerSetDialog.item.response.grade) === 'correct' ? 'Good' : 'Bad'} Examples
            </DialogTitle>
            <DialogDescription>
              This answer will be used as a {answerSetDialog.item && (answerSetDialog.item.response.adminOverrideGrade || answerSetDialog.item.response.grade) === 'correct' ? 'good' : 'bad'} example when grading other students on this question.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Student Response
              </p>
              <div className="text-sm bg-muted/50 rounded-md p-2 max-h-24 overflow-y-auto">
                {answerSetDialog.item?.response.rawResponse || 'No response'}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Why is this a {answerSetDialog.item && (answerSetDialog.item.response.adminOverrideGrade || answerSetDialog.item.response.grade) === 'correct' ? 'good' : 'bad'} answer? (optional)
              </p>
              <Textarea
                value={answerSetDialog.reason}
                onChange={(e) =>
                  setAnswerSetDialog((prev) => ({ ...prev, reason: e.target.value }))
                }
                placeholder="e.g., Covers all key points clearly..."
                rows={2}
                className="text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAnswerSetDialog({ open: false, item: null, reason: '' })}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={confirmAddToSet}>
                <BookmarkPlus className="size-3.5" />
                Add to Set
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </>
    )
  }
}
