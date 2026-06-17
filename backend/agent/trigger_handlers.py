"""
Specialized handlers for each trigger type.
"""

import hashlib
import hmac
import logging
from datetime import timedelta
from typing import Dict, Any

from django.utils import timezone

from .models import AgentWorkflowDefinition
from .trigger_service import TriggerExecutionService

logger = logging.getLogger(__name__)


class PollingHandler:
    """
    Handler for polling triggers.
    Checks external service data sources periodically and triggers workflows when changes are detected.

    Supported external services: zoom, google_sheets, linear, notion
    Internal events (task, decision, spreadsheet uploads) are handled exclusively by InstantHandler.
    """

    @staticmethod
    def check_all_polling_workflows():
        """
        Check all workflows with polling triggers enabled.
        Called by Celery beat every 5 minutes.
        """
        now = timezone.now()

        workflows = AgentWorkflowDefinition.objects.filter(
            is_deleted=False,
            status='active',
            trigger_config__trigger_type='polling',
        )

        triggered_count = 0
        for workflow in workflows:
            try:
                interval_minutes = workflow.trigger_config.get('polling', {}).get('interval_minutes', 30)

                # Check if it's time to poll this workflow
                state = getattr(workflow, 'trigger_state', None)
                if state and state.last_polling_check:
                    time_since_last = now - state.last_polling_check
                    if time_since_last < timedelta(minutes=interval_minutes):
                        continue  # Not time yet

                # Check configured external services
                external_services = workflow.trigger_config.get('polling', {}).get('external_services', [])

                checker_map = {
                    'zoom': PollingHandler._check_zoom_changes,
                    'google_sheets': PollingHandler._check_google_sheets_changes,
                    'linear': PollingHandler._check_linear_changes,
                    'notion': PollingHandler._check_notion_changes,
                }

                for service in external_services:
                    checker = checker_map.get(service)
                    if checker and checker(workflow):
                        triggered_count += 1
                        break

            except Exception:
                logger.exception(f"Error checking polling workflow {workflow.id}")

        logger.info(f"Polling check complete: {triggered_count} workflows triggered")
        return triggered_count

    @staticmethod
    def _get_since(workflow: AgentWorkflowDefinition):
        """Return the datetime to use as the lower bound for change detection."""
        state = getattr(workflow, 'trigger_state', None)
        return state.last_polling_check if (state and state.last_polling_check) else timezone.now() - timedelta(hours=1)

    @staticmethod
    def _check_zoom_changes(workflow: AgentWorkflowDefinition) -> bool:
        """Check for new Zoom recordings since last poll."""
        since = PollingHandler._get_since(workflow)
        try:
            from zoom_integration.services import zoom_api_get, get_valid_credential

            cred = get_valid_credential(workflow.created_by)
            if not cred:
                logger.info(f"No Zoom credentials for user {workflow.created_by_id}, skipping")
                return False

            since_date = since.strftime('%Y-%m-%d')
            result = zoom_api_get(workflow.created_by, f'users/me/recordings?from={since_date}')
            meetings = result.get('meetings', [])

            if meetings:
                meeting = meetings[0]
                TriggerExecutionService.execute_workflow_trigger(
                    workflow_id=str(workflow.id),
                    trigger_type='polling',
                    trigger_context={
                        'event_type': 'zoom.recording_ready',
                        'meeting_id': str(meeting.get('id', '')),
                        'meeting_topic': meeting.get('topic', ''),
                        'recording_count': len(meetings),
                    },
                    user=workflow.created_by,
                    project=workflow.project,
                )
                return True

        except ImportError:
            logger.warning("zoom_integration app not available")
        except Exception as e:
            logger.exception(f"Error checking Zoom changes for workflow {workflow.id}: {e}")

        return False

    @staticmethod
    def _check_google_sheets_changes(workflow: AgentWorkflowDefinition) -> bool:
        """Check for Google Sheets files modified since last poll."""
        since = PollingHandler._get_since(workflow)
        try:
            import requests as http
            from google_docs_integration.models import GoogleDocsConnection
            from google_docs_integration.services import get_access_token_for_api

            connection = GoogleDocsConnection.objects.filter(user=workflow.created_by).first()
            if not connection:
                logger.info(f"No Google Docs connection for user {workflow.created_by_id}, skipping")
                return False

            access_token = get_access_token_for_api(connection)
            since_str = since.strftime('%Y-%m-%dT%H:%M:%S.000Z')

            resp = http.get(
                'https://www.googleapis.com/drive/v3/files',
                params={
                    'q': (
                        f"mimeType='application/vnd.google-apps.spreadsheet'"
                        f" and modifiedTime > '{since_str}'"
                    ),
                    'fields': 'files(id,name,modifiedTime)',
                    'pageSize': 5,
                },
                headers={'Authorization': f'Bearer {access_token}'},
                timeout=30,
            )
            resp.raise_for_status()
            files = resp.json().get('files', [])

            if files:
                file = files[0]
                TriggerExecutionService.execute_workflow_trigger(
                    workflow_id=str(workflow.id),
                    trigger_type='polling',
                    trigger_context={
                        'event_type': 'google_sheets.modified',
                        'file_id': file.get('id', ''),
                        'file_name': file.get('name', ''),
                        'modified_count': len(files),
                    },
                    user=workflow.created_by,
                    project=workflow.project,
                )
                return True

        except ImportError:
            logger.warning("google_docs_integration app not available")
        except Exception as e:
            logger.exception(f"Error checking Google Sheets changes for workflow {workflow.id}: {e}")

        return False

    @staticmethod
    def _check_linear_changes(workflow: AgentWorkflowDefinition) -> bool:
        """Check for Linear issues updated since last poll."""
        since = PollingHandler._get_since(workflow)
        try:
            import requests as http
            from linear_integration.services import get_linear_access_token

            access_token = get_linear_access_token(workflow.created_by)
            if not access_token:
                logger.info(f"No Linear credentials for user {workflow.created_by_id}, skipping")
                return False

            since_str = since.isoformat()
            query = """
            query RecentIssues($since: DateTimeComparator) {
                issues(filter: { updatedAt: $since }, first: 5, orderBy: updatedAt) {
                    nodes { id title state { name } updatedAt }
                }
            }
            """
            resp = http.post(
                'https://api.linear.app/graphql',
                json={'query': query, 'variables': {'since': {'gte': since_str}}},
                headers={'Authorization': access_token, 'Content-Type': 'application/json'},
                timeout=30,
            )
            resp.raise_for_status()
            issues = resp.json().get('data', {}).get('issues', {}).get('nodes', [])

            if issues:
                issue = issues[0]
                TriggerExecutionService.execute_workflow_trigger(
                    workflow_id=str(workflow.id),
                    trigger_type='polling',
                    trigger_context={
                        'event_type': 'linear.issue_updated',
                        'issue_id': issue.get('id', ''),
                        'issue_title': issue.get('title', ''),
                        'issue_status': issue.get('state', {}).get('name', ''),
                        'updated_count': len(issues),
                    },
                    user=workflow.created_by,
                    project=workflow.project,
                )
                return True

        except ImportError:
            logger.warning("linear_integration app not available")
        except Exception as e:
            logger.exception(f"Error checking Linear changes for workflow {workflow.id}: {e}")

        return False

    @staticmethod
    def _check_notion_changes(workflow: AgentWorkflowDefinition) -> bool:
        """Check for Notion pages edited since last poll."""
        since = PollingHandler._get_since(workflow)
        try:
            import requests as http
            from datetime import datetime, timezone as dt_tz
            from notion_editor.models import NotionConnection

            connection = NotionConnection.objects.filter(user=workflow.created_by).first()
            if not connection:
                logger.info(f"No Notion connection for user {workflow.created_by_id}, skipping")
                return False

            resp = http.post(
                'https://api.notion.com/v1/search',
                json={
                    'filter': {'value': 'page', 'property': 'object'},
                    'sort': {'direction': 'descending', 'timestamp': 'last_edited_time'},
                    'page_size': 10,
                },
                headers={
                    'Authorization': f'Bearer {connection.access_token}',
                    'Notion-Version': '2022-06-28',
                    'Content-Type': 'application/json',
                },
                timeout=30,
            )
            resp.raise_for_status()

            results = resp.json().get('results', [])
            recent = []
            for page in results:
                last_edited_raw = page.get('last_edited_time', '')
                if not last_edited_raw:
                    continue
                last_edited_dt = datetime.fromisoformat(last_edited_raw.replace('Z', '+00:00'))
                if last_edited_dt > since:
                    recent.append(page)

            if recent:
                page = recent[0]
                title_parts = (
                    page.get('properties', {})
                    .get('title', {})
                    .get('title', [{}])
                )
                page_title = title_parts[0].get('plain_text', 'Untitled') if title_parts else 'Untitled'
                TriggerExecutionService.execute_workflow_trigger(
                    workflow_id=str(workflow.id),
                    trigger_type='polling',
                    trigger_context={
                        'event_type': 'notion.page_updated',
                        'page_id': page.get('id', ''),
                        'page_title': page_title,
                        'updated_count': len(recent),
                    },
                    user=workflow.created_by,
                    project=workflow.project,
                )
                return True

        except ImportError:
            logger.warning("notion_editor app not available")
        except Exception as e:
            logger.exception(f"Error checking Notion changes for workflow {workflow.id}: {e}")

        return False


class InstantHandler:
    """
    Handler for instant (event-driven) triggers.
    Responds to Django signals and webhooks.
    """

    @staticmethod
    def handle_internal_event(event_type: str, event_data: Dict[str, Any]):
        """
        Handle internal Django signal events.
        Called from signal handlers in task/signals.py, decision/signals.py, etc.
        """
        # Find workflows listening to this event type
        workflows = AgentWorkflowDefinition.objects.filter(
            is_deleted=False,
            status='active',
            trigger_config__trigger_type='instant',
            trigger_config__instant__event_types__contains=[event_type],
        )

        for workflow in workflows:
            try:
                TriggerExecutionService.execute_workflow_trigger(
                    workflow_id=str(workflow.id),
                    trigger_type='instant',
                    trigger_context={
                        'event_type': event_type,
                        **event_data,
                    },
                    user=workflow.created_by,
                    project=workflow.project,
                )
            except Exception:
                logger.exception(f"Error handling instant trigger for workflow {workflow.id}")

    @staticmethod
    def handle_webhook(workflow_id: str, payload: Dict[str, Any], signature: str) -> bool:
        """
        Handle external webhook.
        Validates signature and triggers workflow.
        """
        try:
            workflow = AgentWorkflowDefinition.objects.get(
                id=workflow_id,
                is_deleted=False,
                status='active',
            )

            # Validate signature
            webhook_config = workflow.trigger_config.get('instant', {})
            if not webhook_config.get('webhook_enabled'):
                logger.warning(f"Webhook disabled for workflow {workflow_id}")
                return False

            secret = webhook_config.get('webhook_secret', '')
            if not InstantHandler._validate_webhook_signature(payload, signature, secret):
                logger.warning(f"Invalid webhook signature for workflow {workflow_id}")
                return False

            # Trigger workflow
            TriggerExecutionService.execute_workflow_trigger(
                workflow_id=workflow_id,
                trigger_type='instant',
                trigger_context={
                    'event_type': 'webhook.received',
                    'webhook_source': payload.get('source', 'unknown'),
                    'webhook_payload': payload,
                },
                user=workflow.created_by,
                project=workflow.project,
            )
            return True

        except AgentWorkflowDefinition.DoesNotExist:
            logger.error(f"Workflow {workflow_id} not found for webhook")
            return False
        except Exception:
            logger.exception(f"Error handling webhook for workflow {workflow_id}")
            return False

    @staticmethod
    def _validate_webhook_signature(payload: Dict[str, Any], signature: str, secret: str) -> bool:
        """Validate webhook signature using HMAC-SHA256."""
        if not secret or not signature:
            return False

        import json
        payload_str = json.dumps(payload, sort_keys=True)
        expected_signature = hmac.new(
            secret.encode(),
            payload_str.encode(),
            hashlib.sha256,
        ).hexdigest()

        return hmac.compare_digest(signature, expected_signature)


class ScheduledHandler:
    """
    Handler for scheduled (cron-based) triggers.
    """

    @staticmethod
    def check_all_scheduled_workflows():
        """
        Check all workflows with scheduled triggers.
        Called by Celery beat every minute.
        """
        now = timezone.now()

        # Find workflows whose next_scheduled_run is due
        workflows = AgentWorkflowDefinition.objects.filter(
            is_deleted=False,
            status='active',
            trigger_config__trigger_type='scheduled',
            trigger_state__next_scheduled_run__lte=now,
        ).select_related('trigger_state')

        triggered_count = 0
        for workflow in workflows:
            try:
                TriggerExecutionService.execute_workflow_trigger(
                    workflow_id=str(workflow.id),
                    trigger_type='scheduled',
                    trigger_context={
                        'event_type': 'scheduled.cron',
                        'scheduled_time': now.isoformat(),
                    },
                    user=workflow.created_by,
                    project=workflow.project,
                )
                triggered_count += 1
            except Exception:
                logger.exception(f"Error triggering scheduled workflow {workflow.id}")

        logger.info(f"Scheduled check complete: {triggered_count} workflows triggered")
        return triggered_count


class ManualHandler:
    """
    Handler for manual triggers.
    """

    @staticmethod
    def trigger_manual(workflow_id: str, user, project=None) -> bool:
        """
        Manually trigger a workflow.
        """
        try:
            workflow_run_id = TriggerExecutionService.execute_workflow_trigger(
                workflow_id=workflow_id,
                trigger_type='manual',
                trigger_context={
                    'event_type': 'manual.user_triggered',
                    'user_id': user.id,
                },
                user=user,
                project=project,
            )
            return workflow_run_id is not None
        except Exception:
            logger.exception(f"Error triggering manual workflow {workflow_id}")
            return False
