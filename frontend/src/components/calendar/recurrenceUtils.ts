import { format } from "date-fns";
import type { RecurrenceInput, RecurrenceRuleDTO } from "@/lib/api/calendarApi";

export type RepeatPreset = "none" | "daily" | "weekly";
export type EndCondition = "never" | "until" | "count";

export type RepeatFormState = {
  preset: RepeatPreset;
  interval: number;
  endCondition: EndCondition;
  untilDate: string;
  occurrenceCount: number;
};

export const DEFAULT_REPEAT_STATE: RepeatFormState = {
  preset: "none",
  interval: 1,
  endCondition: "never",
  untilDate: "",
  occurrenceCount: 10,
};

export function repeatStateFromRule(
  rule: RecurrenceRuleDTO | null | undefined,
): RepeatFormState {
  if (!rule) {
    return { ...DEFAULT_REPEAT_STATE };
  }

  const frequency = rule.frequency;
  const preset: RepeatPreset =
    frequency === "DAILY" ? "daily" : frequency === "WEEKLY" ? "weekly" : "none";

  let endCondition: EndCondition = "never";
  let untilDate = "";
  let occurrenceCount = DEFAULT_REPEAT_STATE.occurrenceCount;

  if (rule.count != null) {
    endCondition = "count";
    occurrenceCount = rule.count;
  } else if (rule.until) {
    endCondition = "until";
    untilDate = rule.until.slice(0, 10);
  }

  return {
    preset,
    interval: Math.max(rule.interval || 1, 1),
    endCondition,
    untilDate,
    occurrenceCount,
  };
}

export function repeatStateFromEvent(
  isRecurring: boolean,
  rule: RecurrenceRuleDTO | null | undefined,
): RepeatFormState {
  if (!isRecurring || !rule) {
    return { ...DEFAULT_REPEAT_STATE };
  }
  return repeatStateFromRule(rule);
}

export function buildRecurrencePayload(
  state: RepeatFormState,
): RecurrenceInput | null {
  if (state.preset === "none") {
    return null;
  }

  const frequency = state.preset === "daily" ? "DAILY" : "WEEKLY";
  const payload: RecurrenceInput = {
    frequency,
    interval: Math.max(state.interval, 1),
  };

  if (state.endCondition === "count") {
    payload.count = Math.max(state.occurrenceCount, 1);
  } else if (state.endCondition === "until" && state.untilDate) {
    payload.until = `${state.untilDate}T23:59:59Z`;
  }

  return payload;
}

export function repeatStatesEqual(a: RepeatFormState, b: RepeatFormState): boolean {
  return (
    a.preset === b.preset &&
    a.interval === b.interval &&
    a.endCondition === b.endCondition &&
    a.untilDate === b.untilDate &&
    a.occurrenceCount === b.occurrenceCount
  );
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function formatRepeatSummary(state: RepeatFormState, start: Date): string {
  if (state.preset === "none") {
    return "Does not repeat";
  }

  const unit = state.preset === "daily" ? "day" : "week";
  const plural = state.interval === 1 ? unit : `${unit}s`;
  let summary =
    state.interval === 1
      ? state.preset === "weekly"
        ? `Weekly on ${WEEKDAY_NAMES[start.getDay()]}`
        : "Daily"
      : `Every ${state.interval} ${plural}`;

  if (state.preset === "weekly" && state.interval > 1) {
    summary += ` on ${WEEKDAY_NAMES[start.getDay()]}`;
  }

  if (state.endCondition === "until" && state.untilDate) {
    summary += `, until ${format(new Date(`${state.untilDate}T12:00:00`), "MMM d, yyyy")}`;
  } else if (state.endCondition === "count") {
    summary += `, ${state.occurrenceCount} times`;
  }

  return summary;
}
