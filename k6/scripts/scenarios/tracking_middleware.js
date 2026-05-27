/**
 * Tracking Middleware Stress Test — SMP-552.8
 *
 * Validates that GET /api/tasks/<id>/ (which causes the tracking
 * middleware to queue a TASK_OPEN ingest via Celery) meets SLA
 * under ramping concurrent load.
 *
 * Stages    : 50 VU → 200 VU → 500 VU, 1 min each (+ 30 s ramps)
 * Thresholds: http_req_failed < 1 %  |  p(95) < 300 ms
 *
 * NOT included: _LOADTEST_PROBE endpoint — reserved for client-path
 * follow-up (SMP-552 follow-up 3), N/A this release.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { config } from '../config.js';
import { authenticate, getAuthHeaders } from '../utils/auth.js';
import { endpoints } from '../utils/endpoints.js';

// ---------------------------------------------------------------------------
// Test options
// ---------------------------------------------------------------------------

export const options = {
  stages: [
    { duration: '30s', target: 50 },   // ramp → 50 VU
    { duration: '1m',  target: 50 },   // hold  50 VU × 1 min
    { duration: '30s', target: 200 },  // ramp → 200 VU
    { duration: '1m',  target: 200 },  // hold 200 VU × 1 min
    { duration: '30s', target: 500 },  // ramp → 500 VU
    { duration: '1m',  target: 500 },  // hold 500 VU × 1 min
    { duration: '30s', target: 0 },    // cool-down
  ],
  thresholds: {
    http_req_failed:   ['rate<0.01'],   // < 1 % errors
    http_req_duration: ['p(95)<300'],   // p95 < 300 ms
  },
  tags: { test_type: 'tracking_middleware_stress' },
};

// ---------------------------------------------------------------------------
// setup — runs once before any VU starts
// ---------------------------------------------------------------------------

export function setup() {
  var token = authenticate(http);
  if (!token) {
    console.warn('setup: auth failed — falling back to task IDs 1-50');
    return { taskIds: buildFallback() };
  }

  var res = http.get(
    config.baseURL + '/api/tasks/?page_size=50',
    { headers: getAuthHeaders(token) }
  );

  var taskIds = [];
  if (res.status === 200) {
    try {
      var body = JSON.parse(res.body);
      var rows = Array.isArray(body) ? body : (body.results || []);
      for (var i = 0; i < rows.length; i++) {
        taskIds.push(rows[i].id);
      }
    } catch (_) {}
  }

  if (taskIds.length === 0) {
    console.warn('setup: no tasks found — falling back to task IDs 1-50');
    taskIds = buildFallback();
  }

  console.log('setup: ' + taskIds.length + ' task IDs loaded');
  return { taskIds: taskIds };
}

function buildFallback() {
  var ids = [];
  for (var i = 1; i <= 50; i++) { ids.push(i); }
  return ids;
}

// ---------------------------------------------------------------------------
// Per-VU token cache — each VU authenticates once on its first iteration.
// k6 gives every VU its own JS context, so this module-level variable is
// isolated per VU.
// ---------------------------------------------------------------------------

var _vuToken = null;

function getToken() {
  if (_vuToken === null) {
    _vuToken = authenticate(http);
  }
  return _vuToken;
}

// ---------------------------------------------------------------------------
// Default function — runs once per VU per iteration
// ---------------------------------------------------------------------------

export default function(data) {
  var token = getToken();
  if (!token) {
    sleep(1);
    return;
  }

  var taskIds = data.taskIds;
  var taskId  = taskIds[Math.floor(Math.random() * taskIds.length)];

  var res = http.get(
    endpoints.tasks.detail(taskId),
    {
      headers: getAuthHeaders(token),
      tags: { name: 'task_detail', scenario: 'middleware_stress' },
    }
  );

  check(res, {
    'task detail 200 or 404': function(r) { return r.status === 200 || r.status === 404; },
  });

  // Think-time: 500–1000 ms (realistic browser pacing)
  sleep(0.5 + Math.random() * 0.5);
}

// ---------------------------------------------------------------------------
// teardown
// ---------------------------------------------------------------------------

export function teardown(data) {
  console.log(
    'tracking_middleware stress test complete. ' +
    'Task IDs used: ' + data.taskIds.length
  );
}
