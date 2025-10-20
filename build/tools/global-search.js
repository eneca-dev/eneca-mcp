/**
 * Глобальные инструменты поиска
 */
import { DatabaseService } from '../services/database.js';

const dbService = new DatabaseService();

// ===== ГЛОБАЛЬНЫЙ ПОИСК СОТРУДНИКОВ =====
export const searchEmployeeFullInfoTool = {
    name: "search_employee_full_info",
    description: `Полный поиск сотрудника с детальной информацией для формирования плана на день. Включает:
    - Основную информацию (должность, отдел, команда)
    - Проекты (как менеджер и главный инженер)
    - Активные задачи и загрузку по разделам
    - События календаря (отпуска, больничные, отгулы)
    - Задания от других разделов
    - Разделы со статусом "в работе" и их соответствие загрузке (кейс 3)
    - Разделы с приближающимися дедлайнами (кейс 4)
    - Задачи декомпозиции без сроков или с приближающимися сроками <= 3 дней (кейс 5)
    - Задания (assignments) с устаревшим статусом (не обновлялись 3+ дня) (кейс 7)
    - Разделы с критической задержкой (кейс 8)
    - Разделы без комментариев от сотрудника (кейс 9)
    - Новые задания в разделах со статусами "Передано/Принято/Выполнено" (последние 3 дня) (кейс 10)
    - Непрочитанные уведомления и объявления (кейс 11)

    Используйте этот инструмент для анализа рабочей нагрузки и формирования задач на день.`,
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
        
        // Получаем полную информацию о сотруднике, включая данные для плана на день
        const [
            workloads,
            projectsAsManager,
            projectsAsLeadEngineer,
            calendarEvents,
            assignments,
            // Новые данные для кейсов плана на день
            sectionsInProgress,
            upcomingDeadlines,
            decompositionTasks,
            unreadNotifications,
            staleSections,
            criticalDelaySections,
            sectionsWithoutComments,
            sectionsWithNewTasks
        ] = await Promise.all([
            dbService.getUserActiveWorkloads(user.user_id),
            dbService.getProjectsByManager(user.user_id),
            dbService.getProjectsByLeadEngineer(user.user_id),
            // события календаря: личные или глобальные
            dbService.getUserCalendarEvents(user.user_id, null, null, 50),
            // задания, переданные в разделы, где сотрудник ответственный
            dbService.getAssignmentsForResponsibleSections(user.user_id, 100),
            // Кейс 3: Разделы в работе
            dbService.getUserSectionsInProgress(user.user_id, 50),
            // Кейс 4: Разделы с приближающимися дедлайнами (7 дней)
            dbService.getUserSectionsWithUpcomingDeadlines(user.user_id, 7, 50),
            // Кейс 5: Задачи декомпозиции без сроков или с приближающимися сроками (3 дня)
            dbService.getUserDecompositionTasks(user.user_id, 100),
            // Кейс 11: Непрочитанные уведомления
            dbService.getUserUnreadNotifications(user.user_id, 50),
            // Кейс 7: Разделы с устаревшим статусом (3+ дня)
            dbService.getUserSectionsWithStaleStatus(user.user_id, 3, 50),
            // Кейс 8: Разделы с критической задержкой
            dbService.getUserSectionsWithCriticalDelay(user.user_id, 50),
            // Кейс 9: Разделы без комментариев от сотрудника
            dbService.getUserSectionsWithoutComments(user.user_id, 50),
            // Кейс 10: Новые задания в разделах сотрудника (последние 3 дня, статусы: Передано/Принято/Выполнено)
            dbService.getUserSectionsWithNewTasks(user.user_id, 3, 50)
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
                                const loadingRate = parseFloat(workload.loading_rate);
                                const hours = loadingRate * 8;
                                const stavkaWord = loadingRate === 1 ? 'ставка' : 'ставок';
                                report += ` - загрузка: ${workload.loading_rate} ${stavkaWord} (${hours} часов)`;
                            }
                            if (workload.section_type) {
                                report += ` (${workload.section_type})`;
                            }
                            report += `\n`;

                            // Дедлайн загрузки (loading_finish)
                            if (workload.loading_finish) {
                                report += `   Дедлайн загрузки: ${new Date(workload.loading_finish).toLocaleDateString()}`;
                                if (workload.loading_start) {
                                    report += ` (период: ${new Date(workload.loading_start).toLocaleDateString()} - ${new Date(workload.loading_finish).toLocaleDateString()})`;
                                }
                                report += `\n`;
                            }

                            // Дедлайн раздела (если отличается от загрузки)
                            if (workload.section_end_date) {
                                report += `   Дедлайн раздела: ${new Date(workload.section_end_date).toLocaleDateString()}\n`;
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

        // События календаря (личные и глобальные)
        if (calendarEvents && calendarEvents.length > 0) {
            report += `## 🗓️ События календаря (${calendarEvents.length})\n`;
            calendarEvents.forEach((ev, index) => {
                const start = ev.calendar_event_date_start ? new Date(ev.calendar_event_date_start).toLocaleString() : '—';
                const end = ev.calendar_event_date_end ? new Date(ev.calendar_event_date_end).toLocaleString() : null;
                report += `${index + 1}. ${ev.calendar_event_type}`;
                if (ev.calendar_event_is_global) {
                    report += ` (глобальное)`;
                }
                if (ev.calendar_event_comment) {
                    report += ` — ${ev.calendar_event_comment}`;
                }
                report += `\n   Начало: ${start}`;
                if (end) {
                    report += `\n   Окончание: ${end}`;
                }
                report += `\n`;
            });
            report += `\n`;
        }

        // Задания, переданные в разделы, где сотрудник ответственный
        if (assignments && assignments.length > 0) {
            report += `## ✅ Задания по разделам (где сотрудник ответственный) (${assignments.length})\n`;
            assignments.forEach((a, index) => {
                const due = a.due_date ? new Date(a.due_date).toLocaleDateString() : '—';
                const status = a.status || '—';
                const sectionName = a.section?.section_name || '—';
                const objectName = a.section?.object_name || null;
                const projectName = a.section?.project_name || '—';
                report += `${index + 1}. ${a.title || 'Задание'}\n`;
                report += `   Статус: ${status}\n`;
                report += `   Дедлайн: ${due}\n`;
                report += `   Проект: ${projectName}\n`;
                if (objectName) {
                    report += `   Объект: ${objectName}\n`;
                }
                if (sectionName) {
                    report += `   Раздел: ${sectionName}\n`;
                }
                if (a.link) {
                    report += `   Ссылка: ${a.link}\n`;
                }
                if (a.description) {
                    report += `   Описание: ${a.description}\n`;
                }
                report += `\n`;
            });
        }


        // Разделы в работе (Кейс 3)
        if (sectionsInProgress && sectionsInProgress.length > 0) {
            report += `## 🔄 Разделы в работе (${sectionsInProgress.length})\n`;
            const totalLoading = workloads?.reduce((sum, w) => sum + (parseFloat(w.loading_rate) || 0), 0) || 0;
            const totalHours = Math.round(totalLoading * 8);
            report += `Общая загрузка: ${totalLoading.toFixed(1)} ставок (${totalHours} ч)\n\n`;
            
            sectionsInProgress.slice(0, 10).forEach((section, index) => {
                report += `${index + 1}. **${section.section_name}** (${section.project_name})\n`;
                if (section.object_name) {
                    report += `   Объект: ${section.object_name}\n`;
                }
                if (section.section_end_date) {
                    report += `   Дедлайн: ${new Date(section.section_end_date).toLocaleDateString()}\n`;
                }
                if (section.last_status_updated) {
                    const daysAgo = Math.floor((new Date() - new Date(section.last_status_updated)) / (1000 * 60 * 60 * 24));
                    report += `   Статус обновлен ${daysAgo} дн. назад\n`;
                }
                report += `\n`;
            });
            if (sectionsInProgress.length > 10) {
                report += `... и ещё ${sectionsInProgress.length - 10} разделов\n`;
            }
            report += `\n`;
        }

        // Приближающиеся дедлайны (Кейс 4)
        if (upcomingDeadlines && upcomingDeadlines.length > 0) {
            report += `## ⏰ Приближающиеся дедлайны (${upcomingDeadlines.length})\n`;
            upcomingDeadlines.forEach((section, index) => {
                report += `${index + 1}. **${section.section_name}** (${section.project_name})\n`;
                if (section.object_name) {
                    report += `   Объект: ${section.object_name}\n`;
                }
                report += `   Дедлайн: ${new Date(section.section_end_date).toLocaleDateString()} (${section.days_until_deadline} дн.)\n`;
                if (section.status_name) {
                    report += `   Статус: ${section.status_name}\n`;
                }
                report += `\n`;
            });
            report += `\n`;
        }

        // Задачи декомпозиции (Кейс 5)
        if (decompositionTasks && decompositionTasks.length > 0) {
            report += `## 📋 Задачи декомпозиции (${decompositionTasks.length})\n`;
            
            // Задачи без дедлайнов
            const tasksWithoutDeadline = decompositionTasks.filter(t => t.has_no_deadline);
            if (tasksWithoutDeadline.length > 0) {
                report += `### ⚠️ Без установленных сроков (${tasksWithoutDeadline.length})\n`;
                tasksWithoutDeadline.slice(0, 5).forEach((task, index) => {
                    report += `${index + 1}. ${task.task_description}\n`;
                    report += `   Раздел: ${task.section_name} (${task.project_name})\n`;
                    if (task.planned_hours) {
                        report += `   Планируемые часы: ${task.planned_hours}\n`;
                    }
                    if (task.progress) {
                        report += `   Прогресс: ${task.progress}%\n`;
                    }
                    report += `\n`;
                });
                if (tasksWithoutDeadline.length > 5) {
                    report += `... и ещё ${tasksWithoutDeadline.length - 5} задач\n`;
                }
            }
            
            // Задачи с приближающимися сроками
            const tasksWithUpcomingDeadline = decompositionTasks.filter(t => !t.has_no_deadline && t.days_until_deadline !== null && t.days_until_deadline <= 7);
            if (tasksWithUpcomingDeadline.length > 0) {
                report += `### 🔥 С приближающимися сроками (${tasksWithUpcomingDeadline.length})\n`;
                tasksWithUpcomingDeadline.slice(0, 5).forEach((task, index) => {
                    report += `${index + 1}. ${task.task_description}\n`;
                    report += `   Раздел: ${task.section_name} (${task.project_name})\n`;
                    report += `   Дедлайн: ${new Date(task.due_date).toLocaleDateString()} (${task.days_until_deadline} дн.)\n`;
                    if (task.progress) {
                        report += `   Прогресс: ${task.progress}%\n`;
                    }
                    report += `\n`;
                });
                if (tasksWithUpcomingDeadline.length > 5) {
                    report += `... и ещё ${tasksWithUpcomingDeadline.length - 5} задач\n`;
                }
            }
            report += `\n`;
        }

        // Задания с устаревшим статусом (Кейс 7)
        if (staleSections && staleSections.length > 0) {
            report += `## ⚠️ Задания с устаревшим статусом (${staleSections.length})\n`;
            report += `Статус задания не обновлялся более 3 дней\n\n`;
            staleSections.slice(0, 10).forEach((assignment, index) => {
                report += `${index + 1}. Задание: ${assignment.assignment_title || 'Задание'}\n`;
                if (assignment.assignment_description) {
                    report += `   Описание: ${assignment.assignment_description}\n`;
                }
                report += `   Проект: ${assignment.project_name}\n`;
                report += `   Раздел: ${assignment.section_name}\n`;
                if (assignment.object_name) {
                    report += `   Объект: ${assignment.object_name}\n`;
                }
                if (assignment.assignment_status) {
                    report += `   Статус задания: ${assignment.assignment_status}\n`;
                }
                if (assignment.days_since_update !== null) {
                    report += `   Обновлено ${assignment.days_since_update} дн. назад\n`;
                } else {
                    report += `   Задание никогда не обновлялось\n`;
                }
                if (assignment.assignment_due_date) {
                    report += `   Срок: ${new Date(assignment.assignment_due_date).toLocaleDateString()}\n`;
                }
                if (assignment.assignment_link) {
                    report += `   Ссылка: ${assignment.assignment_link}\n`;
                }
                report += `\n`;
            });
            if (staleSections.length > 10) {
                report += `... и ещё ${staleSections.length - 10} заданий\n`;
            }
            report += `\n`;
        }

        // Разделы с критической задержкой (Кейс 8)
        if (criticalDelaySections && criticalDelaySections.length > 0) {
            report += `## 🚨 Разделы с критической задержкой (${criticalDelaySections.length})\n`;
            report += `Дедлайн прошел более 3 дней назад\n\n`;
            criticalDelaySections.forEach((section, index) => {
                report += `${index + 1}. **${section.section_name}** (${section.project_name})\n`;
                if (section.object_name) {
                    report += `   Объект: ${section.object_name}\n`;
                }
                report += `   Дедлайн: ${new Date(section.section_end_date).toLocaleDateString()} (просрочен на ${Math.abs(section.days_until_deadline)} дн.)\n`;
                if (section.status_name) {
                    report += `   Статус: ${section.status_name}\n`;
                }
                report += `\n`;
            });
            report += `\n`;
        }

        // Разделы без комментариев (Кейс 9)
        if (sectionsWithoutComments && sectionsWithoutComments.length > 0) {
            report += `## 💬 Разделы без комментариев от сотрудника (${sectionsWithoutComments.length})\n`;
            report += `Рекомендуется подготовить отчет и оставить комментарий\n\n`;
            sectionsWithoutComments.slice(0, 10).forEach((section, index) => {
                report += `${index + 1}. **${section.section_name}** (${section.project_name})\n`;
                if (section.object_name) {
                    report += `   Объект: ${section.object_name}\n`;
                }
                if (section.status_name) {
                    report += `   Статус: ${section.status_name}\n`;
                }
                if (section.section_end_date) {
                    report += `   Дедлайн: ${new Date(section.section_end_date).toLocaleDateString()}\n`;
                }
                report += `\n`;
            });
            if (sectionsWithoutComments.length > 10) {
                report += `... и ещё ${sectionsWithoutComments.length - 10} разделов\n`;
            }
            report += `\n`;
        }

        // Новые задания в разделах (Кейс 10)
        if (sectionsWithNewTasks && sectionsWithNewTasks.length > 0) {
            // Подсчитываем общее количество заданий
            const totalAssignments = sectionsWithNewTasks.reduce((sum, section) => sum + section.assignments.length, 0);

            report += `## 🆕 Новые задания в разделах (${sectionsWithNewTasks.length} раздела, ${totalAssignments} заданий)\n`;
            report += `Обновлены за последние 3 дня, статусы: Передано/Принято/Выполнено\n`;
            report += `Рекомендуется ознакомиться и уточнить их приоритетность\n\n`;

            sectionsWithNewTasks.forEach((section) => {
                report += `### 📋 **${section.section_name}** (${section.project_name})\n`;
                if (section.object_name) {
                    report += `Объект: ${section.object_name}\n`;
                }
                report += `Новых заданий: ${section.assignments.length}\n\n`;

                section.assignments.forEach((assignment, index) => {
                    report += `${index + 1}. **${assignment.title || 'Задание'}**\n`;
                    report += `   Статус: ${assignment.status}\n`;

                    if (assignment.description) {
                        const shortDesc = assignment.description.length > 100
                            ? assignment.description.substring(0, 100) + '...'
                            : assignment.description;
                        report += `   Описание: ${shortDesc}\n`;
                    }

                    if (assignment.from_section_name) {
                        report += `   От раздела: ${assignment.from_section_name}`;
                        if (assignment.from_section_responsible) {
                            report += ` (${assignment.from_section_responsible})`;
                        }
                        report += `\n`;
                    }

                    if (assignment.due_date) {
                        report += `   Срок выполнения: ${new Date(assignment.due_date).toLocaleDateString()}\n`;
                    }

                    if (assignment.planned_duration) {
                        report += `   Плановая длительность: ${assignment.planned_duration} дн.\n`;
                    }

                    if (assignment.link) {
                        report += `   Ссылка: ${assignment.link}\n`;
                    }

                    // Показываем дату обновления
                    const daysAgo = assignment.days_since_update === 0
                        ? 'сегодня'
                        : `${assignment.days_since_update} дн. назад`;
                    report += `   Обновлено: ${daysAgo}\n`;
                    report += `\n`;
                });
            });
            report += `\n`;
        }

        // Непрочитанные уведомления (Кейс 11)
        if (unreadNotifications && unreadNotifications.length > 0) {
            report += `## 🔔 Непрочитанные уведомления (${unreadNotifications.length})\n`;
            unreadNotifications.slice(0, 10).forEach((notif, index) => {
                report += `${index + 1}. ${notif.rendered_text || 'Уведомление'}\n`;
                if (notif.entity_type) {
                    report += `   Тип: ${notif.entity_type}\n`;
                }
                report += `   Дата: ${new Date(notif.created_at).toLocaleDateString()}\n`;
                report += `\n`;
            });
            if (unreadNotifications.length > 10) {
                report += `... и ещё ${unreadNotifications.length - 10} уведомлений\n`;
            }
            report += `\n`;
        }

        // Статистика
        const totalProjects = (projectsAsManager?.length || 0) + (projectsAsLeadEngineer?.length || 0);
        const totalSections = workloads?.length || 0;
        const totalLoadingRate = workloads?.reduce((sum, w) => sum + (parseFloat(w.loading_rate) || 0), 0) || 0;
        const totalLoadingHours = Math.round(totalLoadingRate * 8);

        // Подсчитываем общее количество новых заданий
        const totalNewAssignments = sectionsWithNewTasks?.reduce((sum, section) => sum + section.assignments.length, 0) || 0;

        report += `## 📈 Статистика\n`;
        report += `• **Всего проектов:** ${totalProjects}\n`;
        report += `• **Активных разделов:** ${totalSections}\n`;
        report += `• **Общая загрузка:** ${totalLoadingRate.toFixed(1)} ставок (${totalLoadingHours} ч)\n`;
        report += `• **Приближающихся дедлайнов:** ${upcomingDeadlines?.length || 0}\n`;
        report += `• **Задач декомпозиции:** ${decompositionTasks?.length || 0}\n`;
        report += `• **Разделов без комментариев:** ${sectionsWithoutComments?.length || 0}\n`;
        report += `• **Новых заданий в разделах:** ${totalNewAssignments}\n`;
        report += `• **Непрочитанных уведомлений:** ${unreadNotifications?.length || 0}\n`;

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
                                text += ` - загрузка: ${workload.loading_rate}`;
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
        const totalWorkloadHours = Math.round(totalWorkload * 8);

        report += `## 📈 Общая статистика\n`;
        report += `• **Активных проектов:** ${workloadData.projects.length}\n`;
        report += `• **Всего разделов:** ${totalSections}\n`;
        report += `• **Общая загрузка:** ${totalWorkload.toFixed(1)} ставок (${totalWorkloadHours} ч)\n\n`;

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
            report += `• Загрузка по проекту: ${project.sections.reduce((sum, s) => sum + (parseFloat(s.loading_rate) || 0), 0).toFixed(1)}\n\n`;

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
                        report += ` - загрузка: ${section.loading_rate}`;
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
                section_responsible_id: row.section_responsible_id || null
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

