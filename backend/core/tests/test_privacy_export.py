import zipfile

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from chat.models import Chat, ChatParticipant, ChatType
from core.models import DataExportRequest, ProjectMember
from core.services.privacy_export import assemble_data_export_zip, build_personal_data_payload
from decision.models import Decision
from meetings.models import Meeting, MeetingTypeDefinition, ParticipantLink
from task.models import Task


@pytest.mark.django_db
def test_personal_data_export_includes_user_rows_across_apps(user, project):
    ProjectMember.objects.get_or_create(user=user, project=project, defaults={"role": "owner"})
    task = Task.objects.create(
        summary="GDPR export task",
        project=project,
        owner=user,
        current_approver=user,
        created_by=user,
        type="execution",
    )
    chat = Chat.objects.create(project=project, type=ChatType.GROUP, name="GDPR Chat", created_by=user)
    ChatParticipant.objects.create(chat=chat, user=user)
    Decision.objects.create(project=project, title="GDPR Decision", author=user, project_seq=1)
    meeting_type = MeetingTypeDefinition.objects.create(project=project, slug="sync", label="Sync")
    meeting = Meeting.objects.create(
        project=project,
        type_definition=meeting_type,
        title="GDPR Meeting",
        objective="Review export scope",
    )
    ParticipantLink.objects.create(meeting=meeting, user=user, role="Owner")

    payload = build_personal_data_payload(user)
    sections = payload["sections"]

    assert "core.customuser" in sections
    assert "core.projectmember" in sections
    assert any(row["id"] == task.id for row in sections["task.task"]["rows"])
    assert any(row["id"] == chat.id for row in sections["chat.chat"]["rows"])
    assert "chat.chatparticipant" in sections
    assert "decision.decision" in sections
    assert "meetings.participantlink" in sections
    assert payload["manifest"]["section_count"] >= 6


@pytest.mark.django_db
def test_data_export_zip_and_signed_download_expire_after_24_hours(user):
    client = APIClient()
    export_request = DataExportRequest.objects.create(user=user)
    assemble_data_export_zip(export_request)

    export_request.refresh_from_db()
    assert export_request.status == DataExportRequest.Status.READY
    assert export_request.expires_at is not None
    assert 23.9 <= (export_request.expires_at - timezone.now()).total_seconds() / 3600 <= 24.1

    with zipfile.ZipFile(export_request.file.path) as archive:
        assert "manifest.json" in archive.namelist()
        assert "account.json" in archive.namelist()

    client.force_authenticate(user=user)
    detail_url = reverse("privacy-export-detail", kwargs={"export_id": export_request.id})
    detail_response = client.get(detail_url)
    assert detail_response.status_code == 200
    assert detail_response.data["download_url"]

    download_response = client.get(detail_response.data["download_url"])
    assert download_response.status_code == 200

    replay_response = client.get(detail_response.data["download_url"])
    assert replay_response.status_code == 403

    detail_response = client.get(detail_url)
    export_request.expires_at = timezone.now() - timezone.timedelta(seconds=1)
    export_request.save(update_fields=["expires_at", "updated_at"])
    expired_response = client.get(detail_response.data["download_url"])
    assert expired_response.status_code == 403


@pytest.mark.django_db
def test_data_export_zip_can_be_generated_as_csv(user):
    export_request = DataExportRequest.objects.create(
        user=user,
        export_format=DataExportRequest.ExportFormat.CSV,
    )
    assemble_data_export_zip(export_request)

    export_request.refresh_from_db()
    assert export_request.status == DataExportRequest.Status.READY
    assert export_request.metadata["export_format"] == "csv"

    with zipfile.ZipFile(export_request.file.path) as archive:
        names = archive.namelist()
        assert "manifest.csv" in names
        assert "account.csv" in names
        assert "manifest.json" not in names
        assert any(name.endswith(".csv") for name in names)
