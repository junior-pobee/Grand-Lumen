from collections import Counter
import re
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="Grand-Lumen Services", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

class TextAnalysisRequest(BaseModel):
    text: str = Field(min_length=1, max_length=50000)

@app.get("/health")
def health():
    return {"service": "grand-lumen-python", "status": "ready"}

@app.post("/analyze/text")
def analyze_text(payload: TextAnalysisRequest):
    words = re.findall(r"[A-Za-z0-9']+", payload.text.lower())
    frequencies = Counter(word for word in words if len(word) > 3)
    sentences = [part for part in re.split(r"[.!?]+", payload.text) if part.strip()]
    return {
        "characters": len(payload.text),
        "words": len(words),
        "sentences": len(sentences),
        "average_word_length": round(sum(map(len, words)) / len(words), 2) if words else 0,
        "frequent_terms": [{"term": term, "count": count} for term, count in frequencies.most_common(8)]
    }
