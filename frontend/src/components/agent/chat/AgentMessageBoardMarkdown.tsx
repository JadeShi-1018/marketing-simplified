"use client"

import { useId, useMemo } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"
import { useAgentMessageBoardText } from "@/hooks/useAgentMessageBoardText"
import {
  normalizeAgentMessageMarkdown,
  parseAgentMessageContentBlocks,
  splitBlocksForDisplayLength,
  type AgentMessageContentBlock,
} from "@/lib/agentMessageContentBlocks"
import { textLength } from "@/lib/streamingTextUtils"

export type AgentMessageBoardMarkdownProps = {
  target: string
  className?: string
  partId?: string
  /** When set, text types only while this block job is active. */
  blockId?: string
}

const markdownComponents: Components = {
  h1: () => null,
  h2: () => null,
  h3: () => null,
  h4: () => null,
  h5: () => null,
  h6: () => null,
  img: () => null,
  pre: () => null,
  blockquote: () => null,
  hr: () => null,
  del: () => null,
  input: () => null,
  code: ({ className, children, ...props }) => {
    const inline =
      "inline" in props && props.inline === true
        ? true
        : typeof className !== "string" || !className.includes("language-")
    if (!inline) return null
    return (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
    )
  },
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2"
    >
      {children}
    </a>
  ),
  p: ({ children }) => <p className="leading-relaxed">{children}</p>,
  ul: ({ children }) => (
    <ul className="list-disc pl-5 my-1 space-y-0.5 [&_ul]:mt-0.5 [&_ul]:pl-5 [&_ul]:list-disc">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 my-1 space-y-0.5 [&_ol]:mt-0.5 [&_ol]:pl-5 [&_ol]:list-decimal">
      {children}
    </ol>
  ),
  table: ({ children }) => <table className="w-full border-collapse my-2">{children}</table>,
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => (
    <th className="py-3 pr-4 text-left font-semibold border-b border-border align-top">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="py-3 pr-4 text-left border-b border-border/80 align-top">{children}</td>
  ),
}

function MarkdownBlock({ block }: { block: AgentMessageContentBlock }) {
  const markdown = normalizeAgentMessageMarkdown(block.markdown)
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents} skipHtml>
      {markdown}
    </ReactMarkdown>
  )
}

/**
 * Markdown-aware version of AgentMessageBoardText.
 *
 * While typing/streaming, only *complete* markdown blocks render as rich UI;
 * the remaining tail stays plain text so partial tables/lists do not flicker.
 */
export function AgentMessageBoardMarkdown({
  target,
  className,
  partId: partIdProp,
  blockId,
}: AgentMessageBoardMarkdownProps) {
  const fallbackId = useId()
  const partId = partIdProp ?? fallbackId.replace(/:/g, "")
  const { displayed, isWaiting } = useAgentMessageBoardText({ target, partId, blockId })

  const blocks = useMemo(() => parseAgentMessageContentBlocks(target), [target])
  const displayLen = textLength(displayed)
  const { completeBlocks, tail } = useMemo(
    () => splitBlocksForDisplayLength(blocks, target, displayLen),
    [blocks, target, displayLen]
  )

  const showPlaceholder = displayLen === 0 && isWaiting && textLength(target) > 0

  if (showPlaceholder) {
    return (
      <span className={cn(className)} data-agent-text-part={partId}>
        {"\u00a0"}
      </span>
    )
  }

  const hasRich = completeBlocks.length > 0
  const plainText = hasRich ? tail : displayed

  if (!hasRich && plainText.length === 0) {
    return <div className={cn(className)} data-agent-text-part={partId} />
  }

  return (
    <div className={cn("space-y-2", className)} data-agent-text-part={partId}>
      {completeBlocks.map((block, idx) => (
        <MarkdownBlock key={`${block.start}-${block.end}-${idx}`} block={block} />
      ))}
      {plainText.length > 0 ? (
        <span className="whitespace-pre-wrap">{plainText}</span>
      ) : null}
    </div>
  )
}
