from django.contrib.auth import get_user_model
from django.test import TestCase

from notifications.models import (
    Notification,
    NotificationCategory,
    NotificationEventType,
    UserNotificationPreference,
)
from notifications.services import (
    apply_and_save_notification_preferences,
    coalesce_preferences,
    create_notification,
    create_or_update_chat_notification,
    repair_duplicate_chat_notifications_for_user,
)

User = get_user_model()


class NotificationServiceTests(TestCase):
    def setUp(self):
        self.u1 = User.objects.create_user(username="u1", password="p", email="u1@e.com")

    def test_skips_self_triggered(self):
        n = create_notification(
            recipient_id=self.u1.id,
            actor_id=self.u1.id,
            category=NotificationCategory.SYSTEM,
            event_type=NotificationEventType.SYSTEM,
            title="X",
        )
        self.assertIsNone(n)


class ChatNotificationAggregationTests(TestCase):
    def setUp(self):
        self.recipient = User.objects.create_user(
            username="recipient", password="p", email="recipient@e.com"
        )
        self.sender = User.objects.create_user(
            username="sender", password="p", email="sender@e.com"
        )
        self.chat_id = 42
        self.project_id = 7

    def _create_chat_notification(self, *, is_read: bool, message_count: int = 1):
        return Notification.objects.create(
            recipient=self.recipient,
            actor=self.sender,
            category=NotificationCategory.COLLABORATION,
            event_type=NotificationEventType.CHAT_NEW_MESSAGE,
            related_object_type="chat",
            related_object_id=str(self.chat_id),
            title="New message",
            body="hello",
            is_read=is_read,
            metadata={
                "chat_id": self.chat_id,
                "message_id": 1,
                "project_id": self.project_id,
                "message_count": message_count,
            },
        )

    def test_new_message_after_read_updates_same_card(self):
        first = self._create_chat_notification(is_read=True, message_count=3)
        second = create_or_update_chat_notification(
            recipient_id=self.recipient.id,
            actor_id=self.sender.id,
            chat_id=self.chat_id,
            message_id=99,
            project_id=self.project_id,
            message_preview="follow-up",
        )
        self.assertEqual(second.id, first.id)
        second.refresh_from_db()
        self.assertFalse(second.is_read)
        self.assertEqual(second.metadata["message_count"], 1)
        self.assertEqual(second.metadata["message_id"], 99)
        self.assertEqual(
            Notification.objects.filter(
                recipient=self.recipient,
                event_type=NotificationEventType.CHAT_NEW_MESSAGE,
                related_object_id=str(self.chat_id),
            ).count(),
            1,
        )

    def test_unread_messages_increment_count_on_same_card(self):
        first = create_or_update_chat_notification(
            recipient_id=self.recipient.id,
            actor_id=self.sender.id,
            chat_id=self.chat_id,
            message_id=1,
            project_id=self.project_id,
            message_preview="one",
        )
        second = create_or_update_chat_notification(
            recipient_id=self.recipient.id,
            actor_id=self.sender.id,
            chat_id=self.chat_id,
            message_id=2,
            project_id=self.project_id,
            message_preview="two",
        )
        self.assertEqual(first.id, second.id)
        second.refresh_from_db()
        self.assertEqual(second.metadata["message_count"], 2)
        self.assertFalse(second.is_read)

    def test_repair_removes_duplicate_rows(self):
        self._create_chat_notification(is_read=True, message_count=1)
        self._create_chat_notification(is_read=False, message_count=2)
        self.assertEqual(
            Notification.objects.filter(
                recipient=self.recipient,
                related_object_id=str(self.chat_id),
            ).count(),
            2,
        )
        removed = repair_duplicate_chat_notifications_for_user(self.recipient)
        self.assertEqual(removed, 1)
        self.assertEqual(
            Notification.objects.filter(
                recipient=self.recipient,
                related_object_id=str(self.chat_id),
            ).count(),
            1,
        )


class PreferenceServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="prefuser", password="p", email="pref@e.com")

    def test_apply_creates_record_if_not_exists(self):
        """Test that apply_and_save creates a preference record if none exists."""
        # Ensure no record exists
        UserNotificationPreference.objects.filter(user=self.user).delete()
        self.assertFalse(UserNotificationPreference.objects.filter(user=self.user).exists())

        # Apply a patch
        pref = apply_and_save_notification_preferences(
            self.user,
            {"core_business": {"task_status": {"web": False}}},
        )

        # Record should now exist
        self.assertIsNotNone(pref)
        self.assertTrue(UserNotificationPreference.objects.filter(user=self.user).exists())
        # Value should be saved
        self.assertFalse(pref.preferences["core_business"]["task_status"]["web"])

    def test_apply_updates_existing_record(self):
        """Test that apply_and_save updates an existing preference record."""
        # Create a record first
        pref, _ = UserNotificationPreference.objects.get_or_create(user=self.user)
        original_id = pref.id

        # Apply a patch
        updated_pref = apply_and_save_notification_preferences(
            self.user,
            {"disable_all": True},
        )

        # Should be the same record
        self.assertEqual(updated_pref.id, original_id)
        self.assertTrue(updated_pref.preferences["disable_all"])

    def test_apply_merges_partial_updates(self):
        """Test that partial updates are merged correctly."""
        # Apply first patch
        apply_and_save_notification_preferences(
            self.user,
            {"core_business": {"task_deadline": {"web": False}}},
        )

        # Apply second patch to different row
        pref = apply_and_save_notification_preferences(
            self.user,
            {"core_business": {"task_status": {"email": False}}},
        )

        # Both changes should be preserved
        self.assertFalse(pref.preferences["core_business"]["task_deadline"]["web"])
        self.assertFalse(pref.preferences["core_business"]["task_status"]["email"])
        # Other values should have defaults
        self.assertTrue(pref.preferences["core_business"]["task_deadline"]["email"])
        self.assertTrue(pref.preferences["core_business"]["task_status"]["web"])

    def test_coalesce_handles_none(self):
        """Test that coalesce_preferences handles None input."""
        result = coalesce_preferences(None)
        self.assertIn("disable_all", result)
        self.assertIn("collaboration_assets", result)
        self.assertIn("core_business", result)

    def test_coalesce_handles_empty_dict(self):
        """Test that coalesce_preferences handles empty dict input."""
        result = coalesce_preferences({})
        self.assertIn("disable_all", result)
        self.assertIn("collaboration_assets", result)
        self.assertIn("core_business", result)
