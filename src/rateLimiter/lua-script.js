/**
 * Redis Lua script for atomic Token Bucket rate limiting
 * 
 * This script performs the following operations atomically:
 * 1. Calculate tokens to add based on elapsed time and refill rate
 * 2. Refill the bucket (capped at capacity)
 * 3. Decrement tokens if available
 * 4. Return remaining tokens, limit, and whether request is allowed
 * 
 * Algorithm: Token Bucket with lazy refill
 * - Tokens are added lazily on each request based on time elapsed
 * - Prevents race conditions by doing everything in a single atomic operation
 */

const TOKEN_BUCKET_SCRIPT = `
  local key = KEYS[1]
  local capacity = tonumber(ARGV[1])
  local refill_rate = tonumber(ARGV[2])
  local requested_tokens = tonumber(ARGV[3])
  local now = tonumber(ARGV[4])
  
  -- Get current bucket state
  local bucket_data = redis.call('HMGET', key, 'tokens', 'last_refill')
  local current_tokens = tonumber(bucket_data[1]) or capacity
  local last_refill = tonumber(bucket_data[2]) or now
  
  -- Calculate time elapsed since last refill (in seconds)
  local elapsed = (now - last_refill) / 1000.0
  
  -- Calculate tokens to add (lazy refill)
  local tokens_to_add = math.floor(elapsed * refill_rate)
  
  -- Refill bucket (capped at capacity)
  current_tokens = math.min(capacity, current_tokens + tokens_to_add)
  
  -- Check if we have enough tokens
  local allowed = 0
  local remaining = current_tokens
  
  if current_tokens >= requested_tokens then
    -- Consume tokens
    remaining = current_tokens - requested_tokens
    allowed = 1
  end
  
  -- Update bucket state (using HSET for Redis 4.0+ compatibility)
  redis.call('HSET', key, 'tokens', remaining, 'last_refill', now)
  redis.call('EXPIRE', key, 3600) -- Expire after 1 hour of inactivity
  
  -- Return: allowed (1 or 0), remaining tokens, capacity
  return {allowed, remaining, capacity}
`;

/**
 * Load the Lua script into Redis for efficient execution
 * @param {redis.RedisClient} client - Redis client
 * @returns {Promise<string>} Script SHA for execution
 */
async function loadScript(client) {
  try {
    const sha = await client.scriptLoad(TOKEN_BUCKET_SCRIPT);
    return sha;
  } catch (error) {
    console.error('Failed to load Lua script:', error);
    throw error;
  }
}

module.exports = {
  TOKEN_BUCKET_SCRIPT,
  loadScript,
};

