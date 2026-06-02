import { useCallback, useRef, useState } from "react"

const EXTRA_WIDTH = 56      // px wider than original card (added on the non-anchor side)
const DIAGRAM_HEIGHT = 130  // px for the flow diagram strip at the top of hover card

// If card.top > vh * TOP_RATIO → has space above → expand upward
const TOP_RATIO = 0.40
// If card.right > vw * RIGHT_RATIO → right column → expand leftward
const RIGHT_RATIO = 0.65

const SHOW_DELAY_MS = 160

export interface HoverCardStyle {
  top: number
  left: number
  width: number
  totalHeight: number
  transformOrigin: string
  /** Whether the hover card grows downward (diagram at top, content extends below card) */
  expandDown: boolean
}

export function useHoverCard() {
  const cardRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [style, setStyle] = useState<HoverCardStyle>({
    top: 0, left: 0, width: 0, totalHeight: 0,
    transformOrigin: "top left", expandDown: true,
  })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const calcStyle = useCallback((): HoverCardStyle => {
    if (!cardRef.current) {
      return { top: 0, left: 0, width: 0, totalHeight: 0, transformOrigin: "top left", expandDown: true }
    }
    const rect = cardRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    const hoverW = rect.width + EXTRA_WIDTH
    const hoverH = rect.height + DIAGRAM_HEIGHT

    // Horizontal: right column → expand left (anchor right edge)
    const expandLeft = rect.right > vw * RIGHT_RATIO
    // Vertical: card not near top → has space above → expand upward (anchor bottom edge)
    const expandUp = rect.top > vh * TOP_RATIO

    // --- X: hover card always covers [card.left … card.right] ---
    // Left column/middle: align hover card's left to card.left, extend right
    // Right column: align hover card's right to card.right, extend left
    const left = expandLeft
      ? rect.right - hoverW   // right edge fixed, extend leftward
      : rect.left              // left edge fixed, extend rightward

    // --- Y: hover card always covers [card.top … card.bottom] ---
    // Expand downward (near top): hover card top = card.top, extends below card.bottom
    // Expand upward (space above): hover card top = card.top - DIAGRAM_HEIGHT, extends above card.top
    const top = expandUp
      ? rect.top - DIAGRAM_HEIGHT   // diagram in new space above original card
      : rect.top                     // diagram at top, content extends below card

    // transform-origin: the corner of hover card that coincides with the
    // corresponding corner of the original card (stays fixed during scale animation)
    let transformOrigin: string
    if (!expandLeft && !expandUp) transformOrigin = "top left"      // hover top-left = card top-left
    else if (expandLeft && !expandUp) transformOrigin = "top right" // hover top-right = card top-right
    else if (!expandLeft && expandUp) transformOrigin = "bottom left" // hover bottom-left = card bottom-left
    else transformOrigin = "bottom right"                             // hover bottom-right = card bottom-right

    // Clamp to viewport
    return {
      left: Math.max(8, Math.min(left, vw - hoverW - 8)),
      top: Math.max(8, Math.min(top, vh - hoverH - 8)),
      width: hoverW,
      totalHeight: hoverH,
      transformOrigin,
      expandDown: !expandUp,
    }
  }, [])

  const onMouseEnter = useCallback(() => {
    timerRef.current = setTimeout(() => {
      setStyle(calcStyle())
      setIsVisible(true)
    }, SHOW_DELAY_MS)
  }, [calcStyle])

  const onMouseLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setIsVisible(false)
  }, [])

  return { cardRef, isVisible, style, onMouseEnter, onMouseLeave }
}
