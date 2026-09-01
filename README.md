# Distributed Rate Limiting & API Gateway

A production-grade, stateless API Gateway with distributed rate limiting capabilities. Built with Node.js/Express, Redis, and Docker. Designed for correctness under concurrent traffic and partial failures.

## Table of Contents

- [Architecture](#architecture)
- [Algorithm Choice & Tradeoffs](#algorithm-choice--tradeoffs)
- [Features](#features)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Rate Limiting Policies](#rate-limiting-policies)
- [Failure Handling](#failure-handling)
- [Horizontal Scaling](#horizontal-scaling)
- [API Endpoints](#api-endpoints)
- [Testing](#testing)
- [Observability](#observability)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Requests                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
        ┌──────────────────────────────────────┐
        │     API Gateway (Stateless)          │
        │  ┌────────────────────────────────┐  │
        │  │  Metrics Middleware            │  │
        │  └────────────┬───────────────────┘  │
        │               │                      │
        │  ┌────────────▼───────────────────┐  │
        │  │  Rate Limiting Middleware      │  │
        │  │  - Token Bucket Algorithm      │  │
        │  │  - Policy Resolution           │  │
        │  └────────────┬───────────────────┘  │
        │               │                      │
        │  ┌────────────▼───────────────────┐  │
        │  │  Rate Limiter                 │  │
        │  │  ┌──────────┐  ┌────────────┐ │  │
        │  │  │  Redis   │  │ In-Memory  │ │  │
        │  │  │ (Primary)│  │ (Fallback) │ │  │
        │  │  └────┬─────┘  └────────────┘ │  │
        │  └───────┼────────────────────────┘  │
        │          │                            │
        │  ┌───────▼────────────────────────┐  │
        │  │  Proxy Middleware              │  │
        │  └───────┬────────────────────────┘  │
        └──────────┼───────────────────────────┘
                   │
                   ▼
        ┌──────────────────────┐
        │   Backend Service    │
        │   (Example Service)  │
        └──────────────────────┘
                   │
                   │
        ┌──────────▼──────────┐
        │   Redis Cluster     │
        │  (Shared State)     │
        │  - Lua Scripts      │
        │  - Atomic Ops       │
        └─────────────────────┘
```

### Component Overview

1. **API Gateway**: Stateless Express.js server that handles all incoming requests
2. **Rate Limiter**: Token Bucket implementation with Redis for distributed state
3. **Redis**: Shared state store for consistent rate limiting across instances
4. **Backend Service**: Example service demonstrating request forwarding
5. **Metrics Collector**: Observability metrics for monitoring

## Algorithm Choice & Tradeoffs

### Token Bucket Algorithm

We chose the **Token Bucket** algorithm for the following reasons:

#### Advantages:
- **Smooth Rate Limiting**: Allows bursts up to capacity, then enforces steady rate
- **Predictable Behavior**: Easy to understand and configure (capacity + refill rate)
- **Efficient**: Lazy refill only calculates tokens when needed
- **Flexible**: Supports different policies per API key, endpoint, or combination

#### Implementation Details:
- **Lazy Refill**: Tokens are calculated and added only when a request arrives
- **Atomic Operations**: Redis Lua scripts ensure correctness under concurrency
- **Time-based**: Uses millisecond precision for accurate rate limiting

#### Tradeoffs Considered:

| Algorithm | Pros | Cons | Why Not Chosen |
|-----------|------|------|----------------|
| **Fixed Window** | Simple, low memory | Burst at window start, inaccurate | Allows double the intended rate at boundaries |
| **Sliding Window** | More accurate | Higher memory, complex | More complex, higher Redis overhead |
| **Leaky Bucket** | Smooth output | No burst allowance | Less flexible for legitimate traffic spikes |
| **Token Bucket** | Burst + steady rate, efficient | Slightly more complex | ✅ Best balance |

### Redis Lua Scripts

**Why Lua Scripts?**
- **Atomicity**: Refill + decrement happens in a single atomic operation
- **Correctness**: Prevents race conditions across multiple gateway instances
- **Performance**: Script runs on Redis server, reducing network round-trips
- **Consistency**: Ensures all gateways see the same state

## Features

✅ **Distributed Rate Limiting**: Consistent limits across multiple gateway instances  
✅ **Token Bucket Algorithm**: Configurable capacity and refill rate  
✅ **Multiple Policy Types**: Per API key, per endpoint, or combined  
✅ **Atomic Operations**: Redis Lua scripts for correctness  
✅ **Fail-Open Fallback**: In-memory rate limiting when Redis is unavailable  
✅ **Observability**: Comprehensive metrics endpoint  
✅ **Stateless Design**: Safe to restart, horizontally scalable  
✅ **Production-Ready**: Error handling, graceful shutdown, health checks  

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)

### Using Docker Compose (Recommended)

```bash
# Clone or navigate to the project directory
cd "rate limiting system"

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f gateway

# Stop all services
docker-compose down
```

The gateway will be available at `http://localhost:3000`

### Local Development

```bash
# Install dependencies
npm install

# Start Redis (if not using Docker)
# docker run -d -p 6379:6379 redis:7-alpine

# Copy environment file
cp .env.example .env

# Start gateway
npm start

# Or use nodemon for development
npm run dev
```

## Configuration

Environment variables (see `.env.example`):

```bash
# Redis Configuration
REDIS_HOST=localhost          # Redis host
REDIS_PORT=6379               # Redis port
REDIS_PASSWORD=               # Redis password (optional)

# Gateway Configuration
GATEWAY_PORT=3000             # Gateway listening port
BACKEND_SERVICE_URL=http://backend:3001  # Backend service URL

# Rate Limiting Configuration
FAIL_OPEN_ON_REDIS_ERROR=true # Allow requests if Redis fails
DEFAULT_RATE_LIMIT_CAPACITY=100    # Default bucket capacity
DEFAULT_RATE_LIMIT_REFILL_RATE=10  # Default tokens per second
```

## Rate Limiting Policies

Policies are configured in `src/middleware/rateLimitMiddleware.js`. The system supports three policy types:

### 1. Per API Key
```javascript
apiKey: {
  'key-abc123': { capacity: 100, refillRate: 10 }, // 100 tokens, 10/sec
}
```
**Usage**: `curl -H "X-API-Key: key-abc123" http://localhost:3000/api/users`

### 2. Per Endpoint
```javascript
endpoint: {
  '/api/users': { capacity: 50, refillRate: 5 },
}
```
**Usage**: `curl http://localhost:3000/api/users`

### 3. Combined (API Key + Endpoint)
```javascript
combined: {
  'key-abc123:/api/users': { capacity: 20, refillRate: 2 },
}
```
**Usage**: `curl -H "X-API-Key: key-abc123" http://localhost:3000/api/users`

**Priority Order**: Combined → Endpoint → API Key → Default

## Failure Handling

### Redis Unavailability

When Redis becomes unavailable:

1. **Fail-Open Mode** (default): System falls back to in-memory rate limiting
   - Each gateway instance maintains its own rate limits
   - Less accurate in distributed scenarios but maintains availability
   - Automatic reconnection attempts every 30 seconds

2. **Fail-Closed Mode**: System rejects requests with 503 status
   - Set `FAIL_OPEN_ON_REDIS_ERROR=false`
   - Ensures no requests bypass rate limiting
   - Use when rate limiting is critical

### Partial Failures

- **Redis Connection Loss**: Automatic fallback to in-memory
- **Backend Service Down**: Returns 502 Bad Gateway
- **Gateway Crash**: Stateless design allows safe restart
- **Network Partitions**: Each gateway instance continues operating independently

## Horizontal Scaling

### Scaling the Gateway

The gateway is **stateless** and can be scaled horizontally:

```yaml
# docker-compose.yml example
gateway:
  build: .
  deploy:
    replicas: 5  # Run 5 gateway instances
```

All instances share the same Redis cluster, ensuring consistent rate limits.

### Scaling Redis

For high availability, use Redis Cluster or Redis Sentinel:

```javascript
// In src/redis/client.js, update connection:
client = redis.createCluster({
  rootNodes: [
    { host: 'redis-1', port: 6379 },
    { host: 'redis-2', port: 6379 },
    { host: 'redis-3', port: 6379 },
  ],
});
```

### Load Balancing

Place a load balancer (nginx, HAProxy, AWS ALB) in front of gateway instances:

```
                    ┌─────────────┐
                    │ Load Balancer│
                    └──────┬───────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐       ┌────▼────┐       ┌────▼────┐
   │Gateway 1│       │Gateway 2│       │Gateway 3│
   └────┬────┘       └────┬────┘       └────┬────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                    ┌──────▼──────┐
                    │ Redis Cluster│
                    └─────────────┘
```

## API Endpoints

### Gateway Endpoints

- `GET /health` - Health check (no rate limiting)
- `GET /metrics` - Observability metrics (no rate limiting)
- `GET /api/*` - Proxied to backend service (rate limited)

### Backend Service Endpoints (Example)

- `GET /api/users` - Get users list
- `GET /api/orders` - Get orders list
- `GET /api/products` - Get products list
- `POST /api/orders` - Create order

## Testing

### Quick Test Scripts

**Linux/macOS:**
```bash
chmod +x test-examples.sh
./test-examples.sh
```

**Windows:**
```cmd
test-examples.bat
```

### Sample curl Commands

```bash
# Test without API key (uses default policy)
curl http://localhost:3000/api/users

# Test with API key
curl -H "X-API-Key: key-abc123" http://localhost:3000/api/users

# Test rate limiting (make 150 requests quickly)
for i in {1..150}; do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/users
done

# Test combined policy
curl -H "X-API-Key: key-abc123" http://localhost:3000/api/users

# Check metrics
curl http://localhost:3000/metrics

# Health check
curl http://localhost:3000/health
```

### Expected Behavior

1. **Within Rate Limit**: Returns 200 with backend response
2. **Rate Limit Exceeded**: Returns 429 with headers:
   ```
   HTTP/1.1 429 Too Many Requests
   X-RateLimit-Limit: 100
   X-RateLimit-Remaining: 0
   Retry-After: 1
   ```

### Unit Tests

```bash
# Run tests
npm test

# Watch mode
npm run test:watch
```

## Observability

### Metrics Endpoint

`GET /metrics` returns:

```json
{
  "total_requests": 1000,
  "allowed_requests": 950,
  "blocked_requests": 50,
  "redis_failures": 2,
  "average_request_latency_ms": 15,
  "redis_available": true
}
```

### Metrics Explanation

- **total_requests**: Total requests processed
- **allowed_requests**: Requests that passed rate limiting
- **blocked_requests**: Requests rejected (429)
- **redis_failures**: Number of Redis connection failures
- **average_request_latency_ms**: Average request processing time
- **redis_available**: Current Redis connection status

### Integration with Monitoring

The metrics endpoint can be scraped by:
- Prometheus (with exporter)
- Datadog
- New Relic
- Custom monitoring solutions

## Project Structure

```
rate-limiting-system/
├── src/
│   ├── config/              # Configuration management
│   ├── middleware/          # Express middleware
│   │   ├── rateLimitMiddleware.js
│   │   └── metricsMiddleware.js
│   ├── rateLimiter/         # Rate limiting logic
│   │   ├── index.js         # Main rate limiter (with fallback)
│   │   ├── redisRateLimiter.js
│   │   ├── inMemoryRateLimiter.js
│   │   └── lua-script.js    # Redis Lua script
│   ├── redis/               # Redis client management
│   ├── metrics/             # Metrics collection
│   └── index.js             # Main gateway server
├── backend/                 # Example backend service
├── Dockerfile               # Gateway Docker image
├── docker-compose.yml       # Full stack orchestration
└── README.md               # This file
```

## Production Considerations

### Security
- Add authentication/authorization layer
- Use HTTPS/TLS
- Validate and sanitize API keys
- Implement request size limits

### Performance
- Use Redis connection pooling
- Consider Redis pipelining for batch operations
- Monitor Redis memory usage
- Set appropriate TTLs on rate limit keys

### Reliability
- Implement circuit breakers
- Add request timeouts
- Monitor and alert on Redis failures
- Use Redis persistence (AOF/RDB)

### Configuration Management
- Move policies to database or config service
- Support dynamic policy updates
- Implement policy versioning


## Contributing

This is a production-grade reference implementation. For production use, consider:
- Adding authentication
- Implementing policy management API
- Adding distributed tracing
- Enhancing error handling
- Adding comprehensive test coverage

