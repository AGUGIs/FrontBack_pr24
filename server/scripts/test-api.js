/**
 * Smoke-тест API (ПР19–24).
 *
 * Архитектура:
 *  - PostgreSQL → клиенты магазина (shop_users): /api/auth/*, /api/users/*
 *  - MongoDB    → каталог товаров (shop_products): /api/products/*
 *  - Redis      → кэш списка товаров и пользователей
 *
 * Запуск: node scripts/test-api.js [baseUrl]
 * Пример: node scripts/test-api.js http://localhost:3000
 */

const http = require('http');
const https = require('https');

const BASE = process.argv[2] || 'http://localhost:3000';

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const lib = url.protocol === 'https:' ? https : http;
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers,
      },
      rejectUnauthorized: false,
    };

    const req = lib.request(opts, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let parsed = raw;
        try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = raw; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  const results = [];
  const ok = (name, cond) => {
    results.push({ name, pass: !!cond });
    console.log(cond ? `✓ ${name}` : `✗ ${name}`);
  };

  console.log(`Тестирование: ${BASE}\n`);

  // === Health ===
  const health = await request('GET', '/api/health/databases');
  ok('GET /api/health/databases', health.status === 200);

  // === Auth (PostgreSQL: shop_users) ===
  const email = `test_${Date.now()}@example.com`;
  const reg = await request('POST', '/api/auth/register', {
    email,
    first_name: 'Тест',
    last_name: 'Тестов',
    password: 'testpass123',
    role: 'admin',
  });
  ok('POST /api/auth/register → shop_users', reg.status === 201);

  const login = await request('POST', '/api/auth/login', {
    email,
    password: 'testpass123',
  });
  ok('POST /api/auth/login', login.status === 200 && login.body.accessToken);

  const token = login.body?.accessToken;
  const auth = { Authorization: `Bearer ${token}` };

  const me = await request('GET', '/api/auth/me', null, auth);
  ok('GET /api/auth/me', me.status === 200 && me.body.email === email);

  // === Users (PostgreSQL: shop_users, admin only) ===
  const users1 = await request('GET', '/api/users', null, auth);
  const usersList = users1.body?.data ?? users1.body;
  ok('GET /api/users (admin)', users1.status === 200 && Array.isArray(usersList) && usersList.length > 0);

  // === Products (MongoDB: shop_products) ===
  const products1 = await request('GET', '/api/products');
  const productsList = products1.body?.data ?? products1.body;
  ok('GET /api/products → shop_products', products1.status === 200 && Array.isArray(productsList) && productsList.length > 0);

  const newProduct = {
    title: 'Тестовая кастрюля',
    category: 'Кастрюли',
    description: 'Создана автотестом',
    price: 1234,
    stock: 5,
    rating: 4.2,
  };
  const create = await request('POST', '/api/products', newProduct, auth);
  ok('POST /api/products (admin)', create.status === 201 && create.body.id);

  const pid = create.body?.id;
  if (pid) {
    const getOne = await request('GET', `/api/products/${pid}`, null, auth);
    const dataOne = getOne.body?.data ?? getOne.body;
    ok('GET /api/products/:id', getOne.status === 200 && dataOne.title === 'Тестовая кастрюля');

    const upd = await request('PUT', `/api/products/${pid}`, { price: 1500 }, auth);
    ok('PUT /api/products/:id', upd.status === 200 && Number(upd.body.price) === 1500);

    const del = await request('DELETE', `/api/products/${pid}`, null, auth);
    ok('DELETE /api/products/:id', del.status === 204);
  }

  // === Redis cache ===
  const cache1 = await request('GET', '/api/products');
  const cache2 = await request('GET', '/api/products');
  const wrappers = cache1.body && cache2.body && 'source' in cache1.body && 'source' in cache2.body;
  ok('Redis cache wrapper (source field)', wrappers);

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\nИтого: ${results.length - failed}/${results.length} пройдено`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
