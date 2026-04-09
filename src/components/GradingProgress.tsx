import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Loader2,
  CheckCircle,
  Ban,
} from 'lucide-react'
import type { BatchGradeProgress } from '@/lib/grading'

interface GradingProgressProps {
  progress: BatchGradeProgress
  isGrading: boolean
  onCancel: () => void
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
