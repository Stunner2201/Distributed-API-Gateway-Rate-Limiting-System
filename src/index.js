/**
 * API Gateway Main Entry Point
 * 
 * Stateless API Gateway with distributed rate limiting
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const RateLimiter = require('./rateLimiter');
const { createRateLimitMiddleware } = require('./middleware/rateLimitMiddleware');
const createMetricsMiddleware = require('./middleware/metricsMiddleware');
const metricsCollector = require('./metrics');
const config = require('./config');

const app = express();
const rateLimiter = new RateLimiter();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Metrics middleware (must be first to track all requests)
app.use(createMetricsMiddleware());

// Health check endpoint (no rate limiting)
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Metrics endpoint (no rate limiting)
app.get('/metrics', (req, res) => {
  const metrics = metricsCollector.getMetrics();
  
  // Include Redis status
  metrics.redis_available = rateLimiter.isUsingRedis();
  
  res.json(metrics);
});

// Rate limiting middleware
app.use(createRateLimitMiddleware(rateLimiter));

// Proxy middleware to forward requests to backend service
const proxyMiddleware = createProxyMiddleware({
  target: config.gateway.backendServiceUrl,
  changeOrigin: true,
  pathRewrite: {
    '^/api': '/api', // Keep /api prefix
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(502).json({
      error: 'Bad Gateway',
      message: 'Backend service unavailable',
    });
  },
  onProxyReq: (proxyReq, req, res) => {
    // Forward original request ID
    if (req.requestId) {
      proxyReq.setHeader('X-Request-ID', req.requestId);
    }
  },
});

// Apply proxy to all /api routes
app.use('/api', proxyMiddleware);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.path} not found`,
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
  });
});

// Initialize and start server
async function start() {
  try {
    // Initialize rate limiter
    await rateLimiter.initialize();
    
    // Periodic Redis reconnection attempt
    setInterval(async () => {
      if (!rateLimiter.isUsingRedis()) {
        await rateLimiter.tryReconnectRedis();
      }
    }, 30000); // Try every 30 seconds

    // Start server
    const port = config.gateway.port;
    app.listen(port, () => {
      console.log(`API Gateway listening on port ${port}`);
      console.log(`Backend service: ${config.gateway.backendServiceUrl}`);
      console.log(`Redis: ${config.redis.host}:${config.redis.port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  rateLimiter.destroy();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  rateLimiter.destroy();
  process.exit(0);
});

start();
