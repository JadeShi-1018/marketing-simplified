/**
 * LumaStyle theme — §8i style model fields for API seed / style E2E.
 * @see frontend/e2e/email_draft/note/e2e-email-draft-plan.md §8i
 *
 * Columns match inspector style fields (not legacy labels like `heading` / `text height`).
 */

import type { KlaviyoSeedBlock } from "./editor-flow-fixtures";
import { REFERENCE_IMAGE_URL } from "./editor-flow-fixtures";

/** Named LumaStyle palette → hex (API / canvas). */
export const LUMASTYLE_COLORS = {
  cream: "#FFF8E7",
  "warm beige": "#F5E6D3",
  ivory: "#FFFFF0",
  white: "#FFFFFF",
  "dark brown": "#3E2723",
  "dark red": "#7F1D1D",
  darkred: "#7F1D1D",
  "dark gray": "#374151",
  "light gray": "#D1D5DB",
  gray: "#6B7280",
  "light orange": "#FFEDD5",
  orange: "#EA580C",
  "soft yellow": "#FEF9C3",
  gold: "#CA8A04",
  "pale peach": "#FFE4C4",
  beige: "#D4C4A8",
  "light yellow": "#FEF08A",
  "soft peach": "#FECACA",
  transparent: "transparent",
  lightgray: "#D1D5DB",
} as const;

export type LumaStyleColorName = keyof typeof LUMASTYLE_COLORS;

/** Plan §8i `blockLabel` values (explicit union — not inferred from `LumaStyleRow[]`). */
export const LUMASTYLE_BLOCK_LABELS = [
  "Logo",
  "Main Heading",
  "Paragraph",
  "Button",
  "Divider",
  "Free Shipping Heading",
  "Image Caption",
  "Video Title",
  "Testimonial Heading",
  "Testimonial Paragraph",
  "Support Heading",
  "Support Paragraph",
  "Footer",
  "Social Section",
] as const;

export type LumaStyleBlockLabel = (typeof LUMASTYLE_BLOCK_LABELS)[number];

/** One row from plan §8i. */
export type LumaStyleRow = {
  blockLabel: LumaStyleBlockLabel;
  content: string;
  blockBackground: string;
  borderRadius: string;
  border: string;
  fontFamily: string;
  fontSize: string;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  lineHeight: string;
  letterSpacing: string;
  /** Plan `notes` column — target block type / usage. */
  notes: string;
};

/** All 14 LumaStyle rows (plan §8i table). */
export const LUMASTYLE_FIXTURE_ROWS: readonly LumaStyleRow[] = [
  {
    blockLabel: "Logo",
    content: "LumaStyle",
    blockBackground: "cream",
    borderRadius: "8px",
    border: "solid 1px",
    fontFamily: "georgia",
    fontSize: "40px",
    color: "dark brown",
    bold: true,
    italic: false,
    underline: false,
    strikethrough: false,
    lineHeight: "1.2",
    letterSpacing: "3px",
    notes: "`Logo` block",
  },
  {
    blockLabel: "Main Heading",
    content: "Upgrade Your Workspace This Winter",
    blockBackground: "warm beige",
    borderRadius: "12px",
    border: "none",
    fontFamily: "georgia",
    fontSize: "42px",
    color: "dark red",
    bold: true,
    italic: false,
    underline: false,
    strikethrough: false,
    lineHeight: "1.4",
    letterSpacing: "1px",
    notes: "`Heading`",
  },
  {
    blockLabel: "Paragraph",
    content: "Discover ergonomic desks and lighting for your home office.",
    blockBackground: "ivory",
    borderRadius: "10px",
    border: "solid 1px lightgray",
    fontFamily: "arial",
    fontSize: "18px",
    color: "dark gray",
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    lineHeight: "1.8",
    letterSpacing: "0.5px",
    notes: "`Paragraph`",
  },
  {
    blockLabel: "Button",
    content: "Shop Now",
    blockBackground: "dark red",
    borderRadius: "30px",
    border: "solid 2px darkred",
    fontFamily: "arial",
    fontSize: "20px",
    color: "white",
    bold: true,
    italic: false,
    underline: false,
    strikethrough: false,
    lineHeight: "1",
    letterSpacing: "1px",
    notes: "`Button`",
  },
  {
    blockLabel: "Divider",
    content: "",
    blockBackground: "transparent",
    borderRadius: "0",
    border: "dashed 2px orange",
    fontFamily: "arial",
    fontSize: "12px",
    color: "orange",
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    lineHeight: "1",
    letterSpacing: "0",
    notes: "MC only styles",
  },
  {
    blockLabel: "Free Shipping Heading",
    content: "Free Shipping on Orders Over $80",
    blockBackground: "light orange",
    borderRadius: "14px",
    border: "solid 1px orange",
    fontFamily: "georgia",
    fontSize: "28px",
    color: "dark red",
    bold: true,
    italic: true,
    underline: false,
    strikethrough: false,
    lineHeight: "1.5",
    letterSpacing: "1px",
    notes: "`Heading`",
  },
  {
    blockLabel: "Image Caption",
    content: "Minimalist home office setup with natural light and an ergonomic chair.",
    blockBackground: "white",
    borderRadius: "6px",
    border: "solid 1px lightgray",
    fontFamily: "verdana",
    fontSize: "16px",
    color: "gray",
    bold: false,
    italic: true,
    underline: false,
    strikethrough: false,
    lineHeight: "1.6",
    letterSpacing: "0.5px",
    notes: "Image alt/caption text",
  },
  {
    blockLabel: "Video Title",
    content: "See How Our Customers Transform Their Workspace",
    blockBackground: "soft yellow",
    borderRadius: "10px",
    border: "solid 1px gold",
    fontFamily: "georgia",
    fontSize: "30px",
    color: "dark brown",
    bold: true,
    italic: false,
    underline: false,
    strikethrough: false,
    lineHeight: "1.4",
    letterSpacing: "1px",
    notes: "`Video` block title",
  },
  {
    blockLabel: "Testimonial Heading",
    content: "What Our Customers Are Saying",
    blockBackground: "pale peach",
    borderRadius: "12px",
    border: "none",
    fontFamily: "georgia",
    fontSize: "32px",
    color: "dark red",
    bold: true,
    italic: false,
    underline: true,
    strikethrough: false,
    lineHeight: "1.5",
    letterSpacing: "1px",
    notes: "`Heading`",
  },
  {
    blockLabel: "Testimonial Paragraph",
    content:
      "“The standing desk completely changed my workflow and how I feel at the end of the day.”",
    blockBackground: "ivory",
    borderRadius: "10px",
    border: "solid 1px beige",
    fontFamily: "times new roman",
    fontSize: "18px",
    color: "dark gray",
    bold: false,
    italic: true,
    underline: false,
    strikethrough: false,
    lineHeight: "2",
    letterSpacing: "0.5px",
    notes: "`Paragraph`",
  },
  {
    blockLabel: "Support Heading",
    content: "Need Help?",
    blockBackground: "light yellow",
    borderRadius: "10px",
    border: "solid 1px orange",
    fontFamily: "georgia",
    fontSize: "26px",
    color: "dark red",
    bold: true,
    italic: false,
    underline: false,
    strikethrough: false,
    lineHeight: "1.3",
    letterSpacing: "1px",
    notes: "`Heading`",
  },
  {
    blockLabel: "Support Paragraph",
    content: "Our support team is available 24/7 to help with your order.",
    blockBackground: "cream",
    borderRadius: "8px",
    border: "solid 1px lightgray",
    fontFamily: "arial",
    fontSize: "17px",
    color: "dark gray",
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    lineHeight: "1.7",
    letterSpacing: "0.5px",
    notes: "`Paragraph`",
  },
  {
    blockLabel: "Footer",
    content: "You received this email because you signed up for updates on our website.",
    blockBackground: "dark brown",
    borderRadius: "0",
    border: "none",
    fontFamily: "verdana",
    fontSize: "14px",
    color: "light gray",
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    lineHeight: "1.6",
    letterSpacing: "0.5px",
    notes: "Footer `Paragraph`",
  },
  {
    blockLabel: "Social Section",
    content: "Follow us for new arrivals, design tips, and exclusive offers.",
    blockBackground: "soft peach",
    borderRadius: "12px",
    border: "dashed 1px orange",
    fontFamily: "arial",
    fontSize: "18px",
    color: "dark red",
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    lineHeight: "1.5",
    letterSpacing: "1px",
    notes: "`Social` intro text",
  },
] as const satisfies readonly LumaStyleRow[];

/** Lookup by `blockLabel` (plan §8i first column). */
export const LUMASTYLE_BY_LABEL: Record<LumaStyleBlockLabel, LumaStyleRow> =
  Object.fromEntries(LUMASTYLE_FIXTURE_ROWS.map((row) => [row.blockLabel, row])) as Record<
    LumaStyleBlockLabel,
    LumaStyleRow
  >;

export function getLumaStyleRow(blockLabel: LumaStyleBlockLabel): LumaStyleRow {
  return LUMASTYLE_BY_LABEL[blockLabel];
}

/** §6 block # → LumaStyle `blockLabel` (where applicable). */
export const REFERENCE_BLOCK_NUM_TO_LUMASTYLE_LABEL = {
  1: null,
  2: "Logo",
  4: "Image Caption",
  5: "Main Heading",
  6: "Paragraph",
  7: "Button",
  8: "Divider",
  9: null,
  10: "Video Title",
  11: "Testimonial Heading",
  12: "Testimonial Paragraph",
  13: "Social Section",
  14: "Support Heading",
  15: "Support Paragraph",
  16: "Divider",
  17: "Free Shipping Heading",
  18: "Footer",
} as const;

/** L2 style spot-check contract (plan §8a / §8j). */
export const LUMASTYLE_L2_SPOT_CHECKS = {
  klaviyoText: {
    row: "Main Heading" as const,
    assertFields: ["fontSize", "color", "fontWeight"] as const,
  },
  klaviyoButton: {
    row: "Button" as const,
    assertFields: ["buttonBackgroundColor", "buttonTextColor", "fontSize"] as const,
  },
} as const;

export function lumaStyleColorToHex(colorName: string): string {
  const key = colorName.trim().toLowerCase();
  if (key in LUMASTYLE_COLORS) {
    return LUMASTYLE_COLORS[key as LumaStyleColorName];
  }
  return colorName;
}

function lumaStyleFontFamily(cssName: string): string {
  const map: Record<string, string> = {
    georgia: "Georgia, serif",
    arial: "Arial, sans-serif",
    verdana: "Verdana, sans-serif",
    "times new roman": '"Times New Roman", serif',
  };
  return map[cssName.trim().toLowerCase()] ?? cssName;
}

function parsePx(value: string): number | string {
  const trimmed = value.trim();
  if (trimmed.endsWith("px")) {
    return Number.parseInt(trimmed, 10);
  }
  return trimmed;
}

export type ParsedLumaStyleBorder = {
  borderStyle: "none" | "solid" | "dashed" | "dotted";
  borderWidth?: number | string;
  borderColor?: string;
};

const LUMASTYLE_BORDER_PATTERN = /^(solid|dashed|dotted)\s+(\d+px)(?:\s+(.+))?$/;

function lumaStyleTextDecoration(row: LumaStyleRow): string {
  if (row.strikethrough) {
    return "line-through";
  }
  if (row.underline) {
    return "underline";
  }
  return "none";
}

/** Parse plan `border` column (e.g. `solid 1px lightgray`, `none`, `dashed 2px orange`). */
export function parseLumaStyleBorder(border: string): ParsedLumaStyleBorder {
  const raw = border.trim().toLowerCase();
  if (!raw || raw === "none") {
    return { borderStyle: "none" };
  }
  const match = LUMASTYLE_BORDER_PATTERN.exec(raw);
  if (!match) {
    return { borderStyle: "solid", borderWidth: "1px" };
  }
  const [, style, width, colorName] = match;
  return {
    borderStyle: style as ParsedLumaStyleBorder["borderStyle"],
    borderWidth: width,
    borderColor: colorName ? lumaStyleColorToHex(colorName) : undefined,
  };
}

/** Klaviyo `content.styles` / text block style payload from a LumaStyle row. */
export function lumaStyleRowToKlaviyoTextStyles(
  row: LumaStyleRow,
): Record<string, unknown> {
  const border = parseLumaStyleBorder(row.border);
  const borderStyles =
    border.borderStyle === "none"
      ? { borderStyle: "none" as const }
      : {
          borderStyle: border.borderStyle,
          borderWidth: border.borderWidth ? parsePx(String(border.borderWidth)) : undefined,
          borderColor: border.borderColor,
        };

  return {
    fontFamily: lumaStyleFontFamily(row.fontFamily),
    fontSize: parsePx(row.fontSize),
    fontWeight: row.bold ? "bold" : "normal",
    fontStyle: row.italic ? "italic" : "normal",
    textDecoration: lumaStyleTextDecoration(row),
    color: lumaStyleColorToHex(row.color),
    blockBackgroundColor: lumaStyleColorToHex(row.blockBackground),
    borderRadius: parsePx(row.borderRadius),
    lineHeight: row.lineHeight,
    letterSpacing: row.letterSpacing,
    ...borderStyles,
  };
}

/** Klaviyo Button block fields from LumaStyle Button row. */
export function lumaStyleRowToKlaviyoButtonFields(
  row: LumaStyleRow,
): Record<string, unknown> {
  const border = parseLumaStyleBorder(row.border);
  return {
    content: row.content,
    section: "body",
    buttonLinkType: "Web",
    buttonLinkValue: "https://example.com/shop",
    buttonOpenInNewTab: true,
    buttonShape: "Pill",
    buttonAlignment: "center",
    buttonTextColor: lumaStyleColorToHex(row.color),
    buttonBackgroundColor: lumaStyleColorToHex(row.blockBackground),
    buttonBlockStyles: {
      borderRadius: parsePx(row.borderRadius),
      ...(border.borderStyle === "none"
        ? {}
        : {
            borderStyle: border.borderStyle,
            borderWidth: border.borderWidth ? parsePx(String(border.borderWidth)) : undefined,
            borderColor: border.borderColor ?? lumaStyleColorToHex("darkred"),
          }),
    },
    styles: {
      fontFamily: lumaStyleFontFamily(row.fontFamily),
      fontSize: parsePx(row.fontSize),
      fontWeight: row.bold ? "bold" : "normal",
      lineHeight: row.lineHeight,
      letterSpacing: row.letterSpacing,
    },
  };
}

/** Expected values for L2 assertions on a text row. */
export function lumaStyleExpectedTextSpotValues(row: LumaStyleRow): {
  fontSize: number;
  color: string;
  fontWeight: "bold" | "normal";
} {
  return {
    fontSize: Number.parseInt(row.fontSize, 10),
    color: lumaStyleColorToHex(row.color),
    fontWeight: row.bold ? "bold" : "normal",
  };
}

/** Expected values for L2 assertions on a button row. */
export function lumaStyleExpectedButtonSpotValues(row: LumaStyleRow): {
  buttonBackgroundColor: string;
  buttonTextColor: string;
  fontSize: number;
} {
  return {
    buttonBackgroundColor: lumaStyleColorToHex(row.blockBackground),
    buttonTextColor: lumaStyleColorToHex(row.color),
    fontSize: Number.parseInt(row.fontSize, 10),
  };
}

/**
 * Klaviyo PATCH blocks for §6 reference template with LumaStyle typography/colors.
 * Block order follows plan §6 (#1–18); header paragraph uses default copy (not in §8i).
 */
export function buildLumaStyleKlaviyoBlocks(): KlaviyoSeedBlock[] {
  const row = (label: LumaStyleBlockLabel) => getLumaStyleRow(label);
  let order = 0;
  const next = (block_type: string, content: Record<string, unknown>): KlaviyoSeedBlock => ({
    block_type,
    order: order++,
    content,
  });

  const logo = row("Logo");
  const mainHeading = row("Main Heading");
  const paragraph = row("Paragraph");
  const button = row("Button");
  const freeShipping = row("Free Shipping Heading");
  const imageCaption = row("Image Caption");
  const videoTitle = row("Video Title");
  const testimonialHeading = row("Testimonial Heading");
  const testimonialParagraph = row("Testimonial Paragraph");
  const supportHeading = row("Support Heading");
  const supportParagraph = row("Support Paragraph");
  const footer = row("Footer");
  const socialIntro = row("Social Section");

  return [
    next("Paragraph", {
      section: "header",
      content: "View this email in your browser",
      styles: { fontSize: 12, color: "#6b7280", textAlign: "center" },
    }),
    next("Logo", {
      section: "header",
      content: logo.content,
      styles: lumaStyleRowToKlaviyoTextStyles(logo),
    }),
    next("Heading", {
      section: "body",
      content: mainHeading.content,
      styles: { ...lumaStyleRowToKlaviyoTextStyles(mainHeading), textAlign: "center" },
    }),
    next("Paragraph", {
      section: "body",
      content: paragraph.content,
      styles: lumaStyleRowToKlaviyoTextStyles(paragraph),
    }),
    next("Button", lumaStyleRowToKlaviyoButtonFields(button)),
    next("Divider", { section: "body" }),
    next("Heading", {
      section: "body",
      content: freeShipping.content,
      styles: { ...lumaStyleRowToKlaviyoTextStyles(freeShipping), textAlign: "center" },
    }),
    next("Image", {
      section: "body",
      imageUrl: REFERENCE_IMAGE_URL,
      imageAlt: imageCaption.content,
    }),
    next("Heading", {
      section: "body",
      content: videoTitle.content,
      styles: { ...lumaStyleRowToKlaviyoTextStyles(videoTitle), textAlign: "center" },
    }),
    next("Video", {
      section: "body",
      videoUrl: "https://www.youtube.com/watch?v=e2e-lumastyle-placeholder",
    }),
    next("Heading", {
      section: "body",
      content: testimonialHeading.content,
      styles: { ...lumaStyleRowToKlaviyoTextStyles(testimonialHeading), textAlign: "center" },
    }),
    next("Paragraph", {
      section: "body",
      content: testimonialParagraph.content,
      styles: lumaStyleRowToKlaviyoTextStyles(testimonialParagraph),
    }),
    next("Heading", {
      section: "body",
      content: supportHeading.content,
      styles: { ...lumaStyleRowToKlaviyoTextStyles(supportHeading), textAlign: "center" },
    }),
    next("Paragraph", {
      section: "body",
      content: supportParagraph.content,
      styles: lumaStyleRowToKlaviyoTextStyles(supportParagraph),
    }),
    next("Divider", { section: "body" }),
    next("Paragraph", {
      section: "footer",
      content: socialIntro.content,
      styles: { ...lumaStyleRowToKlaviyoTextStyles(socialIntro), textAlign: "center" },
    }),
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
      content: footer.content,
      styles: {
        ...lumaStyleRowToKlaviyoTextStyles(footer),
        textAlign: "center",
        color: lumaStyleColorToHex(footer.color),
        blockBackgroundColor: lumaStyleColorToHex(footer.blockBackground),
      },
    }),
  ];
}

function lumaStyleInlineCss(row: LumaStyleRow): string {
  const border = parseLumaStyleBorder(row.border);
  const parts = [
    `font-family:${lumaStyleFontFamily(row.fontFamily)}`,
    `font-size:${row.fontSize}`,
    `color:${lumaStyleColorToHex(row.color)}`,
    `font-weight:${row.bold ? "bold" : "normal"}`,
    `font-style:${row.italic ? "italic" : "normal"}`,
    `line-height:${row.lineHeight}`,
    `letter-spacing:${row.letterSpacing}`,
    `background-color:${lumaStyleColorToHex(row.blockBackground)}`,
    `border-radius:${row.borderRadius}`,
    "padding:12px",
  ];
  if (row.underline) parts.push("text-decoration:underline");
  if (row.strikethrough) parts.push("text-decoration:line-through");
  if (border.borderStyle !== "none") {
    parts.push(
      `border-style:${border.borderStyle}`,
      `border-width:${border.borderWidth ?? "1px"}`,
      `border-color:${border.borderColor ?? lumaStyleColorToHex("orange")}`,
    );
  }
  return parts.join(";");
}

/** Mailchimp `default_content.sections` HTML with LumaStyle inline styles (MC divider uses row border). */
export function buildLumaStyleMailchimpSections(): Record<string, string> {
  const r = (label: LumaStyleBlockLabel) => getLumaStyleRow(label);
  const divider = r("Divider");
  const dividerBorder = parseLumaStyleBorder(divider.border);
  const dividerCss = [
    "border:none",
    `border-top:${dividerBorder.borderWidth ?? "2px"} ${dividerBorder.borderStyle} ${dividerBorder.borderColor ?? lumaStyleColorToHex("orange")}`,
    "margin:16px 0",
  ].join(";");

  return {
    "header-e2e-para-1": `<p style="font-size:12px;color:#6b7280;text-align:center;padding:8px;">View this email in your browser</p>`,
    "header-e2e-logo-2": `<div style="${lumaStyleInlineCss(r("Logo"))};text-align:center;">${r("Logo").content}</div>`,
    "body-e2e-heading-5": `<h2 style="${lumaStyleInlineCss(r("Main Heading"))};text-align:center;">${r("Main Heading").content}</h2>`,
    "body-e2e-para-6": `<p style="${lumaStyleInlineCss(r("Paragraph"))}">${r("Paragraph").content}</p>`,
    "body-e2e-button-7": `<a href="https://example.com/shop" style="display:inline-block;${lumaStyleInlineCss(r("Button"))};text-decoration:none;border-radius:30px;">${r("Button").content}</a>`,
    "body-e2e-divider-8": `<hr style="${dividerCss}" />`,
    "body-e2e-heading-17": `<h2 style="${lumaStyleInlineCss(r("Free Shipping Heading"))};text-align:center;">${r("Free Shipping Heading").content}</h2>`,
    "body-e2e-image-4": `<img src="${REFERENCE_IMAGE_URL}" alt="${r("Image Caption").content}" style="max-width:100%;display:block;margin:0 auto;border-radius:6px;" />`,
    "body-e2e-heading-video": `<h2 style="${lumaStyleInlineCss(r("Video Title"))};text-align:center;">${r("Video Title").content}</h2>`,
    "body-e2e-heading-11": `<h2 style="${lumaStyleInlineCss(r("Testimonial Heading"))};text-align:center;">${r("Testimonial Heading").content}</h2>`,
    "body-e2e-para-12": `<p style="${lumaStyleInlineCss(r("Testimonial Paragraph"))}">${r("Testimonial Paragraph").content}</p>`,
    "body-e2e-heading-14": `<h2 style="${lumaStyleInlineCss(r("Support Heading"))};text-align:center;">${r("Support Heading").content}</h2>`,
    "body-e2e-para-15": `<p style="${lumaStyleInlineCss(r("Support Paragraph"))}">${r("Support Paragraph").content}</p>`,
    "body-e2e-divider-16": `<hr style="${dividerCss}" />`,
    "footer-e2e-social-intro": `<p style="${lumaStyleInlineCss(r("Social Section"))};text-align:center;">${r("Social Section").content}</p>`,
    "footer-e2e-para-18": `<p style="${lumaStyleInlineCss(r("Footer"))};text-align:center;">${r("Footer").content}</p>`,
  };
}

/** Single LumaStyle text block for §8a style tests. */
export function buildLumaStyleKlaviyoTextBlock(
  label: Extract<LumaStyleBlockLabel, "Main Heading" | "Paragraph" | "Free Shipping Heading">,
): KlaviyoSeedBlock[] {
  const row = getLumaStyleRow(label);
  const block_type = label === "Paragraph" ? "Paragraph" : "Heading";
  return [
    {
      block_type,
      order: 0,
      content: {
        section: "body",
        content: row.content,
        styles: {
          ...lumaStyleRowToKlaviyoTextStyles(row),
          textAlign: label === "Paragraph" ? "left" : "center",
        },
      },
    },
  ];
}

/** Single LumaStyle button block for §8b style tests. */
export function buildLumaStyleKlaviyoButtonBlock(): KlaviyoSeedBlock[] {
  return [{ block_type: "Button", order: 0, content: lumaStyleRowToKlaviyoButtonFields(getLumaStyleRow("Button")) }];
}

export type LumaStyleMailchimpTextLabel = Extract<
  LumaStyleBlockLabel,
  "Main Heading" | "Paragraph"
>;

const LUMASTYLE_MAILCHIMP_TEXT_SECTION_KEYS: Record<LumaStyleMailchimpTextLabel, string> = {
  "Main Heading": "body-lumastyle-main-heading",
  Paragraph: "body-lumastyle-paragraph",
};

/** Minimal Mailchimp sections for §8a text style tests. */
export function buildLumaStyleMailchimpTextSection(
  label: LumaStyleMailchimpTextLabel,
): Record<string, string> {
  const row = getLumaStyleRow(label);
  const tag = label === "Main Heading" ? "h2" : "p";
  const sectionKey = LUMASTYLE_MAILCHIMP_TEXT_SECTION_KEYS[label];
  const blockTypeAttr =
    label === "Main Heading" ? ' data-block-type="Heading"' : "";
  return {
    [sectionKey]: `<${tag}${blockTypeAttr} style="${lumaStyleInlineCss(row)};text-align:center;">${row.content}</${tag}>`,
  };
}

export function buildLumaStyleMailchimpButtonSection(): Record<string, string> {
  const row = getLumaStyleRow("Button");
  const heading = getLumaStyleRow("Main Heading");
  return {
    "body-e2e-heading-5": `<h2 style="${lumaStyleInlineCss(heading)};text-align:center;">${heading.content}</h2>`,
    "body-e2e-button-7": `<div data-block-type="Button" style="text-align:center;"><a href="https://example.com/shop" target="_blank"><button style="display:inline-block;${lumaStyleInlineCss(row)};text-decoration:none;border-radius:30px;">${row.content}</button></a></div>`,
  };
}

export function buildLumaStyleMailchimpLogoSection(): Record<string, string> {
  const row = getLumaStyleRow("Logo");
  return {
    "header-e2e-para-1": `<p style="font-size:12px;color:#6b7280;text-align:center;padding:8px;">View this email in your browser</p>`,
    "header-e2e-logo-2": `<p style="${lumaStyleInlineCss(row)};text-align:center;margin:0;">${row.content}</p>`,
  };
}

export function buildLumaStyleMailchimpDividerSection(): Record<string, string> {
  const divider = getLumaStyleRow("Divider");
  const border = parseLumaStyleBorder(divider.border);
  const borderColor = border.borderColor ?? lumaStyleColorToHex("orange");
  const borderWidth = border.borderWidth ?? "2px";
  const borderStyle = border.borderStyle ?? "solid";
  const containerStyle = [
    "background-color:transparent",
    "padding-top:20px",
    "padding-bottom:20px",
    "padding-left:24px",
    "padding-right:24px",
  ].join(";");
  const lineStyle = [
    `border-top-style:${borderStyle}`,
    `border-top-width:${borderWidth}`,
    `border-top-color:${borderColor}`,
    "width:100%",
    "margin:0",
    "padding:0",
  ].join(";");
  return {
    "body-e2e-divider-8": `<div style="${containerStyle}"><div style="${lineStyle}"></div></div>`,
  };
}

/** Minimal Mailchimp body seed for §8e social intro (same pattern as §8a text). */
export function buildLumaStyleMailchimpSocialSection(): Record<string, string> {
  const row = getLumaStyleRow("Social Section");
  return {
    "body-e2e-social-intro-13": `<h2 data-block-type="Heading" style="${lumaStyleInlineCss(row)};text-align:center;">${row.content}</h2>`,
  };
}

export function buildLumaStyleKlaviyoDividerBlock(): KlaviyoSeedBlock[] {
  return [{ block_type: "Divider", order: 0, content: { section: "body" } }];
}

export function buildLumaStyleKlaviyoSocialBlock(): KlaviyoSeedBlock[] {
  return [
    {
      block_type: "Social",
      order: 0,
      content: {
        section: "body",
        socialLinks: [
          { id: "x", platform: "X", url: "https://example.com/x", label: "X" },
          { id: "facebook", platform: "Facebook", url: "https://example.com/fb", label: "Facebook" },
        ],
        socialAlignment: "center",
      },
    },
  ];
}

export function buildLumaStyleKlaviyoHeaderBarBlock(): KlaviyoSeedBlock[] {
  return [
    {
      block_type: "HeaderBar",
      order: 0,
      content: { section: "header", headerBarLayout: "logo-stacked" },
    },
  ];
}

export function buildLumaStyleKlaviyoVideoBlock(): KlaviyoSeedBlock[] {
  return [
    {
      block_type: "Video",
      order: 0,
      content: {
        section: "body",
        videoUrl: "https://www.youtube.com/watch?v=e2e-lumastyle-style",
      },
    },
  ];
}

export function buildLumaStyleKlaviyoHtmlBlock(): KlaviyoSeedBlock[] {
  return [
    {
      block_type: "Code",
      order: 0,
      content: { section: "body", content: "<p>LumaStyle HTML block</p>" },
    },
  ];
}

export function buildLumaStyleKlaviyoSpacerBlock(): KlaviyoSeedBlock[] {
  return [
    {
      block_type: "Spacer",
      order: 0,
      content: { section: "body", spacerHeight: 40, spacerBackgroundColor: "#FEF9C3" },
    },
  ];
}

function defaultLayoutColumnWidths(columns: number): number[] {
  const baseWidth = Math.floor(12 / columns);
  const remainder = 12 % columns;
  const widths = Array(columns).fill(baseWidth);
  for (let i = 0; i < remainder; i++) {
    widths[i]++;
  }
  return widths;
}

export function buildLumaStyleKlaviyoLayoutBlock(columns = 2): KlaviyoSeedBlock[] {
  return [
    {
      block_type: "Layout",
      order: 0,
      content: {
        section: "body",
        columns,
        columnsWidths: defaultLayoutColumnWidths(columns),
        columnBlocks: Array.from({ length: columns }, () => []),
      },
    },
  ];
}

export function buildLumaStyleMailchimpLayoutSection(
  columns = 2,
): Record<string, string> {
  const widths = defaultLayoutColumnWidths(columns);
  return {
    "body-e2e-layout-9": `<div data-block-type="Layout" data-columns="${columns}" data-columns-widths="${widths.join(",")}"><div class="layout-container"></div></div>`,
  };
}
