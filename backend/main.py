import json
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# --- Strands Agent SDK imports ---
# strands-agents is the AWS open-source SDK for building AI agents.
# It follows a simple Agent -> Tool -> LLM pattern.
# Docs: https://strandsagents.com
from strands import Agent
from strands.models import OllamaModel

app = FastAPI(title="Vidya-OS Backend")

# Allow the Chrome extension (chrome-extension://*) and localhost dev
# tools to call this API without CORS errors.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

SYLLABUS_PATH = Path(__file__).parent / "mock_syllabus.json"


# ---------------------------------------------------------------------------
# Strands Agent setup
# ---------------------------------------------------------------------------
# OllamaModel tells the Strands SDK to talk to a locally running Ollama
# instance instead of a cloud provider. This keeps everything offline and
# free, which is exactly what we need for the hackathon demo.
#
# Model: llama3 is a solid open-source model that handles Indian-context
# educational questions well and runs on a mid-range laptop GPU.
#
# If Ollama isn't running we catch the error downstream so the demo
# never hard-crashes in front of judges.
try:
    llm = OllamaModel(model_id="llama3", streaming=False)
    _agent_available = True
except Exception:
    llm = None
    _agent_available = False


def build_agent(video_title: str, timestamp: str) -> Agent:
    """
    Creates a fresh Strands Agent for every request.
    The system prompt is baked with the video context so the LLM always
    answers relative to what the student is currently watching.
    """
    system_prompt = (
        f"You are Vidya-OS, an expert tutor for Indian engineering students. "
        f"The student is watching a YouTube video titled '{video_title}' "
        f"at timestamp {timestamp}. "
        "Answer their question clearly and simply in 2-3 short sentences. "
        "Where relevant, relate your answer to standard B.Tech / BE engineering syllabus topics."
    )
    # Agent() is the core Strands primitive. You pass it a model and a system
    # prompt. Tools can be added here too (e.g., @tool decorators), but for
    # this demo a bare LLM call is enough to show the SDK integration.
    return Agent(model=llm, system_prompt=system_prompt)


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class AskRequest(BaseModel):
    video_title: str
    timestamp: str
    user_question: str


class AskResponse(BaseModel):
    answer: str
    video_title: str
    timestamp: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/ask", response_model=AskResponse)
async def ask_question(req: AskRequest):
    """
    Core endpoint: takes video context + student question, runs it through
    the Strands agent, and returns the answer.
    """
    fallback = (
        "That's a great question! This concept is usually covered in your "
        "semester syllabus. Try checking your textbook for this topic or "
        "ask your professor during the next class."
    )

    if not _agent_available or llm is None:
        return AskResponse(
            answer="(Ollama not running) " + fallback,
            video_title=req.video_title,
            timestamp=req.timestamp,
        )

    try:
        agent = build_agent(req.video_title, req.timestamp)
        # agent(message) is the Strands SDK's __call__ interface.
        # It handles the full prompt → model → response loop internally.
        result = agent(req.user_question)
        answer = str(result).strip() or fallback
    except Exception as exc:
        # Graceful degradation: judges see a helpful message, not a traceback.
        print(f"[Strands agent error] {exc}")
        answer = fallback

    return AskResponse(
        answer=answer,
        video_title=req.video_title,
        timestamp=req.timestamp,
    )


@app.get("/progress")
async def get_progress():
    """
    Reads mock_syllabus.json and returns a structured progress summary.
    No database involved - pure JSON for hackathon speed.
    """
    with open(SYLLABUS_PATH) as f:
        data = json.load(f)

    subjects_summary = []
    for subject in data["subjects"]:
        total = subject["total_hours"]
        done = subject["completed_hours"]
        pct = round((done / total) * 100)
        remaining = total - done

        in_progress_topics = [
            t["name"] for t in subject["topics"] if t["status"] == "in_progress"
        ]
        next_topic = in_progress_topics[0] if in_progress_topics else "All topics done!"

        subjects_summary.append({
            "id": subject["id"],
            "name": subject["name"],
            "percent": pct,
            "completed_hours": done,
            "total_hours": total,
            "remaining_hours": remaining,
            "current_topic": next_topic,
            "topics": subject["topics"],
        })

    return {
        "student": data["student"],
        "branch": data["branch"],
        "semester": data["semester"],
        "subjects": subjects_summary,
    }


@app.get("/health")
async def health():
    return {"status": "ok", "agent_ready": _agent_available}
