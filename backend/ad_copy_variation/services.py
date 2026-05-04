from agent.gemini_client import call_gemini_json
from meta_ads.models import MetaAdCreative


SYSTEM_PROMPT = (
    "You are an expert paid-media copywriter. Given an existing ad copy as a "
    "template, produce a NEW variation following the user's instructions. "
    "Keep the same advertising voice, target outcome, and call-to-action style "
    "unless the instruction says otherwise. "
    "Return strict JSON with keys: hook, headline, description, cta."
)


def _build_user_prompt(template: dict, instruction: str) -> str:
    focus = instruction.strip() or "Rewrite all four fields with fresh phrasing while preserving the offer and CTA."
    return (
        f"Template ad copy:\n"
        f"- Hook: {template.get('hook', '')}\n"
        f"- Headline: {template.get('headline', '')}\n"
        f"- Description: {template.get('description', '')}\n"
        f"- CTA: {template.get('cta', '')}\n\n"
        f"Instruction: {focus}\n\n"
        f"Return JSON: {{\"hook\": \"...\", \"headline\": \"...\", \"description\": \"...\", \"cta\": \"...\"}}"
    )


def _creative_to_template(creative: MetaAdCreative) -> dict:
    body = creative.body or ''
    hook = body.split('\n', 1)[0] if body else ''
    return {
        'hook': hook,
        'headline': creative.title or '',
        'description': body,
        'cta': creative.call_to_action_type or '',
    }


def generate_from_existing(creative_id: int, instruction: str = '') -> dict:
    creative = MetaAdCreative.objects.get(pk=creative_id)
    template = _creative_to_template(creative)
    return call_gemini_json(SYSTEM_PROMPT, _build_user_prompt(template, instruction))


def generate_from_custom(base_copy: dict, instruction: str = '') -> dict:
    return call_gemini_json(SYSTEM_PROMPT, _build_user_prompt(base_copy, instruction))
