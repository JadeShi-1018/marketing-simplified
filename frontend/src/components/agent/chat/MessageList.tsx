"use client"

import { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { FileSpreadsheet, ArrowRight, CalendarPlus, UploadCloud } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { AGENT_MESSAGES } from "@/lib/agentMessages"
import { AnomalyCard } from "./AnomalyCard"
import { ColumnMappingCard } from "./ColumnMappingCard"
import { FollowUpCard } from "./FollowUpCard"
import { MiroGenerateCard } from "./MiroGenerateCard"
import { DistributeMessageCard } from "./DistributeMessageCard"
import { TaskListCard } from "./TaskListCard"
import { RecommendedMiroBoardCard } from "./RecommendedMiroBoardCard"
import type { AnomalyItem, RecommendedTask, ReviewedAnomaly, WorkflowStepState, ColumnDetectionData } from "@/types/agent"
import { StepProgress, type StepProgressItem } from "./StepProgress"
import type { PendingExternalApproval } from "./ExternalApprovalModal"
import type { TaskGenerationStatus } from "./TaskListCard"
import { AgentMessageBoardBlock } from "./AgentMessageBoardBlock"
import { AgentMessageBoardMarkdown } from "./AgentMessageBoardMarkdown"
import { AgentMessageBoardText } from "./AgentMessageBoardText"
import { AgentMessageBoardTextProvider } from "./AgentMessageBoardTextContext"
import { AgentMessageBoardAvatar } from "./AgentMessageBoardAvatar"
import {
  getAssistantMessageBlockIds,
  getMessageBoardBlockIds,
} from "./agentMessageBoardBlockIds"

export type ChatMessageType =
  | "text"
  | "analysis"
  | "file_uploaded"
  | "tasks_created"
  | "miro_status"
  | "step_progress"
  | "error"
  | "calendar_invite"
  | "column_mapping"
  | "approval_request"

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  type?: ChatMessageType
  isFollowUpPrompt?: boolean
  anomalies?: AnomalyItem[]
  anomaliesConfirmed?: boolean
  recommendedTasks?: RecommendedTask[]
  columnMappingData?: ColumnDetectionData
  fileName?: string
  navigateTo?: string
  navigateLabel?: string
  navigateDisabled?: boolean
  navigateHref?: string
  eventType?: string
  workflowRunId?: string
  stepProgress?: StepProgressItem[]
  approval?: PendingExternalApproval
}

export interface MessageListProps {
  messages: ChatMessage[]
  onAction?: (action: string) => void
  onNavigate?: (view: string, message?: ChatMessage) => void
  onConfirmColumns?: (mapping: Record<string, string>) => void
  onConfirmAnomalies?: (messageId: string, reviewed: ReviewedAnomaly[]) => void
  onReupload?: () => void
  sessionId?: string | null
  approvalDisabled?: boolean
  approvalRequired?: boolean
  generatedTaskIndexes?: number[]
  skippedTaskIndexes?: number[]
  createdTaskIdByIndex?: Record<number, number>
  generatingTasks?: boolean
  pendingTaskApproval?: PendingExternalApproval | null
  selectedTaskIndexes?: number[]
  onSelectedTaskIndexesChange?: (next: number[]) => void
  tasksApprovalGenerating?: boolean
  onApproveSelectedTasks?: (selectedIndexes: number[], destination?: Record<string, unknown>) => void
  onRejectTasksApproval?: () => void
  pendingMiroApproval?: PendingExternalApproval | null
  miroApprovalGenerating?: boolean
  onApproveMiroApproval?: (destination?: Record<string, unknown>) => void
  onRejectMiroApproval?: () => void
  latestAnalysisMessageId?: string | null
  showFollowUpToggle?: boolean
  followUpActive?: boolean
  stepState?: WorkflowStepState
  taskGenerationStatus?: TaskGenerationStatus
  isStreaming?: boolean
  showRevisitThinkingBubble?: boolean
  onRenderFinishChange?: (finished: boolean) => void
}

export function MessageList({
  messages,
  onAction,
  onNavigate,
  onConfirmColumns,
  onConfirmAnomalies,
  onReupload,
  sessionId,
  approvalDisabled,
  approvalRequired,
  generatedTaskIndexes,
  skippedTaskIndexes,
  createdTaskIdByIndex,
  generatingTasks,
  pendingTaskApproval,
  selectedTaskIndexes,
  onSelectedTaskIndexesChange,
  tasksApprovalGenerating,
  onApproveSelectedTasks,
  onRejectTasksApproval,
  pendingMiroApproval,
  miroApprovalGenerating,
  onApproveMiroApproval,
  onRejectMiroApproval,
  latestAnalysisMessageId,
  showFollowUpToggle,
  followUpActive,
  stepState,
  taskGenerationStatus,
  isStreaming = false,
  showRevisitThinkingBubble = false,
  onRenderFinishChange,
}: MessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const prevScrollTopRef = useRef(0)
  const prevScrollHeightRef = useRef(0)
  const wasAtBottomRef = useRef(true)
  const latestAnalysisWithTasks = [...messages]
    .reverse()
    .find((m) => m.type === "analysis" && Array.isArray(m.recommendedTasks) && m.recommendedTasks.length > 0)
  const bottomCardsMessageId = latestAnalysisWithTasks?.id ?? latestAnalysisMessageId ?? "board-bottom"
  const canSelectRecommendedTasks =
    (taskGenerationStatus === "idle" || taskGenerationStatus === "awaiting_approval") &&
    !tasksApprovalGenerating &&
    !generatingTasks &&
    !stepState?.tasksCreated
  const taskSelectionMode =
    canSelectRecommendedTasks &&
    (Boolean(pendingTaskApproval) ||
      (Boolean(approvalRequired) &&
        Boolean(stepState?.analysisComplete) &&
        !stepState?.tasksCreated))

  const showBottomActionCards = Boolean(
    latestAnalysisWithTasks &&
      (Boolean(stepState?.tasksCreated) ||
        Boolean(pendingTaskApproval) ||
        taskGenerationStatus === "awaiting_approval")
  )
  const hasThinkingMessage = messages.some(
    (message) =>
      message.role === "assistant" &&
      message.content === AGENT_MESSAGES.CHAT_THINKING
  )
  const boardBlockIds = useMemo(
    () =>
      getMessageBoardBlockIds(messages, {
        latestAnalysisMessageId,
        showFollowUpToggle,
        stepState,
        bottomCardsMessageId,
        showBottomActionCards,
        showMiroApproval: Boolean(pendingMiroApproval),
        showReupload: Boolean(stepState?.analysisComplete),
      }),
    [
      messages,
      latestAnalysisMessageId,
      showFollowUpToggle,
      stepState,
      bottomCardsMessageId,
      showBottomActionCards,
      pendingMiroApproval,
    ]
  )
  const extraPartIdsOnQuit = useMemo(
    () => (stepState?.analysisComplete ? ["reupload-button"] : []),
    [stepState?.analysisComplete]
  )

  // Track whether the user is currently at (or near) the bottom.
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return

    const thresholdPx = 24
    const update = () => {
      const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight)
      wasAtBottomRef.current = distanceFromBottom <= thresholdPx
      prevScrollTopRef.current = el.scrollTop
      prevScrollHeightRef.current = el.scrollHeight
    }

    update()
    el.addEventListener("scroll", update, { passive: true })
    return () => el.removeEventListener("scroll", update)
  }, [])

  // On new messages:
  // - if user is at bottom, keep them at bottom
  // - otherwise, preserve their viewport position (so new messages don't jump the scroll)
  useLayoutEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return

    const prevScrollTop = prevScrollTopRef.current
    const prevScrollHeight = prevScrollHeightRef.current
    const nextScrollHeight = el.scrollHeight

    if (wasAtBottomRef.current) {
      el.scrollTop = nextScrollHeight
    } else {
      const delta = nextScrollHeight - prevScrollHeight
      if (Number.isFinite(delta) && delta !== 0) {
        el.scrollTop = prevScrollTop + delta
      }
    }

    prevScrollTopRef.current = el.scrollTop
    prevScrollHeightRef.current = el.scrollHeight
  }, [messages])

  return (
    <AgentMessageBoardTextProvider
      isStreaming={isStreaming}
      sessionId={sessionId}
      boardBlockIds={boardBlockIds}
      extraPartIdsOnQuit={extraPartIdsOnQuit}
      onRenderFinishChange={onRenderFinishChange}
    >
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((message) => (
          message.type === "approval_request" ? null : (
          <div
            key={message.id}
            className={cn(
              "flex gap-3",
              message.role === "user" && "flex-row-reverse"
            )}
          >
            {/* Avatar */}
            <AgentMessageBoardAvatar
              role={message.role}
              blockIds={
                message.role === "assistant"
                  ? getAssistantMessageBlockIds(message, {
                      latestAnalysisMessageId,
                      showFollowUpToggle,
                      stepState,
                    })
                  : undefined
              }
            />

            {/* Content */}
            <div className={cn("max-w-[80%] space-y-2", message.role === "user" && "items-end")}>
              {/* File uploaded indicator */}
              {message.type === "file_uploaded" && message.fileName && (
                <div className="flex items-center gap-2 rounded-lg bg-muted/50 border border-border px-3 py-2">
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                  <span className="text-sm text-foreground">{message.fileName}</span>
                </div>
              )}

              {/* Text bubble — hidden for calendar_invite which renders its own card */}
              {message.content && message.type !== "calendar_invite" && (
                message.role === "assistant" ? (
                  <AgentMessageBoardBlock blockId={`${message.id}-bubble`}>
                    <div
                      className={cn(
                        "rounded-lg px-4 py-2.5 text-sm bg-muted text-foreground",
                        message.content === AGENT_MESSAGES.CHAT_THINKING && "animate-pulse"
                      )}
                    >
                      <AgentMessageBoardMarkdown
                        target={message.content}
                        partId={`${message.id}-content`}
                        blockId={`${message.id}-bubble`}
                      />
                    </div>
                  </AgentMessageBoardBlock>
                ) : (
                  <div className="rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap bg-primary text-primary-foreground">
                    {message.content}
                  </div>
                )
              )}

              {/* Step progress */}
              {message.role === "assistant" &&
                message.stepProgress &&
                message.stepProgress.length > 0 && (
                <AgentMessageBoardBlock blockId={`${message.id}-steps`}>
                  <StepProgress
                    steps={message.stepProgress}
                    messageId={message.id}
                    blockId={`${message.id}-steps`}
                  />
                </AgentMessageBoardBlock>
              )}

              {/* Navigation button */}
              {message.role === "assistant" && message.navigateTo && message.navigateLabel && (
                <AgentMessageBoardBlock blockId={`${message.id}-nav`}>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    disabled={message.navigateDisabled}
                    onClick={() => onNavigate?.(message.navigateTo!, message)}
                  >
                    <AgentMessageBoardText
                      target={message.navigateLabel}
                      partId={`${message.id}-nav-label`}
                      blockId={`${message.id}-nav`}
                    />
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </AgentMessageBoardBlock>
              )}

              {/* Calendar invite prompt */}
              {message.role === "assistant" && message.type === "calendar_invite" && (
                <AgentMessageBoardBlock blockId={`${message.id}-calendar`}>
                  <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
                    <CalendarPlus className="h-4 w-4 shrink-0 text-violet-600" />
                    <span className="text-sm text-violet-800">
                      <AgentMessageBoardText
                        target={message.content}
                        partId={`${message.id}-calendar-text`}
                        blockId={`${message.id}-calendar`}
                      />
                    </span>
                  </div>
                </AgentMessageBoardBlock>
              )}


              {/* Column mapping is handled silently — stored in DB, not shown to user */}

              {/* Analysis result cards — progressive gating */}
              {message.role === "assistant" &&
                message.anomalies &&
                message.anomalies.length > 0 && (
                <AgentMessageBoardBlock blockId={`${message.id}-anomalies`}>
                  <AnomalyCard
                    anomalies={message.anomalies}
                    messageId={message.id}
                    blockId={`${message.id}-anomalies`}
                    confirmed={Boolean(message.anomaliesConfirmed)}
                    disabled={isStreaming}
                    onConfirm={
                      onConfirmAnomalies
                        ? (reviewed) => onConfirmAnomalies(message.id, reviewed)
                        : undefined
                    }
                  />
                </AgentMessageBoardBlock>
              )}

              {/* TaskListCard: primary review surface. Prefer rendering on analysis messages. */}
              {message.role === "assistant" &&
                message.recommendedTasks &&
                message.recommendedTasks.length > 0 &&
                message.type === "analysis" && (
                <AgentMessageBoardBlock blockId={`${message.id}-tasks`}>
                  <TaskListCard
                    tasks={message.recommendedTasks}
                    messageId={message.id}
                    blockId={`${message.id}-tasks`}
                    approvalRequired={approvalRequired}
                    generatedTaskIndexes={generatedTaskIndexes}
                    skippedTaskIndexes={skippedTaskIndexes}
                    createdTaskIdByIndex={createdTaskIdByIndex}
                    generating={Boolean(tasksApprovalGenerating) || Boolean(generatingTasks)}
                    generationStatus={taskGenerationStatus}
                    approvalMode={Boolean(pendingTaskApproval)}
                    selectionMode={taskSelectionMode}
                    selectedIndexes={selectedTaskIndexes}
                    onSelectedIndexesChange={onSelectedTaskIndexesChange}
                    onCreateSelected={pendingTaskApproval ? onApproveSelectedTasks : undefined}
                    createButtonDisabled={Boolean(approvalDisabled) || Boolean(tasksApprovalGenerating)}
                    onCreateAll={
                      !approvalRequired &&
                      !pendingTaskApproval &&
                      stepState?.analysisComplete &&
                      !stepState?.tasksCreated
                        ? () => onAction?.("create_tasks")
                        : undefined
                    }
                  />
                </AgentMessageBoardBlock>
              )}

              {message.role === "assistant" &&
                showFollowUpToggle &&
                message.id === latestAnalysisMessageId &&
                (!stepState || stepState.tasksCreated) && (
                <AgentMessageBoardBlock blockId={`${message.id}-followup`}>
                  <FollowUpCard
                    active={followUpActive}
                    onToggle={() => onAction?.(followUpActive ? "cancel_follow_up" : "start_follow_up")}
                    messageId={message.id}
                    blockId={`${message.id}-followup`}
                  />
                </AgentMessageBoardBlock>
              )}
            </div>
          </div>
          )
        ))}

        {showRevisitThinkingBubble && !hasThinkingMessage && (
          <div className="flex gap-3">
            <AgentMessageBoardAvatar role="assistant" forceVisible />
            <div className="max-w-[80%] space-y-2">
              <div className="rounded-lg px-4 py-2.5 text-sm bg-muted text-foreground animate-pulse">
                {AGENT_MESSAGES.CHAT_THINKING}
              </div>
            </div>
          </div>
        )}

        {/* Action cards shown at the bottom so they're immediately visible after task creation. */}
        {showBottomActionCards && (
          <div className="space-y-3">
            <AgentMessageBoardBlock blockId={`${bottomCardsMessageId}-miro-generate`}>
              <MiroGenerateCard
                onGenerate={() => onAction?.("generate_miro")}
                messageId={bottomCardsMessageId}
                blockId={`${bottomCardsMessageId}-miro-generate`}
                disabled={!Boolean(stepState?.tasksCreated) && Boolean(approvalRequired)}
                disabledHint={
                  !Boolean(stepState?.tasksCreated) && Boolean(approvalRequired)
                    ? "Approve task creation to enable Miro generation."
                    : undefined
                }
              />
            </AgentMessageBoardBlock>
            <AgentMessageBoardBlock blockId={`${bottomCardsMessageId}-distribute`}>
              <DistributeMessageCard
                onDistribute={() => onAction?.("distribute_message")}
                messageId={bottomCardsMessageId}
                blockId={`${bottomCardsMessageId}-distribute`}
              />
            </AgentMessageBoardBlock>
          </div>
        )}

        {pendingMiroApproval && (
          <AgentMessageBoardBlock blockId={`${bottomCardsMessageId}-miro-approval`}>
            <RecommendedMiroBoardCard
              pending={pendingMiroApproval}
              messageId={bottomCardsMessageId}
              blockId={`${bottomCardsMessageId}-miro-approval`}
              disabled={Boolean(approvalDisabled)}
              generating={Boolean(miroApprovalGenerating)}
              onApprove={onApproveMiroApproval}
              onReject={onRejectMiroApproval}
            />
          </AgentMessageBoardBlock>
        )}

        {stepState?.analysisComplete && (
          <AgentMessageBoardBlock blockId="reupload">
            <div className="flex justify-center pt-2 pb-1">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs text-muted-foreground"
                onClick={() => onReupload?.()}
              >
                <UploadCloud className="h-3.5 w-3.5" />
                <AgentMessageBoardText
                  target="Upload New File"
                  partId="reupload-button"
                  blockId="reupload"
                />
              </Button>
            </div>
          </AgentMessageBoardBlock>
        )}
      </div>
    </AgentMessageBoardTextProvider>
  )
}
