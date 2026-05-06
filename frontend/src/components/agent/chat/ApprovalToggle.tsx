"use client"

import { useCallback, useState } from "react"
import { cn } from "@/lib/utils"
import { AgentAPI } from "@/lib/api/agentApi"

type ApprovalToggleProps = {
  /** When omitted, toggle becomes local-only (no API call). */
  sessionId?: string | null
  value: boolean
  onChange?: (next: boolean) => void
  disabled?: boolean
}

/** Green pill switch — matches approval-required “on” styling. */
export function ApprovalToggle({ sessionId, value, onChange, disabled }: ApprovalToggleProps) {
  const [pending, setPending] = useState(false)

  const toggle = useCallback(async () => {
    if (disabled || pending) return
    const next = !value
    // No session yet: let the parent persist the preference.
    if (!sessionId) {
      onChange?.(next)
      return
    }
    setPending(true)
    try {
      await AgentAPI.updateSession(sessionId, { approval_required: next })
      onChange?.(next)
    } catch {
      // keep prior value on failure
    } finally {
      setPending(false)
    }
  }, [disabled, pending, sessionId, value, onChange])

  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label="Require approval before external actions"
      title={value ? "Approval required for external actions" : "External actions run without approval"}
      disabled={disabled || pending}
      onClick={toggle}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#22c55e]/80 disabled:opacity-50",
        value ? "bg-[#22c55e]" : "bg-muted-foreground/30"
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
          value ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  )
}
