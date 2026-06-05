"use client"

import { LayoutTemplate } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AgentMessageBoardText } from "./AgentMessageBoardText"

const TITLE = "Recommended Miro Board"
const BODY =
  "Generate a Miro board from the current analysis and recommended tasks."

interface MiroGenerateCardProps {
  onGenerate?: () => void
  disabled?: boolean
  disabledHint?: string
  messageId?: string
  blockId?: string
}

export function MiroGenerateCard({
  onGenerate,
  disabled = false,
  disabledHint,
  messageId = "miro-generate",
  blockId,
}: MiroGenerateCardProps) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 shrink-0">
            <LayoutTemplate className="h-4 w-4 text-primary" />
          </div>
          <CardTitle className="text-sm font-semibold text-card-foreground">
            <AgentMessageBoardText target={TITLE} partId={`${messageId}-miro-title`} blockId={blockId} className="inline" />
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 space-y-3">
        <p className="text-sm text-foreground">
          <AgentMessageBoardText target={BODY} partId={`${messageId}-miro-body`} blockId={blockId} />
        </p>
        {disabled && disabledHint ? (
          <p className="text-xs text-muted-foreground">
            <AgentMessageBoardText target={disabledHint} partId={`${messageId}-miro-hint`} blockId={blockId} />
          </p>
        ) : null}
        <Button size="sm" variant="outline" onClick={onGenerate} disabled={disabled}>
          <AgentMessageBoardText target="Generate Miro" partId={`${messageId}-miro-button`} blockId={blockId} />
        </Button>
      </CardContent>
    </Card>
  )
}
