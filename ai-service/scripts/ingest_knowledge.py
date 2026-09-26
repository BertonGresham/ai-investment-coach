import json
import sys
from pathlib import Path

from dotenv import load_dotenv

SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))
load_dotenv(SERVICE_ROOT / ".env")

from app.rag import ingest_documents
from app.market_context import select_book_notes


def main() -> None:
    source = SERVICE_ROOT / "knowledge" / "behavior_principles.jsonl"
    documents = [
        json.loads(line)
        for line in source.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    for language in ("zh-CN", "ko-KR"):
        documents.extend({
            "id": f"{note.id}-{language}",
            "source": f"G. C. Selden (1912), {note.chapter}",
            "title": note.title,
            "content": f"{note.content}\n{note.reflection_question}\n{note.source_url}",
        } for note in select_book_notes(language, "fear_of_missing_out"))
    count = ingest_documents(documents)
    print(f"Indexed {count} knowledge notes into ChromaDB.")


if __name__ == "__main__":
    main()
