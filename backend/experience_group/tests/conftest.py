"""Experience group test fixtures."""

import pytest

from csm.models import TicketForm
from csm.services import ensure_system_fields


@pytest.fixture
def experience_group(project):
    from experience_group.models import ExperienceGroup
    return ExperienceGroup.objects.create(project=project, name='VIP Support')


@pytest.fixture
def default_form(project, user):
    form = TicketForm.objects.create(
        project=project, name='Default', is_default=True, created_by=user,
    )
    ensure_system_fields(form)
    return form


@pytest.fixture
def eg_specific_form(project, user):
    form = TicketForm.objects.create(project=project, name='VIP Form', created_by=user)
    ensure_system_fields(form)
    return form
