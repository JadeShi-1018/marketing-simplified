"""
MED-249: recurring-event edits must honor the chosen scope.

Covers all three scopes (this / this-and-future / all) plus the split boundary
(off-by-one) behavior. Lives in its own module (discovered by pytest's
test_*.py rule) alongside the existing calendars/tests.py.
"""
from rest_framework import status
from rest_framework.test import force_authenticate

from calendars.models import (
    Event,
    EventAttendee,
    EventReminder,
    RecurrenceException,
)
from calendars.tests import CalendarTestBase
from calendars.views import (
    EventViewSet,
    EventInstancesView,
    EventInstanceModifyView,
    EventInstanceModifyFutureView,
)


class RecurringScopeEditTests(CalendarTestBase):
    SERIES_START = "2026-01-15T09:00:00Z"

    def _create_recurring_event(self, count=None, until=None) -> Event:
        view = EventViewSet.as_view({"post": "create"})
        recurrence = {"frequency": "DAILY", "interval": 1}
        if count is not None:
            recurrence["count"] = count
        if until is not None:
            recurrence["until"] = until
        payload = {
            "calendar_id": str(self.calendar.id),
            "title": "Daily Standup",
            "description": "Original",
            "start_datetime": self.SERIES_START,
            "end_datetime": "2026-01-15T10:00:00Z",
            "timezone": "UTC",
            "is_all_day": False,
            "status": "confirmed",
            "event_type": "default",
            "is_recurring": True,
            "recurrence": recurrence,
        }
        request = self.factory.post("/api/v1/events/", payload, format="json")
        force_authenticate(request, user=self.user)
        response = view(request)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        return Event.objects.get(id=response.data["id"])

    def _instances(self, event_id, time_min, time_max):
        view = EventInstancesView.as_view()
        request = self.factory.get(
            f"/api/v1/events/{event_id}/instances/",
            {"time_min": time_min, "time_max": time_max, "max_results": 50},
        )
        force_authenticate(request, user=self.user)
        response = view(request, event_id=event_id)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data

    def _titles_by_start(self, instances):
        return {item["start_datetime"]: item["title"] for item in instances}

    def _modify_instance(self, event, original_start, title):
        view = EventInstanceModifyView.as_view()
        request = self.factory.patch(
            f"/api/v1/events/{event.id}/instances/modify/",
            {"title": title},
            format="json",
        )
        request.META["QUERY_STRING"] = f"original_start={original_start}"
        force_authenticate(request, user=self.user)
        return view(request, event_id=event.id)

    def _split_future(self, event, original_start, title):
        view = EventInstanceModifyFutureView.as_view()
        request = self.factory.post(
            f"/api/v1/events/{event.id}/instances/modify-future/",
            {"title": title},
            format="json",
        )
        request.META["QUERY_STRING"] = f"original_start={original_start}"
        force_authenticate(request, user=self.user)
        return view(request, event_id=event.id)

    # --- Scope: this only --------------------------------------------------
    def test_this_only_leaves_other_occurrences_and_master_intact(self):
        event = self._create_recurring_event()
        target = "2026-01-16T09:00:00Z"

        resp = self._modify_instance(event, target, "Only This Day")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        titles = self._titles_by_start(
            self._instances(event.id, "2026-01-15T00:00:00Z", "2026-01-19T00:00:00Z")
        )
        self.assertEqual(titles.get(target), "Only This Day")
        self.assertEqual(titles.get("2026-01-15T09:00:00Z"), "Daily Standup")
        self.assertEqual(titles.get("2026-01-17T09:00:00Z"), "Daily Standup")

        event.refresh_from_db()
        self.assertEqual(event.title, "Daily Standup")
        self.assertTrue(event.is_recurring)
        self.assertIsNone(event.recurrence_rule.until)

        exc = RecurrenceException.objects.get(original_event=event)
        self.assertFalse(exc.modified_event.is_recurring)
        self.assertIsNone(exc.modified_event.recurrence_rule_id)

    # --- Scope: this and future -------------------------------------------
    def test_future_split_caps_master_and_creates_new_series(self):
        event = self._create_recurring_event()

        EventAttendee.objects.create(
            organization=self.organization,
            event=event,
            email="guest@example.com",
        )
        EventReminder.objects.create(
            organization=self.organization,
            event=event,
            minutes_before=10,
        )

        split_point = "2026-01-18T09:00:00Z"
        resp = self._split_future(event, split_point, "New Standup")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        new_event_id = resp.data["id"]
        self.assertNotEqual(str(new_event_id), str(event.id))
        new_event = Event.objects.get(id=new_event_id)
        self.assertTrue(new_event.is_recurring)
        self.assertNotEqual(new_event.recurrence_rule_id, event.recurrence_rule_id)
        self.assertEqual(new_event.metadata.get("split_from"), str(event.id))

        event.refresh_from_db()
        self.assertEqual(
            event.recurrence_rule.until.isoformat().replace("+00:00", "Z"),
            split_point,
        )

        master_titles = self._titles_by_start(
            self._instances(event.id, "2026-01-15T00:00:00Z", "2026-01-25T00:00:00Z")
        )
        self.assertIn("2026-01-15T09:00:00Z", master_titles)
        self.assertIn("2026-01-17T09:00:00Z", master_titles)
        self.assertNotIn(split_point, master_titles)
        self.assertTrue(all(t == "Daily Standup" for t in master_titles.values()))

        new_titles = self._titles_by_start(
            self._instances(new_event_id, "2026-01-15T00:00:00Z", "2026-01-25T00:00:00Z")
        )
        self.assertIn(split_point, new_titles)
        self.assertNotIn("2026-01-17T09:00:00Z", new_titles)
        self.assertTrue(all(t == "New Standup" for t in new_titles.values()))

        self.assertEqual(
            EventAttendee.objects.filter(event=new_event, is_deleted=False).count(), 1
        )
        self.assertEqual(
            EventReminder.objects.filter(event=new_event, is_deleted=False).count(), 1
        )

    def test_future_split_repoints_future_exceptions(self):
        event = self._create_recurring_event()
        rule = event.recurrence_rule

        after_split = "2026-01-20T09:00:00Z"
        self.assertEqual(
            self._modify_instance(event, after_split, "Pre-existing Override").status_code,
            status.HTTP_200_OK,
        )

        split_point = "2026-01-18T09:00:00Z"
        resp = self._split_future(event, split_point, "New Standup")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        new_event = Event.objects.get(id=resp.data["id"])

        exc = RecurrenceException.objects.get(exception_date=after_split)
        self.assertEqual(exc.original_event_id, new_event.id)
        self.assertEqual(exc.recurrence_rule_id, new_event.recurrence_rule_id)
        self.assertFalse(
            RecurrenceException.objects.filter(
                recurrence_rule=rule, exception_date=after_split
            ).exists()
        )

    def test_future_split_recomputes_count_for_bounded_series(self):
        event = self._create_recurring_event(count=10)
        split_point = "2026-01-18T09:00:00Z"  # series start + 3 days

        resp = self._split_future(event, split_point, "New Standup")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        event.refresh_from_db()
        self.assertEqual(event.recurrence_rule.count, 3)
        self.assertIsNone(event.recurrence_rule.until)
        new_event = Event.objects.get(id=resp.data["id"])
        self.assertEqual(new_event.recurrence_rule.count, 7)

    # --- Scope: all --------------------------------------------------------
    def test_all_scope_updates_entire_series(self):
        event = self._create_recurring_event()

        update_view = EventViewSet.as_view({"patch": "partial_update"})
        req = self.factory.patch(
            f"/api/v1/events/{event.id}/",
            {"title": "Renamed Series"},
            format="json",
        )
        force_authenticate(req, user=self.user)
        resp = update_view(req, pk=str(event.id))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        event.refresh_from_db()
        self.assertEqual(event.title, "Renamed Series")

        titles = self._titles_by_start(
            self._instances(event.id, "2026-01-15T00:00:00Z", "2026-01-19T00:00:00Z")
        )
        self.assertTrue(titles)
        self.assertTrue(all(t == "Renamed Series" for t in titles.values()))

    # --- Boundary / off-by-one --------------------------------------------
    def test_split_boundary_occurrence_belongs_to_new_series(self):
        event = self._create_recurring_event()
        split_point = "2026-01-17T09:00:00Z"

        resp = self._split_future(event, split_point, "New Standup")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        new_event_id = resp.data["id"]

        master_starts = set(
            self._titles_by_start(
                self._instances(event.id, "2026-01-15T00:00:00Z", "2026-01-25T00:00:00Z")
            ).keys()
        )
        new_starts = set(
            self._titles_by_start(
                self._instances(
                    new_event_id, "2026-01-15T00:00:00Z", "2026-01-25T00:00:00Z"
                )
            ).keys()
        )
        self.assertNotIn(split_point, master_starts)
        self.assertIn(split_point, new_starts)
        self.assertEqual(master_starts & new_starts, set())
