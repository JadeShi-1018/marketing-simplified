"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle, TrendingDown, Info, ChevronDown, ChevronRight, Lock } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AnomalyItem, AnomalySeverity, ReviewedAnomaly } from "@/types/agent"
import { AgentMessageBoardText } from "./AgentMessageBoardText"

const severityConfig = {
  critical: { icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/20", label: "Critical" },
  warning: { icon: TrendingDown, color: "text-orange-400", bg: "bg-orange-500/20", label: "Warning" },
  info: { icon: Info, color: "text-green-400", bg: "bg-green-500/20", label: "Info" },
} as const

const SEVERITY_OPTIONS: AnomalySeverity[] = ["critical", "warning", "info"]

function getSeverity(anomaly: AnomalyItem): AnomalySeverity {
  if (anomaly.severity) return anomaly.severity
  const movement = anomaly.movement || ""
  if (movement.includes("SHARP")) return "critical"
  if (movement.includes("MODERATE")) return "warning"
  return "info"
}

function buildAnomalyTitle(anomaly: AnomalyItem): string {
  let title = anomaly.metric
  if (anomaly.campaign) title += `: ${anomaly.campaign}`
  if (anomaly.ad_set) title += ` / ${anomaly.ad_set}`
  return title
}

/** Per-anomaly review state held locally until the user confirms. */
interface ReviewState {
  id: string
  included: boolean
  severity: AnomalySeverity
  description: string
}

function AnomalyItemRow({
  anomaly,
  review,
  readOnly,
  onChange,
  messageId,
  blockId,
  index,
}: {
  anomaly: AnomalyItem
  review: ReviewState
  readOnly: boolean
  onChange: (patch: Partial<ReviewState>) => void
  messageId?: string
  blockId?: string
  index: number
}) {
  const config = severityConfig[review.severity]
  const Icon = config.icon
  const title = buildAnomalyTitle(anomaly)
  const excluded = !review.included

  return (
    <Card className={cn("bg-card border-border transition-opacity", excluded && "opacity-50")}>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={review.included}
            disabled={readOnly}
            onChange={(e) => onChange({ included: e.target.checked })}
            aria-label={`Include ${title}`}
            className="h-4 w-4 shrink-0 accent-primary disabled:cursor-not-allowed"
          />
          <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg shrink-0", config.bg)}>
            <Icon className={cn("h-4 w-4", config.color)} />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle
              className={cn(
                "text-sm font-semibold text-card-foreground truncate",
                excluded && "line-through"
              )}
            >
              <AgentMessageBoardText
                target={title}
                partId={`${messageId ?? "anomaly"}-${index}-title`}
                blockId={blockId}
              />
            </CardTitle>
          </div>
          {readOnly ? (
            <span
              className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-full shrink-0",
                config.bg,
                config.color
              )}
            >
              {config.label}
            </span>
          ) : (
            <select
              value={review.severity}
              onChange={(e) => onChange({ severity: e.target.value as AnomalySeverity })}
              aria-label={`Severity for ${title}`}
              className="shrink-0 rounded-md border border-border bg-background px-2 py-1 text-xs"
            >
              {SEVERITY_OPTIONS.map((sev) => (
                <option key={sev} value={sev}>
                  {severityConfig[sev].label}
                </option>
              ))}
            </select>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0">
        {readOnly ? (
          <p className={cn("text-sm text-muted-foreground", excluded && "line-through")}>
            <AgentMessageBoardText
              target={review.description}
              partId={`${messageId ?? "anomaly"}-${index}-desc`}
              blockId={blockId}
            />
          </p>
        ) : (
          <textarea
            value={review.description}
            onChange={(e) => onChange({ description: e.target.value })}
            aria-label={`Description for ${title}`}
            rows={2}
            className="w-full resize-y rounded-md border border-border bg-background px-2 py-1 text-sm text-muted-foreground"
          />
        )}
      </CardContent>
    </Card>
  )
}

interface CollapsibleSectionProps {
  title: string
  count: number
  defaultExpanded: boolean
  messageId?: string
  blockId?: string
  partId: string
  children: React.ReactNode
}

function CollapsibleSection({
  title,
  count,
  defaultExpanded,
  messageId,
  blockId,
  partId,
  children,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const headerTarget = `${title} (${count})`

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full text-left py-1"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="text-sm font-semibold text-foreground">
          <AgentMessageBoardText
            target={headerTarget}
            partId={`${messageId ?? "anomaly"}-${partId}`}
            blockId={blockId}
          />
        </span>
      </button>
      {expanded && <div className="flex flex-col gap-2 mt-1">{children}</div>}
    </div>
  )
}

interface AnomalyCardProps {
  anomalies: AnomalyItem[]
  messageId?: string
  blockId?: string
  /** When true the card is locked read-only (already confirmed). */
  confirmed?: boolean
  /** Disable interaction (e.g. while the agent is streaming). */
  disabled?: boolean
  onConfirm?: (reviewed: ReviewedAnomaly[]) => void
}

export function AnomalyCard({
  anomalies,
  messageId,
  blockId,
  confirmed = false,
  disabled = false,
  onConfirm,
}: AnomalyCardProps) {
  // Initialise the editable review state once from the incoming anomalies.
  const [reviewMap, setReviewMap] = useState<Record<string, ReviewState>>(() => {
    const initial: Record<string, ReviewState> = {}
    for (const a of anomalies) {
      initial[a.id] = {
        id: a.id,
        included: a.included ?? true,
        severity: getSeverity(a),
        description: a.description,
      }
    }
    return initial
  })

  if (!anomalies.length) return null

  const readOnly = confirmed || disabled
  const interactive = Boolean(onConfirm) && !confirmed

  const updateReview = (id: string, patch: Partial<ReviewState>) => {
    setReviewMap((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  // Group by the CURRENT (possibly edited) severity so edits re-group live.
  const ordered = anomalies
    .map((a) => ({ anomaly: a, review: reviewMap[a.id] }))
    .filter((x) => x.review)
  const alerts = ordered.filter(
    (x) => x.review.severity === "critical" || x.review.severity === "warning"
  )
  const signals = ordered.filter((x) => x.review.severity === "info")

  const renderRow = (anomaly: AnomalyItem, idx: number) => (
    <AnomalyItemRow
      key={anomaly.id}
      anomaly={anomaly}
      review={reviewMap[anomaly.id]}
      readOnly={readOnly}
      onChange={(patch) => updateReview(anomaly.id, patch)}
      messageId={messageId}
      blockId={blockId}
      index={idx}
    />
  )

  const handleConfirm = () => {
    if (!onConfirm) return
    const reviewed: ReviewedAnomaly[] = anomalies.map((a) => {
      const r = reviewMap[a.id]
      return {
        id: a.id,
        included: r.included,
        severity: r.severity,
        description: r.description,
      }
    })
    onConfirm(reviewed)
  }

  return (
    <div className="flex flex-col gap-3">
      {alerts.length > 0 && (
        <CollapsibleSection
          title="Alerts"
          count={alerts.length}
          defaultExpanded={true}
          messageId={messageId}
          blockId={blockId}
          partId="anomaly-alerts-header"
        >
          {alerts.map((x, i) => renderRow(x.anomaly, i))}
        </CollapsibleSection>
      )}
      {signals.length > 0 && (
        <CollapsibleSection
          title="Signals"
          count={signals.length}
          defaultExpanded={false}
          messageId={messageId}
          blockId={blockId}
          partId="anomaly-signals-header"
        >
          {signals.map((x, i) => renderRow(x.anomaly, alerts.length + i))}
        </CollapsibleSection>
      )}

      {confirmed ? (
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          <span>Anomalies confirmed — review locked</span>
        </div>
      ) : (
        interactive && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Review each anomaly, then confirm. Once confirmed, this review is locked and
              cannot be edited.
            </p>
            <Button size="sm" onClick={handleConfirm} disabled={disabled} className="self-start">
              Confirm Anomalies
            </Button>
          </div>
        )
      )}
    </div>
  )
}
