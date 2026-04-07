import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PlusCircle, ChevronRight, Users, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { IS_DEMO, demoRound, demoQuestions, getDemoStudentRows } from '@/lib/mock-data'
import type { QuizRound } from '@/lib/types'

interface RoundSummary {
  round: QuizRound
  questionCount: number
  studentCount: number
}

export default function Dashboard() {
  const [rounds, setRounds] = useState<RoundSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (IS_DEMO) {
        setRounds([
          {
            round: demoRound,
            questionCount: demoQuestions.length,
            studentCount: getDemoStudentRows().length,
          },
        ])
        setLoading(false)
        return
      }

      const { data: roundData } = await supabase
        .from('quiz_rounds')
        .select('*')
        .order('created_at', { ascending: false })

      const summaries: RoundSummary[] = []
      for (const r of (roundData || []) as QuizRound[]) {
        const { count: qCount } = await supabase
          .from('questions')
          .select('*', { count: 'exact', head: true })
          .eq('round_id', r.id)

        const { count: sCount } = await supabase
          .from('submissions')
          .select('*', { count: 'exact', head: true })
          .eq('round_id', r.id)

        summaries.push({
          round: r,
          questionCount: qCount || 0,
          studentCount: sCount || 0,
        })
      }

      setRounds(summaries)
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Sales Certification</h1>
          <p className="text-muted-foreground">FieldPulse quiz grading dashboard</p>
        </div>
        <Button disabled={IS_DEMO}>
          <PlusCircle className="size-4" />
          New Round
        </Button>
      </div>

      {IS_DEMO && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <strong>Demo Mode</strong> – Browsing with sample data. Connect Supabase in{' '}
          <code className="text-xs bg-blue-100 px-1 rounded">.env.local</code> for real data.
        </div>
      )}

      {loading ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center">
            <Loader2 className="size-8 animate-spin text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Loading rounds...</p>
          </CardContent>
        </Card>
      ) : rounds.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Quiz Rounds</CardTitle>
            <CardDescription>
              No rounds yet. Create a round and import questions to get started.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Rounds will appear here once created.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rounds.map(({ round, questionCount, studentCount }) => (
            <Link key={round.id} to={`/rounds/${round.id}`}>
              <Card className="hover:bg-muted/30 transition-colors cursor-pointer">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-base">{round.name}</h3>
                      {round.description && (
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {round.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        <Badge variant="secondary">
                          {questionCount} questions
                        </Badge>
                        <Badge variant="secondary">
                          <Users className="size-3" />
                          {studentCount} students
                        </Badge>
                        {round.is_active && (
                          <Badge className="bg-green-100 text-green-700 border-green-200">
                            Active
                          </Badge>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="size-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
