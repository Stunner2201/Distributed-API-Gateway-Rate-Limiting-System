/**
 * Rate Limiter Factory
 * 
 * Provides a unified interface for rate limiting with automatic fallback
 * to in-memory rate limiting when Redis is unavailable.
 */

const RedisRateLimiter = require('./redisRateLimiter');
const InMemoryRateLimiter = require('./inMemoryRateLimiter');
const { isAvailable } = require('../redis/client');
const config = require('../config');

class RateLimiter {
  constructor() {
    this.redisLimiter = new RedisRateLimiter();
    this.inMemoryLimiter = new InMemoryRateLimiter();
    this.useRedis = true;
    this.redisFailures = 0;
  }

  /**
   * Initialize the rate limiter
   */
  async initialize() {
    try {
      await this.redisLimiter.initialize();
      // Check Redis availability
      const available = await isAvailable();
      this.useRedis = available;
      
      if (!available) {
        console.warn('Redis not available, using in-memory rate limiting');
      }
    } catch (error) {
      console.error('Rate limiter initialization error:', error);
      this.useRedis = false;
    }
  }

  /**
   * Check rate limit with automatic fallback
   * 
   * @param {string} key - Rate limit key
   * @param {number} capacity - Maximum tokens in bucket
   * @param {number} refillRate - Tokens added per second
   * @param {number} requestedTokens - Number of tokens to consume
   * @returns {Promise<{allowed: boolean, remaining: number, limit: number, retryAfter?: number}>}
   */
  async checkLimit(key, capacity, refillRate, requestedTokens = 1) {
    // Try Redis first if available
    if (this.useRedis) {
      try {
        const result = await this.redisLimiter.checkLimit(
          key,
          capacity,
          refillRate,
          requestedTokens
        );
        return result;
      } catch (error) {
        // Redis failed, switch to in-memory
        console.error('Redis rate limit check failed, falling back to in-memory:', error);
        this.redisFailures++;
        this.useRedis = false;
        
        // If fail-open is disabled, reject the request
        if (!config.rateLimiting.failOpenOnRedisError) {
          throw error;
        }
      }
    }

    // Use in-memory rate limiting
    return await this.inMemoryLimiter.checkLimit(
      key,
      capacity,
      refillRate,
      requestedTokens
    );
  }

  /**
   * Get Redis failure count
   */
  getRedisFailures() {
    return this.redisFailures;
  }

  /**
   * Check if currently using Redis
   */
  isUsingRedis() {
    return this.useRedis;
  }

  /**
   * Attempt to reconnect to Redis
   */
  async tryReconnectRedis() {
    try {
      const available = await isAvailable();
      if (available && !this.useRedis) {
        await this.redisLimiter.initialize();
        this.useRedis = true;
        console.log('Reconnected to Redis, switching back to distributed rate limiting');
      }
    } catch (error) {
      // Still unavailable
    }
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.inMemoryLimiter.destroy();
  }
}

module.exports = RateLimiter;
