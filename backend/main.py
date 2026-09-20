import base64
import json
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from pydantic import BaseModel

from google import genai
from google.genai import types

app = FastAPI(title="Vidya-OS Backend")

# Allow the Chrome extension to call this API.
# During sam local start-api the function runs behind a local gateway
# on port 3000, so CORS must be wide open for the demo to work.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SYLLABUS_PATH = Path(__file__).parent / "mock_syllabus.json"

GEMINI_MODEL = "gemini-2.0-flash"


def get_gemini_client():
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return None
    return genai.Client(api_key=api_key)


# ---- Schemas ----

class AskRequest(BaseModel):
    video_title: str
    timestamp: str
    user_question: str
    image: str  # base64 encoded JPEG from captureVisibleTab


# ---- Endpoints ----

@app.get("/progress")
async def get_progress():
    with open(SYLLABUS_PATH) as f:
        data = json.load(f)

    subjects_summary = []
    for subject in data["subjects"]:
        total = subject["total_hours"]
        done = subject["completed_hours"]
        pct = round((done / total) * 100)
        remaining = total - done

        in_progress = [t["name"] for t in subject["topics"] if t["status"] == "in_progress"]
        current_topic = in_progress[0] if in_progress else "All done!"

        subjects_summary.append({
            "id": subject["id"],
            "name": subject["name"],
            "percent": pct,
            "completed_hours": done,
            "total_hours": total,
            "remaining_hours": remaining,
            "current_topic": current_topic,
            "topics": subject["topics"],
        })

    return {
        "student": data["student"],
        "branch": data["branch"],
        "semester": data["semester"],
        "subjects": subjects_summary,
    }


@app.post("/ask")
async def ask_question(req: AskRequest):
    client = get_gemini_client()
    if client is None:
        return {"answer": "GEMINI_API_KEY not set. Export it in your shell and restart the server."}

    try:
        image_data = req.image
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]

        raw_bytes = base64.b64decode(image_data)

        text_prompt = (
            f"You are Vidya-OS, an expert tutor for Indian engineering students. "
            f"The student is watching '{req.video_title}' at timestamp {req.timestamp}. "
            f"Look at this lecture screenshot and answer their question in 2-3 short sentences, "
            f"relating it to B.Tech syllabus topics where possible.\n\n"
            f"Question: {req.user_question}"
        )

        contents = [
            types.Part.from_text(text=text_prompt),
            types.Part.from_bytes(data=raw_bytes, mime_type="image/jpeg"),
        ]

        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=contents,
        )

        answer = response.text.strip() if response.text else "No response from model."

    except Exception as exc:
        print(f"[Gemini error] {exc}")
        answer = "Error analyzing frame, please try again."

    return {"answer": answer}


@app.get("/health")
async def health():
    key_set = bool(os.getenv("GEMINI_API_KEY"))
    return {"status": "ok", "model": GEMINI_MODEL, "api_key_set": key_set}


# Mangum wraps FastAPI so AWS Lambda / SAM local can invoke it like any
# other Lambda handler. SAM's local API gateway calls handler(event, context)
# which Mangum translates into ASGI calls FastAPI understands.
handler = Mangum(app, lifespan="off")
