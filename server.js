require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const summarizeRoute = require("./routes/summarize");
const quizRoute = require("./routes/quiz");
const chatRoute = require("./routes/chat");
const explainRoute = require("./routes/explain");

const app = express();
const PORT = process.env.PORT || 3000;

// --- Core middleware ---
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// --- Rate limiting for AI-backed endpoints (protects your API key/budget) ---
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // 60 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many requests. Please wait a bit before trying again.",
  },
});
app.use("/api", aiLimiter);

// --- Routes ---
app.use("/api/summarize", summarizeRoute);
app.use("/api/quiz", quizRoute);
app.use("/api/chat", chatRoute);
app.use("/api/explain", explainRoute);

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    provider: process.env.AI_PROVIDER || "anthropic",
  });
});

// --- 404 handler for unknown API routes ---
app.use("/api", (req, res) => {
  res.status(404).json({ success: false, error: "Endpoint not found." });
});

// --- Central error handler ---
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[error]", err.message);

  if (err.message && err.message.includes("Unsupported file type")) {
    return res.status(400).json({ success: false, error: err.message });
  }
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      success: false,
      error: `File is too large. Max size is ${process.env.MAX_UPLOAD_MB || 10}MB.`,
    });
  }

  // Only ever surface our own validation messages (status 400) to the client.
  // Anything else (auth errors, upstream provider errors, etc.) gets a safe,
  // generic message so we never leak API error details or internals.
  const isOwnValidationError = err.status === 400;
  const status = isOwnValidationError ? 400 : 500;
  const safeMessage = isOwnValidationError
    ? err.message
    : "Something went wrong while contacting the AI provider. Please check your API key and try again.";

  res.status(status).json({ success: false, error: safeMessage });
});

app.listen(PORT, () => {
  console.log(`\n  AI Study Helper running at http://localhost:${PORT}`);
  console.log(`  AI provider: ${process.env.AI_PROVIDER || "anthropic"}\n`);
});
