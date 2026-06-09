"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ScheduleMode = "interval" | "daily" | "weekly";

interface ScheduledConfigProps {
  config?: {
    cron_expression?: string;
    timezone?: string;
  };
  onChange?: (config: { cron_expression: string; timezone: string }) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const INTERVAL_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 15,  label: "15 min" },
  { value: 30,  label: "30 min" },
  { value: 60,  label: "1 hr"   },
  { value: 120, label: "2 hr"   },
  { value: 360, label: "6 hr"   },
  { value: 720, label: "12 hr"  },
];

const WEEK_DAYS = [
  { value: 1, label: "M", full: "Monday"    },
  { value: 2, label: "T", full: "Tuesday"   },
  { value: 3, label: "W", full: "Wednesday" },
  { value: 4, label: "T", full: "Thursday"  },
  { value: 5, label: "F", full: "Friday"    },
  { value: 6, label: "S", full: "Saturday"  },
  { value: 0, label: "S", full: "Sunday"    },
];

const MINUTE_OPTIONS = [0, 15, 30, 45];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Cron helpers ──────────────────────────────────────────────────────────────

function parseCron(cron = "0 9 * * 1"): {
  mode: ScheduleMode;
  intervalMinutes: number;
  hour: number;
  minute: number;
  days: number[];
} {
  const t = cron.trim();

  // Interval: */N * * * *
  const mIntMin = t.match(/^\*\/(\d+) \* \* \* \*$/);
  if (mIntMin) return { mode: "interval", intervalMinutes: +mIntMin[1], hour: 9, minute: 0, days: [1] };

  // Interval: 0 * * * * (every hour)
  if (t === "0 * * * *") return { mode: "interval", intervalMinutes: 60, hour: 9, minute: 0, days: [1] };

  // Interval: 0 */N * * * (every N hours)
  const mIntHr = t.match(/^0 \*\/(\d+) \* \* \*$/);
  if (mIntHr) return { mode: "interval", intervalMinutes: +mIntHr[1] * 60, hour: 9, minute: 0, days: [1] };

  // Weekly: M H * * DAYS (days = digits/commas/range)
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
    return { mode: "weekly", intervalMinutes: 60, hour: +mWeekly[2], minute: +mWeekly[1], days };
  }

  // Daily: M H * * *
  const mDaily = t.match(/^(\d+) (\d+) \* \* \*$/);
  if (mDaily) return { mode: "daily", intervalMinutes: 60, hour: +mDaily[2], minute: +mDaily[1], days: [1] };

  // Default
  return { mode: "daily", intervalMinutes: 60, hour: 9, minute: 0, days: [1] };
}

function buildCron(
  mode: ScheduleMode,
  intervalMinutes: number,
  hour: number,
  minute: number,
  days: number[],
): string {
  if (mode === "interval") {
    if (intervalMinutes < 60) return `*/${intervalMinutes} * * * *`;
    if (intervalMinutes === 60) return `0 * * * *`;
    return `0 */${intervalMinutes / 60} * * *`;
  }
  if (mode === "daily") return `${minute} ${hour} * * *`;
  const sorted = [...days].sort((a, b) => a - b);
  if (!sorted.length) return `${minute} ${hour} * * *`; // fallback when no day selected
  return `${minute} ${hour} * * ${sorted.join(",")}`;
}

function buildSummary(
  mode: ScheduleMode,
  intervalMinutes: number,
  hour: number,
  minute: number,
  days: number[],
): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(hour)}:${pad(minute)}`;

  if (mode === "interval") {
    if (intervalMinutes < 60) return `Runs every ${intervalMinutes} minutes`;
    const hrs = intervalMinutes / 60;
    return hrs === 1 ? "Runs every hour" : `Runs every ${hrs} hours`;
  }
  if (mode === "daily") return `Runs every day at ${time}`;
  if (!days.length) return "Select at least one day";
  const names = [...days].sort((a, b) => a - b).map((d) => DAY_NAMES[d]);
  return `Runs every ${names.join(", ")} at ${time}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Spinner({
  value,
  onUp,
  onDown,
}: {
  value: string;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-gray-200 overflow-hidden select-none">
      <button
        type="button"
        onClick={onUp}
        className="px-4 py-1 hover:bg-gray-50 text-gray-400 hover:text-gray-600 transition-colors"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <div className="px-5 py-1.5 text-xl font-mono font-semibold text-gray-800 border-y border-gray-100 min-w-[3rem] text-center">
        {value}
      </div>
      <button
        type="button"
        onClick={onDown}
        className="px-4 py-1 hover:bg-gray-50 text-gray-400 hover:text-gray-600 transition-colors"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function TimePicker({
  hour,
  minute,
  onHourChange,
  onMinuteChange,
}: {
  hour: number;
  minute: number;
  onHourChange: (h: number) => void;
  onMinuteChange: (m: number) => void;
}) {
  const pad = (n: number) => String(n).padStart(2, "0");

  const incHour  = () => onHourChange((hour + 1) % 24);
  const decHour  = () => onHourChange((hour + 23) % 24);
  const incMin   = () => {
    const idx = MINUTE_OPTIONS.indexOf(minute);
    onMinuteChange(MINUTE_OPTIONS[(idx + 1) % MINUTE_OPTIONS.length]);
  };
  const decMin   = () => {
    const idx = MINUTE_OPTIONS.indexOf(minute);
    onMinuteChange(MINUTE_OPTIONS[(idx + MINUTE_OPTIONS.length - 1) % MINUTE_OPTIONS.length]);
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">At</label>
      <div className="flex items-center gap-2">
        <Spinner value={pad(hour)} onUp={incHour} onDown={decHour} />
        <span className="text-2xl font-semibold text-gray-400 pb-0.5">:</span>
        <Spinner value={pad(minute)} onUp={incMin} onDown={decMin} />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ScheduledConfig({ config, onChange }: ScheduledConfigProps) {
  const timezone = config?.timezone ?? "UTC";
  const initial  = parseCron(config?.cron_expression);

  const [mode,            setMode           ] = useState<ScheduleMode>(initial.mode);
  const [intervalMinutes, setIntervalMinutes] = useState(initial.intervalMinutes);
  const [hour,            setHour           ] = useState(initial.hour);
  const [minute,          setMinute         ] = useState(initial.minute);
  const [days,            setDays           ] = useState<number[]>(initial.days);

  const emit = (
    m  = mode,
    iv = intervalMinutes,
    h  = hour,
    mn = minute,
    d  = days,
  ) => {
    onChange?.({ cron_expression: buildCron(m, iv, h, mn, d), timezone });
  };

  const handleMode     = (m: ScheduleMode) => { setMode(m);            emit(m); };
  const handleInterval = (v: number)       => { setIntervalMinutes(v); emit(mode, v); };
  const handleHour     = (v: number)       => { setHour(v);            emit(mode, intervalMinutes, v); };
  const handleMinute   = (v: number)       => { setMinute(v);          emit(mode, intervalMinutes, hour, v); };
  const toggleDay      = (d: number)       => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
    setDays(next);
    emit(mode, intervalMinutes, hour, minute, next);
  };

  const summary = buildSummary(mode, intervalMinutes, hour, minute, days);
  const warnNoDay = mode === "weekly" && days.length === 0;

  return (
    <div className="space-y-5">
      {/* Schedule Type tabs */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Schedule Type
        </label>
        <div className="flex gap-2">
          {(["interval", "daily", "weekly"] as ScheduleMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => handleMode(m)}
              className={cn(
                "flex-1 rounded-lg border py-2 text-sm font-medium capitalize transition-colors",
                mode === m
                  ? "border-[#3CCED7] bg-[#3CCED7]/10 text-[#2ba8af]"
                  : "border-gray-200 text-gray-600 hover:border-gray-300",
              )}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Interval mode */}
      {mode === "interval" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Every</label>
          <div className="flex flex-wrap gap-2">
            {INTERVAL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleInterval(opt.value)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                  intervalMinutes === opt.value
                    ? "border-[#3CCED7] bg-[#3CCED7]/10 text-[#2ba8af]"
                    : "border-gray-200 text-gray-600 hover:border-gray-300",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Daily mode */}
      {mode === "daily" && (
        <TimePicker
          hour={hour}
          minute={minute}
          onHourChange={handleHour}
          onMinuteChange={handleMinute}
        />
      )}

      {/* Weekly mode */}
      {mode === "weekly" && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">On</label>
            <div className="flex gap-1.5">
              {WEEK_DAYS.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  title={day.full}
                  onClick={() => toggleDay(day.value)}
                  className={cn(
                    "h-9 w-9 rounded-full text-xs font-semibold transition-colors",
                    days.includes(day.value)
                      ? "bg-[#3CCED7] text-white shadow-sm"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200",
                  )}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>
          <TimePicker
            hour={hour}
            minute={minute}
            onHourChange={handleHour}
            onMinuteChange={handleMinute}
          />
        </>
      )}

      {/* Summary */}
      <div
        className={cn(
          "rounded-lg px-3 py-2 text-sm font-medium",
          warnNoDay
            ? "bg-amber-50 border border-amber-200 text-amber-700"
            : "bg-[#3CCED7]/5 border border-[#3CCED7]/20 text-[#2ba8af]",
        )}
      >
        {warnNoDay ? "⚠ Select at least one day" : `✦ ${summary}`}
      </div>

      {/* Timezone */}
      <div className="flex items-center justify-between text-xs text-gray-500 border-t border-gray-100 pt-3">
        <span>Timezone</span>
        <span className="font-medium text-gray-700">{timezone}</span>
      </div>
    </div>
  );
}
