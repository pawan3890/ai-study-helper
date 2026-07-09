/**
 * upload.js
 * ---------------------------------------------------------------------------
 * Handles file uploads (memory storage — nothing is written to disk) and
 * extracts plain text from PDFs, DOCX files, and plain text files so routes
 * can work with a single `content` string regardless of source.
 * ---------------------------------------------------------------------------
 */

const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 10);

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "text/plain",
  "text/markdown",
]);

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Unsupported file type "${file.mimetype}". Please upload a PDF, DOCX, or plain text file.`
        )
      );
    }
  },
});

/**
 * Extract plain text from an uploaded file buffer based on its mimetype.
 * @param {Express.Multer.File} file
 * @returns {Promise<string>}
 */
async function extractText(file) {
  if (!file) return "";

  switch (file.mimetype) {
    case "application/pdf": {
      const data = await pdfParse(file.buffer);
      return data.text.trim();
    }
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      return result.value.trim();
    }
    case "text/plain":
    case "text/markdown":
      return file.buffer.toString("utf-8").trim();
    default:
      throw new Error(`Cannot extract text from mimetype: ${file.mimetype}`);
  }
}

module.exports = { upload, extractText };
