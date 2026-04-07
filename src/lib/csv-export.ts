import { supabase } from './supabase'
import { IS_DEMO, demoStudents, demoQuestions } from './mock-data'
import type { Question } from './types'

interface ExportRow {
  studentName: string
  email: string
  questionNumber: number
  section: string
  questionText: string
  studentResponse: string
  grade: string
  confidence: string
  aiReasoning: string
  adminOverride: string
  answerKey: string
}

function escapeCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function rowToCsv(row: ExportRow): string {
  return [
    row.studentName,
    row.email,
    String(row.questionNumber),
    row.section,
    row.questionText,
    row.studentResponse,
    row.grade,
    row.confidence,
    row.aiReasoning,
    row.adminOverride,
    row.answerKey,
  ]
    .map(escapeCell)
    .join(',')
}

export async function exportGradesCsv(roundId: string, _questions?: Question[]): Promise<void> {
  const headers = [
    'Student Name',
    'Email',
    'Question #',
    'Section',
    'Question',
    'Student Response',
    'Grade',
    'Confidence',
    'AI Reasoning',
    'Admin Override',
    'Answer Key',
  ].join(',')

  const rows: string[] = [headers]

  if (IS_DEMO) {
    // Build from demo data
    for (const ds of demoStudents) {
      let correct = 0
      let incorrect = 0
      let clarify = 0
      let total = 0

      for (const r of ds.responses) {
        const q = demoQuestions.find((dq) => dq.id === r.questionId)
        if (!q) continue

        const effectiveGrade = r.adminOverrideGrade || r.grade
        if (effectiveGrade === 'correct') correct++
        else if (effectiveGrade === 'incorrect') incorrect++
        else if (effectiveGrade === 'clarify') clarify++
        if (q.is_scored && effectiveGrade !== 'skipped') total++

        rows.push(
          rowToCsv({
            studentName: ds.student.display_name,
            email: ds.student.email,
            questionNumber: q.question_number,
            section: q.section,
            questionText: q.question_text,
            studentResponse: r.rawResponse || '',
            grade: effectiveGrade,
            confidence: r.confidence !== null ? `${r.confidence}%` : '',
            aiReasoning: r.aiReasoning || '',
            adminOverride: r.adminOverrideGrade || '',
            answerKey: q.answer_key,
          })
        )
      }

      // Summary row
      const pct = total > 0 ? Math.round((correct / total) * 100) : 0
      rows.push(
        [
          escapeCell(ds.student.display_name),
          escapeCell(ds.student.email),
          '',
          '',
          'SUMMARY',
          '',
          `${correct} correct / ${incorrect} incorrect / ${clarify} clarify`,
          `${pct}%`,
          '',
          '',
          '',
        ].join(',')
      )
    }
  } else {
    // Live Supabase data
    const { data: submissions } = await supabase
      .from('submissions')
      .select('id, students(id, email, display_name)')
      .eq('round_id', roundId)

    for (const sub of submissions || []) {
      const student = (sub as unknown as { students: { id: string; email: string; display_name: string } }).students

      const { data: responses } = await supabase
        .from('responses')
        .select('*, questions(*)')
        .eq('submission_id', sub.id)
        .order('question_id')

      let correct = 0
      let incorrect = 0
      let clarify = 0
      let total = 0

      for (const r of responses || []) {
        const q = r.questions as unknown as Question
        const effectiveGrade = r.admin_override_grade || r.grade

        if (effectiveGrade === 'correct') correct++
        else if (effectiveGrade === 'incorrect') incorrect++
        else if (effectiveGrade === 'clarify') clarify++
        if (q.is_scored && effectiveGrade !== 'skipped') total++

        rows.push(
          rowToCsv({
            studentName: student.display_name,
            email: student.email,
            questionNumber: q.question_number,
            section: q.section,
            questionText: q.question_text,
            studentResponse: r.raw_response || '',
            grade: effectiveGrade,
            confidence: r.confidence !== null ? `${r.confidence}%` : '',
            aiReasoning: r.ai_reasoning || '',
            adminOverride: r.admin_override_grade || '',
            answerKey: q.answer_key,
          })
        )
      }

      // Summary row
      const pct = total > 0 ? Math.round((correct / total) * 100) : 0
      rows.push(
        [
          escapeCell(student.display_name),
          escapeCell(student.email),
          '',
          '',
          'SUMMARY',
          '',
          `${correct} correct / ${incorrect} incorrect / ${clarify} clarify`,
          `${pct}%`,
          '',
          '',
          '',
        ].join(',')
      )
    }
  }

  // Download
  const csvContent = rows.join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `grades-export-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
