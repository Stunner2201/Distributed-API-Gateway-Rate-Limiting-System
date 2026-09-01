/**
 * Configuration module for the API Gateway
 * Centralizes all configuration with environment variable support
 */

require('dotenv').config();

module.exports = {
  gateway: {
    port: parseInt(process.env.GATEWAY_PORT || '3000', 10),
    backendServiceUrl: process.env.BACKEND_SERVICE_URL || 'http://localhost:3001',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    // Connection retry configuration
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  },
  rateLimiting: {
    // Fail-open: if Redis is unavailable, allow requests through with local rate limiting
    failOpenOnRedisError: process.env.FAIL_OPEN_ON_REDIS_ERROR === 'true',
    // Default token bucket parameters
    defaultCapacity: parseInt(process.env.DEFAULT_RATE_LIMIT_CAPACITY || '100', 10),
    defaultRefillRate: parseInt(process.env.DEFAULT_RATE_LIMIT_REFILL_RATE || '10', 10), // tokens per second
  },
};
