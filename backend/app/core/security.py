"""
Security utilities for the FastAPI application.

get_client_ip — resolves the real client IP from a request.  X-Forwarded-For
                is only honoured when the TRUST_PROXY setting is True, preventing
                rate-limit bypass via header spoofing on direct-connection deployments.
"""

from starlette.requests import Request

from app.core.config import settings


def get_client_ip(request: Request) -> str | None:
    """
    Resolve the originating client IP address from a FastAPI/Starlette Request.

    Resolution order:
    1. ``X-Forwarded-For`` header — honoured ONLY when ``settings.TRUST_PROXY``
       is ``True``.  Only the *first* address in the comma-separated list is used,
       as it represents the original client IP before any intermediate hops.
       Set TRUST_PROXY=true only when a trusted reverse proxy (Nginx, Traefik,
       AWS ALB, DO Load Balancer) is the sole public entry point AND it
       overwrites/strips client-supplied XFF headers.  When TRUST_PROXY is False
       (the default) this header is ignored entirely to prevent rate-limit bypass
       via spoofed XFF values.
    2. ``request.client.host`` — the TCP-level peer address provided by the ASGI
       server.  Present for direct connections; may be ``None`` behind Unix-socket
       proxies or in certain test environments.
    3. ``None`` — returned when neither source yields an IP.  Callers MUST reject
       the request (HTTP 400) rather than fall back to a shared bucket that could
       be exploited for rate-limit bypass.

    Args:
        request: The incoming Starlette/FastAPI request object.

    Returns:
        A non-empty IP address string, or ``None`` if unresolvable.
    """
    if settings.TRUST_PROXY:
        xff: str | None = request.headers.get("X-Forwarded-For")
        if xff:
            first_ip = xff.split(",")[0].strip()
            if first_ip:
                return first_ip

    if request.client is not None and request.client.host:
        return request.client.host

    return None
