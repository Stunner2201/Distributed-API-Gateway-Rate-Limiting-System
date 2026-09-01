/**
 * Unit tests for RedisRateLimiter
 * Uses mocked Redis client
 */

const RedisRateLimiter = require('../redisRateLimiter');
const { TOKEN_BUCKET_SCRIPT } = require('../lua-script');

// Mock Redis client
jest.mock('../../redis/client', () => ({
  getClient: jest.fn(),
}));

const { getClient } = require('../../redis/client');

describe('RedisRateLimiter', () => {
  let limiter;
  let mockClient;

  beforeEach(() => {
    limiter = new RedisRateLimiter();
    
    // Create mock Redis client
    mockClient = {
      scriptLoad: jest.fn(),
      evalSha: jest.fn(),
      eval: jest.fn(),
    };
    
    getClient.mockResolvedValue(mockClient);
  });

  describe('Initialization', () => {
    test('should load Lua script on initialization', async () => {
      mockClient.scriptLoad.mockResolvedValue('script-sha-123');
      
      await limiter.initialize();
      
      expect(mockClient.scriptLoad).toHaveBeenCalledWith(TOKEN_BUCKET_SCRIPT);
      expect(limiter.scriptSha).toBe('script-sha-123');
    });

    test('should handle script load failure gracefully', async () => {
      mockClient.scriptLoad.mockRejectedValue(new Error('Load failed'));
      
      await expect(limiter.initialize()).rejects.toThrow('Load failed');
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(async () => {
      mockClient.scriptLoad.mockResolvedValue('script-sha-123');
      await limiter.initialize();
    });

    test('should allow request when tokens available', async () => {
      // Mock Redis response: [allowed=1, remaining=9, limit=10]
      mockClient.evalSha.mockResolvedValue([1, 9, 10]);
      
      const result = await limiter.checkLimit('test-key', 10, 1, 1);
      
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
      expect(result.limit).toBe(10);
      expect(mockClient.evalSha).toHaveBeenCalledWith(
        'script-sha-123',
        expect.objectContaining({
          keys: ['test-key'],
          arguments: expect.arrayContaining(['10', '1', '1']),
        })
      );
    });

    test('should reject request when tokens exhausted', async () => {
      // Mock Redis response: [allowed=0, remaining=0, limit=10]
      mockClient.evalSha.mockResolvedValue([0, 0, 10]);
      
      const result = await limiter.checkLimit('test-key', 10, 1, 1);
      
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.limit).toBe(10);
      expect(result.retryAfter).toBeDefined();
    });

    test('should use EVAL if script not loaded', async () => {
      limiter.scriptSha = null;
      mockClient.eval.mockResolvedValue([1, 9, 10]);
      
      const result = await limiter.checkLimit('test-key', 10, 1, 1);
      
      expect(result.allowed).toBe(true);
      expect(mockClient.eval).toHaveBeenCalledWith(
        TOKEN_BUCKET_SCRIPT,
        expect.any(Object)
      );
      expect(mockClient.evalSha).not.toHaveBeenCalled();
    });

    test('should handle Redis errors', async () => {
      mockClient.evalSha.mockRejectedValue(new Error('Redis connection failed'));
      
      await expect(
        limiter.checkLimit('test-key', 10, 1, 1)
      ).rejects.toThrow('Redis connection failed');
    });

    test('should calculate retry-after when rate limit exceeded', async () => {
      mockClient.evalSha.mockResolvedValue([0, 0, 10]);
      
      const result = await limiter.checkLimit('test-key', 10, 5, 1); // 5 tokens/sec
      
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBe(1); // ceil(1/5) = 1
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      mockClient.scriptLoad.mockResolvedValue('script-sha-123');
      await limiter.initialize();
    });

    test('should handle null Redis client', async () => {
      getClient.mockResolvedValue(null);
      
      await expect(
        limiter.checkLimit('test-key', 10, 1, 1)
      ).rejects.toThrow('Redis client not available');
    });

    test('should handle multiple tokens per request', async () => {
      mockClient.evalSha.mockResolvedValue([1, 7, 10]);
      
      const result = await limiter.checkLimit('test-key', 10, 1, 3);
      
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(7);
    });
  });
});

