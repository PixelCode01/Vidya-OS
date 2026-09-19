const API_BASE = "http://localhost:8000";

// ---- Progress Section ----

async function loadProgress() {
  const container = document.getElementById("progress-container");
  try {
    const res = await fetch(`${API_BASE}/progress`);
    if (!res.ok) throw new Error("backend down");
    const data = await res.json();
    renderProgress(data, container);
  } catch {
    container.innerHTML = `
      <div class="error-state">
        <span class="error-icon">⚡</span>
        <p>Backend offline. Start the server with <code>uvicorn main:app</code></p>
      </div>`;
  }
}

function renderProgress(data, container) {
  container.innerHTML = "";

  data.subjects.forEach(subject => {
    const card = document.createElement("div");
    card.className = "subject-card";

    const statusClass = subject.percent >= 80 ? "high" : subject.percent >= 40 ? "mid" : "low";

    card.innerHTML = `
      <div class="subject-header">
        <span class="subject-name">${subject.name}</span>
        <span class="subject-pct ${statusClass}">${subject.percent}%</span>
      </div>
      <div class="progress-bar-track">
        <div class="progress-bar-fill ${statusClass}" style="width: ${subject.percent}%"></div>
      </div>
      <div class="subject-meta">
        <span>${subject.completed_hours}/${subject.total_hours} hrs</span>
        <span class="current-topic">▶ ${subject.current_topic}</span>
      </div>`;

    container.appendChild(card);
  });
}

// ---- Ask AI Section ----

async function askQuestion() {
  const questionInput = document.getElementById("question-input");
  const question = questionInput.value.trim();
  if (!question) return;

  const answerBox = document.getElementById("answer-box");
  const sendBtn = document.getElementById("send-btn");

  answerBox.className = "answer-box loading";
  answerBox.innerHTML = `<div class="spinner"></div><span>Thinking...</span>`;
  sendBtn.disabled = true;

  try {
    // Ask content.js (running in the YouTube tab) for the current video context
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let videoTitle = "YouTube Video";
    let timestamp = "00:00";

    if (tab && tab.url && tab.url.includes("youtube.com/watch")) {
      try {
        const ctx = await chrome.tabs.sendMessage(tab.id, { type: "GET_VIDEO_CONTEXT" });
        videoTitle = ctx.videoTitle || videoTitle;
        timestamp = ctx.timestamp || timestamp;
      } catch {
        // Not on a YouTube watch page or content script not injected yet
      }
    }

    const res = await fetch(`${API_BASE}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_title: videoTitle, timestamp, user_question: question }),
    });

    if (!res.ok) throw new Error("server error");
    const data = await res.json();

    answerBox.className = "answer-box success";
    answerBox.innerHTML = `
      <div class="answer-meta">
        <span class="tag">📺 ${data.video_title.slice(0, 36)}${data.video_title.length > 36 ? "..." : ""}</span>
        <span class="tag">⏱ ${data.timestamp}</span>
      </div>
      <p class="answer-text">${data.answer}</p>`;
  } catch {
    answerBox.className = "answer-box error";
    answerBox.innerHTML = `<p>Could not reach Vidya-OS backend. Make sure it's running on port 8000.</p>`;
  }

  sendBtn.disabled = false;
  questionInput.value = "";
}

// ---- Event Listeners ----

document.addEventListener("DOMContentLoaded", () => {
  loadProgress();

  document.getElementById("send-btn").addEventListener("click", askQuestion);

  document.getElementById("question-input").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      askQuestion();
    }
  });

  document.getElementById("refresh-btn").addEventListener("click", () => {
    document.getElementById("progress-container").innerHTML =
      `<div class="loading-state"><div class="spinner"></div></div>`;
    loadProgress();
  });
});
