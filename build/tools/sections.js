/**
 * Инструменты для работы с разделами
 */
import { DatabaseService } from '../services/database.js';
const dbService = new DatabaseService();
// ===== СОЗДАНИЕ РАЗДЕЛА =====
export const createSectionTool = {
    name: "create_section",
    description: "Создать новый раздел в объекте",
    inputSchema: {
        type: "object",
        properties: {
            section_name: {
                type: "string",
                description: "Название раздела (обязательно)"
            },
            section_description: {
                type: "string",
                description: "Описание раздела"
            },
            object_name: {
                type: "string",
                description: "Название объекта (обязательно)"
            },
            section_type: {
                type: "string",
                description: "Тип раздела (например: архитектура, конструкции, инженерные системы)"
            },
            responsible_name: {
                type: "string",
                description: "Имя ответственного за раздел"
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
        required: ["section_name", "object_name"]
    }
};
export async function handleCreateSection(args) {
    try {
        const sectionName = String(args.section_name).trim();
        const objectName = String(args.object_name).trim();
        // Поиск объекта по названию
        const objectResult = await dbService.validateUniqueObjectByName(objectName);
        if (objectResult === 'not_found') {
            return {
                content: [{
                        type: "text",
                        text: `Объект с названием "${objectName}" не найден`
                    }]
            };
        }
        if (objectResult === 'multiple_found') {
            return {
                content: [{
                        type: "text",
                        text: `Найдено несколько объектов с названием "${objectName}". Уточните название или используйте поиск объектов.`
                    }]
            };
        }
        const objectEntity = objectResult;
        const input = {
            section_name: sectionName,
            section_description: args.section_description ? String(args.section_description).trim() : undefined,
            section_object_id: objectEntity.object_id,
            section_project_id: objectEntity.object_project_id,
            section_type: args.section_type ? String(args.section_type).trim() : undefined
        };
        // Обработка дат
        if (args.start_date) {
            const parsedDate = dbService.parseDate(String(args.start_date).trim());
            if (!parsedDate) {
                return {
                    content: [{
                            type: "text",
                            text: `Неверный формат даты начала: "${args.start_date}". Используйте формат дд.мм.гггг`
                        }]
                };
            }
            input.section_start_date = parsedDate;
        }
        if (args.end_date) {
            const parsedDate = dbService.parseDate(String(args.end_date).trim());
            if (!parsedDate) {
                return {
                    content: [{
                            type: "text",
                            text: `Неверный формат даты окончания: "${args.end_date}". Используйте формат дд.мм.гггг`
                        }]
                };
            }
            input.section_end_date = parsedDate;
        }
        // Проверка корректности диапазона дат
        if (!dbService.validateDateRange(input.section_start_date || null, input.section_end_date || null)) {
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
                const usersList = users.map(u => `• ${u.full_name} (${u.email})`).join('\n');
                return {
                    content: [{
                            type: "text",
                            text: `Найдено несколько пользователей с именем "${args.responsible_name}":\n${usersList}\nУточните имя или используйте email.`
                        }]
                };
            }
            input.section_responsible = users[0].user_id;
        }
        const result = await dbService.createSection(input);
        return {
            content: [{
                    type: "text",
                    text: result.success ?
                        `${result.message}\nРаздел "${sectionName}" успешно создан в объекте "${objectEntity.object_name}"` :
                        `${result.message}`
                }]
        };
    }
    catch (error) {
        return {
            content: [{
                    type: "text",
                    text: `Ошибка создания раздела: ${error}`
                }]
        };
    }
}
// ===== ПОИСК РАЗДЕЛОВ =====
export const searchSectionsTool = {
    name: "search_sections",
    description: "Поиск разделов по названию, объекту и другим критериям",
    inputSchema: {
        type: "object",
        properties: {
            section_name: {
                type: "string",
                description: "Название раздела (частичное совпадение)"
            },
            object_name: {
                type: "string",
                description: "Название объекта для фильтрации"
            },
            project_name: {
                type: "string",
                description: "Название проекта для фильтрации"
            },
            section_type: {
                type: "string",
                description: "Тип раздела"
            },
            responsible_name: {
                type: "string",
                description: "Имя ответственного за раздел"
            },
            limit: {
                type: "number",
                description: "Лимит результатов",
                default: 10
            }
        }
    }
};
export async function handleSearchSections(args) {
    try {
        // Построение фильтров
        const filters = {
            limit: args.limit || 10
        };
        // Основной поиск по названию раздела (частичное совпадение)
        if (args.section_name) {
            filters.section_name = String(args.section_name).trim();
        }
        // Дополнительные фильтры (используются как есть, без валидации)
        if (args.project_name) {
            // Ищем проект по названию и используем его ID как фильтр
            const projects = await dbService.searchProjectsByName(String(args.project_name).trim());
            if (projects.length > 0) {
                filters.project_id = projects[0].project_id;
            }
        }
        if (args.object_name) {
            // Ищем объект по названию и используем его ID как фильтр
            const objects = await dbService.searchObjectsByName(String(args.object_name).trim());
            if (objects.length > 0) {
                filters.object_id = objects[0].object_id;
            }
        }
        if (args.section_type) {
            filters.section_type = String(args.section_type);
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
                            text: `Найдено несколько пользователей с именем "${args.responsible_name}":\n${usersList}\nУточните имя.`
                        }]
                };
            }
            filters.responsible = users[0].user_id;
        }
        const result = await dbService.listSections(filters);
        if (!result.success) {
            return {
                content: [{
                        type: "text",
                        text: `${result.message}`
                    }]
            };
        }
        const sections = result.data || [];
        if (sections.length === 0) {
            return {
                content: [{
                        type: "text",
                        text: "Разделы не найдены по указанным критериям"
                    }]
            };
        }
        // Получаем названия объектов и проектов для вывода
        const sectionsWithNames = await Promise.all(sections.map(async (section) => {
            let objectName = 'Неизвестно';
            let projectName = 'Неизвестно';
            let responsibleName = 'Не назначен';
            // Получаем название объекта
            if (section.section_object_id) {
                const { data: objectData } = await dbService.listObjects({ project_id: section.section_project_id });
                const foundObject = objectData?.find((obj) => obj.object_id === section.section_object_id);
                if (foundObject) {
                    objectName = foundObject.object_name;
                }
            }
            // Получаем название проекта
            if (section.section_project_id) {
                const { data: projectData } = await dbService.listProjects({});
                const foundProject = projectData?.find((proj) => proj.project_id === section.section_project_id);
                if (foundProject) {
                    projectName = foundProject.project_name;
                }
            }
            // Получаем имя ответственного
            if (section.section_responsible) {
                const users = await dbService.searchUsersByQuery('');
                const foundUser = users.find((user) => user.user_id === section.section_responsible);
                if (foundUser) {
                    responsibleName = foundUser.full_name.trim() || `${foundUser.first_name} ${foundUser.last_name}`.trim();
                }
            }
            return { ...section, objectName, projectName, responsibleName };
        }));
        const sectionsText = sectionsWithNames.map((section, index) => {
            let text = `${index + 1}. **${section.section_name}**\n`;
            text += `   Объект: ${section.objectName}\n`;
            text += `   Проект: ${section.projectName}\n`;
            text += `   Создан: ${section.section_created ? new Date(section.section_created).toLocaleDateString() : 'Неизвестно'}\n`;
            if (section.section_type) {
                text += `   Тип: ${section.section_type}\n`;
            }
            text += `   Ответственный: ${section.responsibleName}\n`;
            if (section.section_start_date) {
                text += `   Начало: ${new Date(section.section_start_date).toLocaleDateString()}\n`;
            }
            if (section.section_end_date) {
                text += `   Окончание: ${new Date(section.section_end_date).toLocaleDateString()}\n`;
            }
            if (section.section_description) {
                text += `   Описание: ${section.section_description}\n`;
            }
            return text;
        }).join('\n');
        return {
            content: [{
                    type: "text",
                    text: `Найдено разделов: ${sections.length}\n\n${sectionsText}`
                }]
        };
    }
    catch (error) {
        return {
            content: [{
                    type: "text",
                    text: `Ошибка поиска разделов: ${error}`
                }]
        };
    }
}
// ===== ПОИСК ПОЛЬЗОВАТЕЛЕЙ =====
export const searchUsersTool = {
    name: "search_users",
    description: "Поиск пользователей по имени или email",
    inputSchema: {
        type: "object",
        properties: {
            query: {
                type: "string",
                description: "Поисковый запрос (имя, фамилия или email)"
            },
            limit: {
                type: "number",
                description: "Лимит результатов",
                default: 10
            }
        },
        required: ["query"]
    }
};
export async function handleSearchUsers(args) {
    try {
        const query = String(args.query).trim();
        const users = await dbService.searchUsersByQuery(query);
        if (users.length === 0) {
            return {
                content: [{
                        type: "text",
                        text: `Пользователи не найдены по запросу "${query}"`
                    }]
            };
        }
        // Для каждого пользователя получаем его активные загрузки
        const usersWithWorkloads = await Promise.all(users.map(async (user) => {
            const workloads = await dbService.getUserActiveWorkloads(user.user_id);
            return { ...user, workloads };
        }));
        const usersText = usersWithWorkloads.map((user, index) => {
            let text = `${index + 1}. **${user.full_name.trim() || `${user.first_name} ${user.last_name}`.trim()}**\n`;
            text += `   Email: ${user.email}\n`;
            text += `   Должность: ${user.position_name || 'Не указана'}\n`;
            text += `   Отдел: ${user.department_name || 'Не указан'}\n`;
            text += `   Команда: ${user.team_name || 'Не указана'}\n`;
            text += `   Категория: ${user.category_name || 'Не указана'}\n`;
            text += `   Ставка: ${user.employment_rate || 'Не указана'}\n`;
            if (user.work_format) {
                text += `   Формат работы: ${user.work_format}\n`;
            }
            if (user.workloads && user.workloads.length > 0) {
                text += `   **Активные проекты и разделы:**\n`;
                // Группируем по проектам
                const projectGroups = user.workloads.reduce((groups, workload) => {
                    const projectName = workload.project_name || 'Неизвестный проект';
                    if (!groups[projectName]) {
                        groups[projectName] = [];
                    }
                    groups[projectName].push(workload);
                    return groups;
                }, {});
                Object.entries(projectGroups).forEach(([projectName, workloads]) => {
                    text += `     • **${projectName}**\n`;
                    workloads.forEach((workload) => {
                        if (workload.section_name) {
                            text += `       - ${workload.section_name}`;
                            if (workload.object_name) {
                                text += ` (${workload.object_name})`;
                            }
                            if (workload.loading_rate && workload.loading_rate !== '0') {
                                text += ` - загрузка: ${workload.loading_rate}%`;
                            }
                            text += `\n`;
                        }
                    });
                });
            }
            else {
                text += `   Активных проектов: нет\n`;
            }
            return text;
        }).join('\n');
        return {
            content: [{
                    type: "text",
                    text: `Найдено пользователей: ${users.length}\n\n${usersText}`
                }]
        };
    }
    catch (error) {
        return {
            content: [{
                    type: "text",
                    text: `Ошибка поиска пользователей: ${error}`
                }]
        };
    }
}
// ===== ОБНОВЛЕНИЕ РАЗДЕЛА =====
export const updateSectionTool = {
    name: "update_section",
    description: "Обновление существующего раздела",
    inputSchema: {
        type: "object",
        properties: {
            current_name: {
                type: "string",
                description: "Текущее название раздела для поиска"
            },
            project_name: {
                type: "string",
                description: "Название проекта, в котором находится раздел"
            },
            object_name: {
                type: "string",
                description: "Название объекта, в котором находится раздел (опционально для более точного поиска)"
            },
            new_name: {
                type: "string",
                description: "Новое название раздела (опционально)"
            },
            description: {
                type: "string",
                description: "Новое описание раздела (опционально)"
            },
            responsible_name: {
                type: "string",
                description: "Новый ответственный за раздел (имя для поиска, опционально)"
            },
            type: {
                type: "string",
                description: "Новый тип раздела (опционально)"
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
export async function handleUpdateSection(args) {
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
        // Поиск объекта (если указан)
        let objectId;
        if (args.object_name) {
            const object = await dbService.findObjectByNameExact(String(args.object_name).trim(), project.project_id);
            if (!object) {
                return {
                    content: [{
                            type: "text",
                            text: `Объект с названием "${args.object_name}" не найден в проекте "${projectName}"`
                        }]
                };
            }
            objectId = object.object_id;
        }
        // Поиск раздела
        const section = await dbService.findSectionByNameExact(currentName, project.project_id, objectId);
        if (!section) {
            return {
                content: [{
                        type: "text",
                        text: `Раздел с названием "${currentName}" не найден в проекте "${projectName}"`
                    }]
            };
        }
        // Подготовка данных для обновления
        const updateData = {
            section_id: section.section_id
        };
        // Обработка нового названия
        if (args.new_name) {
            const newName = String(args.new_name).trim();
            if (newName !== currentName) {
                const uniqueCheck = await dbService.validateUniqueSectionByNameForUpdate(newName, section.section_object_id, section.section_id);
                if (uniqueCheck === 'duplicate') {
                    return {
                        content: [{
                                type: "text",
                                text: `Раздел с названием "${newName}" уже существует в данном объекте`
                            }]
                    };
                }
                updateData.section_name = newName;
            }
        }
        // Обработка описания
        if (args.description !== undefined) {
            updateData.section_description = String(args.description).trim() || undefined;
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
            updateData.section_responsible = users[0].user_id;
        }
        // Обработка типа
        if (args.type !== undefined) {
            updateData.section_type = String(args.type).trim() || undefined;
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
            updateData.section_start_date = parsedDate;
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
            updateData.section_end_date = parsedDate;
        }
        // Проверка корректности диапазона дат (учитываем и новые и существующие даты)  
        const finalStartDate = updateData.section_start_date || section.section_start_date;
        const finalEndDate = updateData.section_end_date || section.section_end_date;
        if (!dbService.validateDateRange(finalStartDate || null, finalEndDate || null)) {
            return {
                content: [{
                        type: "text",
                        text: "Дата начала не может быть больше даты окончания"
                    }]
            };
        }
        // Выполнение обновления
        const result = await dbService.updateSection(updateData);
        if (!result.success) {
            return {
                content: [{
                        type: "text",
                        text: `Ошибка обновления раздела: ${result.message}`
                    }]
            };
        }
        // Формирование ответа о том, что изменилось
        const changes = [];
        if (updateData.section_name)
            changes.push(`Название: "${currentName}" → "${updateData.section_name}"`);
        if (updateData.section_description !== undefined)
            changes.push(`Описание: обновлено`);
        if (updateData.section_responsible)
            changes.push(`Ответственный: обновлен`);
        if (updateData.section_type !== undefined)
            changes.push(`Тип: ${updateData.section_type || 'не указан'}`);
        if (updateData.section_start_date)
            changes.push(`Дата начала: ${dbService.formatDateForDisplay(updateData.section_start_date)}`);
        if (updateData.section_end_date)
            changes.push(`Дата окончания: ${dbService.formatDateForDisplay(updateData.section_end_date)}`);
        return {
            content: [{
                    type: "text",
                    text: `Раздел "${currentName}" в проекте "${projectName}" успешно обновлен\n\nИзменения:\n${changes.join('\n')}`
                }]
        };
    }
    catch (error) {
        return {
            content: [{
                    type: "text",
                    text: `Ошибка обновления раздела: ${error}`
                }]
        };
    }
}
// Экспорт всех инструментов разделов
export const sectionTools = [
    createSectionTool,
    searchSectionsTool,
    searchUsersTool,
    updateSectionTool
];
export const sectionHandlers = {
    create_section: handleCreateSection,
    search_sections: handleSearchSections,
    search_users: handleSearchUsers,
    update_section: handleUpdateSection
};
