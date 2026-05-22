"use client"

import { Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AgentMessageBoardText } from "./AgentMessageBoardText"

const TITLE = "Distribute to Team"
const BODY = "Send analysis summary and tasks to team members via chat."

interface DistributeMessageCardProps {
  onDistribute?: () => void
  messageId?: string
  blockId?: string
}

export function DistributeMessageCard({ onDistribute, messageId, blockId }: DistributeMessageCardProps) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 shrink-0">
            <Send className="h-4 w-4 text-primary" />
          </div>
          <CardTitle className="text-sm font-semibold text-card-foreground">
            <AgentMessageBoardText
              target={TITLE}
              partId={`${messageId ?? "distribute"}-title`}
              blockId={blockId}
            />
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 space-y-3">
        <p className="text-sm text-foreground">
          <AgentMessageBoardText
            target={BODY}
            partId={`${messageId ?? "distribute"}-body`}
            blockId={blockId}
          />
        </p>
        <Button size="sm" variant="outline" onClick={onDistribute}>
          <AgentMessageBoardText
            target="Send Message"
            partId={`${messageId ?? "distribute"}-button`}
            blockId={blockId}
          />
        </Button>
      </CardContent>
    </Card>
  )
}
