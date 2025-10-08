/**
 * Инструменты для генерации отчётов РП/НО План/Факт
 */
import { z } from 'zod';
import { DatabaseService } from '../services/database.js';
import { supabase } from '../config/supabase.js';

const dbService = new DatabaseService();

// ===== ZOD СХЕМЫ ВАЛИДАЦИИ =====
const ProjectReportSchema = z.object({
    project_name: z.string()
        .min(1, "Название проекта обязательно")
        .max(200, "Название проекта не должно превышать 200 символов"),
    date_from: z.string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Формат даты должен быть ГГГГ-ММ-ДД")
        .optional(),
    date_to: z.string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Формат даты должен быть ГГГГ-ММ-ДД")
        .optional(),
    include_comments: z.boolean()
        .default(false)
        .optional(),
    department_name: z.string()
        .max(200, "Название отдела не должно превышать 200 символов")
        .optional(),
    filter_by_department: z.boolean()
        .default(false)
        .optional()
});

// ===== ГЕНЕРАЦИЯ ОТЧЁТА РП/НО ПЛАН/ФАКТ =====
export const generateProjectReportTool = {
    name: "generate_project_report_plan_fact",
    description: "Генерация отчёта РП/НО План/Факт по проекту за указанный период. Для РП (Руководителя Проекта) показывает данные по всему проекту. Для НО (Начальника Отдела) можно фильтровать по отделу. Отчёт включает: общие показатели (часы, суммы, количество отчитавшихся), детализацию по разделам с этапами декомпозиции, отчёты сотрудников и комментарии.",
    inputSchema: {
        type: "object",
        properties: {
            project_name: {
                type: "string",
                description: "Название проекта (полное или частичное для поиска)"
            },
            date_from: {
                type: "string",
                description: "Дата начала периода в формате ГГГГ-ММ-ДД (по умолчанию - вчера)"
            },
            date_to: {
                type: "string",
                description: "Дата окончания периода в формате ГГГГ-ММ-ДД (по умолчанию - вчера)"
            },
            include_comments: {
                type: "boolean",
                description: "Включать ли комментарии по разделам в отчёт",
                default: false
            },
            department_name: {
                type: "string",
                description: "Название отдела для фильтрации (для НО). Если указано, показываются только разделы, где ответственные из этого отдела"
            },
            filter_by_department: {
                type: "boolean",
                description: "Фильтровать ли данные по отделу (для НО). По умолчанию false (показывать весь проект для РП)",
                default: false
            }
        },
        required: ["project_name"]
    }
};

export async function handleGenerateProjectReport(args) {
    try {
        // Валидация входных данных
        const validatedArgs = ProjectReportSchema.parse(args);
        
        // Установка дат по умолчанию (вчера)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        const dateFrom = validatedArgs.date_from || yesterdayStr;
        const dateTo = validatedArgs.date_to || yesterdayStr;
        
        // Поиск проекта
        const projects = await dbService.searchProjectsByName(validatedArgs.project_name.trim());
        
        if (projects.length === 0) {
            return {
                content: [{
                    type: "text",
                    text: `❌ Проект с названием содержащим "${validatedArgs.project_name}" не найден`
                }]
            };
        }
        
        if (projects.length > 1) {
            const projectsList = projects.map((p, index) => 
                `${index + 1}. **${p.project_name}** (статус: ${dbService.getDisplayStatus(p.project_status || 'active')})`
            ).join('\n');
            
            return {
                content: [{
                    type: "text",
                    text: `Найдено несколько проектов с названием содержащим "${validatedArgs.project_name}":\n\n${projectsList}\n\nУточните название проекта.`
                }]
            };
        }
        
        const project = projects[0];
        
        // Поиск отдела если указан
        let departmentId = null;
        let departmentName = null;
        
        if (validatedArgs.filter_by_department && validatedArgs.department_name) {
            const searchName = validatedArgs.department_name.trim();
            
            // Сначала пробуем точное совпадение (игнорируя регистр)
            const { data: exactMatch, error: exactError } = await supabase
                .from('departments')
                .select('department_id, department_name')
                .ilike('department_name', searchName)
                .limit(1)
                .single();
            
            if (!exactError && exactMatch) {
                // Найдено точное совпадение
                departmentId = exactMatch.department_id;
                departmentName = exactMatch.department_name;
            } else {
                // Точное совпадение не найдено, ищем частичное
                const { data: departments, error: deptError } = await supabase
                    .from('departments')
                    .select('department_id, department_name')
                    .ilike('department_name', `%${searchName}%`);
                
                if (deptError || !departments || departments.length === 0) {
                    return {
                        content: [{
                            type: "text",
                            text: `❌ Отдел с названием "${searchName}" не найден`
                        }]
                    };
                }
                
                if (departments.length > 1) {
                    const deptList = departments.map((d, index) => 
                        `${index + 1}. **${d.department_name}**`
                    ).join('\n');
                    
                    return {
                        content: [{
                            type: "text",
                            text: `Найдено несколько отделов с названием содержащим "${searchName}":\n\n${deptList}\n\nУточните название отдела (используйте точное название).`
                        }]
                    };
                }
                
                departmentId = departments[0].department_id;
                departmentName = departments[0].department_name;
            }
        }
        
        // Генерация отчёта
        const report = await generateDetailedReport(
            project, 
            dateFrom, 
            dateTo, 
            validatedArgs.include_comments,
            departmentId,
            departmentName
        );
        
        return {
            content: [{
                type: "text",
                text: report
            }]
        };
        
    } catch (error) {
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
                text: `❌ Ошибка генерации отчёта: ${error}`
            }]
        };
    }
}

/**
 * Генерация детального отчёта по проекту
 */
async function generateDetailedReport(project, dateFrom, dateTo, includeComments, departmentId = null, departmentName = null) {
    let report = '';
    
    // Заголовок отчёта
    const dateFromFormatted = formatDateRu(dateFrom);
    const dateToFormatted = formatDateRu(dateTo);
    const periodText = dateFrom === dateTo ? `за ${dateFromFormatted}` : `с ${dateFromFormatted} по ${dateToFormatted}`;
    
    report += `# Отчёт ${departmentId ? 'НО' : 'РП'} План/Факт\n`;
    report += `**Проект:** ${project.project_name}\n`;
    if (departmentId && departmentName) {
        report += `**Отдел:** ${departmentName}\n`;
    }
    report += `**Период:** ${periodText}\n\n`;
    
    // 1. ОБЩИЕ ПОКАЗАТЕЛИ
    const generalStats = await getGeneralProjectStats(project.project_id, dateFrom, dateTo, departmentId);
    
    report += `## Общие показатели${departmentId ? ' по отделу' : ''}:\n`;
    report += `За указанный период было внесено **${formatHours(generalStats.total_hours)}** часов и **${formatMoney(generalStats.total_amount)} BYN** в общем по проекту.\n`;
    
    if (generalStats.max_section_hours > 0) {
        report += `Больше всего часов было внесено по разделу/секции: **${generalStats.max_section_name}** (${formatHours(generalStats.max_section_hours)} ч).\n`;
    }
    
    report += `Суммарно на проекте за период отчиталось **${generalStats.unique_employees}** человек(а)`;
    if (generalStats.unique_employees > 0) {
        const avgHours = generalStats.total_hours / generalStats.unique_employees;
        report += `, было внесено в среднем по **${formatHours(avgHours)}** часов.\n`;
    } else {
        report += `.\n`;
    }
    
    report += `Из ${generalStats.total_sections} разделов/секций за период велась работа по **${generalStats.active_sections}**.\n\n`;
    
    if (generalStats.active_sections === 0) {
        report += `За указанный период работы не велось.\n`;
        return report;
    }
    
    // 2. ДЕТАЛИЗАЦИЯ ПО РАЗДЕЛАМ
    report += `## Детализация по разделам/секциям${departmentId ? ' отдела' : ''}:\n\n`;
    
    const sectionsData = await getSectionsDetailedData(project.project_id, dateFrom, dateTo, includeComments, departmentId);
    
    for (const section of sectionsData) {
        report += `### Раздел: ${section.section_name}\n`;
        report += `Было внесено **${formatHours(section.total_hours)}** часов и **${formatMoney(section.total_amount)} BYN** от ${section.unique_employees} человек(а).\n\n`;
        
        // Группировка по этапам декомпозиции
        if (section.stages && section.stages.length > 0) {
            for (const stage of section.stages) {
                report += `#### Этап: ${stage.stage_name}\n`;
                
                // Отчёты по декомпозиции
                if (stage.work_items && stage.work_items.length > 0) {
                    for (const workItem of stage.work_items) {
                        const employee = workItem.employee_name || 'Неизвестный сотрудник';
                        const description = workItem.description || 'Без описания';
                        
                        report += `По этапу **${stage.stage_name}** сотрудник **${employee}** отчитался(ась) за ${description}.\n`;
                    }
                }
                report += `\n`;
            }
        } else {
            // Если нет этапов, показываем отчёты напрямую
            if (section.work_logs && section.work_logs.length > 0) {
                for (const log of section.work_logs) {
                    const employee = log.employee_name || 'Неизвестный сотрудник';
                    const description = log.description || 'Без описания';
                    
                    report += `Сотрудник **${employee}** отчитался(ась) за ${description}.\n`;
                }
                report += `\n`;
            }
        }
        
        // Комментарии по разделу
        if (includeComments && section.comments && section.comments.length > 0) {
            report += `**Комментарии по разделу:**\n`;
            for (const comment of section.comments) {
                const author = comment.author_name || 'Аноним';
                const date = formatDateRu(comment.created_at?.split('T')[0] || '');
                report += `- [${date}] ${author}: ${comment.content}\n`;
            }
            report += `\n`;
        } else {
            report += `За период внесенных комментариев нет.\n\n`;
        }
        
        report += `---\n\n`;
    }
    
    return report;
}

/**
 * Получение общей статистики по проекту
 */
async function getGeneralProjectStats(projectId, dateFrom, dateTo, departmentId = null) {
    try {
        // Получаем все work_logs за период по проекту
        let query = supabase
            .from('view_work_logs_enriched')
            .select('work_log_hours, work_log_amount, author_id, section_id, section_name')
            .eq('project_id', projectId)
            .gte('work_log_date', dateFrom)
            .lte('work_log_date', dateTo);
        
        // Если указан отдел, фильтруем по отделу автора
        if (departmentId) {
            // Получаем сотрудников отдела
            const { data: departmentUsers, error: deptUsersError } = await supabase
                .from('profiles')
                .select('user_id')
                .eq('department_id', departmentId);
            
            if (deptUsersError || !departmentUsers || departmentUsers.length === 0) {
                console.error('Ошибка получения сотрудников отдела:', deptUsersError);
                return getEmptyStats();
            }
            
            const userIds = departmentUsers.map(u => u.user_id);
            query = query.in('author_id', userIds);
        }
        
        const { data: workLogs, error: workLogsError } = await query;
        
        if (workLogsError || !workLogs) {
            console.error('Ошибка получения work_logs:', workLogsError);
            return getEmptyStats();
        }
        
        // Подсчёт статистики
        const totalHours = workLogs.reduce((sum, log) => sum + (parseFloat(log.work_log_hours) || 0), 0);
        const totalAmount = workLogs.reduce((sum, log) => sum + (parseFloat(log.work_log_amount) || 0), 0);
        const uniqueEmployees = new Set(workLogs.map(log => log.author_id).filter(Boolean)).size;
        
        // Статистика по разделам
        const sectionStats = {};
        workLogs.forEach(log => {
            if (!log.section_id) return;
            
            if (!sectionStats[log.section_id]) {
                sectionStats[log.section_id] = {
                    section_name: log.section_name || 'Без названия',
                    hours: 0
                };
            }
            sectionStats[log.section_id].hours += parseFloat(log.work_log_hours) || 0;
        });
        
        // Находим раздел с максимальными часами
        let maxSectionName = '';
        let maxSectionHours = 0;
        Object.values(sectionStats).forEach(stat => {
            if (stat.hours > maxSectionHours) {
                maxSectionHours = stat.hours;
                maxSectionName = stat.section_name;
            }
        });
        
        // Получаем общее количество разделов проекта
        const { count: totalSections, error: sectionsError } = await supabase
            .from('sections')
            .select('section_id', { count: 'exact', head: true })
            .eq('section_project_id', projectId);
        
        const activeSections = Object.keys(sectionStats).length;
        
        return {
            total_hours: totalHours,
            total_amount: totalAmount,
            unique_employees: uniqueEmployees,
            max_section_name: maxSectionName,
            max_section_hours: maxSectionHours,
            total_sections: totalSections,
            active_sections: activeSections
        };
        
    } catch (error) {
        console.error('Ошибка в getGeneralProjectStats:', error);
        return getEmptyStats();
    }
}

/**
 * Получение детальных данных по разделам
 */
async function getSectionsDetailedData(projectId, dateFrom, dateTo, includeComments, departmentId = null) {
    try {
        // Получаем все разделы с work_logs за период
        let query = supabase
            .from('view_work_logs_enriched')
            .select(`
                section_id,
                section_name,
                work_log_hours,
                work_log_amount,
                work_log_description,
                author_id,
                author_name,
                decomposition_item_id,
                decomposition_item_description
            `)
            .eq('project_id', projectId)
            .gte('work_log_date', dateFrom)
            .lte('work_log_date', dateTo);
        
        // Если указан отдел, фильтруем по отделу автора
        if (departmentId) {
            // Получаем сотрудников отдела
            const { data: departmentUsers, error: deptUsersError } = await supabase
                .from('profiles')
                .select('user_id')
                .eq('department_id', departmentId);
            
            if (deptUsersError || !departmentUsers || departmentUsers.length === 0) {
                console.error('Ошибка получения сотрудников отдела:', deptUsersError);
                return [];
            }
            
            const userIds = departmentUsers.map(u => u.user_id);
            query = query.in('author_id', userIds);
        }
        
        const { data: workLogs, error: workLogsError } = await query;
        
        if (workLogsError || !workLogs) {
            console.error('Ошибка получения work_logs для разделов:', workLogsError);
            return [];
        }
        
        // Группируем по разделам
        const sectionsMap = {};
        
        workLogs.forEach(log => {
            if (!log.section_id) return;
            
            if (!sectionsMap[log.section_id]) {
                sectionsMap[log.section_id] = {
                    section_id: log.section_id,
                    section_name: log.section_name || 'Без названия',
                    total_hours: 0,
                    total_amount: 0,
                    employees: new Set(),
                    work_logs: [],
                    stages: {}
                };
            }
            
            const section = sectionsMap[log.section_id];
            section.total_hours += parseFloat(log.work_log_hours) || 0;
            section.total_amount += parseFloat(log.work_log_amount) || 0;
            
            if (log.author_id) {
                section.employees.add(log.author_id);
            }
            
            section.work_logs.push({
                employee_name: log.author_name,
                description: log.work_log_description || log.decomposition_item_description,
                hours: log.work_log_hours,
                amount: log.work_log_amount,
                decomposition_item_id: log.decomposition_item_id
            });
        });
        
        // Получаем этапы декомпозиции для каждого раздела
        for (const sectionId of Object.keys(sectionsMap)) {
            const section = sectionsMap[sectionId];
            
            // Получаем этапы декомпозиции
            const { data: stages, error: stagesError } = await supabase
                .from('decomposition_stages')
                .select('decomposition_stage_id, decomposition_stage_name')
                .eq('decomposition_stage_section_id', sectionId);
            
            if (!stagesError && stages && stages.length > 0) {
                // Группируем work_logs по этапам
                for (const stage of stages) {
                    section.stages[stage.decomposition_stage_id] = {
                        stage_name: stage.decomposition_stage_name,
                        work_items: []
                    };
                }
                
                // Получаем связи decomposition_items с этапами
                const { data: items, error: itemsError } = await supabase
                    .from('decomposition_items')
                    .select('decomposition_item_id, decomposition_item_stage_id, decomposition_item_description')
                    .eq('decomposition_item_section_id', sectionId);
                
                if (!itemsError && items) {
                    // Создаём маппинг decomposition_item_id -> stage_id
                    const itemToStage = {};
                    items.forEach(item => {
                        if (item.decomposition_item_stage_id) {
                            itemToStage[item.decomposition_item_id] = item.decomposition_item_stage_id;
                        }
                    });
                    
                    // Распределяем work_logs по этапам
                    section.work_logs.forEach(log => {
                        if (log.decomposition_item_id && itemToStage[log.decomposition_item_id]) {
                            const stageId = itemToStage[log.decomposition_item_id];
                            if (section.stages[stageId]) {
                                section.stages[stageId].work_items.push(log);
                            }
                        }
                    });
                }
            }
            
            // Преобразуем stages в массив
            section.stages = Object.values(section.stages);
        }
        
        // Получаем комментарии если требуется
        if (includeComments) {
            for (const sectionId of Object.keys(sectionsMap)) {
                const { data: comments, error: commentsError } = await supabase
                    .from('view_section_comments_enriched')
                    .select('comment_id, content, author_name, created_at')
                    .eq('section_id', sectionId)
                    .gte('created_at', dateFrom)
                    .lte('created_at', dateTo + 'T23:59:59')
                    .order('created_at', { ascending: true });
                
                if (!commentsError && comments) {
                    sectionsMap[sectionId].comments = comments;
                } else {
                    sectionsMap[sectionId].comments = [];
                }
            }
        }
        
        // Преобразуем в массив и сортируем по количеству часов
        const sectionsArray = Object.values(sectionsMap).map(section => ({
            ...section,
            unique_employees: section.employees.size
        }));
        
        sectionsArray.sort((a, b) => b.total_hours - a.total_hours);
        
        return sectionsArray;
        
    } catch (error) {
        console.error('Ошибка в getSectionsDetailedData:', error);
        return [];
    }
}

/**
 * Вспомогательные функции форматирования
 */
function formatHours(hours) {
    const h = Math.floor(hours);
    const minutes = Math.round((hours - h) * 60);
    const m = String(minutes).padStart(2, '0');
    const s = '00';
    
    return `${h}:${m}:${s}`;
}

function formatMoney(amount) {
    return amount.toFixed(2);
}

function formatDateRu(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}.${month}.${year}`;
}

function getEmptyStats() {
    return {
        total_hours: 0,
        total_amount: 0,
        unique_employees: 0,
        max_section_name: '',
        max_section_hours: 0,
        total_sections: 0,
        active_sections: 0
    };
}

// Экспорт всех инструментов отчётов
export const reportTools = [
    generateProjectReportTool
];

export const reportHandlers = {
    generate_project_report_plan_fact: handleGenerateProjectReport
};


