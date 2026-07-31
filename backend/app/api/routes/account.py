from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.api.dependencies import AccountDependency
from app.core.security import get_current_user
from app.schemas.auth import AuthenticatedUser, DeleteAccountRequest
from app.services.account import AccountDeletionError, AccountDeletionUnavailableError

router = APIRouter(prefix="/api/v1", tags=["account"])


@router.get("/me", response_model=AuthenticatedUser)
async def me(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> AuthenticatedUser:
    return user


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    payload: DeleteAccountRequest,
    account_service: AccountDependency,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> Response:
    try:
        await account_service.delete_user(user.id)
    except AccountDeletionUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="A exclusão de conta não está configurada.",
        ) from exc
    except AccountDeletionError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Não foi possível excluir a conta no momento.",
        ) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
