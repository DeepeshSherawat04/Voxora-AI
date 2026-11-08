# ingest.py
import pdfplumber
import chromadb
from sentence_transformers import SentenceTransformer

EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
PDF_PATH = "app/knowledge-base/CloudDesk_CRM_RAG_Knowledge_Base.pdf"

# We are using this function because embedding model can not be able to process tables chunks directly.
# First, we need to convert the tables into plain text which embedding model can easily process. Embedding model can only process text, not tables. So, we need to convert the tables into plain text which embedding model can easily process.
def table_to_text(table: list[list[str]]) -> str:
    """Convert extracted table rows into clean, embeddable text."""
    rows = []
    for row in table:
        cells = [(c or "").replace("\n", " ").strip() for c in row]
        if any(cells):                       # skip fully empty rows
            rows.append(" | ".join(cells))
    return "\n".join(rows)

def load_pdf(path: str) -> list[dict]:
    """Extract text AND tables per page, keeping natural order."""
    pages = []
    with pdfplumber.open(path) as pdf:
        for i, page in enumerate(pdf.pages):
            # 1. Tables → structured text (placed where they appear)
            tables_text = [table_to_text(t) for t in page.extract_tables()]
            tables_text = [t for t in tables_text if t]

            # 2. Regular text (layout=True preserves column spacing)
            text = page.extract_text(layout=True) or ""

            pages.append({
                "text": text,
                "tables": tables_text,
                "page": i + 1,
            })
    return pages

def split_by_section(text: str) -> list[str]:
    """Split extracted PDF text into non-empty sections."""
    sections = []
    current_section = []

    for line in text.splitlines():
        line = line.strip()

        if line:
            current_section.append(line)

    if current_section:
        sections.append("\n".join(current_section))

    return sections


def detect_section(text: str) -> str:
    """Identify the section using simple keyword matching."""
    text_lower = text.lower()

    sections = {
        "pricing": ["price", "pricing", "₹", "per user"],
        "features": ["features", "feature", "whatsapp integration"],
        "benefits": ["benefits", "advantages"],
        "setup": ["setup", "installation"],
        "objections": ["objection", "concern"],
        "demo": ["demo", "demonstration"],
    }

    for section, keywords in sections.items():
        if any(keyword in text_lower for keyword in keywords):
            return section

    return "general"

def chunk(pages: list[dict]) -> list[dict]:
    chunks = []
    for p in pages:
        for t in p["tables"]:
            chunks.append({
                "text": f"[TABLE]\n{t}",
                "metadata": {
                    "source": "CloudDesk_CRM_RAG_Knowledge_Base.pdf",
                    "section": detect_section(t),
                    "product": "CloudDesk CRM",
                    "version": "1.0",
                    "page": p["page"],
                    "type": "table",      
                },
            })

        for section_text in split_by_section(p["text"]):
            chunks.append({
                "text": section_text,
                "metadata": {
                    "source": "CloudDesk_CRM_RAG_Knowledge_Base.pdf",
                    "section": detect_section(section_text),
                    "product": "CloudDesk CRM",
                    "version": "1.0",
                    "page": p["page"],
                    "type": "text",
                },
            })
    return chunks

def main():
    """Steps 3 & 4: convert chunks to embeddings, store in vector store."""
    model = SentenceTransformer(EMBED_MODEL)
    client = chromadb.PersistentClient(path="vector_store")
    collection = client.get_or_create_collection("clouddesk_kb")

    pages = load_pdf(PDF_PATH)
    chunks = chunk(pages)

    # ← THE CONVERSION HAPPENS HERE:
    # one call encodes all chunk texts into embedding vectors
    embeddings = model.encode([c["text"] for c in chunks]).tolist()

    collection.add(
        ids=[f"chunk_{i}" for i in range(len(chunks))],
        documents=[c["text"] for c in chunks],
        embeddings=embeddings,                      # ← vectors, not text
        metadatas=[c["metadata"] for c in chunks],
    )
    print(f"Ingested {len(chunks)} chunks into vector_store/")


if __name__ == "__main__":
    main()