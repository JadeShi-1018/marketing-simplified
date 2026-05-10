"use client"

import { LayoutTemplate, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PendingExternalApproval } from "./ExternalApprovalModal"

type RecommendedMiroBoardCardProps = {
  pending: PendingExternalApproval
  disabled?: boolean
  generating?: boolean
  onApprove?: () => void
  onReject?: () => void
}

export function RecommendedMiroBoardCard({
  pending,
  disabled,
  generating,
  onApprove,
  onReject,
}: RecommendedMiroBoardCardProps) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 shrink-0">
            <LayoutTemplate className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold text-card-foreground truncate">
              Recommended Miro Board
            </CardTitle>
            <p className="text-xs text-muted-foreground truncate">
              Review destination and approve generation.
            </p>
          </div>
          {generating && (
            <span className="ml-auto inline-flex items-center text-muted-foreground" title="Generating Miro...">
              <Loader2 className="h-4 w-4 animate-spin" />
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 space-y-3">
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={disabled || generating} onClick={() => onReject?.()}>
            Reject
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={disabled || generating}
            onClick={() => onApprove?.()}
          >
            Approve
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

