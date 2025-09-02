from __future__ import annotations

from agno.embedder.huggingface import HuggingfaceCustomEmbedder
from agno.knowledge import AgentKnowledge
from agno.vectordb.search import SearchType
from agno.vectordb.weaviate import Distance, VectorIndex, Weaviate

from config import settings


def build_agent_knowledge(client) -> AgentKnowledge:
    """Build and return an AgentKnowledge instance backed by Weaviate.

    This mirrors the configuration previously in runner.py, keeping behavior identical.
    """
    vector_db = Weaviate(
        client=client,
        collection=settings.COLLECTION_NAME,
        search_type=SearchType.hybrid,
        vector_index=VectorIndex.HNSW,
        distance=Distance.COSINE,
        embedder=HuggingfaceCustomEmbedder(api_key="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"),
        local=False,
    )
    return AgentKnowledge(vector_db=vector_db)
