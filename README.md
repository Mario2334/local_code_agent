# local-code-agent

A small local code agent that can optionally use Agno with a Weaviate knowledge base.

## Requirements
- Python 3.9–3.12
- Poetry

## Install
- Base install (no optional deps):
  - `poetry install`
- With Agno:
  - `poetry install --with agno`
- With Weaviate client:
  - `poetry install --with weaviate`
- With both:
  - `poetry install --with agno,weaviate`

## Run
- Using the main entry point:
  - `poetry run local-code-agent`
- Using the runner entry point:
  - `poetry run local-code-agent-runner`
- Or directly with Python:
  - `poetry run python main.py`
  - `poetry run python -m runner`

## Configuration
Environment variables (defaults shown in config.py):
- `WEAVIATE_URL`: default `http://100.66.227.18:8080/`
- `AGENT_TYPE`: default `agno`
- `ENSURE_SCHEMA`: default `true`

## Notes
- The application is resilient if optional dependencies are missing; it prints helpful guidance.
- The Weaviate helper supports both v3 and v4 client styles on a best-effort basis.

## Code Structure
- runner.py: Orchestrates bootstrapping and delegates to modules.
- db/weaviate_client.py: Weaviate client creation.
- knowledge/base.py: Constructs Agno AgentKnowledge backed by Weaviate and an embedder.
- frameworks/springboot/ingestor.py: Collects documents from a Spring Boot project.

To add a new framework, create a new folder under frameworks/<framework>/ingestor.py with a collect_documents function and wire it in runner.py or a new runner branch.
