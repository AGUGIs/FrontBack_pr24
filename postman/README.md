# Postman-коллекция для КастрюляМаркет

Готовый набор запросов для проверки всех трёх БД и эндпоинтов балансировки.
Импортируется одним кликом, токены сохраняются автоматически.

## Импорт в Postman

1. Открой Postman.
2. Сверху слева — кнопка **Import**.
3. Перетащи файл `KastryulaMarket.postman_collection.json` или выбери его через диалог.
4. Готово — слева в дереве появится коллекция **«КастрюляМаркет API»**.

## Переменные коллекции

Все запросы используют переменные. Менять их не нужно, если бэкенд поднят
на стандартных портах — но при желании можно подкрутить в правом верхнем
углу Postman → иконка глаза рядом с названием коллекции → **Edit**.

| Переменная | Значение по умолчанию | Кто заполняет |
|---|---|---|
| `baseUrl` | `http://localhost:3000` | вручную (если порт другой) |
| `nginxLbUrl` | `http://localhost:8080` | вручную |
| `haproxyLbUrl` | `http://localhost:8081` | вручную |
| `accessToken` | — | автоматически после **Login** |
| `refreshToken` | — | автоматически после **Login** / **Refresh** |
| `userId` | — | автоматически после **Register** |
| `productId` | — | автоматически после **GET /api/products** или **POST /api/products** |

## Порядок прохождения (highly recommended)

Коллекция разбита на 7 папок. Иди по ним сверху вниз:

### 0. Health

- **GET /api/health/databases** → должно ответить `{postgres:true, mongo:true, redis:true}`.
  Если что-то `false` — соответствующая БД не поднята, запусти `docker compose up -d` или проверь локальный PostgreSQL.

### 1. Auth — PostgreSQL (`shop_users`)

- **Register** — создаёт нового клиента. Поменяй email на свежий или этот:
  ```
  test@example.com / qwerty123 / role admin
  ```
- **Login** — после успешного логина автоматически сохраняет токены в переменные коллекции. После этого все защищённые запросы работают сами по себе.
- **Refresh** — обновление пары токенов.
- **GET /api/auth/me** — текущий пользователь по JWT.

> После Register загляни в pgAdmin → `kastryula_market` → `shop_users` → Refresh — должна появиться запись.

### 2. Users — PostgreSQL (admin only)

Все эти запросы требуют роль `admin` (мы залогинились админом в шаге 1).

- **GET /api/users** — список клиентов. Первый вызов — `source: "server"`. Через 60 сек кэш протухнет, но если повторишь сразу — будет `source: "cache"`.
- **GET /api/users/:id** — один клиент.
- **PUT /api/users/:id** — изменить имя/роль.
- **DELETE /api/users/:id** — toggle block (заблокировать/разблокировать).

### 3. Products — MongoDB (`shop_products`)

- **GET /api/products (первый запрос)** — публичный, без токена. Возвращает 6 стартовых кастрюль, `source: "server"`. Автоматически сохраняет `productId` первого товара.
- **GET /api/products (второй запрос)** — `source: "cache"`.
- **GET /api/products/:id** — с авторизацией.
- **POST /api/products** — создать товар (роль seller/admin).
- **PUT /api/products/:id** — обновить.
- **DELETE /api/products/:id** — удалить (только admin).

> После создания товара открой MongoDB Compass → `kastryula_market` → `shop_products` → новый документ виден сразу.

### 4. Redis cache demo

Прогони 4 запроса по порядку — увидишь, как кэш сбрасывается при создании:

1. GET /api/products → `source: server` (первый раз).
2. GET /api/products → `source: cache`.
3. POST /api/products → создание сбрасывает `products:all`.
4. GET /api/products → опять `source: server`, потому что кэш пустой.

### 5. Load Balancing (ПР22)

- **Nginx LB** (порт 8080) — Round Robin между backend-1 и backend-2. Запусти 4–5 раз: ответы должны чередоваться.
- **HAProxy LB** (порт 8081) — то же самое, но через HAProxy.

Чтобы увидеть переключение на резервный backend-3: останови backend-1 и backend-2:

```bash
docker compose stop backend1 backend2
```

И снова дёрни **Nginx LB** — все ответы будут `{"server": "backend-3"}`.

### 6. Negative / RBAC tests

Проверки, что защита работает:

- GET /api/users без `Authorization` → **401**.
- GET /api/products/:id с битым токеном → **401**.
- GET /api/products/000000000000000000000000 (несуществующий ObjectId) → **404**.

## Что делать, если запрос падает

| Симптом | Причина |
|---|---|
| `ECONNREFUSED localhost:3000` | API не запущен. `docker compose up -d` или `npm start` в `server/`. |
| `{postgres: false, ...}` в /health | Соответствующая БД не поднята. Проверь `docker compose ps`. |
| 401 на защищённой ручке | Истёк accessToken (15 мин). Запусти **Refresh** или **Login** заново. |
| 401 на /auth/login | Неправильный email/пароль. Email уникален — если уже регистрировал такой, либо логинься, либо измени email в Register. |
| 403 на /api/users или /api/products POST/DELETE | Залогинен не админом. В Register укажи `"role": "admin"`. |
| Все продукты с source: server, никогда cache | Redis не подключён. `docker compose up -d redis`. |

## Альтернатива — Postman через PowerShell (curl-аналог)

Если Postman нет под рукой, всё то же самое работает через `Invoke-RestMethod`:

```powershell
# Register
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/register `
  -ContentType "application/json" `
  -Body '{"email":"test@example.com","first_name":"Тест","last_name":"Тестов","password":"qwerty123","role":"admin"}'

# Login + сохранить токен в переменную
$tokens = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login `
  -ContentType "application/json" `
  -Body '{"email":"test@example.com","password":"qwerty123"}'
$token = $tokens.accessToken

# Защищённый запрос
Invoke-RestMethod -Uri http://localhost:3000/api/users `
  -Headers @{ Authorization = "Bearer $token" }

# Создать товар
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/products `
  -ContentType "application/json" `
  -Headers @{ Authorization = "Bearer $token" } `
  -Body '{"title":"Сковорода","category":"Сковороды","description":"Тест","price":2990,"stock":10,"rating":4.5}'
```
