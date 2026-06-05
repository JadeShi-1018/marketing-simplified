export const KLAVIYO_LIST_FIXTURE = {
  name: "Upgrade Your Workspace This Winter",
  subject: "Discover ergonomic desks and lighting",
  status: "draft" as const,
};

export const MAILCHIMP_LIST_FIXTURE = {
  subjectLine: "Spring promotion launch",
  previewText: "Shown in the inbox preview after the subject",
  fromName: "Marketing team",
};

export function shortRunId(): string {
  return Date.now().toString(36);
}

export function withRunSuffix(label: string, runId: string): string {
  return `${label} · ${runId}`;
}
