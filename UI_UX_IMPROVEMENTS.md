# Sales Cert App -- UI/UX Improvement Report

Comprehensive review of the FieldPulse Sales Certification grading tool. Recommendations are prioritized by impact on Ashli's daily grading workflow.

---

## 1. Dashboard Page

### What Works Well
- Clean, minimal layout with clear visual hierarchy (title, subtitle, round cards).
- Round cards show key stats at a glance (question count, student count, active badge).
- Loading and empty states are both handled with appropriate messaging.
- Hover effect on round cards gives clear affordance that they are clickable.

### Improvements

| Issue | Suggestion | Priority |
|-------|-----------|----------|
| **"New Round" button has no functionality** | The button is rendered but only disabled in demo mode. In live mode it appears clickable but does nothing -- wire it to a create-round dialog or remove it to avoid confusion. | High |
| **No search or filter for rounds** | As the number of rounds grows (semester over semester), finding old rounds will become tedious. Add a simple text filter or date range filter. | Low |
| **N+1 query pattern for counts** | The dashboard loops over each round and makes two additional Supabase calls per round (questions count + submissions count). This will degrade as data grows. Use a single RPC or join query. Not a UX issue per se, but directly causes slow load times. | Medium |
| **Empty state is too generic** | The empty state says "Rounds will appear here once created" but gives no actionable next step. Add a prominent CTA button and a brief description of the workflow (create round -> import questions -> import CSV -> grade). | Medium |
| **No indication of grading progress per round** | Each round card could show a small progress indicator (e.g., "12/15 students graded") so Ashli can see at a glance which rounds still need attention without clicking in. | High |
| **Timestamp not shown** | Round cards do not show when the round was created or last updated. Adding a relative timestamp ("3 days ago") helps Ashli quickly identify the current round. | Medium |

---

## 2. Round Detail Page

### What Works Well
- Excellent header with contextual badges (question count, student count, pending count).
- Stats cards give a quick numeric overview of the cohort.
- Grading progress component is well-designed with real-time updates and a cancel button.
- Student table is well-structured with color-coded grade counts.
- Per-student "Grade" button enables targeted grading.
- CSV import and export are easily accessible from the top action bar.
- Model selector is inline, which is convenient for quick switching.

### Improvements

| Issue | Suggestion | Priority |
|-------|-----------|----------|
| **Action bar overflows on smaller screens** | The header area packs 5+ buttons/controls (Import CSV, model selector, Grade All, Export, Questions) into a single `flex` row with no wrapping. On a 13" laptop this will overflow or feel cramped. Wrap into two rows or group secondary actions (Export, Questions) into a dropdown menu. | High |
| **No sorting or filtering on the student table** | Ashli should be able to sort by name, score, or pending count. She should also be able to filter to see only students with "clarify" items or those not yet graded. A simple sort-by dropdown and a status filter would save significant time. | High |
| **No search for students** | With 30+ students, a quick-filter text input above the table would let Ashli jump to a specific person instantly. | Medium |
| **Score column shows "pending" as text** | When grading is incomplete, the score column shows the word "pending" in muted text. This is fine but visually inconsistent with the numeric scores. Consider showing a partial score with a warning icon (e.g., "67%*") and a tooltip explaining that grading is incomplete. | Low |
| **No confirmation before "Grade All"** | Grading the entire cohort consumes API credits. A confirmation dialog showing estimated cost (model cost x students) would prevent accidental runs. | High |
| **Tab navigation is underused** | Only two tabs exist (Students, Overview). The Overview tab contains useful but infrequently needed data. Consider removing the tab structure and always showing the student list, with the overview stats accessible via a collapsible section or sidebar. This reduces one click from the critical path. | Low |
| **CSV dialog does not close on success** | After `onImportComplete` fires, the dialog stays open. It should auto-close or at minimum show a clear "done" state with a close button. | Medium |
| **No bulk selection on the student table** | Being able to select multiple students and grade just that subset would be useful for re-grading specific cohorts. | Low |

---

## 3. Student Detail Page

### What Works Well
- Score summary cards are clear and well-laid-out with color coding and icons.
- The stacked score bar provides excellent at-a-glance understanding of the grade distribution.
- Section-based grouping of questions mirrors the quiz structure and helps Ashli review systematically.
- Override buttons (check/X) are compact and non-intrusive, with clear active states.
- "Add to answer set" feature is well-integrated into the review flow.
- AI reasoning display is color-coded by grade and includes confidence + model info.
- Optimistic UI updates on overrides make the experience feel fast.

### Improvements

| Issue | Suggestion | Priority |
|-------|-----------|----------|
| **No keyboard shortcuts for overrides** | Ashli reviews dozens of responses per student. Adding keyboard shortcuts (e.g., arrow keys to navigate questions, `C` for correct, `X` for incorrect, `Z` to undo) would dramatically speed up the review flow. | High |
| **No "next student" / "previous student" navigation** | After finishing one student's review, Ashli must go back to the round and click the next student. Add prev/next arrows in the header to navigate between students without leaving the page. | High |
| **5-column score card grid breaks on smaller screens** | The `grid-cols-5` layout does not have responsive breakpoints for tablets or smaller windows. It will compress to unreadable sizes. Use `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` or a different layout. | Medium |
| **Clarify items have no dedicated action** | The "clarify" grade is the most important for Ashli's manual review, but there is no filter to show only clarify items, and no dedicated workflow for resolving them (e.g., mark as correct or incorrect with a note). Add a "Show only clarify" toggle and an inline resolution form. | High |
| **Override confirmation is only a toast** | When Ashli overrides a grade, the only feedback is a brief toast. Consider adding a visible "override" indicator directly on the question row (already partially done with the italic "override" text, but it is very small at 10px). Make it more prominent. | Medium |
| **No admin notes field for overrides** | The `adminNotes` field exists in the data model but there is no UI to enter notes when overriding. Add an optional text input that appears when an override is made, so Ashli can document why she changed the grade. | Medium |
| **Answer key is always visible in the expanded view** | For quick scanning, the expanded response detail shows question text, student response, answer key, key points, and AI reasoning -- all at once. This is a lot of content. Consider a tabbed or progressive disclosure approach where the answer key and AI reasoning are in separate collapsible sub-sections. | Low |
| **"Add to answer set" has no undo** | Once a response is added to the few-shot set, there is no way to remove it from this page. The user must go to the Question Manager. Add an "undo" option in the toast or show the current few-shot examples inline. | Low |

---

## 4. Question Manager

### What Works Well
- Section-based grouping with collapsible sections is intuitive.
- Inline scored/unscored toggle is convenient and saves round trips.
- Expandable question rows show answer key and few-shot examples without leaving the page.
- Stats cards provide a quick overview of question distribution.
- Question Editor dialog is comprehensive with support for answer key, key points, question type, scored toggle, and few-shot examples.

### Improvements

| Issue | Suggestion | Priority |
|-------|-----------|----------|
| **No search or filter** | With 40+ questions, there is no way to search by text or filter by type/scored status. Add a search input and filter dropdowns above the sections. | High |
| **No bulk actions** | Common operations like "mark all screenshot questions as unscored" or "re-score all questions of type X" require clicking each one individually. Add bulk selection with bulk actions. | Medium |
| **Only one question can be expanded at a time** | The `expandedId` state is a single string. Allow multiple expanded rows so Ashli can compare questions side by side. | Low |
| **Question Editor dialog does not show the question text as editable** | The `question_text` field is shown in the dialog description but cannot be edited. If the question text was imported incorrectly, there is no way to fix it. | Medium |
| **No indication of how many few-shot examples exist per question** | In the table row, there is no badge or count showing whether a question has few-shot examples seeded. This would help Ashli prioritize which questions need more examples. | Medium |
| **Re-score button in the editor is easy to miss** | It is positioned in the bottom-left of the dialog footer. For such an important action, consider placing it more prominently or adding it to the question row as well. | Low |
| **Key point input has no auto-suggest** | When adding key points, there is no suggestion mechanism based on existing key points across questions. This is a nice-to-have for consistency. | Low |

---

## 5. Admin Settings

### What Works Well
- Clean card-based layout with clear labels and descriptions.
- Each config section has its own save button, preventing accidental changes to unrelated settings.
- Demo mode banner is clearly visible.
- Passcode change requires current passcode verification.

### Improvements

| Issue | Suggestion | Priority |
|-------|-----------|----------|
| **No visual feedback on what changed** | After saving, only a toast appears. There is no dirty-state indicator showing which fields were modified. Add a subtle highlight or "unsaved changes" badge on cards that have been modified but not yet saved. | Medium |
| **Threshold labels are unclear** | "Auto-correct above", "Clarify minimum", and "Flag below" lack explanations of what these numbers mean in practice. Add helper text or tooltips (e.g., "AI responses with confidence above this threshold will be automatically marked correct"). | High |
| **No validation on threshold values** | There is nothing preventing `clarifyMin` from being set higher than `autoCorrect`, which would create conflicting rules. Add validation that ensures `flagBelow <= clarifyMin <= autoCorrect`. | Medium |
| **Multiple save buttons are confusing** | Having 4 separate save buttons (thresholds, model, mintlify, passcode) is unusual. Consider a single "Save All" button at the bottom, or at minimum make the individual save buttons more visually distinct from each other. | Low |
| **No "reset to defaults" option** | If settings get misconfigured, there is no way to reset without knowing the original values. Add a reset button per section. | Low |
| **Passcode is stored in plain text** | The `adminPasscode` is compared client-side (`currentPasscode !== config.adminPasscode`). This is a security concern even for an internal tool. Hash the passcode server-side. | Medium |

---

## 6. CSV Import

### What Works Well
- Drag-and-drop upload with visual feedback (border color change on drag).
- Multi-stage flow (upload -> preview -> importing -> done/error) is well-structured and clear.
- Preview stage shows student count, matched/unmatched question counts, and a sample of student emails.
- Unmatched columns are shown with similarity percentages, helping diagnose matching issues.
- Warnings from the parser are displayed clearly.
- Progress bar during import gives real-time feedback.
- Error and success states have clear messaging and "try again" / "import another" options.

### Improvements

| Issue | Suggestion | Priority |
|-------|-----------|----------|
| **No way to manually fix unmatched columns** | When a CSV column does not match a question, the user can only see the mismatch. They cannot manually map it to the correct question. Add a dropdown next to each unmatched column that lets Ashli pick the right question. | High |
| **Re-import behavior is unclear** | The code uses upsert logic for submissions and responses, but the user is not informed that re-importing will update existing data. Add a note in the preview stage: "X students already exist and will be updated." | Medium |
| **Student preview is limited to 5 rows** | With no way to scroll or expand the preview, Ashli cannot verify that all students were parsed correctly. Add a "show all" toggle or increase the preview count. | Low |
| **No file size or row count validation** | Very large CSVs could cause the browser to hang. Add a warning for files over a certain size or row count. | Low |
| **Drag-and-drop area is not keyboard accessible** | The drop zone does not support keyboard navigation. The file input is hidden and only accessible via the button, which is fine, but the overall area should handle Enter/Space to trigger the file picker. | Low |

---

## 7. General / Cross-Cutting

### Navigation
| Issue | Suggestion | Priority |
|-------|-----------|----------|
| **No breadcrumb navigation** | Each inner page has a "Back to X" ghost button, but there are no breadcrumbs showing the full path (Dashboard > Round 1 > Student Name). Breadcrumbs would reduce disorientation. | Medium |
| **Nav bar does not highlight the active route** | The Dashboard and Settings links in the top nav do not indicate which page is currently active. Add an `active` class for the current route. | Medium |
| **No nav link to Question Manager** | The Question Manager is only accessible from within a round detail page. If Ashli wants to review questions directly, she must first navigate to the round. Consider adding it to the nav or making it accessible from the dashboard. | Low |

### Responsive Design
| Issue | Suggestion | Priority |
|-------|-----------|----------|
| **Tables are not responsive** | The student table on the Round Detail page has 9 columns. On mobile/tablet, these will overflow without horizontal scroll. Add `overflow-x-auto` wrappers or use a card-based layout on small screens. | Medium |
| **Max-width inconsistency** | Dashboard uses `max-w-5xl`, Round Detail uses `max-w-6xl`, Student Detail uses `max-w-5xl`, Admin Settings uses `max-w-3xl`. The inconsistent widths cause layout shifts when navigating between pages. Standardize to one or two widths. | Low |

### Accessibility
| Issue | Suggestion | Priority |
|-------|-----------|----------|
| **Override buttons use raw `<button>` without aria-labels** | The CheckCircle/XCircle override buttons in StudentDetail have `title` attributes but no `aria-label`. Screen readers will not announce their purpose. | Medium |
| **Color-only grade indicators** | Correct (green), incorrect (red), clarify (yellow) rely solely on color. Add icons or text labels alongside the colors for colorblind accessibility. The GradeBadge component does include text labels, but the inline colored numbers in the student table (e.g., green "3", red "2") do not. | Medium |
| **Focus management in dialogs** | The QuestionEditor and CsvImporter dialogs do not explicitly manage focus on open/close. The Dialog component may handle this via Radix, but verify that focus returns to the trigger element on close. | Low |

### Loading and Error States
| Issue | Suggestion | Priority |
|-------|-----------|----------|
| **No skeleton loaders** | All loading states show a centered spinner with text. Skeleton loaders (shimmer placeholders matching the page layout) would feel faster and reduce layout shift. | Low |
| **No retry mechanism on error** | Error states show the error message but no "Retry" button (except in the CSV importer). Add a retry button on the Round Detail and Student Detail error states. | Medium |
| **No timeout handling** | If Supabase is slow or the AI grading API hangs, there is no timeout or "taking longer than expected" message. Add a timeout with a user-friendly message after 15-30 seconds. | Medium |

### Toast Usage
| Issue | Suggestion | Priority |
|-------|-----------|----------|
| **Toasts are used well throughout** | Success, error, and info toasts are consistently applied. The descriptions provide helpful context. | -- |
| **No undo support in toasts** | For destructive or important actions (overrides, answer set additions), the toast could include an "Undo" action button. Sonner supports action buttons in toasts. | Medium |

---

## Summary: Top 10 Highest-Impact Improvements

1. **Add keyboard shortcuts for the student review flow** (StudentDetail) -- HIGH
2. **Add prev/next student navigation** (StudentDetail) -- HIGH
3. **Add sorting and filtering to the student table** (RoundDetail) -- HIGH
4. **Add a "clarify" filter and resolution workflow** (StudentDetail) -- HIGH
5. **Add manual column mapping for unmatched CSV headers** (CsvImporter) -- HIGH
6. **Add confirmation dialog before "Grade All"** with cost estimate (RoundDetail) -- HIGH
7. **Add explanatory tooltips to confidence threshold settings** (AdminSettings) -- HIGH
8. **Fix action bar overflow on smaller screens** (RoundDetail) -- HIGH
9. **Add search/filter to the Question Manager** (QuestionManager) -- HIGH
10. **Add grading progress indicator to round cards on the Dashboard** (Dashboard) -- HIGH

---

*Report generated 2026-04-07. All observations based on source code review only (no runtime testing).*
