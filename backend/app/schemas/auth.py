from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class AuthenticatedUser(BaseModel):
    id: UUID
    email: str | None = None
    role: str = "authenticated"


class DeleteAccountRequest(BaseModel):
    confirmation: Literal["EXCLUIR"]
