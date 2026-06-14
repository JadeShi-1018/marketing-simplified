import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DynamicFormRenderer from '@/components/ticket-form/DynamicFormRenderer';
import type { RequestFormResponse } from '@/types/ticketForm';

jest.mock('@/lib/api/experienceGroupApi', () => ({
  ExperienceGroupAPI: { submitRequest: jest.fn() },
}));

const schema: RequestFormResponse = {
  form_id: 1,
  form_name: 'Support',
  experience_group_id: 1,
  fields: [
    {
      field_key: 'summary',
      label: 'Summary',
      field_type: 'system_summary',
      is_required: true,
      sort_order: 0,
    },
    {
      field_key: 'link',
      label: 'Link',
      field_type: 'url',
      is_required: false,
      sort_order: 4,
    },
    {
      field_key: 'tags',
      label: 'Tags',
      field_type: 'labels',
      is_required: false,
      sort_order: 5,
      options: [{ value: 'bug', label: 'Bug' }],
    },
  ],
  options: {
    support_projects: [],
    work_types: [],
    project_members: [{ id: 1, name: 'Test User', email: 'test@test.com' }],
  },
};

const schemaWithFile: RequestFormResponse = {
  ...schema,
  fields: [
    ...schema.fields,
    {
      field_key: 'invoice',
      label: 'Invoice',
      field_type: 'file',
      is_required: false,
      sort_order: 6,
      max_files: 10,
      max_file_size_mb: 25,
    },
  ],
};

describe('DynamicFormRenderer', () => {
  it('renders url and labels field types', () => {
    render(<DynamicFormRenderer experienceGroupId={1} schema={schema} />);
    expect(screen.getByText('Link')).toBeInTheDocument();
    expect(screen.getByText('Tags')).toBeInTheDocument();
    expect(screen.getByText('Bug')).toBeInTheDocument();
  });

  it('renders file attachment drop zone with limits hint', () => {
    render(<DynamicFormRenderer experienceGroupId={1} schema={schemaWithFile} />);
    expect(screen.getByText('Invoice')).toBeInTheDocument();
    expect(screen.getByText(/Up to 10 files per submission, 25 MB each/)).toBeInTheDocument();
  });
});
