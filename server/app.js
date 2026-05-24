const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const webpush = require('web-push');
const { connectPostgres } = require('./db/postgres');
const { connectMongo } = require('./db/mongo');
const { ShopUser, formatShopUser } = require('./models/shopUser');
const { ShopProduct, formatShopProduct, seedDefaultProducts } = require('./models/shopProduct');
const {
  initRedis,
  cacheMiddleware,
  saveToCache,
  invalidateUsersCache,
  invalidateProductsCache,
  USERS_CACHE_TTL,
  PRODUCTS_CACHE_TTL,
} = require('./cache/redis');

const app = express();
app.locals.postgresReady = false;
app.locals.mongoReady = false;
const port = 3000;

// ==================== Секреты и конфигурация ====================
const ACCESS_SECRET = 'access_secret_key_online_store';
const REFRESH_SECRET = 'refresh_secret_key_online_store';
const ACCESS_EXPIRES_IN = '15m';
const REFRESH_EXPIRES_IN = '7d';

// ==================== VAPID-ключи для Push-уведомлений (ПР16) ====================
// Ключи генерируются автоматически при первом запуске и сохраняются в vapid-keys.json
const vapidKeysPath = path.join(__dirname, 'vapid-keys.json');

let VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY;

if (fs.existsSync(vapidKeysPath)) {
  const keys = JSON.parse(fs.readFileSync(vapidKeysPath, 'utf-8'));
  VAPID_PUBLIC_KEY = keys.publicKey;
  VAPID_PRIVATE_KEY = keys.privateKey;
} else {
  // Генерируем новые VAPID-ключи автоматически
  const vapidKeys = webpush.generateVAPIDKeys();
  VAPID_PUBLIC_KEY = vapidKeys.publicKey;
  VAPID_PRIVATE_KEY = vapidKeys.privateKey;
  fs.writeFileSync(vapidKeysPath, JSON.stringify(vapidKeys, null, 2));
  console.log('VAPID-ключи сгенерированы и сохранены в vapid-keys.json');
}

webpush.setVapidDetails(
  'mailto:admin@kastryulamarket.ru',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// Хранилище push-подписок (ПР16)
let pushSubscriptions = [];

// ==================== Middleware ====================
app.use(express.json());
app.use(cors({
  origin: function(origin, callback) {
    // Разрешаем все запросы с localhost
    if (!origin || origin.includes('localhost')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Middleware для логирования запросов (ПР4)
app.use((req, res, next) => {
  res.on('finish', () => {
    console.log(`[${new Date().toISOString()}] [${req.method}] ${res.statusCode} ${req.path}`);
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      console.log('Body:', req.body);
    }
  });
  next();
});

// ==================== Данные ====================
// Пользователи и товары магазина теперь хранятся в PostgreSQL
// (модели ShopUser и ShopProduct, таблицы shop_users и shop_products).
// На старте сервера ShopProduct.sync() создаёт таблицу, а seedDefaultProducts()
// при первом запуске заливает 6 базовых кастрюль.

// Хранилище refresh-токенов (ПР9) — оставлено в памяти, как требует методичка
const refreshTokens = new Set();

// ==================== Хелперы: проверка БД ====================

// PostgreSQL хранит клиентов магазина (shop_users)
function requirePostgres(req, res, next) {
  if (!app.locals.postgresReady) {
    return res.status(503).json({
      error: 'PostgreSQL недоступна — клиенты магазина не могут работать. Поднимите БД (docker compose up postgres) и перезапустите сервер.',
    });
  }
  next();
}

// MongoDB хранит карточки товаров (shop_products)
function requireMongo(req, res, next) {
  if (!app.locals.mongoReady) {
    return res.status(503).json({
      error: 'MongoDB недоступна — каталог товаров не может работать. Поднимите БД (docker compose up mongo) и перезапустите сервер.',
    });
  }
  next();
}

// ==================== Swagger (ПР5) ====================
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API Магазина кастрюль «КастрюляМаркет»',
      version: '1.0.0',
      description: 'REST API для управления товарами и пользователями магазина кастрюль с аутентификацией и RBAC',
    },
    servers: [
      { url: `https://localhost:${port}`, description: 'HTTPS-сервер (ПР15)' },
      { url: `http://localhost:${port}`, description: 'HTTP-сервер' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./app.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ==================== Вспомогательные функции ====================

async function findProductOr404(id, res) {
  try {
    const product = await ShopProduct.findById(id);
    if (!product) {
      res.status(404).json({ error: 'Товар не найден' });
      return null;
    }
    return product;
  } catch (err) {
    if (err.name === 'CastError') {
      res.status(404).json({ error: 'Товар не найден' });
      return null;
    }
    throw err;
  }
}

async function findUserOr404(id, res) {
  const user = await ShopUser.findByPk(id);
  if (!user) {
    res.status(404).json({ error: 'Пользователь не найден' });
    return null;
  }
  return user;
}

// ==================== JWT-функции (ПР8, ПР9) ====================

function generateAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRES_IN }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRES_IN }
  );
}

// ==================== Middleware аутентификации (ПР8) ====================

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Необходима авторизация' });
  }
  try {
    const payload = jwt.verify(token, ACCESS_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Невалидный или истекший токен' });
  }
}

// ==================== Middleware ролей (ПР11) ====================

function roleMiddleware(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    next();
  };
}

// ==================== Swagger-схемы ====================

/**
 * @swagger
 * components:
 *   schemas:
 *     Product:
 *       type: object
 *       required:
 *         - title
 *         - category
 *         - description
 *         - price
 *       properties:
 *         id:
 *           type: string
 *           description: Уникальный ID товара
 *         title:
 *           type: string
 *           description: Название товара
 *         category:
 *           type: string
 *           description: Категория товара
 *         description:
 *           type: string
 *           description: Описание товара
 *         price:
 *           type: number
 *           description: Цена товара
 *         stock:
 *           type: integer
 *           description: Количество на складе
 *         rating:
 *           type: number
 *           description: Рейтинг товара
 *         image:
 *           type: string
 *           description: URL изображения товара
 *       example:
 *         id: "abc123"
 *         title: "Ноутбук"
 *         category: "Ноутбуки"
 *         description: "Мощный ноутбук"
 *         price: 54990
 *         stock: 15
 *         rating: 4.5
 *         image: "https://example.com/img.jpg"
 *     User:
 *       type: object
 *       required:
 *         - email
 *         - first_name
 *         - last_name
 *         - password
 *       properties:
 *         id:
 *           type: string
 *         email:
 *           type: string
 *         first_name:
 *           type: string
 *         last_name:
 *           type: string
 *         role:
 *           type: string
 *           enum: [user, seller, admin]
 *       example:
 *         id: "xyz789"
 *         email: "ivan@mail.ru"
 *         first_name: "Иван"
 *         last_name: "Иванов"
 *         role: "user"
 *     AuthTokens:
 *       type: object
 *       properties:
 *         accessToken:
 *           type: string
 *         refreshToken:
 *           type: string
 */

// ==================== AUTH маршруты (ПР7, ПР8, ПР9) ====================

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Регистрация пользователя
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - first_name
 *               - last_name
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: ivan@mail.ru
 *               first_name:
 *                 type: string
 *                 example: Иван
 *               last_name:
 *                 type: string
 *                 example: Иванов
 *               password:
 *                 type: string
 *                 example: qwerty123
 *               role:
 *                 type: string
 *                 enum: [user, seller, admin]
 *                 example: user
 *     responses:
 *       201:
 *         description: Пользователь создан
 *       400:
 *         description: Некорректные данные
 *       409:
 *         description: Email уже зарегистрирован
 */
app.post('/api/auth/register', requirePostgres, async (req, res) => {
  try {
    const { email, first_name, last_name, password, role } = req.body;
    if (!email || !first_name || !last_name || !password) {
      return res.status(400).json({ error: 'Все поля обязательны: email, first_name, last_name, password' });
    }
    const emailNorm = String(email).trim().toLowerCase();
    const exists = await ShopUser.findOne({ where: { email: emailNorm } });
    if (exists) {
      return res.status(409).json({ error: 'Пользователь с таким email уже существует' });
    }
    const password_hash = await bcrypt.hash(password, 10);
    const now = Date.now();
    const user = await ShopUser.create({
      email: emailNorm,
      first_name: String(first_name).trim(),
      last_name: String(last_name).trim(),
      password_hash,
      role: role && ['user', 'seller', 'admin'].includes(role) ? role : 'user',
      blocked: false,
      created_at: now,
      updated_at: now,
    });
    await invalidateUsersCache();
    const u = formatShopUser(user);
    res.status(201).json({
      id: u.id,
      email: u.email,
      first_name: u.first_name,
      last_name: u.last_name,
      role: u.role,
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Вход в систему
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: ivan@mail.ru
 *               password:
 *                 type: string
 *                 example: qwerty123
 *     responses:
 *       200:
 *         description: Успешный вход
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthTokens'
 *       401:
 *         description: Неверные учетные данные
 */
app.post('/api/auth/login', requirePostgres, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }
    const emailNorm = String(email).trim().toLowerCase();
    const user = await ShopUser.findOne({ where: { email: emailNorm } });
    if (!user) {
      return res.status(401).json({ error: 'Неверные учетные данные' });
    }
    if (user.blocked) {
      return res.status(403).json({ error: 'Аккаунт заблокирован' });
    }
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Неверные учетные данные' });
    }
    const tokenUser = { id: user.id, email: user.email, role: user.role };
    const accessToken = generateAccessToken(tokenUser);
    const refreshToken = generateRefreshToken(tokenUser);
    refreshTokens.add(refreshToken);
    res.json({ accessToken, refreshToken });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Обновление пары токенов
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Новая пара токенов
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthTokens'
 *       401:
 *         description: Невалидный refresh-токен
 */
app.post('/api/auth/refresh', requirePostgres, async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'refreshToken обязателен' });
  }
  if (!refreshTokens.has(refreshToken)) {
    return res.status(401).json({ error: 'Невалидный refresh-токен' });
  }
  try {
    const payload = jwt.verify(refreshToken, REFRESH_SECRET);
    const user = await ShopUser.findByPk(payload.sub);
    if (!user || user.blocked) {
      return res.status(401).json({ error: 'Пользователь не найден или заблокирован' });
    }
    refreshTokens.delete(refreshToken);
    const tokenUser = { id: user.id, email: user.email, role: user.role };
    const newAccessToken = generateAccessToken(tokenUser);
    const newRefreshToken = generateRefreshToken(tokenUser);
    refreshTokens.add(newRefreshToken);
    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    return res.status(401).json({ error: 'Невалидный или истекший refresh-токен' });
  }
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Получение информации о текущем пользователе
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Данные текущего пользователя
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Не авторизован
 */
app.get('/api/auth/me', authMiddleware, requirePostgres, async (req, res) => {
  try {
    const user = await ShopUser.findByPk(req.user.sub);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(formatShopUser(user));
  } catch (err) {
    console.error('GET /me error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== PRODUCTS маршруты (ПР2, ПР4, ПР5, ПР8, ПР11) ====================

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Создать новый товар
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - category
 *               - description
 *               - price
 *             properties:
 *               title:
 *                 type: string
 *               category:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               stock:
 *                 type: integer
 *               rating:
 *                 type: number
 *               image:
 *                 type: string
 *     responses:
 *       201:
 *         description: Товар создан
 *       400:
 *         description: Некорректные данные
 *       401:
 *         description: Не авторизован
 *       403:
 *         description: Доступ запрещён
 */
app.post('/api/products', authMiddleware, roleMiddleware(['seller', 'admin']), requireMongo, async (req, res) => {
  try {
    const { title, category, description, price, stock, rating, image } = req.body;
    if (!title || !category || !description || price === undefined) {
      return res.status(400).json({ error: 'Поля title, category, description, price обязательны' });
    }
    const now = Date.now();
    const created = await ShopProduct.create({
      title: String(title).trim(),
      category: String(category).trim(),
      description: String(description).trim(),
      price: Number(price),
      stock: stock !== undefined ? Number(stock) : 0,
      rating: rating !== undefined ? Number(rating) : 0,
      image: image || 'https://via.placeholder.com/300x200?text=Product',
      created_at: now,
      updated_at: now,
    });
    await invalidateProductsCache();
    res.status(201).json(formatShopProduct(created));
  } catch (err) {
    console.error('POST /products error:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Получить список всех товаров
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Список товаров
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Product'
 */
app.get(
  '/api/products',
  requireMongo,
  cacheMiddleware(() => 'products:all', PRODUCTS_CACHE_TTL),
  async (req, res) => {
    try {
      const rows = await ShopProduct.find().sort({ created_at: 1 });
      const data = rows.map(formatShopProduct);
      if (req.cacheKey) {
        await saveToCache(req.cacheKey, data, req.cacheTTL);
        return res.json({ source: 'server', data });
      }
      res.json(data);
    } catch (err) {
      console.error('GET /products error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/products/{id}:
 *   get:
 *     summary: Получить товар по ID
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID товара
 *     responses:
 *       200:
 *         description: Данные товара
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Product'
 *       401:
 *         description: Не авторизован
 *       404:
 *         description: Товар не найден
 */
app.get(
  '/api/products/:id',
  authMiddleware,
  roleMiddleware(['user', 'seller', 'admin']),
  requireMongo,
  cacheMiddleware((req) => `products:${req.params.id}`, PRODUCTS_CACHE_TTL),
  async (req, res) => {
    try {
      const product = await findProductOr404(req.params.id, res);
      if (!product) return;
      const data = formatShopProduct(product);
      if (req.cacheKey) {
        await saveToCache(req.cacheKey, data, req.cacheTTL);
        return res.json({ source: 'server', data });
      }
      res.json(data);
    } catch (err) {
      console.error('GET /products/:id error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/products/{id}:
 *   put:
 *     summary: Обновить товар по ID
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID товара
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               category:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               stock:
 *                 type: integer
 *               rating:
 *                 type: number
 *               image:
 *                 type: string
 *     responses:
 *       200:
 *         description: Обновлённый товар
 *       401:
 *         description: Не авторизован
 *       403:
 *         description: Доступ запрещён
 *       404:
 *         description: Товар не найден
 */
app.put('/api/products/:id', authMiddleware, roleMiddleware(['seller', 'admin']), requireMongo, async (req, res) => {
  try {
    const product = await findProductOr404(req.params.id, res);
    if (!product) return;
    const { title, category, description, price, stock, rating, image } = req.body;
    if (title !== undefined) product.title = String(title).trim();
    if (category !== undefined) product.category = String(category).trim();
    if (description !== undefined) product.description = String(description).trim();
    if (price !== undefined) product.price = Number(price);
    if (stock !== undefined) product.stock = Number(stock);
    if (rating !== undefined) product.rating = Number(rating);
    if (image !== undefined) product.image = image;
    product.updated_at = Date.now();
    await product.save();
    await invalidateProductsCache(product._id.toString());
    res.json(formatShopProduct(product));
  } catch (err) {
    console.error('PUT /products/:id error:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/products/{id}:
 *   delete:
 *     summary: Удалить товар по ID
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID товара
 *     responses:
 *       204:
 *         description: Товар удалён
 *       401:
 *         description: Не авторизован
 *       403:
 *         description: Доступ запрещён
 *       404:
 *         description: Товар не найден
 */
app.delete('/api/products/:id', authMiddleware, roleMiddleware(['admin']), requireMongo, async (req, res) => {
  try {
    const deleted = await ShopProduct.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Товар не найден' });
    await invalidateProductsCache(req.params.id);
    res.status(204).send();
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(404).json({ error: 'Товар не найден' });
    }
    console.error('DELETE /products/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== USERS маршруты (ПР11) ====================

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Получить список пользователей (только админ)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список пользователей
 *       403:
 *         description: Доступ запрещён
 */
app.get(
  '/api/users',
  authMiddleware,
  roleMiddleware(['admin']),
  requirePostgres,
  cacheMiddleware(() => 'users:all', USERS_CACHE_TTL),
  async (req, res) => {
    try {
      const rows = await ShopUser.findAll({ order: [['id', 'ASC']] });
      const data = rows.map(formatShopUser);
      if (req.cacheKey) {
        await saveToCache(req.cacheKey, data, req.cacheTTL);
        return res.json({ source: 'server', data });
      }
      res.json(data);
    } catch (err) {
      console.error('GET /users error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Получить пользователя по ID (только админ)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Данные пользователя
 *       404:
 *         description: Пользователь не найден
 */
app.get(
  '/api/users/:id',
  authMiddleware,
  roleMiddleware(['admin']),
  requirePostgres,
  cacheMiddleware((req) => `users:${req.params.id}`, USERS_CACHE_TTL),
  async (req, res) => {
    try {
      const user = await findUserOr404(req.params.id, res);
      if (!user) return;
      const data = formatShopUser(user);
      if (req.cacheKey) {
        await saveToCache(req.cacheKey, data, req.cacheTTL);
        return res.json({ source: 'server', data });
      }
      res.json(data);
    } catch (err) {
      console.error('GET /users/:id error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: Обновить информацию пользователя (только админ)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [user, seller, admin]
 *     responses:
 *       200:
 *         description: Обновлённый пользователь
 */
app.put('/api/users/:id', authMiddleware, roleMiddleware(['admin']), requirePostgres, async (req, res) => {
  try {
    const user = await findUserOr404(req.params.id, res);
    if (!user) return;
    const { first_name, last_name, role } = req.body;
    if (first_name !== undefined) user.first_name = String(first_name).trim();
    if (last_name !== undefined) user.last_name = String(last_name).trim();
    if (role !== undefined && ['user', 'seller', 'admin'].includes(role)) user.role = role;
    user.updated_at = Date.now();
    await user.save();
    await invalidateUsersCache(user.id);
    res.json(formatShopUser(user));
  } catch (err) {
    console.error('PUT /users/:id error:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Заблокировать пользователя (только админ)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Пользователь заблокирован
 */
app.delete('/api/users/:id', authMiddleware, roleMiddleware(['admin']), requirePostgres, async (req, res) => {
  try {
    const user = await findUserOr404(req.params.id, res);
    if (!user) return;
    user.blocked = !user.blocked;
    user.updated_at = Date.now();
    await user.save();
    await invalidateUsersCache(user.id);
    res.json(formatShopUser(user));
  } catch (err) {
    console.error('DELETE /users/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/health/databases:
 *   get:
 *     summary: Статус подключений к БД и Redis (ПР19–21)
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Статус сервисов
 */
app.get('/api/health/databases', (req, res) => {
  const { isRedisReady } = require('./cache/redis');
  res.json({
    postgres: app.locals.postgresReady,
    mongo: app.locals.mongoReady,
    redis: isRedisReady(),
  });
});

// ==================== Push-уведомления (ПР16) ====================

/**
 * @swagger
 * /api/vapid-public-key:
 *   get:
 *     summary: Получить публичный VAPID-ключ
 *     tags: [Push]
 *     responses:
 *       200:
 *         description: Публичный ключ
 */
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

/**
 * @swagger
 * /api/subscribe:
 *   post:
 *     summary: Подписаться на push-уведомления
 *     tags: [Push]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Подписка сохранена
 */
app.post('/api/subscribe', (req, res) => {
  const subscription = req.body;
  const exists = pushSubscriptions.some(s => s.endpoint === subscription.endpoint);
  if (!exists) {
    pushSubscriptions.push(subscription);
  }
  res.status(201).json({ message: 'Подписка сохранена' });
});

/**
 * @swagger
 * /api/unsubscribe:
 *   post:
 *     summary: Отписаться от push-уведомлений
 *     tags: [Push]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               endpoint:
 *                 type: string
 *     responses:
 *       200:
 *         description: Подписка удалена
 */
app.post('/api/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  pushSubscriptions = pushSubscriptions.filter(s => s.endpoint !== endpoint);
  res.status(200).json({ message: 'Подписка удалена' });
});

// ==================== Обработчики ошибок ====================

app.use((req, res) => {
  res.status(404).json({ error: 'Маршрут не найден' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// ==================== Запуск сервера (ПР15 + ПР16) ====================

const certPath = path.join(__dirname, 'localhost.pem');
const keyPath = path.join(__dirname, 'localhost-key.pem');

let server;
const useHttps = process.env.HTTP_ONLY !== 'true'
  && fs.existsSync(certPath)
  && fs.existsSync(keyPath);
if (useHttps) {
  const httpsOptions = {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  };
  server = https.createServer(httpsOptions, app);
} else {
  server = http.createServer(app);
}

// ==================== Socket.IO (ПР16) + Напоминания (ПР17) ====================

// Хранилище активных напоминаний: id -> { timeoutId, text, reminderTime } (ПР17)
const reminders = new Map();

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

io.on('connection', (socket) => {
  console.log('WebSocket: клиент подключён:', socket.id);

  // Обработка события добавления нового товара (ПР16)
  socket.on('newProduct', (product) => {
    io.emit('productAdded', product);

    const payload = JSON.stringify({
      title: 'Новый товар в КастрюляМаркет!',
      body: product.title || 'Добавлен новый товар',
    });

    pushSubscriptions.forEach((sub) => {
      webpush.sendNotification(sub, payload).catch((err) => {
        console.error('Push error:', err.statusCode);
        if (err.statusCode === 410 || err.statusCode === 404) {
          pushSubscriptions = pushSubscriptions.filter(s => s.endpoint !== sub.endpoint);
        }
      });
    });
  });

  // Обработка напоминания с отложенной отправкой push (ПР17)
  socket.on('newReminder', (reminder) => {
    const { id, text, reminderTime } = reminder;
    const delay = reminderTime - Date.now();
    if (delay <= 0) return;

    console.log(`Напоминание запланировано: "${text}" через ${Math.round(delay / 1000)} сек.`);

    const timeoutId = setTimeout(() => {
      const payload = JSON.stringify({
        title: 'Напоминание',
        body: text,
        reminderId: id,
      });

      pushSubscriptions.forEach((sub) => {
        webpush.sendNotification(sub, payload).catch((err) => {
          console.error('Push error:', err.statusCode);
          if (err.statusCode === 410 || err.statusCode === 404) {
            pushSubscriptions = pushSubscriptions.filter(s => s.endpoint !== sub.endpoint);
          }
        });
      });

      // Рассылаем WebSocket-событие
      io.emit('reminderFired', { id, text });

      reminders.delete(id);
    }, delay);

    reminders.set(id, { timeoutId, text, reminderTime });
  });

  socket.on('disconnect', () => {
    console.log('WebSocket: клиент отключён:', socket.id);
  });
});

// Эндпоинт откладывания напоминания на 5 минут (ПР17)
app.post('/api/snooze', (req, res) => {
  const reminderId = parseInt(req.query.reminderId, 10);

  if (!reminderId || !reminders.has(reminderId)) {
    return res.status(404).json({ error: 'Напоминание не найдено' });
  }

  const reminder = reminders.get(reminderId);
  clearTimeout(reminder.timeoutId);

  const newDelay = 5 * 60 * 1000; // 5 минут

  const newTimeoutId = setTimeout(() => {
    const payload = JSON.stringify({
      title: 'Отложенное напоминание',
      body: reminder.text,
      reminderId: reminderId,
    });

    pushSubscriptions.forEach((sub) => {
      webpush.sendNotification(sub, payload).catch((err) => {
        console.error('Push error:', err.statusCode);
        if (err.statusCode === 410 || err.statusCode === 404) {
          pushSubscriptions = pushSubscriptions.filter(s => s.endpoint !== sub.endpoint);
        }
      });
    });

    reminders.delete(reminderId);
  }, newDelay);

  reminders.set(reminderId, {
    timeoutId: newTimeoutId,
    text: reminder.text,
    reminderTime: Date.now() + newDelay,
  });

  console.log(`Напоминание ${reminderId} отложено на 5 минут`);
  res.status(200).json({ message: 'Напоминание отложено на 5 минут' });
});

// Запуск
async function bootstrap() {
  if (process.env.PG_ENABLED !== 'false') {
    try {
      await connectPostgres();
      await ShopUser.sync();
      app.locals.postgresReady = true;
      console.log('PostgreSQL: подключена, таблица shop_users готова');
    } catch (err) {
      console.warn('PostgreSQL: недоступна —', err.message);
    }
  }

  if (process.env.MONGO_ENABLED !== 'false') {
    try {
      await connectMongo();
      await ShopProduct.init();
      const seeded = await seedDefaultProducts();
      app.locals.mongoReady = true;
      console.log('MongoDB: подключена, коллекция shop_products готова');
      if (seeded > 0) console.log(`MongoDB: засеяно ${seeded} стартовых товаров в shop_products`);
    } catch (err) {
      console.warn('MongoDB: недоступна —', err.message);
    }
  }

  await initRedis();

  server.listen(port, () => {
    const protocol = useHttps ? 'https' : 'http';
    console.log(`${protocol.toUpperCase()}-сервер запущен на ${protocol}://localhost:${port}`);
    console.log(`Swagger UI: ${protocol}://localhost:${port}/api-docs`);
    console.log(`WebSocket: включён на порту ${port}`);
    if (app.locals.postgresReady) console.log('ПР19: клиенты магазина → PostgreSQL (shop_users)');
    if (app.locals.mongoReady) console.log('ПР20: каталог товаров → MongoDB (shop_products)');
  });
}

bootstrap().catch((err) => {
  console.error('Ошибка запуска:', err);
  process.exit(1);
});
