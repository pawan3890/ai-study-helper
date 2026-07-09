const MAX_CONTENT_CHARS = 60000; // ~15k tokens of source material, keeps costs/latency sane

/**
 * Truncate very long source material so requests stay fast and affordable,
 * while flagging to the caller that truncation happened.
 */
function clampContent(text = "") {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_CONTENT_CHARS) {
    return { content: trimmed, truncated: false };
  }
  return {
    content: trimmed.slice(0, MAX_CONTENT_CHARS),
    truncated: true,
  };
}

function requireNonEmpty(value, fieldName) {
  if (!value || !String(value).trim()) {
    const err = new Error(`"${fieldName}" is required and cannot be empty.`);
    err.status = 400;
    throw err;
  }
}

module.exports = { clampContent, requireNonEmpty, MAX_CONTENT_CHARS };
