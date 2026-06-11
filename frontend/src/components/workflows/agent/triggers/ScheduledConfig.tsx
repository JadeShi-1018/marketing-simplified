"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ScheduleMode = "interval" | "daily" | "weekly";

interface TimeSlot {
  id: string;
  type: ScheduleMode;

  // For interval
  intervalHours?: number;
  intervalMinutes?: number;

  // For daily & weekly
  hour?: number;
  minute?: number;

  // For weekly only
  days?: number[];
}

interface ScheduledConfigProps {
  config?: {
    cron_expression?: string;
    timezone?: string;
  };
  disabled?: boolean;
  onChange?: (config: { cron_expression: string; timezone: string }) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────


const WEEK_DAYS = [
  { value: 1, label: "M", full: "Monday"    },
  { value: 2, label: "T", full: "Tuesday"   },
  { value: 3, label: "W", full: "Wednesday" },
  { value: 4, label: "T", full: "Thursday"  },
  { value: 5, label: "F", full: "Friday"    },
  { value: 6, label: "S", full: "Saturday"  },
  { value: 0, label: "S", full: "Sunday"    },
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Cron helpers ──────────────────────────────────────────────────────────────

function parseCron(cron = "0 9 * * 1"): TimeSlot[] {
  const t = cron.trim();

  // Interval: */N * * * * (every N minutes)
  const mIntMin = t.match(/^\*\/(\d+) \* \* \* \*$/);
  if (mIntMin) {
    const totalMinutes = +mIntMin[1];
    return [{
      id: `slot-${Date.now()}`,
      type: "interval",
      intervalHours: Math.floor(totalMinutes / 60),
      intervalMinutes: totalMinutes % 60,
    }];
  }

  // Interval: 0 * * * * (every hour)
  if (t === "0 * * * *") {
    return [{
      id: `slot-${Date.now()}`,
      type: "interval",
      intervalHours: 1,
      intervalMinutes: 0,
    }];
  }

  // Interval: 0 */N * * * (every N hours)
  const mIntHr = t.match(/^0 \*\/(\d+) \* \* \*$/);
  if (mIntHr) {
    return [{
      id: `slot-${Date.now()}`,
      type: "interval",
      intervalHours: +mIntHr[1],
      intervalMinutes: 0,
    }];
  }

  // Weekly: M H * * DAYS
  const mWeekly = t.match(/^(\d+) (\d+) \* \* ([\d,\-]+)$/);
  if (mWeekly) {
    const raw = mWeekly[3];
    let days: number[];
    if (raw.includes("-")) {
      const [s, e] = raw.split("-").map(Number);
      days = Array.from({ length: e - s + 1 }, (_, i) => s + i);
    } else {
      days = raw.split(",").map(Number);
    }
    return [{
      id: `slot-${Date.now()}`,
      type: "weekly",
      days,
      hour: +mWeekly[2],
      minute: +mWeekly[1],
    }];
  }

  // Daily: M H * * *
  const mDaily = t.match(/^(\d+) (\d+) \* \* \*$/);
  if (mDaily) {
    return [{
      id: `slot-${Date.now()}`,
      type: "daily",
      hour: +mDaily[2],
      minute: +mDaily[1],
    }];
  }

  return [];
}

function buildCron(timeSlots: TimeSlot[]): string {
  if (timeSlots.length === 0) return "0 9 * * 1"; // fallback

  const firstSlot = timeSlots[0];

  if (firstSlot.type === "interval") {
    const totalMinutes = (firstSlot.intervalHours || 0) * 60 + (firstSlot.intervalMinutes || 0);
    if (totalMinutes === 0) return "0 * * * *"; // fallback
    if (totalMinutes < 60) return `*/${totalMinutes} * * * *`;
    if (totalMinutes === 60) return `0 * * * *`;
    if (totalMinutes % 60 === 0) return `0 */${totalMinutes / 60} * * *`;
    return `*/${totalMinutes} * * * *`;
  }

  if (firstSlot.type === "daily") {
    const h = firstSlot.hour ?? 9;
    const m = firstSlot.minute ?? 0;
    return `${m} ${h} * * *`;
  }

  // Weekly: merge all slots with same time
  const weeklySlots = timeSlots.filter((s) => s.type === "weekly");
  if (weeklySlots.length === 0) return "0 9 * * 1"; // fallback

  const allSameTime = weeklySlots.every(
    (s) => s.hour === firstSlot.hour && s.minute === firstSlot.minute
  );

  if (allSameTime) {
    const allDays = Array.from(
      new Set(weeklySlots.flatMap((s) => s.days || []))
    ).sort((a, b) => a - b);
    return `${firstSlot.minute} ${firstSlot.hour} * * ${allDays.join(",")}`;
  }

  // Different times - use first slot only
  const sorted = [...(firstSlot.days || [])].sort((a, b) => a - b);
  return `${firstSlot.minute} ${firstSlot.hour} * * ${sorted.join(",")}`;
}

function buildSummary(timeSlots: TimeSlot[]): string {
  if (timeSlots.length === 0) return "Add at least one time slot to enable scheduled triggers.";

  const pad = (n: number) => String(n).padStart(2, "0");
  const firstSlot = timeSlots[0];

  if (firstSlot.type === "interval") {
    const hrs = firstSlot.intervalHours || 0;
    const mins = firstSlot.intervalMinutes || 0;
    if (hrs === 0 && mins === 0) return "Set interval duration";
    const parts = [];
    if (hrs > 0) parts.push(`${hrs} hour${hrs > 1 ? "s" : ""}`);
    if (mins > 0) parts.push(`${mins} minute${mins > 1 ? "s" : ""}`);
    return `Runs every ${parts.join(" ")}`;
  }

  if (firstSlot.type === "daily") {
    const time = `${pad(firstSlot.hour ?? 9)}:${pad(firstSlot.minute ?? 0)}`;
    return `Runs every day at ${time}`;
  }

  // Weekly
  if (timeSlots.length === 1) {
    const time = `${pad(firstSlot.hour ?? 9)}:${pad(firstSlot.minute ?? 0)}`;
    const names = [...(firstSlot.days || [])].sort((a, b) => a - b).map((d) => DAY_NAMES[d]);
    return `Runs every ${names.join(", ")} at ${time}`;
  }
  return `${timeSlots.length} weekly slots configured`;
}

// ── Main component ────────────────────────────────────────────────────────────

export function ScheduledConfig({ config, disabled = false, onChange }: ScheduledConfigProps) {
  const timezone = config?.timezone ?? "UTC";
  const initial  = parseCron(config?.cron_expression);

  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>(initial);

  // Popover state
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverTab, setPopoverTab] = useState<ScheduleMode>("daily");

  // Interval tab state
  const [intervalHours, setIntervalHours] = useState(0);
  const [intervalMinutes, setIntervalMinutes] = useState(30);

  // Daily tab state
  const [dailyTime, setDailyTime] = useState("09:00");

  // Weekly tab state
  const [weeklyDays, setWeeklyDays] = useState<number[]>([]);
  const [weeklyTime, setWeeklyTime] = useState("09:00");

  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popoverOpen) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popoverOpen]);

  const emit = (slots: TimeSlot[]) => {
    onChange?.({ cron_expression: buildCron(slots), timezone });
  };

  // Get current locked type (null if no slots)
  const lockedType = timeSlots.length > 0 ? timeSlots[0].type : null;

  // Time slot handlers
  const handleAddSlot = () => {
    if (disabled) return;

    let newSlot: TimeSlot;

    if (popoverTab === "interval") {
      if (intervalHours === 0 && intervalMinutes === 0) return;
      newSlot = {
        id: `slot-${Date.now()}`,
        type: "interval",
        intervalHours,
        intervalMinutes,
      };
      // Interval: replace existing slot
      const newSlots = [newSlot];
      setTimeSlots(newSlots);
      setPopoverOpen(false);
      emit(newSlots);
    } else if (popoverTab === "daily") {
      const [h, m] = dailyTime.split(":").map(Number);
      newSlot = {
        id: `slot-${Date.now()}`,
        type: "daily",
        hour: h,
        minute: m,
      };
      // Daily: only one slot allowed
      const newSlots = [newSlot];
      setTimeSlots(newSlots);
      setPopoverOpen(false);
      setDailyTime("09:00");
      emit(newSlots);
    } else if (popoverTab === "weekly") {
      if (weeklyDays.length === 0) return;
      const [h, m] = weeklyTime.split(":").map(Number);
      newSlot = {
        id: `slot-${Date.now()}`,
        type: "weekly",
        days: weeklyDays,
        hour: h,
        minute: m,
      };
      // Weekly: allow multiple slots
      const newSlots = [...timeSlots, newSlot];
      setTimeSlots(newSlots);
      setPopoverOpen(false);
      setWeeklyDays([]);
      setWeeklyTime("09:00");
      emit(newSlots);
    }
  };

  const handleRemoveSlot = (id: string) => {
    if (disabled) return;

    const newSlots = timeSlots.filter((s) => s.id !== id);
    setTimeSlots(newSlots);
    emit(newSlots);
  };

  const toggleWeeklyDay = (day: number) => {
    setWeeklyDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const summary = buildSummary(timeSlots);
  const warnNoSlots = timeSlots.length === 0;

  // Format chip label based on slot type
  const formatSlotLabel = (slot: TimeSlot): string => {
    const pad = (n: number) => String(n).padStart(2, "0");

    if (slot.type === "interval") {
      const hrs = slot.intervalHours || 0;
      const mins = slot.intervalMinutes || 0;
      const parts = [];
      if (hrs > 0) parts.push(`${hrs}h`);
      if (mins > 0) parts.push(`${mins}m`);
      return `Every ${parts.join(" ")}`;
    }

    if (slot.type === "daily") {
      const time = `${pad(slot.hour ?? 9)}:${pad(slot.minute ?? 0)}`;
      return `Every day at ${time}`;
    }

    // Weekly
    const time = `${pad(slot.hour ?? 9)}:${pad(slot.minute ?? 0)}`;
    const dayNames = (slot.days || [])
      .sort((a, b) => a - b)
      .map((d) => DAY_NAMES[d].slice(0, 3))
      .join(", ");
    return `${dayNames} at ${time}`;
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">At</label>

        {/* Time slot chips (unified for all types) */}
        {timeSlots.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {timeSlots.map((slot) => (
              <div
                key={slot.id}
                className="inline-flex items-center gap-2 rounded-full border border-[#3CCED7]/30 bg-[#3CCED7]/10 px-3 py-1.5 text-sm font-medium text-[#2ba8af]"
              >
                <span>{formatSlotLabel(slot)}</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => handleRemoveSlot(slot.id)}
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full text-[#2ba8af] transition-colors hover:bg-[#3CCED7]/20 hover:text-red-600",
                    disabled && "cursor-not-allowed opacity-50"
                  )}
                  aria-label="Remove"
                >
                  <span className="text-xs">✕</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add time slot button + popover */}
        <div className="relative" ref={popoverRef}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setPopoverOpen(!popoverOpen)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border-2 border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-[#3CCED7] hover:text-[#2ba8af]",
              disabled && "cursor-not-allowed opacity-50"
            )}
          >
            <span className="text-base">+</span> Add time slot
          </button>

          {/* Popover with 3 tabs */}
          {popoverOpen && !disabled && (
            <div className="absolute left-0 top-full z-20 mt-2 w-96 rounded-xl border border-gray-200 bg-white shadow-xl">
              {/* Tab headers */}
              <div className="flex border-b border-gray-100">
                {(["interval", "daily", "weekly"] as ScheduleMode[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setPopoverTab(tab)}
                    disabled={lockedType !== null && lockedType !== tab}
                    className={cn(
                      "flex-1 py-2.5 text-xs font-semibold capitalize transition-colors",
                      popoverTab === tab
                        ? "border-b-2 text-[#2ba8af]"
                        : "text-gray-500 hover:text-gray-700",
                      lockedType !== null && lockedType !== tab && "cursor-not-allowed opacity-40"
                    )}
                    style={popoverTab === tab ? {
                      borderImage: 'linear-gradient(90deg, #3CCED7, #A6E661) 1'
                    } : undefined}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="p-4">
                {/* Interval tab */}
                {popoverTab === "interval" && (
                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-xs font-medium text-gray-700">
                        Runs every
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          value={intervalHours}
                          onChange={(e) => setIntervalHours(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-16 rounded-lg border border-gray-200 px-3 py-2 text-center text-sm text-gray-900 focus:border-[#3CCED7] focus:outline-none focus:ring-2 focus:ring-[#3CCED7]/20"
                        />
                        <span className="text-sm text-gray-600">hours</span>
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={intervalMinutes}
                          onChange={(e) => setIntervalMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                          className="w-16 rounded-lg border border-gray-200 px-3 py-2 text-center text-sm text-gray-900 focus:border-[#3CCED7] focus:outline-none focus:ring-2 focus:ring-[#3CCED7]/20"
                        />
                        <span className="text-sm text-gray-600">minutes</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Daily tab */}
                {popoverTab === "daily" && (
                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-xs font-medium text-gray-700">Time</label>
                      <input
                        type="time"
                        value={dailyTime}
                        onChange={(e) => setDailyTime(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-[#3CCED7] focus:outline-none focus:ring-2 focus:ring-[#3CCED7]/20"
                      />
                    </div>
                  </div>
                )}

                {/* Weekly tab */}
                {popoverTab === "weekly" && (
                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-xs font-medium text-gray-700">Days</label>
                      <div className="flex flex-wrap gap-1.5">
                        {WEEK_DAYS.map((day) => (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => toggleWeeklyDay(day.value)}
                            className={cn(
                              "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                              weeklyDays.includes(day.value)
                                ? "bg-[#3CCED7] text-white shadow-sm"
                                : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                            )}
                          >
                            {day.full}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-medium text-gray-700">Time</label>
                      <input
                        type="time"
                        value={weeklyTime}
                        onChange={(e) => setWeeklyTime(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-[#3CCED7] focus:outline-none focus:ring-2 focus:ring-[#3CCED7]/20"
                      />
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={handleAddSlot}
                    disabled={
                      (popoverTab === "interval" && intervalHours === 0 && intervalMinutes === 0) ||
                      (popoverTab === "weekly" && weeklyDays.length === 0)
                    }
                    className={cn(
                      "flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity",
                      (popoverTab === "interval" && intervalHours === 0 && intervalMinutes === 0) ||
                      (popoverTab === "weekly" && weeklyDays.length === 0)
                        ? "cursor-not-allowed bg-gray-300"
                        : "bg-gradient-to-r from-[#3CCED7] to-[#A6E661] hover:opacity-95"
                    )}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setPopoverOpen(false)}
                    className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      <div
        className={cn(
          "rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2",
          warnNoSlots
            ? "bg-amber-50 border border-amber-200 text-amber-700"
            : "bg-[#3CCED7]/5 border border-[#3CCED7]/20 text-[#2ba8af]",
        )}
      >
        {warnNoSlots ? (
          "⚠ Add at least one time slot to enable scheduled triggers."
        ) : (
          <>
            <Clock className="h-3.5 w-3.5 shrink-0" />
            {summary}
          </>
        )}
      </div>

      {/* Timezone */}
      <div className="flex items-center justify-between text-xs text-gray-500 border-t border-gray-100 pt-3">
        <span>Timezone</span>
        <span className="font-medium text-gray-700">{timezone}</span>
      </div>
    </div>
  );
}
