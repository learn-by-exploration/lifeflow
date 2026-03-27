const { Router } = require('express');
const logger = require('../logger');
const { AppError } = require('../errors');

/**
 * Global error-handling middleware.
 * Must be mounted AFTER all routes (Express identifies error handlers by 4-arity signature).
 *
 * Handles two error formats:
 * - AppError subclasses → structured { error: { code, message, details? } }
 * - Plain errors → legacy { error: "message" } for backward compatibility
 */
function errorHandler(err, req, res, _next) {
  // Log the error for server-side debugging (never expose stack to client)
  logger.error({ err, method: req.method, url: req.originalUrl }, 'Request error');

  // Structured AppError subclasses — use legacy { error: "message" } format
  // for backward compatibility with existing tests and clients
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message });
  }

  // SQLite constraint violations
  if (err.message && err.message.includes('SQLITE_CONSTRAINT')) {
    return res.status(409).json({ error: 'Constraint violation' });
  }

  // JSON parse errors (malformed request body)
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Default: 500 Internal Server Error (legacy format for backward compat)
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
}

module.exports = errorHandler;
