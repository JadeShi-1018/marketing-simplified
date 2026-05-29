"""Tests for Quick Start user input length limits."""

import pytest

from core.services.quick_start.constants import (
    MAX_COMBINED_INPUT_LENGTH,
    MAX_PROMPT_LENGTH,
    MAX_SUPPLEMENT_LENGTH,
    MIN_PROMPT_LENGTH,
)
from core.services.quick_start.exceptions import QuickStartValidationError
from core.services.quick_start.validation import (
    validate_combined_input_length,
    validate_prompt_text,
    validate_supplement_text,
)


class TestQuickStartInputLimits:
    def test_accepts_prompt_at_bounds(self):
        prompt = 'x' * MIN_PROMPT_LENGTH
        assert len(validate_prompt_text(prompt)) == MIN_PROMPT_LENGTH
        prompt = 'x' * MAX_PROMPT_LENGTH
        assert len(validate_prompt_text(prompt)) == MAX_PROMPT_LENGTH

    def test_rejects_short_prompt(self):
        with pytest.raises(QuickStartValidationError):
            validate_prompt_text('short')

    def test_rejects_long_prompt(self):
        with pytest.raises(QuickStartValidationError):
            validate_prompt_text('x' * (MAX_PROMPT_LENGTH + 1))

    def test_accepts_empty_supplement(self):
        assert validate_supplement_text(None) is None
        assert validate_supplement_text('   ') is None

    def test_rejects_long_supplement(self):
        with pytest.raises(QuickStartValidationError):
            validate_supplement_text('x' * (MAX_SUPPLEMENT_LENGTH + 1))

    def test_rejects_combined_over_limit(self):
        with pytest.raises(QuickStartValidationError):
            validate_combined_input_length(
                prompt='x' * MAX_PROMPT_LENGTH,
                supplement='y' * (MAX_COMBINED_INPUT_LENGTH - MAX_PROMPT_LENGTH + 1),
            )

    def test_accepts_combined_at_limit(self):
        prompt = 'x' * 3000
        supplement = 'y' * 2000
        validate_combined_input_length(prompt=prompt, supplement=supplement)
