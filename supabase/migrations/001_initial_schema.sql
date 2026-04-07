-- Sales Certification App – Initial Schema
-- ==========================================

-- Quiz Rounds: represents a certification cohort/round
CREATE TABLE quiz_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);

-- Questions: the master question bank
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID REFERENCES quiz_rounds(id) ON DELETE CASCADE,
  question_number INTEGER NOT NULL,
  section TEXT NOT NULL,
  question_text TEXT NOT NULL,
  answer_key TEXT NOT NULL,
  key_points JSONB DEFAULT '[]'::jsonb,
  question_type TEXT CHECK (question_type IN ('yes_no', 'short', 'long', 'list', 'screenshot')),
  is_scored BOOLEAN DEFAULT true,
  few_shot_good JSONB DEFAULT '[]'::jsonb,
  few_shot_bad JSONB DEFAULT '[]'::jsonb,
  doc_context TEXT,
  doc_context_fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Students: unique by email address
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Submissions: one row per student per round
CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  round_id UUID REFERENCES quiz_rounds(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ,
  imported_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, round_id)
);

-- Responses: one row per student per question, stores raw response + AI grade
CREATE TABLE responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  raw_response TEXT,

  -- AI grading fields
  grade TEXT CHECK (grade IN ('correct', 'incorrect', 'clarify', 'pending', 'skipped')),
  confidence NUMERIC(5,2),
  ai_reasoning TEXT,
  graded_at TIMESTAMPTZ,
  model_used TEXT,

  -- Admin override
  admin_override_grade TEXT CHECK (admin_override_grade IN ('correct', 'incorrect', 'clarify')),
  admin_notes TEXT,

  needs_rescore BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(submission_id, question_id)
);

-- Grading Config: app-level configuration
CREATE TABLE grading_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed grading config with defaults
INSERT INTO grading_config (key, value) VALUES
  ('confidence_thresholds', '{"auto_correct": 85, "clarify_min": 60, "flag_below": 60}'::jsonb),
  ('admin_passcode', '"fieldpulse2026"'::jsonb),
  ('default_model', '"anthropic/claude-3.5-haiku"'::jsonb),
  ('available_models', '[
    {"id": "anthropic/claude-3.5-haiku", "name": "Haiku (Fast/Cheap)", "cost_per_student": "$0.07"},
    {"id": "anthropic/claude-sonnet-4", "name": "Sonnet (Accurate)", "cost_per_student": "$0.75"}
  ]'::jsonb),
  ('mintlify_base_url', '"https://fieldpulse.mintlify.app"'::jsonb);

-- Indexes for common queries
CREATE INDEX idx_questions_round_id ON questions(round_id);
CREATE INDEX idx_submissions_round_id ON submissions(round_id);
CREATE INDEX idx_submissions_student_id ON submissions(student_id);
CREATE INDEX idx_responses_submission_id ON responses(submission_id);
CREATE INDEX idx_responses_question_id ON responses(question_id);
CREATE INDEX idx_responses_grade ON responses(grade);
CREATE INDEX idx_responses_needs_rescore ON responses(needs_rescore) WHERE needs_rescore = true;
