/**
 * Metrics Collection Module
 * 
 * Tracks observability metrics for the API Gateway:
 * - Total requests
 * - Allowed requests
 * - Blocked requests
 * - Redis failures
 * - Average request latency
 */

class MetricsCollector {
  constructor() {
    this.totalRequests = 0;
    this.allowedRequests = 0;
    this.blockedRequests = 0;
    this.redisFailures = 0;
    
    // Latency tracking
    this.latencySum = 0;
    this.latencyCount = 0;
    
    // Request timestamps for latency calculation
    this.requestStartTimes = new Map();
  }

  /**
   * Record the start of a request
   * @param {string} requestId - Unique request identifier
   */
  recordRequestStart(requestId) {
    this.requestStartTimes.set(requestId, Date.now());
    this.totalRequests++;
  }

  /**
   * Record the end of a request
   * @param {string} requestId - Unique request identifier
   * @param {boolean} allowed - Whether request was allowed
   */
  recordRequestEnd(requestId, allowed) {
    const startTime = this.requestStartTimes.get(requestId);
    if (startTime) {
      const latency = Date.now() - startTime;
      this.latencySum += latency;
      this.latencyCount++;
      this.requestStartTimes.delete(requestId);
    }

    if (allowed) {
      this.allowedRequests++;
    } else {
      this.blockedRequests++;
    }
  }

  /**
   * Record a Redis failure
   */
  recordRedisFailure() {
    this.redisFailures++;
  }

  /**
   * Get current metrics
   * @returns {Object} Metrics object
   */
  getMetrics() {
    const averageLatency = this.latencyCount > 0
      ? Math.round(this.latencySum / this.latencyCount)
      : 0;

    return {
      total_requests: this.totalRequests,
      allowed_requests: this.allowedRequests,
      blocked_requests: this.blockedRequests,
      redis_failures: this.redisFailures,
      average_request_latency_ms: averageLatency,
    };
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset() {
    this.totalRequests = 0;
    this.allowedRequests = 0;
    this.blockedRequests = 0;
    this.redisFailures = 0;
    this.latencySum = 0;
    this.latencyCount = 0;
    this.requestStartTimes.clear();
  }
}

// Singleton instance
const metricsCollector = new MetricsCollector();

module.exports = metricsCollector;
