"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { AgentAPI } from "@/lib/api/agentApi"
import type { AgentChatRequest, SSEEvent } from "@/types/agent"

export type PendingExternalApproval = {
  id: string
  kind: string
  draft: Record<string, unknown>
}

type ExternalApprovalModalProps = {
  open: boolean
  sessionId: string
  pending: PendingExternalApproval | null
  onClose: () => void
  onResolved: () => void
}

export function ExternalApprovalModal({
  open,
  sessionId,
  pending,
  onClose,
  onResolved,
}: ExternalApprovalModalProps) {
  const [draftJson, setDraftJson] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!pending) return
    try {
      setDraftJson(JSON.stringify(pending.draft, null, 2))
    } catch {
      setDraftJson("{}")
    }
    setError(null)
  }, [pending])

  const submit = useCallback(
    (decision: "approve" | "reject") => {
      if (!pending) return
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
          /* streamed chunks ignored here; chat list updates on next refresh */
        },
        (err) => {
          setError(err.message)
          setSubmitting(false)
        },
        () => {
          setSubmitting(false)
          onResolved()
          onClose()
        }
      )
    },
    [pending, sessionId, draftJson, onClose, onResolved]
  )

  if (!pending) return null

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !submitting && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Approve external action</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Type: <span className="font-medium text-foreground">{pending.kind.replace(/_/g, " ")}</span>
        </p>
        <div className="space-y-2">
          <Label htmlFor="approval-draft">Draft (JSON)</Label>
          <textarea
            id="approval-draft"
            className="w-full min-h-[160px] rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
            value={draftJson}
            onChange={(e) => setDraftJson(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" disabled={submitting} onClick={() => submit("reject")}>
            Reject
          </Button>
          <Button type="button" disabled={submitting} onClick={() => submit("approve")}>
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
