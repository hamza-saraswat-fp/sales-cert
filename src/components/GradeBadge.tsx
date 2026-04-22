import { Badge } from '@/components/ui/badge'

type GradeBadgeVariant = 'correct' | 'incorrect' | 'partial' | 'clarify' | 'pending' | 'skipped'

const variantMap: Record<GradeBadgeVariant, { label: string; className: string }> = {
  correct: {
    label: 'Correct',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  incorrect: {
    label: 'Incorrect',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
  partial: {
    label: 'Half',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  clarify: {
    label: 'Clarify',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
  pending: {
    label: 'Pending',
    className: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  skipped: {
    label: 'Skipped',
    className: 'bg-slate-50 text-slate-400 border-slate-200',
  },
}

export function GradeBadge({ grade }: { grade: GradeBadgeVariant }) {
  const config = variantMap[grade] || variantMap.pending
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  )
}

export function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    yes_no: 'bg-blue-100 text-blue-800 border-blue-200',
    short: 'bg-purple-100 text-purple-800 border-purple-200',
    long: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    list: 'bg-teal-100 text-teal-800 border-teal-200',
    screenshot: 'bg-orange-100 text-orange-800 border-orange-200',
  }

  const labels: Record<string, string> = {
    yes_no: 'Yes/No',
    short: 'Short',
    long: 'Long',
    list: 'List',
    screenshot: 'Screenshot',
  }

  return (
    <Badge variant="outline" className={colors[type] || 'bg-slate-100 text-slate-600'}>
      {labels[type] || type}
    </Badge>
  )
}
