# SalesCERT — Complete System Writeup

## What This App Is

SalesCERT is a quiz grading platform built for FieldPulse. Sales team members take a certification quiz via Google Forms. An admin exports the responses as a CSV, uploads it into SalesCERT, and the app uses AI (Claude via OpenRouter) to grade every response against an answer key. The admin can then review grades, override incorrect AI decisions, and export final results.

---

## 1. Database Schema (Supabase / PostgreSQL)

Six tables. Everything flows downward — deleting a parent cascades to its children.

```
quiz_rounds
  │
  ├── questions        (round_id → quiz_rounds.id, CASCADE)
  │
  └── submissions      (round_id → quiz_rounds.id, CASCADE)
        │               (student_id → students.id, CASCADE)
        │
        └── responses   (submission_id → submissions.id, CASCADE)
                         (question_id → questions.id, CASCADE)

students               (standalone, referenced by submissions)

grading_config         (standalone key-value store)
```

### quiz_rounds
Each round represents a certification cohort — e.g., "Q2 2026 Sales Cert."

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated |
| name | TEXT NOT NULL | e.g., "Q2 2026 Platform Knowledge" |
| description | TEXT | Optional |
| is_active | BOOLEAN | Default true |
| created_at | TIMESTAMPTZ | Default now() |
| updated_at | TIMESTAMPTZ | Default now() |

### questions
The master question bank. Each question belongs to one round. Contains the answer key, key points to check, few-shot examples for the AI, and optional doc context from Mintlify.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated |
| round_id | UUID FK | → quiz_rounds.id, CASCADE |
| question_number | INTEGER | Ordering within round |
| section | TEXT | Grouping label (e.g., "Getting Started") |
| question_text | TEXT | The actual question |
| answer_key | TEXT | Official correct answer |
| key_points | JSONB | Array of key points the AI should look for |
| question_type | TEXT | One of: `yes_no`, `short`, `long`, `list`, `screenshot` |
| is_scored | BOOLEAN | If false, responses are auto-skipped during grading |
| few_shot_good | JSONB | Array of `{response, explanation}` — examples of good answers |
| few_shot_bad | JSONB | Array of `{response, explanation}` — examples of bad answers |
| doc_context | TEXT | Cached Mintlify doc content (currently disabled, CORS) |
| doc_context_fetched_at | TIMESTAMPTZ | When doc_context was last fetched |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### students
One row per unique email. Shared across rounds.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated |
| email | TEXT UNIQUE | Lowercase, from CSV |
| display_name | TEXT | Derived from email: `john.doe@x.com` → `John Doe` |
| created_at | TIMESTAMPTZ | |

### submissions
The join between a student and a round. One row per student per round. This is the "envelope" — "Student X submitted answers for Round Y."

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated |
| student_id | UUID FK | → students.id, CASCADE |
| round_id | UUID FK | → quiz_rounds.id, CASCADE |
| submitted_at | TIMESTAMPTZ | From CSV timestamp column, if present |
| imported_at | TIMESTAMPTZ | When the CSV was uploaded |
| **UNIQUE** | | **(student_id, round_id)** — one submission per student per round |

### responses
One row per student per question. This is where everything lives — the student's raw answer, the AI grade, confidence, reasoning, and any admin override.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated |
| submission_id | UUID FK | → submissions.id, CASCADE |
| question_id | UUID FK | → questions.id, CASCADE |
| raw_response | TEXT | The student's actual answer from the CSV. NULL if they left it blank. |
| grade | TEXT | One of: `correct`, `incorrect`, `clarify`, `pending`, `skipped` |
| confidence | NUMERIC(5,2) | AI's confidence score, 0–100 |
| ai_reasoning | TEXT | AI's explanation of why it graded this way |
| graded_at | TIMESTAMPTZ | When the AI graded this response |
| model_used | TEXT | Which OpenRouter model graded this (e.g., `anthropic/claude-3.5-haiku`) |
| admin_override_grade | TEXT | One of: `correct`, `incorrect`, `clarify`, or NULL |
| admin_notes | TEXT | Optional admin notes |
| needs_rescore | BOOLEAN | Flag — if true, next batch grade will re-grade this response |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| **UNIQUE** | | **(submission_id, question_id)** — one response per question per submission |

### grading_config
App-level configuration stored as key-value pairs.

| Key | Default Value | What It Does |
|-----|---------------|-------------|
| `confidence_thresholds` | `{auto_correct: 85, clarify_min: 60, flag_below: 60}` | Controls when AI grades are accepted vs flagged for review |
| `admin_passcode` | `"fieldpulse2026"` | Passcode for admin access |
| `default_model` | `"anthropic/claude-3.5-haiku"` | Default AI model for grading |
| `available_models` | Haiku ($0.07) + Sonnet ($0.75) | Models shown in the dropdown |
| `mintlify_base_url` | `"https://fieldpulse.mintlify.app"` | For doc context fetching (disabled) |

### Indexes

```sql
idx_questions_round_id          ON questions(round_id)
idx_submissions_round_id        ON submissions(round_id)
idx_submissions_student_id      ON submissions(student_id)
idx_responses_submission_id     ON responses(submission_id)
idx_responses_question_id       ON responses(question_id)
idx_responses_grade             ON responses(grade)
idx_responses_needs_rescore     ON responses(needs_rescore) WHERE needs_rescore = true
```

---

## 2. App Routes

| Route | Page | Purpose |
|-------|------|---------|
| `/` | Dashboard | Lists all quiz rounds with question/student counts |
| `/rounds/:roundId` | RoundDetail | The main hub — student table, grading, CSV import/export |
| `/rounds/:roundId/students/:studentId` | StudentDetail | Drill into one student — see every response, override grades, bookmark examples |
| `/rounds/:roundId/questions` | QuestionManager | View/edit all questions — answer keys, key points, few-shot examples, scored toggle |
| `/admin` | AdminSettings | Configure confidence thresholds, models, passcode |

---

## 3. CSV Upload — What Happens Step by Step

**Entry point:** User clicks "Import CSV" on RoundDetail → opens a dialog containing the `CsvImporter` component.

### Stage 1: Parsing (`csv-parser.ts`)

1. User drops a `.csv` file (exported from Google Forms).
2. PapaParse reads the file with `header: false, skipEmptyLines: true`.
3. The parser identifies special columns:
   - **Email column:** Searches the first 5 headers for one containing "email". Required.
   - **Timestamp column:** If header[0] contains "timestamp", it's treated as the timestamp.
   - **Skip columns:** Headers matching `score`, `timestamp`, `email address`, `email` are skipped.
   - **Screenshot columns:** If a header matches keywords like "screenshot" or "attach photo", OR if >50% of its values are URLs, the column is skipped.
4. Everything remaining is treated as a **question column**.
5. For each student row:
   - Extract email (lowercase, trimmed). Skip rows without email. Skip duplicate emails.
   - Extract timestamp (nullable).
   - For each question column: trim the value. If empty → store as `null`. If >5000 chars → truncate.
   - Emit warnings for: missing emails, invalid emails, duplicate emails, >50% empty responses, truncated responses.

**Output:** `ParsedCsvData` with `headers`, `questionHeaders`, `rows[]` (each with `email`, `timestamp`, `responses: Record<header, string | null>`), and `warnings[]`.

### Stage 2: Question Matching (`question-matcher.ts`)

The CSV headers (Google Forms question text) need to be matched to the questions already in the database. They won't match exactly — Forms headers are often truncated or rephrased.

**Algorithm:**
1. **Normalize** both texts: lowercase, strip punctuation, collapse whitespace, remove phrases like "within the FieldPulse platform."
2. **Extract meaningful words:** Remove stopwords (a, the, is, what, how, etc.), keep words >1 char.
3. **Score similarity:** Count overlapping words ÷ min(set A size, set B size). Add +0.15 bonus if one text fully contains the other. Cap at 1.0.
4. **Match:** For each CSV header, find the DB question with the highest similarity. If score ≥ 0.55 (threshold), it's a match. Each DB question can only match once.

**Output:** `MatchResult` with `matches[]` (each has `csvHeader`, `questionId`, `similarity`, `matched`), `matchedCount`, `unmatchedCsvCount`, `unmatchedDbCount`.

### Stage 3: Preview

The user sees:
- **3 stat cards:** students found, matched questions, unmatched questions.
- **Student preview table:** first 5 students with email and how many responses are filled.
- **Unmatched columns table:** any CSV headers that couldn't match a DB question, with their best similarity score.
- **Warnings list:** all parser warnings.
- **Cancel** or **Confirm Import** buttons.

### Stage 4: Import (`CsvImporter.tsx:111-251`)

For each row in the CSV (i.e., each student):

**Step A — Upsert Student:**
```
Query: SELECT id FROM students WHERE email = row.email
  → If found: use existing student ID
  → If not found: INSERT new student (email + display name derived from email)
```

**Step B — Upsert Submission:**
```
Query: SELECT id FROM submissions WHERE student_id = X AND round_id = Y
  → If found: use existing submission ID. Update submitted_at if new timestamp provided.
  → If not found: INSERT new submission (student_id, round_id, submitted_at)
```

**Step C — Create Responses:**
For every **matched** question (unmatched are skipped):
```
Build row: {
  submission_id,
  question_id: from matcher,
  raw_response: CSV cell value (or null if empty),
  grade: 'pending'
}
```
Insert in batches of 50 using:
```typescript
supabase.from('responses').upsert(batch, {
  onConflict: 'submission_id,question_id',
  ignoreDuplicates: true
})
```
The `ignoreDuplicates: true` flag is supposed to tell Supabase: "if a row with this (submission_id, question_id) already exists, skip it — don't update." This is how re-imports are meant to preserve existing grades.

> **Known issue:** This is the source of the grade-reset bug. See section 10.

**After all rows:** Show summary (students created/existing, responses created), call `onImportComplete()` which triggers `fetchData()` on RoundDetail to refresh the student table.

---

## 4. Grading — What Happens When You Hit "Grade All"

**Entry point:** User clicks "Grade All (N pending)" on RoundDetail.

### Step 1: `handleGrade()` in RoundDetail.tsx

1. Counts pending responses. If 0, shows toast "Nothing to grade" and exits.
2. Sets `isGrading = true`, resets progress counters.
3. Creates an `AbortController` (for cancellation).
4. Calls `batchGrade()` from `grading.ts`, passing:
   - `roundId` — which round
   - `submissionId` — optional, if grading a single student
   - `modelOverride` — whichever model the user selected in the dropdown
   - `onProgress` — callback that updates the UI progress bar in real-time
   - `signal` — the AbortController's signal for cancellation

### Step 2: `batchGrade()` in grading.ts

**Fetches responses to grade in two steps:**

1. Get all submission IDs for this round:
   ```
   SELECT id FROM submissions WHERE round_id = :roundId LIMIT 10000
   ```
2. Get pending/rescore responses for those submissions:
   ```
   SELECT id, question_id, questions(question_text)
   FROM responses
   WHERE submission_id IN (:allSubIds)
     AND (grade = 'pending' OR needs_rescore = true)
   LIMIT 10000
   ```
   If `submissionId` was provided (single student), step 1 just uses that one ID.
   If `questionId` was provided (single question), adds that filter too.

> **Known issue:** Step 1 fetches ALL submission IDs even if only a few have pending responses. With 1000+ students, this creates a massive `.in()` clause. See section 10.

**Then loops through each response:**

```
For each response:
  1. Check AbortSignal — if cancelled, break
  2. Update progress with current question text
  3. Call gradeResponse(response.id, modelOverride)
  4. Increment counters (correct/incorrect/clarify/skipped/errors)
  5. Update progress again
  6. Wait 150ms (rate limiting for OpenRouter)
```

### Step 3: `gradeResponse()` in grading.ts

This is the single-response grading function. Here's every decision branch:

**a) Missing API key:**
```
→ Return { grade: 'pending', error: 'Missing VITE_OPENROUTER_API_KEY' }
→ NO database update. Response stays pending.
```

**b) Response not found in DB:**
```
→ Return { grade: 'pending', error: 'Not found' }
→ NO database update.
```

**c) Question is unscored (is_scored = false):**
```
→ UPDATE responses SET grade = 'skipped', graded_at = now()
→ Return { grade: 'skipped', skipped: true }
```

**d) Student left the answer blank (raw_response is null or empty):**
```
→ UPDATE responses SET
    grade = 'incorrect',
    confidence = 100,
    ai_reasoning = 'No response provided by the student.',
    model_used = 'system',
    needs_rescore = false
→ Return { grade: 'incorrect', confidence: 100 }
```

**e) Normal grading (has a response to evaluate):**

1. Fetch grading config (model + thresholds).
2. Build the AI prompt using `buildGradingPrompt()`:
   - System prompt: grading criteria, confidence scoring rules, JSON output format.
   - User prompt (assembled in order):
     - `QUESTION:` the question text
     - `OFFICIAL ANSWER KEY:` the answer key
     - `KEY POINTS TO CHECK FOR:` list of key points (if any)
     - `EXAMPLES OF GOOD ANSWERS:` few-shot good examples with explanations (if any)
     - `EXAMPLES OF BAD ANSWERS:` few-shot bad examples with explanations (if any)
     - `RELEVANT DOCUMENTATION:` Mintlify doc context (currently disabled due to CORS)
     - `STUDENT'S RESPONSE:` the student's raw answer
     - `Grade this response.`

3. Call OpenRouter API:
   - POST to `https://openrouter.ai/api/v1/chat/completions`
   - Model: whatever was selected (default `anthropic/claude-3.5-haiku`)
   - Format: `response_format: { type: "json_object" }`
   - Parse response JSON. If JSON parsing fails, retry the entire API call once.
   - Validate: grade must be `correct`/`incorrect`/`clarify`. Confidence must be 0–100 (defaults to 50 if invalid).

4. Apply confidence thresholds via `applyThresholds()`:

   | AI Confidence | What Happens | Final Grade |
   |---------------|-------------|-------------|
   | ≥ 85 (auto_correct) | Accept AI's grade as-is | Whatever AI said |
   | 60–84 (clarify_min) | Force to clarify | `clarify` with `[Medium confidence – needs review]` prefix |
   | < 60 (flag_below) | Force to clarify + flag | `clarify` with `[Low confidence – flagged for manual review]` prefix |

5. Write result to DB:
   ```
   UPDATE responses SET
     grade = adjusted_grade,
     confidence = ai_confidence,
     ai_reasoning = adjusted_reasoning,
     graded_at = now(),
     model_used = 'anthropic/claude-3.5-haiku',
     needs_rescore = false
   WHERE id = response_id
   ```

6. Return the result.

**f) API call throws an error:**
```
→ UPDATE responses SET
    grade = 'clarify',
    confidence = 0,
    ai_reasoning = '[Grading error — needs manual review] <error message>',
    model_used = 'system',
    needs_rescore = false
→ Return { grade: 'clarify', error: '<message>' }
```
This ensures a failed API call never leaves a response stuck as `pending` — it gets moved to `clarify` so it's visible for manual review.

### Step 4: Back in RoundDetail

After `batchGrade()` returns:
- If the user cancelled: toast "Grading cancelled" with partial count.
- If it completed: toast "Grading complete" with counts of correct/incorrect/clarify/errors.
- Calls `fetchData()` to refresh the student table with updated scores.
- Sets `isGrading = false`.

### Progress UI (GradingProgress component)

While grading runs:
- Progress bar: `completed / total * 100%`
- Text: "Grading... 47/150"
- Current question being graded (truncated to 60 chars)
- Cancel button (triggers `abortController.abort()`)
- Note: "If you close this tab, grading will pick up where it left off when you come back." (Because ungraded responses stay as `pending` and will be picked up next time.)

---

## 5. Re-grading / Rescoring

There are two ways responses get re-graded:

### Via "Re-score All Students" button (QuestionEditor)

When an admin edits a question's answer key, key points, or few-shot examples, they can click "Re-score All Students" for that question:

```typescript
// QuestionEditor.tsx:157-160
await supabase
  .from('responses')
  .update({ needs_rescore: true })
  .eq('question_id', questionId)
```

This sets `needs_rescore = true` on **every response** for that question. Next time "Grade All" is clicked, `batchGrade()` picks these up because its filter is:
```
WHERE grade = 'pending' OR needs_rescore = true
```

### Via "Add to Answer Set" (StudentDetail)

When an admin bookmarks a student's response as a few-shot example:

```typescript
// StudentDetail.tsx:556-560
await supabase
  .from('responses')
  .update({ needs_rescore: true })
  .eq('question_id', questionId)
  .neq('id', thisResponseId)  // don't rescore the one we just bookmarked
```

This flags all **other** responses for that question for rescore, since the grading prompt now has a new example that might change results.

---

## 6. Admin Overrides — Marking Correct/Incorrect

**Where:** StudentDetail page, on each response row.

Each response has two small icon buttons: a checkmark (mark correct) and an X (mark incorrect).

### What happens when you click one:

1. **Optimistic UI update** — immediately changes the displayed grade.
2. **Database update:**
   ```typescript
   // StudentDetail.tsx:465-471
   await supabase
     .from('responses')
     .update({
       admin_override_grade: 'correct',  // or 'incorrect', or null to clear
       updated_at: now()
     })
     .eq('id', responseId)
   ```
3. If the same button is clicked again (already overridden to that grade), it **clears** the override by setting `admin_override_grade: null`.
4. Toast confirms: "Overridden to correct" or "Override cleared."

### How overrides affect everything else

The "effective grade" is calculated everywhere as:
```typescript
const effectiveGrade = response.admin_override_grade || response.grade || 'pending'
```

This means:
- **Admin override always wins.** If an admin marks something correct, it's correct regardless of what the AI said.
- **Score calculations** use the effective grade, not the raw AI grade.
- **CSV export** uses the effective grade (with a separate column showing if it was overridden).
- **The AI grade is preserved.** Overriding doesn't erase the AI's reasoning — it just supersedes it for scoring purposes.

---

## 7. Bookmarking / Few-Shot Examples

**Where:** StudentDetail page, bookmark icon on each response.

### What "Add to Answer Set" does:

1. Admin clicks the bookmark icon on a graded response.
2. A dialog opens showing the student's response and a text field for explanation.
3. Admin can edit the explanation (defaults to "Marked correct/incorrect by admin review.").
4. On confirm:

   **a) Fetch current examples:**
   ```
   SELECT few_shot_good, few_shot_bad FROM questions WHERE id = questionId
   ```

   **b) Determine which list:**
   - If effective grade is `correct` → add to `few_shot_good`
   - If effective grade is `incorrect` → add to `few_shot_bad`

   **c) Create the example:**
   ```json
   {
     "response": "<student response, truncated to 500 chars>",
     "explanation": "<admin's explanation>"
   }
   ```

   **d) Append to the list and update the question:**
   ```
   UPDATE questions SET few_shot_good = [...existing, newExample]
   WHERE id = questionId
   ```

   **e) Flag other responses for rescore:**
   ```
   UPDATE responses SET needs_rescore = true
   WHERE question_id = questionId AND id != thisResponseId
   ```

The next time grading runs, the AI prompt for this question will include this new example, improving accuracy for similar answers.

---

## 8. Score Calculation

**Where:** RoundDetail (per-student in the table) and StudentDetail (summary cards).

### Formula

```typescript
const totalScored = correct + incorrect + clarify + pending  // does NOT include skipped
const scorePercent = totalScored > 0 ? Math.round((correct / totalScored) * 100) : 0
```

- **Correct:** counts as a point.
- **Incorrect, clarify, pending:** count against the student (they're in the denominator but not the numerator).
- **Skipped:** excluded entirely (unscored questions don't affect the score).

Admin overrides are applied before counting — if the AI said incorrect but the admin overrode to correct, it counts as correct.

> **Note:** Including `pending` in `totalScored` means a student's score can look lower than it really is if they still have ungraded responses.

### On RoundDetail (the student table)

For each submission, the app queries all responses and counts by effective grade. The table shows: correct, incorrect, clarify, pending, skipped, and score%.

Students are sorted by score% descending.

**Average score** is calculated only from students with 0 pending responses (fully graded).

### On StudentDetail

Same calculation, displayed as a summary grid with 5 cards (score, correct, incorrect, clarify, skipped) plus a visual stacked bar.

---

## 9. CSV Export

**Entry point:** "Export" button on RoundDetail.

### What it exports:

One row per response (student × question), with columns:
1. Student Name
2. Email
3. Question # (number)
4. Section
5. Question (text)
6. Student Response (raw answer)
7. Grade (effective — admin override if present, else AI grade)
8. Confidence (AI confidence score)
9. AI Reasoning
10. Admin Override (shows override grade if set, else empty)
11. Answer Key

After each student's responses, a **summary row** is inserted:
```
"", "", "", "", "SUMMARY: <email>", "", "Correct: 15, Incorrect: 3, Clarify: 2", "", "", "", ""
```

The file downloads as `grades-export-YYYY-MM-DD.csv`.

---

## 10. Known Issues

### Grade Reset on Re-upload

**File:** `CsvImporter.tsx:218-223`

The import uses Supabase's `upsert` with `ignoreDuplicates: true`. This is supposed to translate to `ON CONFLICT (submission_id, question_id) DO NOTHING`. When it works correctly, existing graded responses are untouched and only new responses are created.

When it doesn't work correctly — due to Supabase JS client behavior with the `Prefer` header, or RLS interaction — it can fall back to `ON CONFLICT DO UPDATE`, which overwrites every column including `grade` back to `'pending'`. This wipes all grades for students that already existed.

The safer approach is to query existing responses first and only INSERT genuinely new rows.

### Grading Performance with Many Students

**File:** `grading.ts:441-464`

The batch grading function fetches ALL submission IDs for the round in step 1, then uses `.in('submission_id', [allIds])` in step 2. Even if only 15 responses are pending, the query includes every submission ID. With 1000+ students, this generates a URL with 36,000+ characters, which can exceed PostgREST's URL length limits.

The fix is to use a single query with a join on `submissions.round_id` instead of the two-step approach.

### N+1 Queries on RoundDetail

**File:** `RoundDetail.tsx:163-202`

When loading the student table, the page fetches all submissions, then loops through each one and makes a separate database query to count grades. With 61 students, that's 61 sequential network requests. This makes page load slow.

The fix is to fetch all responses for the round in a single query and group them client-side.

### Misleading Import Counter

**File:** `CsvImporter.tsx:226`

`responsesCreated += batch.length` increments by the batch size regardless of whether rows were actually inserted or skipped by the upsert. When re-importing, the toast says "1500 responses imported" when 0 were actually new.

---

## 11. Environment Variables

```
VITE_SUPABASE_URL        — Supabase project URL
VITE_SUPABASE_ANON_KEY   — Supabase anonymous/public key
VITE_OPENROUTER_API_KEY  — OpenRouter API key for AI grading
```

If the Supabase URL is missing or set to a placeholder, the app enters **demo mode** — all data comes from `mock-data.ts`, no network requests are made, and all features work with fake data.

---

## 12. External Dependencies

| Service | Purpose | Used By |
|---------|---------|---------|
| Supabase | PostgreSQL database + auth | All data storage |
| OpenRouter | AI API gateway (routes to Claude) | `grading.ts` for response grading |
| Mintlify | FieldPulse documentation search | `mintlify.ts` — currently disabled (CORS) |

### AI Models Available

| Model | Cost/Student | Speed | Notes |
|-------|-------------|-------|-------|
| `anthropic/claude-3.5-haiku` | $0.07 | Fast | Default |
| `anthropic/claude-sonnet-4` | $0.75 | Slower | More accurate |

---

## 13. Data Lifecycle Summary

```
1. SETUP
   Admin runs seed script → creates quiz_round + questions from answer key JSON

2. IMPORT
   Admin uploads Google Forms CSV
   → Parser extracts students + responses
   → Matcher links CSV headers to DB questions
   → For each student: upsert student → upsert submission → create responses (grade: 'pending')

3. GRADE
   Admin clicks "Grade All"
   → Fetch all pending + needs_rescore responses
   → For each: build prompt → call OpenRouter → apply thresholds → update DB
   → UI shows real-time progress

4. REVIEW
   Admin reviews each student on StudentDetail
   → Expand questions to see response + AI reasoning + answer key
   → Override grades if AI was wrong (click checkmark or X)
   → Bookmark good/bad examples to improve future grading

5. RESCORE (optional)
   Admin edits question (answer key, key points, few-shot examples)
   → Clicks "Re-score All Students"
   → Flags all responses for that question with needs_rescore = true
   → Next "Grade All" re-evaluates them with the updated prompt

6. EXPORT
   Admin clicks "Export"
   → Generates CSV with all grades, reasoning, overrides
   → Downloads as grades-export-YYYY-MM-DD.csv
```
