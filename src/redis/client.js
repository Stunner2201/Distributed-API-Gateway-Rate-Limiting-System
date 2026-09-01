/**
 * Redis client module
 * Manages Redis connection with proper error handling and reconnection logic
 */

const redis = require('redis');
const config = require('../config');

let client = null;
let isConnected = false;

/**
 * Initialize Redis client
 * @returns {Promise<redis.RedisClient>}
 */
async function initializeClient() {
  if (client && isConnected) {
    return client;
  }

  try {
    client = redis.createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port,
      },
      password: config.redis.password,
    });

    client.on('error', (err) => {
      console.error('Redis Client Error:', err);
      isConnected = false;
    });

    client.on('connect', () => {
      console.log('Redis client connecting...');
    });

    client.on('ready', () => {
      console.log('Redis client ready');
      isConnected = true;
    });

    client.on('end', () => {
      console.log('Redis client connection ended');
      isConnected = false;
    });

    await client.connect();
    return client;
  } catch (error) {
    console.error('Failed to initialize Redis client:', error);
    isConnected = false;
    throw error;
  }
}

/**
 * Get Redis client instance
 * @returns {Promise<redis.RedisClient|null>}
 */
async function getClient() {
  try {
    if (!client || !isConnected) {
      await initializeClient();
    }
    return client;
  } catch (error) {
    console.error('Redis client unavailable:', error.message);
    return null;
  }
}

/**
 * Check if Redis is available
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
  try {
    const redisClient = await getClient();
    if (!redisClient) return false;
    await redisClient.ping();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Close Redis connection gracefully
 */
async function close() {
  if (client) {
    try {
      await client.quit();
      isConnected = false;
    } catch (error) {
      console.error('Error closing Redis connection:', error);
    }
  }
}

module.exports = {
  getClient,
  isAvailable,
  close,
  initializeClient,
};
