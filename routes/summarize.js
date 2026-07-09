const express = require("express");
const router = express.Router();

const { upload, extractText } = require("../middleware/upload");
const { generate } = require("../services/aiProvider");
const { clampContent, requireNonEmpty } = require("../utils/textUtils");

const SYSTEM_PROMPT = `You are an expert academic note-taker who creates clear, structured study summaries.
Given source material, produce a well-organized summary that helps a student review efficiently.

Always structure your response in this exact Markdown format:

## Overview
A 2-3 sentence high-level summary of what the material covers.

## Key Points
- 5-10 bullet points capturing the most important ideas, facts, or arguments.

## Important Terms & Definitions
- **Term**: brief definition (only include if the material has notable terminology; omit this section otherwise)

## Summary
A concise paragraph (4-6 sentences) tying everything together.

Keep language clear and simple. Do not invent facts not present in the source material.`;

router.post("/", upload.single("file"), async (req, res, next) => {
  try {
    let content = req.body.text || "";

    if (req.file) {
      const extracted = await extractText(req.file);
      content = [content, extracted].filter(Boolean).join("\n\n");
    }

    requireNonEmpty(content, "text or file");

    const { content: clamped, truncated } = clampContent(content);

    const userMessage = `Summarize the following study material:\n\n"""\n${clamped}\n"""`;

    const summary = await generate({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 1500,
      temperature: 0.3,
    });

    res.json({
      success: true,
      summary,
      meta: {
        sourceCharCount: clamped.length,
        truncated,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
