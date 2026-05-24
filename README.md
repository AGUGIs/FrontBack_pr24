# КастрюляМаркет — Контрольная работа №4

Краткое описание того, что делает каждая практика и как она реализована в проекте.

---

## ПР19 — PostgreSQL и Sequelize

**Что это.** PostgreSQL — реляционная СУБД с жёсткой схемой и SQL. Sequelize — ORM, который позволяет описывать модели на JavaScript и работать с базой объектами, без ручного SQL.

**Как в проекте.** В Postgres хранятся клиенты магазина — все, кто регистрируется через форму на сайте. Подключение в `server/db/postgres.js`, модель в `server/models/shopUser.js` (таблица `shop_users` с полями `email`, `first_name`, `last_name`, `password_hash`, `role`, `blocked`, `created_at`, `updated_at`). Маршруты `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/me` и `/api/users/*` в `server/app.js` работают через `ShopUser.findOne / findByPk / create / save / destroy`. На старте сервера `ShopUser.sync()` сам создаёт таблицу, если её нет.

---

## ПР20 — MongoDB и Mongoose

**Что это.** MongoDB — документоориентированная NoSQL-СУБД, хранит данные в коллекциях в формате BSON. Mongoose — ODM, аналог Sequelize для Mongo: описываешь схему документа, получаешь типобезопасные методы и валидацию.

**Как в проекте.** В Mongo лежат карточки товаров каталога. Подключение в `server/db/mongo.js`, схема в `server/models/shopProduct.js` (коллекция `shop_products` с полями `title`, `category`, `description`, `price`, `stock`, `rating`, `image`, `created_at`, `updated_at`, плюс индексы по `category` и `created_at`). Маршруты `/api/products/*` обращаются к ней через `ShopProduct.find / findById / findByIdAndDelete / save`. При первом запуске функция `seedDefaultProducts()` заливает 6 стартовых кастрюль, при повторных запусках сидинг пропускается.

---

## ПР21 — Кэширование Redis

**Что это.** Redis — быстрое in-memory key-value хранилище. Используется как кэш частых GET-запросов: первый запрос идёт в БД, ответ кладётся в Redis на заданный TTL, последующие запросы за этот TTL отдаются прямо из памяти.

**Как в проекте.** Модуль `server/cache/redis.js` содержит `cacheMiddleware(keyBuilder, ttl)`, `saveToCache`, `invalidateUsersCache`, `invalidateProductsCache`. Кэшируются 4 ручки: `GET /api/users` и `/api/users/:id` (1 минута), `GET /api/products` и `/api/products/:id` (10 минут). При попадании в кэш ответ имеет вид `{source: "cache", data: ...}`, иначе `{source: "server", data: ...}`. Кэш сбрасывается при `POST /api/auth/register`, `PUT/DELETE /api/users/:id`, `POST/PUT/DELETE /api/products/:id`. Если Redis недоступен — приложение работает без кэша.

---

## ПР22 — Балансировка нагрузки (Nginx и HAProxy)

**Что это.** Балансировщик распределяет HTTP-трафик между несколькими экземплярами backend, обеспечивая отказоустойчивость и горизонтальное масштабирование. Round Robin — самый простой алгоритм: запросы по очереди уходят на разные серверы.

**Как в проекте.** Три одинаковых демо-сервера в `docker/backend/server.js` отдают своё имя (`backend-1`, `backend-2`, `backend-3`) на `GET /` и поддерживают `GET /health`. Конфиг Nginx (`docker/nginx/nginx.conf`) использует Round Robin с `max_fails=2` и `fail_timeout=30s`, третий сервер помечен `backup` — включается только при падении основных. Альтернативно HAProxy (`docker/haproxy/haproxy.cfg`) делает то же самое с активным health-check через `option httpchk GET /health`. Nginx-LB слушает порт **8080**, HAProxy-LB — **8081**.

---

## ПР23 — Docker Compose

**Что это.** Docker Compose описывает многоконтейнерное приложение в одном `docker-compose.yml` и поднимает весь стек одной командой. Удобно для разработки и демо: не надо ставить вручную Postgres, Mongo, Redis, Nginx.

**Как в проекте.** Файл `docker-compose.yml` в корне поднимает 9 контейнеров: `api` (порт 3000), `postgres` (5433 → 5432 внутри сети, чтобы не конфликтовать с локальным Postgres), `mongo` (27017), `redis` (6379), `backend1/2/3`, `nginx-lb` (8080), `haproxy-lb` (8081). Две сети (`app-network` и `lb-network`), тома `postgres_data` и `mongo_data` для персистентности, healthcheck'и + `depends_on: condition: service_healthy` гарантируют, что API стартует только после готовности БД. Dockerfile API лежит в `server/Dockerfile` (`HTTP_ONLY=true` чтобы не возиться с сертификатами в контейнере).

---

## ПР24 — Контрольная работа №4

Итоговая сдача объединяет ПР19–23: работающий API магазина с аутентификацией и RBAC, клиенты в PostgreSQL, товары в MongoDB, Redis-кэш на 4 GET-маршрутах, балансировка Nginx и HAProxy, всё запускается через `docker compose up --build -d`. Smoke-тест `npm run test:api` — 11/11 пройдено. PWA, WebSocket, Push и напоминания из ПР13–17 продолжают работать поверх новой архитектуры.

---

## Запуск

```bash
docker compose up --build -d        # весь бэкенд одной командой
cd client && npm install && npm start   # фронт нативно, hot reload
```

Открыть: `http://localhost:3001`.

Полезные команды:

```bash
docker compose ps                   # статус контейнеров
docker compose logs api --tail=50   # логи API
docker compose restart api          # перезапуск после правок в server/
docker compose down                 # остановить и удалить
```

---

## Просмотр баз данных

**pgAdmin 4** для PostgreSQL:
- Host `localhost`, Port **5433**, User `postgres`, Password `postgres`, Database `kastryula_market`.
- Таблица `shop_users`.

**MongoDB Compass** для Mongo:
- Connection string `mongodb://localhost:27017`.
- БД `kastryula_market`, коллекция `shop_products`.

**Postman** — импортируй `postman/KastryulaMarket.postman_collection.json`, дальше всё по шагам в `postman/README.md`.
