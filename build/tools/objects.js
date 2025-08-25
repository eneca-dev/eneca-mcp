/**
 * Инструменты для работы с объектами
 */
import { DatabaseService } from '../services/database.js';
const dbService = new DatabaseService();
// ===== СОЗДАНИЕ ОБЪЕКТА =====
export const createObjectTool = {
    name: "create_object",
    description: "Создать новый объект в стадии",
    inputSchema: {
        type: "object",
        properties: {
            object_name: {
                type: "string",
                description: "Название объекта (обязательно)"
            },
            object_description: {
                type: "string",
                description: "Описание объекта"
            },
            stage_name: {
                type: "string",
                description: "Название стадии (обязательно)"
            },
            project_name: {
                type: "string",
                description: "Название проекта (обязательно)"
            },
            responsible_name: {
                type: "string",
                description: "Имя ответственного за объект"
            },
            start_date: {
                type: "string",
                description: "Дата начала работ в формате дд.мм.гггг"
            },
            end_date: {
                type: "string",
                description: "Дата окончания работ в формате дд.мм.гггг"
            }
        },
        required: ["object_name", "stage_name", "project_name"]
    }
};
export async function handleCreateObject(args) {
    try {
        const objectName = String(args.object_name).trim();
        const stageName = String(args.stage_name).trim();
        const projectName = String(args.project_name).trim();
        // Поиск проекта по названию
        const projectResult = await dbService.validateUniqueProjectByName(projectName);
        if (projectResult === 'not_found') {
            return {
                content: [{
                        type: "text",
                        text: `Проект с названием "${projectName}" не найден`
                    }]
            };
        }
        if (projectResult === 'multiple_found') {
            return {
                content: [{
                        type: "text",
                        text: `Найдено несколько проектов с названием "${projectName}". Уточните название или используйте поиск проектов.`
                    }]
            };
        }
        const project = projectResult;
        // Поиск стадии по названию в проекте
        const stageResult = await dbService.validateUniqueStageByName(stageName, project.project_id);
        if (stageResult === 'not_found') {
            return {
                content: [{
                        type: "text",
                        text: `Стадия с названием "${stageName}" не найдена в проекте "${project.project_name}"`
                    }]
            };
        }
        if (stageResult === 'multiple_found') {
            return {
                content: [{
                        type: "text",
                        text: `В проекте "${project.project_name}" найдено несколько стадий с названием "${stageName}". Уточните название.`
                    }]
            };
        }
        const stage = stageResult;
        // Проверяем уникальность названия объекта в стадии
        const existingObjectCheck = await dbService.validateUniqueObjectByName(objectName, stage.stage_id);
        if (existingObjectCheck !== 'not_found') {
            if (existingObjectCheck === 'multiple_found') {
                return {
                    content: [{
                            type: "text",
                            text: `В стадии "${stage.stage_name}" существует несколько объектов с названием "${objectName}". Выберите другое название.`
                        }]
                };
            }
            else {
                return {
                    content: [{
                            type: "text",
                            text: `В стадии "${stage.stage_name}" уже существует объект с названием "${objectName}". Выберите другое название.`
                        }]
                };
            }
        }
        const input = {
            object_name: objectName,
            object_description: args.object_description ? String(args.object_description) : undefined,
            object_stage_id: stage.stage_id,
            object_project_id: project.project_id
        };
        // Обработка дат
        if (args.start_date) {
            const parsedDate = dbService.parseDate(String(args.start_date));
            if (!parsedDate) {
                return {
                    content: [{
                            type: "text",
                            text: `Неверный формат даты начала: "${args.start_date}". Используйте формат дд.мм.гггг`
                        }]
                };
            }
            input.object_start_date = parsedDate;
        }
        if (args.end_date) {
            const parsedDate = dbService.parseDate(String(args.end_date));
            if (!parsedDate) {
                return {
                    content: [{
                            type: "text",
                            text: `Неверный формат даты окончания: "${args.end_date}". Используйте формат дд.мм.гггг`
                        }]
                };
            }
            input.object_end_date = parsedDate;
        }
        // Проверка корректности диапазона дат
        if (!dbService.validateDateRange(input.object_start_date || null, input.object_end_date || null)) {
            return {
                content: [{
                        type: "text",
                        text: "Дата начала не может быть больше даты окончания"
                    }]
            };
        }
        // Поиск ответственного
        if (args.responsible_name) {
            const users = await dbService.searchUsersByQuery(String(args.responsible_name).trim());
            if (users.length === 0) {
                return {
                    content: [{
                            type: "text",
                            text: `Пользователь с именем "${args.responsible_name}" не найден`
                        }]
                };
            }
            if (users.length > 1) {
                const usersList = users.map(u => `• ${u.full_name.trim() || `${u.first_name} ${u.last_name}`.trim()} (${u.email})`).join('\n');
                return {
                    content: [{
                            type: "text",
                            text: `Найдено несколько пользователей с именем "${args.responsible_name}":\n${usersList}\nУточните имя или используйте email.`
                        }]
                };
            }
            input.object_responsible = users[0].user_id;
        }
        const result = await dbService.createObject(input);
        return {
            content: [{
                    type: "text",
                    text: result.success ?
                        `${result.message}\nОбъект "${objectName}" успешно создан в стадии "${stage.stage_name}" проекта "${project.project_name}"` :
                        `${result.message}`
                }]
        };
    }
    catch (error) {
        return {
            content: [{
                    type: "text",
                    text: `Ошибка создания объекта: ${error}`
                }]
        };
    }
}
// ===== ПОИСК ОБЪЕКТОВ =====
export const searchObjectsTool = {
    name: "search_objects",
    description: "Поиск объектов по названию, проекту и стадии",
    inputSchema: {
        type: "object",
        properties: {
            object_name: {
                type: "string",
                description: "Название объекта (частичное совпадение)"
            },
            stage_name: {
                type: "string",
                description: "Название стадии для фильтрации"
            },
            project_name: {
                type: "string",
                description: "Название проекта для фильтрации"
            },
            responsible_name: {
                type: "string",
                description: "Имя ответственного за объект"
            },
            limit: {
                type: "number",
                description: "Лимит результатов",
                default: 10
            }
        }
    }
};
export async function handleSearchObjects(args) {
    try {
        let projectId = undefined;
        let stageId = undefined;
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
                            text: `Найдено несколько проектов с названием "${args.project_name}". Уточните название.`
                        }]
                };
            }
            projectId = projectResult.project_id;
        }
        // Поиск стадии если указана
        if (args.stage_name) {
            if (!projectId) {
                return {
                    content: [{
                            type: "text",
                            text: "Для поиска по стадии укажите также название проекта"
                        }]
                };
            }
            const stageResult = await dbService.validateUniqueStageByName(String(args.stage_name).trim(), projectId);
            if (stageResult === 'not_found') {
                return {
                    content: [{
                            type: "text",
                            text: `Стадия с названием "${args.stage_name}" не найдена в указанном проекте`
                        }]
                };
            }
            if (stageResult === 'multiple_found') {
                return {
                    content: [{
                            type: "text",
                            text: `В проекте найдено несколько стадий с названием "${args.stage_name}". Уточните название.`
                        }]
                };
            }
            stageId = stageResult.stage_id;
        }
        let objects = [];
        if (args.object_name) {
            // Поиск по названию объекта
            objects = await dbService.searchObjectsByName(String(args.object_name).trim(), stageId);
            // Применяем фильтры
            if (projectId && !stageId) {
                objects = objects.filter(obj => obj.object_project_id === projectId);
            }
        }
        else if (stageId) {
            // Получение всех объектов стадии
            const result = await dbService.listObjects({ stage_id: stageId, limit: args.limit || 10 });
            if (!result.success) {
                return {
                    content: [{
                            type: "text",
                            text: `${result.message}`
                        }]
                };
            }
            objects = result.data || [];
        }
        else if (projectId) {
            // Получение всех объектов проекта
            const result = await dbService.listObjects({ project_id: projectId, limit: args.limit || 10 });
            if (!result.success) {
                return {
                    content: [{
                            type: "text",
                            text: `${result.message}`
                        }]
                };
            }
            objects = result.data || [];
        }
        else {
            return {
                content: [{
                        type: "text",
                        text: "Укажите название объекта, стадии или проекта для поиска"
                    }]
            };
        }
        // Фильтрация по ответственному
        if (args.responsible_name) {
            const users = await dbService.searchUsersByQuery(String(args.responsible_name).trim());
            if (users.length === 0) {
                return {
                    content: [{
                            type: "text",
                            text: `Пользователь с именем "${args.responsible_name}" не найден`
                        }]
                };
            }
            if (users.length > 1) {
                const usersList = users.map(u => `• ${u.full_name.trim() || `${u.first_name} ${u.last_name}`.trim()} (${u.email})`).join('\n');
                return {
                    content: [{
                            type: "text",
                            text: `Найдено несколько пользователей с именем "${args.responsible_name}":\n${usersList}\nУточните имя.`
                        }]
                };
            }
            const userId = users[0].user_id;
            objects = objects.filter(obj => obj.object_responsible === userId);
        }
        if (objects.length === 0) {
            return {
                content: [{
                        type: "text",
                        text: "Объекты не найдены по указанным критериям"
                    }]
            };
        }
        // Получаем названия проектов, стадий и ответственных для вывода
        const objectsWithNames = await Promise.all(objects.map(async (obj) => {
            let projectName = 'Неизвестно';
            let stageName = 'Неизвестно';
            let responsibleName = 'Не назначен';
            // Получаем название проекта
            if (obj.object_project_id) {
                const { data: projectData } = await dbService.listProjects({});
                const foundProject = projectData?.find((proj) => proj.project_id === obj.object_project_id);
                if (foundProject) {
                    projectName = foundProject.project_name;
                }
            }
            // Получаем название стадии
            if (obj.object_stage_id) {
                const { data: stageData } = await dbService.listStages({ project_id: obj.object_project_id });
                const foundStage = stageData?.find((stage) => stage.stage_id === obj.object_stage_id);
                if (foundStage) {
                    stageName = foundStage.stage_name;
                }
            }
            // Получаем имя ответственного
            if (obj.object_responsible) {
                const users = await dbService.searchUsersByQuery('');
                const foundUser = users.find((user) => user.user_id === obj.object_responsible);
                if (foundUser) {
                    responsibleName = foundUser.full_name.trim() || `${foundUser.first_name} ${foundUser.last_name}`.trim();
                }
            }
            return { ...obj, projectName, stageName, responsibleName };
        }));
        const objectsText = objectsWithNames.map((obj, index) => {
            let text = `${index + 1}. **${obj.object_name}**\n`;
            text += `   Проект: ${obj.projectName}\n`;
            text += `   Стадия: ${obj.stageName}\n`;
            text += `   Создан: ${obj.object_created ? new Date(obj.object_created).toLocaleDateString() : 'Неизвестно'}\n`;
            text += `   Ответственный: ${obj.responsibleName}\n`;
            if (obj.object_start_date) {
                text += `   Начало: ${new Date(obj.object_start_date).toLocaleDateString()}\n`;
            }
            if (obj.object_end_date) {
                text += `   Окончание: ${new Date(obj.object_end_date).toLocaleDateString()}\n`;
            }
            if (obj.object_description) {
                text += `   Описание: ${obj.object_description}\n`;
            }
            return text;
        }).join('\n');
        return {
            content: [{
                    type: "text",
                    text: `Найдено объектов: ${objects.length}\n\n${objectsText}`
                }]
        };
    }
    catch (error) {
        return {
            content: [{
                    type: "text",
                    text: `Ошибка поиска объектов: ${error}`
                }]
        };
    }
}
// ===== ОБНОВЛЕНИЕ ОБЪЕКТА =====
export const updateObjectTool = {
    name: "update_object",
    description: "Обновление существующего объекта",
    inputSchema: {
        type: "object",
        properties: {
            current_name: {
                type: "string",
                description: "Текущее название объекта для поиска"
            },
            project_name: {
                type: "string",
                description: "Название проекта, в котором находится объект"
            },
            stage_name: {
                type: "string",
                description: "Название стадии, в которой находится объект (опционально для более точного поиска)"
            },
            new_name: {
                type: "string",
                description: "Новое название объекта (опционально)"
            },
            description: {
                type: "string",
                description: "Новое описание объекта (опционально)"
            },
            new_stage_name: {
                type: "string",
                description: "Новая стадия для объекта (опционально)"
            },
            responsible_name: {
                type: "string",
                description: "Новый ответственный за объект (имя для поиска, опционально)"
            },
            start_date: {
                type: "string",
                description: "Новая дата начала в формате дд.мм.гггг (опционально)"
            },
            end_date: {
                type: "string",
                description: "Новая дата окончания в формате дд.мм.гггг (опционально)"
            }
        },
        required: ["current_name", "project_name"]
    }
};
export async function handleUpdateObject(args) {
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
        // Поиск стадии (если указана)
        let stageId;
        if (args.stage_name) {
            const stage = await dbService.findStageByNameExact(String(args.stage_name).trim(), project.project_id);
            if (!stage) {
                return {
                    content: [{
                            type: "text",
                            text: `Стадия с названием "${args.stage_name}" не найдена в проекте "${projectName}"`
                        }]
                };
            }
            stageId = stage.stage_id;
        }
        // Поиск объекта
        const object = await dbService.findObjectByNameExact(currentName, project.project_id, stageId);
        if (!object) {
            return {
                content: [{
                        type: "text",
                        text: `Объект с названием "${currentName}" не найден в проекте "${projectName}"`
                    }]
            };
        }
        // Подготовка данных для обновления
        const updateData = {
            object_id: object.object_id
        };
        // Обработка нового названия
        if (args.new_name) {
            const newName = String(args.new_name).trim();
            if (newName !== currentName) {
                const uniqueCheck = await dbService.validateUniqueObjectByNameForUpdate(newName, object.object_stage_id, object.object_id);
                if (uniqueCheck === 'duplicate') {
                    return {
                        content: [{
                                type: "text",
                                text: `Объект с названием "${newName}" уже существует в данной стадии`
                            }]
                    };
                }
                updateData.object_name = newName;
            }
        }
        // Обработка описания
        if (args.description !== undefined) {
            updateData.object_description = String(args.description).trim() || undefined;
        }
        // Обработка новой стадии
        if (args.new_stage_name) {
            const newStage = await dbService.findStageByNameExact(String(args.new_stage_name).trim(), project.project_id);
            if (!newStage) {
                return {
                    content: [{
                            type: "text",
                            text: `Стадия с названием "${args.new_stage_name}" не найдена в проекте "${projectName}"`
                        }]
                };
            }
            updateData.object_stage_id = newStage.stage_id;
        }
        // Обработка ответственного
        if (args.responsible_name) {
            const users = await dbService.searchUsersByQuery(String(args.responsible_name).trim());
            if (users.length === 0) {
                return {
                    content: [{
                            type: "text",
                            text: `Пользователь с именем "${args.responsible_name}" не найден`
                        }]
                };
            }
            if (users.length > 1) {
                const usersList = users.map(u => `• ${u.full_name.trim() || `${u.first_name} ${u.last_name}`.trim()} (${u.email})`).join('\n');
                return {
                    content: [{
                            type: "text",
                            text: `Найдено несколько пользователей с именем "${args.responsible_name}":\n${usersList}\nУточните имя.`
                        }]
                };
            }
            updateData.object_responsible = users[0].user_id;
        }
        // Обработка дат
        if (args.start_date) {
            const parsedDate = dbService.parseDate(String(args.start_date));
            if (!parsedDate) {
                return {
                    content: [{
                            type: "text",
                            text: `Неверный формат даты начала: "${args.start_date}". Используйте формат дд.мм.гггг`
                        }]
                };
            }
            updateData.object_start_date = parsedDate;
        }
        if (args.end_date) {
            const parsedDate = dbService.parseDate(String(args.end_date));
            if (!parsedDate) {
                return {
                    content: [{
                            type: "text",
                            text: `Неверный формат даты окончания: "${args.end_date}". Используйте формат дд.мм.гггг`
                        }]
                };
            }
            updateData.object_end_date = parsedDate;
        }
        // Проверка корректности диапазона дат (учитываем и новые и существующие даты)
        const finalStartDate = updateData.object_start_date || object.object_start_date;
        const finalEndDate = updateData.object_end_date || object.object_end_date;
        if (!dbService.validateDateRange(finalStartDate || null, finalEndDate || null)) {
            return {
                content: [{
                        type: "text",
                        text: "Дата начала не может быть больше даты окончания"
                    }]
            };
        }
        // Выполнение обновления
        const result = await dbService.updateObject(updateData);
        if (!result.success) {
            return {
                content: [{
                        type: "text",
                        text: `Ошибка обновления объекта: ${result.message}`
                    }]
            };
        }
        // Формирование ответа о том, что изменилось
        const changes = [];
        if (updateData.object_name)
            changes.push(`Название: "${currentName}" → "${updateData.object_name}"`);
        if (updateData.object_description !== undefined)
            changes.push(`Описание: обновлено`);
        if (updateData.object_stage_id)
            changes.push(`Стадия: изменена`);
        if (updateData.object_responsible)
            changes.push(`Ответственный: обновлен`);
        if (updateData.object_start_date)
            changes.push(`Дата начала: ${dbService.formatDateForDisplay(updateData.object_start_date)}`);
        if (updateData.object_end_date)
            changes.push(`Дата окончания: ${dbService.formatDateForDisplay(updateData.object_end_date)}`);
        return {
            content: [{
                    type: "text",
                    text: `Объект "${currentName}" в проекте "${projectName}" успешно обновлен\n\nИзменения:\n${changes.join('\n')}`
                }]
        };
    }
    catch (error) {
        return {
            content: [{
                    type: "text",
                    text: `Ошибка обновления объекта: ${error}`
                }]
        };
    }
}
// Экспорт всех инструментов объектов
export const objectTools = [
    createObjectTool,
    searchObjectsTool,
    updateObjectTool
];
export const objectHandlers = {
    create_object: handleCreateObject,
    search_objects: handleSearchObjects,
    update_object: handleUpdateObject
};
