/**
 * Redis-based Token Bucket Rate Limiter
 * 
 * Implements distributed rate limiting using Redis with atomic Lua scripts.
 * Ensures correctness across multiple gateway instances.
 */

const { getClient } = require('../redis/client');
const { TOKEN_BUCKET_SCRIPT } = require('./lua-script');

class RedisRateLimiter {
  constructor() {
    this.scriptSha = null;
  }

  /**
   * Initialize the rate limiter by loading the Lua script
   */
  async initialize() {
    try {
      const client = await getClient();
      if (client) {
        this.scriptSha = await client.scriptLoad(TOKEN_BUCKET_SCRIPT);
      }
    } catch (error) {
      console.error('Failed to initialize Redis rate limiter:', error);
    }
  }

  /**
   * Check rate limit using Token Bucket algorithm
   * 
   * @param {string} key - Rate limit key (e.g., "api_key:abc123" or "endpoint:/api/users")
   * @param {number} capacity - Maximum tokens in bucket
   * @param {number} refillRate - Tokens added per second
   * @param {number} requestedTokens - Number of tokens to consume (default: 1)
   * @returns {Promise<{allowed: boolean, remaining: number, limit: number, retryAfter?: number}>}
   */
  async checkLimit(key, capacity, refillRate, requestedTokens = 1) {
    const client = await getClient();
    
    if (!client) {
      throw new Error('Redis client not available');
    }

    const now = Date.now();
    
    try {
      let result;
      
      if (this.scriptSha) {
        // Use EVALSHA for better performance (script already loaded)
        result = await client.evalSha(
          this.scriptSha,
          {
            keys: [key],
            arguments: [
              capacity.toString(),
              refillRate.toString(),
              requestedTokens.toString(),
              now.toString(),
            ],
          }
        );
      } else {
        // Fallback to EVAL if script not loaded
        result = await client.eval(
          TOKEN_BUCKET_SCRIPT,
          {
            keys: [key],
            arguments: [
              capacity.toString(),
              refillRate.toString(),
              requestedTokens.toString(),
              now.toString(),
            ],
          }
        );
      }
      
      // Handle case where result might be a string (Redis v4 sometimes returns strings)
      if (typeof result === 'string') {
        // Try to parse if it's a JSON string, otherwise handle as array
        try {
          result = JSON.parse(result);
        } catch (e) {
          // If not JSON, it might be a single value - wrap in array
          result = [result];
        }
      }

      const [allowed, remaining, limit] = result;
      const isAllowed = allowed === 1;

      // Calculate retry-after if not allowed
      let retryAfter = undefined;
      if (!isAllowed) {
        // Estimate time until next token is available
        // This is approximate since we don't know exact refill time
        retryAfter = Math.ceil(1 / refillRate);
      }

      return {
        allowed: isAllowed,
        remaining: parseInt(remaining, 10),
        limit: parseInt(limit, 10),
        retryAfter,
      };
    } catch (error) {
      console.error(`Rate limit check failed for key ${key}:`, error);
      throw error;
    }
  }
}

module.exports = RedisRateLimiter;

