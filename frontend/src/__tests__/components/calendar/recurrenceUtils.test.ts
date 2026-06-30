import {
  buildRecurrencePayload,
  formatRepeatSummary,
  repeatStateFromRule,
  repeatStatesEqual,
} from "@/components/calendar/recurrenceUtils";

describe("recurrenceUtils", () => {
  it("builds a weekly recurrence payload with interval and count", () => {
    const payload = buildRecurrencePayload({
      preset: "weekly",
      interval: 2,
      endCondition: "count",
      untilDate: "",
      occurrenceCount: 5,
    });

    expect(payload).toEqual({
      frequency: "WEEKLY",
      interval: 2,
      count: 5,
    });
  });

  it("returns null when repeat is disabled", () => {
    expect(
      buildRecurrencePayload({
        preset: "none",
        interval: 1,
        endCondition: "never",
        untilDate: "",
        occurrenceCount: 10,
      }),
    ).toBeNull();
  });

  it("hydrates repeat state from an existing rule", () => {
    const state = repeatStateFromRule({
      frequency: "WEEKLY",
      interval: 1,
      until: "2026-12-31T00:00:00Z",
    });

    expect(state.preset).toBe("weekly");
    expect(state.endCondition).toBe("until");
    expect(state.untilDate).toBe("2026-12-31");
  });

  it("detects repeat state changes", () => {
    const a = repeatStateFromRule({
      frequency: "WEEKLY",
      interval: 1,
    });
    const b = { ...a, interval: 2 };

    expect(repeatStatesEqual(a, b)).toBe(false);
  });

  it("formats a weekly summary using the start date weekday", () => {
    const summary = formatRepeatSummary(
      {
        preset: "weekly",
        interval: 1,
        endCondition: "never",
        untilDate: "",
        occurrenceCount: 10,
      },
      new Date("2026-06-30T09:00:00"),
    );

    expect(summary).toBe("Weekly on Tuesday");
  });
});
