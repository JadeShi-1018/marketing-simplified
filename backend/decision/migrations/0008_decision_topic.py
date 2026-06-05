import re

from django.db import migrations, models


def infer_topic(title, fallback="other"):
    value = (title or "").lower()
    rules = [
        ("tiktok_growth", ("tiktok", "spark ads", "spark", "tik tok")),
        ("google_search", ("google", "google search", "paid search", "search", "keyword", "keywords", "query", "queries")),
        ("meta_retargeting", ("meta", "facebook", "instagram", "retarget", "retargeting")),
        ("email_lifecycle", ("email", "lifecycle", "welcome flow", "abandoned cart", "winback", "post-purchase")),
        ("landing_page_cro", ("landing page", "cro", "checkout", "conversion", "hero section", "bundle page")),
        ("influencer_ugc", ("influencer", "ugc", "creator", "whitelisting", "usage rights")),
    ]
    for topic, terms in rules:
        if any(term in value for term in terms):
            return topic
    for raw_token in re.findall(r"[a-zA-Z][a-zA-Z0-9]*", title or ""):
        token = re.sub(r"\d+$", "", raw_token.lower())
        if len(token) >= 3 and token not in {"and", "for", "new", "test", "the", "with"}:
            return re.sub(r"[^a-z0-9]+", "_", token).strip("_")[:64] or "other"
    return fallback or "other"


def populate_topics(apps, schema_editor):
    Decision = apps.get_model("decision", "Decision")
    for decision in Decision.objects.select_related("project").all():
        fallback = "other"
        project = getattr(decision, "project", None)
        objectives = getattr(project, "objectives", []) if project else []
        if isinstance(objectives, list) and objectives:
            fallback = objectives[0]
        decision.topic = infer_topic(decision.title, fallback)
        decision.save(update_fields=["topic"])


class Migration(migrations.Migration):

    dependencies = [
        ("decision", "0007_decisionedge_edge_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="decision",
            name="topic",
            field=models.CharField(blank=True, default="other", max_length=64),
        ),
        migrations.RunPython(populate_topics, migrations.RunPython.noop),
    ]
