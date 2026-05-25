"use client";

/** Brand gradient rule between major drawer sections (below Activity Summary, module card, type cards). */
export default function DrawerSectionDivider() {
  return (
    <div
      className="h-[2px] w-full shrink-0 bg-gradient-to-r from-[#3CCED7] to-[#A6E661]"
      aria-hidden
    />
  );
}
