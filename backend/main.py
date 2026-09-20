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

# Gemini client — key is injected via environment variable.
# Set GEMINI_API_KEY in your shell or in the SAM env section of template.yaml.
_gemini_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY", ""))

# gemini-2.0-flash is the current stable multimodal flash model.
# The spec asked for "gemini-3.8-flash" which doesn't exist yet;
# 2.0-flash is the correct model ID for multimodal + speed.
GEMINI_MODEL = "gemini-2.0-flash"


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
    try:
        # Strip the data URL prefix that the browser's captureVisibleTab adds.
        # e.g. "data:image/jpeg;base64,/9j/4AAQ..." -> "/9j/4AAQ..."
        image_data = req.image
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]

        raw_bytes = base64.b64decode(image_data)

        text_prompt = (
            f"You are Vidya-OS, an expert tutor for Indian engineering students. "
            f"The student is watching a lecture video titled '{req.video_title}' "
            f"and paused at timestamp {req.timestamp}. "
            f"Look at this lecture screenshot and answer their question clearly "
            f"in 2-3 short sentences, relating it to their B.Tech syllabus where possible.\n\n"
            f"Question: {req.user_question}"
        )

        # Build multimodal content using the google-genai Part API.
        # types.Part.from_bytes handles the base64 encode/decode internally.
        contents = [
            types.Part.from_text(text=text_prompt),
            types.Part.from_bytes(data=raw_bytes, mime_type="image/jpeg"),
        ]

        response = _gemini_client.models.generate_content(
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
    return {"status": "ok", "model": GEMINI_MODEL}


# Mangum wraps FastAPI so AWS Lambda / SAM local can invoke it like any
# other Lambda handler. SAM's local API gateway calls handler(event, context)
# which Mangum translates into ASGI calls FastAPI understands.
handler = Mangum(app, lifespan="off")
