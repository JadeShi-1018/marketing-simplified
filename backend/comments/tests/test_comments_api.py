from django.utils import timezone
from rest_framework import status

from comments.tests.factories import CommentTestBase, rich_text
from comments.models import Comment, CommentMention


class CommentAPITest(CommentTestBase):
    """Security and consistency coverage for the reusable comments API."""

    def test_active_project_member_can_list_task_comments(self):
        comment = self.create_comment()
        self.client.force_authenticate(user=self.member)

        response = self.client.get(
            self.comments_url(),
            {"entity_type": "task", "entity_id": self.task.id},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([row["id"] for row in response.data], [str(comment.id)])

    def test_list_returns_newest_comments_first(self):
        older_comment = self.create_comment(body_text="older")
        newer_comment = self.create_comment(body_text="newer")
        Comment.objects.filter(id=older_comment.id).update(
            created_at=timezone.now() - timezone.timedelta(minutes=5)
        )
        Comment.objects.filter(id=newer_comment.id).update(created_at=timezone.now())
        self.client.force_authenticate(user=self.member)

        response = self.client.get(
            self.comments_url(),
            {"entity_type": "task", "entity_id": self.task.id},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [row["id"] for row in response.data],
            [str(newer_comment.id), str(older_comment.id)],
        )

    def test_current_approver_can_list_task_comments(self):
        self.create_comment()
        self.client.force_authenticate(user=self.approver)

        response = self.client.get(
            self.comments_url(),
            {"entity_type": "task", "entity_id": self.task.id},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def test_unrelated_user_receives_403(self):
        self.create_comment()
        self.client.force_authenticate(user=self.unrelated)

        response = self.client.get(
            self.comments_url(),
            {"entity_type": "task", "entity_id": self.task.id},
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_member_and_current_approver_can_create_comments(self):
        for user in [self.member, self.approver]:
            self.client.force_authenticate(user=user)
            response = self.client.post(
                self.comments_url(),
                {
                    "entity_type": "task",
                    "entity_id": str(self.task.id),
                    "body": rich_text(f"from {user.username}"),
                },
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
            self.assertEqual(response.data["author"]["id"], user.id)
            self.assertFalse(response.data["is_edited"])

    def test_author_can_update_own_comment(self):
        comment = self.create_comment(user=self.author)
        self.client.force_authenticate(user=self.author)

        response = self.client.patch(
            self.detail_url(comment),
            {"body": rich_text("edited"), "mentions": [self.member.id]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["body_text"], "edited")
        self.assertTrue(response.data["is_edited"])
        self.assertEqual([mention["id"] for mention in response.data["mentions"]], [self.member.id])

    def test_non_author_with_access_cannot_update_or_delete(self):
        comment = self.create_comment(user=self.author)
        self.client.force_authenticate(user=self.member)

        patch_response = self.client.patch(
            self.detail_url(comment),
            {"body": rich_text("not allowed")},
            format="json",
        )
        delete_response = self.client.delete(self.detail_url(comment))

        self.assertEqual(patch_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(delete_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_author_can_soft_delete_and_deleted_comment_disappears(self):
        comment = self.create_comment(user=self.author)
        self.client.force_authenticate(user=self.author)

        delete_response = self.client.delete(self.detail_url(comment))
        list_response = self.client.get(
            self.comments_url(),
            {"entity_type": "task", "entity_id": self.task.id},
        )
        detail_response = self.client.get(self.detail_url(comment))

        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(list_response.data, [])
        self.assertEqual(detail_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(Comment.objects.count(), 0)
        self.assertEqual(Comment.all_objects.deleted().count(), 1)

    def test_invalid_entity_type_returns_400_and_missing_target_returns_404(self):
        self.client.force_authenticate(user=self.author)

        invalid_response = self.client.get(
            self.comments_url(),
            {"entity_type": "unknown", "entity_id": self.task.id},
        )
        missing_response = self.client.get(
            self.comments_url(),
            {"entity_type": "task", "entity_id": 999999},
        )

        self.assertEqual(invalid_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(missing_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_mentions_require_base_access_to_target(self):
        self.client.force_authenticate(user=self.author)

        response = self.client.post(
            self.comments_url(),
            {
                "entity_type": "task",
                "entity_id": str(self.task.id),
                "body": rich_text("mention invalid"),
                "mentions": [self.unrelated.id],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Comment.objects.count(), 0)
        self.assertEqual(CommentMention.objects.count(), 0)

    def test_duplicate_and_missing_mentions_are_rejected(self):
        self.client.force_authenticate(user=self.author)

        duplicate_response = self.client.post(
            self.comments_url(),
            {
                "entity_type": "task",
                "entity_id": str(self.task.id),
                "body": rich_text("duplicate mention"),
                "mentions": [self.member.id, self.member.id],
                "attachment_ids": [],
            },
            format="json",
        )
        missing_response = self.client.post(
            self.comments_url(),
            {
                "entity_type": "task",
                "entity_id": str(self.task.id),
                "body": rich_text("missing mention"),
                "mentions": [999999],
                "attachment_ids": [],
            },
            format="json",
        )

        self.assertEqual(duplicate_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(missing_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Comment.objects.count(), 0)

    def test_mention_search_only_returns_users_with_base_access(self):
        self.client.force_authenticate(user=self.author)

        response = self.client.get(
            self.mention_users_url(),
            {"entity_type": "task", "entity_id": self.task.id, "q": "er"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        returned_ids = {row["id"] for row in response.data}
        self.assertIn(self.member.id, returned_ids)
        self.assertIn(self.approver.id, returned_ids)
        self.assertNotIn(self.unrelated.id, returned_ids)
