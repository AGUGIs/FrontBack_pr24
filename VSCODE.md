# Запуск проекта в Visual Studio Code

Инструкция для Windows, macOS и Linux. Репозиторий: **https://github.com/AGUGIs/FrontBack_pr18**

## 1. Что установить

| Программа | Зачем |
|-----------|--------|
| [Git](https://git-scm.com/downloads) | Клонирование с GitHub |
| [Node.js](https://nodejs.org/) (LTS, v18+) | Сервер и клиент |
| [VS Code](https://code.visualstudio.com/) | Редактор |

В VS Code по желанию: расширения **ES7+ React/Redux snippets**, **ESLint**, **Prettier**.

## 2. Скачать проект с GitHub

### Вариант А — через VS Code (проще)

1. Откройте VS Code.
2. `Ctrl+Shift+P` (macOS: `Cmd+Shift+P`) → **Git: Clone**.
3. Вставьте URL:
   ```
   https://github.com/AGUGIs/FrontBack_pr18.git
   ```
4. Выберите папку, куда положить проект (например `C:\Projects\FrontBack_pr18`).
5. Нажмите **Open** / **Открыть**, когда VS Code предложит открыть папку.

### Вариант Б — через терминал

```bash
git clone https://github.com/AGUGIs/FrontBack_pr18.git
cd FrontBack_pr18
code .
```

Команда `code .` откроет папку в VS Code (нужна команда **Shell Command: Install 'code' command in PATH** в VS Code).

## 3. Установить зависимости

В VS Code: **Terminal → New Terminal** (`` Ctrl+` ``).

**Сервер:**

```bash
cd server
npm install
```

**Клиент** (новый терминал или после `cd ..`):

```bash
cd client
npm install
```

## 4. HTTPS-сертификаты (один раз)

В терминале:

```bash
cd server
npm run cert
```

| ОС | Как запускать |
|----|----------------|
| **Windows** | Терминал VS Code **от имени администратора** (ПКМ по иконке → Запуск от имени администратора → `code .`) |
| **Linux / macOS** | Обычный терминал; при запросе введите пароль `sudo` |

Проверка:

```bash
npm run verify-https
```

Должно быть `OK` для портов 3000 и 3001.

Если браузер пишет «Небезопасно» — импортируйте `server/rootCA.pem` в доверенные корневые CA (Chrome: Настройки → Безопасность → Управление сертификатами) и **полностью** закройте браузер.

## 5. Запуск приложения

Нужны **два терминала** в VS Code: **Terminal → Split Terminal**.

**Терминал 1 — backend:**

```bash
cd server
npm start
```

Должно появиться: `HTTPS-сервер запущен на https://localhost:3000`.

**Терминал 2 — frontend:**

```bash
cd client
npm start
```

Откроется браузер на **https://localhost:3001** (или откройте вручную).

## 6. Проверка работы

- Каталог товаров: https://localhost:3001  
- API / Swagger: https://localhost:3000/api-docs  
- Офлайн-баннер: DevTools → Network → **Offline**, обновите страницу — жёлтый баннер «Проверьте подключение к интернету».

## 7. Частые проблемы

| Проблема | Решение |
|----------|---------|
| `npm` не найден | Переустановите Node.js, перезапустите VS Code |
| Порт 3000 занят | Закройте другой `node app.js` или смените порт в `server/app.js` |
| Сертификат не доверен | Повторите `npm run cert` с правами администратора |
| Клиент на HTTP, а не HTTPS | Убедитесь, что есть файл `client/.env.development` |
| Белый экран после `npm start` | Смотрите ошибки в терминале `client`; выполните `npm install` ещё раз |

## 8. Структура проекта

```
FrontBack_pr18/
├── client/          # React (порт 3001)
│   ├── public/sw.js
│   └── src/
├── server/          # Express + HTTPS (порт 3000)
│   ├── app.js
│   └── setup-https.js
├── README.md        # Описание практик
└── VSCODE.md        # Эта инструкция
```

## 9. Обновление с GitHub

```bash
git pull origin main
cd server && npm install
cd ../client && npm install
```

Если менялись сертификаты — при необходимости снова `cd server && npm run cert`.
