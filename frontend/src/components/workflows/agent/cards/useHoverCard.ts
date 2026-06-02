import { useCallback, useRef, useState } from "react"

const EXTRA_WIDTH = 56
const DIAGRAM_HEIGHT = 130
const SHOW_DELAY_MS = 160
const HIDE_DELAY_MS = 100   // allow mouse to travel from card to hover card

const TOP_RATIO = 0.40
const RIGHT_RATIO = 0.65

export interface HoverCardStyle {
  top: number
  left: number
  width: number
  totalHeight: number
  transformOrigin: string
  expandDown: boolean
}

export function useHoverCard() {
  const cardRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [style, setStyle] = useState<HoverCardStyle>({
    top: 0, left: 0, width: 0, totalHeight: 0,
    transformOrigin: "top left", expandDown: true,
  })
  // Shared timer for both show-delay and hide-delay
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const calcStyle = useCallback((): HoverCardStyle => {
    if (!cardRef.current) {
      return { top: 0, left: 0, width: 0, totalHeight: 0, transformOrigin: "top left", expandDown: true }
    }
    const rect = cardRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    const hoverW = rect.width + EXTRA_WIDTH
    const hoverH = rect.height + DIAGRAM_HEIGHT

    const expandLeft = rect.right > vw * RIGHT_RATIO
    const expandUp = rect.top > vh * TOP_RATIO

    const left = expandLeft ? rect.right - hoverW : rect.left
    const top = expandUp
      ? rect.top - DIAGRAM_HEIGHT
      : rect.top

    let transformOrigin: string
    if (!expandLeft && !expandUp) transformOrigin = "top left"
    else if (expandLeft && !expandUp) transformOrigin = "top right"
    else if (!expandLeft && expandUp) transformOrigin = "bottom left"
    else transformOrigin = "bottom right"

    return {
      left: Math.max(8, Math.min(left, vw - hoverW - 8)),
      top: Math.max(8, Math.min(top, vh - hoverH - 8)),
      width: hoverW,
      totalHeight: hoverH,
      transformOrigin,
      expandDown: !expandUp,
    }
  }, [])

  // ── Original card handlers ──────────────────────────────────────────────────
  const onMouseEnter = useCallback(() => {
    clearTimer()
    timerRef.current = setTimeout(() => {
      setStyle(calcStyle())
      setIsVisible(true)
    }, SHOW_DELAY_MS)
  }, [calcStyle])

  const onMouseLeave = useCallback(() => {
    clearTimer()
    timerRef.current = setTimeout(() => {
      setIsVisible(false)
    }, HIDE_DELAY_MS)
  }, [])

  // ── Hover card handlers (cancel hide when mouse enters the portal) ──────────
  const hoverCardHandlers = {
    onMouseEnter: () => clearTimer(),
    onMouseLeave: () => {
      clearTimer()
      timerRef.current = setTimeout(() => {
        setIsVisible(false)
      }, HIDE_DELAY_MS)
    },
  }

  const hide = useCallback(() => {
    clearTimer()
    setIsVisible(false)
  }, [])

  return { cardRef, isVisible, style, onMouseEnter, onMouseLeave, hoverCardHandlers, hide }
}
