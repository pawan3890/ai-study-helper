/**
 * sessionStore.js
 * ---------------------------------------------------------------------------
 * A minimal in-memory store for chat sessions, keyed by sessionId. Good
 * enough for a single-instance dev/demo deployment. For production/multi
 * instance use, swap this for Redis or a database with the same interface.
 * ---------------------------------------------------------------------------
 */

const sessions = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 2; // 2 hours
const MAX_HISTORY_MESSAGES = 20; // keep last N turns to bound token usage

function touch(sessionId) {
  const session = sessions.get(sessionId);
  if (session) session.lastActive = Date.now();
}

function getSession(sessionId) {
  cleanupExpired();
  return sessions.get(sessionId) || null;
}

function createSession(sessionId, { sourceContent = "" } = {}) {
  const session = {
    id: sessionId,
    sourceContent,
    messages: [],
    createdAt: Date.now(),
    lastActive: Date.now(),
  };
  sessions.set(sessionId, session);
  return session;
}

function appendMessage(sessionId, role, content) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  session.messages.push({ role, content });
  if (session.messages.length > MAX_HISTORY_MESSAGES) {
    session.messages = session.messages.slice(-MAX_HISTORY_MESSAGES);
  }
  touch(sessionId);
  return session;
}

function cleanupExpired() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActive > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

module.exports = { getSession, createSession, appendMessage };
