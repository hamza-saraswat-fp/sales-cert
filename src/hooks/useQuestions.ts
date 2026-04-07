import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { IS_DEMO, demoQuestions } from '@/lib/mock-data'
import type { Question } from '@/lib/types'

export function useQuestions(roundId: string | undefined) {
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchQuestions = useCallback(async () => {
    if (!roundId) return

    setLoading(true)
    setError(null)

    if (IS_DEMO) {
      setQuestions(demoQuestions)
      setLoading(false)
      return
    }

    const { data, error: fetchError } = await supabase
      .from('questions')
      .select('*')
      .eq('round_id', roundId)
      .order('question_number', { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
      setLoading(false)
      return
    }

    setQuestions(data as Question[])
    setLoading(false)
  }, [roundId])

  useEffect(() => {
    fetchQuestions()
  }, [fetchQuestions])

  const toggleScored = async (questionId: string, isScored: boolean) => {
    const { error: updateError } = await supabase
      .from('questions')
      .update({ is_scored: isScored, updated_at: new Date().toISOString() })
      .eq('id', questionId)

    if (updateError) {
      setError(updateError.message)
      return false
    }

    // Optimistic update
    setQuestions((prev) =>
      prev.map((q) => (q.id === questionId ? { ...q, is_scored: isScored } : q))
    )
    return true
  }

  const updateQuestion = async (
    questionId: string,
    updates: Partial<Pick<Question, 'answer_key' | 'key_points' | 'few_shot_good' | 'few_shot_bad' | 'is_scored' | 'question_type'>>
  ) => {
    const { error: updateError } = await supabase
      .from('questions')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', questionId)

    if (updateError) {
      setError(updateError.message)
      return false
    }

    setQuestions((prev) =>
      prev.map((q) => (q.id === questionId ? { ...q, ...updates } : q))
    )
    return true
  }

  // Group questions by section
  const sections = questions.reduce<Record<string, Question[]>>((acc, q) => {
    if (!acc[q.section]) acc[q.section] = []
    acc[q.section].push(q)
    return acc
  }, {})

  const stats = {
    total: questions.length,
    scored: questions.filter((q) => q.is_scored).length,
    unscored: questions.filter((q) => !q.is_scored).length,
    byType: questions.reduce<Record<string, number>>((acc, q) => {
      acc[q.question_type] = (acc[q.question_type] || 0) + 1
      return acc
    }, {}),
  }

  return {
    questions,
    sections,
    stats,
    loading,
    error,
    toggleScored,
    updateQuestion,
    refetch: fetchQuestions,
  }
}
