"""
retriever.py  -  connects YOUR existing RAG search to LangChain.

WHAT IS HAPPENING HERE?
    In app/rag/rag_pipeline.py you already wrote two good functions:
        retrieve()  -> fast vector search in ChromaDB (top 8 matches)
        rerank()    -> a smarter cross-encoder picks the best 3

    LangChain does not know about those functions. A LangChain "retriever" is
    just an object with one job: take a question, return a list of Documents.
    So we make a small class that calls YOUR two functions and returns Documents.
    Result: we keep all your work, and it now snaps into any chain with "|".

WHAT IS A DOCUMENT?
    LangChain's standard "piece of text" object:
        page_content = the text
        metadata     = extra info (page number, section, rerank score ...)
"""

from typing import List, Optional

from langchain_core.callbacks import CallbackManagerForRetrieverRun
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever

# Your existing functions. (Importing this file loads the embedding model and
# the reranker once, so the first import takes a few seconds.)
from app.rag.rag_pipeline import rerank, retrieve


class CloudDeskRetriever(BaseRetriever):
    """Search the CloudDesk PDF knowledge base: vector search, then rerank."""

    # These are settings of the retriever. BaseRetriever is a Pydantic class,
    # so we declare them as typed fields with default values.
    top_k: int = 8                       # how many chunks the fast search fetches
    top_n: int = 3                       # how many chunks we keep after reranking
    filters: Optional[dict] = None       # ChromaDB metadata filter, e.g. {"section": "pricing"}

    def _get_relevant_documents(
        self, query: str, *, run_manager: CallbackManagerForRetrieverRun
    ) -> List[Document]:
        """
        LangChain calls this method when we do retriever.invoke("question").
        (run_manager is used by LangChain for tracing/logging. We do not touch it.)
        """
        # Step 1: fast but fuzzy search
        candidates = retrieve(query, top_k=self.top_k, filters=self.filters)

        # Step 2: slower but accurate re-scoring, keep only the best few
        best = rerank(query, candidates, top_n=self.top_n)

        # Step 3: convert your dictionaries into LangChain Documents
        docs = []
        for item in best:
            metadata = dict(item["metadata"] or {})
            metadata["rerank_score"] = item["rerank_score"]   # keep for debugging / evaluation
            docs.append(Document(page_content=item["text"], metadata=metadata))
        return docs


# Quick test:  python -m app.langchain_core.retriever
if __name__ == "__main__":
    from app.langchain_core.rag_chain import build_rag_chain

    retriever = CloudDeskRetriever()

    # 1) Test the retriever alone: you should see Documents
    for d in retriever.invoke("Does CloudDesk work with WhatsApp?"):
        print(round(d.metadata["rerank_score"], 2), "|", d.page_content[:80])

    # 2) Test the full RAG chain: retriever + prompt + model
    chain = build_rag_chain(retriever)
    print(chain.invoke("Does CloudDesk work with WhatsApp?"))