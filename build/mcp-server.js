/**
 * MCP сервер фабрика
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema, InitializeRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
// Импортируем типы
import { DatabaseService } from "./services/database.js";
// Импорт всех инструментов
import { projectTools, projectHandlers } from './tools/projects.js';
import { stageTools, stageHandlers } from './tools/stages.js';
import { objectTools, objectHandlers } from './tools/objects.js';
import { sectionTools, sectionHandlers } from './tools/sections.js';
// Импорт глобальных инструментов поиска
import { globalSearchTools, globalSearchHandlers } from './tools/global-search.js';
// Импорт инструментов отчётов
import { reportTools, reportHandlers } from './tools/reports.js';
// Создаем экземпляр сервиса базы данных
const dbService = new DatabaseService();
export function createMcpServer() {
    console.log('🚀 Создание MCP сервера...');
    // Создание сервера
    const server = new Server({
        name: 'eneca-mcp',
        version: '2.0.0',
    }, {
        capabilities: {
            tools: {
                listChanged: false
            },
            resources: {
                subscribe: false,
                listChanged: false
            },
            prompts: {
                listChanged: false
            }
        },
    });
    // Объединение всех инструментов
    const allTools = [
        ...projectTools,
        ...stageTools,
        ...objectTools,
        ...sectionTools,
        ...globalSearchTools,
        ...reportTools
    ];
    // Объединение всех обработчиков
    const allHandlers = {
        ...projectHandlers,
        ...stageHandlers,
        ...objectHandlers,
        ...sectionHandlers,
        ...globalSearchHandlers,
        ...reportHandlers
    };
    console.log(`📦 Загружено инструментов: ${allTools.length}`);
    console.log(`🔧 Загружено обработчиков: ${Object.keys(allHandlers).length}`);
    /**
     * Обработчик инициализации
     */
    server.setRequestHandler(InitializeRequestSchema, async (request) => {
        console.log('🔄 MCP Initialize запрос:', JSON.stringify(request.params, null, 2));
        const response = {
            protocolVersion: "2025-03-26", // ✅ Обновляем до версии n8n
            capabilities: {
                tools: {
                    listChanged: false
                },
                resources: {
                    subscribe: false,
                    listChanged: false
                },
                prompts: {
                    listChanged: false
                }
            },
            serverInfo: {
                name: "eneca-mcp",
                version: "2.0.0"
            }
        };
        console.log('✅ MCP Initialize ответ:', JSON.stringify(response, null, 2));
        return response;
    });
    /**
     * Обработчик для списка доступных инструментов
     */
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        console.log('📋 MCP Tools/List запрос получен');
        console.log(`🔧 Доступно инструментов: ${allTools.length}`);
        // Логируем первые несколько инструментов для проверки
        allTools.slice(0, 3).forEach((tool, index) => {
            console.log(`   ${index + 1}. ${tool.name}: ${tool.description}`);
        });
        const response = {
            tools: allTools,
        };
        console.log('✅ MCP Tools/List ответ отправлен');
        return response;
    });
    /**
     * Обработчик вызова инструментов
     */
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        console.log(`🛠️ MCP Call Tool: ${name}`);
        console.log('📥 Аргументы:', JSON.stringify(args, null, 2));
        try {
            // Поиск обработчика
            const handler = allHandlers[name];
            if (!handler) {
                console.log(`❌ Инструмент "${name}" не найден`);
                throw new Error(`Инструмент "${name}" не найден`);
            }
            console.log(`⚡ Выполняю инструмент: ${name}`);
            // Вызов обработчика
            const result = await handler(args || {});
            console.log('✅ MCP Call Tool выполнен успешно');
            return result;
        }
        catch (error) {
            console.log(`❌ Ошибка выполнения инструмента "${name}":`, error);
            return {
                content: [{
                        type: "text",
                        text: `Ошибка выполнения инструмента "${name}": ${error}`
                    }]
            };
        }
    });
    // Ресурсы и промпты пока не используются
    return server;
}
