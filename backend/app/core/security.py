from functools import lru_cache
from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from app.core.config import Settings, get_settings
from app.schemas.auth import AuthenticatedUser

bearer = HTTPBearer(auto_error=False)


class TokenVerifier:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.jwks_client = PyJWKClient(settings.supabase_jwks_url, cache_keys=True)

    def verify(self, token: str) -> dict[str, Any]:
        try:
            header = jwt.get_unverified_header(token)
            algorithm = str(header.get("alg", ""))
            if algorithm not in {"RS256", "ES256", "HS256"}:
                raise jwt.InvalidAlgorithmError
            if algorithm == "HS256":
                if not self.settings.supabase_jwt_secret:
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="Legacy JWT verification is not configured.",
                    )
                key: str | Any = self.settings.supabase_jwt_secret
            else:
                key = self.jwks_client.get_signing_key_from_jwt(token).key

            claims: dict[str, Any] = jwt.decode(
                token,
                key,
                algorithms=[algorithm],
                audience="authenticated",
                issuer=self.settings.supabase_issuer,
                options={"require": ["exp", "sub", "role"]},
            )
            if claims.get("role") != "authenticated":
                raise jwt.InvalidTokenError
            return claims
        except HTTPException:
            raise
        except jwt.PyJWTError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired access token.",
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc


@lru_cache
def get_token_verifier() -> TokenVerifier:
    return TokenVerifier(get_settings())


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> AuthenticatedUser:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    claims = get_token_verifier().verify(credentials.credentials)
    return AuthenticatedUser(
        id=claims["sub"],
        email=claims.get("email"),
        role=claims.get("role", "authenticated"),
    )
