"""
Quick Start — AI-guided new project creation (independent of Agent workflows).

Public surface for other core modules; implementation is filled in across qs-1.2+.
"""

from core.services.quick_start.config import QuickStartConfig, get_quick_start_config
from core.services.quick_start.confirm import QuickStartConfirmService
from core.services.quick_start.exceptions import (
    QuickStartConfigurationError,
    QuickStartError,
    QuickStartLLMError,
    QuickStartValidationError,
)
from core.services.quick_start.llm import QuickStartLLMChain
from core.services.quick_start.preview import QuickStartPreviewService
from core.services.quick_start.seeder import (
    ProjectSeedResult,
    QuickStartProjectSeeder,
)
from core.services.quick_start.validation import validate_and_normalize_blueprint, validate_prompt_text

__all__ = [
    'QuickStartConfig',
    'get_quick_start_config',
    'QuickStartConfirmService',
    'QuickStartConfigurationError',
    'QuickStartError',
    'QuickStartLLMError',
    'QuickStartValidationError',
    'QuickStartLLMChain',
    'QuickStartPreviewService',
    'ProjectSeedResult',
    'QuickStartProjectSeeder',
    'validate_and_normalize_blueprint',
    'validate_prompt_text',
]
