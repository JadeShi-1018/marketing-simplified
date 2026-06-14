"""Unit test: file slug accepted by bulk field validation (no DB)."""

from csm.services.ticket_form_validation import validate_bulk_fields_payload


def test_file_field_type_accepted():
    payload = [
        {
            'field_key': 'summary',
            'label': 'Summary',
            'field_type': 'system_summary',
            'sort_order': 0,
            'is_required': True,
        },
        {
            'field_key': 'description',
            'label': 'Description',
            'field_type': 'system_description',
            'sort_order': 1,
            'is_required': True,
        },
        {
            'field_key': 'project',
            'label': 'Project',
            'field_type': 'system_project',
            'sort_order': 2,
            'is_required': True,
        },
        {
            'field_key': 'work_type',
            'label': 'Work Type',
            'field_type': 'system_work_type',
            'sort_order': 3,
            'is_required': True,
        },
        {
            'field_key': 'invoice',
            'label': 'Invoice',
            'field_type': 'file',
            'sort_order': 4,
            'is_required': False,
        },
    ]
    normalized = validate_bulk_fields_payload(payload)
    file_row = next(item for item in normalized if item['field_key'] == 'invoice')
    assert file_row['field_type'] == 'file'
    assert file_row['max_files'] == 10
    assert file_row['max_file_size_mb'] == 25
