/**
 * Unit tests for InMemoryRateLimiter
 */

const InMemoryRateLimiter = require('../inMemoryRateLimiter');

describe('InMemoryRateLimiter', () => {
  let limiter;

  beforeEach(() => {
    limiter = new InMemoryRateLimiter();
  });

  afterEach(() => {
    limiter.destroy();
  });

  describe('Token Bucket Algorithm', () => {
    test('should allow request when tokens are available', async () => {
      const result = await limiter.checkLimit('test-key', 10, 1, 1);
      
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
      expect(result.limit).toBe(10);
      expect(result.retryAfter).toBeUndefined();
    });

    test('should reject request when tokens are exhausted', async () => {
      const capacity = 5;
      const refillRate = 1;
      
      // Consume all tokens
      for (let i = 0; i < capacity; i++) {
        await limiter.checkLimit('test-key', capacity, refillRate, 1);
      }
      
      // Next request should be rejected
      const result = await limiter.checkLimit('test-key', capacity, refillRate, 1);
      
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeDefined();
    });

    test('should refill tokens over time', async () => {
      const capacity = 10;
      const refillRate = 10; // 10 tokens per second
      
      // Consume all tokens
      for (let i = 0; i < capacity; i++) {
        await limiter.checkLimit('test-key', capacity, refillRate, 1);
      }
      
      // Wait 100ms (should add ~1 token)
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const result = await limiter.checkLimit('test-key', capacity, refillRate, 1);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0); // 1 token added, 1 consumed
    });

    test('should cap tokens at capacity', async () => {
      const capacity = 5;
      const refillRate = 100; // Very high refill rate
      
      // Wait 2 seconds (should add 200 tokens, but capped at 5)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const result = await limiter.checkLimit('test-key', capacity, refillRate, 1);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(capacity - 1);
    });

    test('should handle multiple tokens per request', async () => {
      const capacity = 10;
      const refillRate = 1;
      
      // Request 3 tokens at once
      const result = await limiter.checkLimit('test-key', capacity, refillRate, 3);
      
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(7);
    });

    test('should reject if requested tokens exceed available', async () => {
      const capacity = 5;
      const refillRate = 1;
      
      // Request more tokens than capacity
      const result = await limiter.checkLimit('test-key', capacity, refillRate, 10);
      
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(capacity);
    });
  });

  describe('Multiple Keys', () => {
    test('should maintain separate buckets for different keys', async () => {
      const capacity = 5;
      const refillRate = 1;
      
      // Exhaust key1
      for (let i = 0; i < capacity; i++) {
        await limiter.checkLimit('key1', capacity, refillRate, 1);
      }
      
      // key2 should still have tokens
      const result = await limiter.checkLimit('key2', capacity, refillRate, 1);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });
  });

  describe('Retry-After Calculation', () => {
    test('should calculate retry-after when rate limit exceeded', async () => {
      const capacity = 1;
      const refillRate = 2; // 2 tokens per second
      
      // Consume the only token
      await limiter.checkLimit('test-key', capacity, refillRate, 1);
      
      // Next request should be rejected with retry-after
      const result = await limiter.checkLimit('test-key', capacity, refillRate, 1);
      
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBe(1); // 1 / 2 = 0.5, ceil = 1
    });
  });

  describe('Cleanup', () => {
    test('should cleanup old buckets', () => {
      limiter.buckets.set('old-key', {
        tokens: 5,
        lastRefill: Date.now() - 7200000, // 2 hours ago
      });
      
      limiter.buckets.set('new-key', {
        tokens: 5,
        lastRefill: Date.now(),
      });
      
      limiter.cleanup();
      
      expect(limiter.buckets.has('old-key')).toBe(false);
      expect(limiter.buckets.has('new-key')).toBe(true);
    });
  });
});
