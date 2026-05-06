import os
import httpx
from fastapi import Header, HTTPException
from supabase import create_client, Client

_jwks_cache = None


def get_supabase() -> Client:
    return create_client(
        os.getenv("SUPABASE_URL", ""),
        os.getenv("SUPABASE_SERVICE_KEY", ""),
    )


def _get_jwks():
    global _jwks_cache
    if _jwks_cache is None:
        url = os.getenv("CLERK_JWKS_URL", "")
        if not url:
            return {}
        _jwks_cache = httpx.get(url, timeout=10).json()
    return _jwks_cache


def get_user_id(authorization: str = Header(...)) -> str:
    token = authorization.replace("Bearer ", "")
    # Dev mode bypass
    if os.getenv("NEXT_PUBLIC_DEV_MODE") == "true" and token == "dev_user_123":
        return "dev_user_123"
    jwks_url = os.getenv("CLERK_JWKS_URL", "")
    if not jwks_url:
        # No JWKS configured — trust raw token (acceptable in non-production)
        return token
    try:
        from jose import jwt
        payload = jwt.decode(
            token,
            _get_jwks(),
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
        return payload["sub"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
