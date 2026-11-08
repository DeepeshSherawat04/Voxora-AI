# backend/app/rag/rag_pipeline.py
from sentence_transformers import SentenceTransformer, CrossEncoder
import chromadb

embed_model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
client = chromadb.PersistentClient(path="vector_store")
collection = client.get_collection("clouddesk_kb")


def retrieve(query: str, top_k: int = 8, filters: dict | None = None) -> list[dict]:
    """vector search + metadata filtering."""
    q_emb = embed_model.encode(query).tolist()
    results = collection.query(
        query_embeddings=[q_emb],
        n_results=top_k,
        where=filters,              
    )
    return [
        {"text": doc, "metadata": meta, "score": dist}
        for doc, meta, dist in zip(
            results["documents"][0], results["metadatas"][0], results["distances"][0]
        )
    ]


def rerank(query: str, candidates: list[dict], top_n: int = 3) -> list[dict]:
    """reranking. Bi-encoder search is fast but fuzzy;
    cross-encoder re-scores (query, chunk) pairs accurately."""
    pairs = [(query, c["text"]) for c in candidates]
    scores = reranker.predict(pairs)
    for c, s in zip(candidates, scores):
        c["rerank_score"] = float(s)
    return sorted(candidates, key=lambda c: c["rerank_score"], reverse=True)[:top_n]