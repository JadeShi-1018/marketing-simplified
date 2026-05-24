import {
  advanceTypingDisplay,
  BACKLOG_FAST_THRESHOLD,
  BACKLOG_SLOW_THRESHOLD,
  charsToRevealForElapsed,
  computeAdaptiveMsPerChar,
  DEFAULT_MS_PER_CHAR,
  FAST_MS_PER_CHAR,
  getBacklog,
  MIN_MS_PER_CHAR,
  msPerCharForBacklogDrain,
  nextRevealChunk,
  NORMAL_TYPING_CHARS_PER_MINUTE,
  SLOW_MS_PER_CHAR,
  sliceSegmentsByDisplayed,
  textLength,
} from "@/lib/streamingTextUtils"

describe("streamingTextUtils", () => {
  describe("typing speed constants", () => {
    it("uses ~200 characters per minute for normal human typing", () => {
      expect(NORMAL_TYPING_CHARS_PER_MINUTE).toBe(200)
      expect(DEFAULT_MS_PER_CHAR).toBe(300)
    })
  })

  describe("computeAdaptiveMsPerChar", () => {
    it("renders faster when the token queue has a large backlog", () => {
      expect(
        computeAdaptiveMsPerChar({
          backlog: BACKLOG_FAST_THRESHOLD,
          expectMoreContent: true,
        })
      ).toBe(FAST_MS_PER_CHAR)
    })

    it("renders proportionally faster as backlog grows", () => {
      const atThreshold = msPerCharForBacklogDrain(BACKLOG_FAST_THRESHOLD)
      const atLarge = msPerCharForBacklogDrain(400)
      const atHuge = msPerCharForBacklogDrain(2000)

      expect(atThreshold).toBe(FAST_MS_PER_CHAR)
      expect(atLarge).toBeLessThan(atThreshold)
      expect(atHuge).toBe(MIN_MS_PER_CHAR)
      expect(atHuge).toBeLessThan(atLarge)
    })

    it("renders slower with a small backlog while more content is expected", () => {
      expect(
        computeAdaptiveMsPerChar({
          backlog: BACKLOG_SLOW_THRESHOLD - 1,
          expectMoreContent: true,
        })
      ).toBe(SLOW_MS_PER_CHAR)
    })

    it("renders faster with a small backlog when no more content is expected", () => {
      expect(
        computeAdaptiveMsPerChar({
          backlog: 5,
          expectMoreContent: false,
        })
      ).toBe(FAST_MS_PER_CHAR)
    })

    it("uses proportional drain for medium backlog without expect-more", () => {
      const mid = Math.floor((BACKLOG_SLOW_THRESHOLD + BACKLOG_FAST_THRESHOLD) / 2)
      expect(computeAdaptiveMsPerChar({ backlog: mid, expectMoreContent: false })).toBe(
        msPerCharForBacklogDrain(mid)
      )
    })
  })

  describe("getBacklog", () => {
    it("returns difference in code-point length", () => {
      expect(getBacklog("hello", "hel")).toBe(2)
      expect(getBacklog("hi", "hi")).toBe(0)
    })
  })

  describe("charsToRevealForElapsed", () => {
    it("reveals one character per DEFAULT_MS_PER_CHAR", () => {
      expect(charsToRevealForElapsed(DEFAULT_MS_PER_CHAR)).toBe(1)
      expect(charsToRevealForElapsed(DEFAULT_MS_PER_CHAR * 2)).toBe(2)
    })
  })

  describe("advanceTypingDisplay", () => {
    it("reveals characters proportional to elapsed time", () => {
      const next = advanceTypingDisplay("hello", "", DEFAULT_MS_PER_CHAR)
      expect(next).toBe("h")
    })

    it("eventually reaches full target", () => {
      const target = "abc"
      let displayed = ""
      for (let i = 0; i < 20 && displayed !== target; i++) {
        displayed = advanceTypingDisplay(target, displayed, DEFAULT_MS_PER_CHAR)
      }
      expect(displayed).toBe(target)
    })
  })

  describe("nextRevealChunk", () => {
    it("reveals exact character count", () => {
      const next = nextRevealChunk("hello", "", 2)
      expect(next).toBe("he")
    })
  })

  describe("sliceSegmentsByDisplayed", () => {
    it("maps partial display to segment strings", () => {
      const segments = [
        { id: "title", text: "Hello" },
        { id: "body", text: "World" },
      ]
      const partial = sliceSegmentsByDisplayed(segments, "Hel")
      expect(partial.title).toBe("Hel")
      expect(partial.body).toBe("")
    })
  })

  describe("textLength", () => {
    it("counts code points", () => {
      expect(textLength("a😀b")).toBe(3)
    })
  })
})
