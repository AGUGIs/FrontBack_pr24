# Windows: «Не защищено» и не работают товары / вход

Ошибка **`NET::ERR_CERT_AUTHORITY_INVALID`** значит: браузер **не доверяет** вашему локальному сертификату.  
Пока это так, **запросы к API блокируются** → нет товаров, регистрации и входа.

## Быстрое решение (5 минут)

### 1. Ветка с исправлениями

```powershell
cd C:\Users\kiril\FrontBack_pr18
git fetch origin
git checkout cursor/https-selfsigned-sw-offline-6dd7
```

### 2. PowerShell **от имени администратора**

ПКМ по «Пуск» → **Терминал (администратор)** или **Windows PowerShell (администратор)**.

```powershell
cd C:\Users\kiril\FrontBack_pr18\server
npm install
npm run cert
```

Должно быть: **`CA добавлен в хранилище Windows (Root).`**

Если написано «Не удалось» — выполните вручную (подставьте свой путь):

```powershell
certutil -addstore -f "Root" "C:\Users\kiril\FrontBack_pr18\server\rootCA.crt"
```

Успех: `CertUtil: -addstore command completed successfully.`

### 3. Полностью закройте Chrome

Закройте **все** окна Chrome (в трее тоже). Откройте снова.

### 4. Запуск (два терминала, админ не обязателен)

**Терминал 1:**

```powershell
cd C:\Users\kiril\FrontBack_pr18\server
npm start
```

**Терминал 2:**

```powershell
cd C:\Users\kiril\FrontBack_pr18\client
npm install
npm start
```

Откройте: **https://localhost:3001**  
Ожидается: замок и **«Защищённое соединение»**, без красного «Не защищено».

### 5. Проверка API

В браузере: https://localhost:3000/api/products — должен быть JSON со списком товаров.

---

## Если всё ещё «Не защищено»

### Импорт CA вручную в Chrome

1. `Win + R` → `certmgr.msc` → Enter  
2. **Доверенные корневые центры сертификации** → **Сертификаты**  
3. ПКМ → **Все задачи** → **Импорт**  
4. Файл: `C:\Users\kiril\FrontBack_pr18\server\rootCA.crt`  
5. Хранилище: **Доверенные корневые центры сертификации**  
6. Перезапустите Chrome

### Удалить старый CA и создать заново

В **админ**-PowerShell:

```powershell
cd C:\Users\kiril\FrontBack_pr18\server
del localhost.pem, localhost-key.pem, rootCA.pem, rootCA-key.pem, rootCA.crt -ErrorAction SilentlyContinue
npm run cert
```

### Файл `client\.env.development` обязателен

Содержимое:

```env
HTTPS=true
SSL_CRT_FILE=../server/localhost.pem
SSL_KEY_FILE=../server/localhost-key.pem
REACT_APP_API_URL=/api
REACT_APP_SERVER_URL=
REACT_APP_PROXY_TARGET=https://localhost:3000
```

Без него клиент может ходить на `http://localhost:3000` — при HTTPS-странице браузер заблокирует запросы.

---

## Временный обход (только для проверки)

На странице предупреждения: **Дополнительные настройки** → **Перейти на сайт localhost (небезопасно)**.

Часть функций всё равно может не работать. Для нормальной работы нужен доверенный CA (шаги выше).

---

## Порт 3000 занят

```powershell
netstat -ano | findstr :3000
taskkill /PID НОМЕР_PID /F
```

Затем снова `npm start` в `server`.
