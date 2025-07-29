// utils/errorHandler.js

/**
 * Sends a JSON error response with a status code and message.
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code (e.g., 400, 404, 500)
 * @param {string} message - Error message
 */
function handleError(res, statusCode, message) {
  return res.status(statusCode).json({ error: message });
}

module.exports = handleError;
