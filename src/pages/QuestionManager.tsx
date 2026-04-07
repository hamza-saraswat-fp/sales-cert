import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { Switch } from '@/components/ui/switch'
import { TypeBadge } from '@/components/GradeBadge'
import { QuestionEditor } from '@/components/QuestionEditor'
import { useQuestions } from '@/hooks/useQuestions'
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Pencil,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import type { Question, FewShotExample } from '@/lib/types'

// ── Few-shot example display ─────────────────────────────────────────────────

function FewShotCard({
  example,
  variant,
}: {
  example: FewShotExample
  variant: 'good' | 'bad'
}) {
  return (
    <div
      className={`rounded-md border p-3 text-sm ${
        variant === 'good'
          ? 'border-green-200 bg-green-50'
          : 'border-red-200 bg-red-50'
      }`}
    >
      <p className="font-medium text-foreground mb-1">
        {variant === 'good' ? (
          <span className="text-green-700">Good Example</span>
        ) : (
          <span className="text-red-700">Bad Example</span>
        )}
      </p>
      <p className="text-muted-foreground mb-1">
        <span className="font-medium">Response:</span> {example.response}
      </p>
      <p className="text-muted-foreground">
        <span className="font-medium">Explanation:</span> {example.explanation}
      </p>
    </div>
  )
}

// ── Expanded question detail ─────────────────────────────────────────────────

function QuestionDetail({ question }: { question: Question }) {
  return (
    <div className="space-y-4 pb-4">
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-1">
          Answer Key
        </h4>
        <p className="text-sm bg-muted/50 rounded-md p-3">{question.answer_key}</p>
      </div>

      {question.key_points.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">
            Key Points
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {question.key_points.map((point, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {point}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {(question.few_shot_good.length > 0 ||
        question.few_shot_bad.length > 0) && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">
            Few-Shot Examples
          </h4>
          <div className="space-y-2">
            {question.few_shot_good.map((ex, i) => (
              <FewShotCard key={`good-${i}`} example={ex} variant="good" />
            ))}
            {question.few_shot_bad.map((ex, i) => (
              <FewShotCard key={`bad-${i}`} example={ex} variant="bad" />
            ))}
          </div>
        </div>
      )}

      {question.few_shot_good.length === 0 &&
        question.few_shot_bad.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            No few-shot examples seeded for this question.
          </p>
        )}
    </div>
  )
}

// ── Section group ────────────────────────────────────────────────────────────

function SectionGroup({
  section,
  questions,
  expandedId,
  onToggleExpand,
  onToggleScored,
  onEdit,
}: {
  section: string
  questions: Question[]
  expandedId: string | null
  onToggleExpand: (id: string) => void
  onToggleScored: (id: string, scored: boolean) => void
  onEdit: (question: Question) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const scoredCount = questions.filter((q) => q.is_scored).length

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
          <Badge variant="secondary" className="text-xs">
            {questions.length} questions
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {scoredCount} scored / {questions.length - scoredCount} skipped
        </span>
      </button>

      {!collapsed && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Question</TableHead>
              <TableHead className="w-24">Type</TableHead>
              <TableHead className="w-24 text-center">Scored</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {questions.map((q) => (
              <QuestionRow
                key={q.id}
                question={q}
                isExpanded={expandedId === q.id}
                onToggleExpand={() => onToggleExpand(q.id)}
                onToggleScored={(scored) => onToggleScored(q.id, scored)}
                onEdit={() => onEdit(q)}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

// ── Question row ─────────────────────────────────────────────────────────────

function QuestionRow({
  question,
  isExpanded,
  onToggleExpand,
  onToggleScored,
  onEdit,
}: {
  question: Question
  isExpanded: boolean
  onToggleExpand: () => void
  onToggleScored: (scored: boolean) => void
  onEdit: () => void
}) {
  return (
    <>
      <TableRow
        className="cursor-pointer"
        onClick={onToggleExpand}
      >
        <TableCell className="font-mono text-xs text-muted-foreground">
          {question.question_number}
        </TableCell>
        <TableCell>
          <p className="text-sm line-clamp-2">{question.question_text}</p>
        </TableCell>
        <TableCell>
          <TypeBadge type={question.question_type} />
        </TableCell>
        <TableCell className="text-center">
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center justify-center gap-2"
          >
            <Switch
              checked={question.is_scored}
              onCheckedChange={onToggleScored}
            />
            <button
              onClick={onEdit}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Edit question"
            >
              <Pencil className="size-3.5" />
            </button>
          </div>
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow>
          <TableCell colSpan={4} className="bg-muted/20 px-6">
            <QuestionDetail question={question} />
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function QuestionManager() {
  const { roundId } = useParams<{ roundId: string }>()
  const {
    sections,
    stats,
    loading,
    error,
    toggleScored,
    updateQuestion,
  } = useQuestions(roundId)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null)

  const handleToggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  const handleToggleScored = async (questionId: string, isScored: boolean) => {
    await toggleScored(questionId, isScored)
  }

  const handleSaveQuestion = async (questionId: string, updates: Partial<Question>) => {
    return await updateQuestion(questionId, updates as Parameters<typeof updateQuestion>[1])
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-6">
        <Link to={`/rounds/${roundId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-4" />
            Back to Round
          </Button>
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Question Manager</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View and manage quiz questions, answer keys, and few-shot examples.
          </p>
        </div>
      </div>

      {/* Stats cards */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Total Questions
              </p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle className="size-3 text-green-600" />
                <p className="text-xs font-medium text-muted-foreground">
                  Scored
                </p>
              </div>
              <p className="text-2xl font-bold text-green-700">{stats.scored}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-1.5 mb-1">
                <XCircle className="size-3 text-slate-400" />
                <p className="text-xs font-medium text-muted-foreground">
                  Unscored
                </p>
              </div>
              <p className="text-2xl font-bold text-slate-500">
                {stats.unscored}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Types
              </p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(stats.byType).map(([type, count]) => (
                  <span key={type} className="text-xs text-muted-foreground">
                    {type}: {count}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center">
            <Loader2 className="size-8 animate-spin text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              Loading questions...
            </p>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {error && (
        <Card>
          <CardContent className="py-8">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-4" />
              <p className="text-sm">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !error && stats.total === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No Questions Yet</CardTitle>
            <CardDescription>
              Run the seed script to import questions from the answer key:
            </CardDescription>
          </CardHeader>
          <CardContent>
            <code className="text-sm bg-muted px-3 py-2 rounded-md block">
              npx tsx scripts/seed-questions.ts
            </code>
          </CardContent>
        </Card>
      )}

      {/* Questions by section */}
      {!loading && !error && stats.total > 0 && (
        <div className="space-y-4">
          {Object.entries(sections).map(([section, questions]) => (
            <SectionGroup
              key={section}
              section={section}
              questions={questions}
              expandedId={expandedId}
              onToggleExpand={handleToggleExpand}
              onToggleScored={handleToggleScored}
              onEdit={setEditingQuestion}
            />
          ))}
        </div>
      )}

      {/* Question Editor Dialog */}
      {editingQuestion && (
        <QuestionEditor
          question={editingQuestion}
          open={!!editingQuestion}
          onOpenChange={(open) => { if (!open) setEditingQuestion(null) }}
          onSave={handleSaveQuestion}
        />
      )}
    </div>
  )
}
