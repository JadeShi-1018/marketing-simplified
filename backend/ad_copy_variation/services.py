from .aistudio_client import call_aistudio_json
from .url_fetcher import fetch_url_text
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
    return call_aistudio_json(SYSTEM_PROMPT, _build_user_prompt(template, instruction))


def generate_from_custom(base_copy: dict, instruction: str = '') -> dict:
    return call_aistudio_json(SYSTEM_PROMPT, _build_user_prompt(base_copy, instruction))


EXTERNAL_URL_PROMPT_PREFIX = (
    "Below is the rendered text content of a public ad page. "
    "First identify the ad copy fields hidden in this text (the page may contain "
    "navigation, ad delivery metadata, advertiser info, and unrelated content; "
    "the ad copy itself is the main creative text — typically a short hook line, "
    "a headline, a body paragraph, and a call-to-action button label). "
    "Then produce a NEW VARIATION of that ad copy following the user's instruction.\n\n"
    "Page text:\n---\n{page_text}\n---\n\n"
    "Instruction: {instruction}\n\n"
    "Return strict JSON with keys: hook, headline, description, cta. "
    "Each value must be the NEW variation, not the extracted source."
)


def generate_from_external_url(url: str, instruction: str = '') -> dict:
    page_text = fetch_url_text(url)
    focus = instruction.strip() or "Rewrite all four fields with fresh phrasing while preserving the offer style and CTA."
    user_prompt = EXTERNAL_URL_PROMPT_PREFIX.format(
        page_text=page_text,
        instruction=focus,
    )
    return call_aistudio_json(SYSTEM_PROMPT, user_prompt)
