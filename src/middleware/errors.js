const { Router } = require('express');

/**
 * Global error-handling middleware.
 * Must be mounted AFTER all routes (Express identifies error handlers by 4-arity signature).
 */
function errorHandler(err, req, res, _next) {
  // Log the error for server-side debugging (never expose stack to client)
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}:`, err.message);

  // SQLite constraint violations
  if (err.message && err.message.includes('SQLITE_CONSTRAINT')) {
    return res.status(409).json({ error: 'Constraint violation' });
  }

  // JSON parse errors (malformed request body)
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Default: 500 Internal Server Error
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
}

module.exports = errorHandler;
