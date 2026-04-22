import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader2,
  Users,
  HelpCircle,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { parseCsvFile, type ParsedCsvData } from '@/lib/csv-parser'
import { matchQuestions, type MatchResult } from '@/lib/question-matcher'
import { supabase } from '@/lib/supabase'
import type { Question } from '@/lib/types'

// ── Types ────────────────────────────────────────────────────────────────────

type ImportStage = 'upload' | 'preview' | 'importing' | 'done' | 'error'

type RetakeMode = 'retake' | 'skip'

interface ImportSummary {
  studentsCreated: number
  studentsExisting: number
  submissionsCreated: number
  retakesCreated: number
  studentsSkipped: number
  responsesCreated: number
}

interface CsvImporterProps {
  roundId: string
  questions: Question[]
  onImportComplete: () => void
}

// ── Helper: derive display name from email ───────────────────────────────────

function nameFromEmail(email: string): string {
  const local = email.split('@')[0]
  return local
    .split(/[._-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

// ── Component ────────────────────────────────────────────────────────────────

export function CsvImporter({ roundId, questions, onImportComplete }: CsvImporterProps) {
  const [stage, setStage] = useState<ImportStage>('upload')
  const [csvData, setCsvData] = useState<ParsedCsvData | null>(null)
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null)
  const [importProgress, setImportProgress] = useState(0)
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  // Existing students detected in this round — surfaced to pick retake vs skip.
  const [existingEmails, setExistingEmails] = useState<Set<string>>(new Set())
  const [retakeMode, setRetakeMode] = useState<RetakeMode>('retake')

  // ── File handling ──────────────────────────────────────────────────────────

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith('.csv')) {
        setErrorMessage('Please upload a .csv file.')
        setStage('error')
        return
      }

      try {
        const parsed = await parseCsvFile(file)
        const matches = matchQuestions(parsed.questionHeaders, questions)

        // Pre-flight: find which uploaded emails already have a submission in this round.
        const uploadedEmails = parsed.rows.map((r) => r.email)
        let existing = new Set<string>()
        if (uploadedEmails.length > 0) {
          // 1. Find student rows for these emails.
          const { data: studentRows } = await supabase
            .from('students')
            .select('id, email')
            .in('email', uploadedEmails)

          const studentsByEmail = new Map<string, string>()
          for (const s of studentRows || []) {
            studentsByEmail.set((s as { email: string }).email, (s as { id: string }).id)
          }

          const studentIds = Array.from(studentsByEmail.values())
          if (studentIds.length > 0) {
            // 2. Find submissions for those students in this round.
            const { data: subRows } = await supabase
              .from('submissions')
              .select('student_id')
              .eq('round_id', roundId)
              .in('student_id', studentIds)

            const idsWithSubs = new Set((subRows || []).map((s) => (s as { student_id: string }).student_id))
            for (const [email, id] of studentsByEmail) {
              if (idsWithSubs.has(id)) existing.add(email)
            }
          }
        }

        setCsvData(parsed)
        setMatchResult(matches)
        setExistingEmails(existing)
        setRetakeMode('retake')
        setStage('preview')
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Failed to parse CSV file.'
        )
        setStage('error')
      }
    },
    [questions, roundId]
  )

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  // ── Import logic ───────────────────────────────────────────────────────────

  const handleConfirmImport = async () => {
    if (!csvData || !matchResult) return

    setStage('importing')
    setImportProgress(0)

    try {
      const matched = matchResult.matches.filter((m) => m.matched)
      const totalSteps = csvData.rows.length * 3 // upsert student + submission + responses
      let completedSteps = 0

      const updateProgress = () => {
        completedSteps++
        setImportProgress(Math.round((completedSteps / totalSteps) * 100))
      }

      let studentsCreated = 0
      let studentsExisting = 0
      let submissionsCreated = 0
      let retakesCreated = 0
      let studentsSkipped = 0
      let responsesCreated = 0

      for (const row of csvData.rows) {
        // 1. Upsert student by email
        const { data: existingStudent } = await supabase
          .from('students')
          .select('id')
          .eq('email', row.email)
          .single()

        let studentId: string

        if (existingStudent) {
          studentId = existingStudent.id
          studentsExisting++
        } else {
          const { data: newStudent, error: studentErr } = await supabase
            .from('students')
            .insert({
              email: row.email,
              display_name: nameFromEmail(row.email),
            })
            .select('id')
            .single()

          if (studentErr) throw new Error(`Failed to create student ${row.email}: ${studentErr.message}`)
          studentId = newStudent.id
          studentsCreated++
        }
        updateProgress()

        // 2. Find existing submissions for this (student, round); decide retake vs first vs skip.
        const submittedAt = row.timestamp
          ? parseGoogleFormsTimestamp(row.timestamp)
          : null

        const { data: priorSubs } = await supabase
          .from('submissions')
          .select('id, attempt_number, is_current')
          .eq('student_id', studentId)
          .eq('round_id', roundId)
          .order('attempt_number', { ascending: false })

        const hasPrior = (priorSubs || []).length > 0

        if (hasPrior && retakeMode === 'skip') {
          studentsSkipped++
          updateProgress() // submission step
          updateProgress() // responses step (we're not creating any)
          continue
        }

        let submissionId: string

        if (!hasPrior) {
          // First attempt.
          const { data: newSub, error: subErr } = await supabase
            .from('submissions')
            .insert({
              student_id: studentId,
              round_id: roundId,
              submitted_at: submittedAt,
              attempt_number: 1,
              is_current: true,
            })
            .select('id')
            .single()

          if (subErr) throw new Error(`Failed to create submission for ${row.email}: ${subErr.message}`)
          submissionId = newSub.id
          submissionsCreated++
        } else {
          // Retake: demote existing "current" attempts, create new attempt N+1.
          const currentId = priorSubs!.find((s) => s.is_current)?.id
          if (currentId) {
            await supabase
              .from('submissions')
              .update({ is_current: false })
              .eq('id', currentId)
          }

          const nextAttemptNumber = (priorSubs![0].attempt_number ?? 0) + 1

          const { data: newSub, error: subErr } = await supabase
            .from('submissions')
            .insert({
              student_id: studentId,
              round_id: roundId,
              submitted_at: submittedAt,
              attempt_number: nextAttemptNumber,
              is_current: true,
            })
            .select('id')
            .single()

          if (subErr) throw new Error(`Failed to create retake for ${row.email}: ${subErr.message}`)
          submissionId = newSub.id
          retakesCreated++
        }
        updateProgress()

        // 3. Create response records for each matched question (fresh rows on new submission).
        const responseRows = matched.map((m) => ({
          submission_id: submissionId,
          question_id: m.questionId!,
          raw_response: row.responses[m.csvHeader] || null,
          grade: 'pending' as const,
        }))

        for (let i = 0; i < responseRows.length; i += 50) {
          const batch = responseRows.slice(i, i + 50)

          const { error: respErr } = await supabase
            .from('responses')
            .upsert(batch, {
              onConflict: 'submission_id,question_id',
              ignoreDuplicates: true,
            })

          if (respErr) throw new Error(`Failed to create responses for ${row.email}: ${respErr.message}`)
          responsesCreated += batch.length
        }
        updateProgress()
      }

      setImportSummary({
        studentsCreated,
        studentsExisting,
        submissionsCreated,
        retakesCreated,
        studentsSkipped,
        responsesCreated,
      })
      setStage('done')
      const parts: string[] = [`${csvData.rows.length - studentsSkipped} imported`]
      if (retakesCreated > 0) parts.push(`${retakesCreated} retakes`)
      if (studentsSkipped > 0) parts.push(`${studentsSkipped} skipped`)
      toast.success('CSV import complete!', { description: parts.join(', ') })
      onImportComplete()
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Import failed unexpectedly.'
      )
      setStage('error')
      toast.error('Import failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  const handleReset = () => {
    setStage('upload')
    setCsvData(null)
    setMatchResult(null)
    setImportProgress(0)
    setImportSummary(null)
    setErrorMessage(null)
    setExistingEmails(new Set())
  }

  // ── Render: Upload stage ───────────────────────────────────────────────────

  if (stage === 'upload') {
    return (
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50'
        }`}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <Upload className="size-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm font-medium mb-1">
          Drop your Google Forms CSV here
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          or click to browse
        </p>
        <label>
          <input
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileInput}
          />
          <Button variant="outline" size="sm" asChild>
            <span>
              <FileSpreadsheet className="size-4" />
              Choose CSV File
            </span>
          </Button>
        </label>
      </div>
    )
  }

  // ── Render: Preview stage ──────────────────────────────────────────────────

  if (stage === 'preview' && csvData && matchResult) {
    const existingCount = existingEmails.size
    return (
      <div className="space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="size-4 text-blue-600" />
                <span className="text-xs font-medium text-muted-foreground">
                  Students
                </span>
              </div>
              <p className="text-xl font-bold">{csvData.rows.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="size-4 text-green-600" />
                <span className="text-xs font-medium text-muted-foreground">
                  Matched
                </span>
              </div>
              <p className="text-xl font-bold text-green-700">
                {matchResult.matchedCount}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <HelpCircle className="size-4 text-yellow-600" />
                <span className="text-xs font-medium text-muted-foreground">
                  Unmatched
                </span>
              </div>
              <p className="text-xl font-bold text-yellow-700">
                {matchResult.unmatchedCsvCount}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Retake detection */}
        {existingCount > 0 && (
          <Alert>
            <RefreshCw className="size-4" />
            <AlertTitle>Retake detected</AlertTitle>
            <AlertDescription>
              <p className="text-sm mb-2">
                {existingCount} of {csvData.rows.length} students already have a
                submission in this round.
              </p>
              <div className="space-y-2 mt-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="retake-mode"
                    value="retake"
                    checked={retakeMode === 'retake'}
                    onChange={() => setRetakeMode('retake')}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium">Save as retake</p>
                    <p className="text-xs text-muted-foreground">
                      Preserve their first attempt. Create a new attempt for comparison.
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="retake-mode"
                    value="skip"
                    checked={retakeMode === 'skip'}
                    onChange={() => setRetakeMode('skip')}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium">Skip existing students</p>
                    <p className="text-xs text-muted-foreground">
                      Only import rows for brand-new students.
                    </p>
                  </div>
                </label>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Student preview */}
        <div>
          <h4 className="text-sm font-medium mb-2">Student Preview</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Responses</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {csvData.rows.slice(0, 5).map((row) => {
                const filled = Object.values(row.responses).filter(
                  (v) => v !== null
                ).length
                const isExisting = existingEmails.has(row.email)
                return (
                  <TableRow key={row.email}>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-2">
                        {row.email}
                        {isExisting && (
                          <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                            retake
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {filled}/{matchResult.matchedCount}
                    </TableCell>
                  </TableRow>
                )
              })}
              {csvData.rows.length > 5 && (
                <TableRow>
                  <TableCell
                    colSpan={2}
                    className="text-center text-xs text-muted-foreground"
                  >
                    ...and {csvData.rows.length - 5} more students
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Unmatched columns */}
        {matchResult.unmatchedCsvCount > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <AlertTriangle className="size-4 text-yellow-600" />
              Unmatched CSV Columns ({matchResult.unmatchedCsvCount})
            </h4>
            <div className="max-h-40 overflow-y-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>CSV Header</TableHead>
                    <TableHead className="w-24 text-right">Best %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matchResult.matches
                    .filter((m) => !m.matched)
                    .map((m, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">
                          {m.csvHeader.length > 80
                            ? m.csvHeader.substring(0, 80) + '...'
                            : m.csvHeader}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant="outline"
                            className="text-xs bg-yellow-50 text-yellow-700"
                          >
                            {m.similarity}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Warnings */}
        {csvData.warnings.length > 0 && (
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertTitle>Warnings ({csvData.warnings.length})</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4 mt-1 space-y-0.5">
                {csvData.warnings.slice(0, 8).map((w, i) => (
                  <li key={i} className="text-xs">
                    {w}
                  </li>
                ))}
                {csvData.warnings.length > 8 && (
                  <li className="text-xs text-muted-foreground">
                    ...and {csvData.warnings.length - 8} more warnings
                  </li>
                )}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <Separator />

        {/* Action buttons */}
        <div className="flex justify-between">
          <Button variant="ghost" onClick={handleReset}>
            Cancel
          </Button>
          <Button onClick={handleConfirmImport}>
            <CheckCircle className="size-4" />
            Confirm Import ({csvData.rows.length} students,{' '}
            {matchResult.matchedCount} questions)
          </Button>
        </div>
      </div>
    )
  }

  // ── Render: Importing stage ────────────────────────────────────────────────

  if (stage === 'importing') {
    return (
      <div className="py-8 text-center space-y-4">
        <Loader2 className="size-8 animate-spin text-primary mx-auto" />
        <p className="text-sm font-medium">Importing responses...</p>
        <Progress value={importProgress} className="max-w-xs mx-auto" />
        <p className="text-xs text-muted-foreground">{importProgress}%</p>
      </div>
    )
  }

  // ── Render: Done stage ─────────────────────────────────────────────────────

  if (stage === 'done' && importSummary) {
    return (
      <div className="py-6 text-center space-y-4">
        <CheckCircle className="size-10 text-green-600 mx-auto" />
        <div>
          <p className="font-medium text-lg">Import Complete!</p>
          <p className="text-sm text-muted-foreground mt-1">
            {importSummary.studentsCreated} new, {importSummary.studentsExisting} existing.
            {importSummary.retakesCreated > 0 &&
              ` ${importSummary.retakesCreated} retakes saved.`}
            {importSummary.studentsSkipped > 0 &&
              ` ${importSummary.studentsSkipped} skipped.`}
            {' '}
            {importSummary.responsesCreated} responses.
          </p>
        </div>
        <Button variant="outline" onClick={handleReset}>
          Import Another CSV
        </Button>
      </div>
    )
  }

  // ── Render: Error stage ────────────────────────────────────────────────────

  if (stage === 'error') {
    return (
      <div className="py-6 text-center space-y-4">
        <XCircle className="size-10 text-destructive mx-auto" />
        <div>
          <p className="font-medium">Import Failed</p>
          <p className="text-sm text-muted-foreground mt-1">{errorMessage}</p>
        </div>
        <Button variant="outline" onClick={handleReset}>
          Try Again
        </Button>
      </div>
    )
  }

  return null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseGoogleFormsTimestamp(ts: string): string | null {
  try {
    // Google Forms format: "3/29/2026 22:54:55"
    const [datePart, timePart] = ts.split(' ')
    if (!datePart || !timePart) return null

    const [month, day, year] = datePart.split('/')
    if (!month || !day || !year) return null

    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${timePart}Z`
  } catch {
    return null
  }
}
