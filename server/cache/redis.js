const { createClient } = require('redis');

const USERS_CACHE_TTL = 60;
const PRODUCTS_CACHE_TTL = 600;

let redisClient = null;
let redisReady = false;

async function initRedis() {
  if (process.env.REDIS_ENABLED === 'false') {
    console.log('Redis: отключён (REDIS_ENABLED=false)');
    return false;
  }

  const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

  redisClient = createClient({ url });
  redisClient.on('error', (err) => {
    console.error('Redis error:', err.message);
    redisReady = false;
  });

  try {
    await redisClient.connect();
    redisReady = true;
    console.log('Redis: подключён');
    return true;
  } catch (err) {
    console.warn('Redis: недоступен, кэширование отключено —', err.message);
    redisReady = false;
    return false;
  }
}

function isRedisReady() {
  return redisReady && redisClient?.isOpen;
}

function cacheMiddleware(keyBuilder, ttl) {
  return async (req, res, next) => {
    if (!isRedisReady()) return next();

    try {
      const key = keyBuilder(req);
      const cachedData = await redisClient.get(key);
      if (cachedData) {
        return res.json({
          source: 'cache',
          data: JSON.parse(cachedData),
        });
      }
      req.cacheKey = key;
      req.cacheTTL = ttl;
      next();
    } catch (err) {
      console.error('Cache read error:', err.message);
      next();
    }
  };
}

async function saveToCache(key, data, ttl) {
  if (!isRedisReady() || !key) return;
  try {
    await redisClient.set(key, JSON.stringify(data), { EX: ttl });
  } catch (err) {
    console.error('Cache save error:', err.message);
  }
}

async function invalidateUsersCache(userId = null) {
  if (!isRedisReady()) return;
  try {
    await redisClient.del('users:all');
    if (userId) await redisClient.del(`users:${userId}`);
  } catch (err) {
    console.error('Users cache invalidate error:', err.message);
  }
}

async function invalidateProductsCache(productId = null) {
  if (!isRedisReady()) return;
  try {
    await redisClient.del('products:all');
    if (productId) await redisClient.del(`products:${productId}`);
  } catch (err) {
    console.error('Products cache invalidate error:', err.message);
  }
}

module.exports = {
  initRedis,
  isRedisReady,
  cacheMiddleware,
  saveToCache,
  invalidateUsersCache,
  invalidateProductsCache,
  USERS_CACHE_TTL,
  PRODUCTS_CACHE_TTL,
};
