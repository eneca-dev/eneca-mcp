#!/usr/bin/env node
import { createMcpServer } from './mcp-server.js';
console.log('🚀 Запуск Eneca MCP Server для n8n...');
console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`🔧 Platform: ${process.platform}`);
console.log(`📦 Node.js: ${process.version}`);
// Rate Limiting - 1000 запросов в минуту на сессию
const rateLimiter = new Map();
function checkRateLimit(sessionId) {
    const now = Date.now();
    const requests = rateLimiter.get(sessionId) || [];
    const recent = requests.filter(time => now - time < 60000); // 1 минута
    if (recent.length >= 1000) {
        console.log(`Rate limit exceeded for session: ${sessionId}`);
        return false; // Превышен лимит 1000 запросов в минуту
    }
    recent.push(now);
    rateLimiter.set(sessionId, recent);
    return true;
}
// Проверяем аргументы командной строки
const args = process.argv.slice(2);
const transportArg = args.find(arg => arg.startsWith('--transport='));
const transport = transportArg ? transportArg.split('=')[1] : 'stdio';
if (transport === 'sse') {
    console.log('Запуск SSE транспорта для n8n...');
    try {
        const { SSEServerTransport } = await import('@modelcontextprotocol/sdk/server/sse.js');
        const http = await import('node:http');
        const { URL } = await import('node:url');
        // Хранилище активных транспортов
        const activeTransports = new Map();
        // Создаем HTTP сервер
        const httpServer = http.createServer(async (req, res) => {
            // CORS заголовки для n8n
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');
            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }
            // Парсим URL
            const url = new URL(req.url, `http://${req.headers.host}`);
            // GET /sse - устанавливаем SSE соединение
            if (req.method === 'GET' && url.pathname === '/sse') {
                console.log('GET /sse - Новое SSE подключение от n8n');
                try {
                    // Создаем MCP сервер для каждого подключения
                    const server = createMcpServer();
                    // Создаем SSE транспорт
                    const sseTransport = new SSEServerTransport('/sse', res);
                    const sessionId = sseTransport.sessionId;
                    // Сохраняем транспорт для POST запросов
                    activeTransports.set(sessionId, sseTransport);
                    console.log(`Транспорт сохранен: ${sessionId}`);
                    // Cleanup при закрытии уже обрабатывается в onclose выше
                    // Подключаем MCP сервер к транспорту
                    await server.connect(sseTransport);
                    console.log('SSE соединение установлено');
                    
                    // Устанавливаем keep-alive ping каждые 30 секунд для предотвращения таймаутов Heroku
                    const keepAliveInterval = setInterval(() => {
                        if (res.writableEnded || res.destroyed) {
                            clearInterval(keepAliveInterval);
                            return;
                        }
                        
                        try {
                            // Отправляем комментарий каждые 30 секунд для поддержания соединения
                            res.write(`: keepalive ${Date.now()}\n\n`);
                            console.log('💓 Keep-alive ping отправлен');
                        } catch (error) {
                            console.log('❌ Ошибка keep-alive ping:', error.message);
                            clearInterval(keepAliveInterval);
                        }
                    }, 30000); // 30 секунд
                    
                    // Очищаем интервал при закрытии соединения
                    sseTransport.onclose = () => {
                        console.log(`SSE соединение закрыто: ${sessionId}`);
                        clearInterval(keepAliveInterval);
                        activeTransports.delete(sessionId);
                    };
                }
                catch (error) {
                    console.error('Ошибка GET /sse:', error);
                    res.writeHead(500);
                    res.end('SSE Error');
                }
                return;
            }
            // POST /sse?sessionId=... - обрабатываем MCP команды
            if (req.method === 'POST' && url.pathname === '/sse') {
                console.log('POST /sse - MCP команда от n8n');
                // Извлекаем sessionId из URL
                const sessionId = url.searchParams.get('sessionId');
                console.log(`Session ID: ${sessionId}`);
                if (!sessionId) {
                    console.log(' Нет sessionId в URL');
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'sessionId required' }));
                    return;
                }
                // Проверяем rate limiting
                if (!checkRateLimit(sessionId)) {
                    console.log(`Rate limit exceeded для сессии: ${sessionId}`);
                    res.writeHead(429, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Rate limit exceeded: максимум 1000 запросов в минуту' }));
                    return;
                }
                // Ищем транспорт
                const sseTransport = activeTransports.get(sessionId);
                if (!sseTransport) {
                    console.log(` Транспорт не найден для: ${sessionId}`);
                    console.log(` Активных транспортов: ${activeTransports.size}`);
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Transport not found' }));
                    return;
                }
                try {
                    // Обрабатываем через SDK
                    console.log(' Обрабатываем MCP команду...');
                    await sseTransport.handlePostMessage(req, res);
                    console.log(' MCP команда обработана');
                }
                catch (error) {
                    console.error('Ошибка POST обработки:', error);
                    // SDK уже отправил ответ
                }
                return;
            }
            // Health check для Heroku
            if (req.method === 'GET' && url.pathname === '/') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'ok',
                    service: 'eneca-mcp-server',
                    version: '2.0.0',
                    timestamp: new Date().toISOString(),
                    endpoints: {
                        sse: '/sse',
                        health: '/',
                        webhook: '/webhook'
                    }
                }));
                return;
            }
            
            // Webhook endpoint для n8n
            if (req.method === 'POST' && url.pathname === '/webhook') {
                console.log('📡 POST /webhook - Вебхук от n8n');
                
                try {
                    let body = '';
                    req.on('data', chunk => {
                        body += chunk.toString();
                    });
                    
                    req.on('end', async () => {
                        try {
                            const webhookData = JSON.parse(body);
                            console.log('📥 Получены данные вебхука:', JSON.stringify(webhookData, null, 2));
                            
                            // Отправляем уведомление через SSE всем активным клиентам
                            const webhookMessage = {
                                type: 'webhook',
                                timestamp: new Date().toISOString(),
                                data: webhookData,
                                source: 'n8n'
                            };
                            
                            let clientsNotified = 0;
                            for (const [sessionId, transport] of activeTransports) {
                                try {
                                    // Отправляем через SSE
                                    transport.sendMessage({
                                        type: 'webhook',
                                        data: webhookMessage
                                    });
                                    clientsNotified++;
                                    console.log(`📤 Вебхук отправлен клиенту: ${sessionId}`);
                                } catch (error) {
                                    console.log(`❌ Ошибка отправки вебхука клиенту ${sessionId}:`, error.message);
                                }
                            }
                            
                            // Отправляем ответ
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                status: 'success',
                                message: 'Webhook получен и обработан',
                                clientsNotified,
                                timestamp: new Date().toISOString(),
                                data: webhookData
                            }));
                            
                            console.log(`✅ Вебхук обработан успешно. Уведомлено клиентов: ${clientsNotified}`);
                            
                        } catch (parseError) {
                            console.error('❌ Ошибка парсинга JSON вебхука:', parseError);
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ 
                                error: 'Invalid JSON', 
                                message: parseError.message 
                            }));
                        }
                    });
                    
                } catch (error) {
                    console.error('❌ Ошибка обработки вебхука:', error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        error: 'Internal Server Error', 
                        message: error.message 
                    }));
                }
                return;
            }
            
            // 404 для всех остальных запросов
            console.log(`404: ${req.method} ${url.pathname}${url.search}`);
            res.writeHead(404);
            res.end('Not Found');
        });
        // Получаем порт из переменных окружения (Heroku)
        const port = process.env.PORT || 8080;
        
        // Запускаем сервер
        httpServer.listen(port, () => {
            console.log(`🚀 SSE сервер запущен на порту ${port}`);
            console.log(`📍 Endpoint: http://localhost:${port}/sse`);
            console.log(`🌐 Heroku URL: https://${process.env.HEROKU_APP_NAME || 'your-app'}.herokuapp.com/sse`);
        });
        console.log('Готов for n8n MCP Client');
        console.log('Полная поддержка GET и POST запросов');
        // Graceful shutdown
        process.on('SIGINT', async () => {
            console.log('Получен сигнал завершения...');
            httpServer.close();
            process.exit(0);
        });
    }
    catch (error) {
        console.error('Ошибка запуска SSE сервера:', error);
        process.exit(1);
    }
}
else {
    // STDIO транспорт
    console.log('Запуск STDIO транспорта...');
    try {
        const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
        const server = createMcpServer();
        const stdioTransport = new StdioServerTransport();
        await server.connect(stdioTransport);
        console.log('STDIO транспорт готов');
    }
    catch (error) {
        console.error('Ошибка запуска STDIO:', error);
        process.exit(1);
    }
}
