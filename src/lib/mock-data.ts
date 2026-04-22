/**
 * Demo / mock data for running the app without Supabase.
 * When VITE_SUPABASE_URL is not set (or set to <placeholder>), pages
 * use this data instead of making real API calls.
 */

import type {
  QuizRound,
  Question,
  Student,
  ModelOption,
  GradeValue,
  QuestionType,
  FewShotExample,
} from './types'

// ── Helpers ─────────────────────────────────────────────────────────────────

let _id = 0
const uid = () => `demo-${++_id}`

// ── Feature flag ────────────────────────────────────────────────────────────

const sbUrl = import.meta.env.VITE_SUPABASE_URL
const sbKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const IS_DEMO = !sbUrl || sbUrl === '<placeholder>' || !sbKey || sbKey === '<placeholder>'

// ── Round ───────────────────────────────────────────────────────────────────

export const DEMO_ROUND_ID = 'demo-round-1'

export const demoRound: QuizRound = {
  id: DEMO_ROUND_ID,
  name: 'Q2 2026 Sales Certification – Platform Knowledge',
  description: 'Quarterly FieldPulse platform knowledge assessment for the sales team.',
  created_at: '2026-03-29T12:00:00Z',
  updated_at: '2026-04-01T18:30:00Z',
  is_active: true,
}

// ── Questions (sample of 12 across 3 sections) ─────────────────────────────

function q(
  n: number,
  section: string,
  text: string,
  key: string,
  type: QuestionType = 'short',
  scored = true,
  keyPoints: string[] = [],
  good: FewShotExample[] = [],
  bad: FewShotExample[] = [],
  allowPartial = false,
): Question {
  return {
    id: `demo-q-${n}`,
    round_id: DEMO_ROUND_ID,
    question_number: n,
    section,
    question_text: text,
    answer_key: key,
    key_points: keyPoints,
    question_type: type,
    is_scored: scored,
    allow_partial_credit: allowPartial,
    few_shot_good: good,
    few_shot_bad: bad,
    doc_context: null,
    doc_context_fetched_at: null,
    created_at: '2026-03-29T12:00:00Z',
    updated_at: '2026-03-29T12:00:00Z',
  }
}

export const demoQuestions: Question[] = [
  q(1, 'Getting Started', 'What is FieldPulse and what industry does it serve?',
    'FieldPulse is a field service management software platform built for trades and service businesses.',
    'short', true,
    ['field service management', 'trades/service businesses'],
    [{ response: 'FieldPulse is a field service management platform for trades and service companies.', explanation: 'Covers the core product and target market.' }],
    [{ response: 'It is a CRM.', explanation: 'Misses the field service management focus and target industry.' }],
  ),
  q(2, 'Getting Started', 'Can FieldPulse be used on mobile devices?',
    'Yes', 'yes_no', true,
    ['mobile app available', 'iOS and Android'],
  ),
  q(3, 'Getting Started', 'List three main features of FieldPulse.',
    'Scheduling & Dispatching, Invoicing, Customer Management, Estimates, GPS Tracking, Reporting.',
    'list', true,
    ['scheduling', 'invoicing', 'customer management'],
  ),
  q(4, 'Getting Started', 'Upload a screenshot of the FieldPulse dashboard.',
    'N/A – screenshot verification', 'screenshot', false,
  ),
  q(5, 'Scheduling & Dispatching', 'How do you create a new job in FieldPulse?',
    'Navigate to the Jobs section, click "+ New Job", fill in customer info, assign a technician, set the date/time, and save.',
    'long', true,
    ['Jobs section', 'New Job button', 'assign technician', 'set date/time'],
  ),
  q(6, 'Scheduling & Dispatching', 'Does FieldPulse support recurring jobs?',
    'Yes', 'yes_no', true,
    ['recurring job support', 'repeat schedules'],
  ),
  q(7, 'Scheduling & Dispatching', 'What dispatching views are available?',
    'Calendar view, Map view, and List view.',
    'list', true,
    ['calendar view', 'map view', 'list view'],
    [],
    [],
    true,
  ),
  q(8, 'Invoicing & Payments', 'How does a technician create an invoice on-site?',
    'From the completed job, tap "Create Invoice", review line items, apply discounts if needed, and send to the customer via email or collect payment on the spot.',
    'long', true,
    ['from completed job', 'Create Invoice', 'line items', 'send or collect payment'],
  ),
  q(9, 'Invoicing & Payments', 'What payment methods does FieldPulse support?',
    'Credit/debit cards, ACH bank transfers, cash, and check.',
    'list', true,
    ['credit/debit cards', 'ACH', 'cash', 'check'],
  ),
  q(10, 'Invoicing & Payments', 'Can you set up automatic payment reminders?',
    'Yes', 'yes_no', true,
    ['automatic reminders', 'overdue invoices'],
  ),
  q(11, 'Invoicing & Payments', 'What is the QuickBooks integration used for?',
    'Syncing invoices, payments, and customer records between FieldPulse and QuickBooks for seamless accounting.',
    'short', true,
    ['invoice sync', 'payment sync', 'customer sync', 'QuickBooks'],
  ),
  q(12, 'Invoicing & Payments', 'Upload a screenshot showing an invoice.',
    'N/A – screenshot verification', 'screenshot', false,
  ),
]

// ── Students & responses ────────────────────────────────────────────────────

interface DemoStudent {
  student: Student
  submissionId: string
  responses: DemoResponse[]
}

interface DemoResponse {
  id: string
  questionId: string
  rawResponse: string | null
  grade: GradeValue
  confidence: number | null
  aiReasoning: string | null
  modelUsed: string | null
  adminOverrideGrade: string | null
  adminNotes: string | null
}

function makeStudent(
  name: string,
  email: string,
  grades: { qNum: number; grade: GradeValue; conf: number | null; response: string | null; reasoning?: string }[]
): DemoStudent {
  const sid = uid()
  const subId = uid()
  return {
    student: {
      id: sid,
      email,
      display_name: name,
      created_at: '2026-03-29T22:54:00Z',
    },
    submissionId: subId,
    responses: grades.map((g) => ({
      id: uid(),
      questionId: `demo-q-${g.qNum}`,
      rawResponse: g.response,
      grade: g.grade,
      confidence: g.conf,
      aiReasoning: g.reasoning || (g.grade === 'correct' ? 'The response accurately addresses the key points.' : g.grade === 'incorrect' ? 'The response is missing critical information or is inaccurate.' : g.grade === 'clarify' ? '[Medium confidence] The response partially addresses the question but needs more detail.' : null),
      modelUsed: g.conf !== null ? 'anthropic/claude-3.5-haiku' : null,
      adminOverrideGrade: null,
      adminNotes: null,
    })),
  }
}

export const demoStudents: DemoStudent[] = [
  makeStudent('Sarah Johnson', 'sarah.johnson@fieldpulse.com', [
    { qNum: 1, grade: 'correct', conf: 95, response: 'FieldPulse is a field service management software designed for trades and service businesses like HVAC, plumbing, and electrical companies.' },
    { qNum: 2, grade: 'correct', conf: 99, response: 'Yes' },
    { qNum: 3, grade: 'correct', conf: 91, response: 'Scheduling & Dispatching, Invoicing & Payments, and Customer Management.' },
    { qNum: 4, grade: 'skipped', conf: null, response: 'https://example.com/screenshot1.png' },
    { qNum: 5, grade: 'correct', conf: 88, response: 'Go to Jobs, click the plus button for New Job, fill in the customer details and assign a tech, pick the date and time, then save it.' },
    { qNum: 6, grade: 'correct', conf: 98, response: 'Yes' },
    { qNum: 7, grade: 'correct', conf: 92, response: 'Calendar view, Map view, and List view.' },
    { qNum: 8, grade: 'correct', conf: 87, response: 'After completing a job, tap Create Invoice, check the line items, apply any discounts, and either email it or collect payment right there.' },
    { qNum: 9, grade: 'correct', conf: 93, response: 'Credit cards, debit cards, ACH transfers, cash, and checks.' },
    { qNum: 10, grade: 'correct', conf: 97, response: 'Yes' },
    { qNum: 11, grade: 'clarify', conf: 72, response: 'It syncs data with QuickBooks.', reasoning: '[Medium confidence] The response mentions syncing but doesn\'t specify what data is synced (invoices, payments, customer records).' },
    { qNum: 12, grade: 'skipped', conf: null, response: 'https://example.com/screenshot2.png' },
  ]),
  makeStudent('Mike Torres', 'mike.torres@fieldpulse.com', [
    { qNum: 1, grade: 'correct', conf: 90, response: 'FieldPulse is field service management software for service and trades businesses.' },
    { qNum: 2, grade: 'correct', conf: 99, response: 'Yes, it has iOS and Android apps.' },
    { qNum: 3, grade: 'clarify', conf: 68, response: 'Scheduling and invoicing.', reasoning: '[Medium confidence] Only listed 2 features instead of the requested 3.' },
    { qNum: 4, grade: 'skipped', conf: null, response: null },
    { qNum: 5, grade: 'correct', conf: 86, response: 'Navigate to Jobs, press "+ New Job", enter customer info, assign the technician, set date/time and save.' },
    { qNum: 6, grade: 'incorrect', conf: 88, response: 'No', reasoning: 'FieldPulse does support recurring jobs. The answer is Yes.' },
    { qNum: 7, grade: 'correct', conf: 90, response: 'Calendar, Map, and List views.' },
    { qNum: 8, grade: 'clarify', conf: 65, response: 'Create an invoice from the job and send it.', reasoning: '[Medium confidence] Missing details about reviewing line items and payment collection options.' },
    { qNum: 9, grade: 'correct', conf: 91, response: 'Cards, ACH, cash, check.' },
    { qNum: 10, grade: 'correct', conf: 97, response: 'Yes' },
    { qNum: 11, grade: 'correct', conf: 89, response: 'The QuickBooks integration syncs invoices, payments, and customers between FieldPulse and QuickBooks for accounting.' },
    { qNum: 12, grade: 'skipped', conf: null, response: null },
  ]),
  makeStudent('Jessica Chen', 'jessica.chen@fieldpulse.com', [
    { qNum: 1, grade: 'incorrect', conf: 87, response: 'FieldPulse is a CRM tool.', reasoning: 'FieldPulse is specifically a field service management platform, not just a CRM.' },
    { qNum: 2, grade: 'correct', conf: 99, response: 'Yes' },
    { qNum: 3, grade: 'correct', conf: 88, response: 'Scheduling, Invoicing, Customer Management.' },
    { qNum: 4, grade: 'skipped', conf: null, response: 'https://example.com/screenshot3.png' },
    { qNum: 5, grade: 'pending', conf: null, response: 'Click new job and fill everything in.' },
    { qNum: 6, grade: 'pending', conf: null, response: 'I think so' },
    { qNum: 7, grade: 'pending', conf: null, response: 'Calendar and list' },
    { qNum: 8, grade: 'pending', conf: null, response: 'Make an invoice and send it to the customer.' },
    { qNum: 9, grade: 'correct', conf: 92, response: 'Credit cards, debit cards, ACH bank transfers, cash, and checks.' },
    { qNum: 10, grade: 'correct', conf: 96, response: 'Yes' },
    { qNum: 11, grade: 'correct', conf: 90, response: 'Syncing invoices, payments, and customer data between the two platforms.' },
    { qNum: 12, grade: 'skipped', conf: null, response: null },
  ]),
  makeStudent('David Park', 'david.park@fieldpulse.com', [
    { qNum: 1, grade: 'correct', conf: 93, response: 'FieldPulse is a field service management platform designed for trades and home service businesses.' },
    { qNum: 2, grade: 'correct', conf: 99, response: 'Yes, both iOS and Android.' },
    { qNum: 3, grade: 'correct', conf: 94, response: 'Scheduling & Dispatching, Invoicing & Payments, Customer Management, GPS Tracking.' },
    { qNum: 4, grade: 'skipped', conf: null, response: 'https://example.com/screenshot4.png' },
    { qNum: 5, grade: 'correct', conf: 91, response: 'Go to Jobs section, click "+ New Job", enter customer information, assign a technician, set the date and time, then save the job.' },
    { qNum: 6, grade: 'correct', conf: 98, response: 'Yes' },
    { qNum: 7, grade: 'correct', conf: 93, response: 'Calendar view, Map view, and List view.' },
    { qNum: 8, grade: 'correct', conf: 90, response: 'From a completed job, tap "Create Invoice", review and edit line items, apply any discounts, then send via email or collect payment on the spot with a card reader.' },
    { qNum: 9, grade: 'correct', conf: 95, response: 'Credit/debit cards, ACH bank transfers, cash, and check.' },
    { qNum: 10, grade: 'correct', conf: 98, response: 'Yes' },
    { qNum: 11, grade: 'correct', conf: 92, response: 'It syncs invoices, payments, and customer records between FieldPulse and QuickBooks to keep accounting seamless.' },
    { qNum: 12, grade: 'skipped', conf: null, response: 'https://example.com/screenshot5.png' },
  ]),
  makeStudent('Emily Rivera', 'emily.rivera@fieldpulse.com', [
    { qNum: 1, grade: 'correct', conf: 89, response: 'It\'s a field service management tool for trades businesses.' },
    { qNum: 2, grade: 'correct', conf: 99, response: 'Yes' },
    { qNum: 3, grade: 'incorrect', conf: 86, response: 'Email marketing, social media, and ads.', reasoning: 'These are not FieldPulse features. FieldPulse offers scheduling, invoicing, customer management, etc.' },
    { qNum: 4, grade: 'skipped', conf: null, response: null },
    { qNum: 5, grade: 'correct', conf: 85, response: 'In the Jobs area, click New Job, add the customer and technician, pick a time, and save.' },
    { qNum: 6, grade: 'correct', conf: 97, response: 'Yes' },
    { qNum: 7, grade: 'partial', conf: 88, response: 'Calendar and Map.', reasoning: 'Student named 2 of the 3 dispatching views (Calendar, Map). Missed List view. Partial credit awarded.' },
    { qNum: 8, grade: 'correct', conf: 86, response: 'From a finished job, create an invoice, review line items, and send it to the customer or take payment.' },
    { qNum: 9, grade: 'correct', conf: 91, response: 'Cards, ACH, cash, checks.' },
    { qNum: 10, grade: 'correct', conf: 97, response: 'Yes' },
    { qNum: 11, grade: 'incorrect', conf: 87, response: 'QuickBooks handles all the accounting in FieldPulse.', reasoning: 'QuickBooks doesn\'t handle accounting inside FieldPulse; the integration syncs data between the two separate platforms.' },
    { qNum: 12, grade: 'skipped', conf: null, response: null },
  ]),
]

// ── Computed student rows (for leaderboard) ─────────────────────────────────

export interface DemoStudentRow {
  studentId: string
  email: string
  displayName: string
  submissionId: string
  correct: number
  incorrect: number
  partial: number
  clarify: number
  pending: number
  skipped: number
  totalScored: number
  scorePercent: number
}

export function getDemoStudentRows(): DemoStudentRow[] {
  return demoStudents
    .map((ds) => {
      const counts = { correct: 0, incorrect: 0, partial: 0, clarify: 0, pending: 0, skipped: 0 }
      for (const r of ds.responses) {
        const effective = (r.adminOverrideGrade as GradeValue | null) || r.grade
        if (effective in counts) {
          counts[effective as keyof typeof counts]++
        }
      }
      const totalScored = counts.correct + counts.incorrect + counts.partial + counts.clarify + counts.pending
      const points = counts.correct + 0.5 * counts.partial
      const scorePercent = totalScored > 0 ? Math.round((points / totalScored) * 100) : 0

      return {
        studentId: ds.student.id,
        email: ds.student.email,
        displayName: ds.student.display_name,
        submissionId: ds.submissionId,
        ...counts,
        totalScored,
        scorePercent,
      }
    })
    .sort((a, b) => b.scorePercent - a.scorePercent)
}

// ── Models ──────────────────────────────────────────────────────────────────

export const demoModels: ModelOption[] = [
  { id: 'anthropic/claude-3.5-haiku', name: 'Haiku (Fast/Cheap)', cost_per_student: '$0.07' },
  { id: 'anthropic/claude-sonnet-4', name: 'Sonnet (Accurate)', cost_per_student: '$0.75' },
]

// ── Lookups ─────────────────────────────────────────────────────────────────

export function getDemoStudent(studentId: string): DemoStudent | undefined {
  return demoStudents.find((ds) => ds.student.id === studentId)
}
