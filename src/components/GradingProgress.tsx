import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Loader2,
  CheckCircle,
  Ban,
  Clock,
} from 'lucide-react'
import type { BatchGradeProgress } from '@/lib/grading'

interface GradingProgressProps {
  progress: BatchGradeProgress
  isGrading: boolean
  onCancel: () => void
}

function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return ''
  if (seconds < 60) return `${Math.ceil(seconds)}s left`
  const mins = Math.floor(seconds / 60)
  const secs = Math.ceil(seconds - mins * 60)
  return `${mins}m ${secs}s left`
}

export function GradingProgress({
  progress,
  isGrading,
  onCancel,
}: GradingProgressProps) {
  const percent =
    progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0

  const isDone = !isGrading && progress.completed > 0

  // ETA — based on rolling average since the batch started.
  let etaLabel = ''
  if (isGrading && progress.completed > 0 && progress.total > 0 && progress.startedAt) {
    const elapsedMs = Date.now() - progress.startedAt
    const msPerItem = elapsedMs / progress.completed
    const remaining = progress.total - progress.completed
    etaLabel = formatEta((remaining * msPerItem) / 1000)
  }

  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {isGrading ? (
              <Loader2 className="size-4 animate-spin text-primary" />
            ) : isDone ? (
              <CheckCircle className="size-4 text-green-600" />
            ) : null}
            <span className="text-sm font-medium">
              {isGrading
                ? `Grading... ${progress.completed}/${progress.total}`
                : isDone
                  ? `Grading Complete – ${progress.completed}/${progress.total}`
                  : 'Ready to grade'}
            </span>
            {etaLabel && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3" />
                {etaLabel}
              </span>
            )}
          </div>
          {isGrading && (
            <Button variant="ghost" size="xs" onClick={onCancel}>
              <Ban className="size-3" />
              Cancel
            </Button>
          )}
        </div>

        {/* Progress bar */}
        <Progress value={percent} className="mb-3" />

        {/* Live tallies */}
        {(isGrading || isDone) && progress.completed > 0 && (
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-2">
            {progress.correct > 0 && (
              <span className="text-green-700">{progress.correct} correct</span>
            )}
            {progress.incorrect > 0 && (
              <span className="text-red-700">{progress.incorrect} incorrect</span>
            )}
            {progress.partial > 0 && (
              <span className="text-amber-700">{progress.partial} partial</span>
            )}
            {progress.clarify > 0 && (
              <span className="text-yellow-700">{progress.clarify} clarify</span>
            )}
            {progress.skipped > 0 && (
              <span>{progress.skipped} skipped</span>
            )}
            {progress.errors > 0 && (
              <span className="text-red-600">{progress.errors} error{progress.errors === 1 ? '' : 's'}</span>
            )}
          </div>
        )}

        {/* Current question */}
        {isGrading && progress.currentQuestion && (
          <p className="text-xs text-muted-foreground mt-2 truncate">
            Grading: {progress.currentQuestion}
          </p>
        )}

        {/* Resilience note */}
        {isGrading && (
          <p className="text-xs text-muted-foreground mt-1">
            If you close this tab, grading will pick up where it left off when you come back.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
