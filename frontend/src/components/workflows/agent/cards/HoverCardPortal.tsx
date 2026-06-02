"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import type { HoverCardStyle } from "./useHoverCard"

interface HoverCardPortalProps {
  isVisible: boolean
  style: HoverCardStyle
  hoverCardHandlers: {
    onMouseEnter: () => void
    onMouseLeave: () => void
  }
  /** If provided, clicking the hover card (outside interactive elements) triggers this. */
  onClick?: () => void
  children: React.ReactNode
}

export default function HoverCardPortal({
  isVisible,
  style,
  hoverCardHandlers,
  onClick,
  children,
}: HoverCardPortalProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    window.scrollBy({ top: e.deltaY, left: e.deltaX, behavior: "auto" })
  }

  return createPortal(
    <div
      role="tooltip"
      onMouseEnter={hoverCardHandlers.onMouseEnter}
      onMouseLeave={hoverCardHandlers.onMouseLeave}
      onWheel={handleWheel}
      style={{
        position: "fixed",
        top: style.top,
        left: style.left,
        width: style.width,
        height: style.totalHeight,
        zIndex: 9999,
        // Interactive when visible so toggle/buttons inside are clickable
        pointerEvents: isVisible ? "auto" : "none",
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "scale(1)" : "scale(0.96)",
        transformOrigin: style.transformOrigin,
        transition: "opacity 150ms ease-out, transform 150ms ease-out",
      }}
    >
      <div
        onClick={onClick}
        className={`flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl ${onClick ? "cursor-pointer" : ""}`}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}
