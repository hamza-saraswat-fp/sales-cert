import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Save, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { IS_DEMO, demoModels } from '@/lib/mock-data'
import type { ModelOption } from '@/lib/types'

interface ConfigState {
  autoCorrect: number
  clarifyMin: number
  flagBelow: number
  defaultModel: string
  availableModels: ModelOption[]
  mintlifyBaseUrl: string
  adminPasscode: string
}

const DEFAULT_CONFIG: ConfigState = {
  autoCorrect: 85,
  clarifyMin: 60,
  flagBelow: 60,
  defaultModel: 'anthropic/claude-3.5-haiku',
  availableModels: demoModels,
  mintlifyBaseUrl: 'https://fieldpulse.mintlify.app',
  adminPasscode: 'fieldpulse2026',
}

export default function AdminSettings() {
  const [config, setConfig] = useState<ConfigState>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Passcode change fields
  const [currentPasscode, setCurrentPasscode] = useState('')
  const [newPasscode, setNewPasscode] = useState('')

  useEffect(() => {
    async function loadConfig() {
      if (IS_DEMO) {
        setLoading(false)
        return
      }

      try {
        const { data: rows } = await supabase
          .from('grading_config')
          .select('key, value')

        if (rows) {
          const map: Record<string, unknown> = {}
          for (const row of rows) map[row.key] = row.value

          setConfig({
            autoCorrect: (map.confidence_thresholds as { auto_correct: number })?.auto_correct ?? 85,
            clarifyMin: (map.confidence_thresholds as { clarify_min: number })?.clarify_min ?? 60,
            flagBelow: (map.confidence_thresholds as { flag_below: number })?.flag_below ?? 60,
            defaultModel: (map.default_model as string) || 'anthropic/claude-3.5-haiku',
            availableModels: (map.available_models as ModelOption[]) || demoModels,
            mintlifyBaseUrl: (map.mintlify_base_url as string) || 'https://fieldpulse.mintlify.app',
            adminPasscode: (map.admin_passcode as string) || '',
          })
        }
      } catch {
        toast.error('Failed to load settings')
      } finally {
        setLoading(false)
      }
    }
    loadConfig()
  }, [])

  const handleSaveThresholds = async () => {
    setSaving(true)
    try {
      if (!IS_DEMO) {
        const { error } = await supabase
          .from('grading_config')
          .update({
            value: JSON.stringify({
              auto_correct: config.autoCorrect,
              clarify_min: config.clarifyMin,
              flag_below: config.flagBelow,
            }),
            updated_at: new Date().toISOString(),
          })
          .eq('key', 'confidence_thresholds')

        if (error) throw error
      }
      toast.success('Confidence thresholds saved')
    } catch {
      toast.error('Failed to save thresholds')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveModel = async () => {
    setSaving(true)
    try {
      if (!IS_DEMO) {
        const { error } = await supabase
          .from('grading_config')
          .update({
            value: JSON.stringify(config.defaultModel),
            updated_at: new Date().toISOString(),
          })
          .eq('key', 'default_model')

        if (error) throw error
      }
      toast.success('Default model saved')
    } catch {
      toast.error('Failed to save model')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveMintlify = async () => {
    setSaving(true)
    try {
      if (!IS_DEMO) {
        const { error } = await supabase
          .from('grading_config')
          .update({
            value: JSON.stringify(config.mintlifyBaseUrl),
            updated_at: new Date().toISOString(),
          })
          .eq('key', 'mintlify_base_url')

        if (error) throw error
      }
      toast.success('Mintlify URL saved')
    } catch {
      toast.error('Failed to save Mintlify URL')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePasscode = async () => {
    if (currentPasscode !== config.adminPasscode) {
      toast.error('Current passcode is incorrect')
      return
    }
    if (!newPasscode.trim() || newPasscode.length < 4) {
      toast.error('New passcode must be at least 4 characters')
      return
    }

    setSaving(true)
    try {
      if (!IS_DEMO) {
        const { error } = await supabase
          .from('grading_config')
          .update({
            value: JSON.stringify(newPasscode),
            updated_at: new Date().toISOString(),
          })
          .eq('key', 'admin_passcode')

        if (error) throw error
      }

      setConfig((prev) => ({ ...prev, adminPasscode: newPasscode }))
      setCurrentPasscode('')
      setNewPasscode('')
      toast.success('Passcode updated')
    } catch {
      toast.error('Failed to update passcode')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto py-16 flex flex-col items-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Loading settings...</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Admin Settings</h1>

      {IS_DEMO && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <strong>Demo Mode</strong> – Changes won't persist. Connect Supabase for real config storage.
        </div>
      )}

      <div className="space-y-6">
        {/* Confidence Thresholds */}
        <Card>
          <CardHeader>
            <CardTitle>Confidence Thresholds</CardTitle>
            <CardDescription>
              Configure how AI confidence scores map to grade assignments.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Auto-correct above</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={config.autoCorrect}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, autoCorrect: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Clarify minimum</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={config.clarifyMin}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, clarifyMin: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Flag below</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={config.flagBelow}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, flagBelow: Number(e.target.value) }))
                  }
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={handleSaveThresholds} disabled={saving}>
                <Save className="size-3" />
                Save Thresholds
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Model Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Model Configuration</CardTitle>
            <CardDescription>
              Choose the default AI model for grading.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Default Model</Label>
              <Select
                value={config.defaultModel}
                onValueChange={(v) => setConfig((prev) => ({ ...prev, defaultModel: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {config.availableModels.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} ({m.cost_per_student})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={handleSaveModel} disabled={saving}>
                <Save className="size-3" />
                Save Model
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Mintlify URL */}
        <Card>
          <CardHeader>
            <CardTitle>Doc Context</CardTitle>
            <CardDescription>
              Mintlify Help Center base URL for fetching grading context.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Mintlify Base URL</Label>
              <Input
                value={config.mintlifyBaseUrl}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, mintlifyBaseUrl: e.target.value }))
                }
                placeholder="https://fieldpulse.mintlify.app"
              />
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={handleSaveMintlify} disabled={saving}>
                <Save className="size-3" />
                Save URL
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Admin Passcode */}
        <Card>
          <CardHeader>
            <CardTitle>Admin Passcode</CardTitle>
            <CardDescription>
              Change the admin passcode for accessing the app.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Current Passcode</Label>
              <Input
                type="password"
                value={currentPasscode}
                onChange={(e) => setCurrentPasscode(e.target.value)}
                placeholder="Enter current passcode"
              />
            </div>
            <div className="space-y-2">
              <Label>New Passcode</Label>
              <Input
                type="password"
                value={newPasscode}
                onChange={(e) => setNewPasscode(e.target.value)}
                placeholder="Enter new passcode"
              />
            </div>
            <Button
              onClick={handleChangePasscode}
              disabled={saving || !currentPasscode || !newPasscode}
            >
              <CheckCircle className="size-4" />
              Update Passcode
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
