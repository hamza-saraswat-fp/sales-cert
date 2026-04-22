-- Sales Certification App – Retakes & Partial Credit
-- =====================================================
-- Adds support for:
--   1. Multiple submission attempts per student per round (retakes)
--   2. Half-point / partial credit grading

-- ── Retakes ───────────────────────────────────────────────────────────────────

-- Attempt ordering + flag for "the attempt to show in the default view".
ALTER TABLE submissions ADD COLUMN attempt_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE submissions ADD COLUMN is_current BOOLEAN NOT NULL DEFAULT true;

-- Replace the old (student_id, round_id) unique constraint with one that
-- includes attempt_number so multiple attempts can coexist.
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_student_id_round_id_key;
ALTER TABLE submissions
  ADD CONSTRAINT submissions_student_round_attempt_unique
  UNIQUE (student_id, round_id, attempt_number);

-- Partial unique index: enforce exactly one "current" attempt per (student, round).
CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_one_current_per_student_round
  ON submissions (student_id, round_id)
  WHERE is_current = true;

-- Speed up the common "current attempts in this round" query.
CREATE INDEX IF NOT EXISTS idx_submissions_round_current
  ON submissions (round_id, is_current);

-- ── Partial credit ────────────────────────────────────────────────────────────

-- Per-question opt-in: only questions flagged here can receive 'partial' grades.
ALTER TABLE questions
  ADD COLUMN allow_partial_credit BOOLEAN NOT NULL DEFAULT false;

-- Expand grade enums to include 'partial'.
ALTER TABLE responses DROP CONSTRAINT IF EXISTS responses_grade_check;
ALTER TABLE responses
  ADD CONSTRAINT responses_grade_check
  CHECK (grade IN ('correct', 'incorrect', 'partial', 'clarify', 'pending', 'skipped'));

ALTER TABLE responses DROP CONSTRAINT IF EXISTS responses_admin_override_grade_check;
ALTER TABLE responses
  ADD CONSTRAINT responses_admin_override_grade_check
  CHECK (admin_override_grade IN ('correct', 'incorrect', 'partial', 'clarify'));
