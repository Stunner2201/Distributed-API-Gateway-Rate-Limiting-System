# Testing Guide

This document provides comprehensive testing instructions for the Distributed Rate Limiting API Gateway.

## Running Tests

### Unit Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm test -- --coverage
```

### Test Structure

```
src/
├── rateLimiter/
│   └── __tests__/
│       ├── inMemoryRateLimiter.test.js    # In-memory rate limiter tests
│       ├── redisRateLimiter.test.js       # Redis rate limiter tests (mocked)
│       └── rateLimiter.test.js            # Main rate limiter with fallback tests
```

## Manual Testing

### Using Docker Compose

1. **Start the system:**
   ```bash
   docker-compose up -d
   ```

2. **Check services are running:**
   ```bash
   docker-compose ps
   ```

3. **View logs:**
   ```bash
   docker-compose logs -f gateway
   ```

### Test Scenarios

#### 1. Basic Rate Limiting

```bash
# Make requests within rate limit (default: 100 tokens, 10/sec)
for i in {1..50}; do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/users
done
# Should all return 200
```

#### 2. Rate Limit Exceeded

```bash
# Make 150 requests quickly (exceeds default limit of 100)
for i in {1..150}; do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/users
done
# Should see 429 responses after 100 requests
```

#### 3. API Key Rate Limiting

```bash
# Test with API key (policy: 100 tokens, 10/sec)
for i in {1..50}; do
  curl -H "X-API-Key: key-abc123" http://localhost:3000/api/users
done
```

#### 4. Endpoint-Specific Rate Limiting

```bash
# Test /api/users endpoint (policy: 50 tokens, 5/sec)
for i in {1..60}; do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/users
done
# Should see 429 after 50 requests
```

#### 5. Combined Policy (API Key + Endpoint)

```bash
# Test combined policy (policy: 20 tokens, 2/sec)
for i in {1..25}; do
  curl -H "X-API-Key: key-abc123" -s -o /dev/null -w "%{http_code}\n" \
    http://localhost:3000/api/users
done
# Should see 429 after 20 requests
```

#### 6. Check Rate Limit Headers

```bash
# Check headers on allowed request
curl -v http://localhost:3000/api/users 2>&1 | grep -i "rate-limit"

# Expected headers:
# X-RateLimit-Limit: 100
# X-RateLimit-Remaining: 99
```

#### 7. Rate Limit Exceeded Response

```bash
# Make request that exceeds limit
curl -v http://localhost:3000/api/users

# After exceeding limit, should see:
# HTTP/1.1 429 Too Many Requests
# X-RateLimit-Limit: 100
# X-RateLimit-Remaining: 0
# Retry-After: 1
```

#### 8. Metrics Endpoint

```bash
# Check metrics
curl http://localhost:3000/metrics

# Expected response:
# {
#   "total_requests": 150,
#   "allowed_requests": 100,
#   "blocked_requests": 50,
#   "redis_failures": 0,
#   "average_request_latency_ms": 15,
#   "redis_available": true
# }
```

#### 9. Health Check

```bash
curl http://localhost:3000/health
# Should return: {"status":"healthy","timestamp":"..."}
```

#### 10. Redis Failure Simulation

```bash
# Stop Redis
docker-compose stop redis

# Make requests (should fallback to in-memory)
curl http://localhost:3000/api/users

# Check metrics (should show redis_available: false)
curl http://localhost:3000/metrics

# Restart Redis
docker-compose start redis

# System should automatically reconnect
```

## Load Testing

### Using Apache Bench (ab)

```bash
# Install ab (if not available)
# On macOS: brew install httpd
# On Ubuntu: sudo apt-get install apache2-utils

# Test with 1000 requests, 100 concurrent
ab -n 1000 -c 100 http://localhost:3000/api/users
```

### Using wrk

```bash
# Install wrk
# On macOS: brew install wrk

# Test with 1000 requests, 10 threads, 100 connections
wrk -t10 -c100 -d30s http://localhost:3000/api/users
```

## Integration Testing

### Test Script

Create a test script to verify all functionality:

```bash
#!/bin/bash

BASE_URL="http://localhost:3000"
API_KEY="key-abc123"

echo "Testing API Gateway..."

# Health check
echo "1. Health check..."
curl -s "$BASE_URL/health" | jq .

# Metrics (initial)
echo "2. Initial metrics..."
curl -s "$BASE_URL/metrics" | jq .

# Make requests
echo "3. Making requests..."
for i in {1..10}; do
  curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/api/users" > /dev/null
done

# Check metrics
echo "4. Metrics after requests..."
curl -s "$BASE_URL/metrics" | jq .

# Test rate limiting
echo "5. Testing rate limiting..."
for i in {1..150}; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/users")
  if [ "$STATUS" == "429" ]; then
    echo "Rate limit hit at request $i"
    break
  fi
done

# Final metrics
echo "6. Final metrics..."
curl -s "$BASE_URL/metrics" | jq .

echo "Testing complete!"
```

## Expected Test Results

### Unit Tests

All unit tests should pass:
- ✅ InMemoryRateLimiter: Token bucket algorithm correctness
- ✅ RedisRateLimiter: Redis integration (mocked)
- ✅ RateLimiter: Fallback behavior

### Integration Tests

- ✅ Health endpoint returns 200
- ✅ Metrics endpoint returns valid JSON
- ✅ Rate limiting enforces limits correctly
- ✅ Headers are set correctly
- ✅ 429 responses include Retry-After
- ✅ Fallback works when Redis is unavailable

## Troubleshooting

### Tests Failing

1. **Redis connection errors**: Ensure Redis is running
2. **Port conflicts**: Check if ports 3000, 3001, 6379 are available
3. **Docker issues**: Try `docker-compose down -v` to reset volumes

### Rate Limiting Not Working

1. Check Redis is connected: `curl http://localhost:3000/metrics`
2. Verify policies in `src/middleware/rateLimitMiddleware.js`
3. Check gateway logs: `docker-compose logs gateway`

### Performance Issues

1. Monitor Redis memory: `docker exec rate-limit-redis redis-cli INFO memory`
2. Check gateway metrics for latency
3. Verify Redis connection pooling

