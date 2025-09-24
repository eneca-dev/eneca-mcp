/**
 * Глобальные инструменты поиска
 */
import { DatabaseService } from '../services/database.js';

const dbService = new DatabaseService();

// ===== ГЛОБАЛЬНЫЙ ПОИСК СОТРУДНИКОВ =====
export const searchEmployeeFullInfoTool = {
    name: "search_employee_full_info",
    description: "Полный поиск сотрудника с детальной информацией о проектах, разделах и загрузке",
    inputSchema: {
        type: "object",
        properties: {
            query: {
                type: "string",
                description: "Поисковый запрос (имя, фамилия или email сотрудника)"
            },
            include_inactive: {
                type: "boolean",
                description: "Включать неактивных сотрудников",
                default: false
            }
        },
        required: ["query"]
    }
};

export async function handleSearchEmployeeFullInfo(args) {
    try {
        const query = String(args.query).trim();
        const includeInactive = args.include_inactive || false;
        
        // Поиск сотрудников
        const users = await dbService.searchUsersByQuery(query);
        
        if (users.length === 0) {
            return {
                content: [{
                    type: "text",
                    text: `Сотрудники не найдены по запросу "${query}"`
                }]
            };
        }

        // Если найдено несколько, показываем список для выбора
        if (users.length > 1) {
            const usersList = users.map((user, index) => 
                `${index + 1}. **${user.full_name?.trim() || `${user.first_name} ${user.last_name}`.trim()}** (${user.email})`
            ).join('\n');
            
            return {
                content: [{
                    type: "text",
                    text: `Найдено несколько сотрудников по запросу "${query}":\n\n${usersList}\n\nУточните запрос для получения детальной информации.`
                }]
            };
        }

        const user = users[0];
        
        // Получаем полную информацию о сотруднике
        const [workloads, projectsAsManager, projectsAsLeadEngineer] = await Promise.all([
            dbService.getUserActiveWorkloads(user.user_id),
            dbService.getProjectsByManager(user.user_id),
            dbService.getProjectsByLeadEngineer(user.user_id)
        ]);

        // Формируем детальный отчет
        let report = `# 👤 **${user.full_name?.trim() || `${user.first_name} ${user.last_name}`.trim()}**\n\n`;
        
        // Основная информация
        report += `## 📋 Основная информация\n`;
        report += `• **Email:** ${user.email}\n`;
        report += `• **Должность:** ${user.position_name || 'Не указана'}\n`;
        report += `• **Отдел:** ${user.department_name || 'Не указан'}\n`;
        report += `• **Команда:** ${user.team_name || 'Не указана'}\n`;
        report += `• **Категория:** ${user.category_name || 'Не указана'}\n`;
        report += `• **Ставка:** ${user.employment_rate || 'Не указана'}\n`;
        if (user.work_format) {
            report += `• **Формат работы:** ${user.work_format}\n`;
        }
        report += `\n`;

        // Проекты как менеджер
        if (projectsAsManager && projectsAsManager.length > 0) {
            report += `## 🎯 Проекты как менеджер (${projectsAsManager.length})\n`;
            projectsAsManager.forEach((project, index) => {
                report += `${index + 1}. **${project.project_name}**\n`;
                report += `   Статус: ${dbService.getDisplayStatus(project.project_status || 'active')}\n`;
                if (project.project_description) {
                    report += `   Описание: ${project.project_description}\n`;
                }
                report += `\n`;
            });
        }

        // Проекты как главный инженер
        if (projectsAsLeadEngineer && projectsAsLeadEngineer.length > 0) {
            report += `## 🔧 Проекты как главный инженер (${projectsAsLeadEngineer.length})\n`;
            projectsAsLeadEngineer.forEach((project, index) => {
                report += `${index + 1}. **${project.project_name}**\n`;
                report += `   Статус: ${dbService.getDisplayStatus(project.project_status || 'active')}\n`;
                if (project.project_description) {
                    report += `   Описание: ${project.project_description}\n`;
                }
                report += `\n`;
            });
        }

        // Активные задачи и загрузка
        if (workloads && workloads.length > 0) {
            report += `## 📊 Активные задачи и загрузка (${workloads.length})\n`;
            
            // Группируем по проектам
            const projectGroups = workloads.reduce((groups, workload) => {
                const projectName = workload.project_name || 'Неизвестный проект';
                if (!groups[projectName]) {
                    groups[projectName] = [];
                }
                groups[projectName].push(workload);
                return groups;
            }, {});

            Object.entries(projectGroups).forEach(([projectName, projectWorkloads]) => {
                report += `### 🎯 **${projectName}**\n`;
                
                // Группируем по объектам
                const objectGroups = projectWorkloads.reduce((groups, workload) => {
                    const objectName = workload.object_name || 'Неизвестный объект';
                    if (!groups[objectName]) {
                        groups[objectName] = [];
                    }
                    groups[objectName].push(workload);
                    return groups;
                }, {});

                Object.entries(objectGroups).forEach(([objectName, objectWorkloads]) => {
                    report += `#### 📦 ${objectName}\n`;
                    objectWorkloads.forEach((workload) => {
                        if (workload.section_name) {
                            report += `• **${workload.section_name}**`;
                            if (workload.loading_rate && workload.loading_rate !== '0') {
                                report += ` - загрузка: ${workload.loading_rate}%`;
                            }
                            if (workload.section_type) {
                                report += ` (${workload.section_type})`;
                            }
                            report += `\n`;
                            // Дедлайны по разделу
                            if (workload.section_end_date) {
                                report += `   Дедлайн раздела: ${new Date(workload.section_end_date).toLocaleDateString()}\n`;
                            }
                            // Декомпозиция: загрузки с дедлайнами (если доступны поля во view)
                            const decompDeadline = workload.loading_deadline || workload.loading_end_date || workload.due_date || workload.decomposition_deadline;
                            if (decompDeadline) {
                                const decompName = workload.loading_name || workload.decomposition_name || workload.task_name || null;
                                report += `   Декомпозиция${decompName ? ` (${decompName})` : ''}: дедлайн ${new Date(decompDeadline).toLocaleDateString()}\n`;
                            }
                        }
                    });
                });
                report += `\n`;
            });
        } else {
            report += `## 📊 Активные задачи\n`;
            report += `Нет активных задач\n\n`;
        }

        // Статистика
        const totalProjects = (projectsAsManager?.length || 0) + (projectsAsLeadEngineer?.length || 0);
        const totalSections = workloads?.length || 0;
        
        report += `## 📈 Статистика\n`;
        report += `• **Всего проектов:** ${totalProjects}\n`;
        report += `• **Активных разделов:** ${totalSections}\n`;
        report += `• **Общая загрузка:** ${workloads?.reduce((sum, w) => sum + (parseFloat(w.loading_rate) || 0), 0).toFixed(1)}%\n`;

        return {
            content: [{
                type: "text",
                text: report
            }]
        };
    } catch (error) {
        return {
            content: [{
                type: "text",
                text: `Ошибка поиска сотрудника: ${error}`
            }]
        };
    }
}

// ===== ПОИСК ПО ОТВЕТСТВЕННОМУ =====
export const searchByResponsibleTool = {
    name: "search_by_responsible",
    description: "Поиск всех задач (объектов и разделов) по ответственному сотруднику",
    inputSchema: {
        type: "object",
        properties: {
            responsible_name: {
                type: "string",
                description: "Имя ответственного сотрудника"
            },
            project_name: {
                type: "string",
                description: "Фильтр по названию проекта (опционально)"
            },
            limit: {
                type: "number",
                description: "Лимит результатов",
                default: 20
            }
        },
        required: ["responsible_name"]
    }
};

export async function handleSearchByResponsible(args) {
    try {
        const responsibleName = String(args.responsible_name).trim();
        const projectName = args.project_name ? String(args.project_name).trim() : null;
        const limit = args.limit || 20;

        // Поиск пользователя
        const users = await dbService.searchUsersByQuery(responsibleName);
        if (users.length === 0) {
            return {
                content: [{
                    type: "text",
                    text: `Сотрудник с именем "${responsibleName}" не найден`
                }]
            };
        }

        if (users.length > 1) {
            const usersList = users.map(u => `• ${u.full_name?.trim() || `${u.first_name} ${u.last_name}`.trim()} (${u.email})`).join('\n');
            return {
                content: [{
                    type: "text",
                    text: `Найдено несколько сотрудников с именем "${responsibleName}":\n${usersList}\nУточните имя.`
                }]
            };
        }

        const user = users[0];
        
        // Получаем все задачи сотрудника
        const [objects, sections] = await Promise.all([
            dbService.getObjectsByResponsible(user.user_id, projectName, limit),
            dbService.getSectionsByResponsible(user.user_id, projectName, limit)
        ]);

        let report = `# 📋 Задачи сотрудника: **${user.full_name?.trim() || `${user.first_name} ${user.last_name}`.trim()}**\n\n`;

        if (objects.length > 0) {
            report += `## 📦 Объекты (${objects.length})\n`;
            objects.forEach((obj, index) => {
                report += `${index + 1}. **${obj.object_name}**\n`;
                report += `   Проект: ${obj.project_name}\n`;
                report += `   Стадия: ${obj.stage_name}\n`;
                if (obj.object_description) {
                    report += `   Описание: ${obj.object_description}\n`;
                }
                if (obj.object_start_date) {
                    report += `   Начало: ${new Date(obj.object_start_date).toLocaleDateString()}\n`;
                }
                if (obj.object_end_date) {
                    report += `   Окончание: ${new Date(obj.object_end_date).toLocaleDateString()}\n`;
                }
                report += `\n`;
            });
        }

        if (sections.length > 0) {
            report += `## 📄 Разделы (${sections.length})\n`;
            sections.forEach((section, index) => {
                report += `${index + 1}. **${section.section_name}**\n`;
                report += `   Проект: ${section.project_name}\n`;
                report += `   Объект: ${section.object_name}\n`;
                if (section.section_type) {
                    report += `   Тип: ${section.section_type}\n`;
                }
                if (section.section_description) {
                    report += `   Описание: ${section.section_description}\n`;
                }
                if (section.section_start_date) {
                    report += `   Начало: ${new Date(section.section_start_date).toLocaleDateString()}\n`;
                }
                if (section.section_end_date) {
                    report += `   Окончание: ${new Date(section.section_end_date).toLocaleDateString()}\n`;
                }
                report += `\n`;
            });
        }

        if (objects.length === 0 && sections.length === 0) {
            report += `Нет активных задач у данного сотрудника.\n`;
        }

        return {
            content: [{
                type: "text",
                text: report
            }]
        };
    } catch (error) {
        return {
            content: [{
                type: "text",
                text: `Ошибка поиска по ответственному: ${error}`
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
            let text = `${index + 1}. **${user.full_name?.trim() || `${user.first_name} ${user.last_name}`.trim()}**\n`;
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
            } else {
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
    } catch (error) {
        return {
            content: [{
                type: "text",
                text: `Ошибка поиска пользователей: ${error}`
            }]
        };
    }
}

// ===== ЗАГРУЗКА СОТРУДНИКА =====
export const getEmployeeWorkloadTool = {
    name: "get_employee_workload",
    description: "Получить детальную загрузку сотрудника по проектам и задачам",
    inputSchema: {
        type: "object",
        properties: {
            employee_name: {
                type: "string",
                description: "Имя сотрудника для поиска"
            },
            project_name: {
                type: "string",
                description: "Фильтр по названию проекта (опционально)"
            },
            include_completed: {
                type: "boolean",
                description: "Включать завершенные задачи",
                default: false
            }
        },
        required: ["employee_name"]
    }
};

export async function handleGetEmployeeWorkload(args) {
    try {
        const employeeName = String(args.employee_name).trim();
        const projectName = args.project_name ? String(args.project_name).trim() : null;
        const includeCompleted = args.include_completed || false;

        // Поиск сотрудника
        const users = await dbService.searchUsersByQuery(employeeName);
        if (users.length === 0) {
            return {
                content: [{
                    type: "text",
                    text: `Сотрудник с именем "${employeeName}" не найден`
                }]
            };
        }

        if (users.length > 1) {
            const usersList = users.map(u => `• ${u.full_name?.trim() || `${u.first_name} ${u.last_name}`.trim()} (${u.email})`).join('\n');
            return {
                content: [{
                    type: "text",
                    text: `Найдено несколько сотрудников с именем "${employeeName}":\n${usersList}\nУточните имя.`
                }]
            };
        }

        const user = users[0];
        
        // Получаем детальную загрузку
        const workloadData = await dbService.getEmployeeDetailedWorkload(user.user_id, projectName, includeCompleted);
        
        let report = `# 📊 Загрузка сотрудника: **${user.full_name?.trim() || `${user.first_name} ${user.last_name}`.trim()}**\n\n`;
        
        // Основная информация
        report += `## 👤 Информация о сотруднике\n`;
        report += `• **Email:** ${user.email}\n`;
        report += `• **Должность:** ${user.position_name || 'Не указана'}\n`;
        report += `• **Отдел:** ${user.department_name || 'Не указан'}\n`;
        report += `• **Команда:** ${user.team_name || 'Не указана'}\n`;
        report += `• **Ставка:** ${user.employment_rate || 'Не указана'}\n\n`;

        if (workloadData.projects.length === 0) {
            report += `## 📋 Активные проекты\n`;
            report += `Нет активных проектов.\n`;
            return {
                content: [{
                    type: "text",
                    text: report
                }]
            };
        }

        // Статистика
        const totalSections = workloadData.projects.reduce((sum, p) => sum + p.sections.length, 0);
        const totalWorkload = workloadData.projects.reduce((sum, p) => 
            sum + p.sections.reduce((sSum, s) => sSum + (parseFloat(s.loading_rate) || 0), 0), 0
        );

        report += `## 📈 Общая статистика\n`;
        report += `• **Активных проектов:** ${workloadData.projects.length}\n`;
        report += `• **Всего разделов:** ${totalSections}\n`;
        report += `• **Общая загрузка:** ${totalWorkload.toFixed(1)}%\n\n`;

        // Детализация по проектам
        report += `## 🎯 Детализация по проектам\n\n`;
        
        workloadData.projects.forEach((project, index) => {
            report += `### ${index + 1}. **${project.project_name}**\n`;
            report += `• Статус: ${dbService.getDisplayStatus(project.project_status || 'active')}\n`;
            
            if (project.sections.length === 0) {
                report += `• Активных разделов: нет\n\n`;
                return;
            }

            report += `• Активных разделов: ${project.sections.length}\n`;
            report += `• Загрузка по проекту: ${project.sections.reduce((sum, s) => sum + (parseFloat(s.loading_rate) || 0), 0).toFixed(1)}%\n\n`;

            // Группируем по объектам
            const objectGroups = project.sections.reduce((groups, section) => {
                const objectName = section.object_name || 'Неизвестный объект';
                if (!groups[objectName]) {
                    groups[objectName] = [];
                }
                groups[objectName].push(section);
                return groups;
            }, {});

            Object.entries(objectGroups).forEach(([objectName, sections]) => {
                report += `#### 📦 ${objectName}\n`;
                sections.forEach(section => {
                    report += `• **${section.section_name}**`;
                    if (section.section_type) {
                        report += ` (${section.section_type})`;
                    }
                    if (section.loading_rate && section.loading_rate !== '0') {
                        report += ` - загрузка: ${section.loading_rate}%`;
                    }
                    if (section.section_start_date) {
                        report += `\n  Начало: ${new Date(section.section_start_date).toLocaleDateString()}`;
                    }
                    if (section.section_end_date) {
                        report += `\n  Окончание: ${new Date(section.section_end_date).toLocaleDateString()}`;
                    }
                    report += `\n`;
                });
            });
            report += `\n`;
        });

        return {
            content: [{
                type: "text",
                text: report
            }]
        };
    } catch (error) {
        return {
            content: [{
                type: "text",
                text: `Ошибка получения загрузки сотрудника: ${error}`
            }]
        };
    }
}

// ===== КОМАНДА ПРОЕКТА =====
export const getProjectTeamTool = {
    name: "get_project_team",
    description: "Получить команду проекта со всеми участниками",
    inputSchema: {
        type: "object",
        properties: {
            project_name: {
                type: "string",
                description: "Название проекта"
            }
        },
        required: ["project_name"]
    }
};

export async function handleGetProjectTeam(args) {
    try {
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

        // Получаем команду проекта
        const teamMembers = await dbService.getProjectTeam(project.project_id);
        
        let report = `# 👥 Команда проекта: **${project.project_name}**\n\n`;
        
        if (teamMembers.length === 0) {
            report += `Команда проекта не определена.\n`;
            return {
                content: [{
                    type: "text",
                    text: report
                }]
            };
        }

        // Группируем по ролям
        const roles = {
            manager: [],
            leadEngineer: [],
            responsible: []
        };

        teamMembers.forEach(member => {
            if (member.role === 'manager') {
                roles.manager.push(member);
            } else if (member.role === 'lead_engineer') {
                roles.leadEngineer.push(member);
            } else if (member.role === 'responsible') {
                roles.responsible.push(member);
            }
        });

        if (roles.manager.length > 0) {
            report += `## 🎯 Менеджеры проекта\n`;
            roles.manager.forEach(member => {
                report += `• **${member.full_name || `${member.first_name} ${member.last_name}`}** (${member.email})\n`;
                if (member.position_name) {
                    report += `  Должность: ${member.position_name}\n`;
                }
            });
            report += `\n`;
        }

        if (roles.leadEngineer.length > 0) {
            report += `## 🔧 Главные инженеры\n`;
            roles.leadEngineer.forEach(member => {
                report += `• **${member.full_name || `${member.first_name} ${member.last_name}`}** (${member.email})\n`;
                if (member.position_name) {
                    report += `  Должность: ${member.position_name}\n`;
                }
            });
            report += `\n`;
        }

        if (roles.responsible.length > 0) {
            report += `## 👷 Ответственные исполнители (${roles.responsible.length})\n`;
            
            // Группируем по отделам
            const byDepartment = roles.responsible.reduce((groups, member) => {
                const dept = member.department_name || 'Не указан';
                if (!groups[dept]) groups[dept] = [];
                groups[dept].push(member);
                return groups;
            }, {});

            Object.entries(byDepartment).forEach(([department, members]) => {
                report += `### ${department}\n`;
                members.forEach(member => {
                    report += `• **${member.full_name || `${member.first_name} ${member.last_name}`}** (${member.email})\n`;
                    if (member.position_name) {
                        report += `  Должность: ${member.position_name}\n`;
                    }
                    if (member.task_count > 0) {
                        report += `  Задач: ${member.task_count}\n`;
                    }
                });
            });
        }

        return {
            content: [{
                type: "text",
                text: report
            }]
        };
    } catch (error) {
        return {
            content: [{
                type: "text",
                text: `Ошибка получения команды проекта: ${error}`
            }]
        };
    }
}

// Экспорт всех глобальных инструментов
// Экспорт списков перенесен в конец файла, после объявлений всех инструментов

// ===== РАЗДЕЛЫ ПО МЕНЕДЖЕРУ И ПРОЕКТУ =====
export const getProjectSectionsByManagerNameTool = {
    name: "get_project_sections_by_manager_name",
    description: "По названию проекта возвращает объекты {section_id, section_responsible_email} (из view_project_tree)",
    inputSchema: {
        type: "object",
        properties: {
            project_name: {
                type: "string",
                description: "Название проекта (точное совпадение)"
            }
        },
        required: ["project_name"]
    }
};

export async function handleGetProjectSectionsByManagerName(args) {
    try {
        const projectName = String(args.project_name || '').trim();

        if (!projectName) {
            return { content: [{ type: "text", text: "Нужно указать project_name" }] };
        }

        const rows = await dbService.getProjectSectionsByProjectName(projectName);

        if (!rows || rows.length === 0) {
            return { content: [{ type: "text", text: `Данные не найдены для проекта "${projectName}"` }] };
        }

        // Возвращаем массив объектов (каждый раздел отдельным элементом)
        const items = rows.map(row => ({
            type: "object",
            data: {
                section_id: row.section_id || null,
                section_name: row.section_name || null,
                section_responsible_email: row.section_responsible_email || null
            }
        }));

        return { content: items };
    } catch (error) {
        return { content: [{ type: "text", text: `Ошибка получения разделов по менеджеру: ${error}` }] };
    }
}

// ===== СОЗДАНИЕ ЗАМЕТКИ (NOTION) =====
export const createNotionTool = {
    name: "create_notion",
    description: "Создает заметку в таблице notions (notion_created_by: uuid, notion_content: text)",
    inputSchema: {
        type: "object",
        properties: {
            notion_created_by: {
                type: "string",
                description: "UUID пользователя, создавшего заметку"
            },
            notion_content: {
                type: "string",
                description: "Текст заметки (output модели)"
            }
        },
        required: ["notion_created_by", "notion_content"]
    }
};

export async function handleCreateNotion(args) {
    try {
        const notionCreatedBy = String(args.notion_created_by || '').trim();
        const notionContent = String(args.notion_content || '').trim();

        const result = await dbService.createNotion(notionCreatedBy, notionContent);
        if (!result.success) {
            return { content: [{ type: "text", text: result.message }] };
        }
        const row = result.data;
        let text = `✅ Заметка создана (ID: ${row?.notion_id || '—'})\n`;
        text += `Автор: ${row?.notion_created_by || notionCreatedBy}\n`;
        return { content: [{ type: "text", text }] };
    } catch (error) {
        return { content: [{ type: "text", text: `Ошибка создания заметки: ${error}` }] };
    }
}

// ===== Итоговый экспорт всех глобальных инструментов и обработчиков =====
export const globalSearchTools = [
    searchEmployeeFullInfoTool,
    searchByResponsibleTool,
    searchUsersTool,
    getEmployeeWorkloadTool,
    getProjectTeamTool,
    getProjectSectionsByManagerNameTool,
    createNotionTool
];

export const globalSearchHandlers = {
    search_employee_full_info: handleSearchEmployeeFullInfo,
    search_by_responsible: handleSearchByResponsible,
    search_users: handleSearchUsers,
    get_employee_workload: handleGetEmployeeWorkload,
    get_project_team: handleGetProjectTeam,
    get_project_sections_by_manager_name: handleGetProjectSectionsByManagerName,
    create_notion: handleCreateNotion
};

