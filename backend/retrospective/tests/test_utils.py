"""
Unit tests for retrospective.utils.RetrospectiveUtils

Pure-function tests - no database access required.
Covers all static methods in retrospective/utils.py.
"""

from datetime import datetime, timezone as dt_timezone
from decimal import Decimal
from io import BytesIO
from unittest.mock import patch

import pytest
import pytz

from retrospective.utils import RetrospectiveUtils


class TestConvertTimezone:
    def test_convert_aware_datetime_to_utc(self):
        eastern = pytz.timezone("America/New_York")
        dt = eastern.localize(datetime(2024, 1, 15, 12, 0, 0))
        result = RetrospectiveUtils.convert_timezone(dt, "UTC")
        assert result.tzinfo is not None
        assert result.hour == 17  # EST is UTC-5

    def test_convert_naive_datetime_treats_as_utc(self):
        naive_dt = datetime(2024, 3, 10, 8, 0, 0)
        result = RetrospectiveUtils.convert_timezone(naive_dt, "America/Los_Angeles")
        assert result.tzinfo is not None

    def test_convert_to_same_timezone(self):
        utc_dt = datetime(2024, 6, 1, 10, 0, 0, tzinfo=dt_timezone.utc)
        result = RetrospectiveUtils.convert_timezone(utc_dt, "UTC")
        assert result.hour == 10

    def test_convert_to_tokyo(self):
        utc_dt = datetime(2024, 1, 1, 0, 0, 0, tzinfo=dt_timezone.utc)
        result = RetrospectiveUtils.convert_timezone(utc_dt, "Asia/Tokyo")
        assert result.hour == 9


class TestFormatDuration:
    def test_under_60_seconds(self):
        assert RetrospectiveUtils.format_duration(30.5) == "30.5s"

    def test_exactly_1_minute(self):
        assert RetrospectiveUtils.format_duration(60) == "1m 0s"

    def test_minutes_and_seconds(self):
        assert RetrospectiveUtils.format_duration(90) == "1m 30s"

    def test_hours(self):
        assert RetrospectiveUtils.format_duration(3661) == "1h 1m 1s"

    def test_zero_seconds(self):
        assert RetrospectiveUtils.format_duration(0) == "0.0s"

    def test_exactly_1_hour(self):
        assert RetrospectiveUtils.format_duration(3600) == "1h 0m 0s"

    def test_large_duration(self):
        result = RetrospectiveUtils.format_duration(2 * 3600 + 30 * 60 + 15)
        assert result == "2h 30m 15s"


class TestTransformKpiData:
    def test_basic_transformation(self):
        raw = {
            "metric_name": "ctr",
            "value": 0.05,
            "unit": "%",
            "source": "api",
            "recorded_at": "2024-01-01",
            "target_value": 0.10,
        }
        result = RetrospectiveUtils.transform_kpi_data(raw)
        assert result["metric_name"] == "CTR"
        assert result["value"] == 0.05
        assert result["target_value"] == 0.10
        assert result["raw_data"] is raw

    def test_negative_value_clamped_to_zero(self):
        raw = {"metric_name": "spend", "value": -100, "target_value": -50}
        result = RetrospectiveUtils.transform_kpi_data(raw)
        assert result["value"] == 0
        assert result["target_value"] == 0

    def test_missing_fields_use_defaults(self):
        raw = {}
        result = RetrospectiveUtils.transform_kpi_data(raw)
        assert result["metric_name"] == ""
        assert result["value"] == 0.0
        assert result["unit"] == "%"
        assert result["source"] == "manual"
        assert result["target_value"] is None

    def test_null_target_value(self):
        raw = {"metric_name": "roas", "value": 3.5, "target_value": None}
        result = RetrospectiveUtils.transform_kpi_data(raw)
        assert result["target_value"] is None


class TestNormalizeMetricName:
    def test_roi(self):
        assert RetrospectiveUtils.normalize_metric_name("roi") == "ROI"

    def test_ctr(self):
        assert RetrospectiveUtils.normalize_metric_name("ctr") == "CTR"

    def test_cpc(self):
        assert RetrospectiveUtils.normalize_metric_name("cpc") == "CPC"

    def test_cpa(self):
        assert RetrospectiveUtils.normalize_metric_name("cpa") == "CPA"

    def test_return_on_investment(self):
        assert RetrospectiveUtils.normalize_metric_name("return_on_investment") == "ROI"

    def test_click_through_rate(self):
        assert RetrospectiveUtils.normalize_metric_name("click_through_rate") == "CTR"

    def test_cost_per_click(self):
        assert RetrospectiveUtils.normalize_metric_name("cost_per_click") == "CPC"

    def test_spend(self):
        assert RetrospectiveUtils.normalize_metric_name("spend") == "SPEND"

    def test_impressions(self):
        assert RetrospectiveUtils.normalize_metric_name("impressions") == "IMPRESSIONS"

    def test_clicks(self):
        assert RetrospectiveUtils.normalize_metric_name("clicks") == "CLICKS"

    def test_conversions(self):
        assert RetrospectiveUtils.normalize_metric_name("conversions") == "CONVERSIONS"

    def test_conversion_rate(self):
        assert RetrospectiveUtils.normalize_metric_name("conversion_rate") == "CONVERSION_RATE"

    def test_budget_utilization(self):
        assert RetrospectiveUtils.normalize_metric_name("budget_utilization") == "BUDGET_UTILIZATION"

    def test_impression_share(self):
        assert RetrospectiveUtils.normalize_metric_name("impression_share") == "IMPRESSION_SHARE"

    def test_unknown_metric_uppercased(self):
        assert RetrospectiveUtils.normalize_metric_name("my_custom_metric") == "MY_CUSTOM_METRIC"

    def test_whitespace_stripped(self):
        assert RetrospectiveUtils.normalize_metric_name("  roi  ") == "ROI"


class TestValidateJsonData:
    def test_valid_json_object(self):
        assert RetrospectiveUtils.validate_json_data('{"key": "value"}') is True

    def test_valid_json_array(self):
        assert RetrospectiveUtils.validate_json_data("[1, 2, 3]") is True

    def test_valid_json_null(self):
        assert RetrospectiveUtils.validate_json_data("null") is True

    def test_valid_json_number(self):
        assert RetrospectiveUtils.validate_json_data("42") is True

    def test_invalid_json_string(self):
        assert RetrospectiveUtils.validate_json_data("not json") is False

    def test_invalid_json_none(self):
        assert RetrospectiveUtils.validate_json_data(None) is False

    def test_empty_string(self):
        assert RetrospectiveUtils.validate_json_data("") is False


class TestSafeDecimalConversion:
    def test_int_to_decimal(self):
        assert RetrospectiveUtils.safe_decimal_conversion(42) == Decimal("42")

    def test_float_to_decimal(self):
        result = RetrospectiveUtils.safe_decimal_conversion(3.14)
        assert abs(result - Decimal("3.14")) < Decimal("0.0001")

    def test_string_to_decimal(self):
        assert RetrospectiveUtils.safe_decimal_conversion("99.99") == Decimal("99.99")

    def test_decimal_passthrough(self):
        d = Decimal("1.23")
        assert RetrospectiveUtils.safe_decimal_conversion(d) is d

    def test_invalid_string_raises(self):
        import decimal
        # The except clause only catches ValueError/TypeError; decimal.InvalidOperation
        # is not caught, so an invalid string propagates the exception.
        with pytest.raises(decimal.InvalidOperation):
            RetrospectiveUtils.safe_decimal_conversion("not_a_number")

    def test_none_returns_zero(self):
        assert RetrospectiveUtils.safe_decimal_conversion(None) == Decimal("0")

    def test_zero_int(self):
        assert RetrospectiveUtils.safe_decimal_conversion(0) == Decimal("0")


class TestCalculatePercentageChange:
    def test_positive_change(self):
        assert RetrospectiveUtils.calculate_percentage_change(100, 150) == 50.0

    def test_negative_change(self):
        assert RetrospectiveUtils.calculate_percentage_change(200, 100) == -50.0

    def test_no_change(self):
        assert RetrospectiveUtils.calculate_percentage_change(100, 100) == 0.0

    def test_old_value_zero_new_zero(self):
        assert RetrospectiveUtils.calculate_percentage_change(0, 0) == 0.0

    def test_old_value_zero_new_nonzero(self):
        assert RetrospectiveUtils.calculate_percentage_change(0, 50) == 100.0

    def test_large_increase(self):
        assert RetrospectiveUtils.calculate_percentage_change(10, 110) == 1000.0


class TestFormatCurrency:
    def test_usd(self):
        assert RetrospectiveUtils.format_currency(1234.56, "USD") == "$1,234.56"

    def test_eur(self):
        result = RetrospectiveUtils.format_currency(99.99, "EUR")
        assert "99.99" in result
        assert "\u20ac" in result  # Euro sign

    def test_gbp(self):
        result = RetrospectiveUtils.format_currency(100, "GBP")
        assert "\xa3" in result  # Pound sign

    def test_jpy(self):
        result = RetrospectiveUtils.format_currency(1000, "JPY")
        assert "\xa5" in result  # Yen sign

    def test_unknown_currency_uses_code(self):
        result = RetrospectiveUtils.format_currency(50, "AUD")
        assert result == "AUD50.00"

    def test_zero_amount(self):
        assert RetrospectiveUtils.format_currency(0, "USD") == "$0.00"


class TestTruncateText:
    def test_short_text_unchanged(self):
        text = "Hello World"
        assert RetrospectiveUtils.truncate_text(text, 100) == text

    def test_exact_length_unchanged(self):
        text = "a" * 100
        assert RetrospectiveUtils.truncate_text(text, 100) == text

    def test_long_text_truncated_with_ellipsis(self):
        text = "a" * 200
        result = RetrospectiveUtils.truncate_text(text, 100)
        assert len(result) == 100
        assert result.endswith("...")

    def test_default_max_length_100(self):
        text = "b" * 200
        result = RetrospectiveUtils.truncate_text(text)
        assert len(result) == 100

    def test_empty_string_unchanged(self):
        assert RetrospectiveUtils.truncate_text("", 10) == ""


class TestGenerateUniqueId:
    def test_default_prefix(self):
        result = RetrospectiveUtils.generate_unique_id()
        assert result.startswith("retro_")

    def test_custom_prefix(self):
        result = RetrospectiveUtils.generate_unique_id("campaign")
        assert result.startswith("campaign_")

    def test_uniqueness(self):
        ids = {RetrospectiveUtils.generate_unique_id() for _ in range(50)}
        assert len(ids) == 50

    def test_hex_suffix_length(self):
        result = RetrospectiveUtils.generate_unique_id("test")
        suffix = result[len("test_"):]
        assert len(suffix) == 8
        int(suffix, 16)  # validates it is valid hex


class TestValidateEmailFormat:
    def test_valid_simple_email(self):
        assert RetrospectiveUtils.validate_email_format("user@example.com") is True

    def test_valid_email_with_subdomain(self):
        assert RetrospectiveUtils.validate_email_format("user@mail.example.co.uk") is True

    def test_valid_email_with_plus(self):
        assert RetrospectiveUtils.validate_email_format("user+tag@example.com") is True

    def test_invalid_no_at_sign(self):
        assert RetrospectiveUtils.validate_email_format("notanemail.com") is False

    def test_invalid_no_domain_after_at(self):
        assert RetrospectiveUtils.validate_email_format("user@") is False

    def test_invalid_empty_string(self):
        assert RetrospectiveUtils.validate_email_format("") is False

    def test_invalid_no_tld(self):
        assert RetrospectiveUtils.validate_email_format("user@domain") is False


class TestSanitizeFilename:
    def test_safe_filename_unchanged(self):
        assert RetrospectiveUtils.sanitize_filename("report.pdf") == "report.pdf"

    def test_angle_brackets_replaced(self):
        result = RetrospectiveUtils.sanitize_filename("report<2024>.pdf")
        assert "<" not in result
        assert ">" not in result

    def test_slash_replaced(self):
        result = RetrospectiveUtils.sanitize_filename("path/to/file.pdf")
        assert "/" not in result

    def test_colon_replaced(self):
        result = RetrospectiveUtils.sanitize_filename("file:name.pdf")
        assert ":" not in result

    def test_question_mark_replaced(self):
        result = RetrospectiveUtils.sanitize_filename("file?.pdf")
        assert "?" not in result

    def test_asterisk_replaced(self):
        result = RetrospectiveUtils.sanitize_filename("file*.pdf")
        assert "*" not in result

    def test_pipe_replaced(self):
        result = RetrospectiveUtils.sanitize_filename("file|name.pdf")
        assert "|" not in result

    def test_dots_only_returns_unnamed_file(self):
        result = RetrospectiveUtils.sanitize_filename("...")
        assert result == "unnamed_file"

    def test_very_long_filename_truncated_to_255(self):
        long_name = "a" * 300 + ".pdf"
        result = RetrospectiveUtils.sanitize_filename(long_name)
        assert len(result) <= 255
        assert result.endswith(".pdf")


class TestGenerateReportFilename:
    def test_default_pdf_type(self):
        result = RetrospectiveUtils.generate_report_filename("12345")
        assert result.startswith("retrospective_12345_")
        assert result.endswith(".pdf")

    def test_custom_file_type_csv(self):
        result = RetrospectiveUtils.generate_report_filename("67890", "csv")
        assert result.endswith(".csv")

    def test_custom_file_type_xlsx(self):
        result = RetrospectiveUtils.generate_report_filename("1", "xlsx")
        assert result.endswith(".xlsx")

    def test_contains_timestamp_format(self):
        result = RetrospectiveUtils.generate_report_filename("42")
        # Format: retrospective_42_YYYYMMDD_HHMMSS.pdf
        parts = result.split("_")
        # retrospective, 42, YYYYMMDD, HHMMSS.pdf
        assert len(parts) >= 4
        date_part = parts[2]
        assert len(date_part) == 8  # YYYYMMDD
        assert date_part.isdigit()


class TestHandleFileUpload:
    def test_upload_file_like_object_with_custom_filename(self):
        file_obj = BytesIO(b"test content")
        file_obj.name = "test.txt"

        with patch("retrospective.utils.default_storage") as mock_storage:
            mock_storage.save.return_value = "uploads/test.txt"
            mock_storage.url.return_value = "/media/uploads/test.txt"

            url = RetrospectiveUtils.handle_file_upload(
                file_obj, "uploads", filename="test.txt"
            )
            assert url == "/media/uploads/test.txt"
            mock_storage.save.assert_called_once()

    def test_upload_generates_uuid_filename_when_none(self):
        file_obj = BytesIO(b"data")
        file_obj.name = "original.pdf"

        with patch("retrospective.utils.default_storage") as mock_storage:
            mock_storage.save.return_value = "uploads/uuid.pdf"
            mock_storage.url.return_value = "/media/uploads/uuid.pdf"

            RetrospectiveUtils.handle_file_upload(file_obj, "uploads")
            saved_path = mock_storage.save.call_args[0][0]
            assert saved_path.endswith(".pdf")

    def test_upload_bytes_content(self):
        with patch("retrospective.utils.default_storage") as mock_storage:
            mock_storage.save.return_value = "uploads/raw.pdf"
            mock_storage.url.return_value = "/media/uploads/raw.pdf"

            url = RetrospectiveUtils.handle_file_upload(
                b"raw bytes", "uploads", filename="raw.pdf"
            )
            assert url == "/media/uploads/raw.pdf"

    def test_upload_file_obj_without_name_attr_defaults_pdf(self):
        file_obj = BytesIO(b"data")
        # BytesIO has no .name attribute

        with patch("retrospective.utils.default_storage") as mock_storage:
            mock_storage.save.return_value = "uploads/out.pdf"
            mock_storage.url.return_value = "/media/uploads/out.pdf"

            RetrospectiveUtils.handle_file_upload(file_obj, "uploads")
            saved_path = mock_storage.save.call_args[0][0]
            assert saved_path.endswith(".pdf")
