/**
 * Metrics Middleware
 * 
 * Tracks request metrics for observability
 */

const metricsCollector = require('../metrics');
const { v4: uuidv4 } = require('uuid');

/**
 * Create metrics tracking middleware
 * @returns {Function} Express middleware
 */
function createMetricsMiddleware() {
  return (req, res, next) => {
    // Generate unique request ID
    const requestId = req.headers['x-request-id'] || uuidv4();
    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);

    // Record request start
    metricsCollector.recordRequestStart(requestId);

    // Track response
    const originalSend = res.send;
    res.send = function (body) {
      // Determine if request was allowed (not 429 or 503)
      const allowed = res.statusCode !== 429 && res.statusCode !== 503;
      metricsCollector.recordRequestEnd(requestId, allowed);
      
      return originalSend.call(this, body);
    };

    next();
  };
}

module.exports = createMetricsMiddleware;
