"""
Application runner that wires together config, services, and agents.

This is the single place to orchestrate bootstrapping so main.py can remain a
thin entrypoint. It also supports easy substitution of agent backends in the
future.
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from agno.agent import Agent

from config import settings
from db.weaviate_client import create_client
from knowledge.base import build_agent_knowledge
from frameworks.springboot.ingestor import collect_documents

def code_ingestor(code_path: str, framework: str = "springboot"):
    """Ingest code files from a Spring Boot project into the knowledge base.

    - Walks the given code_path and collects relevant files (.java, .properties, .yml/.yaml,
      pom.xml, build.gradle(.kts), README.md, etc.).
    - Creates a Weaviate-backed AgentKnowledge and loads documents with metadata.
    - Returns an Agent wired to the knowledge base and the underlying vector DB handle.
    """

    # Create Weaviate client via dedicated module
    client = create_client()

    # Build knowledge base (Agno + Weaviate + embedder)
    knowledge_base = build_agent_knowledge(client)

    # Collect framework-specific documents (Spring Boot)
    docs = collect_documents(code_path, framework=framework)

    # Load into knowledge base using official API (expects List[Document])
    if docs:
        try:
            knowledge_base.load_documents(docs)
        except Exception as e:
            # As a fallback, try loading one-by-one via load_document or load_dict
            print(f"[load_documents] Error loading documents: {e}")
            for d in docs:
                try:
                    knowledge_base.load_document(d)
                except Exception:
                    # Last resort: convert to dict and use load_dict
                    try:
                        knowledge_base.load_dict(d.to_dict())
                    except Exception:
                        continue

    agent = Agent(knowledge=knowledge_base)
    # Return the agent and the raw Weaviate client for external lifecycle control
    return agent, client

def run(prompt: Optional[str] = None) -> None:
    print("Bootstrapping agent environment...")
    print(f"[config] WEAVIATE_URL={settings.WEAVIATE_URL}")
    print(f"[config] CODE_PATH={settings.CODE_PATH}")
    print(f"[config] COLLECTION_NAME={settings.COLLECTION_NAME}")

    try:
        agent, client = code_ingestor("/home/sanket/projects/pakama/pakama_be")
        print("[ingest] Spring Boot code ingestion complete.")
    except Exception as e:
        agent, client = None, None
        print("[ingest:error]", e)

    if client is not None:
        print("[ready] Weaviate connection established.")
    else:
        print("[ready] Weaviate not connected. See messages above.")

    if agent is not None:
        print(f"[ready] Agent '{settings.AGENT_TYPE}' is ready.")
    else:
        print("[ready] Agent not initialized. See messages above.")

    # Optional demo
    if prompt and agent is not None:
        try:
            result = agent.run(prompt)  # type: ignore[attr-defined]
            print("[agent:result]", result)
        except Exception as e:
            print("[agent:error]", e)

    # Gracefully close Weaviate connection if supported (to avoid resource warnings)
    try:
        if client is not None and hasattr(client, "close"):
            client.close()
    except Exception:
        pass

__name__ == "__main__" and run("Test Prompt")