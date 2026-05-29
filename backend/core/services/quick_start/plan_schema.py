"""JSON shape hint for Quick Start stage-1 CampaignPlan."""

CAMPAIGN_PLAN_JSON_SCHEMA_HINT = """
Return a single JSON object (CampaignPlan v1):
{
  "version": 1,
  "campaign_summary": "2-4 sentences tying user facts to the campaign (required)",
  "project": {
    "name": "concise project name from user context (required)",
    "description": "1-2 sentences (required)",
    "objectives": ["awareness"|"consideration"|"conversion"|"retention_loyalty"],
    "project_type": ["paid_social"|"paid_search"|"programmatic"|"influencer_ugc"|"cross_channel"|"performance"|"brand_campaigns"|"app_acquisition"],
    "advertising_platforms": ["meta"|"google_ads"|"tiktok"|"linkedin"|"snapchat"|"twitter"|"pinterest"|"programmatic_dsp"|"reddit"|"other"]
  },
  "tasks_plan": [
    {
      "summary": "specific task title rooted in user context (required)",
      "intent": "what this task accomplishes (required)",
      "type": "budget|asset|retrospective|report|execution|scaling|alert|experiment|optimization|communication|platform_policy_update",
      "priority": "HIGHEST|HIGH|MEDIUM|LOW|LOWEST",
      "timing_hint": "e.g. week 1, pre-launch, mid-flight"
    }
  ],
  "spreadsheet_plan": {
    "name": "spreadsheet name (required)",
    "sheet_name": "sheet tab name (required)",
    "columns": ["column headers aligned to user KPIs/budget (min 3)"],
    "row_themes": ["describe each sample row, e.g. Meta prospecting daily spend"]
  },
  "calendar_plan": [
    {
      "title": "milestone title from user timeline (required)",
      "description": "optional",
      "timing_hint": "when in the campaign (required)",
      "duration_hint": "e.g. 1h meeting, all-day"
    }
  ],
  "decisions_plan": [
    {
      "title": "decision to make (required)",
      "description": "context and options to consider (required)"
    }
  ],
  "miro_plan": {
    "board_name": "board name (required if miro enabled)",
    "sticky_themes": ["theme for each sticky note, min 2 if miro enabled"]
  }
}
Only include tasks_plan / calendar_plan / decisions_plan / miro_plan sections for modules the user enabled.
""".strip()
