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
from agno.models.openai import OpenAIChat
from agno.models.openrouter import OpenRouter

from config import settings
from db.weaviate_client import create_client
from knowledge.base import build_agent_knowledge
from frameworks.springboot.ingestor import collect_documents


def build_plan_prompt(user_request: str) -> str:
    """Wrap the user's request with clear instructions to produce a plan.

    The plan should leverage the ingested knowledge (codebase context) and be
    actionable to make code changes. We request a structured, numbered plan.
    """
    detail = settings.PLAN_DETAIL.lower()
    detail_instructions = {
        "brief": "Keep the plan to 5-8 concise steps.",
        "normal": "Aim for 7-12 clear, numbered steps with short sub-bullets where needed.",
        "detailed": "Provide 10-20 steps with sub-steps including file paths, function names, and validation checks.",
    }.get(detail, "Aim for 7-12 clear, numbered steps.")

    return (
        "You are a coding agent with access to a vector-backed knowledge base of the project code. "
        "Your task is to produce a step-by-step implementation plan that uses the existing codebase.\n\n"
        "Requirements for the plan:\n"
        "- Be specific and reference relevant files and directories by path when possible.\n"
        "- Include minimal, safe changes first; note any config, env, or dependency updates.\n"
        "- Anticipate edge cases and note validation or tests to run.\n"
        "- Keep changes minimal to satisfy the user's request.\n"
        f"- {detail_instructions}\n\n"
        "User request:\n" + user_request + "\n\n"
        "Output only the plan as a numbered list."
    )

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
                except Exception as e:
                    # Last resort: convert to dict and use load_dict
                    try:
                        knowledge_base.load_dict(d.to_dict())
                    except Exception as e:
                        continue

    # agent = Agent(
    #     model=OpenAIChat(id="gpt-4o"),
    #     knowledge=knowledge_base)
    # Return the agent and the raw Weaviate client for external lifecycle control
    agent = Agent(
        model=OpenRouter(id="mistralai/mistral-medium-3.1", api_key=settings.OPENROUTER_API_KEY),
        knowledge=knowledge_base,
    )
    return agent, client

def run(prompt: Optional[str] = None, plan: Optional[bool] = None) -> None:
    print("Bootstrapping agent environment...")
    print(f"[config] WEAVIATE_URL={settings.WEAVIATE_URL}")
    print(f"[config] CODE_PATH={settings.CODE_PATH}")
    print(f"[config] COLLECTION_NAME={settings.COLLECTION_NAME}")
    print(f"[config] PLAN_MODE={settings.PLAN_MODE} DETAIL={settings.PLAN_DETAIL}")

    try:
        agent, client = code_ingestor(settings.CODE_PATH)
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
    plan_mode = settings.PLAN_MODE if plan is None else plan
    if prompt and agent is not None:
        try:
            effective_prompt = build_plan_prompt(prompt) if plan_mode else prompt
            result = agent.run(effective_prompt)
            print("[agent:result]", result)
        except Exception as e:
            print("[agent:error]", e)

    # Gracefully close Weaviate connection if supported (to avoid resource warnings)
    try:
        if client is not None and hasattr(client, "close"):
            client.close()
    except Exception:
        pass

__name__ == "__main__" and run("Make change to check how I can update lombok library in the code")