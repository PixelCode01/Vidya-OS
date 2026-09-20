import base64
import json
import os
from pathlib import Path
from typing import List, Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from pydantic import BaseModel

from google import genai
from google.genai import types

app = FastAPI(title="Vidya-OS Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SYLLABUS_PATH = Path(__file__).parent / "mock_syllabus.json"
GEMINI_MODEL = "gemini-3.6-flash"

# Load syllabus into memory at startup so updates are instant
# and we don't hammer the disk on every request.
with open(SYLLABUS_PATH) as f:
    _syllabus: dict = json.load(f)


def save_syllabus():
    with open(SYLLABUS_PATH, "w") as f:
        json.dump(_syllabus, f, indent=2)


def build_summary(subject: dict) -> dict:
    total = subject["total_hours"]
    done = subject["completed_hours"]
    pct = round((done / total) * 100) if total else 0

    in_progress = [t["name"] for t in subject["topics"] if t["status"] == "in_progress"]
    current_topic = in_progress[0] if in_progress else "All done!"

    return {
        "id": subject["id"],
        "name": subject["name"],
        "percent": pct,
        "completed_hours": done,
        "total_hours": total,
        "remaining_hours": total - done,
        "current_topic": current_topic,
        "topics": subject["topics"],
    }


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
    image: str

class TopicUpdate(BaseModel):
    subject_id: str
    topic_name: str
    status: str  # "completed" | "in_progress" | "not_started"

class NewTopic(BaseModel):
    name: str

class NewSubject(BaseModel):
    name: str
    total_hours: int
    topics: List[str]  # list of topic names to seed the subject with


# ---- Progress endpoints ----

@app.get("/progress")
async def get_progress():
    return {
        "student": _syllabus["student"],
        "branch": _syllabus["branch"],
        "semester": _syllabus["semester"],
        "subjects": [build_summary(s) for s in _syllabus["subjects"]],
    }


@app.patch("/progress/topic")
async def update_topic(req: TopicUpdate):
    """Mark a topic as completed / in_progress / not_started."""
    valid = {"completed", "in_progress", "not_started"}
    if req.status not in valid:
        raise HTTPException(400, f"status must be one of {valid}")

    subject = next((s for s in _syllabus["subjects"] if s["id"] == req.subject_id), None)
    if not subject:
        raise HTTPException(404, "Subject not found")

    topic = next((t for t in subject["topics"] if t["name"] == req.topic_name), None)
    if not topic:
        raise HTTPException(404, "Topic not found")

    old_status = topic["status"]
    topic["status"] = req.status

    # Recalculate completed_hours by counting completed topics proportionally.
    # Each topic is assumed to consume equal share of the subject's total hours.
    topic_count = len(subject["topics"])
    completed_count = sum(1 for t in subject["topics"] if t["status"] == "completed")
    subject["completed_hours"] = round((completed_count / topic_count) * subject["total_hours"])

    save_syllabus()
    return {"ok": True, "old_status": old_status, "new_status": req.status, "subject": build_summary(subject)}


@app.post("/progress/topic")
async def add_topic(subject_id: str, req: NewTopic):
    """Add a new topic to an existing subject."""
    subject = next((s for s in _syllabus["subjects"] if s["id"] == subject_id), None)
    if not subject:
        raise HTTPException(404, "Subject not found")

    if any(t["name"] == req.name for t in subject["topics"]):
        raise HTTPException(409, "Topic already exists")

    subject["topics"].append({"name": req.name, "status": "not_started"})
    save_syllabus()
    return {"ok": True, "subject": build_summary(subject)}


@app.post("/progress/subject")
async def add_subject(req: NewSubject):
    """Add a completely new subject to the syllabus."""
    subject_id = req.name.lower().replace(" ", "_")[:12] + "_" + uuid4().hex[:4]

    new_subject = {
        "id": subject_id,
        "name": req.name,
        "total_hours": req.total_hours,
        "completed_hours": 0,
        "topics": [{"name": t, "status": "not_started"} for t in req.topics],
    }

    _syllabus["subjects"].append(new_subject)
    save_syllabus()
    return {"ok": True, "subject": build_summary(new_subject)}


@app.delete("/progress/subject/{subject_id}")
async def delete_subject(subject_id: str):
    """Remove a subject from the syllabus."""
    before = len(_syllabus["subjects"])
    _syllabus["subjects"] = [s for s in _syllabus["subjects"] if s["id"] != subject_id]
    if len(_syllabus["subjects"]) == before:
        raise HTTPException(404, "Subject not found")
    save_syllabus()
    return {"ok": True}


# ---- Ask endpoint ----

@app.post("/ask")
async def ask_question(req: AskRequest):
    client = get_gemini_client()
    if client is None:
        return {"answer": "GEMINI_API_KEY not set. Export it and restart the server."}

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

        response = client.models.generate_content(model=GEMINI_MODEL, contents=contents)
        answer = response.text.strip() if response.text else "No response from model."

    except Exception as exc:
        print(f"[Gemini error] {exc}")
        answer = "Error analyzing frame, please try again."

    return {"answer": answer}


@app.get("/health")
async def health():
    key_set = bool(os.getenv("GEMINI_API_KEY"))
    return {"status": "ok", "model": GEMINI_MODEL, "api_key_set": key_set}


handler = Mangum(app, lifespan="off")
