// ── Quiz Rounds ──────────────────────────────────────────────────────────────

export interface QuizRound {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
  is_active: boolean
}

// ── Questions ────────────────────────────────────────────────────────────────

export type QuestionType = 'yes_no' | 'short' | 'long' | 'list' | 'screenshot'

export interface FewShotExample {
  response: string
  explanation: string
}

export interface Question {
  id: string
  round_id: string
  question_number: number
  section: string
  question_text: string
  answer_key: string
  key_points: string[]
  question_type: QuestionType
  is_scored: boolean
  allow_partial_credit: boolean
  few_shot_good: FewShotExample[]
  few_shot_bad: FewShotExample[]
  doc_context: string | null
  doc_context_fetched_at: string | null
  created_at: string
  updated_at: string
}

// ── Students ─────────────────────────────────────────────────────────────────

export interface Student {
  id: string
  email: string
  display_name: string
  created_at: string
}

// ── Submissions ──────────────────────────────────────────────────────────────

export interface Submission {
  id: string
  student_id: string
  round_id: string
  submitted_at: string | null
  imported_at: string
  attempt_number: number
  is_current: boolean
}

// ── Responses ────────────────────────────────────────────────────────────────

export type GradeValue = 'correct' | 'incorrect' | 'partial' | 'clarify' | 'pending' | 'skipped'
export type OverrideGradeValue = 'correct' | 'incorrect' | 'partial' | 'clarify' | null

export interface Response {
  id: string
  submission_id: string
  question_id: string
  raw_response: string | null

  // AI grading fields
  grade: GradeValue
  confidence: number | null
  ai_reasoning: string | null
  graded_at: string | null
  model_used: string | null

  // Admin override
  admin_override_grade: OverrideGradeValue
  admin_notes: string | null

  needs_rescore: boolean

  created_at: string
  updated_at: string
}

// ── Grading Config ───────────────────────────────────────────────────────────

export interface ConfidenceThresholds {
  auto_correct: number
  clarify_min: number
  flag_below: number
}

export interface ModelOption {
  id: string
  name: string
  cost_per_student: string
}

export interface GradingConfig {
  confidence_thresholds: ConfidenceThresholds
  admin_passcode: string
  default_model: string
  available_models: ModelOption[]
  mintlify_base_url: string
}

// ── AI Grading Response ──────────────────────────────────────────────────────

export interface AIGradeResult {
  grade: 'correct' | 'incorrect' | 'partial' | 'clarify'
  confidence: number
  reasoning: string
}

// ── Joined / Computed Types ──────────────────────────────────────────────────

export interface StudentWithScores extends Student {
  submission_id: string
  correct_count: number
  incorrect_count: number
  partial_count: number
  clarify_count: number
  pending_count: number
  skipped_count: number
  total_scored: number
  score_percentage: number
}

export interface ResponseWithQuestion extends Response {
  question: Question
}

// ── CSV Import Types ─────────────────────────────────────────────────────────

export interface CsvRow {
  [header: string]: string
}

export interface QuestionMatch {
  csv_header: string
  question_id: string | null
  question_text: string | null
  similarity: number
  matched: boolean
}

export interface CsvImportPreview {
  student_count: number
  question_matches: QuestionMatch[]
  matched_count: number
  unmatched_count: number
  warnings: string[]
}

export interface CsvImportResult {
  students_created: number
  students_updated: number
  submissions_created: number
  responses_created: number
  errors: string[]
}
