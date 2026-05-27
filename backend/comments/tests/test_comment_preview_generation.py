import subprocess
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.core.management import call_command
from django.test import override_settings
from PIL import Image
from rest_framework import status

from comments.tests.factories import CommentTestBase, tiny_png_bytes
from comments.models import CommentAttachment
import comments.preview_generation as preview_generation
from comments.preview_generation import (
    PreviewGenerationError,
    generate_comment_attachment_preview,
)


class CommentPreviewGenerationTest(CommentTestBase):
    @patch("comments.preview_generation._generate_document_preview_pages")
    def test_preview_generation_stores_valid_page_metadata(self, mock_generate_pages):
        attachment = self.create_bound_attachment(
            filename="brief.docx",
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        mock_generate_pages.return_value = [
            {
                "page": 1,
                "image_url": "/media/comments/previews/example/page-001.webp",
                "width": 1240,
                "height": 1754,
            }
        ]

        generate_comment_attachment_preview(attachment)
        attachment.refresh_from_db()

        self.assertEqual(attachment.preview_status, CommentAttachment.PREVIEW_READY)
        self.assertEqual(
            attachment.preview_metadata,
            {"preview_pages": mock_generate_pages.return_value},
        )
        self.assertEqual(attachment.preview_error, "")

    @patch("comments.preview_generation._generate_document_preview_pages")
    def test_preview_generation_failure_sets_failed_status(self, mock_generate_pages):
        attachment = self.create_bound_attachment(
            filename="deck.pdf",
            content_type="application/pdf",
        )
        mock_generate_pages.side_effect = PreviewGenerationError("PDF renderer is unavailable.")

        generate_comment_attachment_preview(attachment)
        attachment.refresh_from_db()

        self.assertEqual(attachment.preview_status, CommentAttachment.PREVIEW_FAILED)
        self.assertEqual(attachment.preview_metadata, {"preview_pages": []})
        self.assertEqual(attachment.preview_error, "PDF renderer is unavailable.")

        self.client.force_authenticate(user=self.member)
        response = self.client.get(self.preview_url(attachment))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "failed")
        self.assertEqual(response.data["error_message"], "PDF renderer is unavailable.")

    @patch("comments.preview_generation._generate_document_preview_pages")
    def test_image_preview_generation_reads_dimensions_without_document_renderer(
        self,
        mock_generate_pages,
    ):
        attachment = self.create_bound_attachment(
            filename="creative.png",
            content_type="image/png",
            content=tiny_png_bytes(width=3, height=2),
        )

        generate_comment_attachment_preview(attachment)
        attachment.refresh_from_db()

        page = attachment.preview_metadata["preview_pages"][0]
        self.assertEqual(attachment.preview_status, CommentAttachment.PREVIEW_READY)
        self.assertEqual(page["page"], 1)
        self.assertEqual(page["image_url"], attachment.file.url)
        self.assertEqual(page["width"], 3)
        self.assertEqual(page["height"], 2)
        mock_generate_pages.assert_not_called()

    @override_settings(
        COMMENT_PREVIEW_IMAGE_FORMAT="png",
        COMMENT_PREVIEW_MAX_PAGES=1,
        COMMENT_PREVIEW_TEXT_RENDER_WIDTH=240,
        COMMENT_PREVIEW_TEXT_RENDER_HEIGHT=220,
        COMMENT_PREVIEW_TEXT_RENDER_MARGIN=20,
        COMMENT_PREVIEW_TEXT_RENDER_FONT_SIZE=12,
        COMMENT_PREVIEW_TEXT_RENDER_TITLE_FONT_SIZE=14,
    )
    def test_text_preview_generation_renders_and_stores_limited_page(self):
        attachment = self.create_bound_attachment(
            filename="notes.txt",
            content_type="text/plain",
            content=("alpha beta gamma delta epsilon\n" * 80).encode("utf-8"),
        )

        generate_comment_attachment_preview(attachment)
        attachment.refresh_from_db()

        pages = attachment.preview_metadata["preview_pages"]
        self.assertEqual(attachment.preview_status, CommentAttachment.PREVIEW_READY)
        self.assertEqual(len(pages), 1)
        self.assertEqual(pages[0]["page"], 1)
        self.assertEqual(pages[0]["width"], 240)
        self.assertEqual(pages[0]["height"], 220)
        self.assertTrue(
            pages[0]["image_url"].endswith(
                f"comments/previews/{attachment.id}/page-001.png"
            )
        )

    def test_preview_generation_marks_missing_or_oversized_files_failed(self):
        missing_file = CommentAttachment.objects.create(
            file="",
            filename="missing.pdf",
            content_type="application/pdf",
            size=10,
            uploaded_by=self.author,
        )

        generate_comment_attachment_preview(missing_file)
        missing_file.refresh_from_db()

        self.assertEqual(missing_file.preview_status, CommentAttachment.PREVIEW_FAILED)
        self.assertEqual(missing_file.preview_error, "Attachment file is missing.")

        oversized = self.create_bound_attachment(
            filename="large.txt",
            content_type="text/plain",
            content=b"large",
        )
        CommentAttachment.objects.filter(id=oversized.id).update(size=10)
        oversized.refresh_from_db()

        with override_settings(COMMENT_PREVIEW_MAX_INPUT_BYTES=1):
            generate_comment_attachment_preview(oversized)
        oversized.refresh_from_db()

        self.assertEqual(oversized.preview_status, CommentAttachment.PREVIEW_FAILED)
        self.assertEqual(
            oversized.preview_error,
            "Attachment is too large to generate a preview.",
        )

    @patch("comments.preview_generation._generate_document_preview_pages")
    def test_preview_generation_fails_when_document_renderer_returns_no_pages(
        self,
        mock_generate_pages,
    ):
        attachment = self.create_bound_attachment(
            filename="empty.pdf",
            content_type="application/pdf",
        )
        mock_generate_pages.return_value = []

        generate_comment_attachment_preview(attachment)
        attachment.refresh_from_db()

        self.assertEqual(attachment.preview_status, CommentAttachment.PREVIEW_FAILED)
        self.assertEqual(
            attachment.preview_error,
            "Preview generation produced no pages.",
        )

    @patch("comments.preview_generation._find_executable", return_value="/usr/bin/pdftoppm")
    @patch("comments.preview_generation.subprocess.run")
    @override_settings(COMMENT_PREVIEW_IMAGE_FORMAT="png")
    def test_pdf_renderer_stores_pages_and_reports_renderer_failures(
        self,
        mock_run,
        mock_find_executable,
    ):
        attachment = self.create_bound_attachment(
            filename="deck.pdf",
            content_type="application/pdf",
        )

        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            pdf_path = tmp_path / "deck.pdf"
            pdf_path.write_bytes(b"%PDF-1.4")

            def render_page(args, **kwargs):
                output_prefix = Path(args[-1])
                Image.new("RGB", (4, 5), "white").save(
                    output_prefix.parent / f"{output_prefix.name}-1.png",
                    format="PNG",
                )
                return subprocess.CompletedProcess(args, 0, b"", b"")

            mock_run.side_effect = render_page

            pages = preview_generation._render_pdf_to_preview_pages(
                pdf_path=pdf_path,
                attachment=attachment,
                tmp_path=tmp_path,
            )

        self.assertEqual(pages[0]["page"], 1)
        self.assertEqual(pages[0]["width"], 4)
        self.assertEqual(pages[0]["height"], 5)
        mock_find_executable.assert_called()

        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            pdf_path = tmp_path / "deck.pdf"
            pdf_path.write_bytes(b"%PDF-1.4")
            mock_run.side_effect = None
            mock_run.return_value = subprocess.CompletedProcess(
                ["pdftoppm"],
                1,
                b"",
                b"bad pdf",
            )

            with self.assertRaisesRegex(
                PreviewGenerationError,
                "PDF renderer failed",
            ):
                preview_generation._render_pdf_to_preview_pages(
                    pdf_path=pdf_path,
                    attachment=attachment,
                    tmp_path=tmp_path,
                )

        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            pdf_path = tmp_path / "deck.pdf"
            pdf_path.write_bytes(b"%PDF-1.4")
            mock_run.return_value = subprocess.CompletedProcess(["pdftoppm"], 0, b"", b"")

            with self.assertRaisesRegex(
                PreviewGenerationError,
                "produced no pages",
            ):
                preview_generation._render_pdf_to_preview_pages(
                    pdf_path=pdf_path,
                    attachment=attachment,
                    tmp_path=tmp_path,
                )

    @patch("comments.preview_generation._find_executable")
    @patch("comments.preview_generation.subprocess.run")
    @override_settings(
        COMMENT_PREVIEW_LIBREOFFICE_MAX_ATTEMPTS=1,
        COMMENT_PREVIEW_LIBREOFFICE_RETRY_DELAY_SECONDS=0,
    )
    def test_office_conversion_handles_success_missing_binary_and_empty_output(
        self,
        mock_run,
        mock_find_executable,
    ):
        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            input_path = tmp_path / "brief.docx"
            input_path.write_bytes(b"docx")
            mock_find_executable.return_value = None

            with self.assertRaisesRegex(PreviewGenerationError, "LibreOffice is not installed"):
                preview_generation._convert_office_file_to_pdf(
                    input_path=input_path,
                    tmp_path=tmp_path,
                )

        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            input_path = tmp_path / "brief.docx"
            input_path.write_bytes(b"docx")
            mock_find_executable.return_value = "/usr/bin/libreoffice"

            def convert_to_pdf(args, **kwargs):
                output_dir = Path(args[args.index("--outdir") + 1])
                (output_dir / "brief.pdf").write_bytes(b"%PDF-1.4")
                return subprocess.CompletedProcess(args, 0, b"ok", b"")

            mock_run.side_effect = convert_to_pdf

            pdf_path = preview_generation._convert_office_file_to_pdf(
                input_path=input_path,
                tmp_path=tmp_path,
            )

        self.assertEqual(pdf_path.name, "brief.pdf")

        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            input_path = tmp_path / "brief.docx"
            input_path.write_bytes(b"docx")
            mock_run.side_effect = None
            mock_run.return_value = subprocess.CompletedProcess(["libreoffice"], 0, b"ok", b"")

            with self.assertRaisesRegex(PreviewGenerationError, "LibreOffice failed"):
                preview_generation._convert_office_file_to_pdf(
                    input_path=input_path,
                    tmp_path=tmp_path,
                )

    @patch("comments.preview_generation._generate_document_preview_pages")
    def test_zip_and_video_generation_remain_unsupported(self, mock_generate_pages):
        zip_attachment = self.create_bound_attachment(
            filename="archive.zip",
            content_type="application/zip",
        )
        video_attachment = self.create_bound_attachment(
            filename="spot.mp4",
            content_type="video/mp4",
        )

        generate_comment_attachment_preview(zip_attachment)
        generate_comment_attachment_preview(video_attachment)
        zip_attachment.refresh_from_db()
        video_attachment.refresh_from_db()

        self.assertEqual(zip_attachment.preview_status, CommentAttachment.PREVIEW_UNSUPPORTED)
        self.assertEqual(video_attachment.preview_status, CommentAttachment.PREVIEW_UNSUPPORTED)
        self.assertEqual(zip_attachment.preview_metadata, {"preview_pages": []})
        self.assertEqual(video_attachment.preview_metadata, {"preview_pages": []})
        mock_generate_pages.assert_not_called()

    @patch(
        "comments.management.commands.generate_comment_attachment_preview."
        "generate_comment_attachment_preview"
    )
    def test_generate_preview_management_command_calls_service(self, mock_generate_preview):
        attachment = self.create_bound_attachment(
            filename="deck.pdf",
            content_type="application/pdf",
        )
        mock_generate_preview.return_value = attachment
        stdout = StringIO()

        call_command(
            "generate_comment_attachment_preview",
            str(attachment.id),
            stdout=stdout,
        )

        mock_generate_preview.assert_called_once()
        self.assertIn(str(attachment.id), stdout.getvalue())
