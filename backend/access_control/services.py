from typing import Dict, List, Optional, TypedDict

from core.models import Permission, Project, ProjectMember, Role
from access_control.models import RolePermission


MODULE_LABELS = {
    "ASSET": "Asset Management",
    "CAMPAIGN": "Campaign Execution",
    "BUDGET_REQUEST": "Budget Request",
    "BUDGET_POOL": "Budget Pool",
    "BUDGET_ESCALATION": "Budget Escalation",
    "QUEUE": "Queue",
    "SUPPORT_TEAM": "Support Team",
    "TICKET": "Ticket",
    "INVITATION": "Invitation",
    "REPORT": "Report",
}


class MatrixRole(TypedDict):
    id: str
    name: str
    description: str
    rank: int
    organizationId: Optional[str]
    isReadOnly: bool


class MatrixPermission(TypedDict):
    id: str
    name: str
    description: str
    module: str
    action: str


class MatrixWarning(TypedDict, total=False):
    code: str
    message: str
    roleId: str
    permissionId: str


class ProjectPermissionMatrixResponse(TypedDict):
    projectId: str
    projectName: str
    organizationId: Optional[str]
    roles: List[MatrixRole]
    permissions: List[MatrixPermission]
    matrix: Dict[str, Dict[str, bool]]
    warnings: List[MatrixWarning]


def permission_key(permission: Permission) -> str:
    return f"{permission.module.lower()}_{permission.action.lower()}"


def serialize_permission(permission: Permission) -> MatrixPermission:
    module_label = MODULE_LABELS.get(permission.module, permission.module)
    action_label = permission.action.capitalize()
    return {
        "id": permission_key(permission),
        "name": f"{action_label} {module_label}",
        "description": f"{action_label} access for {module_label} module",
        "module": module_label,
        "action": action_label,
    }


def serialize_role(role: Role) -> MatrixRole:
    return {
        "id": str(role.id),
        "name": role.name,
        "description": f"Role: {role.name}",
        "rank": role.level,
        "organizationId": str(role.organization_id) if role.organization_id else None,
        "isReadOnly": False,
    }


def get_project_permission_matrix(project_id: int) -> ProjectPermissionMatrixResponse:
    project = Project.objects.select_related("organization").get(
        id=project_id,
        is_deleted=False,
    )

    roles = list(
        Role.objects.filter(is_deleted=False)
        .filter(organization__isnull=True)
        .order_by("level", "name")
    )
    if project.organization_id:
        roles.extend(
            Role.objects.filter(
                organization_id=project.organization_id,
                is_deleted=False,
            ).order_by("level", "name")
        )

    permissions = list(Permission.objects.filter(is_deleted=False).order_by("module", "action"))
    permission_ids_by_pk = {permission.id: permission_key(permission) for permission in permissions}
    matrix: Dict[str, Dict[str, bool]] = {
        str(role.id): {permission_key(permission): False for permission in permissions}
        for role in roles
    }

    role_permissions = (
        RolePermission.objects.select_related("permission", "role")
        .filter(role__in=roles, permission__in=permissions, is_deleted=False)
    )
    for role_permission in role_permissions:
        role_id = str(role_permission.role_id)
        permission_id = permission_ids_by_pk.get(role_permission.permission_id)
        if role_id in matrix and permission_id:
            matrix[role_id][permission_id] = True

    warnings: List[MatrixWarning] = []
    if not project.organization_id:
        warnings.append({
            "code": "PROJECT_WITHOUT_ORGANIZATION",
            "message": "This project is not linked to an organization, so only system roles are included.",
        })

    role_names = {role.name.lower(): str(role.id) for role in roles}
    project_members = ProjectMember.objects.filter(
        project=project,
        is_active=True,
        is_deleted=False,
    )
    for member in project_members:
        if member.role and member.role.lower() not in role_names:
            warnings.append({
                "code": "PROJECT_MEMBER_ROLE_UNMAPPED",
                "message": f'Project member role "{member.role}" does not match an access-control role.',
            })

    granted_permission_role_ids = set(
        role_permissions.values_list("role_id", flat=True).distinct()
    )
    for role in roles:
        if role.id not in granted_permission_role_ids:
            warnings.append({
                "code": "ROLE_WITHOUT_PERMISSIONS",
                "message": f'Role "{role.name}" has no explicit permissions.',
                "roleId": str(role.id),
            })

    return {
        "projectId": str(project.id),
        "projectName": project.name,
        "organizationId": str(project.organization_id) if project.organization_id else None,
        "roles": [serialize_role(role) for role in roles],
        "permissions": [serialize_permission(permission) for permission in permissions],
        "matrix": matrix,
        "warnings": warnings,
    }
