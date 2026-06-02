"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import type { HoverCardStyle } from "./useHoverCard"

interface HoverCardPortalProps {
  isVisible: boolean
  style: HoverCardStyle
  children: React.ReactNode
}

export default function HoverCardPortal({ isVisible, style, children }: HoverCardPortalProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  return createPortal(
    <div
      role="tooltip"
      style={{
        position: "fixed",
        top: style.top,
        left: style.left,
        width: style.width,
        height: style.totalHeight,
        zIndex: 9999,
        pointerEvents: "none",
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "scale(1)" : "scale(0.96)",
        transformOrigin: style.transformOrigin,
        transition: "opacity 150ms ease-out, transform 150ms ease-out",
      }}
    >
      {/* Outer wrapper matches card styling so the hover card looks like the original card grown */}
      <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        {children}
      </div>
    </div>,
    document.body
  )
}
