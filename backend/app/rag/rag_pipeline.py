# backend/app/rag/rag_pipeline.py
import os
from functools import lru_cache

import chromadb

USE_RERANKER = os.getenv("USE_RERANKER", "true").lower() == "true"


@lru_cache(maxsize=1)
def _embedder():
    import torch
    torch.set_num_threads(1)  # less RAM and CPU contention
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2", device="cpu")


@lru_cache(maxsize=1)
def _reranker():
    from sentence_transformers import CrossEncoder
    return CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2", device="cpu")


@lru_cache(maxsize=1)
def _collection():
    client = chromadb.PersistentClient(path="vector_store")
    return client.get_collection("clouddesk_kb")


def retrieve(query: str, top_k: int = 8, filters: dict | None = None) -> list[dict]:
    """vector search + metadata filtering."""
    q_emb = _embedder().encode(query).tolist()
    results = _collection().query(
        query_embeddings=[q_emb], n_results=top_k, where=filters
    )
    return [
        {"text": doc, "metadata": meta, "score": dist}
        for doc, meta, dist in zip(
            results["documents"][0], results["metadatas"][0], results["distances"][0]
        )
    ]


def rerank(query: str, candidates: list[dict], top_n: int = 3) -> list[dict]:
    if not candidates:
        return []
    if not USE_RERANKER:
        for c in candidates:
            c["rerank_score"] = -c["score"]
        return candidates[:top_n]
    scores = _reranker().predict([(query, c["text"]) for c in candidates])
    for c, s in zip(candidates, scores):
        c["rerank_score"] = float(s)
    return sorted(candidates, key=lambda c: c["rerank_score"], reverse=True)[:top_n]