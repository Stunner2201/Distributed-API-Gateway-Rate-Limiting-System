/**
 * Unit tests for RateLimiter (main factory with fallback)
 */

const RateLimiter = require('../index');
const RedisRateLimiter = require('../redisRateLimiter');
const InMemoryRateLimiter = require('../inMemoryRateLimiter');
const { isAvailable } = require('../../redis/client');
const config = require('../../config');

// Mock dependencies
jest.mock('../redisRateLimiter');
jest.mock('../inMemoryRateLimiter');
jest.mock('../../redis/client');
jest.mock('../../config', () => ({
  rateLimiting: {
    failOpenOnRedisError: true,
  },
}));

describe('RateLimiter', () => {
  let limiter;
  let mockRedisLimiter;
  let mockInMemoryLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
    
    // Get mocked instances
    mockRedisLimiter = limiter.redisLimiter;
    mockInMemoryLimiter = limiter.inMemoryLimiter;
    
    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    limiter.destroy();
  });

  describe('Initialization', () => {
    test('should initialize Redis limiter when Redis is available', async () => {
      isAvailable.mockResolvedValue(true);
      mockRedisLimiter.initialize.mockResolvedValue();
      
      await limiter.initialize();
      
      expect(mockRedisLimiter.initialize).toHaveBeenCalled();
      expect(limiter.useRedis).toBe(true);
    });

    test('should fallback to in-memory when Redis is unavailable', async () => {
      isAvailable.mockResolvedValue(false);
      mockRedisLimiter.initialize.mockResolvedValue();
      
      await limiter.initialize();
      
      expect(mockRedisLimiter.initialize).toHaveBeenCalled();
      expect(limiter.useRedis).toBe(false);
    });

    test('should handle initialization errors gracefully', async () => {
      isAvailable.mockResolvedValue(true);
      mockRedisLimiter.initialize.mockRejectedValue(new Error('Init failed'));
      
      await limiter.initialize();
      
      expect(limiter.useRedis).toBe(false);
    });
  });

  describe('Rate Limiting with Redis', () => {
    beforeEach(async () => {
      isAvailable.mockResolvedValue(true);
      mockRedisLimiter.initialize.mockResolvedValue();
      await limiter.initialize();
      limiter.useRedis = true;
    });

    test('should use Redis limiter when available', async () => {
      mockRedisLimiter.checkLimit.mockResolvedValue({
        allowed: true,
        remaining: 9,
        limit: 10,
      });
      
      const result = await limiter.checkLimit('test-key', 10, 1, 1);
      
      expect(mockRedisLimiter.checkLimit).toHaveBeenCalledWith('test-key', 10, 1, 1);
      expect(mockInMemoryLimiter.checkLimit).not.toHaveBeenCalled();
      expect(result.allowed).toBe(true);
    });

    test('should fallback to in-memory on Redis failure (fail-open)', async () => {
      mockRedisLimiter.checkLimit.mockRejectedValue(new Error('Redis error'));
      mockInMemoryLimiter.checkLimit.mockResolvedValue({
        allowed: true,
        remaining: 9,
        limit: 10,
      });
      
      const result = await limiter.checkLimit('test-key', 10, 1, 1);
      
      expect(mockRedisLimiter.checkLimit).toHaveBeenCalled();
      expect(mockInMemoryLimiter.checkLimit).toHaveBeenCalledWith('test-key', 10, 1, 1);
      expect(limiter.useRedis).toBe(false);
      expect(limiter.redisFailures).toBe(1);
      expect(result.allowed).toBe(true);
    });

    test('should throw error on Redis failure (fail-closed)', async () => {
      config.rateLimiting.failOpenOnRedisError = false;
      mockRedisLimiter.checkLimit.mockRejectedValue(new Error('Redis error'));
      
      await expect(
        limiter.checkLimit('test-key', 10, 1, 1)
      ).rejects.toThrow('Redis error');
      
      expect(mockInMemoryLimiter.checkLimit).not.toHaveBeenCalled();
    });
  });

  describe('Rate Limiting with In-Memory Fallback', () => {
    beforeEach(() => {
      limiter.useRedis = false;
    });

    test('should use in-memory limiter when Redis unavailable', async () => {
      mockInMemoryLimiter.checkLimit.mockResolvedValue({
        allowed: true,
        remaining: 9,
        limit: 10,
      });
      
      const result = await limiter.checkLimit('test-key', 10, 1, 1);
      
      expect(mockInMemoryLimiter.checkLimit).toHaveBeenCalledWith('test-key', 10, 1, 1);
      expect(mockRedisLimiter.checkLimit).not.toHaveBeenCalled();
      expect(result.allowed).toBe(true);
    });
  });

  describe('Redis Reconnection', () => {
    test('should reconnect to Redis when available', async () => {
      limiter.useRedis = false;
      isAvailable.mockResolvedValue(true);
      mockRedisLimiter.initialize.mockResolvedValue();
      
      await limiter.tryReconnectRedis();
      
      expect(mockRedisLimiter.initialize).toHaveBeenCalled();
      expect(limiter.useRedis).toBe(true);
    });

    test('should not reconnect if already using Redis', async () => {
      limiter.useRedis = true;
      
      await limiter.tryReconnectRedis();
      
      expect(mockRedisLimiter.initialize).not.toHaveBeenCalled();
    });

    test('should handle reconnection failure gracefully', async () => {
      limiter.useRedis = false;
      isAvailable.mockResolvedValue(false);
      
      await limiter.tryReconnectRedis();
      
      expect(limiter.useRedis).toBe(false);
    });
  });

  describe('Utility Methods', () => {
    test('should return Redis failure count', () => {
      limiter.redisFailures = 5;
      expect(limiter.getRedisFailures()).toBe(5);
    });

    test('should return Redis usage status', () => {
      limiter.useRedis = true;
      expect(limiter.isUsingRedis()).toBe(true);
      
      limiter.useRedis = false;
      expect(limiter.isUsingRedis()).toBe(false);
    });
  });

  describe('Cleanup', () => {
    test('should cleanup in-memory limiter on destroy', () => {
      limiter.destroy();
      expect(mockInMemoryLimiter.destroy).toHaveBeenCalled();
    });
  });
});

