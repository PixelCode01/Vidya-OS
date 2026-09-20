const API_BASE = "http://127.0.0.1:3000";

// ---- Progress ----

async function loadProgress() {
  const container = document.getElementById("progress-container");
  try {
    const res = await fetch(`${API_BASE}/progress`);
    if (!res.ok) throw new Error("backend unreachable");
    const data = await res.json();
    renderProgress(data, container);
  } catch {
    container.innerHTML = `
      <div class="error-state">
        <span class="error-icon">⚡</span>
        <p>Backend offline. Run <code>sam local start-api</code> in <code>/backend</code></p>
      </div>`;
  }
}

function renderProgress(data, container) {
  container.innerHTML = "";
  data.subjects.forEach(subject => {
    const statusClass = subject.percent >= 80 ? "high" : subject.percent >= 40 ? "mid" : "low";
    const card = document.createElement("div");
    card.className = "subject-card";
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

// ---- Ask AI ----

async function askQuestion() {
  const questionInput = document.getElementById("question-input");
  const question = questionInput.value.trim();
  if (!question) return;

  const answerBox = document.getElementById("answer-box");
  const sendBtn = document.getElementById("send-btn");

  setLoading(answerBox, sendBtn, true);

  try {
    // Step 1: get the active YouTube tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    let videoTitle = "YouTube Lecture";
    let timestamp = "00:00";

    // Step 2: inject content.js to pull title + timestamp from the page DOM
    if (tab && tab.url && tab.url.includes("youtube.com/watch")) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        });
        if (results && results[0] && results[0].result) {
          videoTitle = results[0].result.videoTitle || videoTitle;
          timestamp = results[0].result.timestamp || timestamp;
        }
      } catch (e) {
        console.warn("Could not inject content script:", e);
      }
    }

    // Step 3: capture a JPEG screenshot of the current tab.
    // captureVisibleTab requires the "tabs" permission in manifest.json.
    // It returns a data URL: "data:image/jpeg;base64,..."
    let imageDataUrl = "";
    try {
      imageDataUrl = await chrome.tabs.captureVisibleTab(null, {
        format: "jpeg",
        quality: 50,
      });
    } catch (e) {
      console.warn("Screenshot capture failed:", e);
    }

    // Step 4: POST everything to the SAM local backend
    const res = await fetch(`${API_BASE}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        video_title: videoTitle,
        timestamp,
        user_question: question,
        image: imageDataUrl,
      }),
    });

    if (!res.ok) throw new Error("server error");
    const data = await res.json();

    answerBox.className = "answer-box success";
    answerBox.innerHTML = `
      <div class="answer-meta">
        <span class="tag">📺 ${videoTitle.slice(0, 34)}${videoTitle.length > 34 ? "…" : ""}</span>
        <span class="tag">⏱ ${timestamp}</span>
        <span class="tag gemini-tag">✦ Gemini</span>
      </div>
      <p class="answer-text">${data.answer}</p>`;
  } catch {
    answerBox.className = "answer-box error";
    answerBox.innerHTML = `<p>Could not reach Vidya-OS backend. Make sure <code>sam local start-api</code> is running.</p>`;
  }

  setLoading(answerBox, sendBtn, false);
  questionInput.value = "";
}

function setLoading(answerBox, sendBtn, on) {
  if (on) {
    answerBox.className = "answer-box loading";
    answerBox.innerHTML = `<div class="spinner"></div><span>Analyzing frame with Gemini...</span>`;
    sendBtn.disabled = true;
  } else {
    sendBtn.disabled = false;
  }
}

// ---- Init ----

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
