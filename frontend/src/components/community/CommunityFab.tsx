"use client";

import { Settings } from "lucide-react";

export default function CommunityFab() {
  return (
    <button
      type="button"
      className="fixed bottom-6 left-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#2E5BFF] text-white shadow-lg transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2E5BFF] motion-reduce:transition-none"
      aria-label="Accessibility and display settings"
    >
      <Settings className="h-5 w-5" aria-hidden />
    </button>
  );
}
