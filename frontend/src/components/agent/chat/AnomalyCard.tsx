"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle, TrendingDown, Info, ChevronDown, ChevronRight, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AnomalyItem } from "@/types/agent"
import { AgentMessageBoardText } from "./AgentMessageBoardText"

const severityConfig = {
  critical: { icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/20", label: "Critical" },
  warning: { icon: TrendingDown, color: "text-orange-400", bg: "bg-orange-500/20", label: "Warning" },
  info: { icon: Info, color: "text-green-400", bg: "bg-green-500/20", label: "Info" },
} as const

function getSeverity(anomaly: AnomalyItem): keyof typeof severityConfig {
  if (anomaly.severity) return anomaly.severity
  const movement = anomaly.movement || ""
  if (movement.includes("SHARP")) return "critical"
  if (movement.includes("MODERATE")) return "warning"
  return "info"
}

function handleAddToPanel(anomaly: AnomalyItem) {
  window.dispatchEvent(new CustomEvent("agent:add-alert", { detail: anomaly }))
}

function buildAnomalyTitle(anomaly: AnomalyItem): string {
  let title = anomaly.metric
  if (anomaly.campaign) title += `: ${anomaly.campaign}`
  if (anomaly.ad_set) title += ` / ${anomaly.ad_set}`
  return title
}

function AnomalyItemRow({
  anomaly,
  messageId,
  blockId,
  index,
}: {
  anomaly: AnomalyItem
  messageId?: string
  blockId?: string
  index: number
}) {
  const severity = getSeverity(anomaly)
  const config = severityConfig[severity]
  const Icon = config.icon
  const title = buildAnomalyTitle(anomaly)

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg shrink-0", config.bg)}>
            <Icon className={cn("h-4 w-4", config.color)} />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-semibold text-card-foreground truncate">
              <AgentMessageBoardText
                target={title}
                partId={`${messageId ?? "anomaly"}-${index}-title`}
                blockId={blockId}
              />
            </CardTitle>
          </div>
          <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full shrink-0", config.bg, config.color)}>
            <AgentMessageBoardText
              target={config.label}
              partId={`${messageId ?? "anomaly"}-${index}-severity`}
              blockId={blockId}
            />
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => handleAddToPanel(anomaly)}
          >
            <Plus className="h-3 w-3 mr-0.5" />
            <AgentMessageBoardText
              target="Add"
              partId={`${messageId ?? "anomaly"}-${index}-add`}
              blockId={blockId}
            />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0">
        <p className="text-sm text-muted-foreground">
          <AgentMessageBoardText
            target={anomaly.description}
            partId={`${messageId ?? "anomaly"}-${index}-desc`}
            blockId={blockId}
          />
        </p>
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
}

export function AnomalyCard({ anomalies, messageId, blockId }: AnomalyCardProps) {
  if (!anomalies.length) return null

  const alerts = anomalies.filter((a) => {
    const sev = getSeverity(a)
    return sev === "critical" || sev === "warning"
  })
  const signals = anomalies.filter((a) => getSeverity(a) === "info")

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
          {alerts.map((anomaly, i) => (
            <AnomalyItemRow
              key={`alert-${i}`}
              anomaly={anomaly}
              messageId={messageId}
              blockId={blockId}
              index={i}
            />
          ))}
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
          {signals.map((anomaly, i) => (
            <AnomalyItemRow
              key={`signal-${i}`}
              anomaly={anomaly}
              messageId={messageId}
              blockId={blockId}
              index={alerts.length + i}
            />
          ))}
        </CollapsibleSection>
      )}
    </div>
  )
}
