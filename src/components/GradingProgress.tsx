import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  SkipForward,
  Ban,
  CircleAlert,
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

        {/* Stats */}
        <div className="flex flex-wrap gap-2">
          <Badge
            variant="outline"
            className="bg-green-50 text-green-700 border-green-200"
          >
            <CheckCircle className="size-3" />
            {progress.correct} correct
          </Badge>
          <Badge
            variant="outline"
            className="bg-red-50 text-red-700 border-red-200"
          >
            <XCircle className="size-3" />
            {progress.incorrect} incorrect
          </Badge>
          <Badge
            variant="outline"
            className="bg-yellow-50 text-yellow-700 border-yellow-200"
          >
            <AlertTriangle className="size-3" />
            {progress.clarify} clarify
          </Badge>
          {progress.skipped > 0 && (
            <Badge variant="outline" className="bg-slate-50 text-slate-500">
              <SkipForward className="size-3" />
              {progress.skipped} skipped
            </Badge>
          )}
          {progress.errors > 0 && (
            <Badge
              variant="outline"
              className="bg-red-50 text-red-700 border-red-200"
            >
              <CircleAlert className="size-3" />
              {progress.errors} errors
            </Badge>
          )}
        </div>

        {/* Current question */}
        {isGrading && progress.currentQuestion && (
          <p className="text-xs text-muted-foreground mt-2 truncate">
            Grading: {progress.currentQuestion}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
