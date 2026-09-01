/**
 * In-Memory Token Bucket Rate Limiter (Fallback)
 * 
 * Used when Redis is unavailable. Provides rate limiting per gateway instance.
 * Note: This is less accurate in distributed scenarios but ensures availability.
 */

class InMemoryRateLimiter {
  constructor() {
    // Map of key -> { tokens, lastRefill }
    this.buckets = new Map();
    
    // Cleanup interval to prevent memory leaks
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Clean up every minute
  }

  /**
   * Clean up old buckets that haven't been accessed in a while
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour
    
    for (const [key, bucket] of this.buckets.entries()) {
      if (now - bucket.lastRefill > maxAge) {
        this.buckets.delete(key);
      }
    }
  }

  /**
   * Check rate limit using Token Bucket algorithm
   * 
   * @param {string} key - Rate limit key
   * @param {number} capacity - Maximum tokens in bucket
   * @param {number} refillRate - Tokens added per second
   * @param {number} requestedTokens - Number of tokens to consume (default: 1)
   * @returns {Promise<{allowed: boolean, remaining: number, limit: number, retryAfter?: number}>}
   */
  async checkLimit(key, capacity, refillRate, requestedTokens = 1) {
    const now = Date.now();
    
    // Get or create bucket
    let bucket = this.buckets.get(key);
    
    if (!bucket) {
      bucket = {
        tokens: capacity,
        lastRefill: now,
      };
      this.buckets.set(key, bucket);
    }

    // Calculate time elapsed since last refill (in seconds)
    const elapsed = (now - bucket.lastRefill) / 1000.0;
    
    // Calculate tokens to add (lazy refill)
    const tokensToAdd = Math.floor(elapsed * refillRate);
    
    // Refill bucket (capped at capacity)
    bucket.tokens = Math.min(capacity, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    // Check if we have enough tokens
    let allowed = false;
    let remaining = bucket.tokens;

    if (bucket.tokens >= requestedTokens) {
      // Consume tokens
      remaining = bucket.tokens - requestedTokens;
      bucket.tokens = remaining;
      allowed = true;
    }

    // Calculate retry-after if not allowed
    let retryAfter = undefined;
    if (!allowed) {
      // Estimate time until next token is available
      retryAfter = Math.ceil(1 / refillRate);
    }

    return {
      allowed,
      remaining,
      limit: capacity,
      retryAfter,
    };
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.buckets.clear();
  }
}

module.exports = InMemoryRateLimiter;

