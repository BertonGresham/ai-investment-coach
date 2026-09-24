import json
import sys
from pathlib import Path

from dotenv import load_dotenv

SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))
load_dotenv(SERVICE_ROOT / ".env")

from app.rag import ingest_documents


def main() -> None:
    source = SERVICE_ROOT / "knowledge" / "behavior_principles.jsonl"
    documents = [
        json.loads(line)
        for line in source.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    count = ingest_documents(documents)
    print(f"Indexed {count} knowledge notes into ChromaDB.")


if __name__ == "__main__":
    main()

