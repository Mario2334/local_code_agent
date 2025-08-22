"""
Centralized configuration for the local_code_agent project.

Values are read from environment variables with sensible defaults so the
project can run out-of-the-box while remaining configurable in different
environments.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

# Load environment variables from a .env file if present
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    # python-dotenv is optional; if not installed, we simply skip loading .env
    pass


@dataclass(frozen=True)
class Settings:
    # The default URL required by the previous issue/task
    WEAVIATE_URL: str = os.getenv("WEAVIATE_URL", "http://100.66.227.18:8080/")

    # Agent type selector to allow future scalability (e.g., "agno", "mock")
    AGENT_TYPE: str = os.getenv("AGENT_TYPE", "agno")

    # Path to the codebase to ingest (Spring Boot project root by default).
    CODE_PATH: str = os.getenv("CODE_PATH", ".")
    CODE_PATH = "/Users/sanket/projects/pakama/pakama_be"

    # Collection / class name to store code knowledge in the vector DB
    COLLECTION_NAME: str = os.getenv("COLLECTION_NAME", "code_knowledge")

    # Optional: toggle schema ensure for Weaviate
    ENSURE_SCHEMA: bool = os.getenv("ENSURE_SCHEMA", "true").lower() in {"1", "true", "yes"}

    # Skip Weaviate client's initialization checks (useful if gRPC health-check fails)
    WEAVIATE_SKIP_INIT_CHECKS: bool = os.getenv("WEAVIATE_SKIP_INIT_CHECKS", "true").lower() in {"1", "true", "yes"}

    # Embedding backend selection: "huggingface" (default, local) or "openai"
    EMBEDDER_BACKEND: str = os.getenv("EMBEDDER_BACKEND", "huggingface").lower()

    # OpenAI configuration (loaded from .env or system env)
    OPENAI_API_KEY: str | None = os.getenv("OPENAI_API_KEY")
    OPENROUTER_API_KEY: str | None = os.getenv("OPENROUTER_API_KEY")

    # Hugging Face / HF Hub token (support multiple common env names)
    HUGGINGFACE_API_KEY: str | None = (
        os.getenv("HUGGINGFACE_API_KEY")
        or os.getenv("HUGGINGFACEHUB_API_TOKEN")
        or os.getenv("HUGGING_FACE_HUB_TOKEN")
        or os.getenv("HF_TOKEN")
    )

    # Planner mode: when true, the agent will respond with a step-by-step plan
    PLAN_MODE: bool = os.getenv("PLAN_MODE", "true").lower() in {"1", "true", "yes"}

    # Optional: control the level of detail for plans (brief|normal|detailed)
    PLAN_DETAIL: str = os.getenv("PLAN_DETAIL", "normal")


settings = Settings()
