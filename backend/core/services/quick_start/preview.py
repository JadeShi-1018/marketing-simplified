"""Preview orchestration (outline + blueprint, no DB writes)."""

from __future__ import annotations

import logging
from typing import Any, Mapping

from core.services.quick_start.blueprint import normalize_selected_modules
from core.services.quick_start.exceptions import QuickStartValidationError
from core.services.quick_start.llm import QuickStartLLMChain
from core.services.quick_start.outline import build_outline
from core.services.quick_start.validation import (
    validate_combined_input_length,
    validate_prompt_text,
    validate_supplement_text,
)

logger = logging.getLogger(__name__)


class QuickStartPreviewService:
    """Builds read-only preview payloads for the Quick Start wizard."""

    def __init__(self, llm_chain: QuickStartLLMChain | None = None) -> None:
        self.llm_chain = llm_chain or QuickStartLLMChain()

    def generate_preview(
        self,
        *,
        step: int,
        prompt: str,
        supplement: str | None = None,
        chips: Mapping[str, Any] | None = None,
        selected_modules: Mapping[str, bool] | None = None,
        locale: str | None = None,
    ) -> dict[str, Any]:
        """
        Return {step, outline, blueprint} for the frontend preview screen.

        Step 1 may be used for prompt-only validation; blueprint generation runs for step >= 2.
        """
        if step not in (1, 2):
            raise QuickStartValidationError('step must be 1 or 2.')

        cleaned_prompt = validate_prompt_text(prompt)
        cleaned_supplement = validate_supplement_text(supplement)
        validate_combined_input_length(prompt=cleaned_prompt, supplement=cleaned_supplement)
        modules = normalize_selected_modules(selected_modules)

        if step == 1:
            return {
                'step': 1,
                'outline': None,
                'blueprint': None,
            }

        blueprint = self.llm_chain.generate_blueprint(
            prompt=cleaned_prompt,
            supplement=cleaned_supplement,
            chips=chips,
            selected_modules=modules,
            locale=locale,
        )
        outline = build_outline(blueprint, modules)
        return {
            'step': step,
            'outline': outline,
            'blueprint': blueprint,
        }
