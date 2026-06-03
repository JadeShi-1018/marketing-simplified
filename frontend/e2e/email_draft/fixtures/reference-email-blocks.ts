/**
 * Reference template blocks (§6) seeded with LumaStyle (§8i).
 * @see frontend/e2e/email_draft/note/e2e-email-draft-plan.md §6, §8i
 */

import type { KlaviyoSeedBlock } from "./editor-flow-fixtures";
import {
  buildLumaStyleKlaviyoBlocks,
  buildLumaStyleMailchimpSections,
  getLumaStyleRow,
} from "./lumastyle-style-fixtures";

export {
  buildLumaStyleKlaviyoBlocks,
  buildLumaStyleMailchimpSections,
  getLumaStyleRow,
  LUMASTYLE_BY_LABEL,
  LUMASTYLE_FIXTURE_ROWS,
  LUMASTYLE_L2_SPOT_CHECKS,
  lumaStyleExpectedButtonSpotValues,
  lumaStyleExpectedTextSpotValues,
  lumaStyleRowToKlaviyoTextStyles,
  REFERENCE_BLOCK_NUM_TO_LUMASTYLE_LABEL,
  type LumaStyleBlockLabel,
  type LumaStyleRow,
} from "./lumastyle-style-fixtures";

/** §6 block # → stable `data-e2e-block` id (optional canvas hooks). */
export const REFERENCE_BLOCK_LABELS = {
  1: "header-paragraph",
  2: "logo",
  4: "image",
  5: "main-heading",
  6: "body-paragraph",
  7: "button",
  8: "divider-1",
  9: "layout",
  10: "video",
  11: "testimonial-heading",
  12: "testimonial-paragraph",
  14: "support-heading",
  15: "support-paragraph",
  16: "divider-2",
  17: "free-shipping-heading",
  18: "footer",
  13: "social",
} as const;

/** Canvas anchor strings for assertions (`getByText`). */
export const REFERENCE_LUMASTYLE_ANCHORS = {
  headerParagraph: "View this email in your browser",
  logo: getLumaStyleRow("Logo").content,
  mainHeading: getLumaStyleRow("Main Heading").content,
  bodyParagraph: getLumaStyleRow("Paragraph").content,
  button: getLumaStyleRow("Button").content,
  freeShippingHeading: getLumaStyleRow("Free Shipping Heading").content,
  imageAlt: getLumaStyleRow("Image Caption").content,
  videoTitle: getLumaStyleRow("Video Title").content,
  testimonialHeading: getLumaStyleRow("Testimonial Heading").content,
  testimonialParagraph: getLumaStyleRow("Testimonial Paragraph").content,
  supportHeading: getLumaStyleRow("Support Heading").content,
  supportParagraph: getLumaStyleRow("Support Paragraph").content,
  socialIntro: getLumaStyleRow("Social Section").content,
  footer: getLumaStyleRow("Footer").content,
} as const;

/** Klaviyo API blocks — LumaStyle-themed reference template. */
export function buildReferenceKlaviyoBlocks(): KlaviyoSeedBlock[] {
  return buildLumaStyleKlaviyoBlocks();
}

/** Mailchimp template sections — LumaStyle inline CSS. */
export function buildReferenceMailchimpSections(): Record<string, string> {
  return buildLumaStyleMailchimpSections();
}
