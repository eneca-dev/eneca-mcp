# Eneca MCP Server

MCP (Model Context Protocol) сервер для интеграции с n8n через SSE транспорт.

## 🚀 Деплой на Heroku

### 1. Подготовка

```bash
# Клонируй репозиторий
git clone https://github.com/eneca-dev/eneca-mcp.git
cd eneca-mcp

# Установи Heroku CLI
# https://devcenter.heroku.com/articles/heroku-cli
```

### 2. Создание приложения на Heroku

```bash
# Создай новое приложение
heroku create your-app-name

# Или подключи существующее
heroku git:remote -a your-app-name
```

### 3. Настройка переменных окружения

```bash
# Supabase конфигурация
heroku config:set SUPABASE_URL=your_supabase_url
heroku config:set SUPABASE_ANON_KEY=your_supabase_anon_key
heroku config:set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# MCP конфигурация
heroku config:set MCP_SERVER_NAME=eneca-mcp
heroku config:set MCP_SERVER_VERSION=2.0.0

# Rate limiting
heroku config:set RATE_LIMIT_MAX_REQUESTS=1000
heroku config:set RATE_LIMIT_WINDOW_MS=60000
```

### 4. Деплой

```bash
# Запушь код
git push heroku master

# Или если используешь main ветку
git push heroku main
```

### 5. Проверка

```bash
# Открой приложение
heroku open

# Проверь логи
heroku logs --tail
```

## 📡 Endpoints

- `GET /` - Health check
- `GET /sse` - SSE соединение для n8n
- `POST /sse?sessionId=...` - MCP команды

## 🔧 Локальная разработка

```bash
# Установка зависимостей
npm install

# Запуск в режиме разработки
npm run dev

# Запуск в продакшн режиме
npm start
```

## 📋 Требования

- Node.js 18.x
- Heroku account
- Supabase проект

## 🚨 Важно

- Сервер автоматически использует порт из `process.env.PORT` (Heroku)
- Все переменные окружения должны быть настроены в Heroku
- Health check endpoint доступен по корневому пути `/` 