"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Settings } from "lucide-react";
import toast from "react-hot-toast";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { notificationsApi } from "@/lib/api/notificationsApi";
import type { NotificationPreferencesData, PrefRow } from "@/types/notifications";
import { useAuthStore } from "@/lib/authStore";

type SectionId =
  | "collaboration_assets"
  | "core_business"
  | "automation_system"
  | "integrations";

const SECTIONS: {
  id: SectionId;
  title: string;
  rows: { key: string; label: string }[];
}[] = [
  {
    id: "collaboration_assets",
    title: "Collaboration & Assets",
    rows: [
      { key: "chat_in_app", label: "In-app chat (new messages)" },
      { key: "chat_new_session", label: "New conversation" },
      { key: "project_invite", label: "Project invitations" },
      { key: "calendar_reminders", label: "Calendar sharing and reminders" },
      { key: "doc_asset_updates", label: "Document and asset updates (Notion, Miro, Spreadsheet)" },
    ],
  },
  {
    id: "core_business",
    title: "Core Business",
    rows: [
      { key: "meeting_created_updated", label: "Meetings: created / updated" },
      { key: "meeting_participant_assign", label: "Meetings: assignment / participant changes" },
      { key: "meeting_starting_soon", label: "Meetings: starting soon" },
      { key: "meeting_agenda_minutes", label: "Meetings: agenda / minutes published" },
      { key: "task_assignee", label: "Tasks: assignee and ownership" },
      { key: "task_mention", label: "Tasks: @mentions in comments" },
      { key: "task_deadline", label: "Tasks: due dates and overdue" },
      { key: "task_status", label: "Tasks: status changes" },
      { key: "task_alert", label: "Tasks: alerting" },
      { key: "decision_review", label: "Decisions: review required" },
      { key: "decision_deadline", label: "Decisions: deadline reminders" },
      { key: "decision_published", label: "Decisions: outcome published" },
    ],
  },
  {
    id: "automation_system",
    title: "Automation & System",
    rows: [
      { key: "approval_budget_member", label: "Approvals (budget, member invites)" },
      { key: "workflow_nodes", label: "Automation workflows (node success / failure / manual)" },
      { key: "account_security_billing", label: "Account security and billing (access, Stripe)" },
    ],
  },
  {
    id: "integrations",
    title: "Integrations",
    rows: [{ key: "slack_webhook", label: "Slack webhook notifications" }],
  },
];

function defaultRow(): PrefRow {
  return { web: true, email: true };
}

function getRow(prefs: NotificationPreferencesData | null, section: SectionId, key: string): PrefRow {
  if (!prefs) return defaultRow();
  const sec = prefs[section] as Record<string, PrefRow> | undefined;
  const row = sec?.[key];
  if (!row || typeof row.web !== "boolean" || typeof row.email !== "boolean") {
    return defaultRow();
  }
  return row;
}

function Toggle({
  on,
  onToggle,
  disabled,
}: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3CCED7]/40 focus-visible:ring-offset-2 disabled:opacity-50 ${
        on
          ? "bg-gradient-to-r from-[#3CCED7] to-[#A6E661]"
          : "bg-gray-200"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
          on ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function logPreferencesLoadError(err: unknown, context: string) {
  if (axios.isAxiosError(err)) {
    console.error(
      `[notification-preferences] ${context}`,
      "status:",
      err.response?.status,
      "data:",
      err.response?.data,
      "url:",
      err.config?.url,
      "message:",
      err.message
    );
  } else {
    console.error(`[notification-preferences] ${context}`, err);
  }
}

const PREFERENCE_LOAD_MAX_ATTEMPTS = 3;
const PREFERENCE_LOAD_RETRY_BASE_MS = 400;

function PreferencesContent() {
  const initialized = useAuthStore((s) => s.initialized);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [prefs, setPrefs] = useState<NotificationPreferencesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let lastErr: unknown;
    for (let attempt = 0; attempt < PREFERENCE_LOAD_MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        const delay = PREFERENCE_LOAD_RETRY_BASE_MS * attempt;
        console.warn(
          `[notification-preferences] retrying GET in ${delay}ms (attempt ${attempt + 1}/${PREFERENCE_LOAD_MAX_ATTEMPTS})`
        );
        await new Promise((r) => setTimeout(r, delay));
      }
      try {
        const res = await notificationsApi.getPreferences();
        setPrefs(res.data.preferences as NotificationPreferencesData);
        setError(null);
        setLoading(false);
        return;
      } catch (err) {
        lastErr = err;
        logPreferencesLoadError(err, `GET failed (attempt ${attempt + 1}/${PREFERENCE_LOAD_MAX_ATTEMPTS})`);
      }
    }
    logPreferencesLoadError(lastErr, "GET exhausted retries");
    setPrefs(null);
    setError(
      "Unable to load notification preferences. Please check your connection and try again."
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!hasHydrated || !initialized) return;
    if (!isAuthenticated) return;
    load();
  }, [hasHydrated, initialized, isAuthenticated, load]);

  const patchChannel = async (
    section: SectionId,
    rowKey: string,
    channel: "web" | "email",
    value: boolean
  ) => {
    if (!prefs || saving) return;
    setSaving(true);
    try {
      const res = await notificationsApi.patchPreferences({
        [section]: {
          [rowKey]: { [channel]: value },
        },
      } as Record<string, unknown>);
      setPrefs(res.data.preferences as NotificationPreferencesData);
      toast.success("Preferences saved");
    } catch (err) {
      logPreferencesLoadError(err, "PATCH channel failed");
      toast.error("Could not save preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const setDisableAll = async (v: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await notificationsApi.patchPreferences({ disable_all: v });
      setPrefs(res.data.preferences as NotificationPreferencesData);
      toast.success(v ? "All notifications disabled" : "Notifications enabled again");
    } catch (err) {
      logPreferencesLoadError(err, "PATCH disable_all failed");
      toast.error("Could not save preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const showSpinner = !hasHydrated || !initialized || !isAuthenticated || loading;

  return (
    <DashboardLayout hideRightPanel>
      <div className="w-full px-6 lg:px-10 py-8">
        <h1 className="text-2xl font-bold text-gray-900">Notification preferences</h1>
        <p className="text-sm text-gray-500 mt-1">
          Control in-app (Web) and email alerts. External channels such as Slack use your existing
          integration settings.
        </p>

        {showSpinner ? (
          <div className="mt-12 flex flex-col items-center justify-center gap-3 text-gray-500">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#3CCED7] border-t-transparent" />
            <p className="text-sm">Loading preferences…</p>
          </div>
        ) : error ? (
          <div className="mt-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}{" "}
            <button
              type="button"
              className="text-red-900 underline font-medium"
              onClick={() => load()}
            >
              Retry
            </button>
          </div>
        ) : prefs ? (
          <>
            <label className="mt-8 flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.disable_all}
                onChange={(e) => setDisableAll(e.target.checked)}
                className="rounded border-gray-300"
                disabled={saving}
              />
              <span className="font-medium text-gray-900">Disable notifications</span>
            </label>

            <div className="mt-8 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-800">
                      Notification type
                    </th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700 w-28">Web</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700 w-36">
                      <span className="inline-flex items-center justify-center gap-1">
                        Email
                        <Settings className="h-3.5 w-3.5 text-gray-400" aria-hidden />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {SECTIONS.map((sec) => (
                    <React.Fragment key={sec.id}>
                      <tr className="bg-gray-100/80">
                        <td colSpan={3} className="py-2.5 px-4">
                          <div className="font-semibold text-gray-900">{sec.title}</div>
                        </td>
                      </tr>
                      {sec.rows.map((row) => {
                        const rowPrefs = getRow(prefs, sec.id, row.key);
                        return (
                          <tr key={`${sec.id}-${row.key}`} className="border-t border-gray-100">
                            <td className="py-3 px-4 text-gray-800 align-middle">{row.label}</td>
                            <td className="py-3 px-4 text-center align-middle">
                              <Toggle
                                on={rowPrefs.web}
                                disabled={prefs.disable_all || saving}
                                onToggle={() => patchChannel(sec.id, row.key, "web", !rowPrefs.web)}
                              />
                            </td>
                            <td className="py-3 px-4 text-center align-middle">
                              <Toggle
                                on={rowPrefs.email}
                                disabled={prefs.disable_all || saving}
                                onToggle={() =>
                                  patchChannel(sec.id, row.key, "email", !rowPrefs.email)
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}

export default function NotificationPreferencesPage() {
  return (
    <ProtectedRoute>
      <Suspense
        fallback={
          <DashboardLayout hideRightPanel>
            <div className="w-full px-6 lg:px-10 py-16 text-center text-sm text-gray-500">Loading…</div>
          </DashboardLayout>
        }
      >
        <PreferencesContent />
      </Suspense>
    </ProtectedRoute>
  );
}
