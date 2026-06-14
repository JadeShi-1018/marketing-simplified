"""Validation helpers for ticket form field definitions (admin builder)."""

import json
from datetime import datetime
from urllib.parse import urlparse

from django.core.exceptions import ValidationError

from core.models import ProjectMember
from csm.models import CsmWorkType, SupportProject, TicketFormField

SYSTEM_FIELD_SPECS = {
    'summary': TicketFormField.FieldType.SYSTEM_SUMMARY,
    'description': TicketFormField.FieldType.SYSTEM_DESCRIPTION,
    'project': TicketFormField.FieldType.SYSTEM_PROJECT,
    'work_type': TicketFormField.FieldType.SYSTEM_WORK_TYPE,
}

# Plain slug set — JSON payloads use strings; avoid TextChoices set-membership edge cases.
CUSTOM_FIELD_TYPE_SLUGS = frozenset({
    'short_text',
    'paragraph',
    'dropdown',
    'date',
    'checkbox',
    'file',
})

OPTION_FIELD_TYPES = TicketFormField.OPTION_FIELD_TYPES

REQUIRED_SYSTEM_KEYS = frozenset({'summary', 'project', 'work_type'})

DEFAULT_SHORT_TEXT_MAX_LENGTH = 255
MAX_SHORT_TEXT_LENGTH = 1000
MAX_URL_LENGTH = 2048
MAX_FILES_PER_SUBMISSION = 10
DEFAULT_MAX_FILE_SIZE_MB = 25


def _normalize_field_config(field_type, raw_config):
    if not isinstance(raw_config, dict):
        raw_config = {}
    config = dict(raw_config)

    if field_type == TicketFormField.FieldType.SHORT_TEXT:
        max_len = config.get('max_length', DEFAULT_SHORT_TEXT_MAX_LENGTH)
        try:
            max_len = int(max_len)
        except (TypeError, ValueError):
            max_len = DEFAULT_SHORT_TEXT_MAX_LENGTH
        config['max_length'] = max(1, min(max_len, MAX_SHORT_TEXT_LENGTH))

    elif field_type == TicketFormField.FieldType.NUMBER:
        min_val = config.get('min')
        max_val = config.get('max')
        if min_val is not None and min_val != '':
            try:
                config['min'] = float(min_val)
            except (TypeError, ValueError):
                config['min'] = None
        else:
            config['min'] = None
        if max_val is not None and max_val != '':
            try:
                config['max'] = float(max_val)
            except (TypeError, ValueError):
                config['max'] = None
        else:
            config['max'] = None
        config['integer_only'] = bool(config.get('integer_only', False))

    elif field_type == TicketFormField.FieldType.PEOPLE:
        config['allow_multiple'] = bool(config.get('allow_multiple', False))

    else:
        config = {}

    return config


def _validate_options(field_key, options, errors):
    if not isinstance(options, list) or len(options) == 0:
        errors[field_key] = 'This field needs at least one option.'
        return
    seen_values = set()
    for opt in options:
        if not isinstance(opt, dict) or not opt.get('value') or not opt.get('label'):
            errors[field_key] = 'Each option needs "value" and "label".'
            return
        val = str(opt['value']).strip()
        if val in seen_values:
            errors[field_key] = 'Option values must be unique.'
            return
        seen_values.add(val)


def validate_bulk_fields_payload(fields_payload):
    """
    Validate the full ordered field list from PUT .../fields/.
    Raises django.core.exceptions.ValidationError (message_dict keyed by field_key).
    Returns normalized list of dicts ready for persistence.
    """
    if not isinstance(fields_payload, list) or not fields_payload:
        raise ValidationError({'fields': 'At least one field is required.'})

    errors = {}
    seen_keys = set()
    seen_label_names = set()
    normalized = []

    for index, raw in enumerate(fields_payload):
        if not isinstance(raw, dict):
            errors[f'fields[{index}]'] = 'Each field must be an object.'
            continue

        field_key = (raw.get('field_key') or '').strip()
        if not field_key:
            errors[f'fields[{index}].field_key'] = 'Field key is required.'
            continue

        if field_key in seen_keys:
            errors[field_key] = 'Duplicate field key.'
            continue
        seen_keys.add(field_key)

        field_type = raw.get('field_type')
        label = (raw.get('label') or '').strip()
        if not label:
            errors[field_key] = 'Label is required.'
        else:
            label_key = label.casefold()
            if label_key in seen_label_names:
                errors[field_key] = 'A field with this name already exists.'
            else:
                seen_label_names.add(label_key)

        try:
            sort_order = int(raw.get('sort_order', index))
        except (TypeError, ValueError):
            errors[field_key] = 'Sort order must be an integer.'
            sort_order = index

        is_required = bool(raw.get('is_required', False))
        options = raw.get('options', [])
        field_config = raw.get('field_config', {})
        help_text = (raw.get('help_text') or '').strip()
        max_files = raw.get('max_files', 10)
        max_file_size_mb = raw.get('max_file_size_mb', 25)

        if field_key in SYSTEM_FIELD_SPECS:
            expected_type = SYSTEM_FIELD_SPECS[field_key]
            if field_type != expected_type:
                errors[field_key] = f'System field "{field_key}" must use type "{expected_type}".'
            if field_key in REQUIRED_SYSTEM_KEYS and not is_required:
                errors[field_key] = f'"{field_key}" must stay required.'
            field_config = {}
            options = []
        else:
            if field_type not in CUSTOM_FIELD_TYPE_SLUGS:
                errors[field_key] = 'Invalid custom field type.'
            elif field_type in OPTION_FIELD_TYPES:
                _validate_options(field_key, options, errors)
            else:
                options = []

            if field_type == 'file':
                max_files = MAX_FILES_PER_SUBMISSION
                max_file_size_mb = DEFAULT_MAX_FILE_SIZE_MB
                options = []

            if field_key not in errors and field_type in CUSTOM_FIELD_TYPE_SLUGS:
                field_config = _normalize_field_config(field_type, field_config)
                if field_type == TicketFormField.FieldType.NUMBER:
                    min_val = field_config.get('min')
                    max_val = field_config.get('max')
                    if min_val is not None and max_val is not None and min_val > max_val:
                        errors[field_key] = 'Minimum cannot be greater than maximum.'

        if field_key not in errors:
            normalized.append({
                'field_key': field_key,
                'label': label,
                'field_type': field_type,
                'is_required': is_required,
                'sort_order': sort_order,
                'options': options if isinstance(options, list) else [],
                'field_config': field_config,
                'help_text': help_text,
                'max_files': max_files,
                'max_file_size_mb': max_file_size_mb,
            })

    missing_system = set(SYSTEM_FIELD_SPECS.keys()) - seen_keys
    if missing_system:
        errors['fields'] = (
            f'Missing required system fields: {", ".join(sorted(missing_system))}.'
        )

    if errors:
        raise ValidationError(errors)

    normalized.sort(key=lambda item: item['sort_order'])
    return normalized


# --- Submission validation ---

SUBMISSION_MESSAGES = {
    'summary_required': 'Please enter a short summary of your request.',
    'description_required': 'Please enter a description of your request.',
    'project_required': 'Please select a support project.',
    'work_type_required': 'Please select a work type.',
    'field_required': 'This field is required.',
    'invalid_option': 'Please select a valid option.',
    'invalid_date': 'Please enter a valid date (YYYY-MM-DD).',
    'invalid_timestamp': 'Please enter a valid date and time.',
    'invalid_number': 'Please enter a valid number.',
    'invalid_url': 'Please enter a valid URL.',
    'invalid_member': 'Please select a valid team member.',
    'invalid_project': 'Please select a valid support project.',
    'invalid_work_type': 'Please select a valid work type.',
    'too_many_files': 'You can attach up to 10 files.',
    'file_too_large': 'Each file must be 25 MB or smaller.',
}


def _strip(value):
    if value is None:
        return ''
    return str(value).strip()


def _parse_date(value):
    try:
        return datetime.strptime(value, '%Y-%m-%d').date()
    except (TypeError, ValueError):
        return None


def _parse_timestamp(value):
    text = _strip(value)
    for fmt in ('%Y-%m-%dT%H:%M', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S'):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def _valid_url(value):
    text = _strip(value)
    if not text or len(text) > MAX_URL_LENGTH:
        return False
    parsed = urlparse(text)
    return parsed.scheme in ('http', 'https') and bool(parsed.netloc)


def _is_empty(raw, ftype):
    if raw is None:
        return True
    if ftype == TicketFormField.FieldType.NUMBER:
        return raw == '' or (isinstance(raw, str) and raw.strip() == '')
    if isinstance(raw, list):
        return len(raw) == 0
    if isinstance(raw, str):
        return raw.strip() == ''
    return False


def _project_member_ids(project_id):
    return set(
        ProjectMember.objects.filter(
            project_id=project_id,
            is_active=True,
        ).values_list('user_id', flat=True)
    )


def _parse_string_list(raw):
    if raw in (None, '', []):
        return []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            raw = [raw]
    if not isinstance(raw, list):
        return None
    return [_strip(v) for v in raw if _strip(v)]


def _validate_option_list(field, raw, errors, key):
    vals = _parse_string_list(raw)
    if vals is None:
        errors[key] = SUBMISSION_MESSAGES['invalid_option']
        return None
    allowed = {opt['value'] for opt in (field.options or []) if opt.get('value')}
    if any(v not in allowed for v in vals):
        errors[key] = SUBMISSION_MESSAGES['invalid_option']
        return None
    return vals


def validate_submission(form, answers, files_by_field, project_id):
    """
    Validate preview submit payload.

    Returns cleaned_data with summary, description, project, work_type,
    custom_field_values. Raises ValidationError keyed by field_key.
    """
    if not isinstance(answers, dict):
        raise ValidationError({'answers': 'Invalid submission payload.'})

    errors = {}
    cleaned = {
        'summary': '',
        'description': '',
        'project': None,
        'work_type': None,
        'custom_field_values': {},
    }

    total_files = sum(len(v) for v in files_by_field.values())
    if total_files > MAX_FILES_PER_SUBMISSION:
        errors['attachments'] = SUBMISSION_MESSAGES['too_many_files']

    member_ids = _project_member_ids(project_id)
    fields = list(form.fields.all().order_by('sort_order'))

    for field in fields:
        key = field.field_key
        ftype = field.field_type
        raw = answers.get(key)
        config = field.field_config or {}
        uploads = files_by_field.get(key, [])

        if ftype == 'file':
            max_mb = field.max_file_size_mb or DEFAULT_MAX_FILE_SIZE_MB
            max_bytes = max_mb * 1024 * 1024
            if field.is_required and not uploads:
                errors[key] = SUBMISSION_MESSAGES['field_required']
            for upload in uploads:
                if upload.size > max_bytes:
                    errors[f'attachments.{key}'] = SUBMISSION_MESSAGES['file_too_large']
            continue

        if _is_empty(raw, ftype) and field.is_required:
            errors[key] = _required_message(key)
            continue

        if ftype == TicketFormField.FieldType.SYSTEM_SUMMARY:
            cleaned['summary'] = _strip(raw)[:300]

        elif ftype == TicketFormField.FieldType.SYSTEM_DESCRIPTION:
            cleaned['description'] = _strip(raw)

        elif ftype == TicketFormField.FieldType.SYSTEM_PROJECT:
            try:
                sp_id = int(raw)
            except (TypeError, ValueError):
                if field.is_required or raw not in (None, ''):
                    errors[key] = SUBMISSION_MESSAGES['invalid_project']
                continue
            if not SupportProject.objects.filter(
                pk=sp_id, project_id=project_id, is_archived=False,
            ).exists():
                errors[key] = SUBMISSION_MESSAGES['invalid_project']
            else:
                cleaned['project'] = sp_id

        elif ftype == TicketFormField.FieldType.SYSTEM_WORK_TYPE:
            try:
                wt_id = int(raw)
            except (TypeError, ValueError):
                if field.is_required or raw not in (None, ''):
                    errors[key] = SUBMISSION_MESSAGES['invalid_work_type']
                continue
            if not CsmWorkType.objects.filter(
                pk=wt_id, project_id=project_id, is_active=True,
            ).exists():
                errors[key] = SUBMISSION_MESSAGES['invalid_work_type']
            else:
                cleaned['work_type'] = wt_id

        elif ftype == TicketFormField.FieldType.SHORT_TEXT:
            if not _is_empty(raw, ftype):
                val = _strip(raw)
                max_len = config.get('max_length', DEFAULT_SHORT_TEXT_MAX_LENGTH)
                if len(val) > max_len:
                    errors[key] = f'Please enter at most {max_len} characters.'
                else:
                    cleaned['custom_field_values'][key] = val

        elif ftype == TicketFormField.FieldType.PARAGRAPH:
            if not _is_empty(raw, ftype):
                cleaned['custom_field_values'][key] = _strip(raw)

        elif ftype == TicketFormField.FieldType.TIMESTAMP:
            if not _is_empty(raw, ftype):
                parsed = _parse_timestamp(raw)
                if not parsed:
                    errors[key] = SUBMISSION_MESSAGES['invalid_timestamp']
                else:
                    cleaned['custom_field_values'][key] = parsed.strftime('%Y-%m-%dT%H:%M')

        elif ftype == TicketFormField.FieldType.DROPDOWN:
            if not _is_empty(raw, ftype):
                allowed = {opt['value'] for opt in (field.options or []) if opt.get('value')}
                val = _strip(raw)
                if val not in allowed:
                    errors[key] = SUBMISSION_MESSAGES['invalid_option']
                else:
                    cleaned['custom_field_values'][key] = val

        elif ftype == TicketFormField.FieldType.DATE:
            if not _is_empty(raw, ftype):
                parsed = _parse_date(_strip(raw))
                if not parsed:
                    errors[key] = SUBMISSION_MESSAGES['invalid_date']
                else:
                    cleaned['custom_field_values'][key] = parsed.isoformat()

        elif ftype == TicketFormField.FieldType.NUMBER:
            if not _is_empty(raw, ftype):
                try:
                    num = float(raw)
                except (TypeError, ValueError):
                    errors[key] = SUBMISSION_MESSAGES['invalid_number']
                    continue
                if config.get('integer_only') and num != int(num):
                    errors[key] = SUBMISSION_MESSAGES['invalid_number']
                    continue
                if config.get('integer_only'):
                    num = int(num)
                min_val = config.get('min')
                max_val = config.get('max')
                if min_val is not None and num < min_val:
                    errors[key] = SUBMISSION_MESSAGES['invalid_number']
                elif max_val is not None and num > max_val:
                    errors[key] = SUBMISSION_MESSAGES['invalid_number']
                else:
                    cleaned['custom_field_values'][key] = num

        elif ftype in (TicketFormField.FieldType.LABELS, TicketFormField.FieldType.CHECKBOX):
            if not _is_empty(raw, ftype):
                vals = _validate_option_list(field, raw, errors, key)
                if vals is not None:
                    cleaned['custom_field_values'][key] = vals

        elif ftype == TicketFormField.FieldType.PEOPLE:
            if not _is_empty(raw, ftype):
                allow_multiple = bool(config.get('allow_multiple', False))
                if allow_multiple:
                    ids_raw = raw if isinstance(raw, list) else _parse_string_list(raw)
                    if ids_raw is None:
                        errors[key] = SUBMISSION_MESSAGES['invalid_member']
                        continue
                    try:
                        user_ids = [int(v) for v in ids_raw]
                    except (TypeError, ValueError):
                        errors[key] = SUBMISSION_MESSAGES['invalid_member']
                        continue
                    if any(uid not in member_ids for uid in user_ids):
                        errors[key] = SUBMISSION_MESSAGES['invalid_member']
                    else:
                        cleaned['custom_field_values'][key] = user_ids
                else:
                    try:
                        user_id = int(raw)
                    except (TypeError, ValueError):
                        errors[key] = SUBMISSION_MESSAGES['invalid_member']
                        continue
                    if user_id not in member_ids:
                        errors[key] = SUBMISSION_MESSAGES['invalid_member']
                    else:
                        cleaned['custom_field_values'][key] = user_id

        elif ftype == TicketFormField.FieldType.URL:
            if not _is_empty(raw, ftype):
                val = _strip(raw)
                if not _valid_url(val):
                    errors[key] = SUBMISSION_MESSAGES['invalid_url']
                else:
                    cleaned['custom_field_values'][key] = val

    if errors:
        raise ValidationError(errors)

    return cleaned


def _required_message(field_key):
    return {
        'summary': SUBMISSION_MESSAGES['summary_required'],
        'description': SUBMISSION_MESSAGES['description_required'],
        'project': SUBMISSION_MESSAGES['project_required'],
        'work_type': SUBMISSION_MESSAGES['work_type_required'],
    }.get(field_key, SUBMISSION_MESSAGES['field_required'])
