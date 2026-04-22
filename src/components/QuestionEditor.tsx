import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Plus,
  Trash2,
  Save,
  RefreshCw,
  Loader2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { IS_DEMO } from '@/lib/mock-data'
import type { Question, FewShotExample, QuestionType } from '@/lib/types'

interface QuestionEditorProps {
  question: Question
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (questionId: string, updates: Partial<Question>) => Promise<boolean>
  onRescore?: (questionId: string) => void
}

export function QuestionEditor({
  question,
  open,
  onOpenChange,
  onSave,
  onRescore,
}: QuestionEditorProps) {
  // ── Editable state ──────────────────────────────────────────────────────
  const [answerKey, setAnswerKey] = useState(question.answer_key)
  const [keyPoints, setKeyPoints] = useState<string[]>([...question.key_points])
  const [newKeyPoint, setNewKeyPoint] = useState('')
  const [isScored, setIsScored] = useState(question.is_scored)
  const [allowPartialCredit, setAllowPartialCredit] = useState(question.allow_partial_credit)
  const [questionType, setQuestionType] = useState<QuestionType>(question.question_type)
  const [fewShotGood, setFewShotGood] = useState<FewShotExample[]>([...question.few_shot_good])
  const [fewShotBad, setFewShotBad] = useState<FewShotExample[]>([...question.few_shot_bad])

  // New example form state
  const [newGoodResponse, setNewGoodResponse] = useState('')
  const [newGoodExplanation, setNewGoodExplanation] = useState('')
  const [newBadResponse, setNewBadResponse] = useState('')
  const [newBadExplanation, setNewBadExplanation] = useState('')
  const [showAddGood, setShowAddGood] = useState(false)
  const [showAddBad, setShowAddBad] = useState(false)

  const [saving, setSaving] = useState(false)
  const [rescoring, setRescoring] = useState(false)

  // Reset state when question changes
  const resetToQuestion = () => {
    setAnswerKey(question.answer_key)
    setKeyPoints([...question.key_points])
    setIsScored(question.is_scored)
    setAllowPartialCredit(question.allow_partial_credit)
    setQuestionType(question.question_type)
    setFewShotGood([...question.few_shot_good])
    setFewShotBad([...question.few_shot_bad])
  }

  // ── Key points ──────────────────────────────────────────────────────────
  const addKeyPoint = () => {
    const trimmed = newKeyPoint.trim()
    if (!trimmed || keyPoints.includes(trimmed)) return
    setKeyPoints([...keyPoints, trimmed])
    setNewKeyPoint('')
  }

  const removeKeyPoint = (index: number) => {
    setKeyPoints(keyPoints.filter((_, i) => i !== index))
  }

  // ── Few-shot examples ─────────────────────────────────────────────────
  const addGoodExample = () => {
    if (!newGoodResponse.trim() || !newGoodExplanation.trim()) return
    setFewShotGood([...fewShotGood, {
      response: newGoodResponse.trim(),
      explanation: newGoodExplanation.trim(),
    }])
    setNewGoodResponse('')
    setNewGoodExplanation('')
    setShowAddGood(false)
  }

  const addBadExample = () => {
    if (!newBadResponse.trim() || !newBadExplanation.trim()) return
    setFewShotBad([...fewShotBad, {
      response: newBadResponse.trim(),
      explanation: newBadExplanation.trim(),
    }])
    setNewBadResponse('')
    setNewBadExplanation('')
    setShowAddBad(false)
  }

  const removeGoodExample = (index: number) => {
    setFewShotGood(fewShotGood.filter((_, i) => i !== index))
  }

  const removeBadExample = (index: number) => {
    setFewShotBad(fewShotBad.filter((_, i) => i !== index))
  }

  // ── Save ──────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true)
    const updates: Partial<Question> = {
      answer_key: answerKey,
      key_points: keyPoints,
      is_scored: isScored,
      allow_partial_credit: allowPartialCredit,
      question_type: questionType,
      few_shot_good: fewShotGood,
      few_shot_bad: fewShotBad,
    }

    const success = await onSave(question.id, updates)
    setSaving(false)

    if (success) {
      toast.success('Question updated')
      onOpenChange(false)
    } else {
      toast.error('Failed to save question')
    }
  }

  // ── Re-score ──────────────────────────────────────────────────────────
  const handleRescore = async () => {
    if (IS_DEMO) {
      toast.info('Re-scoring is not available in demo mode')
      return
    }
    setRescoring(true)

    try {
      // Set needs_rescore = true for all responses to this question
      const { error } = await supabase
        .from('responses')
        .update({ needs_rescore: true, updated_at: new Date().toISOString() })
        .eq('question_id', question.id)

      if (error) throw error

      toast.success('Responses flagged for re-scoring', {
        description: 'Use "Grade All" on the round page to re-grade them.',
      })

      onRescore?.(question.id)
    } catch (err) {
      toast.error('Failed to flag for re-scoring')
    } finally {
      setRescoring(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetToQuestion(); onOpenChange(v) }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-muted-foreground font-mono text-sm">
              Q{question.question_number}
            </span>
            Edit Question
          </DialogTitle>
          <DialogDescription className="line-clamp-2 text-left">
            {question.question_text}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-2">
          {/* Type + Scored + Partial Credit */}
          <div className="flex items-center gap-6 flex-wrap">
            <div className="space-y-1.5">
              <Label className="text-xs">Question Type</Label>
              <Select value={questionType} onValueChange={(v) => setQuestionType(v as QuestionType)}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes_no">Yes/No</SelectItem>
                  <SelectItem value="short">Short</SelectItem>
                  <SelectItem value="long">Long</SelectItem>
                  <SelectItem value="list">List</SelectItem>
                  <SelectItem value="screenshot">Screenshot</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch checked={isScored} onCheckedChange={setIsScored} />
              <Label className="text-sm">Scored</Label>
            </div>
            <div className="flex flex-col pt-2">
              <div className="flex items-center gap-2">
                <Switch
                  checked={allowPartialCredit}
                  onCheckedChange={setAllowPartialCredit}
                  disabled={!isScored}
                />
                <Label className="text-sm">Allow partial credit</Label>
              </div>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Enable for 2-part questions so half-right answers get half credit.
              </p>
            </div>
          </div>

          <Separator />

          {/* Answer Key */}
          <div className="space-y-2">
            <Label>Answer Key</Label>
            <Textarea
              value={answerKey}
              onChange={(e) => setAnswerKey(e.target.value)}
              rows={3}
              className="text-sm"
            />
          </div>

          {/* Key Points */}
          <div className="space-y-2">
            <Label>Key Points</Label>
            <div className="flex flex-wrap gap-1.5 min-h-[28px]">
              {keyPoints.map((point, i) => (
                <Badge
                  key={i}
                  variant="secondary"
                  className="text-xs gap-1 pr-1 cursor-pointer hover:bg-destructive/10"
                  onClick={() => removeKeyPoint(i)}
                >
                  {point}
                  <X className="size-3" />
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newKeyPoint}
                onChange={(e) => setNewKeyPoint(e.target.value)}
                placeholder="Add a key point..."
                className="text-sm"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyPoint())}
              />
              <Button variant="outline" size="sm" onClick={addKeyPoint} disabled={!newKeyPoint.trim()}>
                <Plus className="size-3" />
                Add
              </Button>
            </div>
          </div>

          <Separator />

          {/* Few-Shot Good Examples */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-green-700">Good Examples ({fewShotGood.length})</Label>
              {!showAddGood && (
                <Button variant="outline" size="sm" onClick={() => setShowAddGood(true)}>
                  <Plus className="size-3" />
                  Add
                </Button>
              )}
            </div>

            {fewShotGood.map((ex, i) => (
              <div key={i} className="rounded-md border border-green-200 bg-green-50 p-3 text-sm relative group">
                <button
                  onClick={() => removeGoodExample(i)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700"
                >
                  <Trash2 className="size-3.5" />
                </button>
                <p className="text-muted-foreground mb-1">
                  <span className="font-medium">Response:</span> {ex.response}
                </p>
                <p className="text-muted-foreground">
                  <span className="font-medium">Explanation:</span> {ex.explanation}
                </p>
              </div>
            ))}

            {showAddGood && (
              <div className="rounded-md border border-green-300 bg-green-50/50 p-3 space-y-2">
                <Textarea
                  value={newGoodResponse}
                  onChange={(e) => setNewGoodResponse(e.target.value)}
                  placeholder="Example good response..."
                  rows={2}
                  className="text-sm"
                />
                <Textarea
                  value={newGoodExplanation}
                  onChange={(e) => setNewGoodExplanation(e.target.value)}
                  placeholder="Why this is a good answer..."
                  rows={2}
                  className="text-sm"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={addGoodExample} disabled={!newGoodResponse.trim() || !newGoodExplanation.trim()}>
                    Add Good Example
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowAddGood(false); setNewGoodResponse(''); setNewGoodExplanation('') }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Few-Shot Bad Examples */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-red-700">Bad Examples ({fewShotBad.length})</Label>
              {!showAddBad && (
                <Button variant="outline" size="sm" onClick={() => setShowAddBad(true)}>
                  <Plus className="size-3" />
                  Add
                </Button>
              )}
            </div>

            {fewShotBad.map((ex, i) => (
              <div key={i} className="rounded-md border border-red-200 bg-red-50 p-3 text-sm relative group">
                <button
                  onClick={() => removeBadExample(i)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700"
                >
                  <Trash2 className="size-3.5" />
                </button>
                <p className="text-muted-foreground mb-1">
                  <span className="font-medium">Response:</span> {ex.response}
                </p>
                <p className="text-muted-foreground">
                  <span className="font-medium">Explanation:</span> {ex.explanation}
                </p>
              </div>
            ))}

            {showAddBad && (
              <div className="rounded-md border border-red-300 bg-red-50/50 p-3 space-y-2">
                <Textarea
                  value={newBadResponse}
                  onChange={(e) => setNewBadResponse(e.target.value)}
                  placeholder="Example bad response..."
                  rows={2}
                  className="text-sm"
                />
                <Textarea
                  value={newBadExplanation}
                  onChange={(e) => setNewBadExplanation(e.target.value)}
                  placeholder="Why this is a bad answer..."
                  rows={2}
                  className="text-sm"
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" onClick={addBadExample} disabled={!newBadResponse.trim() || !newBadExplanation.trim()}>
                    Add Bad Example
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowAddBad(false); setNewBadResponse(''); setNewBadExplanation('') }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRescore}
              disabled={rescoring || IS_DEMO}
            >
              {rescoring ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RefreshCw className="size-3" />
              )}
              Re-score All Students
            </Button>

            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
