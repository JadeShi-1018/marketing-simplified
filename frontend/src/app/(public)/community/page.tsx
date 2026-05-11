import type { Metadata } from "next";

import CommunityPage from "@/components/community/CommunityPage";
import PublicPageShell from "@/components/home/PublicPageShell";

export const metadata: Metadata = {
  title: "Community | Marketing Simplified",
  description:
    "Join the Marketing Simplified community—explore topics, recent discussions, top contributors, and member benefits.",
};

export default function CommunityRoutePage() {
  return (
    <PublicPageShell>
      <CommunityPage />
    </PublicPageShell>
  );
}
