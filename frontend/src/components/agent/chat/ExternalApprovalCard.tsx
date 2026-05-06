"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronDown, ChevronRight, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { AgentAPI } from "@/lib/api/agentApi"
import type { AgentChatRequest, SSEEvent } from "@/types/agent"

export type PendingExternalApproval = {
  id: string
  kind: string
  draft: Record<string, unknown>
}

type ExternalApprovalCardProps = {
  sessionId: string
  pending: PendingExternalApproval
  disabled?: boolean
  onResolved?: () => void
}

export function ExternalApprovalCard({ sessionId, pending, disabled, onResolved }: ExternalApprovalCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [draftJson, setDraftJson] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      setDraftJson(JSON.stringify(pending.draft ?? {}, null, 2))
    } catch {
      setDraftJson("{}")
    }
    setError(null)
  }, [pending])

  const submit = useCallback(
    (decision: "approve" | "reject") => {
      if (disabled || submitting) return
      setSubmitting(true)
      setError(null)

      let parsedDraft: Record<string, unknown> | undefined
      if (decision === "approve") {
        try {
          parsedDraft = JSON.parse(draftJson) as Record<string, unknown>
        } catch {
          setError("Draft must be valid JSON.")
          setSubmitting(false)
          return
        }
      }

      const body: AgentChatRequest = {
        message: ".",
        action: "resolve_external_approval",
        approval_id: pending.id,
        approval_decision: decision,
        approval_draft: decision === "approve" ? parsedDraft : undefined,
      }

      AgentAPI.sendMessage(
        sessionId,
        body,
        (_ev: SSEEvent) => {
          /* streamed chunks ignored here; parent refreshes session on complete */
        },
        (err) => {
          setError(err.message)
          setSubmitting(false)
        },
        () => {
          setSubmitting(false)
          onResolved?.()
        }
      )
    },
    [disabled, submitting, sessionId, pending.id, draftJson, onResolved]
  )

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 shrink-0">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm font-semibold text-card-foreground truncate">
                Approval required
              </CardTitle>
              <p className="text-xs text-muted-foreground truncate">
                Type: <span className="font-medium text-foreground">{pending.kind.replace(/_/g, " ")}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground",
              (disabled || submitting) && "opacity-50 pointer-events-none"
            )}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Draft
          </button>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 pt-0 space-y-3">
        {expanded && (
          <div className="space-y-2">
            <Label htmlFor={`approval-draft-${pending.id}`}>Draft (JSON)</Label>
            <textarea
              id={`approval-draft-${pending.id}`}
              className="w-full min-h-[160px] rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
              value={draftJson}
              onChange={(e) => setDraftJson(e.target.value)}
              disabled={disabled || submitting}
            />
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={disabled || submitting} onClick={() => submit("reject")}>
            Reject
          </Button>
          <Button type="button" size="sm" disabled={disabled || submitting} onClick={() => submit("approve")}>
            Approve
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

