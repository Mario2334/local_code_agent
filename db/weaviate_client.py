from __future__ import annotations

from urllib.parse import urlparse
import weaviate

from config import settings


def create_client():
    """Create and return a Weaviate v4 client using settings.WEAVIATE_URL.

    - Parses the URL to determine http/grpc hosts/ports and security.
    - Honors settings.WEAVIATE_SKIP_INIT_CHECKS.
    """
    parsed = urlparse(settings.WEAVIATE_URL or "")
    if not parsed.scheme:
        # Allow plain host[:port] input; default to http
        parsed = urlparse(f"http://{settings.WEAVIATE_URL}")
    http_host = parsed.hostname or "localhost"
    http_port = parsed.port or (443 if parsed.scheme == "https" else 8080)
    http_secure = parsed.scheme == "https"

    # Heuristic defaults for gRPC: local installs typically use 50051 insecure; HTTPS endpoints often use 443 secure
    grpc_host = http_host
    if http_secure:
        grpc_port = 443
        grpc_secure = True
    else:
        grpc_port = 50051
        grpc_secure = False

    client = weaviate.connect_to_custom(
        http_host=http_host,
        http_port=http_port,
        http_secure=http_secure,
        grpc_host=grpc_host,
        grpc_port=grpc_port,
        grpc_secure=grpc_secure,
        skip_init_checks=settings.WEAVIATE_SKIP_INIT_CHECKS,
    )
    return client
