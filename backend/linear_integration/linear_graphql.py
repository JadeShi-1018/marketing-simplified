"""Minimal Linear GraphQL client (import flow)."""

from __future__ import annotations

import logging
from typing import Any

import requests

logger = logging.getLogger(__name__)

LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql"


class LinearGraphQLError(Exception):
    def __init__(self, message: str, errors: list | None = None):
        self.errors = errors or []
        super().__init__(message)


def linear_graphql(access_token: str, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
    token = (access_token or "").strip()
    if not token:
        raise LinearGraphQLError("Missing Linear access token")
    resp = requests.post(
        LINEAR_GRAPHQL_URL,
        json={"query": query, "variables": variables or {}},
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        timeout=60,
    )
    try:
        payload = resp.json()
    except ValueError as exc:
        raise LinearGraphQLError(f"Linear response was not JSON (HTTP {resp.status_code})") from exc
    if not resp.ok:
        err = payload.get("errors") if isinstance(payload, dict) else None
        msg = f"Linear HTTP {resp.status_code}"
        if isinstance(err, list) and err:
            first = err[0]
            if isinstance(first, dict) and first.get("message"):
                msg = str(first["message"])
            else:
                msg = f"{msg}: {first!r}"
        raise LinearGraphQLError(
            msg,
            errors=err if isinstance(err, list) else None,
        )
    if not isinstance(payload, dict):
        raise LinearGraphQLError("Linear response was not a JSON object")
    if payload.get("errors"):
        errs = payload["errors"]
        msg = errs[0].get("message", str(errs[0])) if errs else "GraphQL error"
        raise LinearGraphQLError(msg, errors=errs if isinstance(errs, list) else None)
    data = payload.get("data")
    if data is None:
        raise LinearGraphQLError("Linear response missing data")
    return data


def fetch_teams(access_token: str) -> list[dict[str, Any]]:
    query = """
    query LinearTeams {
      teams {
        nodes {
          id
          name
          key
        }
      }
    }
    """
    data = linear_graphql(access_token, query)
    teams = (data.get("teams") or {}).get("nodes") or []
    return [t for t in teams if isinstance(t, dict) and t.get("id")]


def fetch_team_issues(access_token: str, team_id: str, first: int = 100) -> list[dict[str, Any]]:
    query = """
    query LinearTeamIssues($teamId: String!, $first: Int!) {
      team(id: $teamId) {
        id
        issues(first: $first) {
          nodes {
            id
            identifier
            title
          }
        }
      }
    }
    """
    data = linear_graphql(access_token, query, {"teamId": team_id, "first": min(first, 250)})
    team = data.get("team")
    if not team:
        return []
    nodes = (team.get("issues") or {}).get("nodes") or []
    return [n for n in nodes if isinstance(n, dict) and n.get("id")]


def fetch_issue_for_import(access_token: str, issue_id: str, expected_team_id: str) -> dict[str, Any] | None:
    query = """
    query LinearIssue($id: String!) {
      issue(id: $id) {
        id
        identifier
        title
        description
        team {
          id
        }
      }
    }
    """
    data = linear_graphql(access_token, query, {"id": issue_id})
    issue = data.get("issue")
    if not isinstance(issue, dict) or not issue.get("id"):
        return None
    team = issue.get("team") or {}
    if (team.get("id") or "") != expected_team_id:
        logger.warning(
            "Linear issue %s team mismatch: expected %s got %s",
            issue_id,
            expected_team_id,
            team.get("id"),
        )
        return None
    return issue


def _issue_mutation_errors(block: dict[str, Any] | None) -> str | None:
    """Interpret IssuePayload after issueCreate/issueUpdate (no userErrors field in current Linear API)."""
    if not isinstance(block, dict):
        return "Invalid Linear mutation response"
    if block.get("success") is False:
        return (
            "Linear rejected the issue mutation (success=false). "
            "Check team access, required fields, or GraphQL errors on the response."
        )
    return None


def issue_create(
    access_token: str,
    *,
    team_id: str,
    title: str,
    description: str,
) -> str:
    query = """
    mutation LinearIssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier }
      }
    }
    """
    issue_input: dict[str, Any] = {
        "teamId": team_id,
        "title": (title or "Untitled")[:255],
    }
    if description:
        issue_input["description"] = description
    data = linear_graphql(access_token, query, {"input": issue_input})
    block = data.get("issueCreate")
    err = _issue_mutation_errors(block)
    if err:
        raise LinearGraphQLError(err)
    issue = (block or {}).get("issue") if isinstance(block, dict) else None
    if not isinstance(issue, dict) or not issue.get("id"):
        raise LinearGraphQLError("Linear issueCreate returned no issue id")
    return str(issue["id"])


def issue_update(
    access_token: str,
    *,
    issue_id: str,
    title: str,
    description: str,
) -> None:
    query = """
    mutation LinearIssueUpdate($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue { id identifier }
      }
    }
    """
    issue_input: dict[str, Any] = {"title": (title or "Untitled")[:255]}
    if description:
        issue_input["description"] = description
    data = linear_graphql(access_token, query, {"id": issue_id, "input": issue_input})
    block = data.get("issueUpdate")
    err = _issue_mutation_errors(block)
    if err:
        raise LinearGraphQLError(err)
