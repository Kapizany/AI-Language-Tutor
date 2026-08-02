from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.api.dependencies import AdminDependency, AdminUserDependency
from app.schemas.admin import (
    AdminAuditLogEntry,
    AdminFeatureUsage,
    AdminOverview,
    AdminUserListItem,
    AdminUserSummary,
    ChangePlanRequest,
    SetAccountStatusRequest,
)
from app.schemas.auth import AuthenticatedUser
from app.services.admin import AdminServiceError

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


@router.get("/me", response_model=AuthenticatedUser)
async def admin_me(
    user: AdminUserDependency,
) -> AuthenticatedUser:
    return user


@router.get("/overview", response_model=AdminOverview)
async def admin_overview(
    admin_service: AdminDependency,
    user: AdminUserDependency,
) -> AdminOverview:
    try:
        payload = await admin_service.get_overview(actor_user_id=user.id)
    except AdminServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    return AdminOverview.model_validate(payload)


@router.get("/users", response_model=list[AdminUserListItem])
async def admin_users(
    admin_service: AdminDependency,
    user: AdminUserDependency,
    q: str = Query(default="", max_length=200),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[AdminUserListItem]:
    try:
        rows = await admin_service.search_users(
            actor_user_id=user.id,
            query=q.strip(),
            limit=limit,
            offset=offset,
        )
    except AdminServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    return [AdminUserListItem.model_validate(row) for row in rows]


@router.get("/users/{user_id}", response_model=AdminUserSummary)
async def admin_user_detail(
    user_id: UUID,
    admin_service: AdminDependency,
    user: AdminUserDependency,
) -> AdminUserSummary:
    try:
        payload = await admin_service.get_user_summary(
            actor_user_id=user.id,
            target_user_id=user_id,
        )
    except AdminServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    summary = AdminUserSummary.model_validate(payload)
    if summary.user_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return summary


@router.patch("/users/{user_id}/plan")
async def admin_change_plan(
    user_id: UUID,
    payload: ChangePlanRequest,
    admin_service: AdminDependency,
    user: AdminUserDependency,
) -> dict[str, object]:
    try:
        result = await admin_service.change_user_plan(
            actor_user_id=user.id,
            target_user_id=user_id,
            plan_id=payload.plan_id,
        )
    except AdminServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    if not result.get("updated"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("reason", "Plan update failed."),
        )
    return result


@router.patch("/users/{user_id}/status")
async def admin_change_status(
    user_id: UUID,
    payload: SetAccountStatusRequest,
    admin_service: AdminDependency,
    user: AdminUserDependency,
) -> dict[str, object]:
    try:
        result = await admin_service.set_account_status(
            actor_user_id=user.id,
            target_user_id=user_id,
            status=payload.status,
            reason=payload.reason,
        )
    except AdminServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    if not result.get("updated"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("reason", "Status update failed."),
        )
    return result


@router.get("/features", response_model=list[AdminFeatureUsage])
async def admin_features(
    admin_service: AdminDependency,
    user: AdminUserDependency,
) -> list[AdminFeatureUsage]:
    try:
        rows = await admin_service.get_feature_usage(actor_user_id=user.id)
    except AdminServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    return [AdminFeatureUsage.model_validate(row) for row in rows]


@router.get("/audit", response_model=list[AdminAuditLogEntry])
async def admin_audit(
    admin_service: AdminDependency,
    user: AdminUserDependency,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[AdminAuditLogEntry]:
    try:
        rows = await admin_service.list_audit_logs(
            actor_user_id=user.id,
            limit=limit,
            offset=offset,
        )
    except AdminServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    return [AdminAuditLogEntry.model_validate(row) for row in rows]
