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
- `POST /mcp` - HTTP JSON-RPC endpoint (альтернатива SSE)

## 🛠️ Доступные инструменты

### Управление проектами

- `create_project` - Создание нового проекта
- `search_projects` - Поиск проектов по различным критериям
- `get_project_details` - Получение подробной информации о проекте
- `update_project` - Обновление существующего проекта

### Управление стадиями

- `create_stage` - Создание новой стадии
- `list_stages` - Получение списка стадий проекта
- `update_stage` - Обновление существующей стадии
- `delete_stage` - Удаление стадии (с опцией каскадного удаления)

### Управление объектами

- `create_object` - Создание нового объекта
- `list_objects` - Получение списка объектов
- `update_object` - Обновление существующего объекта
- `delete_object` - Удаление объекта (с опцией каскадного удаления)

### Управление разделами

- `create_section` - Создание нового раздела
- `list_sections` - Получение списка разделов
- `update_section` - Обновление существующего раздела
- `delete_section` - Удаление раздела

### Глобальный поиск

- `search_by_user` - Поиск по сотруднику (проекты, объекты, разделы)
- `search_project_team` - Поиск команды проекта
- `get_employee_workload` - Получение детальной загрузки сотрудника

### 📊 Отчёты РП/НО

- `generate_project_report_plan_fact` - Генерация отчёта План/Факт по проекту за период

**Подробная документация:** [docs/reports-tool-documentation.md](docs/reports-tool-documentation.md)

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
