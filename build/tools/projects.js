/**
 * Инструменты для работы с проектами
 */
import { z } from 'zod';
import { DatabaseService } from '../services/database.js';
const dbService = new DatabaseService();
// Создание кастомной схемы для статуса с поддержкой русского языка
const createStatusSchema = () => {
    return z.string().refine((status) => dbService.validateProjectStatus(status), {
        message: "Статус должен быть одним из: активный, архивный, приостановленный, отмененный (или на английском: active, archive, paused, canceled)"
    }).optional();
};
// ===== ZOD СХЕМЫ ВАЛИДАЦИИ =====
const CreateProjectSchema = z.object({
    project_name: z.string()
        .min(1, "Название проекта обязательно")
        .max(100, "Название проекта не должно превышать 100 символов")
        .regex(/^[а-яА-Яa-zA-Z0-9\s\-_\.№]+$/, "Недопустимые символы в названии проекта"),
    project_description: z.string()
        .max(500, "Описание не должно превышать 500 символов")
        .optional(),
    project_manager_name: z.string()
        .max(100, "Имя менеджера не должно превышать 100 символов")
        .optional(),
    project_lead_engineer_name: z.string()
        .max(100, "Имя главного инженера не должно превышать 100 символов")
        .optional(),
    client_name: z.string()
        .max(100, "Название заказчика не должно превышать 100 символов")
        .optional()
});
const SearchProjectsSchema = z.object({
    project_name: z.string()
        .max(100, "Название проекта не должно превышать 100 символов")
        .optional(),
    manager_name: z.string()
        .max(100, "Имя менеджера не должно превышать 100 символов")
        .optional(),
    client_name: z.string()
        .max(100, "Название заказчика не должно превышать 100 символов")
        .optional(),
    status: createStatusSchema(),
    limit: z.number()
        .min(1, "Лимит должен быть больше 0")
        .max(100, "Лимит не должен превышать 100")
        .optional()
});
const ProjectDetailsSchema = z.object({
    project_name: z.string()
        .min(1, "Название проекта обязательно")
        .max(100, "Название проекта не должно превышать 100 символов")
});
const UpdateProjectSchema = z.object({
    current_name: z.string()
        .min(1, "Текущее название проекта обязательно")
        .max(100, "Название проекта не должно превышать 100 символов"),
    new_name: z.string()
        .max(100, "Новое название проекта не должно превышать 100 символов")
        .optional(),
    description: z.string()
        .max(500, "Описание не должно превышать 500 символов")
        .optional(),
    manager_name: z.string()
        .max(100, "Имя менеджера не должно превышать 100 символов")
        .optional(),
    lead_engineer_name: z.string()
        .max(100, "Имя главного инженера не должно превышать 100 символов")
        .optional(),
    status: createStatusSchema(),
    client_name: z.string()
        .max(100, "Название заказчика не должно превышать 100 символов")
        .optional()
});
// ===== СОЗДАНИЕ ПРОЕКТА =====
export const createProjectTool = {
    name: "create_project",
    description: "Создать новый проект",
    inputSchema: {
        type: "object",
        properties: {
            project_name: {
                type: "string",
                description: "Название проекта (обязательно)"
            },
            project_description: {
                type: "string",
                description: "Описание проекта"
            },
            project_manager_name: {
                type: "string",
                description: "Имя менеджера проекта (будет выполнен поиск по имени/email)"
            },
            project_lead_engineer_name: {
                type: "string",
                description: "Имя главного инженера (будет выполнен поиск по имени/email)"
            },
            client_name: {
                type: "string",
                description: "Название заказчика (будет выполнен поиск по названию)"
            }
        },
        required: ["project_name"]
    }
};
export async function handleCreateProject(args) {
    try {
        // Zod валидация входных данных
        const validatedArgs = CreateProjectSchema.parse(args);
        const input = {
            project_name: validatedArgs.project_name.trim(),
            project_description: validatedArgs.project_description?.trim()
        };
        // Поиск менеджера проекта
        if (validatedArgs.project_manager_name) {
            const users = await dbService.searchUsersByQuery(validatedArgs.project_manager_name.trim());
            if (users.length === 0) {
                return {
                    content: [{
                            type: "text",
                            text: `Пользователь с именем "${validatedArgs.project_manager_name}" не найден`
                        }]
                };
            }
            if (users.length > 1) {
                const usersList = users.map(u => `• ${u.full_name.trim() || `${u.first_name} ${u.last_name}`.trim()} (${u.email})`).join('\n');
                return {
                    content: [{
                            type: "text",
                            text: `Найдено несколько пользователей с именем "${validatedArgs.project_manager_name}":\n${usersList}\nУточните имя или используйте email.`
                        }]
                };
            }
            input.project_manager = users[0].user_id;
        }
        // Поиск главного инженера
        if (validatedArgs.project_lead_engineer_name) {
            const users = await dbService.searchUsersByQuery(validatedArgs.project_lead_engineer_name.trim());
            if (users.length === 0) {
                return {
                    content: [{
                            type: "text",
                            text: `Пользователь с именем "${validatedArgs.project_lead_engineer_name}" не найден`
                        }]
                };
            }
            if (users.length > 1) {
                const usersList = users.map(u => `• ${u.full_name.trim() || `${u.first_name} ${u.last_name}`.trim()} (${u.email})`).join('\n');
                return {
                    content: [{
                            type: "text",
                            text: `Найдено несколько пользователей с именем "${validatedArgs.project_lead_engineer_name}":\n${usersList}\nУточните имя или используйте email.`
                        }]
                };
            }
            input.project_lead_engineer = users[0].user_id;
        }
        // Поиск заказчика
        if (validatedArgs.client_name) {
            const client = await dbService.findClientByName(validatedArgs.client_name.trim());
            if (!client) {
                return {
                    content: [{
                            type: "text",
                            text: `Заказчик с названием "${validatedArgs.client_name}" не найден`
                        }]
                };
            }
            input.client_id = client.client_id;
        }
        const result = await dbService.createProject(input);
        return {
            content: [{
                    type: "text",
                    text: result.success ?
                        `${result.message}\nПроект "${validatedArgs.project_name}" успешно создан` :
                        `${result.message}`
                }]
        };
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return {
                content: [{
                        type: "text",
                        text: `Ошибка валидации: ${error.errors.map(e => e.message).join(', ')}`
                    }]
            };
        }
        return {
            content: [{
                    type: "text",
                    text: `Ошибка создания проекта: ${error}`
                }]
        };
    }
}
// ===== ПОИСК ПРОЕКТОВ =====
export const searchProjectsTool = {
    name: "search_projects",
    description: "Поиск проектов по различным критериям",
    inputSchema: {
        type: "object",
        properties: {
            project_name: {
                type: "string",
                description: "Название проекта (частичное совпадение)"
            },
            manager_name: {
                type: "string",
                description: "Имя менеджера проекта"
            },
            client_name: {
                type: "string",
                description: "Название заказчика"
            },
            status: {
                type: "string",
                description: "Статус проекта (активный, архивный, приостановленный, отмененный или на английском: active, archive, paused, canceled)"
            },
            limit: {
                type: "number",
                description: "Лимит результатов",
                default: 10
            }
        }
    }
};
export async function handleSearchProjects(args) {
    try {
        // Zod валидация входных данных
        const validatedArgs = SearchProjectsSchema.parse(args);
        const filters = {};
        if (validatedArgs.limit) {
            filters.limit = validatedArgs.limit;
        }
        if (validatedArgs.status) {
            const normalizedStatus = dbService.normalizeProjectStatus(validatedArgs.status);
            if (!normalizedStatus) {
                return {
                    content: [{
                            type: "text",
                            text: `Неверный статус проекта: "${validatedArgs.status}"`
                        }]
                };
            }
            filters.status = normalizedStatus;
        }
        // Поиск по менеджеру
        if (validatedArgs.manager_name) {
            const users = await dbService.searchUsersByQuery(validatedArgs.manager_name.trim());
            if (users.length === 0) {
                return {
                    content: [{
                            type: "text",
                            text: `Менеджер с именем "${validatedArgs.manager_name}" не найден`
                        }]
                };
            }
            if (users.length > 1) {
                const usersList = users.map(u => `• ${u.full_name.trim() || `${u.first_name} ${u.last_name}`.trim()} (${u.email})`).join('\n');
                return {
                    content: [{
                            type: "text",
                            text: `Найдено несколько пользователей с именем "${validatedArgs.manager_name}":\n${usersList}\nУточните имя.`
                        }]
                };
            }
            filters.manager = users[0].user_id;
        }
        // Поиск по заказчику
        if (validatedArgs.client_name) {
            const client = await dbService.findClientByName(validatedArgs.client_name.trim());
            if (!client) {
                return {
                    content: [{
                            type: "text",
                            text: `Заказчик с названием "${validatedArgs.client_name}" не найден`
                        }]
                };
            }
            filters.client_id = client.client_id;
        }
        let projects = [];
        if (validatedArgs.project_name) {
            // Поиск по названию проекта
            projects = await dbService.searchProjectsByName(validatedArgs.project_name.trim());
            // Применяем дополнительные фильтры
            if (filters.manager) {
                projects = projects.filter(p => p.project_manager === filters.manager);
            }
            if (filters.client_id) {
                projects = projects.filter(p => p.client_id === filters.client_id);
            }
            if (filters.status) {
                projects = projects.filter(p => p.project_status === filters.status);
            }
        }
        else {
            // Общий поиск через listProjects
            const result = await dbService.listProjects(filters);
            if (!result.success) {
                return {
                    content: [{
                            type: "text",
                            text: `${result.message}`
                        }]
                };
            }
            projects = result.data || [];
        }
        if (projects.length === 0) {
            return {
                content: [{
                        type: "text",
                        text: "Проекты не найдены по указанным критериям"
                    }]
            };
        }
        const projectsText = projects.map((project, index) => `${index + 1}. ${project.project_name}\n` +
            `Статус: ${project.project_status}\n` +
            `Создан: ${project.project_created ? new Date(project.project_created).toLocaleDateString() : 'Неизвестно'}\n` +
            `${project.project_description ? `Описание: ${project.project_description}\n` : ''}---`).join('\n');
        return {
            content: [{
                    type: "text",
                    text: `🎯 Найдено проектов: ${projects.length}\n\n${projectsText}`
                }]
        };
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return {
                content: [{
                        type: "text",
                        text: `Ошибка валидации: ${error.errors.map(e => e.message).join(', ')}`
                    }]
            };
        }
        return {
            content: [{
                    type: "text",
                    text: `Ошибка поиска проектов: ${error}`
                }]
        };
    }
}
// ===== ПОЛУЧЕНИЕ ДЕТАЛЕЙ ПРОЕКТА =====
export const getProjectDetailsTool = {
    name: "get_project_details",
    description: "Получить подробную информацию о проекте по названию (поддерживает частичное совпадение)",
    inputSchema: {
        type: "object",
        properties: {
            project_name: {
                type: "string",
                description: "Название проекта или его часть для поиска"
            }
        },
        required: ["project_name"]
    }
};
export async function handleGetProjectDetails(args) {
    try {
        // Zod валидация входных данных
        const validatedArgs = ProjectDetailsSchema.parse(args);
        const searchTerm = validatedArgs.project_name.trim();
        // Поиск проектов по частичному совпадению названия
        const projects = await dbService.searchProjectsByName(searchTerm);
        if (projects.length === 0) {
            return {
                content: [{
                        type: "text",
                        text: `Проекты с названием содержащим "${searchTerm}" не найдены`
                    }]
            };
        }
        // Если найдено несколько проектов, показываем список для выбора
        if (projects.length > 1) {
            const projectsList = projects.map((p, index) => `${index + 1}. **${p.project_name}** (статус: ${dbService.getDisplayStatus(p.project_status || 'active')})`).join('\n');
            return {
                content: [{
                        type: "text",
                        text: `Найдено несколько проектов с названием содержащим "${searchTerm}":\n\n${projectsList}\n\nУточните название проекта для получения детальной информации.`
                    }]
            };
        }
        // Если найден один проект, показываем детали
        const project = projects[0];
        // Получаем дополнительную информацию
        const stagesResult = await dbService.listStages({ project_id: project.project_id });
        const stages = stagesResult.success ? stagesResult.data : [];
        let detailsText = `**ПРОЕКТ: ${project.project_name}**\n\n`;
        detailsText += `**Основная информация:**\n`;
        detailsText += `• Статус: ${dbService.getDisplayStatus(project.project_status || 'active')}\n`;
        detailsText += `• Создан: ${project.project_created ? new Date(project.project_created).toLocaleDateString() : 'Неизвестно'}\n`;
        detailsText += `• Обновлен: ${project.project_updated ? new Date(project.project_updated).toLocaleDateString() : 'Неизвестно'}\n`;
        if (project.project_description) {
            detailsText += `• Описание: ${project.project_description}\n`;
        }
        detailsText += `\n**Структура:**\n`;
        detailsText += `• Стадий: ${stages?.length || 0}\n`;
        if (stages && stages.length > 0) {
            detailsText += `\n**Стадии:**\n`;
            stages.forEach((stage, index) => {
                detailsText += `${index + 1}. ${stage.stage_name}\n`;
                if (stage.stage_description) {
                    detailsText += `   Описание: ${stage.stage_description}\n`;
                }
            });
        }
        return {
            content: [{
                    type: "text",
                    text: detailsText
                }]
        };
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return {
                content: [{
                        type: "text",
                        text: `Ошибка валидации: ${error.errors.map(e => e.message).join(', ')}`
                    }]
            };
        }
        return {
            content: [{
                    type: "text",
                    text: `❌ Ошибка получения деталей проекта: ${error}`
                }]
        };
    }
}
// ===== ОБНОВЛЕНИЕ ПРОЕКТА =====
export const updateProjectTool = {
    name: "update_project",
    description: "Обновление существующего проекта",
    inputSchema: {
        type: "object",
        properties: {
            current_name: {
                type: "string",
                description: "Текущее название проекта для поиска"
            },
            new_name: {
                type: "string",
                description: "Новое название проекта (опционально)"
            },
            description: {
                type: "string",
                description: "Новое описание проекта (опционально)"
            },
            manager_name: {
                type: "string",
                description: "Новый менеджер проекта (имя для поиска, опционально)"
            },
            lead_engineer_name: {
                type: "string",
                description: "Новый главный инженер (имя для поиска, опционально)"
            },
            status: {
                type: "string",
                description: "Новый статус проекта (активный, архивный, приостановленный, отмененный или на английском: active, archive, paused, canceled, опционально)"
            },
            client_name: {
                type: "string",
                description: "Новый клиент (название для поиска, опционально)"
            }
        },
        required: ["current_name"]
    }
};
export async function handleUpdateProject(args) {
    try {
        // Zod валидация входных данных
        const validatedArgs = UpdateProjectSchema.parse(args);
        const currentName = validatedArgs.current_name.trim();
        // Поиск проекта
        const project = await dbService.findProjectByNameExact(currentName);
        if (!project) {
            return {
                content: [{
                        type: "text",
                        text: `Проект с названием "${currentName}" не найден`
                    }]
            };
        }
        // Подготовка данных для обновления
        const updateData = {
            project_id: project.project_id
        };
        // Обработка нового названия
        if (validatedArgs.new_name) {
            const newName = validatedArgs.new_name.trim();
            if (newName !== currentName) {
                updateData.project_name = newName;
            }
        }
        // Обработка описания
        if (validatedArgs.description !== undefined) {
            updateData.project_description = validatedArgs.description.trim() || undefined;
        }
        // Обработка менеджера
        if (validatedArgs.manager_name) {
            const users = await dbService.searchUsersByQuery(validatedArgs.manager_name.trim());
            if (users.length === 0) {
                return {
                    content: [{
                            type: "text",
                            text: `Пользователь с именем "${validatedArgs.manager_name}" не найден`
                        }]
                };
            }
            if (users.length > 1) {
                const usersList = users.map(u => `• ${u.full_name.trim() || `${u.first_name} ${u.last_name}`.trim()} (${u.email})`).join('\n');
                return {
                    content: [{
                            type: "text",
                            text: `Найдено несколько пользователей с именем "${validatedArgs.manager_name}":\n${usersList}\nУточните имя.`
                        }]
                };
            }
            updateData.project_manager = users[0].user_id;
        }
        // Обработка главного инженера
        if (validatedArgs.lead_engineer_name) {
            const users = await dbService.searchUsersByQuery(validatedArgs.lead_engineer_name.trim());
            if (users.length === 0) {
                return {
                    content: [{
                            type: "text",
                            text: `Пользователь с именем "${validatedArgs.lead_engineer_name}" не найден`
                        }]
                };
            }
            if (users.length > 1) {
                const usersList = users.map(u => `• ${u.full_name.trim() || `${u.first_name} ${u.last_name}`.trim()} (${u.email})`).join('\n');
                return {
                    content: [{
                            type: "text",
                            text: `Найдено несколько пользователей с именем "${validatedArgs.lead_engineer_name}":\n${usersList}\nУточните имя.`
                        }]
                };
            }
            updateData.project_lead_engineer = users[0].user_id;
        }
        // Обработка статуса
        if (validatedArgs.status) {
            const normalizedStatus = dbService.normalizeProjectStatus(validatedArgs.status);
            if (!normalizedStatus) {
                return {
                    content: [{
                            type: "text",
                            text: `Неверный статус проекта: "${validatedArgs.status}"`
                        }]
                };
            }
            updateData.project_status = normalizedStatus;
        }
        // Обработка клиента
        if (validatedArgs.client_name) {
            const client = await dbService.findClientByName(validatedArgs.client_name.trim());
            if (!client) {
                return {
                    content: [{
                            type: "text",
                            text: `Клиент с названием "${validatedArgs.client_name}" не найден`
                        }]
                };
            }
            updateData.client_id = client.client_id;
        }
        // Выполнение обновления
        const result = await dbService.updateProject(updateData);
        if (!result.success) {
            return {
                content: [{
                        type: "text",
                        text: `Ошибка обновления проекта: ${result.message}`
                    }]
            };
        }
        // Формирование ответа о том, что изменилось
        const changes = [];
        if (updateData.project_name)
            changes.push(`Название: "${currentName}" → "${updateData.project_name}"`);
        if (updateData.project_description !== undefined)
            changes.push(`Описание: обновлено`);
        if (updateData.project_manager)
            changes.push(`Менеджер: обновлен`);
        if (updateData.project_lead_engineer)
            changes.push(`Главный инженер: обновлен`);
        if (updateData.project_status)
            changes.push(`Статус: ${updateData.project_status}`);
        if (updateData.client_id)
            changes.push(`Клиент: обновлен`);
        return {
            content: [{
                    type: "text",
                    text: `Проект "${currentName}" успешно обновлен\n\nИзменения:\n${changes.join('\n')}`
                }]
        };
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return {
                content: [{
                        type: "text",
                        text: `Ошибка валидации: ${error.errors.map(e => e.message).join(', ')}`
                    }]
            };
        }
        return {
            content: [{
                    type: "text",
                    text: `Ошибка обновления проекта: ${error}`
                }]
        };
    }
}
// Экспорт всех инструментов проектов
export const projectTools = [
    createProjectTool,
    searchProjectsTool,
    getProjectDetailsTool,
    updateProjectTool
];
export const projectHandlers = {
    create_project: handleCreateProject,
    search_projects: handleSearchProjects,
    get_project_details: handleGetProjectDetails,
    update_project: handleUpdateProject
};
