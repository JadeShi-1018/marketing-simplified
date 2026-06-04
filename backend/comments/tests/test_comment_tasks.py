import uuid
from unittest.mock import patch

from comments.tests.factories import CommentTestBase
from comments.tasks import generate_comment_attachment_preview_task


class CommentPreviewTaskTest(CommentTestBase):
    @patch("comments.tasks.generate_comment_attachment_preview")
    def test_preview_generation_task_calls_service_for_existing_attachment(
        self,
        mock_generate_preview,
    ):
        attachment = self.create_bound_attachment(
            filename="deck.pdf",
            content_type="application/pdf",
        )

        result = generate_comment_attachment_preview_task.run(str(attachment.id))

        self.assertTrue(result)
        mock_generate_preview.assert_called_once()
        self.assertEqual(mock_generate_preview.call_args.args[0].id, attachment.id)

    @patch("comments.tasks.generate_comment_attachment_preview")
    def test_preview_generation_task_skips_missing_attachment(self, mock_generate_preview):
        result = generate_comment_attachment_preview_task.run(str(uuid.uuid4()))

        self.assertFalse(result)
        mock_generate_preview.assert_not_called()
