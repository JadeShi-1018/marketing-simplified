"""
Seed multi-project decision themes for Decision Tree auto grouping.

Usage:
  python manage.py seed_theme_decision_projects --anchor-project-id=1
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from core.models import Project, ProjectMember
from decision.models import Decision, DecisionEdge, Option

User = get_user_model()

PREFIX = "[Theme demo] "

THEMES = [
    {
        "name": "Theme - TikTok Growth",
        "objective": "tiktok_growth",
        "project_type": ["paid_social"],
        "decisions": [
            ("TikTok Spark Ads launch guardrails", -180, "Define launch limits for Spark Ads before scaling creator posts.", "Start with lower daily caps and require CAC guardrails before expansion."),
            ("TikTok creator hook testing plan", -140, "Hook fatigue is visible in the first two seconds of prospecting videos.", "Test creator-led hooks against problem-led hooks with consistent landing pages."),
            ("TikTok broad audience scaling threshold", -92, "Broad TikTok audience delivery is cheaper but less predictable.", "Scale only when blended CPA stays inside the target range for seven days."),
            ("TikTok shop offer test timing", -48, "Promo timing needs to avoid cannibalizing the main site offer.", "Run TikTok shop offer after creator hook winners are known."),
            ("TikTok comment mining workflow", -16, "Comment themes are surfacing objections about sizing and shipping.", "Turn recurring comments into creative briefs and FAQ landing page changes."),
            ("TikTok June budget increase", 0, "TikTok CAC improved after creator refresh.", "Increase budget in two steps with a rollback threshold."),
        ],
    },
    {
        "name": "Theme - Meta Retargeting",
        "objective": "meta_retargeting",
        "project_type": ["paid_social"],
        "decisions": [
            ("Meta retargeting window split", -168, "Checkout abandoners and product viewers need different messages.", "Split retargeting windows by funnel depth."),
            ("Meta fatigue frequency cap", -132, "Retargeting frequency is rising while CTR is declining.", "Add a frequency cap and refresh proof assets weekly."),
            ("Meta dynamic product ad structure", -88, "Catalog ads are mixing new arrivals with low-margin items.", "Separate catalog sets by margin and inventory availability."),
            ("Meta exclusions for recent buyers", -44, "Recent buyers are still seeing acquisition ads.", "Exclude purchasers for 21 days and send them to lifecycle email instead."),
            ("Meta retargeting proof angle", -8, "Social proof assets convert better in warmer audiences.", "Use review-led creative for checkout abandoners."),
        ],
    },
    {
        "name": "Theme - Google Search",
        "objective": "google_search",
        "project_type": ["paid_search"],
        "decisions": [
            ("Search brand campaign holdout", -176, "Brand search ROAS may be over-crediting existing demand.", "Run a holdout before increasing brand budget."),
            ("Search non-brand query expansion", -126, "High-intent non-brand terms have limited coverage.", "Expand exact match first, then phrase match after CPA holds."),
            ("Search landing page alignment", -80, "Ad groups are sending mixed intent to the same page.", "Route query clusters to matching landing pages."),
            ("Search bid cap for CAC control", -36, "Search volume increased but CPC volatility is rising.", "Apply bid caps by campaign until CAC stabilizes."),
            ("Search seasonal keyword push", -4, "Seasonal terms are starting to trend.", "Open a temporary seasonal campaign with daily spend limits."),
        ],
    },
    {
        "name": "Theme - Email Lifecycle",
        "objective": "email_lifecycle",
        "project_type": ["performance"],
        "decisions": [
            ("Welcome flow offer placement", -160, "New subscribers need product education before discount pressure.", "Move the offer to email three and use proof in email one."),
            ("Abandoned cart urgency test", -118, "Cart abandonment increased on mobile traffic.", "Test urgency copy against reassurance copy."),
            ("Post-purchase cross-sell timing", -74, "Repeat purchase window varies by first product category.", "Delay cross-sell until delivery confirmation for slower categories."),
            ("Winback audience suppression", -30, "Winback discounts are reaching recent buyers.", "Suppress recent purchasers and high refund-risk cohorts."),
            ("Lifecycle June content calendar", -2, "Email needs to support TikTok and search campaign peaks.", "Align weekly sends to paid traffic themes."),
        ],
    },
    {
        "name": "Theme - Landing Page CRO",
        "objective": "landing_page_cro",
        "project_type": ["performance"],
        "decisions": [
            ("Hero section proof reorder", -150, "Paid traffic is bouncing before seeing proof points.", "Move proof above the fold and shorten hero copy."),
            ("Bundle page pricing clarity", -108, "Users are confused by bundle savings and shipping threshold.", "Show itemized savings beside the add-to-cart button."),
            ("Mobile checkout express pay", -66, "Mobile checkout has higher drop-off after address entry.", "Move express payment before the full address form."),
            ("Landing page TikTok variant", -24, "TikTok visitors respond to creator proof before product specs.", "Create a TikTok-specific landing page variant."),
            ("CRO measurement readout", -1, "Several page tests need a shared readout.", "Compare conversion lift by channel before picking the winner."),
        ],
    },
    {
        "name": "Theme - Influencer UGC",
        "objective": "influencer_ugc",
        "project_type": ["influencer_ugc"],
        "decisions": [
            ("UGC creator sourcing criteria", -170, "The next batch of creators needs clearer selection rules.", "Prioritize creators with category credibility over follower count."),
            ("UGC usage rights package", -124, "Paid usage terms vary across creators.", "Standardize a 90-day paid usage package."),
            ("UGC brief for objection handling", -78, "Creative comments reveal repeated shipping and sizing objections.", "Add objection-handling prompts to creator briefs."),
            ("Influencer whitelisting test", -34, "Creator handles may lift trust in prospecting.", "Whitelist two creator handles with strict spend caps."),
            ("UGC refresh cadence", -6, "Winning UGC is fatiguing after three weeks.", "Set a three-week refresh cadence for top ad groups."),
        ],
    },
]


class Command(BaseCommand):
    help = "Create six theme projects with decisions for auto project grouping."

    def add_arguments(self, parser):
        parser.add_argument("--anchor-project-id", type=int, required=True)

    def handle(self, *args, **options):
        anchor = Project.objects.filter(pk=options["anchor_project_id"]).select_related("organization", "owner").first()
        if not anchor:
            self.stderr.write(self.style.ERROR(f"Project {options['anchor_project_id']} not found."))
            return

        owner = anchor.owner or User.objects.filter(organization=anchor.organization).first() or User.objects.filter(is_superuser=True).first()
        if not owner:
            self.stderr.write(self.style.ERROR("No user available for seeded projects."))
            return

        now = timezone.now()
        created_projects = 0
        created_decisions = 0

        with transaction.atomic():
            for theme in THEMES:
                project = Project.objects.filter(
                    organization=anchor.organization,
                    name=theme["name"],
                    is_deleted=False,
                ).first()
                if not project:
                    project = Project.objects.create(
                        organization=anchor.organization,
                        owner=owner,
                        name=theme["name"],
                        description=f"Decision theme for {theme['name'].replace('Theme - ', '')}.",
                        objectives=[theme["objective"]],
                        project_type=theme["project_type"],
                    )
                    created_projects += 1
                else:
                    project.objectives = [theme["objective"]]
                    project.project_type = theme["project_type"]
                    project.save(update_fields=["objectives", "project_type", "updated_at"])

                ProjectMember.objects.update_or_create(
                    user=owner,
                    project=project,
                    defaults={"role": "owner", "is_active": True},
                )

                Decision.objects.filter(
                    project=project,
                    title__startswith=PREFIX,
                    is_deleted=False,
                ).update(is_deleted=True)

                max_seq = Decision.objects.filter(project=project).aggregate(max_seq=Max("project_seq"))["max_seq"] or 0
                previous = None
                for title, days, context, reasoning in theme["decisions"]:
                    max_seq += 1
                    created_at = now + timedelta(days=days)
                    decision = Decision.objects.create(
                        title=f"{PREFIX}{title}",
                        status=Decision.Status.DRAFT,
                        author=owner,
                        last_edited_by=owner,
                        project=project,
                        project_seq=max_seq,
                        context_summary=context,
                        reasoning=reasoning,
                        risk_level=Decision.RiskLevel.MEDIUM,
                        confidence=4,
                        planned_decision_date=created_at,
                    )
                    Option.objects.create(decision=decision, text=reasoning, is_selected=True, order=0)
                    Option.objects.create(decision=decision, text="Hold and revisit next review", is_selected=False, order=1)
                    Decision.objects.filter(pk=decision.pk).update(created_at=created_at, updated_at=created_at)
                    if previous is not None:
                        DecisionEdge.objects.create(
                            from_decision=previous,
                            to_decision=decision,
                            created_by=owner,
                            edge_type=DecisionEdge.EdgeType.FOLLOW_UP,
                        )
                    previous = decision
                    created_decisions += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Ready: {created_projects} new project(s), {created_decisions} decision(s)."
            )
        )
