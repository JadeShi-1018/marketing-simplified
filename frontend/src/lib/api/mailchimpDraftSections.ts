import type { EmailDraft } from "@/hooks/useMailchimpData";

export type MailchimpSectionsMap = Record<string, string>;

type DraftLike = EmailDraft | Record<string, unknown>;

function normalizeSectionsValue(sections: unknown): MailchimpSectionsMap | null {
  if (!sections) {
    return null;
  }

  if (Array.isArray(sections)) {
    const map: MailchimpSectionsMap = {};
    sections.forEach((item, index) => {
      if (
        item &&
        typeof item === "object" &&
        "content" in item &&
        typeof (item as { content: unknown }).content === "string"
      ) {
        const entry = item as { content: string; type?: string };
        const type = entry.type || "block";
        map[`legacy-${type}-${index}`] = entry.content;
      }
    });
    return Object.keys(map).length > 0 ? map : null;
  }

  if (typeof sections === "object") {
    const map: MailchimpSectionsMap = {};
    for (const [key, value] of Object.entries(
      sections as Record<string, unknown>,
    )) {
      if (typeof value === "string" && value.trim()) {
        map[key] = value;
      }
    }
    return Object.keys(map).length > 0 ? map : null;
  }

  return null;
}

/**
 * Resolve block-id → HTML sections from a Mailchimp draft GET payload.
 * Prefers `settings.template.default_content.sections` (template-content PATCH target).
 */
export function extractMailchimpDraftSections(
  draft: DraftLike,
): MailchimpSectionsMap | null {
  const record = draft as Record<string, unknown>;
  const settings = record.settings as
    | { template?: { default_content?: { sections?: unknown } } }
    | undefined;
  const templateData = record.template_data as
    | { default_content?: { sections?: unknown } }
    | undefined;

  const candidates = [
    settings?.template?.default_content?.sections,
    templateData?.default_content?.sections,
  ];

  for (const raw of candidates) {
    const map = normalizeSectionsValue(raw);
    if (map) {
      return map;
    }
  }

  return null;
}
