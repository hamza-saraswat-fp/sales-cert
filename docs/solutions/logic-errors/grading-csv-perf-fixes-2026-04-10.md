---
title: "Grading, CSV Parser, and Performance Fixes"
date: 2026-04-10
category: logic-errors
severity: critical
components:
  - src/lib/grading.ts
  - src/lib/csv-parser.ts
  - src/pages/RoundDetail.tsx
symptoms:
  - Grades silently flip between correct/incorrect on repeated "Grade All" runs
  - Users report "grades reset" after re-grading
  - CSV import produces students with all-NULL responses despite valid source data
  - RoundDetail page loads slowly (~5s) with 61 students
  - Grading 500 responses takes 12+ minutes
tags:
  - data-corruption
  - infinite-loops
  - query-limits
  - csv-parsing
  - n-plus-one
  - concurrency
---

# Grading, CSV Parser, and Performance Fixes

## Summary

Five interconnected fixes addressing data corruption, silent data loss, and performance in the grading pipeline and CSV import flow. The most critical bug caused grades to silently flip on every "Grade All" run due to an uncleared `needs_rescore` flag, combined with a query cap that caused the grader to re-process already-graded responses.

---

## Fix 1: needs_rescore Flag Not Cleared on Skipped Path

### Symptom
428 rows in round `85a05397-...` were stuck with `needs_rescore = true`. Every "Grade All" run re-graded them. Because Haiku is non-deterministic, grades silently flipped between correct/incorrect — the root cause of the "grades reset" user complaints.

### Root Cause
`gradeResponse()` in `src/lib/grading.ts` has three exit paths:
1. **AI grading** (line ~369) — wrote `needs_rescore: false` ✓
2. **Error** (line ~394) — wrote `needs_rescore: false` ✓
3. **Skipped / unscored** (line ~304) — did NOT write `needs_rescore: false` ✗

The skipped path updated the grade to `'skipped'` but never cleared the flag:

```typescript
// BEFORE
.update({
  grade: 'skipped',
  graded_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
})

// AFTER
.update({
  grade: 'skipped',
  graded_at: new Date().toISOString(),
  needs_rescore: false,              // ← added
  updated_at: new Date().toISOString(),
})
```

### Why This Fix Is Correct
`batchGrade()` selects responses with `.or('grade.eq.pending,needs_rescore.eq.true')`. Without clearing the flag on the skipped path, skipped responses matched the filter on every run, creating an infinite re-grade loop. All three exit paths now consistently clear the flag.

### Prevention
Functions with multiple exit paths that all need to write the same cleanup field are error-prone. Code review checklist: "For functions with N return paths, verify all cleanup fields are set on every path."

---

## Fix 2: batchGrade Two-Step Fetch with 1000-Row Cap

### Symptom
When only 15 responses were pending, the grader still made ~1000 AI calls. Users waited 12+ minutes for what should have been a 30-second operation.

### Root Cause
`batchGrade()` used a two-step fetch:
1. Fetch all submission IDs for the round
2. Use `.in('submission_id', subIds)` to get responses

Supabase/PostgREST defaults to a 1000-row limit. With ~12k responses per round, the query silently returned only the first 1000 rows. The `.or('grade.eq.pending,...')` filter was already server-side, but the 1000-row cap meant the response set was incomplete — pending responses beyond row 1000 were missed, while already-graded responses within the first 1000 were re-processed.

```typescript
// BEFORE: two queries, 1000-row default cap
let subIds: string[] = []
if (submissionId) {
  subIds = [submissionId]
} else {
  const { data: subs } = await supabase
    .from('submissions').select('id').eq('round_id', roundId).limit(10000)
  subIds = (subs || []).map((s) => s.id)
}
let query = supabase.from('responses')
  .select('id, question_id, questions(question_text)')
  .in('submission_id', subIds)
  .or('grade.eq.pending,needs_rescore.eq.true')
  .limit(10000)

// AFTER: single query with inner join, explicit 50k limit
let query = supabase.from('responses')
  .select('id, question_id, questions(question_text), submissions!inner(round_id)')
  .eq('submissions.round_id', roundId)
  .or('grade.eq.pending,needs_rescore.eq.true')
  .limit(50000)

if (submissionId) {
  query = query.eq('submission_id', submissionId)
}
```

### Why This Fix Is Correct
The `submissions!inner(round_id)` join filters by round at the database level in a single query, eliminating the submission-ID round-trip. The `.limit(50000)` explicitly overrides the 1000-row default, ensuring all pending/rescore responses are fetched.

### Prevention
Never assume Supabase will return all matching rows. Always set explicit `.limit()` on queries where the result set could exceed 1000. Consider validating result counts against expectations.

---

## Fix 3: Sequential Grading Loop to Concurrent Batching

### Symptom
Grading 500 responses took 12+ minutes. Each response was processed sequentially with a 150ms delay between calls.

### Root Cause
The grading loop was:
```typescript
for (const resp of responses) {
  await gradeResponse(resp.id, modelOverride)  // ~1.5s per call
  await new Promise(resolve => setTimeout(resolve, 150))  // 150ms delay
}
```
500 responses x (1.5s + 0.15s) = ~13.75 minutes.

### Solution
Replaced with `Promise.allSettled` batching at concurrency 8:

```typescript
const CONCURRENCY = 8

for (let i = 0; i < responses.length; i += CONCURRENCY) {
  if (signal?.aborted) break
  const batch = responses.slice(i, i + CONCURRENCY)

  // Progress update before batch
  onProgress?.(structuredClone(progress))

  const results = await Promise.allSettled(
    batch.map((r) => gradeResponse(r.id, modelOverride))
  )

  // Tally results — rejected promises logged and counted as errors
  for (const settled of results) {
    progress.completed++
    if (settled.status === 'rejected') {
      console.error('Grading promise rejected:', settled.reason)
      progress.errors++
      continue
    }
    // ... tally settled.value grades
  }

  onProgress?.(structuredClone(progress))
}
```

### Key Decisions
- **CONCURRENCY = 8**: Safe for OpenRouter Haiku rate limits, ~8x speedup
- **Promise.allSettled** (not Promise.all): One failure doesn't abort the batch
- **Removed RATE_LIMIT_DELAY_MS**: 8 concurrent calls self-throttle; the batch-level `await` naturally paces requests
- **Progress fires per batch**: ~63 updates for 500 responses instead of ~1000, but each arrives 8x faster

### Prevention
Sequential `await` in loops is a code smell. Default to concurrent patterns and require explicit justification for sequential processing.

---

## Fix 4: CSV Parser Silent Data Loss

### Symptom
Student `hilbert@fieldpulse.com` was imported with all 195 responses as NULL. Python's csv module confirmed his source CSV row was perfectly well-formed: 201 columns, 197 filled cells, only 4 legitimately empty.

### Root Cause
In `src/lib/csv-parser.ts`, PapaParse is configured with `header: false`, returning raw `string[][]`. If PapaParse misparses a multi-line cell (e.g., unmatched quote), the row array can be shorter than the header. The critical line:

```typescript
let value = (row[colIdx] || '').trim()
```

When `row[colIdx]` is `undefined` (row shorter than headers), `|| ''` silently converts it to empty string, which becomes `null`. No error, no warning — silent data loss.

### Solution
Two additive warnings:

**A. Row-length mismatch detection** (fires before response processing):
```typescript
if (row.length < headers.length) {
  warnings.push(
    `⚠️ Row ${rowIdx + 2} (${email}): has ${row.length} columns but header has ${headers.length}. ` +
      `This usually means a multi-line cell wasn't properly quoted. Responses may be missing.`
  )
}
```

**B. 90%+ empty response alert** (fires after response processing as catch-all):
```typescript
if (questionColIndices.length > 0 && emptyCount >= questionColIndices.length * 0.9) {
  warnings.push(
    `⚠️ ${email} appears to have a parse error: ${emptyCount}/${questionColIndices.length} responses are empty. Check the raw CSV row for malformed data before importing.`
  )
} else if (emptyCount > questionColIndices.length * 0.5) {
  // existing 50% warning preserved
}
```

### Why Two Warnings
The row-length check catches the specific PapaParse misparse scenario. The 90% check is a broader catch-all — even if the row length matches but data is still null for some other reason, the user sees the alert in the preview screen before confirming import.

### Prevention
Defensive fallbacks (`||`, `??`) that silently convert missing data to defaults hide bugs. Replace with explicit validation that surfaces problems. A parse error visible in the UI is infinitely better than silent data loss discovered weeks later.

---

## Fix 5: RoundDetail N+1 Query

### Symptom
RoundDetail page load was slow with 61 students — the browser network tab showed 61+ sequential Supabase requests.

### Root Cause
After fetching submissions, the code looped over each one and fired a separate query:

```typescript
// BEFORE: 61 sequential queries
for (const sub of submissions || []) {
  const { data: responses } = await supabase
    .from('responses')
    .select('grade, admin_override_grade')
    .eq('submission_id', sub.id)
  // ... count grades
}
```

### Solution
Single bulk fetch + client-side grouping:

```typescript
// AFTER: 1 query + in-memory grouping
const subIds = (submissions || []).map((s) => s.id)
const { data: allResponses } = await supabase
  .from('responses')
  .select('submission_id, grade, admin_override_grade')
  .in('submission_id', subIds)
  .limit(50000)

const responsesBySubmission = (allResponses || []).reduce<
  Record<string, { grade: string; admin_override_grade: string | null }[]>
>((acc, r) => {
  ;(acc[r.submission_id] ||= []).push(r)
  return acc
}, {})

for (const sub of submissions || []) {
  const responses = responsesBySubmission[sub.id] || []
  // ... count grades from in-memory array
}
```

Admin-override-takes-precedence logic preserved: `r.admin_override_grade || r.grade`.

### Prevention
Any loop that calls a database function is N+1 until proven otherwise. Pattern: collect IDs → single bulk fetch → group in memory. Create utility helpers to make this the path of least resistance.

---

## Cross-Cutting Lessons

| Pattern | Problem | Fix |
|---------|---------|-----|
| Multiple exit paths with shared cleanup | Missed cleanup on one path | Verify all paths write all cleanup fields |
| Supabase default 1000-row limit | Silent data truncation | Always set explicit `.limit()` |
| Sequential `await` in loops | O(n) wall time for parallelizable work | `Promise.allSettled` with bounded concurrency |
| `(value \|\| '').trim()` fallback | Silent conversion of undefined to empty | Explicit validation + user-facing warnings |
| Per-item DB queries in loops | N+1 query pattern | Bulk fetch + client-side grouping |

## Related Files
- `SYSTEM_WRITEUP.md` — Architecture reference documenting grading pipeline, CSV import flow, and known issues
- `src/lib/grading.ts` — Core grading logic (gradeResponse, batchGrade)
- `src/lib/csv-parser.ts` — CSV parsing and validation
- `src/pages/RoundDetail.tsx` — Round detail page with student grade counts
