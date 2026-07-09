const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");

const { upload, extractText } = require("../middleware/upload");
const { generate } = require("../services/aiProvider");
const { clampContent, requireNonEmpty } = require("../utils/textUtils");
const {
  getSession,
  createSession,
  appendMessage,
} = require("../services/sessionStore");

function buildSystemPrompt(sourceContent) {
  const base = `You are a patient, encouraging study tutor having a conversation with a student.
Answer clearly and correctly. Use short paragraphs or bullet points where helpful.
If a question is ambiguous, ask a brief clarifying question rather than guessing.
If you don't know something or it isn't in the provided material, say so honestly.`;

  if (!sourceContent) return base;

  return `${base}\n\nThe student has shared the following study material as context for this conversation. Ground your answers in it when relevant, but you may also use general knowledge to help explain concepts:\n\n"""\n${sourceContent}\n"""`;
}

// Start a new chat session, optionally seeded with material (text or file)
router.post("/session", upload.single("file"), async (req, res, next) => {
  try {
    let sourceContent = req.body.text || "";

    if (req.file) {
      const extracted = await extractText(req.file);
      sourceContent = [sourceContent, extracted].filter(Boolean).join("\n\n");
    }

    const { content: clamped, truncated } = clampContent(sourceContent);

    const sessionId = uuidv4();
    createSession(sessionId, { sourceContent: clamped });

    res.json({
      success: true,
      sessionId,
      meta: { sourceCharCount: clamped.length, truncated, hasContext: !!clamped },
    });
  } catch (err) {
    next(err);
  }
});

// Send a message within an existing session
router.post("/message", async (req, res, next) => {
  try {
    const { sessionId, message } = req.body;

    requireNonEmpty(sessionId, "sessionId");
    requireNonEmpty(message, "message");

    let session = getSession(sessionId);
    if (!session) {
      // Gracefully create a fresh, contextless session rather than erroring,
      // so the client doesn't get stuck if a session expired.
      session = createSession(sessionId, { sourceContent: "" });
    }

    appendMessage(sessionId, "user", message);

    const reply = await generate({
      system: buildSystemPrompt(session.sourceContent),
      messages: session.messages,
      maxTokens: 1200,
      temperature: 0.5,
    });

    appendMessage(sessionId, "assistant", reply);

    res.json({ success: true, reply, sessionId });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
