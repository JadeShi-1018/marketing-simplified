"""JSON shape hints for LLM prompts (ProjectBlueprint v1)."""

BLUEPRINT_JSON_SCHEMA_HINT = """
Return a single JSON object with this shape:
{
  "version": 1,
  "project": {
    "name": "string (required)",
    "description": "string (optional)",
    "objectives": ["awareness"|"consideration"|"conversion"|"retention_loyalty"],
    "project_type": ["paid_social"|"paid_search"|"programmatic"|"influencer_ugc"|"cross_channel"|"performance"|"brand_campaigns"|"app_acquisition"],
    "advertising_platforms": ["meta"|"google_ads"|"tiktok"|"linkedin"|"snapchat"|"twitter"|"pinterest"|"programmatic_dsp"|"reddit"|"other"]
  },
  "tasks": [
    {
      "summary": "string (required, max 255)",
      "description": "string (optional)",
      "type": "budget|asset|retrospective|report|execution|scaling|alert|experiment|optimization|communication|platform_policy_update",
      "priority": "HIGHEST|HIGH|MEDIUM|LOW|LOWEST",
      "due_date": "YYYY-MM-DD on or after today (optional)",
      "planned_start_date": "YYYY-MM-DD on or after today (optional)"
    }
  ],
  "spreadsheets": [
    {
      "name": "string (required)",
      "sheets": [
        {
          "name": "string (required)",
          "columns": [{"name": "string", "position": 0}],
          "rows": [["cell values matching column order"]]
        }
      ]
    }
  ],
  "calendar_events": [
    {
      "title": "string (required)",
      "description": "string (optional)",
      "start_datetime": "ISO-8601 datetime on or after today (required)",
      "end_datetime": "ISO-8601 datetime after start (required)",
      "timezone": "UTC",
      "is_all_day": false
    }
  ],
  "decisions": [
    {
      "title": "string (required)",
      "description": "string (optional)"
    }
  ],
  "miro_boards": [
    {
      "name": "string (required)",
      "sticky_notes": [
        {
          "content": "string (required)",
          "x": 80,
          "y": 80,
          "width": 200,
          "height": 120
        }
      ]
    }
  ]
}
""".strip()
