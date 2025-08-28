/**
 * Инструменты для работы со стадиями проектов
 */
import { z } from 'zod';
import { DatabaseService } from '../services/database.js';
const dbService = new DatabaseService();
// ===== ZOD СХЕМЫ ВАЛИДАЦИИ =====
const CreateStageSchema = z.object({
    stage_name: z.string()
        .min(1, "Название стадии обязательно")
        .max(100, "Название стадии не должно превышать 100 символов")
        .regex(/^[а-яА-Яa-zA-Z0-9\s\-_\.№]+$/, "Недопустимые символы в названии стадии"),
    stage_description: z.string()
        .max(500, "Описание не должно превышать 500 символов")
        .optional(),
    project_name: z.string()
        .min(1, "Название проекта обязательно")
        .max(100, "Название проекта не должно превышать 100 символов")
});
const SearchStagesSchema = z.object({
    stage_name: z.string()
        .max(100, "Название стадии не должно превышать 100 символов")
        .optional(),
    project_name: z.string()
        .max(100, "Название проекта не должно превышать 100 символов")
        .optional(),
    limit: z.number()
        .min(1, "Лимит должен быть больше 0")
        .max(100, "Лимит не должен превышать 100")
        .optional()
});
const ProjectStructureSchema = z.object({
    project_name: z.string()
        .min(1, "Название проекта обязательно")
        .max(100, "Название проекта не должно превышать 100 символов")
});
const UpdateStageSchema = z.object({
    current_name: z.string()
        .min(1, "Текущее название стадии обязательно")
        .max(100, "Название стадии не должно превышать 100 символов"),
    project_name: z.string()
        .min(1, "Название проекта обязательно")
        .max(100, "Название проекта не должно превышать 100 символов"),
    new_name: z.string()
        .max(100, "Новое название стадии не должно превышать 100 символов")
        .optional(),
    description: z.string()
        .max(500, "Описание не должно превышать 500 символов")
        .optional()
});
// ===== СОЗДАНИЕ СТАДИИ =====
export const createStageTool = {
    name: "create_stage",
    description: "Создать новую стадию в проекте",
    inputSchema: {
        type: "object",
        properties: {
            stage_name: {
                type: "string",
                description: "Название стадии (обязательно)"
            },
            stage_description: {
                type: "string",
                description: "Описание стадии"
            },
            project_name: {
                type: "string",
                description: "Название проекта (обязательно)"
            }
        },
        required: ["stage_name", "project_name"]
    }
};
export async function handleCreateStage(args) {
    try {
        // Zod валидация входных данных
        const validatedArgs = CreateStageSchema.parse(args);
        // Поиск проекта по названию
        const project = await dbService.findProjectByNameExact(validatedArgs.project_name.trim());
        if (!project) {
            return {
                content: [{
                        type: "text",
                        text: `Проект с названием "${validatedArgs.project_name}" не найден`
                    }]
            };
        }
        const input = {
            stage_name: validatedArgs.stage_name.trim(),
            stage_description: validatedArgs.stage_description?.trim(),
            stage_project_id: project.project_id
        };
        const result = await dbService.createStage(input);
        return {
            content: [{
                    type: "text",
                    text: result.success ?
                        `${result.message}\nСтадия "${validatedArgs.stage_name}" успешно создана в проекте "${project.project_name}"` :
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
                    text: `Ошибка создания стадии: ${error}`
                }]
        };
    }
}
// ===== ПОИСК СТАДИЙ =====
export const searchStagesTool = {
    name: "search_stages",
    description: "Поиск стадий по названию и проекту",
    inputSchema: {
        type: "object",
        properties: {
            stage_name: {
                type: "string",
                description: "Название стадии (частичное совпадение)"
            },
            project_name: {
                type: "string",
                description: "Название проекта для фильтрации"
            },
            limit: {
                type: "number",
                description: "Лимит результатов",
                default: 10
            }
        }
    }
};
export async function handleSearchStages(args) {
    try {
        let projectId = undefined;
        // Поиск проекта если указан
        if (args.project_name) {
            const projectResult = await dbService.validateUniqueProjectByName(String(args.project_name).trim());
            if (projectResult === 'not_found') {
                return {
                    content: [{
                            type: "text",
                            text: `Проект с названием "${args.project_name}" не найден`
                        }]
                };
            }
            if (projectResult === 'multiple_found') {
                return {
                    content: [{
                            type: "text",
                            text: `Найдено несколько проектов с названием "${args.project_name}". Уточните название или используйте поиск проектов.`
                        }]
                };
            }
            projectId = projectResult.project_id;
        }
        let stages = [];
        if (args.stage_name) {
            // Поиск по названию стадии
            stages = await dbService.searchStagesByName(String(args.stage_name).trim(), projectId);
        }
        else if (projectId) {
            // Получение всех стадий проекта
            const result = await dbService.listStages({ project_id: projectId, limit: args.limit || 10 });
            if (!result.success) {
                return {
                    content: [{
                            type: "text",
                            text: `${result.message}`
                        }]
                };
            }
            stages = result.data || [];
        }
        else {
            return {
                content: [{
                        type: "text",
                        text: "Укажите название стадии или название проекта для поиска"
                    }]
            };
        }
        if (stages.length === 0) {
            return {
                content: [{
                        type: "text",
                        text: "Стадии не найдены по указанным критериям"
                    }]
            };
        }
        const stagesText = stages.map((stage, index) => `${index + 1}. ${stage.stage_name}\n` +
            `Проект: ${stage.stage_project_id}\n` +
            `Создана: ${stage.stage_created ? new Date(stage.stage_created).toLocaleDateString() : 'Неизвестно'}\n` +
            `${stage.stage_description ? `Описание: ${stage.stage_description}\n` : ''}---`).join('\n');
        return {
            content: [{
                    type: "text",
                    text: `📋 Найдено стадий: ${stages.length}\n\n${stagesText}`
                }]
        };
    }
    catch (error) {
        return {
            content: [{
                    type: "text",
                    text: `Ошибка поиска стадий: ${error}`
                }]
        };
    }
}
// Удален getProjectStructureTool - функциональность перенесена в getProjectDetailsTool
// ===== ОБНОВЛЕНИЕ СТАДИИ =====
export const updateStageTool = {
    name: "update_stage",
    description: "Обновление существующей стадии",
    inputSchema: {
        type: "object",
        properties: {
            current_name: {
                type: "string",
                description: "Текущее название стадии для поиска"
            },
            project_name: {
                type: "string",
                description: "Название проекта, в котором находится стадия"
            },
            new_name: {
                type: "string",
                description: "Новое название стадии (опционально)"
            },
            description: {
                type: "string",
                description: "Новое описание стадии (опционально)"
            }
        },
        required: ["current_name", "project_name"]
    }
};
export async function handleUpdateStage(args) {
    try {
        const currentName = String(args.current_name).trim();
        const projectName = String(args.project_name).trim();
        // Поиск проекта
        const project = await dbService.findProjectByNameExact(projectName);
        if (!project) {
            return {
                content: [{
                        type: "text",
                        text: `Проект с названием "${projectName}" не найден`
                    }]
            };
        }
        // Поиск стадии
        const stage = await dbService.findStageByNameExact(currentName, project.project_id);
        if (!stage) {
            return {
                content: [{
                        type: "text",
                        text: `Стадия с названием "${currentName}" не найдена в проекте "${projectName}"`
                    }]
            };
        }
        // Подготовка данных для обновления
        const updateData = {
            stage_id: stage.stage_id
        };
        // Обработка нового названия
        if (args.new_name) {
            const newName = String(args.new_name).trim();
            if (newName !== currentName) {
                const uniqueCheck = await dbService.validateUniqueStageByNameForUpdate(newName, project.project_id, stage.stage_id);
                if (uniqueCheck === 'duplicate') {
                    return {
                        content: [{
                                type: "text",
                                text: `Стадия с названием "${newName}" уже существует в проекте "${projectName}"`
                            }]
                    };
                }
                updateData.stage_name = newName;
            }
        }
        // Обработка описания
        if (args.description !== undefined) {
            updateData.stage_description = String(args.description).trim() || undefined;
        }
        // Выполнение обновления
        const result = await dbService.updateStage(updateData);
        if (!result.success) {
            return {
                content: [{
                        type: "text",
                        text: `Ошибка обновления стадии: ${result.message}`
                    }]
            };
        }
        // Формирование ответа о том, что изменилось
        const changes = [];
        if (updateData.stage_name)
            changes.push(`Название: "${currentName}" → "${updateData.stage_name}"`);
        if (updateData.stage_description !== undefined)
            changes.push(`Описание: обновлено`);
        return {
            content: [{
                    type: "text",
                    text: `Стадия "${currentName}" в проекте "${projectName}" успешно обновлена\n\nИзменения:\n${changes.join('\n')}`
                }]
        };
    }
    catch (error) {
        return {
            content: [{
                    type: "text",
                    text: `Ошибка обновления стадии: ${error}`
                }]
        };
    }
}
// Экспорт всех инструментов стадий
export const stageTools = [
    createStageTool,
    searchStagesTool,
    updateStageTool
];
export const stageHandlers = {
    create_stage: handleCreateStage,
    search_stages: handleSearchStages,
    update_stage: handleUpdateStage
};
