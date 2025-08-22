from __future__ import annotations

from urllib.parse import urlparse
import weaviate

from config import settings


def create_client():
    """Create and return a Weaviate v4 client using settings.WEAVIATE_URL.

    - Parses the URL to determine http/grpc hosts/ports and security.
    - Honors settings.WEAVIATE_SKIP_INIT_CHECKS.
    - Returns None if connection fails so callers can fallback to local mode.
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

    try:
        client = weaviate.connect_to_custom(
            http_host=http_host,
            http_port=http_port,
            http_secure=http_secure,
            grpc_host=grpc_host,
            grpc_port=grpc_port,
            grpc_secure=grpc_secure,
            skip_init_checks=settings.WEAVIATE_SKIP_INIT_CHECKS,
        )
        # Best-effort readiness check (non-fatal)
        try:
            if hasattr(client, "is_ready") and callable(getattr(client, "is_ready")):
                ready = client.is_ready()
                if not ready:
                    print("[weaviate] Client not ready; continuing (agent may use local fallback).")
        except Exception:
            # Ignore readiness probe issues; rely on operational calls to surface problems
            pass
        return client
    except Exception as e:
        print(f"[weaviate] Connection failed: {e}. Falling back to local in-memory knowledge base.")
        return None
