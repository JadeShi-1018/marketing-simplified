/**
 * Reference template blocks (§6 blocks 1–18) for editor-flow E2E.
 * @see frontend/e2e/email_draft/note/e2e-email-draft-plan.md lines 615–637
 */

export const REFERENCE_IMAGE_URL =
  "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80";

/** Alternate HTTPS image for import / Content Studio pick flows. */
export const E2E_SECOND_IMAGE_URL =
  "https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=800&q=80";

export const REFERENCE_IMAGE_ALT = "Minimalist home office setup";

/** 1×1 PNG for Klaviyo upload E2E. */
export const E2E_MINIMAL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z5BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** Stable canvas text anchors keyed by spec block # */
export const REFERENCE_BLOCK_ANCHORS = {
  headerParagraph: "View this email in your browser",
  logo: "Logo",
  heroHeading: "Upgrade Your Workspace This Winter",
  bodyParagraph: "Discover ergonomic desks and lighting for your home office.",
  button: "Shop Now",
  freeShippingHeading: "Free shipping on orders $50+",
  testimonialHeading: "What customers say",
  testimonialParagraph:
    "The standing desk completely changed my workflow.",
  needHelpHeading: "Need help?",
  supportParagraph: "Our support team is available 24/7.",
  footerParagraph:
    "You received this email because you signed up for updates.",
} as const;

export const KLAVIYO_DEFAULT_CANVAS_ANCHORS = {
  headerParagraph: "View this email in your browser",
  heroHeading: "Heading",
  bodySnippet: "Lorem ipsum dolor sit amet",
  button: "Button",
  footerUnsubscribe: "No longer want to receive these emails?",
} as const;

export const REORDER_BLOCK_TEXT = {
  first: REFERENCE_BLOCK_ANCHORS.bodyParagraph,
  second: REFERENCE_BLOCK_ANCHORS.testimonialParagraph,
  third: REFERENCE_BLOCK_ANCHORS.supportParagraph,
} as const;

/** Seed heading for single-heading Y-edit / save / exit E2E paths. */
export const EDIT_SEED_HEADING = REFERENCE_BLOCK_ANCHORS.heroHeading;

/** Post-edit target copy from the reference template (paragraphs and headings). */
export const EDIT_TARGET_COPY = {
  inline: REFERENCE_BLOCK_ANCHORS.bodyParagraph,
  undoRedo: REFERENCE_BLOCK_ANCHORS.freeShippingHeading,
  keyboard: REFERENCE_BLOCK_ANCHORS.testimonialParagraph,
  savePersist: REFERENCE_BLOCK_ANCHORS.needHelpHeading,
  saveFeedback: REFERENCE_BLOCK_ANCHORS.supportParagraph,
  saveFail: REFERENCE_BLOCK_ANCHORS.footerParagraph,
  saveBusy: REFERENCE_BLOCK_ANCHORS.headerParagraph,
  exitDirty: REFERENCE_BLOCK_ANCHORS.testimonialHeading,
  commentAdd: REFERENCE_BLOCK_ANCHORS.testimonialParagraph,
  commentResolve: REFERENCE_BLOCK_ANCHORS.bodyParagraph,
} as const;

export type KlaviyoSeedBlock = {
  block_type: string;
  order: number;
  content: Record<string, unknown>;
};

/** Build Klaviyo PATCH blocks payload (YL-a reference template). */
export function buildReferenceKlaviyoBlocks(): KlaviyoSeedBlock[] {
  let order = 0;
  const next = (block_type: string, content: Record<string, unknown>): KlaviyoSeedBlock => ({
    block_type,
    order: order++,
    content,
  });

  return [
    next("Paragraph", {
      section: "header",
      content: REFERENCE_BLOCK_ANCHORS.headerParagraph,
      styles: { fontSize: 12, color: "#6b7280", textAlign: "center" },
    }),
    next("Logo", {
      section: "header",
      content: REFERENCE_BLOCK_ANCHORS.logo,
    }),
    next("Heading", {
      section: "body",
      content: REFERENCE_BLOCK_ANCHORS.heroHeading,
      styles: {
        fontSize: 42,
        fontWeight: "bold",
        textAlign: "center",
        color: "#7f1d1d",
      },
    }),
    next("Paragraph", {
      section: "body",
      content: REFERENCE_BLOCK_ANCHORS.bodyParagraph,
      styles: { fontSize: 18, color: "#374151", textAlign: "left" },
    }),
    next("Button", {
      section: "body",
      content: REFERENCE_BLOCK_ANCHORS.button,
      buttonLinkType: "Web",
      buttonLinkValue: "https://example.com/shop",
      buttonOpenInNewTab: true,
      buttonShape: "Square",
      buttonAlignment: "center",
      buttonTextColor: "#ffffff",
      buttonBackgroundColor: "#7f1d1d",
    }),
    next("Divider", { section: "body" }),
    next("Heading", {
      section: "body",
      content: REFERENCE_BLOCK_ANCHORS.freeShippingHeading,
      styles: { fontSize: 28, fontWeight: "bold", textAlign: "center", color: "#7f1d1d" },
    }),
    next("Image", {
      section: "body",
      imageUrl: REFERENCE_IMAGE_URL,
      imageAlt: "Minimalist home office setup",
    }),
    next("Heading", {
      section: "body",
      content: REFERENCE_BLOCK_ANCHORS.testimonialHeading,
      styles: { fontSize: 32, fontWeight: "bold", textAlign: "center", color: "#7f1d1d" },
    }),
    next("Paragraph", {
      section: "body",
      content: REFERENCE_BLOCK_ANCHORS.testimonialParagraph,
      styles: { fontSize: 18, color: "#374151", fontStyle: "italic" },
    }),
    next("Heading", {
      section: "body",
      content: REFERENCE_BLOCK_ANCHORS.needHelpHeading,
      styles: { fontSize: 26, fontWeight: "bold", textAlign: "center", color: "#7f1d1d" },
    }),
    next("Paragraph", {
      section: "body",
      content: REFERENCE_BLOCK_ANCHORS.supportParagraph,
      styles: { fontSize: 17, color: "#374151" },
    }),
    next("Divider", { section: "body" }),
    next("Social", {
      section: "footer",
      socialLinks: [
        { id: "x", platform: "X", url: "", label: "X" },
        { id: "facebook", platform: "Facebook", url: "", label: "Facebook" },
      ],
      socialAlignment: "center",
    }),
    next("Paragraph", {
      section: "footer",
      content: REFERENCE_BLOCK_ANCHORS.footerParagraph,
      styles: { fontSize: 14, color: "#9ca3af", textAlign: "center" },
    }),
  ];
}

/** Three body paragraphs in explicit order for Y-edit-c reorder assertions. */
export function buildReorderKlaviyoBlocks(): KlaviyoSeedBlock[] {
  return [
    {
      block_type: "Paragraph",
      order: 0,
      content: { section: "body", content: REORDER_BLOCK_TEXT.first },
    },
    {
      block_type: "Paragraph",
      order: 1,
      content: { section: "body", content: REORDER_BLOCK_TEXT.second },
    },
    {
      block_type: "Paragraph",
      order: 2,
      content: { section: "body", content: REORDER_BLOCK_TEXT.third },
    },
  ];
}

function headingHtml(text: string): string {
  return `<h2 style="text-align:center;font-size:24px;font-weight:bold;color:#111827;padding:12px;">${text}</h2>`;
}

function paragraphHtml(text: string): string {
  return `<p style="font-size:14px;color:#374151;padding:12px;">${text}</p>`;
}

function buttonHtml(text: string): string {
  return `<a href="https://example.com/shop" style="display:inline-block;background:#7f1d1d;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none;">${text}</a>`;
}

/** Mailchimp template-content sections map (YL-a reference template). */
export function buildReferenceMailchimpSections(): Record<string, string> {
  return {
    "header-e2e-para-1": paragraphHtml(REFERENCE_BLOCK_ANCHORS.headerParagraph),
    "header-e2e-logo-2": `<div style="text-align:center;padding:12px;">${REFERENCE_BLOCK_ANCHORS.logo}</div>`,
    "body-e2e-heading-5": headingHtml(REFERENCE_BLOCK_ANCHORS.heroHeading),
    "body-e2e-para-6": paragraphHtml(REFERENCE_BLOCK_ANCHORS.bodyParagraph),
    "body-e2e-button-7": buttonHtml(REFERENCE_BLOCK_ANCHORS.button),
    "body-e2e-divider-8": `<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />`,
    "body-e2e-heading-17": headingHtml(REFERENCE_BLOCK_ANCHORS.freeShippingHeading),
    "body-e2e-image-4": `<img src="${REFERENCE_IMAGE_URL}" alt="Minimalist home office setup" style="max-width:100%;display:block;margin:0 auto;" />`,
    "body-e2e-heading-11": headingHtml(REFERENCE_BLOCK_ANCHORS.testimonialHeading),
    "body-e2e-para-12": paragraphHtml(REFERENCE_BLOCK_ANCHORS.testimonialParagraph),
    "body-e2e-heading-14": headingHtml(REFERENCE_BLOCK_ANCHORS.needHelpHeading),
    "body-e2e-para-15": paragraphHtml(REFERENCE_BLOCK_ANCHORS.supportParagraph),
    "footer-e2e-para-18": paragraphHtml(REFERENCE_BLOCK_ANCHORS.footerParagraph),
  };
}

export function buildReorderMailchimpSections(): Record<string, string> {
  return {
    "body-e2e-reorder-1": paragraphHtml(REORDER_BLOCK_TEXT.first),
    "body-e2e-reorder-2": paragraphHtml(REORDER_BLOCK_TEXT.second),
    "body-e2e-reorder-3": paragraphHtml(REORDER_BLOCK_TEXT.third),
  };
}

/** Single editable heading for Y-edit smoke paths. */
export function buildSingleHeadingKlaviyoBlock(text: string): KlaviyoSeedBlock[] {
  return [
    {
      block_type: "Heading",
      order: 0,
      content: {
        section: "body",
        content: text,
        styles: { fontSize: 24, fontWeight: "bold", textAlign: "center", color: "#111827" },
      },
    },
  ];
}

export function buildSingleHeadingMailchimpSection(text: string): Record<string, string> {
  return {
    "body-e2e-single-heading": headingHtml(text),
  };
}

/** Klaviyo body Image block — optional `imageUrl` (omit for picker flows). */
export function buildSingleImageKlaviyoBlock(opts?: {
  imageUrl?: string;
  imageAlt?: string;
}): KlaviyoSeedBlock[] {
  const content: Record<string, unknown> = {
    section: "body",
    imageAlt: opts?.imageAlt ?? REFERENCE_IMAGE_ALT,
  };
  if (opts?.imageUrl) {
    content.imageUrl = opts.imageUrl;
  }
  return [{ block_type: "Image", order: 0, content }];
}

/** Klaviyo Video block for thumbnail picker (Y-img-video). */
export function buildSingleVideoKlaviyoBlock(): KlaviyoSeedBlock[] {
  return [
    {
      block_type: "Video",
      order: 0,
      content: {
        section: "body",
        videoUrl: "https://www.youtube.com/watch?v=e2e-placeholder",
      },
    },
  ];
}

/** Klaviyo Header bar block for logo / item image modal (Y-img-header). */
export function buildSingleHeaderBarKlaviyoBlock(): KlaviyoSeedBlock[] {
  return [
    {
      block_type: "HeaderBar",
      order: 0,
      content: {
        section: "header",
        headerBarLayout: "logo-stacked",
      },
    },
  ];
}

/** Mailchimp canvas with a single empty image block (Content Studio pick). */
export function buildMailchimpImageOnlySections(): Record<string, string> {
  return {
    "body-e2e-image-only": `<img src="" alt="${REFERENCE_IMAGE_ALT}" style="max-width:100%;display:block;margin:0 auto;" />`,
  };
}

/** Mailchimp canvas with reference image already set (Content Studio close). */
export function buildMailchimpImageWithUrlSections(): Record<string, string> {
  return {
    "body-e2e-image-url": `<img src="${REFERENCE_IMAGE_URL}" alt="${REFERENCE_IMAGE_ALT}" style="max-width:100%;display:block;margin:0 auto;" />`,
  };
}
