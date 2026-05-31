"""Campaign brief extraction for Quick Start prompts."""

from freezegun import freeze_time

from core.services.quick_start.brief import build_campaign_brief


@freeze_time('2026-05-22T12:00:00Z')
def test_build_campaign_brief_extracts_hints():
    brief = build_campaign_brief(
        prompt='US Meta Q2 campaign, $30k/month for 8 weeks, awareness focus',
        supplement='Retargeting starts week 4. KPI: CPA under $40.',
        chips={'channels': ['meta'], 'objectives': ['awareness']},
        locale='en',
    )

    assert brief['today'] == '2026-05-22'
    assert 'meta' in brief['channels']
    assert brief['budget_hint'] is not None
    assert '8 weeks' in (brief['duration_hint'] or '')
    assert 'US Meta' in brief['narrative']
