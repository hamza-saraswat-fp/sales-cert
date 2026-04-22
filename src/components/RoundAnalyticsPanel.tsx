import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { Loader2, AlertCircle, ArrowUp, ArrowDown } from 'lucide-react'
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { getRoundAnalytics, type QuestionAnalytics, type RoundAnalytics } from '@/lib/analytics'

type SortKey = 'errorRate' | 'scorePercent' | 'avgConfidence' | 'question_number'

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

export function RoundAnalyticsPanel({ roundId }: { roundId: string }) {
  const [data, setData] = useState<RoundAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('errorRate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getRoundAnalytics(roundId)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load analytics')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [roundId])

  const sortedQuestions = useMemo(() => {
    if (!data) return []
    const arr = [...data.questions]
    arr.sort((a, b) => {
      let av: number
      let bv: number
      switch (sortKey) {
        case 'errorRate':
          av = a.errorRate
          bv = b.errorRate
          break
        case 'scorePercent':
          av = a.scorePercent
          bv = b.scorePercent
          break
        case 'avgConfidence':
          av = a.avgConfidence ?? -1
          bv = b.avgConfidence ?? -1
          break
        case 'question_number':
          av = a.question.question_number
          bv = b.question.question_number
          break
      }
      return sortDir === 'desc' ? bv - av : av - bv
    })
    return arr
  }, [data, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'question_number' ? 'asc' : 'desc')
    }
  }

  const SortHeader = ({ label, k, align = 'right' }: { label: string; k: SortKey; align?: 'left' | 'right' | 'center' }) => {
    const active = sortKey === k
    const alignCls = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
    return (
      <button
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 text-xs font-medium hover:text-foreground ${active ? 'text-foreground' : 'text-muted-foreground'} ${alignCls} w-full`}
      >
        {label}
        {active && (sortDir === 'desc' ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <p className="text-sm">{error}</p>
      </Alert>
    )
  }

  if (!data || data.questions.length === 0) {
    return (
      <Alert>
        <p className="text-sm">No scored questions with responses yet. Import a CSV and run grading to populate analytics.</p>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Overall Score</p>
            <p className="text-2xl font-bold">{data.overallScorePercent}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              across {data.totalScoredResponses} responses
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Students</p>
            <p className="text-2xl font-bold">{data.totalStudents}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Scored Questions</p>
            <p className="text-2xl font-bold">{data.questions.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Top missed */}
      {data.topMissed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Missed Questions</CardTitle>
            <p className="text-xs text-muted-foreground">
              Ranked by error rate — focus coaching on these.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Question</TableHead>
                  <TableHead className="text-center w-20">Answered</TableHead>
                  <TableHead className="text-right w-24">Error rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topMissed.map((a) => (
                  <TableRow key={a.question.id}>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      Q{a.question.question_number}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm line-clamp-2">{a.question.question_text}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{a.question.section}</p>
                    </TableCell>
                    <TableCell className="text-center text-sm">{a.answered}</TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm font-bold text-red-700">{pct(a.errorRate)}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Full question table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Questions</CardTitle>
          <p className="text-xs text-muted-foreground">Click a column header to sort.</p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-left">
                  <SortHeader label="#" k="question_number" align="left" />
                </TableHead>
                <TableHead>Question</TableHead>
                <TableHead className="text-center w-16">✓</TableHead>
                <TableHead className="text-center w-16">½</TableHead>
                <TableHead className="text-center w-16">✗</TableHead>
                <TableHead className="text-center w-16">?</TableHead>
                <TableHead className="text-right w-20">
                  <SortHeader label="Avg Conf" k="avgConfidence" />
                </TableHead>
                <TableHead className="text-right w-24">
                  <SortHeader label="Score" k="scorePercent" />
                </TableHead>
                <TableHead className="text-right w-24">
                  <SortHeader label="Error" k="errorRate" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedQuestions.map((a: QuestionAnalytics) => (
                <TableRow key={a.question.id}>
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {a.question.question_number}
                  </TableCell>
                  <TableCell>
                    <p className="text-sm line-clamp-1">{a.question.question_text}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{a.question.section}</p>
                  </TableCell>
                  <TableCell className="text-center text-sm text-green-700">{a.correct}</TableCell>
                  <TableCell className="text-center text-sm">
                    {a.partial > 0 ? <span className="text-amber-700">{a.partial}</span> : <span className="text-muted-foreground">0</span>}
                  </TableCell>
                  <TableCell className="text-center text-sm text-red-700">{a.incorrect}</TableCell>
                  <TableCell className="text-center text-sm text-yellow-700">{a.clarify}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {a.avgConfidence !== null ? `${a.avgConfidence}%` : '–'}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-sm font-medium">{a.answered > 0 ? `${a.scorePercent}%` : '–'}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`text-sm font-bold ${a.errorRate > 0.3 ? 'text-red-700' : a.errorRate > 0.1 ? 'text-amber-700' : 'text-muted-foreground'}`}>
                      {a.answered > 0 ? pct(a.errorRate) : '–'}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* By section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">By Section</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.bySection.map((s) => (
              <div key={s.section} className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.section}</p>
                  <p className="text-xs text-muted-foreground">{s.questions.length} questions</p>
                </div>
                <div className="w-48">
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full transition-all ${s.errorRate > 0.3 ? 'bg-red-500' : s.errorRate > 0.1 ? 'bg-amber-400' : 'bg-green-500'}`}
                      style={{ width: `${Math.min(100, s.errorRate * 100)}%` }}
                    />
                  </div>
                </div>
                <Badge variant="outline" className="w-16 justify-center">{pct(s.errorRate)}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
