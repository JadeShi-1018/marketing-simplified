import CommunityBenefitsSection from "./CommunityBenefitsSection";
import CommunityContributorsSection from "./CommunityContributorsSection";
import CommunityDiscussionsSection from "./CommunityDiscussionsSection";
import CommunityFab from "./CommunityFab";
import CommunityHeroSection from "./CommunityHeroSection";
import CommunityTopicsSection from "./CommunityTopicsSection";

export default function CommunityPage() {
  return (
    <>
      <CommunityHeroSection />
      <CommunityTopicsSection />
      <CommunityDiscussionsSection />
      <CommunityContributorsSection />
      <CommunityBenefitsSection />
      <CommunityFab />
    </>
  );
}
