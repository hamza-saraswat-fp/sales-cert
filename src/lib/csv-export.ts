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

const CSV_HEADERS = [
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

interface StudentBlock {
  studentName: string
  email: string
  rows: string[]
  correct: number
  incorrect: number
  clarify: number
  partial: number
  total: number
}

function countsFromGrade(effectiveGrade: string, isScored: boolean, block: StudentBlock) {
  if (effectiveGrade === 'correct') block.correct++
  else if (effectiveGrade === 'incorrect') block.incorrect++
  else if (effectiveGrade === 'clarify') block.clarify++
  else if (effectiveGrade === 'partial') block.partial++
  if (isScored && effectiveGrade !== 'skipped') block.total++
}

function summaryRow(block: StudentBlock): string {
  const points = block.correct + 0.5 * block.partial
  const pct = block.total > 0 ? Math.round((points / block.total) * 100) : 0
  const parts = [`${block.correct} correct`, `${block.incorrect} incorrect`]
  if (block.partial > 0) parts.push(`${block.partial} partial`)
  parts.push(`${block.clarify} clarify`)
  return [
    escapeCell(block.studentName),
    escapeCell(block.email),
    '',
    '',
    'SUMMARY',
    '',
    parts.join(' / '),
    `${pct}%`,
    '',
    '',
    '',
  ].join(',')
}

function triggerDownload(rows: string[], filename: string): void {
  const csvContent = rows.join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function safeSlug(value: string): string {
  return value.replace(/[^a-z0-9-]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'export'
}

// ── Bulk round export ─────────────────────────────────────────────────────────

export async function exportGradesCsv(roundId: string, _questions?: Question[]): Promise<void> {
  const rows: string[] = [CSV_HEADERS]

  if (IS_DEMO) {
    for (const ds of demoStudents) {
      const block: StudentBlock = {
        studentName: ds.student.display_name,
        email: ds.student.email,
        rows: [],
        correct: 0,
        incorrect: 0,
        clarify: 0,
        partial: 0,
        total: 0,
      }

      for (const r of ds.responses) {
        const q = demoQuestions.find((dq) => dq.id === r.questionId)
        if (!q) continue

        const effectiveGrade = r.adminOverrideGrade || r.grade
        countsFromGrade(effectiveGrade, q.is_scored, block)

        rows.push(
          rowToCsv({
            studentName: block.studentName,
            email: block.email,
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

      rows.push(summaryRow(block))
    }
  } else {
    const { data: submissions } = await supabase
      .from('submissions')
      .select('id, students(id, email, display_name)')
      .eq('round_id', roundId)
      .eq('is_current', true)

    for (const sub of submissions || []) {
      const student = (sub as unknown as { students: { id: string; email: string; display_name: string } }).students

      const { data: responses } = await supabase
        .from('responses')
        .select('*, questions(*)')
        .eq('submission_id', sub.id)
        .order('question_id')

      const block: StudentBlock = {
        studentName: student.display_name,
        email: student.email,
        rows: [],
        correct: 0,
        incorrect: 0,
        clarify: 0,
        partial: 0,
        total: 0,
      }

      for (const r of responses || []) {
        const q = r.questions as unknown as Question
        const effectiveGrade = r.admin_override_grade || r.grade
        countsFromGrade(effectiveGrade, q.is_scored, block)

        rows.push(
          rowToCsv({
            studentName: block.studentName,
            email: block.email,
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

      rows.push(summaryRow(block))
    }
  }

  triggerDownload(rows, `grades-export-${new Date().toISOString().slice(0, 10)}.csv`)
}

// ── Single-student export ─────────────────────────────────────────────────────

export async function exportStudentGradesCsv(
  submissionId: string,
  options?: { roundName?: string }
): Promise<void> {
  const rows: string[] = [CSV_HEADERS]
  let studentEmail = 'student'

  if (IS_DEMO) {
    const ds = demoStudents.find((s) => s.submissionId === submissionId)
    if (!ds) throw new Error('Student not found in demo data')
    studentEmail = ds.student.email

    const block: StudentBlock = {
      studentName: ds.student.display_name,
      email: ds.student.email,
      rows: [],
      correct: 0,
      incorrect: 0,
      clarify: 0,
      partial: 0,
      total: 0,
    }

    for (const r of ds.responses) {
      const q = demoQuestions.find((dq) => dq.id === r.questionId)
      if (!q) continue

      const effectiveGrade = r.adminOverrideGrade || r.grade
      countsFromGrade(effectiveGrade, q.is_scored, block)

      rows.push(
        rowToCsv({
          studentName: block.studentName,
          email: block.email,
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

    rows.push(summaryRow(block))
  } else {
    const { data: submission, error: subErr } = await supabase
      .from('submissions')
      .select('id, students(id, email, display_name)')
      .eq('id', submissionId)
      .single()

    if (subErr || !submission) throw new Error(subErr?.message || 'Submission not found')

    const student = (submission as unknown as { students: { id: string; email: string; display_name: string } }).students
    studentEmail = student.email

    const { data: responses, error: rErr } = await supabase
      .from('responses')
      .select('*, questions(*)')
      .eq('submission_id', submissionId)
      .order('question_id')

    if (rErr) throw new Error(rErr.message)

    const block: StudentBlock = {
      studentName: student.display_name,
      email: student.email,
      rows: [],
      correct: 0,
      incorrect: 0,
      clarify: 0,
      partial: 0,
      total: 0,
    }

    for (const r of responses || []) {
      const q = r.questions as unknown as Question
      const effectiveGrade = r.admin_override_grade || r.grade
      countsFromGrade(effectiveGrade, q.is_scored, block)

      rows.push(
        rowToCsv({
          studentName: block.studentName,
          email: block.email,
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

    rows.push(summaryRow(block))
  }

  const date = new Date().toISOString().slice(0, 10)
  const roundSlug = options?.roundName ? `-${safeSlug(options.roundName)}` : ''
  const filename = `${safeSlug(studentEmail)}${roundSlug}-${date}.csv`
  triggerDownload(rows, filename)
}
