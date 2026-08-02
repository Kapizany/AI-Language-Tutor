import httpx


async def fetch_google_access_token(client: httpx.AsyncClient) -> str | None:
    try:
        response = await client.get(
            "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
            headers={"Metadata-Flavor": "Google"},
            timeout=2.0,
        )
        response.raise_for_status()
        token = response.json().get("access_token")
        return str(token) if token else None
    except (httpx.HTTPError, KeyError, TypeError, ValueError):
        return None
