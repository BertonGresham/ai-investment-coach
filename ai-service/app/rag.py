from __future__ import annotations

import logging
import os
from pathlib import Path

from app.schemas import RagEvidence

logger = logging.getLogger(__name__)


def _collection():
    import chromadb
    from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
    persist_directory = os.getenv("CHROMA_PERSIST_DIRECTORY", "./.chroma")
    collection_name = os.getenv("CHROMA_COLLECTION", "investment_behavior")
    client = chromadb.PersistentClient(path=str(Path(persist_directory)))
    embedding_function = OpenAIEmbeddingFunction(
        api_key=api_key,
        model_name=os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
    )
    return client.get_or_create_collection(
        name=collection_name,
        embedding_function=embedding_function,
        metadata={"hnsw:space": "cosine"},
    )


def retrieve_theory(query: str, limit: int = 3) -> list[RagEvidence]:
    """Retrieve short, attributable notes from the local Chroma collection."""
    try:
        collection = _collection()
        if collection is None or collection.count() == 0:
            return []
        result = collection.query(
            query_texts=[query[:4_000]],
            n_results=limit,
            include=["documents", "metadatas", "distances"],
        )
    except ImportError:
        logger.info("ChromaDB is not installed; continuing without RAG.")
        return []
    except Exception:
        logger.exception("RAG retrieval failed; continuing without retrieved notes.")
        return []

    documents = (result.get("documents") or [[]])[0]
    metadatas = (result.get("metadatas") or [[]])[0]
    distances = (result.get("distances") or [[]])[0]
    evidence: list[RagEvidence] = []
    for index, content in enumerate(documents):
        metadata = metadatas[index] or {}
        distance = distances[index] if index < len(distances) else None
        score = (
            max(0.0, min(1.0, 1.0 - float(distance) / 2.0))
            if distance is not None
            else None
        )
        evidence.append(
            RagEvidence(
                source=str(metadata.get("source", "团队知识库")),
                title=str(metadata.get("title", "投资行为理论笔记")),
                content=str(content),
                score=score,
            )
        )
    return evidence


def ingest_documents(documents: list[dict[str, str]]) -> int:
    collection = _collection()
    if collection is None:
        raise RuntimeError("OPENAI_API_KEY is required to create embeddings.")
    if not documents:
        return 0
    collection.upsert(
        ids=[item["id"] for item in documents],
        documents=[item["content"] for item in documents],
        metadatas=[
            {"source": item["source"], "title": item["title"]}
            for item in documents
        ],
    )
    return len(documents)
