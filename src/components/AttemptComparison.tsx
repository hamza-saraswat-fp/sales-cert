import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { GradeBadge } from '@/components/GradeBadge'
import { ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { GradeValue, Question } from '@/lib/types'

export interface AttemptResponseData {
  questionId: string
  question: Question
  rawResponse: string | null
  grade: GradeValue
  adminOverrideGrade: string | null
  confidence: number | null
  effectiveGrade: string
}

export interface AttemptData {
  attemptNumber: number
  isCurrent: boolean
  submittedAt: string | null
  responses: AttemptResponseData[]
}

function calcScore(responses: AttemptResponseData[]): { percent: number; totalScored: number } {
  let correct = 0
  let partial = 0
  let totalScored = 0
  for (const r of responses) {
    const g = r.effectiveGrade
    if (g === 'skipped' || !r.question.is_scored) continue
    totalScored++
    if (g === 'correct') correct++
    else if (g === 'partial') partial++
  }
  const points = correct + 0.5 * partial
  return {
    percent: totalScored > 0 ? Math.round((points / totalScored) * 100) : 0,
    totalScored,
  }
}

// "Points" for delta-direction: correct=1, partial=0.5, everything else=0.
function gradePoints(g: string): number {
  if (g === 'correct') return 1
  if (g === 'partial') return 0.5
  return 0
}

function changeBadge(prev: string, next: string) {
  const delta = gradePoints(next) - gradePoints(prev)
  if (delta > 0) {
    return (
      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px]">
        <TrendingUp className="size-3" />
        improved
      </Badge>
    )
  }
  if (delta < 0) {
    return (
      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px]">
        <TrendingDown className="size-3" />
        regressed
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="bg-slate-50 text-muted-foreground text-[10px]">
      <Minus className="size-3" />
      same
    </Badge>
  )
}

export function AttemptComparison({ attempts }: { attempts: AttemptData[] }) {
  if (attempts.length < 2) {
    return (
      <Alert>
        <p className="text-sm">Only one attempt exists. Import a retake CSV to see a comparison.</p>
      </Alert>
    )
  }

  // Compare most recent two attempts by default (sorted ascending by attempt_number).
  const sorted = [...attempts].sort((a, b) => a.attemptNumber - b.attemptNumber)
  const earliest = sorted[0]
  const latest = sorted[sorted.length - 1]

  const earliestScore = calcScore(earliest.responses)
  const latestScore = calcScore(latest.responses)
  const delta = latestScore.percent - earliestScore.percent

  // Build a map keyed by questionId so we align rows across attempts.
  const questionIds = new Set<string>()
  for (const a of attempts) for (const r of a.responses) questionIds.add(r.questionId)

  const rows = Array.from(questionIds)
    .map((qid) => {
      const prev = earliest.responses.find((r) => r.questionId === qid)
      const curr = latest.responses.find((r) => r.questionId === qid)
      const q = curr?.question || prev?.question
      return { qid, question: q, prev, curr }
    })
    .filter((r) => r.question && r.question.is_scored)
    .sort((a, b) => (a.question!.question_number - b.question!.question_number))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Attempt {earliest.attemptNumber}</p>
            <p className="text-2xl font-bold">{earliestScore.totalScored > 0 ? `${earliestScore.percent}%` : '–'}</p>
            {earliest.submittedAt && (
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(earliest.submittedAt).toLocaleDateString()}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">
              Attempt {latest.attemptNumber} {latest.isCurrent && <span className="text-primary">(current)</span>}
            </p>
            <p className="text-2xl font-bold">{latestScore.totalScored > 0 ? `${latestScore.percent}%` : '–'}</p>
            {latest.submittedAt && (
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(latest.submittedAt).toLocaleDateString()}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Change</p>
            <p
              className={`text-2xl font-bold ${
                delta > 0 ? 'text-green-700' : delta < 0 ? 'text-red-700' : 'text-muted-foreground'
              }`}
            >
              {delta > 0 ? '+' : ''}
              {delta}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {delta > 0 ? 'Improved' : delta < 0 ? 'Declined' : 'No change'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Question-by-question</CardTitle>
          <p className="text-xs text-muted-foreground">
            Attempt {earliest.attemptNumber} → Attempt {latest.attemptNumber}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {rows.map(({ qid, question, prev, curr }) => (
              <div key={qid} className="px-4 py-3">
                <div className="flex items-start gap-3 mb-2">
                  <span className="text-xs font-mono text-muted-foreground w-6 shrink-0 pt-0.5">
                    {question!.question_number}
                  </span>
                  <p className="text-sm flex-1 line-clamp-2">{question!.question_text}</p>
                  {prev && curr && changeBadge(prev.effectiveGrade, curr.effectiveGrade)}
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-start ml-9">
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                      Attempt {earliest.attemptNumber}
                    </p>
                    {prev ? (
                      <>
                        <GradeBadge grade={prev.effectiveGrade as GradeValue} />
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3">
                          {prev.rawResponse || <span className="italic">No response</span>}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs italic text-muted-foreground">Not answered</p>
                    )}
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground mt-1" />
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                      Attempt {latest.attemptNumber}
                    </p>
                    {curr ? (
                      <>
                        <GradeBadge grade={curr.effectiveGrade as GradeValue} />
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3">
                          {curr.rawResponse || <span className="italic">No response</span>}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs italic text-muted-foreground">Not answered</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
