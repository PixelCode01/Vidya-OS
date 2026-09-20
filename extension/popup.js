const API_BASE = "http://127.0.0.1:3000";

// ---- Tab switching ----

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add("active");
  });
});

// ---- Progress ----

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
        <p>Backend offline. Run <code>uvicorn main:app --port 3000</code></p>
      </div>`;
  }
}

function statusIcon(status) {
  if (status === "completed") return "✓";
  if (status === "in_progress") return "▶";
  return "○";
}

function renderProgress(data, container) {
  container.innerHTML = "";

  data.subjects.forEach(subject => {
    const statusClass = subject.percent >= 80 ? "high" : subject.percent >= 40 ? "mid" : "low";
    const card = document.createElement("div");
    card.className = "subject-card";
    card.dataset.subjectId = subject.id;

    // Topic rows HTML
    const topicRows = subject.topics.map(topic => `
      <div class="topic-row" data-topic="${topic.name}" data-subject="${subject.id}" data-status="${topic.status}">
        <span class="topic-icon ${topic.status}">${statusIcon(topic.status)}</span>
        <span class="topic-name">${topic.name}</span>
        <div class="topic-actions">
          ${topic.status !== "completed"   ? `<button class="t-btn done-btn"    title="Mark done">✓</button>` : ""}
          ${topic.status !== "in_progress" ? `<button class="t-btn active-btn"  title="Mark active">▶</button>` : ""}
          ${topic.status !== "not_started" ? `<button class="t-btn reset-btn"   title="Reset">↺</button>` : ""}
        </div>
      </div>`).join("");

    card.innerHTML = `
      <div class="subject-header" data-toggle="${subject.id}">
        <div class="subject-title-row">
          <span class="subject-name">${subject.name}</span>
          <span class="subject-pct ${statusClass}">${subject.percent}%</span>
        </div>
        <div class="progress-bar-track">
          <div class="progress-bar-fill ${statusClass}" style="width: ${subject.percent}%"></div>
        </div>
        <div class="subject-meta">
          <span>${subject.completed_hours}/${subject.total_hours} hrs</span>
          <span class="current-topic">▶ ${subject.current_topic}</span>
          <span class="expand-hint">↕ topics</span>
        </div>
      </div>
      <div class="topic-list hidden" id="topics-${subject.id}">
        ${topicRows}
        <div class="add-topic-row">
          <input type="text" class="add-topic-input" placeholder="New topic..." id="new-topic-${subject.id}" />
          <button class="t-btn add-topic-btn" data-subject="${subject.id}" title="Add topic">+</button>
        </div>
      </div>`;

    container.appendChild(card);
  });

  // Expand/collapse on header click
  container.querySelectorAll(".subject-header").forEach(header => {
    header.addEventListener("click", e => {
      if (e.target.closest(".topic-actions") || e.target.closest(".add-topic-row")) return;
      const id = header.dataset.toggle;
      document.getElementById(`topics-${id}`).classList.toggle("hidden");
    });
  });

  // Topic action buttons (mark done / active / reset)
  container.querySelectorAll(".topic-row").forEach(row => {
    row.querySelectorAll(".t-btn").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.stopPropagation();
        const subjectId = row.dataset.subject;
        const topicName = row.dataset.topic;
        let newStatus = "not_started";
        if (btn.classList.contains("done-btn"))   newStatus = "completed";
        if (btn.classList.contains("active-btn")) newStatus = "in_progress";

        btn.disabled = true;
        try {
          const res = await fetch(`${API_BASE}/progress/topic`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subject_id: subjectId, topic_name: topicName, status: newStatus }),
          });
          if (!res.ok) throw new Error();
          // Re-render just that subject card with updated data
          const updated = await res.json();
          replaceSubjectCard(updated.subject, document.getElementById("progress-container"));
        } catch {
          btn.disabled = false;
        }
      });
    });
  });

  // Add topic buttons
  container.querySelectorAll(".add-topic-btn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const subjectId = btn.dataset.subject;
      const input = document.getElementById(`new-topic-${subjectId}`);
      const name = input.value.trim();
      if (!name) return;

      btn.disabled = true;
      try {
        const res = await fetch(`${API_BASE}/progress/topic?subject_id=${encodeURIComponent(subjectId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) throw new Error();
        const updated = await res.json();
        replaceSubjectCard(updated.subject, document.getElementById("progress-container"));
      } catch {
        btn.disabled = false;
      }
    });
  });
}

function replaceSubjectCard(subject, container) {
  const existing = container.querySelector(`[data-subject-id="${subject.id}"]`);
  const wasExpanded = existing && !existing.querySelector(".topic-list").classList.contains("hidden");

  const tmp = document.createElement("div");
  renderProgress({ subjects: [subject] }, tmp);
  const newCard = tmp.firstChild;

  if (wasExpanded) {
    newCard.querySelector(".topic-list").classList.remove("hidden");
  }

  if (existing) {
    container.replaceChild(newCard, existing);
  } else {
    container.appendChild(newCard);
  }

  // Re-attach listeners to the new card
  newCard.querySelector(".subject-header").addEventListener("click", e => {
    if (e.target.closest(".topic-actions") || e.target.closest(".add-topic-row")) return;
    newCard.querySelector(".topic-list").classList.toggle("hidden");
  });

  newCard.querySelectorAll(".topic-row .t-btn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const row = btn.closest(".topic-row");
      const subjectId = row.dataset.subject;
      const topicName = row.dataset.topic;
      let newStatus = "not_started";
      if (btn.classList.contains("done-btn"))   newStatus = "completed";
      if (btn.classList.contains("active-btn")) newStatus = "in_progress";
      btn.disabled = true;
      try {
        const res = await fetch(`${API_BASE}/progress/topic`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject_id: subjectId, topic_name: topicName, status: newStatus }),
        });
        if (!res.ok) throw new Error();
        const updated = await res.json();
        replaceSubjectCard(updated.subject, container);
      } catch { btn.disabled = false; }
    });
  });

  newCard.querySelectorAll(".add-topic-btn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const subjectId = btn.dataset.subject;
      const input = document.getElementById(`new-topic-${subjectId}`);
      const name = input.value.trim();
      if (!name) return;
      btn.disabled = true;
      try {
        const res = await fetch(`${API_BASE}/progress/topic?subject_id=${encodeURIComponent(subjectId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) throw new Error();
        const updated = await res.json();
        replaceSubjectCard(updated.subject, container);
      } catch { btn.disabled = false; }
    });
  });
}

// ---- Add Subject form ----

document.getElementById("add-subject-form").addEventListener("submit", async e => {
  e.preventDefault();
  const name   = document.getElementById("subject-name").value.trim();
  const hours  = parseInt(document.getElementById("subject-hours").value);
  const raw    = document.getElementById("subject-topics").value.trim();
  const topics = raw ? raw.split("\n").map(t => t.trim()).filter(Boolean) : [];

  const btn    = document.getElementById("add-subject-btn");
  const result = document.getElementById("add-result");

  btn.disabled = true;
  result.textContent = "";

  try {
    const res = await fetch(`${API_BASE}/progress/subject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, total_hours: hours, topics }),
    });

    if (!res.ok) throw new Error();
    result.className = "add-result success";
    result.textContent = `"${name}" added successfully.`;
    e.target.reset();

    // Reload progress tab to show the new subject
    const container = document.getElementById("progress-container");
    container.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
    loadProgress();
  } catch {
    result.className = "add-result error";
    result.textContent = "Failed to add subject. Is the backend running?";
  }

  btn.disabled = false;
});

// ---- Ask AI ----

async function askQuestion() {
  const questionInput = document.getElementById("question-input");
  const question = questionInput.value.trim();
  if (!question) return;

  const answerBox = document.getElementById("answer-box");
  const sendBtn = document.getElementById("send-btn");

  answerBox.className = "answer-box loading";
  answerBox.innerHTML = `<div class="spinner"></div><span>Analyzing frame with Gemini...</span>`;
  sendBtn.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let videoTitle = "YouTube Lecture";
    let timestamp = "00:00";

    if (tab && tab.url && tab.url.includes("youtube.com/watch")) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        });
        if (results?.[0]?.result) {
          videoTitle = results[0].result.videoTitle || videoTitle;
          timestamp  = results[0].result.timestamp  || timestamp;
        }
      } catch {}
    }

    let imageDataUrl = "";
    try {
      imageDataUrl = await chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 50 });
    } catch {}

    const res = await fetch(`${API_BASE}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_title: videoTitle, timestamp, user_question: question, image: imageDataUrl }),
    });

    if (!res.ok) throw new Error();
    const data = await res.json();

    answerBox.className = "answer-box success";
    answerBox.innerHTML = `
      <div class="answer-meta">
        <span class="tag">📺 ${videoTitle.slice(0, 32)}${videoTitle.length > 32 ? "…" : ""}</span>
        <span class="tag">⏱ ${timestamp}</span>
        <span class="tag gemini-tag">✦ Gemini</span>
      </div>
      <p class="answer-text">${data.answer}</p>`;
  } catch {
    answerBox.className = "answer-box error";
    answerBox.innerHTML = `<p>Could not reach Vidya-OS backend on port 3000.</p>`;
  }

  sendBtn.disabled = false;
  questionInput.value = "";
}

document.getElementById("send-btn").addEventListener("click", askQuestion);
document.getElementById("question-input").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askQuestion(); }
});
document.getElementById("refresh-btn").addEventListener("click", () => {
  document.getElementById("progress-container").innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
  loadProgress();
});

// Init
loadProgress();
