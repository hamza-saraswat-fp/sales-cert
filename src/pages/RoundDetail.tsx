import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { Alert } from '@/components/ui/alert'
import {
  Upload,
  Play,
  Download,
  ArrowLeft,
  Settings,
  Loader2,
  Users,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { batchGrade, type BatchGradeProgress } from '@/lib/grading'
import { CsvImporter } from '@/components/CsvImporter'
import { GradingProgress } from '@/components/GradingProgress'
import { IS_DEMO, demoRound, demoQuestions, getDemoStudentRows, demoModels } from '@/lib/mock-data'
import { exportGradesCsv } from '@/lib/csv-export'
import type { Question, QuizRound, ModelOption } from '@/lib/types'

// ── Types ────────────────────────────────────────────────────────────────────

interface StudentRow {
  studentId: string
  email: string
  displayName: string
  submissionId: string
  correct: number
  incorrect: number
  clarify: number
  pending: number
  skipped: number
  totalScored: number
  scorePercent: number
}

// ── Main component ───────────────────────────────────────────────────────────

export default function RoundDetail() {
  const { roundId } = useParams<{ roundId: string }>()

  const [round, setRound] = useState<QuizRound | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [students, setStudents] = useState<StudentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [csvDialogOpen, setCsvDialogOpen] = useState(false)

  // Grading state
  const [isGrading, setIsGrading] = useState(false)
  const [gradingProgress, setGradingProgress] = useState<BatchGradeProgress>({
    total: 0,
    completed: 0,
    correct: 0,
    incorrect: 0,
    clarify: 0,
    skipped: 0,
    errors: 0,
    currentQuestion: '',
  })
  const abortControllerRef = useRef<AbortController | null>(null)

  // Model selection state
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!roundId) return
    setLoading(true)
    setError(null)

    // ── Demo mode ───────────────────────────────────────────────────────
    if (IS_DEMO) {
      setRound(demoRound)
      setQuestions(demoQuestions)
      setAvailableModels(demoModels)
      if (!selectedModel) setSelectedModel(demoModels[0].id)
      setStudents(getDemoStudentRows())
      setLoading(false)
      return
    }

    // ── Live Supabase mode ──────────────────────────────────────────────
    try {
      // Fetch round info
      const { data: roundData, error: roundErr } = await supabase
        .from('quiz_rounds')
        .select('*')
        .eq('id', roundId)
        .single()

      if (roundErr) throw roundErr
      setRound(roundData as QuizRound)

      // Fetch questions for this round
      const { data: questionData, error: qErr } = await supabase
        .from('questions')
        .select('*')
        .eq('round_id', roundId)
        .order('question_number')

      if (qErr) throw qErr
      setQuestions(questionData as Question[])

      // Fetch grading config (models)
      const { data: configRows } = await supabase
        .from('grading_config')
        .select('key, value')
        .in('key', ['available_models', 'default_model'])

      const configMap: Record<string, unknown> = {}
      for (const row of configRows || []) {
        configMap[row.key] = row.value
      }

      const models = (configMap.available_models as ModelOption[]) || [
        { id: 'anthropic/claude-3.5-haiku', name: 'Haiku (Fast/Cheap)', cost_per_student: '$0.07' },
        { id: 'anthropic/claude-sonnet-4', name: 'Sonnet (Accurate)', cost_per_student: '$0.75' },
      ]
      setAvailableModels(models)

      const defaultModel = (configMap.default_model as string) || 'anthropic/claude-3.5-haiku'
      if (!selectedModel) setSelectedModel(defaultModel)

      // Fetch submissions with student info + response counts
      const { data: submissions, error: subErr } = await supabase
        .from('submissions')
        .select('id, student_id, students(id, email, display_name)')
        .eq('round_id', roundId)

      if (subErr) throw subErr

      // For each submission, fetch grade counts
      const studentRows: StudentRow[] = []
      for (const sub of submissions || []) {
        const student = (sub as unknown as { students: { id: string; email: string; display_name: string } }).students

        const { data: responses } = await supabase
          .from('responses')
          .select('grade, admin_override_grade')
          .eq('submission_id', sub.id)

        const counts = {
          correct: 0,
          incorrect: 0,
          clarify: 0,
          pending: 0,
          skipped: 0,
        }

        for (const r of responses || []) {
          const effectiveGrade = r.admin_override_grade || r.grade
          if (effectiveGrade in counts) {
            counts[effectiveGrade as keyof typeof counts]++
          }
        }

        const totalScored = counts.correct + counts.incorrect + counts.clarify + counts.pending
        const scorePercent =
          totalScored > 0
            ? Math.round((counts.correct / totalScored) * 100)
            : 0

        studentRows.push({
          studentId: student.id,
          email: student.email,
          displayName: student.display_name,
          submissionId: sub.id,
          ...counts,
          totalScored,
          scorePercent,
        })
      }

      studentRows.sort((a, b) => b.scorePercent - a.scorePercent)
      setStudents(studentRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load round data')
    } finally {
      setLoading(false)
    }
  }, [roundId, selectedModel])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Grading handlers ───────────────────────────────────────────────────────

  const handleGrade = async (submissionId?: string) => {
    if (!roundId || isGrading) return

    const pendingCount = submissionId
      ? students.find((s) => s.submissionId === submissionId)?.pending ?? 0
      : students.reduce((sum, s) => sum + s.pending, 0)

    if (pendingCount === 0) {
      toast.info('Nothing to grade', {
        description: 'All responses have already been graded.',
      })
      return
    }

    setIsGrading(true)
    setGradingProgress({
      total: 0,
      completed: 0,
      correct: 0,
      incorrect: 0,
      clarify: 0,
      skipped: 0,
      errors: 0,
      currentQuestion: '',
    })

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const result = await batchGrade({
        roundId,
        submissionId,
        modelOverride: selectedModel || undefined,
        onProgress: setGradingProgress,
        signal: controller.signal,
      })

      if (controller.signal.aborted) {
        toast.info('Grading cancelled', {
          description: `Graded ${result.completed} of ${result.total} responses before cancellation.`,
        })
      } else {
        toast.success('Grading complete!', {
          description: `${result.correct} correct, ${result.incorrect} incorrect, ${result.clarify} clarify, ${result.errors} errors.`,
        })
      }

      // Refresh data to show updated scores
      await fetchData()
    } catch (err) {
      toast.error('Grading failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsGrading(false)
      abortControllerRef.current = null
    }
  }

  const handleCancelGrading = () => {
    abortControllerRef.current?.abort()
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="container mx-auto py-16 flex flex-col items-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Loading round...</p>
      </div>
    )
  }

  if (error || !round) {
    return (
      <div className="container mx-auto py-16 max-w-3xl">
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <p className="text-sm">{error || 'Round not found'}</p>
        </Alert>
      </div>
    )
  }

  const totalPending = students.reduce((sum, s) => sum + s.pending, 0)

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <Link to="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-4" />
            Dashboard
          </Button>
        </Link>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{round.name}</h1>
          {round.description && (
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              {round.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2">
            <Badge variant="secondary">
              {questions.length} questions
            </Badge>
            <Badge variant="secondary">
              <Users className="size-3" />
              {students.length} students
            </Badge>
            {totalPending > 0 && (
              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                {totalPending} pending
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <Button variant="outline" onClick={() => setCsvDialogOpen(true)}>
            <Upload className="size-4" />
            Import CSV
          </Button>

          {/* Model selector */}
          {availableModels.length > 0 && (
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} ({m.cost_per_student})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            onClick={() => handleGrade()}
            disabled={isGrading || totalPending === 0}
          >
            {isGrading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            {isGrading ? 'Grading...' : `Grade All (${totalPending})`}
          </Button>

          <Button
            variant="outline"
            disabled={students.length === 0}
            onClick={async () => {
              try {
                await exportGradesCsv(roundId!, questions)
                toast.success('CSV exported')
              } catch {
                toast.error('Export failed')
              }
            }}
          >
            <Download className="size-4" />
            Export
          </Button>
          <Link to={`/rounds/${roundId}/questions`}>
            <Button variant="outline">
              <Settings className="size-4" />
              Questions
            </Button>
          </Link>
        </div>
      </div>

      {/* Grading progress */}
      {(isGrading || gradingProgress.completed > 0) && (
        <div className="mb-6">
          <GradingProgress
            progress={gradingProgress}
            isGrading={isGrading}
            onCancel={handleCancelGrading}
          />
        </div>
      )}

      {/* Round-level stats */}
      {students.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs font-medium text-muted-foreground mb-1">Students</p>
              <p className="text-2xl font-bold">{students.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs font-medium text-muted-foreground mb-1">Avg Score</p>
              <p className="text-2xl font-bold">
                {students.some((s) => s.pending === 0)
                  ? `${Math.round(
                      students
                        .filter((s) => s.pending === 0)
                        .reduce((sum, s) => sum + s.scorePercent, 0) /
                        Math.max(students.filter((s) => s.pending === 0).length, 1)
                    )}%`
                  : '–'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs font-medium text-muted-foreground mb-1">Fully Graded</p>
              <p className="text-2xl font-bold text-green-700">
                {students.filter((s) => s.pending === 0).length}
                <span className="text-sm font-normal text-muted-foreground">
                  /{students.length}
                </span>
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs font-medium text-muted-foreground mb-1">Pending Responses</p>
              <p className="text-2xl font-bold text-yellow-700">
                {totalPending}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="students">
        <TabsList>
          <TabsTrigger value="students">
            Students ({students.length})
          </TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
        </TabsList>

        <TabsContent value="students" className="mt-4">
          {students.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No Students Yet</CardTitle>
                <CardDescription>
                  Import a Google Forms CSV to populate student responses.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  onClick={() => setCsvDialogOpen(true)}
                >
                  <Upload className="size-4" />
                  Import CSV
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead className="text-center w-20">Correct</TableHead>
                      <TableHead className="text-center w-20">Wrong</TableHead>
                      <TableHead className="text-center w-20">Clarify</TableHead>
                      <TableHead className="text-center w-20">Pending</TableHead>
                      <TableHead className="text-center w-20">Skipped</TableHead>
                      <TableHead className="text-right w-24">Score</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.map((s, i) => (
                      <TableRow key={s.studentId}>
                        <TableCell className="text-muted-foreground text-xs">
                          {i + 1}
                        </TableCell>
                        <TableCell>
                          <Link
                            to={`/rounds/${roundId}/students/${s.studentId}`}
                            className="hover:underline"
                          >
                            <p className="font-medium text-sm">
                              {s.displayName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {s.email}
                            </p>
                          </Link>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm font-medium text-green-700">
                            {s.correct}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm font-medium text-red-700">
                            {s.incorrect}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm font-medium text-yellow-700">
                            {s.clarify}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm text-muted-foreground">
                            {s.pending}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm text-muted-foreground">
                            {s.skipped}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-bold text-sm">
                            {s.totalScored > 0
                              ? `${s.scorePercent}%`
                              : '–'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {s.pending > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isGrading}
                              onClick={() => handleGrade(s.submissionId)}
                              className="h-7 px-2 text-xs"
                            >
                              <Play className="size-3" />
                              Grade
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Questions by Type</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(
                    questions.reduce<Record<string, number>>((acc, q) => {
                      acc[q.question_type] = (acc[q.question_type] || 0) + 1
                      return acc
                    }, {})
                  ).map(([type, count]) => (
                    <div
                      key={type}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="capitalize">{type.replace('_', '/')}</span>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Scoring Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Scored questions</span>
                    <span className="font-medium">
                      {questions.filter((q) => q.is_scored).length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Unscored (skipped)</span>
                    <span className="font-medium">
                      {questions.filter((q) => !q.is_scored).length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total students</span>
                    <span className="font-medium">{students.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Graded responses</span>
                    <span className="font-medium">
                      {students.reduce(
                        (sum, s) => sum + s.correct + s.incorrect + s.clarify,
                        0
                      )}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* CSV Import Dialog */}
      <Dialog open={csvDialogOpen} onOpenChange={setCsvDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Student Responses</DialogTitle>
            <DialogDescription>
              Upload a Google Forms CSV export. Responses will be matched to
              questions and stored for grading.
            </DialogDescription>
          </DialogHeader>
          <CsvImporter
            roundId={roundId!}
            questions={questions}
            onImportComplete={() => {
              fetchData()
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
