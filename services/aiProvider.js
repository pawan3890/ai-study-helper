/**
 * aiProvider.js
 * ---------------------------------------------------------------------------
 * A single, swappable interface over three possible AI backends: Anthropic
 * (Claude, direct), OpenAI, or OpenRouter (proxy to many models, including
 * Claude). Every route in this app calls `generate()` below and never
 * touches the SDKs directly, so switching providers is just an environment
 * variable change (AI_PROVIDER=anthropic|openai|openrouter) — no route code
 * has to change.
 * ---------------------------------------------------------------------------
 */

const PROVIDER = (process.env.AI_PROVIDER || "anthropic").toLowerCase();

let anthropicClient = null;
let openaiClient = null;
let openrouterClient = null;

function getAnthropicClient() {
  if (!anthropicClient) {
    const Anthropic = require("@anthropic-ai/sdk");
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it to your .env file."
      );
    }
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

function getOpenAIClient() {
  if (!openaiClient) {
    const OpenAI = require("openai");
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set. Add it to your .env file.");
    }
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

function getOpenRouterClient() {
  if (!openrouterClient) {
    const OpenAI = require("openai");
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error(
        "OPENROUTER_API_KEY is not set. Add it to your .env file."
      );
    }
    // OpenRouter is OpenAI-API-compatible, so we reuse the openai SDK and
    // just point it at OpenRouter's base URL instead of api.openai.com.
    openrouterClient = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        // Optional but recommended by OpenRouter for their leaderboard/analytics.
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost",
        "X-Title": process.env.OPENROUTER_SITE_NAME || "AI Study Helper",
      },
    });
  }
  return openrouterClient;
}

/**
 * Generate a response from the configured AI provider.
 *
 * @param {Object} opts
 * @param {string} opts.system - System prompt / instructions.
 * @param {Array<{role: 'user'|'assistant', content: string}>} opts.messages - Conversation turns.
 * @param {number} [opts.maxTokens=2048] - Max tokens to generate.
 * @param {number} [opts.temperature=0.4] - Sampling temperature.
 * @returns {Promise<string>} The model's text response.
 */
async function generate({
  system,
  messages,
  maxTokens = 2048,
  temperature = 0.4,
}) {
  if (PROVIDER === "openai") {
    return generateWithOpenAI({ system, messages, maxTokens, temperature });
  }
  if (PROVIDER === "openrouter") {
    return generateWithOpenRouter({ system, messages, maxTokens, temperature });
  }
  return generateWithAnthropic({ system, messages, maxTokens, temperature });
}

async function generateWithAnthropic({ system, messages, maxTokens, temperature }) {
  const client = getAnthropicClient();
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

async function generateWithOpenAI({ system, messages, maxTokens, temperature }) {
  const client = getOpenAIClient();
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const response = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: "system", content: system }, ...messages],
  });

  return response.choices[0]?.message?.content?.trim() || "";
}

async function generateWithOpenRouter({ system, messages, maxTokens, temperature }) {
  const client = getOpenRouterClient();
  // Model IDs on OpenRouter are namespaced, e.g. "anthropic/claude-sonnet-4.5",
  // "openai/gpt-4o-mini", "google/gemini-2.5-flash", etc.
  // Full list: https://openrouter.ai/models
  const model = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5";

  const response = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: "system", content: system }, ...messages],
  });

  return response.choices[0]?.message?.content?.trim() || "";
}

/**
 * Attempt to parse a JSON object/array out of a model response, tolerating
 * stray markdown code fences or preambles the model may add despite
 * instructions.
 */
function extractJSON(text) {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

  const firstBrace = cleaned.search(/[[{]/);
  if (firstBrace > 0) cleaned = cleaned.slice(firstBrace);

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // Try to salvage by trimming trailing content after the last closing bracket
    const lastCurly = cleaned.lastIndexOf("}");
    const lastSquare = cleaned.lastIndexOf("]");
    const lastIdx = Math.max(lastCurly, lastSquare);
    if (lastIdx > -1) {
      try {
        return JSON.parse(cleaned.slice(0, lastIdx + 1));
      } catch (err2) {
        throw new Error(
          "AI response could not be parsed as JSON: " + err2.message
        );
      }
    }
    throw new Error("AI response could not be parsed as JSON: " + err.message);
  }
}

module.exports = { generate, extractJSON, PROVIDER };