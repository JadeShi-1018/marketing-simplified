"""
Comprehensive tests for MeetingAuditLogViewSet API endpoint covering:
- List endpoint with pagination
- Filtering (event_type, actor_id, date range)
- Pagination controls
- Permission checks
- Error handling
"""

from datetime import datetime, timedelta
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase, force_authenticate

from core.models import Organization, Project, ProjectMember, CustomUser
from meetings.models import Meeting, MeetingTypeDefinition, MeetingAuditLog
from meetings.audit import record_audit_entry


class TestMeetingAuditLogListEndpoint(APITestCase):
    """Test basic list functionality of audit log endpoint."""

    def setUp(self):
        """Create test data: organization, project, meeting, users, audit entries."""
        self.organization = Organization.objects.create(
            name="Test Org",
            slug="test-org"
        )
        self.project = Project.objects.create(
            name="Test Project",
            organization=self.organization
        )
        self.type_def = MeetingTypeDefinition.objects.create(
            project=self.project,
            slug="planning",
            label="Planning Meeting"
        )
        self.meeting = Meeting.objects.create(
            project=self.project,
            title="Test Meeting",
            type_definition=self.type_def,
            objective="Test Objective"
        )

        # Create users
        self.user_a = CustomUser.objects.create_user(
            email="user_a@example.com",
            password="password",
            username="user_a",
            first_name="User",
            last_name="A"
        )
        self.user_b = CustomUser.objects.create_user(
            email="user_b@example.com",
            password="password",
            username="user_b",
            first_name="User",
            last_name="B"
        )

        # Add users to project
        ProjectMember.objects.create(
            user=self.user_a,
            project=self.project,
            is_active=True
        )
        ProjectMember.objects.create(
            user=self.user_b,
            project=self.project,
            is_active=True
        )

        # Create audit log entries
        now = timezone.now()
        self.audit_entries = []

        for i in range(5):
            entry = record_audit_entry(
                meeting=self.meeting,
                actor=self.user_a if i % 2 == 0 else self.user_b,
                event_type=MeetingAuditLog.EVENT_TITLE_CHANGED if i % 2 == 0 else MeetingAuditLog.EVENT_STATUS_CHANGED,
                before={"title": f"Old Title {i}"},
                after={"title": f"New Title {i}"},
                context={"index": i}
            )
            self.audit_entries.append(entry)

    def test_get_audit_log_list(self):
        """Test GET request returns paginated audit log entries."""
        self.client.force_authenticate(user=self.user_a)
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('results', response.data)
        self.assertIn('count', response.data)
        self.assertIn('next', response.data)
        self.assertIn('previous', response.data)

    def test_response_includes_pagination_fields(self):
        """Test response includes count, next, previous, results fields."""
        self.client.force_authenticate(user=self.user_a)
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('count', response.data)
        self.assertIn('next', response.data)
        self.assertIn('previous', response.data)
        self.assertIn('results', response.data)

        # Verify count matches our audit entries
        self.assertEqual(response.data['count'], 5)

    def test_default_pagination_50_per_page(self):
        """Test default pagination is 50 per page."""
        self.client.force_authenticate(user=self.user_a)
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertLessEqual(len(response.data['results']), 50)

    def test_results_contain_properly_serialized_entries(self):
        """Test results contain properly serialized AuditLogEntry objects."""
        self.client.force_authenticate(user=self.user_a)
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreater(len(response.data['results']), 0)

        entry = response.data['results'][0]
        self.assertIn('id', entry)
        self.assertIn('event_type', entry)
        self.assertIn('timestamp', entry)
        self.assertIn('actor', entry)
        self.assertIn('before', entry)
        self.assertIn('after', entry)
        self.assertIn('context', entry)

    def test_ordering_is_by_timestamp_newest_first(self):
        """Test results are ordered by -timestamp (newest first)."""
        self.client.force_authenticate(user=self.user_a)
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data['results']
        self.assertGreater(len(results), 1)

        # Check timestamps are in descending order
        for i in range(len(results) - 1):
            timestamp1 = datetime.fromisoformat(results[i]['timestamp'].replace('Z', '+00:00'))
            timestamp2 = datetime.fromisoformat(results[i + 1]['timestamp'].replace('Z', '+00:00'))
            self.assertGreaterEqual(timestamp1, timestamp2)

    def test_results_are_read_only(self):
        """Test results are read-only (no PATCH/PUT/DELETE allowed)."""
        self.client.force_authenticate(user=self.user_a)
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/"

        # Verify we have entries
        response = self.client.get(url)
        self.assertGreater(len(response.data['results']), 0)
        entry_id = response.data['results'][0]['id']

        # Try PATCH - should fail
        detail_url = f"{url}{entry_id}/"
        response = self.client.patch(detail_url, {"event_type": "meeting.status_changed"})
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

        # Try PUT - should fail
        response = self.client.put(detail_url, {"event_type": "meeting.status_changed"})
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

        # Try DELETE - should fail
        response = self.client.delete(detail_url)
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


class TestMeetingAuditLogFiltering(APITestCase):
    """Test filtering functionality."""

    def setUp(self):
        """Create test data with various event types, actors, and timestamps."""
        self.organization = Organization.objects.create(
            name="Test Org",
            slug="test-org"
        )
        self.project = Project.objects.create(
            name="Test Project",
            organization=self.organization
        )
        self.type_def = MeetingTypeDefinition.objects.create(
            project=self.project,
            slug="planning",
            label="Planning Meeting"
        )
        self.meeting = Meeting.objects.create(
            project=self.project,
            title="Test Meeting",
            type_definition=self.type_def,
            objective="Test Objective"
        )

        self.user_a = CustomUser.objects.create_user(
            email="user_a@example.com",
            password="password",
            username="user_a",
            first_name="User",
            last_name="A"
        )
        self.user_b = CustomUser.objects.create_user(
            email="user_b@example.com",
            password="password",
            username="user_b",
            first_name="User",
            last_name="B"
        )

        ProjectMember.objects.create(
            user=self.user_a,
            project=self.project,
            is_active=True
        )
        ProjectMember.objects.create(
            user=self.user_b,
            project=self.project,
            is_active=True
        )

        # Create audit entries with various event types, actors, and timestamps
        now = timezone.now()

        # Status changed entries
        for i in range(3):
            record_audit_entry(
                meeting=self.meeting,
                actor=self.user_a,
                event_type=MeetingAuditLog.EVENT_STATUS_CHANGED,
                before={"status": "draft"},
                after={"status": "planned"},
                context={"index": i}
            )

        # Title changed entries
        for i in range(2):
            record_audit_entry(
                meeting=self.meeting,
                actor=self.user_b,
                event_type=MeetingAuditLog.EVENT_TITLE_CHANGED,
                before={"title": "Old Title"},
                after={"title": "New Title"},
                context={"index": i}
            )

        # Objective changed entries
        record_audit_entry(
            meeting=self.meeting,
            actor=self.user_a,
            event_type=MeetingAuditLog.EVENT_OBJECTIVE_CHANGED,
            before={"objective": "Old Objective"},
            after={"objective": "New Objective"}
        )

    def test_filter_by_single_event_type(self):
        """Test event_type filter with single value."""
        self.client.force_authenticate(user=self.user_a)
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/?event_type={MeetingAuditLog.EVENT_STATUS_CHANGED}"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 3)

        for entry in response.data['results']:
            self.assertEqual(entry['event_type'], MeetingAuditLog.EVENT_STATUS_CHANGED)

    def test_filter_by_multiple_event_types_or_logic(self):
        """Test event_type filter with multiple values (OR logic)."""
        self.client.force_authenticate(user=self.user_a)
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/?event_type={MeetingAuditLog.EVENT_STATUS_CHANGED}&event_type={MeetingAuditLog.EVENT_TITLE_CHANGED}"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # 3 status + 2 title = 5
        self.assertEqual(response.data['count'], 5)

        event_types = {entry['event_type'] for entry in response.data['results']}
        self.assertEqual(event_types, {MeetingAuditLog.EVENT_STATUS_CHANGED, MeetingAuditLog.EVENT_TITLE_CHANGED})

    def test_invalid_event_type_returns_400(self):
        """Test event_type filter with invalid value returns 400 ValidationError."""
        self.client.force_authenticate(user=self.user_a)
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/?event_type=invalid.type"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('event_type', response.data)

    def test_filter_by_actor_id(self):
        """Test actor_id filter."""
        self.client.force_authenticate(user=self.user_a)
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/?actor_id={self.user_b.id}"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # user_b created 2 title changed entries
        self.assertEqual(response.data['count'], 2)

        for entry in response.data['results']:
            self.assertEqual(entry['actor']['id'], self.user_b.id)

    def test_filter_by_from_date_iso8601(self):
        """Test date range filtering with 'from' parameter (ISO 8601)."""
        self.client.force_authenticate(user=self.user_a)

        # Get all entries first to get timestamps
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/"
        response = self.client.get(url)
        all_entries = response.data['results']
        self.assertGreater(len(all_entries), 0)

        # Use timestamp of the last entry (oldest) as the 'from' date
        oldest_timestamp = all_entries[-1]['timestamp']

        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/?from={oldest_timestamp}"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreater(response.data['count'], 0)

    def test_filter_by_to_date_iso8601(self):
        """Test date range filtering with 'to' parameter (ISO 8601)."""
        self.client.force_authenticate(user=self.user_a)

        # Get all entries first
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/"
        response = self.client.get(url)
        all_entries = response.data['results']
        self.assertGreater(len(all_entries), 0)

        # Use timestamp of the first entry (newest)
        newest_timestamp = all_entries[0]['timestamp']

        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/?to={newest_timestamp}"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreater(response.data['count'], 0)

    def test_filter_by_from_and_to_date(self):
        """Test date range filtering with both 'from' and 'to'."""
        self.client.force_authenticate(user=self.user_a)

        # Get all entries to find timestamp range
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/"
        response = self.client.get(url)
        all_entries = response.data['results']

        # Use first (newest) and last (oldest) timestamps
        from_timestamp = all_entries[-1]['timestamp']  # oldest
        to_timestamp = all_entries[0]['timestamp']     # newest

        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/?from={from_timestamp}&to={to_timestamp}"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreater(response.data['count'], 0)

    def test_from_parameter_invalid_iso8601_format_returns_400(self):
        """Test 'from' parameter with invalid ISO 8601 format returns 400."""
        self.client.force_authenticate(user=self.user_a)
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/?from=invalid-date"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('from', response.data)

    def test_to_parameter_invalid_iso8601_format_returns_400(self):
        """Test 'to' parameter with invalid ISO 8601 format returns 400."""
        self.client.force_authenticate(user=self.user_a)
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/?to=bad-date"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('to', response.data)

    def test_combined_filters_event_type_actor_date_range(self):
        """Test combined filters (event_type + actor_id + date range)."""
        self.client.force_authenticate(user=self.user_a)

        # Get a timestamp to use for filtering
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/"
        response = self.client.get(url)
        all_entries = response.data['results']
        from_timestamp = all_entries[-1]['timestamp']

        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/?event_type={MeetingAuditLog.EVENT_TITLE_CHANGED}&actor_id={self.user_b.id}&from={from_timestamp}"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreater(response.data['count'], 0)

        for entry in response.data['results']:
            self.assertEqual(entry['event_type'], MeetingAuditLog.EVENT_TITLE_CHANGED)
            self.assertEqual(entry['actor']['id'], self.user_b.id)


class TestMeetingAuditLogPagination(APITestCase):
    """Test pagination controls."""

    def setUp(self):
        """Create test data with many audit entries."""
        self.organization = Organization.objects.create(
            name="Test Org",
            slug="test-org"
        )
        self.project = Project.objects.create(
            name="Test Project",
            organization=self.organization
        )
        self.type_def = MeetingTypeDefinition.objects.create(
            project=self.project,
            slug="planning",
            label="Planning Meeting"
        )
        self.meeting = Meeting.objects.create(
            project=self.project,
            title="Test Meeting",
            type_definition=self.type_def,
            objective="Test Objective"
        )

        self.user = CustomUser.objects.create_user(
            email="user@example.com",
            password="password",
            username="user"
        )

        ProjectMember.objects.create(
            user=self.user,
            project=self.project,
            is_active=True
        )

        # Create 100 audit entries
        for i in range(100):
            record_audit_entry(
                meeting=self.meeting,
                actor=self.user,
                event_type=MeetingAuditLog.EVENT_TITLE_CHANGED,
                before={"title": f"Old {i}"},
                after={"title": f"New {i}"},
                context={"index": i}
            )

    def test_page_size_parameter_25(self):
        """Test page_size parameter (GET ?page_size=25)."""
        self.client.force_authenticate(user=self.user)
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/?page_size=25"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 25)

    def test_page_size_parameter_max_value_200(self):
        """Test page_size parameter with max value (200)."""
        self.client.force_authenticate(user=self.user)
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/?page_size=200"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # We only have 100 entries, so should return all
        self.assertEqual(len(response.data['results']), 100)

    def test_page_size_exceeds_max_returns_max(self):
        """Test page_size exceeds max returns max (200, not the requested higher value)."""
        self.client.force_authenticate(user=self.user)
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/?page_size=500"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should be capped at max_page_size=200, but we only have 100
        self.assertEqual(len(response.data['results']), 100)

    def test_page_parameter_different_pages(self):
        """Test page parameter for different pages (GET ?page=2)."""
        self.client.force_authenticate(user=self.user)

        # Get first page (default 50 per page)
        url1 = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/?page=1"
        response1 = self.client.get(url1)
        self.assertEqual(response1.status_code, status.HTTP_200_OK)
        page1_ids = {entry['id'] for entry in response1.data['results']}

        # Get second page
        url2 = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/?page=2"
        response2 = self.client.get(url2)
        self.assertEqual(response2.status_code, status.HTTP_200_OK)
        page2_ids = {entry['id'] for entry in response2.data['results']}

        # Pages should have different entries
        self.assertEqual(len(page1_ids & page2_ids), 0)

    def test_page_parameter_beyond_range_returns_empty(self):
        """Test page parameter beyond range returns empty results."""
        self.client.force_authenticate(user=self.user)
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/?page=999"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 0)

    def test_response_includes_next_previous_links(self):
        """Test response includes next/previous links when available."""
        self.client.force_authenticate(user=self.user)

        # Get first page
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/?page=1"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Should have next link since we have more than 50 entries
        self.assertIsNotNone(response.data['next'])
        self.assertIsNone(response.data['previous'])

        # Get second page
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/?page=2"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Should have both next and previous links
        self.assertIsNotNone(response.data['previous'])


class TestMeetingAuditLogPermissions(APITestCase):
    """Test access control."""

    def setUp(self):
        """Create test data with multiple projects and users."""
        self.organization = Organization.objects.create(
            name="Test Org",
            slug="test-org"
        )
        self.project = Project.objects.create(
            name="Test Project",
            organization=self.organization
        )
        self.other_project = Project.objects.create(
            name="Other Project",
            organization=self.organization
        )

        self.type_def = MeetingTypeDefinition.objects.create(
            project=self.project,
            slug="planning",
            label="Planning Meeting"
        )
        self.meeting = Meeting.objects.create(
            project=self.project,
            title="Test Meeting",
            type_definition=self.type_def,
            objective="Test Objective"
        )

        self.user_in_project = CustomUser.objects.create_user(
            email="user_in@example.com",
            password="password",
            username="user_in"
        )
        self.user_not_in_project = CustomUser.objects.create_user(
            email="user_out@example.com",
            password="password",
            username="user_out"
        )

        ProjectMember.objects.create(
            user=self.user_in_project,
            project=self.project,
            is_active=True
        )
        ProjectMember.objects.create(
            user=self.user_not_in_project,
            project=self.other_project,
            is_active=True
        )

        # Create audit entries
        record_audit_entry(
            meeting=self.meeting,
            actor=self.user_in_project,
            event_type=MeetingAuditLog.EVENT_TITLE_CHANGED,
            before={"title": "Old Title"},
            after={"title": "New Title"}
        )

    def test_unauthenticated_request_returns_401(self):
        """Test unauthenticated request returns 401 Unauthorized."""
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_user_not_in_project_returns_403(self):
        """Test authenticated user not in project returns 403 Forbidden."""
        self.client.force_authenticate(user=self.user_not_in_project)
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_authenticated_user_in_project_returns_200(self):
        """Test authenticated user in project returns 200 OK."""
        self.client.force_authenticate(user=self.user_in_project)
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('results', response.data)

    def test_project_member_with_correct_permissions_can_view(self):
        """Test project member with correct permissions can view audit log."""
        self.client.force_authenticate(user=self.user_in_project)
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)


class TestMeetingAuditLogErrorHandling(APITestCase):
    """Test error conditions."""

    def setUp(self):
        """Create test data."""
        self.organization = Organization.objects.create(
            name="Test Org",
            slug="test-org"
        )
        self.project = Project.objects.create(
            name="Test Project",
            organization=self.organization
        )
        self.other_project = Project.objects.create(
            name="Other Project",
            organization=self.organization
        )

        self.type_def = MeetingTypeDefinition.objects.create(
            project=self.project,
            slug="planning",
            label="Planning Meeting"
        )
        self.other_type_def = MeetingTypeDefinition.objects.create(
            project=self.other_project,
            slug="planning",
            label="Planning Meeting"
        )

        self.meeting = Meeting.objects.create(
            project=self.project,
            title="Test Meeting",
            type_definition=self.type_def,
            objective="Test Objective"
        )
        self.other_meeting = Meeting.objects.create(
            project=self.other_project,
            title="Other Meeting",
            type_definition=self.other_type_def,
            objective="Other Objective"
        )

        self.user = CustomUser.objects.create_user(
            email="user@example.com",
            password="password",
            username="user"
        )

        ProjectMember.objects.create(
            user=self.user,
            project=self.project,
            is_active=True
        )
        ProjectMember.objects.create(
            user=self.user,
            project=self.other_project,
            is_active=True
        )

    def test_invalid_project_id_returns_404(self):
        """Test invalid project_id returns 404."""
        self.client.force_authenticate(user=self.user)
        url = f"/api/projects/99999/meetings/{self.meeting.slug}/audit-log/"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_invalid_meeting_id_returns_404(self):
        """Test invalid meeting_id returns 404."""
        self.client.force_authenticate(user=self.user)
        url = f"/api/projects/{self.project.slug}/meetings/99999/audit-log/"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_meeting_from_different_project_returns_404(self):
        """Test meeting from different project returns 404 (security check)."""
        self.client.force_authenticate(user=self.user)
        # Try to access meeting from other_project using project.id URL
        url = f"/api/projects/{self.project.slug}/meetings/{self.other_meeting.slug}/audit-log/"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_missing_query_parameters_dont_cause_errors(self):
        """Test missing query parameters don't cause errors (all optional)."""
        self.client.force_authenticate(user=self.user)
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_response_includes_error_detail_for_400(self):
        """Test response includes error detail for 400 errors."""
        self.client.force_authenticate(user=self.user)
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/?from=invalid-date"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(len(response.data) > 0)

    def test_response_includes_error_detail_for_403(self):
        """Test response includes error detail for 403 errors."""
        user_not_in_project = CustomUser.objects.create_user(
            email="user_not_in@example.com",
            password="password",
            username="user_not_in"
        )

        self.client.force_authenticate(user=user_not_in_project)
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/audit-log/"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(len(response.data) > 0)

    def test_response_includes_error_detail_for_404(self):
        """Test response includes error detail for 404 errors."""
        self.client.force_authenticate(user=self.user)
        url = f"/api/projects/99999/meetings/{self.meeting.slug}/audit-log/"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(len(response.data) > 0)
