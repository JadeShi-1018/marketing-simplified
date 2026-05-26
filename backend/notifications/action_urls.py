"""Frontend route paths stored on Notification.action_url."""


def overview_action_url() -> str:
    return "/overview"


def task_action_url(task_id: int) -> str:
    return f"/tasks/{task_id}"


def meeting_action_url(meeting_id: int, project_id: int) -> str:
    return f"/meetings/{meeting_id}?project_id={project_id}"


def decision_action_url(decision_id: int, project_id: int) -> str:
    return f"/decisions/{decision_id}?project_id={project_id}"
