"""Tests for optional-module fallback content."""

from core.services.quick_start.module_defaults import ensure_quick_start_module_minimums
from core.tests.test_quick_start_llm import DEFAULT_MODULES, SAMPLE_LLM_PAYLOAD


def test_fills_decisions_when_enabled_but_empty():
    modules = {**DEFAULT_MODULES, 'decisions': True}
    blueprint = ensure_quick_start_module_minimums(
        {**SAMPLE_LLM_PAYLOAD, 'decisions': []},
        modules,
    )
    assert len(blueprint['decisions']) >= 2


def test_fills_miro_sticky_notes_when_enabled_but_empty():
    modules = {**DEFAULT_MODULES, 'miro': True}
    blueprint = ensure_quick_start_module_minimums(
        {**SAMPLE_LLM_PAYLOAD, 'miro_boards': []},
        modules,
    )
    assert len(blueprint['miro_boards']) == 1
    assert len(blueprint['miro_boards'][0]['sticky_notes']) >= 2


def test_skips_fill_when_modules_disabled():
    blueprint = ensure_quick_start_module_minimums(SAMPLE_LLM_PAYLOAD, DEFAULT_MODULES)
    assert blueprint['decisions'] == []
    assert blueprint['miro_boards'] == []
