"""
Centralized configuration for the local_code_agent project.

Values are read from environment variables with sensible defaults so the
project can run out-of-the-box while remaining configurable in different
environments.
"""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    # The default URL required by the previous issue/task
    WEAVIATE_URL: str = os.getenv("WEAVIATE_URL", "http://100.66.227.18:8080/")

    # Agent type selector to allow future scalability (e.g., "agno", "mock")
    AGENT_TYPE: str = os.getenv("AGENT_TYPE", "agno")

    # Path to the codebase to ingest (Spring Boot project root by default).
    CODE_PATH: str = os.getenv("CODE_PATH", ".")

    # Collection / class name to store code knowledge in the vector DB
    COLLECTION_NAME: str = os.getenv("COLLECTION_NAME", "code_knowledge")

    # Optional: toggle schema ensure for Weaviate
    ENSURE_SCHEMA: bool = os.getenv("ENSURE_SCHEMA", "true").lower() in {"1", "true", "yes"}

    # Skip Weaviate client's initialization checks (useful if gRPC health-check fails)
    WEAVIATE_SKIP_INIT_CHECKS: bool = os.getenv("WEAVIATE_SKIP_INIT_CHECKS", "true").lower() in {"1", "true", "yes"}


settings = Settings()
