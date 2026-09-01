/**
 * Rate Limiting Middleware
 * 
 * Express middleware that enforces rate limits based on:
 * - API key (from X-API-Key header)
 * - Endpoint path
 * - Combination of API key + endpoint
 */

const RateLimiter = require('../rateLimiter');
const config = require('../config');

// Rate limit policies configuration
// In production, this would come from a database or config service
const RATE_LIMIT_POLICIES = {
  // Per API key policies
  apiKey: {
    'key-abc123': { capacity: 100, refillRate: 10 }, // 100 tokens, 10 per second
    'key-xyz789': { capacity: 200, refillRate: 20 }, // 200 tokens, 20 per second
  },
  // Per endpoint policies
  endpoint: {
    '/api/users': { capacity: 50, refillRate: 5 },
    '/api/orders': { capacity: 30, refillRate: 3 },
    '/api/products': { capacity: 100, refillRate: 10 },
  },
  // Combined API key + endpoint policies (takes precedence)
  combined: {
    'key-abc123:/api/users': { capacity: 20, refillRate: 2 },
  },
};

/**
 * Create rate limiting middleware
 * @param {RateLimiter} rateLimiter - Rate limiter instance
 * @returns {Function} Express middleware
 */
function createRateLimitMiddleware(rateLimiter) {
  return async (req, res, next) => {
    try {
      // Determine rate limit key and policy
      const apiKey = req.headers['x-api-key'];
      const endpoint = req.path;
      
      let rateLimitKey = null;
      let policy = null;

      // Check combined policy first (most specific)
      if (apiKey && RATE_LIMIT_POLICIES.combined[`${apiKey}:${endpoint}`]) {
        rateLimitKey = `combined:${apiKey}:${endpoint}`;
        policy = RATE_LIMIT_POLICIES.combined[`${apiKey}:${endpoint}`];
      }
      // Check per-endpoint policy
      else if (RATE_LIMIT_POLICIES.endpoint[endpoint]) {
        rateLimitKey = `endpoint:${endpoint}`;
        policy = RATE_LIMIT_POLICIES.endpoint[endpoint];
      }
      // Check per-API-key policy
      else if (apiKey && RATE_LIMIT_POLICIES.apiKey[apiKey]) {
        rateLimitKey = `apikey:${apiKey}`;
        policy = RATE_LIMIT_POLICIES.apiKey[apiKey];
      }
      // Default policy
      else {
        rateLimitKey = apiKey ? `default:${apiKey}` : `default:${req.ip}`;
        policy = {
          capacity: config.rateLimiting.defaultCapacity,
          refillRate: config.rateLimiting.defaultRefillRate,
        };
      }

      // Check rate limit
      const result = await rateLimiter.checkLimit(
        rateLimitKey,
        policy.capacity,
        policy.refillRate,
        1 // Consume 1 token per request
      );

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', result.limit);
      res.setHeader('X-RateLimit-Remaining', result.remaining);

      if (!result.allowed) {
        // Rate limit exceeded
        if (result.retryAfter) {
          res.setHeader('Retry-After', result.retryAfter);
        }
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: 'Too many requests, please try again later',
          retryAfter: result.retryAfter,
        });
      }

      // Rate limit passed, continue to next middleware
      next();
    } catch (error) {
      // Error checking rate limit
      console.error('Rate limit middleware error:', error);
      
      // If fail-open is enabled, allow the request through
      if (config.rateLimiting.failOpenOnRedisError) {
        console.warn('Rate limit check failed, allowing request (fail-open mode)');
        next();
      } else {
        // Fail-closed: reject the request
        res.status(503).json({
          error: 'Service temporarily unavailable',
          message: 'Rate limiting service error',
        });
      }
    }
  };
}

module.exports = {
  createRateLimitMiddleware,
  RATE_LIMIT_POLICIES, // Export for testing/configuration
};

