const express = require("express");
const router = express.Router();

const { upload, extractText } = require("../middleware/upload");
const { generate, extractJSON } = require("../services/aiProvider");
const { clampContent, requireNonEmpty } = require("../utils/textUtils");

const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);

function buildSystemPrompt(difficulty, mcqCount, flashcardCount) {
  return `You are an expert quiz designer creating study materials for students.
Given source material, generate exactly ${mcqCount} multiple-choice questions at "${difficulty}" difficulty,
and exactly ${flashcardCount} flashcards (term/question on the front, answer on the back).

Respond with ONLY valid JSON (no markdown fences, no preamble, no trailing commentary) matching this exact shape:

{
  "mcqs": [
    {
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "correctIndex": 0,
      "explanation": "string, brief explanation of why the answer is correct"
    }
  ],
  "flashcards": [
    { "front": "string", "back": "string" }
  ]
}

Rules:
- Exactly 4 options per MCQ, only one correct.
- "correctIndex" is zero-based (0-3).
- Base every question strictly on the provided material; do not invent facts.
- Vary question types (definitions, application, cause/effect) where the material allows.
- "easy" = recall of explicit facts. "medium" = light application/inference. "hard" = multi-step reasoning or synthesis.`;
}

router.post("/", upload.single("file"), async (req, res, next) => {
  try {
    let content = req.body.text || "";

    if (req.file) {
      const extracted = await extractText(req.file);
      content = [content, extracted].filter(Boolean).join("\n\n");
    }

    requireNonEmpty(content, "text or file");

    const difficulty = VALID_DIFFICULTIES.has(req.body.difficulty)
      ? req.body.difficulty
      : "medium";

    const mcqCount = Math.min(
      Math.max(parseInt(req.body.mcqCount, 10) || 5, 1),
      20
    );
    const flashcardCount = Math.min(
      Math.max(parseInt(req.body.flashcardCount, 10) || 5, 1),
      20
    );

    const { content: clamped, truncated } = clampContent(content);

    const userMessage = `Generate the quiz and flashcards from this material:\n\n"""\n${clamped}\n"""`;

    const raw = await generate({
      system: buildSystemPrompt(difficulty, mcqCount, flashcardCount),
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 3000,
      temperature: 0.5,
    });

    const parsed = extractJSON(raw);

    res.json({
      success: true,
      difficulty,
      mcqs: parsed.mcqs || [],
      flashcards: parsed.flashcards || [],
      meta: { sourceCharCount: clamped.length, truncated },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
