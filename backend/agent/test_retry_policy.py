from unittest.mock import MagicMock, patch
from agent.executors import AnalyzeDataExecutor, CallLLMExecutor, DetectColumnsExecutor
from django.test import TestCase

class _WorkflowRunStub:
    def __init__(self):
        self.id = "run-1"
        self.status = "creating_tasks"
        self.analysis_result = {"anomalies": [{"metric": "ROAS"}]}
        self.created_tasks = []
        self.decision = None
        self.decision_id = None
        self.miro_snapshot = None
        self.miro_board = None
        self.saved_update_fields = []
        self.success_criteria = None

    def save(self, update_fields=None):
        self.saved_update_fields.append(update_fields)

class _SessionStub:
    def __init__(self):
        self.id = "session-1"
        self.title = "Analysis session"
        self.approval_required = False
        self.project = type("ProjectStub", (), {"id": 99})()
        self.user = type("UserStub", (), {"id": 7, "is_authenticated": True})()
        messages = [
            type("MessageStub", (), {"role": "user", "content": "Analyze this"})(),
            type("MessageStub", (), {"role": "assistant", "content": "Found anomalies"})(),
        ]
        self.messages = type("MessageManagerStub", (), {"order_by": lambda self, *_args: messages})()

    def refresh_from_db(self, *args, **kwargs):
        # Agent approval gate expects a Django model; unit tests use a stub.
        return None

class _StepStub:
    def __init__(self, step_type):
        self.step_type = step_type
        self.config = {}

class _OrchestratorStub:
    def __init__(self):
        self.user = type("UserStub", (), {"id": 7})()
        self.project = type("ProjectStub", (), {"id": 99})()
        self.session = _SessionStub()
    

class LLMRetryPolicyTests(TestCase):
    @patch('agent.executors.time.sleep')
    @patch('agent.services._run_analysis')
    def test_call_llm_retries_out_success(self, mock_run_analysis, mock_sleep):
        step = _StepStub('analyze_data')
        orchestrator = _OrchestratorStub()
        workflow_run = _WorkflowRunStub()
        executor = AnalyzeDataExecutor(step, workflow_run, orchestrator)
        mock_run_analysis.side_effect = [RuntimeError('API timeout'), RuntimeError('API timeout'), {"recommended_tasks": [], "recommended_decision_tree": {}}]

        result = executor.execute({'spreadsheet_data': 'some data'})
        self.assertEqual(mock_run_analysis.call_count, 3)
        self.assertTrue(result.success)
    
    
    @patch('agent.executors.time.sleep')
    @patch('agent.services._run_analysis')
    def test_call_llm_retries_out_failure_failed_step(self, mock_run_analysis, mock_sleep):
        step = _StepStub('analyze_data')
        orchestrator = _OrchestratorStub()
        workflow_run = _WorkflowRunStub()
        executor = AnalyzeDataExecutor(step, workflow_run, orchestrator)
        mock_run_analysis.side_effect = [RuntimeError('API timeout'), RuntimeError('API timeout'), RuntimeError('API timeout')]

        result = executor.execute({'spreadsheet_data': 'some data'})
        self.assertEqual(mock_run_analysis.call_count, 3)
        self.assertFalse(result.success)
        self.assertFalse(result.skipped)


    @patch('agent.executors.time.sleep')
    @patch('agent.column_registry.detect_columns') 
    def test_call_llm_retries_out_failure_skip_step(self, mock_detect_columns, mock_sleep):
        step = _StepStub('detect_columns')
        orchestrator = _OrchestratorStub()
        workflow_run = _WorkflowRunStub()
        executor = DetectColumnsExecutor(step, workflow_run, orchestrator)
        mock_detect_columns.side_effect = [
        RuntimeError('API timeout'),
        RuntimeError('API timeout'),
        RuntimeError('API timeout'),
        ] 
        result = executor.execute({'spreadsheet_data': {'sheets': [{'columns': ['a', 'b'], 'rows': []}]}})
        self.assertEqual(mock_detect_columns.call_count, 3)
        self.assertFalse(result.success)
        self.assertTrue(result.skipped)
    
    
    @patch('agent.services._call_llm')
    @patch('agent.services._get_llm_client')
    def test_call_llm_success_unused_retries(self, mock_get_client, mock_call_llm):
        mock_get_client.return_value = MagicMock()
        mock_call_llm.return_value = {"result": "analysis complete"}

        step = _StepStub('call_llm')
        orchestrator = _OrchestratorStub()
        workflow_run = _WorkflowRunStub()
        executor = CallLLMExecutor(step, workflow_run, orchestrator)
        result = executor.execute({'spreadsheet_data': 'some data'})
        self.assertTrue(result.success)
        self.assertEqual(mock_call_llm.call_count, 1)




    









