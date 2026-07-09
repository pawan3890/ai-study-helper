// ============================================================================
// AI Study Helper — frontend logic (vanilla JS, no build step required)
// ============================================================================

const API_BASE = "/api";

// ---------------------------------------------------------------------------
// Tiny Markdown -> HTML renderer (headings, bold, bullet/numbered lists, paragraphs)
// Good enough for the structured output our system prompts ask the AI for,
// without pulling in a full markdown library.
// ---------------------------------------------------------------------------
function renderMarkdown(md) {
  if (!md) return "";

  const lines = md.split("\n");
  let html = "";
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) { html += "</ul>"; inUl = false; }
    if (inOl) { html += "</ol>"; inOl = false; }
  };

  const inline = (text) =>
    text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>");

  for (let rawLine of lines) {
    const line = rawLine.trim();

    if (!line) { closeLists(); continue; }

    if (line.startsWith("## ")) {
      closeLists();
      html += `<h2>${inline(line.slice(3))}</h2>`;
    } else if (line.startsWith("# ")) {
      closeLists();
      html += `<h2>${inline(line.slice(2))}</h2>`;
    } else if (/^[-*]\s+/.test(line)) {
      if (!inUl) { closeLists(); html += "<ul>"; inUl = true; }
      html += `<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`;
    } else if (/^\d+\.\s+/.test(line)) {
      if (!inOl) { closeLists(); html += "<ol>"; inOl = true; }
      html += `<li>${inline(line.replace(/^\d+\.\s+/, ""))}</li>`;
    } else {
      closeLists();
      html += `<p>${inline(line)}</p>`;
    }
  }
  closeLists();
  return html;
}

// ---------------------------------------------------------------------------
// UI helpers: loading overlay, toast, tab switching
// ---------------------------------------------------------------------------
const loadingOverlay = document.getElementById("loading-overlay");
const loadingText = document.getElementById("loading-text");
const toast = document.getElementById("toast");
let toastTimer = null;

function showLoading(text = "Thinking…") {
  loadingText.textContent = text;
  loadingOverlay.hidden = false;
}
function hideLoading() {
  loadingOverlay.hidden = true;
}
function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
}

async function apiRequest(path, { method = "POST", body, isForm = false } = {}) {
  const opts = { method, headers: {} };
  if (isForm) {
    opts.body = body;
  } else if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(API_BASE + path, opts);
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("Unexpected server response. Please try again.");
  }
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Something went wrong. Please try again.");
  }
  return data;
}

// Main tab navigation (binder tabs)
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`panel-${tab.dataset.panel}`).classList.add("active");
  });
});

// Copy-to-clipboard buttons
document.querySelectorAll("[data-copy-target]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const el = document.getElementById(btn.dataset.copyTarget);
    if (!el) return;
    try {
      await navigator.clipboard.writeText(el.innerText);
      const original = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = original; }, 1500);
    } catch {
      showToast("Could not copy to clipboard.");
    }
  });
});

// ---------------------------------------------------------------------------
// Panel 1: Summarize
// ---------------------------------------------------------------------------
const summarizeForm = document.getElementById("form-summarize");
summarizeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = document.getElementById("summarize-text").value.trim();
  const fileInput = document.getElementById("summarize-file");
  const file = fileInput.files[0];

  if (!text && !file) {
    showToast("Paste some text or upload a file first.");
    return;
  }

  const formData = new FormData();
  if (text) formData.append("text", text);
  if (file) formData.append("file", file);

  showLoading("Summarizing your material…");
  try {
    const data = await apiRequest("/summarize", { isForm: true, body: formData });
    const resultEl = document.getElementById("result-summarize");
    const outputEl = document.getElementById("summary-output");
    outputEl.innerHTML = renderMarkdown(data.summary);
    resultEl.hidden = false;
    if (data.meta.truncated) {
      showToast("Your material was long, so it was truncated before summarizing.");
    }
  } catch (err) {
    showToast(err.message);
  } finally {
    hideLoading();
  }
});

// ---------------------------------------------------------------------------
// Panel 2: Quiz & Flashcards
// ---------------------------------------------------------------------------
const quizForm = document.getElementById("form-quiz");
const quizResult = document.getElementById("result-quiz");
const mcqContainer = document.getElementById("quiz-mcqs");
const flashcardContainer = document.getElementById("quiz-flashcards");

document.querySelectorAll(".quiz-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".quiz-tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".quiz-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`quiz-${tab.dataset.quizPanel}`).classList.add("active");
  });
});

quizForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = document.getElementById("quiz-text").value.trim();
  const fileInput = document.getElementById("quiz-file");
  const file = fileInput.files[0];

  if (!text && !file) {
    showToast("Paste some text or upload a file first.");
    return;
  }

  const formData = new FormData();
  if (text) formData.append("text", text);
  if (file) formData.append("file", file);
  formData.append("difficulty", document.getElementById("quiz-difficulty").value);
  formData.append("mcqCount", document.getElementById("quiz-mcq-count").value);
  formData.append("flashcardCount", document.getElementById("quiz-card-count").value);

  showLoading("Building your quiz and flashcards…");
  try {
    const data = await apiRequest("/quiz", { isForm: true, body: formData });
    renderMCQs(data.mcqs || []);
    renderFlashcards(data.flashcards || []);
    quizResult.hidden = false;
    if (data.meta.truncated) {
      showToast("Your material was long, so it was truncated before generating the quiz.");
    }
  } catch (err) {
    showToast(err.message);
  } finally {
    hideLoading();
  }
});

function renderMCQs(mcqs) {
  mcqContainer.innerHTML = "";
  if (!mcqs.length) {
    mcqContainer.innerHTML = `<p class="panel__hint">No questions were generated. Try again with more material.</p>`;
    return;
  }

  mcqs.forEach((q, qIdx) => {
    const card = document.createElement("div");
    card.className = "mcq-card";

    const qEl = document.createElement("div");
    qEl.className = "mcq-card__q";
    qEl.innerHTML = `<span class="mcq-card__index">Q${qIdx + 1}</span><span>${escapeHtml(q.question)}</span>`;
    card.appendChild(qEl);

    const explanation = document.createElement("div");
    explanation.className = "mcq-card__explanation";
    explanation.textContent = q.explanation || "";

    (q.options || []).forEach((opt, optIdx) => {
      const optEl = document.createElement("div");
      optEl.className = "mcq-option";
      optEl.innerHTML = `<span class="mcq-option__letter">${String.fromCharCode(65 + optIdx)}</span><span>${escapeHtml(opt)}</span>`;

      optEl.addEventListener("click", () => {
        if (card.dataset.answered) return;
        card.dataset.answered = "true";

        const allOptions = card.querySelectorAll(".mcq-option");
        allOptions.forEach((el, i) => {
          if (i === q.correctIndex) el.classList.add("correct");
          else if (i === optIdx) el.classList.add("incorrect");
        });
        explanation.classList.add("show");
      });

      card.appendChild(optEl);
    });

    card.appendChild(explanation);
    mcqContainer.appendChild(card);
  });
}

function renderFlashcards(cards) {
  flashcardContainer.innerHTML = "";
  if (!cards.length) {
    flashcardContainer.innerHTML = `<p class="panel__hint">No flashcards were generated. Try again with more material.</p>`;
    return;
  }

  const grid = document.createElement("div");
  grid.className = "flashcard-grid";

  cards.forEach((c) => {
    const card = document.createElement("div");
    card.className = "flashcard";
    card.innerHTML = `
      <div class="flashcard__inner">
        <div class="flashcard__face flashcard__face--front">${escapeHtml(c.front)}<span class="flashcard__hint">tap to flip</span></div>
        <div class="flashcard__face flashcard__face--back">${escapeHtml(c.back)}</div>
      </div>`;
    card.addEventListener("click", () => card.classList.toggle("flipped"));
    grid.appendChild(card);
  });

  flashcardContainer.appendChild(grid);
}

// ---------------------------------------------------------------------------
// Panel 3: Chat Tutor
// ---------------------------------------------------------------------------
let chatSessionId = null;

const chatContextForm = document.getElementById("form-chat-context");
const chatWindow = document.getElementById("chat-window");
const chatEmpty = document.getElementById("chat-empty");
const chatMessageForm = document.getElementById("form-chat-message");
const chatMessageInput = document.getElementById("chat-message");
const sessionStatus = document.getElementById("session-status");

chatContextForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = document.getElementById("chat-text").value.trim();
  const fileInput = document.getElementById("chat-file");
  const file = fileInput.files[0];

  const formData = new FormData();
  if (text) formData.append("text", text);
  if (file) formData.append("file", file);

  showLoading("Setting up your tutoring session…");
  try {
    const data = await apiRequest("/chat/session", { isForm: true, body: formData });
    chatSessionId = data.sessionId;
    chatWindow.innerHTML = "";
    chatWindow.appendChild(chatEmpty);
    sessionStatus.textContent = data.meta.hasContext
      ? `Context loaded (${data.meta.sourceCharCount.toLocaleString()} characters)${data.meta.truncated ? " — truncated" : ""}.`
      : "No context loaded — general tutoring mode.";
    showToast("New session started.");
  } catch (err) {
    showToast(err.message);
  } finally {
    hideLoading();
  }
});

chatMessageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = chatMessageInput.value.trim();
  if (!message) return;

  if (!chatSessionId) {
    // Auto-start a contextless session so users can dive straight into chat
    try {
      const data = await apiRequest("/chat/session", { isForm: true, body: new FormData() });
      chatSessionId = data.sessionId;
    } catch (err) {
      showToast(err.message);
      return;
    }
  }

  if (chatEmpty.parentElement) chatEmpty.remove();
  appendChatMessage("user", message);
  chatMessageInput.value = "";

  const thinkingEl = appendChatMessage("assistant", "…", true);

  try {
    const data = await apiRequest("/chat/message", {
      body: { sessionId: chatSessionId, message },
    });
    thinkingEl.textContent = data.reply;
  } catch (err) {
    thinkingEl.textContent = "Sorry — I couldn't get a response. Please try again.";
    showToast(err.message);
  }
});

function appendChatMessage(role, text, isPlaceholder = false) {
  const el = document.createElement("div");
  el.className = `chat-msg chat-msg--${role}`;
  el.textContent = text;
  chatWindow.appendChild(el);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return el;
}

// ---------------------------------------------------------------------------
// Panel 4: Explain
// ---------------------------------------------------------------------------
const explainForm = document.getElementById("form-explain");
explainForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const topic = document.getElementById("explain-topic").value.trim();
  const level = document.getElementById("explain-level").value;

  if (!topic) {
    showToast("Enter a topic first.");
    return;
  }

  showLoading("Preparing your explanation…");
  try {
    const data = await apiRequest("/explain", { body: { topic, level } });
    const resultEl = document.getElementById("result-explain");
    const outputEl = document.getElementById("explain-output");
    outputEl.innerHTML = renderMarkdown(data.explanation);
    resultEl.hidden = false;
  } catch (err) {
    showToast(err.message);
  } finally {
    hideLoading();
  }
});

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
