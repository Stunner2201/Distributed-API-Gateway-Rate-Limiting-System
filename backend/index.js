/**
 * Example Backend Service
 * 
 * Simple backend service for testing the API Gateway
 */

const express = require('express');

const app = express();
const PORT = 3001;

app.use(express.json());

// Sample endpoints
app.get('/api/users', (req, res) => {
  res.json({
    message: 'Users endpoint',
    data: [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ],
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/orders', (req, res) => {
  res.json({
    message: 'Orders endpoint',
    data: [
      { id: 1, product: 'Widget', quantity: 5 },
      { id: 2, product: 'Gadget', quantity: 3 },
    ],
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/products', (req, res) => {
  res.json({
    message: 'Products endpoint',
    data: [
      { id: 1, name: 'Widget', price: 19.99 },
      { id: 2, name: 'Gadget', price: 29.99 },
    ],
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/orders', (req, res) => {
  res.json({
    message: 'Order created',
    data: {
      id: Date.now(),
      ...req.body,
    },
    timestamp: new Date().toISOString(),
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'backend' });
});

app.listen(PORT, () => {
  console.log(`Backend service listening on port ${PORT}`);
});

