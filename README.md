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

### Planning mode
By default, the agent converts your prompt into a step-by-step implementation plan that leverages the ingested code knowledge.

- Disable planning mode:
  - `PLAN_MODE=false poetry run local-code-agent-runner`
- Control level of detail (brief|normal|detailed):
  - `PLAN_DETAIL=detailed poetry run local-code-agent-runner`

When planning mode is on, the runner wraps your prompt to instruct the agent to output a numbered plan referencing relevant files and minimal code changes.

## Configuration
Environment variables (defaults shown in config.py):
- `WEAVIATE_URL`: default `http://100.66.227.18:8080/`
- `AGENT_TYPE`: default `agno`
- `ENSURE_SCHEMA`: default `true`

### .env support
This project supports configuration via a `.env` file at the repository root. The file is loaded automatically using `python-dotenv` when `config.py` is imported.

1. Create a `.env` file (you can start by copying the example):
   - `cp .env.example .env`
2. Set the credentials and options you need, for example:
   - `OPENAI_API_KEY=sk-...`
   - `OPENAI_BASE_URL=https://api.openai.com/v1` (optional, for self-hosted/proxy)
   - `HUGGINGFACE_API_KEY=hf_...` (alternatively use `HUGGINGFACEHUB_API_TOKEN` / `HUGGING_FACE_HUB_TOKEN` / `HF_TOKEN`)

The Hugging Face embedder in `knowledge/base.py` will automatically use your HF token if provided.

## Notes
- The application is resilient if optional dependencies are missing; it prints helpful guidance.
- The Weaviate helper supports both v3 and v4 client styles on a best-effort basis.

## Code Structure
- runner.py: Orchestrates bootstrapping and delegates to modules.
- db/weaviate_client.py: Weaviate client creation.
- knowledge/base.py: Constructs Agno AgentKnowledge backed by Weaviate and an embedder.
- frameworks/springboot/ingestor.py: Collects documents from a Spring Boot project.

To add a new framework, create a new folder under frameworks/<framework>/ingestor.py with a collect_documents function and wire it in runner.py or a new runner branch.
