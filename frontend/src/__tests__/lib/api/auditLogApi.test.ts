/**
 * Tests for Audit Log API Client
 *
 * Covers:
 * - URL construction with filters and pagination
 * - Query parameter serialization
 * - Error handling
 * - Response validation
 */

import axios from 'axios';
import { fetchAuditLog, fetchAuditLogFirstPage, fetchAuditLogPage } from '@/lib/api/auditLogApi';
import type { AuditLogResponse } from '@/types/audit';

// Mock axios to avoid actual API calls
jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

import api from '@/lib/api';

const mockApi = api as jest.Mocked<typeof api>;

describe('auditLogApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchAuditLog', () => {
    const projectId = 123;
    const meetingId = 456;
    const mockResponse: AuditLogResponse = {
      count: 10,
      next: null,
      previous: null,
      results: [
        {
          id: '1',
          event_type: 'meeting.status_changed',
          timestamp: '2026-05-24T10:00:00Z',
          actor: {
            id: 1,
            display_name: 'John Doe',
            email: 'john@example.com',
          },
          before: { status: 'draft' },
          after: { status: 'scheduled' },
          context: null,
        },
      ],
    };

    it('should fetch audit log with default pagination', async () => {
      mockApi.get.mockResolvedValue({ data: mockResponse });

      const result = await fetchAuditLog(projectId, meetingId);

      expect(mockApi.get).toHaveBeenCalledWith(
        `/api/projects/${projectId}/meetings/${meetingId}/audit-log/`,
        {
          params: {
            page: 1,
            page_size: 50,
          },
        }
      );
      expect(result).toEqual(mockResponse);
    });

    it('should fetch audit log with custom pagination', async () => {
      mockApi.get.mockResolvedValue({ data: mockResponse });

      const result = await fetchAuditLog(projectId, meetingId, undefined, 2, 25);

      expect(mockApi.get).toHaveBeenCalledWith(
        `/api/projects/${projectId}/meetings/${meetingId}/audit-log/`,
        {
          params: {
            page: 2,
            page_size: 25,
          },
        }
      );
      expect(result).toEqual(mockResponse);
    });

    it('should fetch audit log with single event_type filter', async () => {
      mockApi.get.mockResolvedValue({ data: mockResponse });

      const result = await fetchAuditLog(projectId, meetingId, {
        event_type: ['meeting.status_changed'],
      });

      expect(mockApi.get).toHaveBeenCalledWith(
        `/api/projects/${projectId}/meetings/${meetingId}/audit-log/`,
        {
          params: {
            page: 1,
            page_size: 50,
            event_type: ['meeting.status_changed'],
          },
        }
      );
      expect(result).toEqual(mockResponse);
    });

    it('should fetch audit log with multiple event_type filters', async () => {
      mockApi.get.mockResolvedValue({ data: mockResponse });

      const result = await fetchAuditLog(projectId, meetingId, {
        event_type: ['meeting.status_changed', 'meeting.title_changed'],
      });

      expect(mockApi.get).toHaveBeenCalledWith(
        `/api/projects/${projectId}/meetings/${meetingId}/audit-log/`,
        {
          params: {
            page: 1,
            page_size: 50,
            event_type: ['meeting.status_changed', 'meeting.title_changed'],
          },
        }
      );
      expect(result).toEqual(mockResponse);
    });

    it('should fetch audit log with actor_id filter', async () => {
      mockApi.get.mockResolvedValue({ data: mockResponse });

      const result = await fetchAuditLog(projectId, meetingId, {
        actor_id: 789,
      });

      expect(mockApi.get).toHaveBeenCalledWith(
        `/api/projects/${projectId}/meetings/${meetingId}/audit-log/`,
        {
          params: {
            page: 1,
            page_size: 50,
            actor_id: 789,
          },
        }
      );
      expect(result).toEqual(mockResponse);
    });

    it('should fetch audit log with date range filters', async () => {
      mockApi.get.mockResolvedValue({ data: mockResponse });

      const result = await fetchAuditLog(projectId, meetingId, {
        from: '2026-05-01T00:00:00Z',
        to: '2026-05-31T23:59:59Z',
      });

      expect(mockApi.get).toHaveBeenCalledWith(
        `/api/projects/${projectId}/meetings/${meetingId}/audit-log/`,
        {
          params: {
            page: 1,
            page_size: 50,
            from: '2026-05-01T00:00:00Z',
            to: '2026-05-31T23:59:59Z',
          },
        }
      );
      expect(result).toEqual(mockResponse);
    });

    it('should fetch audit log with all filters combined', async () => {
      mockApi.get.mockResolvedValue({ data: mockResponse });

      const result = await fetchAuditLog(
        projectId,
        meetingId,
        {
          event_type: ['meeting.status_changed', 'meeting.title_changed'],
          actor_id: 789,
          from: '2026-05-01T00:00:00Z',
          to: '2026-05-31T23:59:59Z',
        },
        3,
        30
      );

      expect(mockApi.get).toHaveBeenCalledWith(
        `/api/projects/${projectId}/meetings/${meetingId}/audit-log/`,
        {
          params: {
            page: 3,
            page_size: 30,
            event_type: ['meeting.status_changed', 'meeting.title_changed'],
            actor_id: 789,
            from: '2026-05-01T00:00:00Z',
            to: '2026-05-31T23:59:59Z',
          },
        }
      );
      expect(result).toEqual(mockResponse);
    });

    it('should skip empty event_type array in filters', async () => {
      mockApi.get.mockResolvedValue({ data: mockResponse });

      const result = await fetchAuditLog(projectId, meetingId, {
        event_type: [],
        actor_id: 789,
      });

      expect(mockApi.get).toHaveBeenCalledWith(
        `/api/projects/${projectId}/meetings/${meetingId}/audit-log/`,
        {
          params: {
            page: 1,
            page_size: 50,
            actor_id: 789,
          },
        }
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle API errors gracefully', async () => {
      const mockError = new Error('Network error');
      mockApi.get.mockRejectedValue(mockError);

      await expect(fetchAuditLog(projectId, meetingId)).rejects.toThrow(
        'Failed to fetch audit log: Network error'
      );
    });

    it('should handle 401 errors (unauthorized)', async () => {
      const mockError = new axios.AxiosError(
        'Unauthorized',
        'ERR_BAD_REQUEST',
        { method: 'get', url: '/api/projects/123/meetings/456/audit-log/' },
        null,
        {
          status: 401,
          statusText: 'Unauthorized',
          data: {},
          headers: {},
          config: {} as any,
        }
      );
      mockApi.get.mockRejectedValue(mockError);

      await expect(fetchAuditLog(projectId, meetingId)).rejects.toThrow(
        'Failed to fetch audit log'
      );
    });

    it('should handle 403 errors (forbidden)', async () => {
      const mockError = new axios.AxiosError(
        'Forbidden',
        'ERR_BAD_REQUEST',
        { method: 'get', url: '/api/projects/123/meetings/456/audit-log/' },
        null,
        {
          status: 403,
          statusText: 'Forbidden',
          data: {},
          headers: {},
          config: {} as any,
        }
      );
      mockApi.get.mockRejectedValue(mockError);

      await expect(fetchAuditLog(projectId, meetingId)).rejects.toThrow(
        'Failed to fetch audit log'
      );
    });

    it('should handle 404 errors (not found)', async () => {
      const mockError = new axios.AxiosError(
        'Not Found',
        'ERR_BAD_REQUEST',
        { method: 'get', url: '/api/projects/123/meetings/456/audit-log/' },
        null,
        {
          status: 404,
          statusText: 'Not Found',
          data: {},
          headers: {},
          config: {} as any,
        }
      );
      mockApi.get.mockRejectedValue(mockError);

      await expect(fetchAuditLog(projectId, meetingId)).rejects.toThrow(
        'Failed to fetch audit log'
      );
    });

    it('should construct correct URL with path parameters', async () => {
      mockApi.get.mockResolvedValue({ data: mockResponse });

      const testProjectId = 999;
      const testMeetingId = 888;

      await fetchAuditLog(testProjectId, testMeetingId);

      expect(mockApi.get).toHaveBeenCalledWith(
        `/api/projects/${testProjectId}/meetings/${testMeetingId}/audit-log/`,
        expect.any(Object)
      );
    });
  });

  describe('fetchAuditLogFirstPage', () => {
    const projectId = 123;
    const meetingId = 456;
    const mockResponse: AuditLogResponse = {
      count: 10,
      next: null,
      previous: null,
      results: [],
    };

    it('should fetch the first page with default page_size', async () => {
      mockApi.get.mockResolvedValue({ data: mockResponse });

      const result = await fetchAuditLogFirstPage(projectId, meetingId);

      expect(mockApi.get).toHaveBeenCalledWith(
        `/api/projects/${projectId}/meetings/${meetingId}/audit-log/`,
        {
          params: {
            page: 1,
            page_size: 50,
          },
        }
      );
      expect(result).toEqual(mockResponse);
    });

    it('should fetch the first page with custom page_size', async () => {
      mockApi.get.mockResolvedValue({ data: mockResponse });

      const result = await fetchAuditLogFirstPage(projectId, meetingId, undefined, 25);

      expect(mockApi.get).toHaveBeenCalledWith(
        `/api/projects/${projectId}/meetings/${meetingId}/audit-log/`,
        {
          params: {
            page: 1,
            page_size: 25,
          },
        }
      );
      expect(result).toEqual(mockResponse);
    });

    it('should fetch the first page with filters', async () => {
      mockApi.get.mockResolvedValue({ data: mockResponse });

      const result = await fetchAuditLogFirstPage(projectId, meetingId, {
        event_type: ['meeting.status_changed'],
        actor_id: 789,
      });

      expect(mockApi.get).toHaveBeenCalledWith(
        `/api/projects/${projectId}/meetings/${meetingId}/audit-log/`,
        {
          params: {
            page: 1,
            page_size: 50,
            event_type: ['meeting.status_changed'],
            actor_id: 789,
          },
        }
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('fetchAuditLogPage', () => {
    const projectId = 123;
    const meetingId = 456;
    const mockResponse: AuditLogResponse = {
      count: 100,
      next: null,
      previous: null,
      results: [],
    };

    it('should fetch a specific page', async () => {
      mockApi.get.mockResolvedValue({ data: mockResponse });

      const result = await fetchAuditLogPage(projectId, meetingId, 2);

      expect(mockApi.get).toHaveBeenCalledWith(
        `/api/projects/${projectId}/meetings/${meetingId}/audit-log/`,
        {
          params: {
            page: 2,
            page_size: 50,
          },
        }
      );
      expect(result).toEqual(mockResponse);
    });

    it('should fetch a specific page with custom page_size', async () => {
      mockApi.get.mockResolvedValue({ data: mockResponse });

      const result = await fetchAuditLogPage(projectId, meetingId, 3, undefined, 25);

      expect(mockApi.get).toHaveBeenCalledWith(
        `/api/projects/${projectId}/meetings/${meetingId}/audit-log/`,
        {
          params: {
            page: 3,
            page_size: 25,
          },
        }
      );
      expect(result).toEqual(mockResponse);
    });

    it('should fetch a specific page with filters', async () => {
      mockApi.get.mockResolvedValue({ data: mockResponse });

      const result = await fetchAuditLogPage(projectId, meetingId, 2, {
        event_type: ['meeting.title_changed'],
        actor_id: 999,
      });

      expect(mockApi.get).toHaveBeenCalledWith(
        `/api/projects/${projectId}/meetings/${meetingId}/audit-log/`,
        {
          params: {
            page: 2,
            page_size: 50,
            event_type: ['meeting.title_changed'],
            actor_id: 999,
          },
        }
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('pagination response validation', () => {
    const projectId = 123;
    const meetingId = 456;

    it('should handle paginated response with next page', async () => {
      const paginatedResponse: AuditLogResponse = {
        count: 150,
        next: '/api/projects/123/meetings/456/audit-log/?page=2',
        previous: null,
        results: [
          {
            id: '1',
            event_type: 'meeting.status_changed',
            timestamp: '2026-05-24T10:00:00Z',
            actor: {
              id: 1,
              display_name: 'John Doe',
              email: 'john@example.com',
            },
            before: null,
            after: null,
            context: null,
          },
        ],
      };
      mockApi.get.mockResolvedValue({ data: paginatedResponse });

      const result = await fetchAuditLog(projectId, meetingId, undefined, 1, 50);

      expect(result.next).toBeDefined();
      expect(result.previous).toBeNull();
      expect(result.count).toBe(150);
    });

    it('should handle paginated response with previous page', async () => {
      const paginatedResponse: AuditLogResponse = {
        count: 150,
        next: '/api/projects/123/meetings/456/audit-log/?page=3',
        previous: '/api/projects/123/meetings/456/audit-log/?page=1',
        results: [],
      };
      mockApi.get.mockResolvedValue({ data: paginatedResponse });

      const result = await fetchAuditLog(projectId, meetingId, undefined, 2, 50);

      expect(result.next).toBeDefined();
      expect(result.previous).toBeDefined();
    });

    it('should handle response with no entries', async () => {
      const emptyResponse: AuditLogResponse = {
        count: 0,
        next: null,
        previous: null,
        results: [],
      };
      mockApi.get.mockResolvedValue({ data: emptyResponse });

      const result = await fetchAuditLog(projectId, meetingId);

      expect(result.count).toBe(0);
      expect(result.results).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    const projectId = 123;
    const meetingId = 456;
    const mockResponse: AuditLogResponse = {
      count: 0,
      next: null,
      previous: null,
      results: [],
    };

    it('should handle page 0 gracefully', async () => {
      mockApi.get.mockResolvedValue({ data: mockResponse });

      await fetchAuditLog(projectId, meetingId, undefined, 0, 50);

      expect(mockApi.get).toHaveBeenCalledWith(
        expect.any(String),
        {
          params: {
            page: 0,
            page_size: 50,
          },
        }
      );
    });

    it('should handle very large page_size', async () => {
      mockApi.get.mockResolvedValue({ data: mockResponse });

      await fetchAuditLog(projectId, meetingId, undefined, 1, 1000);

      expect(mockApi.get).toHaveBeenCalledWith(
        expect.any(String),
        {
          params: {
            page: 1,
            page_size: 1000,
          },
        }
      );
    });

    it('should handle ISO 8601 date strings correctly', async () => {
      mockApi.get.mockResolvedValue({ data: mockResponse });

      const isoDate1 = '2026-05-01T00:00:00Z';
      const isoDate2 = '2026-05-31T23:59:59Z';

      await fetchAuditLog(projectId, meetingId, {
        from: isoDate1,
        to: isoDate2,
      });

      expect(mockApi.get).toHaveBeenCalledWith(
        expect.any(String),
        {
          params: {
            page: 1,
            page_size: 50,
            from: isoDate1,
            to: isoDate2,
          },
        }
      );
    });

    it('should not include undefined filters in params', async () => {
      mockApi.get.mockResolvedValue({ data: mockResponse });

      await fetchAuditLog(projectId, meetingId, {
        event_type: undefined,
        actor_id: undefined,
      });

      expect(mockApi.get).toHaveBeenCalledWith(
        expect.any(String),
        {
          params: {
            page: 1,
            page_size: 50,
          },
        }
      );
    });
  });
});
