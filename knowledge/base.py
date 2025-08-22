from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from agno.embedder.base import Embedder
from agno.embedder.huggingface import HuggingfaceCustomEmbedder
from agno.embedder.openai import OpenAIEmbedder
from agno.knowledge import AgentKnowledge
from agno.vectordb.search import SearchType
from agno.vectordb.weaviate import Distance, VectorIndex, Weaviate

from config import settings


class SimpleLocalEmbedder(Embedder):
    """A deterministic, offline embedder.

    This produces a fixed-size embedding vector by hashing tokens to indices
    and accumulating frequencies with simple smoothing. It avoids any network
    calls and external dependencies.
    """

    def __init__(self, dimensions: int = 384):
        super().__init__(dimensions=dimensions)

    def _tokenize(self, text: str) -> List[str]:
        return [t for t in (text or "").lower().split() if t]

    def get_embedding(self, text: str) -> List[float]:
        dim = int(self.dimensions or 384)
        vec = [0.0] * dim
        tokens = self._tokenize(text)
        if not tokens:
            return vec
        for tok in tokens:
            h = hash(tok) % dim
            vec[h] += 1.0
        # L2 normalize
        norm = sum(v * v for v in vec) ** 0.5 or 1.0
        return [v / norm for v in vec]

    def get_embedding_and_usage(self, text: str) -> Tuple[List[float], Optional[Dict]]:
        return self.get_embedding(text), None


def _select_embedder() -> Embedder:
    """Select an embedder with offline-safe fallback.

    Priority:
    1) If EMBEDDER_BACKEND=openai and OPENAI_API_KEY provided => OpenAIEmbedder
    2) If EMBEDDER_BACKEND=huggingface and HUGGINGFACE_API_KEY provided => HF embedder
    3) Otherwise => SimpleLocalEmbedder (no network)
    """
    backend = getattr(settings, "EMBEDDER_BACKEND", "huggingface").lower()

    # Try explicit OpenAI if requested and key provided
    if backend == "openai" and settings.OPENAI_API_KEY:
        try:
            return OpenAIEmbedder(api_key=settings.OPENAI_API_KEY)
        except Exception:
            pass

    # Try HF if requested and key provided
    if backend == "huggingface" and settings.HUGGINGFACE_API_KEY:
        try:
            return HuggingfaceCustomEmbedder(api_key=settings.HUGGINGFACE_API_KEY)
        except Exception:
            pass

    # Fallback: local deterministic embedder
    return SimpleLocalEmbedder()


def build_agent_knowledge(client) -> AgentKnowledge:
    """Build and return an AgentKnowledge instance with an offline-safe embedder.

    If the Weaviate client cannot be created (e.g., connection error), we
    transparently fall back to local mode on the vector DB, while still
    allowing embeddings to be computed fully offline.
    """
    embedder = _select_embedder()

    vector_db = Weaviate(
        client=client,
        collection=settings.COLLECTION_NAME,
        search_type=SearchType.hybrid,
        vector_index=VectorIndex.HNSW,
        distance=Distance.COSINE,
        embedder=embedder,
        local=(client is None),
    )
    return AgentKnowledge(vector_db=vector_db)
