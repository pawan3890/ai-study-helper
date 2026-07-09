const express = require("express");
const router = express.Router();

const { generate } = require("../services/aiProvider");
const { requireNonEmpty } = require("../utils/textUtils");

const VALID_LEVELS = new Set(["beginner", "intermediate", "advanced"]);

function buildSystemPrompt(level) {
  return `You are an outstanding teacher explaining concepts step by step at a ${level} level.
Break the explanation into clear, numbered steps that build on each other logically.

Structure your response in this exact Markdown format:

## What It Is
1-2 sentence plain-language definition.

## Step-by-Step Breakdown
1. **Step title** — explanation
2. **Step title** — explanation
(continue with as many steps as needed, typically 3-7)

## Example
A concrete, worked example that illustrates the concept in action.

## Common Misconceptions
- 1-3 bullet points on things learners often get wrong (omit if not applicable)

Adjust vocabulary and depth to a ${level} audience. Be accurate; do not oversimplify to the point of being wrong.`;
}

router.post("/", async (req, res, next) => {
  try {
    const { topic } = req.body;
    requireNonEmpty(topic, "topic");

    const level = VALID_LEVELS.has(req.body.level) ? req.body.level : "beginner";

    const explanation = await generate({
      system: buildSystemPrompt(level),
      messages: [
        { role: "user", content: `Explain this topic/concept: ${topic.trim()}` },
      ],
      maxTokens: 1800,
      temperature: 0.4,
    });

    res.json({ success: true, topic: topic.trim(), level, explanation });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
