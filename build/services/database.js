/**
 * Сервис для работы с базой данных Eneca
 * Содержит CRUD операции для всех сущностей системы
 */
import { supabase } from '../config/supabase.js';
export class DatabaseService {
    // Простое кэширование
    constructor() {
        this.cache = {
            users: new Map(),
            projects: new Map(),
            stages: new Map(),
            objects: new Map()
        };
        this.cacheTimestamps = {
            users: 0,
            projects: 0,
            stages: 0,
            objects: 0
        };
        this.cacheTimeout = 60 * 60 * 1000; // 1 час
    }

    // Проверка актуальности кэша
    isCacheValid(cacheType) {
        return Date.now() - this.cacheTimestamps[cacheType] < this.cacheTimeout;
    }

    // Очистка кэша
    clearCache(cacheType = null) {
        if (cacheType) {
            this.cache[cacheType].clear();
            this.cacheTimestamps[cacheType] = 0;
        } else {
            Object.keys(this.cache).forEach(key => {
                this.cache[key].clear();
                this.cacheTimestamps[key] = 0;
            });
        }
    }
    // ===== МЕТОДЫ ВАЛИДАЦИИ =====
    async validateProjectExists(projectId) {
        const { data, error } = await supabase
            .from('projects')
            .select('project_id')
            .eq('project_id', projectId)
            .single();
        return !error && !!data;
    }
    async validateStageExists(stageId) {
        const { data, error } = await supabase
            .from('stages')
            .select('stage_id')
            .eq('stage_id', stageId)
            .single();
        return !error && !!data;
    }
    async validateObjectExists(objectId) {
        const { data, error } = await supabase
            .from('objects')
            .select('object_id')
            .eq('object_id', objectId)
            .single();
        return !error && !!data;
    }
    async validateUserExists(userId) {
        const { data, error } = await supabase
            .from('profiles')
            .select('user_id')
            .eq('user_id', userId)
            .single();
        return !error && !!data;
    }
    async validateProjectNameUnique(name, excludeId) {
        let query = supabase
            .from('projects')
            .select('project_id')
            .eq('project_name', name);
        if (excludeId) {
            query = query.neq('project_id', excludeId);
        }
        const { data, error } = await query;
        return !error && (!data || data.length === 0);
    }
    // ===== CRUD ОПЕРАЦИИ ДЛЯ ПРОЕКТОВ =====
    async createProject(input) {
        try {
            // Валидация уникальности названия
            if (!(await this.validateProjectNameUnique(input.project_name))) {
                return { success: false, message: 'Проект с таким названием уже существует' };
            }
            // Валидация менеджера проекта
            if (input.project_manager && !(await this.validateUserExists(input.project_manager))) {
                return { success: false, message: 'Указанный менеджер проекта не найден' };
            }
            // Валидация главного инженера
            if (input.project_lead_engineer && !(await this.validateUserExists(input.project_lead_engineer))) {
                return { success: false, message: 'Указанный главный инженер не найден' };
            }
            const { data, error } = await supabase
                .from('projects')
                .insert([input])
                .select()
                .single();
            if (error) {
                return { success: false, message: `Ошибка создания проекта: ${error.message}`, error: error.message };
            }
            return { success: true, message: 'Проект успешно создан', data };
        }
        catch (error) {
            return { success: false, message: `Неожиданная ошибка: ${error}`, error: String(error) };
        }
    }
    async updateProject(input) {
        try {
            // Проверка существования проекта
            if (!(await this.validateProjectExists(input.project_id))) {
                return { success: false, message: 'Проект не найден' };
            }
            // Валидация уникальности названия
            if (input.project_name && !(await this.validateProjectNameUnique(input.project_name, input.project_id))) {
                return { success: false, message: 'Проект с таким названием уже существует' };
            }
            // Валидация менеджера проекта
            if (input.project_manager && !(await this.validateUserExists(input.project_manager))) {
                return { success: false, message: 'Указанный менеджер проекта не найден' };
            }
            // Валидация главного инженера
            if (input.project_lead_engineer && !(await this.validateUserExists(input.project_lead_engineer))) {
                return { success: false, message: 'Указанный главный инженер не найден' };
            }
            const { project_id, ...updateData } = input;
            const { data, error } = await supabase
                .from('projects')
                .update(updateData)
                .eq('project_id', project_id)
                .select()
                .single();
            if (error) {
                return { success: false, message: `Ошибка обновления проекта: ${error.message}`, error: error.message };
            }
            return { success: true, message: 'Проект успешно обновлен', data };
        }
        catch (error) {
            return { success: false, message: `Неожиданная ошибка: ${error}`, error: String(error) };
        }
    }
    async deleteProject(projectId, cascade = false) {
        try {
            // Проверка существования проекта
            if (!(await this.validateProjectExists(projectId))) {
                return { success: false, message: 'Проект не найден' };
            }
            // Получение информации о связанных данных
            const cascadeInfo = await this.getCascadeDeleteInfo(projectId);
            if (cascadeInfo.total > 0 && !cascade) {
                return {
                    success: false,
                    message: `Нельзя удалить проект: найдены связанные данные (${cascadeInfo.total} записей). Используйте каскадное удаление.`,
                    data: cascadeInfo
                };
            }
            // Каскадное удаление
            if (cascade) {
                await supabase.from('sections').delete().eq('section_project_id', projectId);
                await supabase.from('objects').delete().eq('object_project_id', projectId);
                await supabase.from('stages').delete().eq('stage_project_id', projectId);
            }
            const { error } = await supabase
                .from('projects')
                .delete()
                .eq('project_id', projectId);
            if (error) {
                return { success: false, message: `Ошибка удаления проекта: ${error.message}`, error: error.message };
            }
            return {
                success: true,
                message: cascade ?
                    `Проект и все связанные данные (${cascadeInfo.total} записей) успешно удалены` :
                    'Проект успешно удален',
                data: cascadeInfo
            };
        }
        catch (error) {
            return { success: false, message: `Неожиданная ошибка: ${error}`, error: String(error) };
        }
    }
    async getProject(projectId) {
        try {
            // Проверяем кэш
            if (this.cache.projects.has(projectId) && this.isCacheValid('projects')) {
                const cachedData = this.cache.projects.get(projectId);
                return { success: true, message: 'Проект найден (из кэша)', data: cachedData };
            }

            const { data, error } = await supabase
                .from('projects')
                .select('*')
                .eq('project_id', projectId)
                .single();
            if (error) {
                return { success: false, message: `Проект не найден: ${error.message}`, error: error.message };
            }
            
            // Сохраняем в кэш
            this.cache.projects.set(projectId, data);
            this.cacheTimestamps.projects = Date.now();
            
            return { success: true, message: 'Проект найден', data };
        }
        catch (error) {
            return { success: false, message: `Неожиданная ошибка: ${error}`, error: String(error) };
        }
    }
    async listProjects(filters = {}) {
        try {
            let query = supabase
                .from('projects')
                .select('*');
            // Применение фильтров
            if (filters.manager) {
                query = query.eq('project_manager', filters.manager);
            }
            if (filters.status) {
                query = query.eq('project_status', filters.status);
            }
            if (filters.client_id) {
                query = query.eq('client_id', filters.client_id);
            }
            if (filters.limit) {
                query = query.limit(filters.limit);
            }
            if (filters.offset) {
                query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
            }
            const { data, error } = await query;
            if (error) {
                return { success: false, message: `Ошибка получения проектов: ${error.message}`, error: error.message };
            }
            return { success: true, message: `Найдено проектов: ${data.length}`, data };
        }
        catch (error) {
            return { success: false, message: `Неожиданная ошибка: ${error}`, error: String(error) };
        }
    }
    // ===== CRUD ОПЕРАЦИИ ДЛЯ ЭТАПОВ =====
    async createStage(input) {
        try {
            // Валидация существования проекта
            if (!(await this.validateProjectExists(input.stage_project_id))) {
                return { success: false, message: 'Указанный проект не найден' };
            }
            const { data, error } = await supabase
                .from('stages')
                .insert([input])
                .select()
                .single();
            if (error) {
                return { success: false, message: `Ошибка создания этапа: ${error.message}`, error: error.message };
            }
            return { success: true, message: 'Этап успешно создан', data };
        }
        catch (error) {
            return { success: false, message: `Неожиданная ошибка: ${error}`, error: String(error) };
        }
    }
    async updateStage(input) {
        try {
            // Проверка существования этапа
            if (!(await this.validateStageExists(input.stage_id))) {
                return { success: false, message: 'Этап не найден' };
            }
            // Валидация существования проекта
            if (input.stage_project_id && !(await this.validateProjectExists(input.stage_project_id))) {
                return { success: false, message: 'Указанный проект не найден' };
            }
            const { stage_id, ...updateData } = input;
            const { data, error } = await supabase
                .from('stages')
                .update(updateData)
                .eq('stage_id', stage_id)
                .select()
                .single();
            if (error) {
                return { success: false, message: `Ошибка обновления этапа: ${error.message}`, error: error.message };
            }
            return { success: true, message: 'Этап успешно обновлен', data };
        }
        catch (error) {
            return { success: false, message: `Неожиданная ошибка: ${error}`, error: String(error) };
        }
    }
    async deleteStage(stageId, cascade = false) {
        try {
            // Проверка существования этапа
            if (!(await this.validateStageExists(stageId))) {
                return { success: false, message: 'Этап не найден' };
            }
            // Проверка связанных объектов
            const childrenCount = await this.hasStageChildren(stageId);
            if (childrenCount > 0 && !cascade) {
                return {
                    success: false,
                    message: `Нельзя удалить этап: найдены связанные объекты (${childrenCount}). Используйте каскадное удаление.`
                };
            }
            // Каскадное удаление
            if (cascade) {
                // Удаляем разделы связанных объектов
                const { data: objects } = await supabase
                    .from('objects')
                    .select('object_id')
                    .eq('object_stage_id', stageId);
                if (objects && objects.length > 0) {
                    const objectIds = objects.map(obj => obj.object_id);
                    await supabase.from('sections').delete().in('section_object_id', objectIds);
                }
                await supabase.from('objects').delete().eq('object_stage_id', stageId);
            }
            const { error } = await supabase
                .from('stages')
                .delete()
                .eq('stage_id', stageId);
            if (error) {
                return { success: false, message: `Ошибка удаления этапа: ${error.message}`, error: error.message };
            }
            return {
                success: true,
                message: cascade ?
                    `Этап и все связанные объекты (${childrenCount}) успешно удалены` :
                    'Этап успешно удален'
            };
        }
        catch (error) {
            return { success: false, message: `Неожиданная ошибка: ${error}`, error: String(error) };
        }
    }
    async listStages(filters = {}) {
        try {
            let query = supabase
                .from('stages')
                .select('*');
            // Применение фильтров
            if (filters.project_id) {
                query = query.eq('stage_project_id', filters.project_id);
            }
            if (filters.limit) {
                query = query.limit(filters.limit);
            }
            if (filters.offset) {
                query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
            }
            const { data, error } = await query;
            if (error) {
                return { success: false, message: `Ошибка получения этапов: ${error.message}`, error: error.message };
            }
            return { success: true, message: `Найдено этапов: ${data.length}`, data };
        }
        catch (error) {
            return { success: false, message: `Неожиданная ошибка: ${error}`, error: String(error) };
        }
    }
    // ===== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ =====
    async getCascadeDeleteInfo(projectId) {
        const [sectionsResult, objectsResult, stagesResult] = await Promise.all([
            supabase.from('sections').select('section_id').eq('section_project_id', projectId),
            supabase.from('objects').select('object_id').eq('object_project_id', projectId),
            supabase.from('stages').select('stage_id').eq('stage_project_id', projectId)
        ]);
        const sections = sectionsResult.data?.length || 0;
        const objects = objectsResult.data?.length || 0;
        const stages = stagesResult.data?.length || 0;
        return {
            sections,
            objects,
            stages,
            total: sections + objects + stages
        };
    }
    async hasStageChildren(stageId) {
        const { data } = await supabase
            .from('objects')
            .select('object_id')
            .eq('object_stage_id', stageId);
        return data?.length || 0;
    }
    async hasObjectChildren(objectId) {
        const { data } = await supabase
            .from('sections')
            .select('section_id')
            .eq('section_object_id', objectId);
        return data?.length || 0;
    }
    // ===== ПОИСК ПО ИМЕНАМ =====
    async findUserByName(name) {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .or(`first_name.ilike.%${name}%,last_name.ilike.%${name}%,email.ilike.%${name}%`)
            .limit(1)
            .single();
        return error ? null : data;
    }
    // ===== МЕТОДЫ С ОБРАБОТКОЙ ДУБЛИКАТОВ =====
    async validateUniqueProjectByName(name) {
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('project_name', name);
        if (error || !data)
            return 'not_found';
        if (data.length === 0)
            return 'not_found';
        if (data.length > 1)
            return 'multiple_found';
        return data[0];
    }
    async validateUniqueStageByName(name, projectId) {
        const { data, error } = await supabase
            .from('stages')
            .select('*')
            .eq('stage_name', name)
            .eq('stage_project_id', projectId);
        if (error || !data)
            return 'not_found';
        if (data.length === 0)
            return 'not_found';
        if (data.length > 1)
            return 'multiple_found';
        return data[0];
    }
    async validateUniqueObjectByName(name, stageId) {
        let query = supabase
            .from('objects')
            .select('*')
            .eq('object_name', name);
        if (stageId) {
            query = query.eq('object_stage_id', stageId);
        }
        const { data, error } = await query;
        if (error || !data)
            return 'not_found';
        if (data.length === 0)
            return 'not_found';
        if (data.length > 1)
            return 'multiple_found';
        return data[0];
    }
    async searchUsersByQuery(query) {
        // Убираем пробелы и экранируем опасные символы
        const cleanQuery = query.trim().replace(/[%_\\]/g, '\\$&');
        if (!cleanQuery) {
            // Если запрос пустой, возвращаем всех активных пользователей
            const { data, error } = await supabase
                .from('view_users')
                .select('*')
                .eq('is_active', true)
                .limit(50); // Лимит 50 результатов
            return error ? [] : data || [];
        }
        // Проверяем длину запроса для защиты от DoS
        if (cleanQuery.length > 50) {
            console.log('⚠️ Слишком длинный поисковый запрос, обрезаем до 50 символов');
            return [];
        }
        // Создаем различные варианты поиска с экранированными символами
        const searchTerms = [];
        // Оригинальный запрос с экранированием
        searchTerms.push(`first_name.ilike.%${cleanQuery}%`);
        searchTerms.push(`last_name.ilike.%${cleanQuery}%`);
        searchTerms.push(`full_name.ilike.%${cleanQuery}%`);
        searchTerms.push(`email.ilike.%${cleanQuery}%`);
        // Если в запросе есть пробелы, ищем как полное имя
        if (cleanQuery.includes(' ')) {
            // Разбиваем на слова
            const words = cleanQuery.split(/\s+/);
            if (words.length >= 2) {
                // Первое слово - имя, второе - фамилия (тоже экранируем)
                const firstName = words[0].replace(/[%_\\]/g, '\\$&');
                const lastName = words[1].replace(/[%_\\]/g, '\\$&');
                // Добавляем поиск по комбинации имя+фамилия
                searchTerms.push(`and(first_name.ilike.%${firstName}%,last_name.ilike.%${lastName}%)`);
                // И в обратном порядке
                searchTerms.push(`and(first_name.ilike.%${lastName}%,last_name.ilike.%${firstName}%)`);
            }
        }
        const { data, error } = await supabase
            .from('view_users')
            .select('*')
            .eq('is_active', true)
            .or(searchTerms.join(','))
            .limit(50); // Лимит 50 результатов
        return error ? [] : data || [];
    }
    async getUserActiveWorkloads(userId) {
        // Получаем активные проекты и разделы пользователя
        const { data, error } = await supabase
            .from('view_sections_with_loadings')
            .select('*')
            .or(`section_responsible_id.eq.${userId},loading_responsible.eq.${userId}`)
            .limit(20);
        return error ? [] : data || [];
    }
    // ===== МЕТОДЫ РАБОТЫ С ДАТАМИ =====
    /**
     * Парсит дату из формата дд.мм.гггг в гггг-мм-дд
     */
    parseDate(dateStr) {
        if (!dateStr || typeof dateStr !== 'string')
            return null;
        const trimmed = dateStr.trim();
        const dateRegex = /^\d{2}\.\d{2}\.\d{4}$/;
        if (!dateRegex.test(trimmed)) {
            return null;
        }
        const [day, month, year] = trimmed.split('.');
        // Проверяем валидность даты
        const dayNum = parseInt(day, 10);
        const monthNum = parseInt(month, 10);
        const yearNum = parseInt(year, 10);
        if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12 || yearNum < 1900 || yearNum > 2100) {
            return null;
        }
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    /**
     * Форматирует дату из гггг-мм-дд в дд.мм.гггг для отображения
     */
    formatDateForDisplay(dateStr) {
        if (!dateStr)
            return '';
        const [year, month, day] = dateStr.split('-');
        return `${day}.${month}.${year}`;
    }
    /**
     * Проверяет что дата начала не больше даты окончания
     */
    validateDateRange(startDate, endDate) {
        if (!startDate || !endDate)
            return true; // Если одна из дат не указана, то проверка проходит
        const start = new Date(startDate);
        const end = new Date(endDate);
        return start <= end;
    }
    // ===== МЕТОДЫ ПОИСКА ДЛЯ ОБНОВЛЕНИЯ =====
    async findProjectByNameExact(name) {
        const cleanName = name.trim();
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('project_name', cleanName)
            .single();
        return error ? null : data;
    }
    async findStageByNameExact(name, projectId) {
        const cleanName = name.trim();
        const { data, error } = await supabase
            .from('stages')
            .select('*')
            .eq('stage_name', cleanName)
            .eq('stage_project_id', projectId)
            .single();
        return error ? null : data;
    }
    async findObjectByNameExact(name, projectId, stageId) {
        const cleanName = name.trim();
        let query = supabase
            .from('objects')
            .select('*')
            .eq('object_name', cleanName)
            .eq('object_project_id', projectId);
        if (stageId) {
            query = query.eq('object_stage_id', stageId);
        }
        const { data, error } = await query.single();
        return error ? null : data;
    }
    async findSectionByNameExact(name, projectId, objectId) {
        const cleanName = name.trim();
        let query = supabase
            .from('sections')
            .select('*')
            .eq('section_name', cleanName)
            .eq('section_project_id', projectId);
        if (objectId) {
            query = query.eq('section_object_id', objectId);
        }
        const { data, error } = await query.single();
        return error ? null : data;
    }
    // ===== ВАЛИДАЦИЯ УНИКАЛЬНОСТИ ДЛЯ ОБНОВЛЕНИЯ =====
    async validateUniqueProjectByNameForUpdate(name, excludeId) {
        const cleanName = name.trim();
        const { data, error } = await supabase
            .from('projects')
            .select('project_id')
            .eq('project_name', cleanName)
            .neq('project_id', excludeId);
        if (error)
            return 'unique';
        return data && data.length > 0 ? 'duplicate' : 'unique';
    }
    async validateUniqueStageByNameForUpdate(name, projectId, excludeId) {
        const cleanName = name.trim();
        const { data, error } = await supabase
            .from('stages')
            .select('stage_id')
            .eq('stage_name', cleanName)
            .eq('stage_project_id', projectId)
            .neq('stage_id', excludeId);
        if (error)
            return 'unique';
        return data && data.length > 0 ? 'duplicate' : 'unique';
    }
    async validateUniqueObjectByNameForUpdate(name, stageId, excludeId) {
        const cleanName = name.trim();
        const { data, error } = await supabase
            .from('objects')
            .select('object_id')
            .eq('object_name', cleanName)
            .eq('object_stage_id', stageId)
            .neq('object_id', excludeId);
        if (error)
            return 'unique';
        return data && data.length > 0 ? 'duplicate' : 'unique';
    }
    async validateUniqueSectionByNameForUpdate(name, objectId, excludeId) {
        const cleanName = name.trim();
        const { data, error } = await supabase
            .from('sections')
            .select('section_id')
            .eq('section_name', cleanName)
            .eq('section_object_id', objectId)
            .neq('section_id', excludeId);
        if (error)
            return 'unique';
        return data && data.length > 0 ? 'duplicate' : 'unique';
    }
    // ===== UTILITY МЕТОДЫ =====
    // Маппинг русских статусов в английские для базы данных
    statusMapping = {
        'активный': 'active',
        'архив': 'archive',
        'архивный': 'archive',
        'приостановлен': 'paused',
        'приостановленный': 'paused',
        'отменен': 'canceled',
        'отмененный': 'canceled',
        'отменён': 'canceled',
        'отменённый': 'canceled',
        // Английские значения остаются как есть
        'active': 'active',
        'archive': 'archive',
        'paused': 'paused',
        'canceled': 'canceled'
    };
    // Обратный маппинг для отображения пользователю
    statusDisplayMapping = {
        'active': 'активный',
        'archive': 'архивный',
        'paused': 'приостановленный',
        'canceled': 'отмененный'
    };
    /**
     * Нормализует статус проекта (конвертирует русский в английский)
     */
    normalizeProjectStatus(status) {
        const normalizedStatus = this.statusMapping[status.toLowerCase()];
        return normalizedStatus || null;
    }
    /**
     * Получает отображаемое название статуса на русском
     */
    getDisplayStatus(status) {
        return this.statusDisplayMapping[status.toLowerCase()] || status;
    }
    /**
     * Получает все возможные варианты статусов (русские и английские)
     */
    getAllowedStatuses() {
        return Object.keys(this.statusMapping);
    }
    validateProjectStatus(status) {
        return this.statusMapping.hasOwnProperty(status.toLowerCase());
    }
    async searchProjectsByName(name) {
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .ilike('project_name', `%${name}%`)
            .limit(10);
        return error ? [] : data || [];
    }
    async searchStagesByName(name, projectId) {
        let query = supabase
            .from('stages')
            .select('*')
            .ilike('stage_name', `%${name}%`);
        if (projectId) {
            query = query.eq('stage_project_id', projectId);
        }
        const { data, error } = await query.limit(10);
        return error ? [] : data || [];
    }
    async searchObjectsByName(name, stageId) {
        let query = supabase
            .from('objects')
            .select('*')
            .ilike('object_name', `%${name}%`);
        if (stageId) {
            query = query.eq('object_stage_id', stageId);
        }
        const { data, error } = await query.limit(10);
        return error ? [] : data || [];
    }
    async findProjectByName(name) {
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .ilike('project_name', `%${name}%`)
            .limit(1)
            .single();
        return error ? null : data;
    }
    async findStageByName(name, projectId) {
        let query = supabase
            .from('stages')
            .select('*')
            .ilike('stage_name', `%${name}%`);
        if (projectId) {
            query = query.eq('stage_project_id', projectId);
        }
        const { data, error } = await query.limit(1).single();
        return error ? null : data;
    }
    async findObjectByName(name, stageId) {
        let query = supabase
            .from('objects')
            .select('*')
            .ilike('object_name', `%${name}%`);
        if (stageId) {
            query = query.eq('object_stage_id', stageId);
        }
        const { data, error } = await query.limit(1).single();
        return error ? null : data;
    }
    async findClientByName(name) {
        const { data, error } = await supabase
            .from('clients')
            .select('*')
            .ilike('client_name', `%${name}%`)
            .limit(1)
            .single();
        return error ? null : data;
    }
    // ===== CRUD ОПЕРАЦИИ ДЛЯ ОБЪЕКТОВ =====
    async createObject(input) {
        try {
            // Валидация существования проекта
            if (!(await this.validateProjectExists(input.object_project_id))) {
                return { success: false, message: 'Указанный проект не найден' };
            }
            // Валидация существования стадии
            if (!(await this.validateStageExists(input.object_stage_id))) {
                return { success: false, message: 'Указанная стадия не найдена' };
            }
            // Валидация ответственного пользователя
            if (input.object_responsible && !(await this.validateUserExists(input.object_responsible))) {
                return { success: false, message: 'Указанный ответственный пользователь не найден' };
            }
            const { data, error } = await supabase
                .from('objects')
                .insert([input])
                .select()
                .single();
            if (error) {
                return { success: false, message: `Ошибка создания объекта: ${error.message}`, error: error.message };
            }
            return { success: true, message: 'Объект успешно создан', data };
        }
        catch (error) {
            return { success: false, message: `Неожиданная ошибка: ${error}`, error: String(error) };
        }
    }
    async updateObject(input) {
        try {
            // Проверка существования объекта
            if (!(await this.validateObjectExists(input.object_id))) {
                return { success: false, message: 'Объект не найден' };
            }
            // Валидация существования проекта
            if (input.object_project_id && !(await this.validateProjectExists(input.object_project_id))) {
                return { success: false, message: 'Указанный проект не найден' };
            }
            // Валидация существования стадии
            if (input.object_stage_id && !(await this.validateStageExists(input.object_stage_id))) {
                return { success: false, message: 'Указанная стадия не найдена' };
            }
            // Валидация ответственного пользователя
            if (input.object_responsible && !(await this.validateUserExists(input.object_responsible))) {
                return { success: false, message: 'Указанный ответственный пользователь не найден' };
            }
            const { object_id, ...updateData } = input;
            const { data, error } = await supabase
                .from('objects')
                .update(updateData)
                .eq('object_id', object_id)
                .select()
                .single();
            if (error) {
                return { success: false, message: `Ошибка обновления объекта: ${error.message}`, error: error.message };
            }
            return { success: true, message: 'Объект успешно обновлен', data };
        }
        catch (error) {
            return { success: false, message: `Неожиданная ошибка: ${error}`, error: String(error) };
        }
    }
    async deleteObject(objectId, cascade = false) {
        try {
            // Проверка существования объекта
            if (!(await this.validateObjectExists(objectId))) {
                return { success: false, message: 'Объект не найден' };
            }
            // Проверка связанных разделов
            const childrenCount = await this.hasObjectChildren(objectId);
            if (childrenCount > 0 && !cascade) {
                return {
                    success: false,
                    message: `Нельзя удалить объект: найдены связанные разделы (${childrenCount}). Используйте каскадное удаление.`
                };
            }
            // Каскадное удаление разделов
            if (cascade) {
                await supabase.from('sections').delete().eq('section_object_id', objectId);
            }
            const { error } = await supabase
                .from('objects')
                .delete()
                .eq('object_id', objectId);
            if (error) {
                return { success: false, message: `Ошибка удаления объекта: ${error.message}`, error: error.message };
            }
            return { success: true, message: 'Объект успешно удален' };
        }
        catch (error) {
            return { success: false, message: `Неожиданная ошибка: ${error}`, error: String(error) };
        }
    }
    async listObjects(filters = {}) {
        try {
            let query = supabase
                .from('objects')
                .select('*');
            // Применение фильтров
            if (filters.project_id) {
                query = query.eq('object_project_id', filters.project_id);
            }
            if (filters.stage_id) {
                query = query.eq('object_stage_id', filters.stage_id);
            }
            if (filters.responsible) {
                query = query.eq('object_responsible', filters.responsible);
            }
            if (filters.limit) {
                query = query.limit(filters.limit);
            }
            if (filters.offset) {
                query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
            }
            const { data, error } = await query;
            if (error) {
                return { success: false, message: `Ошибка получения объектов: ${error.message}`, error: error.message };
            }
            return { success: true, message: `Найдено объектов: ${data.length}`, data };
        }
        catch (error) {
            return { success: false, message: `Неожиданная ошибка: ${error}`, error: String(error) };
        }
    }
    // ===== CRUD ОПЕРАЦИИ ДЛЯ РАЗДЕЛОВ =====
    async createSection(input) {
        try {
            // Валидация существования проекта
            if (!(await this.validateProjectExists(input.section_project_id))) {
                return { success: false, message: 'Указанный проект не найден' };
            }
            // Валидация существования объекта
            if (!(await this.validateObjectExists(input.section_object_id))) {
                return { success: false, message: 'Указанный объект не найден' };
            }
            // Валидация ответственного пользователя
            if (input.section_responsible && !(await this.validateUserExists(input.section_responsible))) {
                return { success: false, message: 'Указанный ответственный пользователь не найден' };
            }
            const { data, error } = await supabase
                .from('sections')
                .insert([input])
                .select()
                .single();
            if (error) {
                return { success: false, message: `Ошибка создания раздела: ${error.message}`, error: error.message };
            }
            return { success: true, message: 'Раздел успешно создан', data };
        }
        catch (error) {
            return { success: false, message: `Неожиданная ошибка: ${error}`, error: String(error) };
        }
    }
    async updateSection(input) {
        try {
            // Проверка существования раздела
            if (!(await this.validateSectionExists(input.section_id))) {
                return { success: false, message: 'Раздел не найден' };
            }
            // Валидация существования проекта
            if (input.section_project_id && !(await this.validateProjectExists(input.section_project_id))) {
                return { success: false, message: 'Указанный проект не найден' };
            }
            // Валидация существования объекта
            if (input.section_object_id && !(await this.validateObjectExists(input.section_object_id))) {
                return { success: false, message: 'Указанный объект не найден' };
            }
            // Валидация ответственного пользователя
            if (input.section_responsible && !(await this.validateUserExists(input.section_responsible))) {
                return { success: false, message: 'Указанный ответственный пользователь не найден' };
            }
            const { section_id, ...updateData } = input;
            const { data, error } = await supabase
                .from('sections')
                .update(updateData)
                .eq('section_id', section_id)
                .select()
                .single();
            if (error) {
                return { success: false, message: `Ошибка обновления раздела: ${error.message}`, error: error.message };
            }
            return { success: true, message: 'Раздел успешно обновлен', data };
        }
        catch (error) {
            return { success: false, message: `Неожиданная ошибка: ${error}`, error: String(error) };
        }
    }
    async deleteSection(sectionId) {
        try {
            // Проверка существования раздела
            if (!(await this.validateSectionExists(sectionId))) {
                return { success: false, message: 'Раздел не найден' };
            }
            const { error } = await supabase
                .from('sections')
                .delete()
                .eq('section_id', sectionId);
            if (error) {
                return { success: false, message: `Ошибка удаления раздела: ${error.message}`, error: error.message };
            }
            return { success: true, message: 'Раздел успешно удален' };
        }
        catch (error) {
            return { success: false, message: `Неожиданная ошибка: ${error}`, error: String(error) };
        }
    }
    async listSections(filters = {}) {
        try {
            let query = supabase
                .from('sections')
                .select('*');
            // Применение фильтров
            if (filters.project_id) {
                query = query.eq('section_project_id', filters.project_id);
            }
            if (filters.object_id) {
                query = query.eq('section_object_id', filters.object_id);
            }
            if (filters.responsible) {
                query = query.eq('section_responsible', filters.responsible);
            }
            if (filters.section_type) {
                query = query.eq('section_type', filters.section_type);
            }
            if (filters.section_name) {
                query = query.ilike('section_name', `%${filters.section_name}%`);
            }
            if (filters.limit) {
                query = query.limit(filters.limit);
            }
            if (filters.offset) {
                query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
            }
            const { data, error } = await query;
            if (error) {
                return { success: false, message: `Ошибка получения разделов: ${error.message}`, error: error.message };
            }
            return { success: true, message: `Найдено разделов: ${data.length}`, data };
        }
        catch (error) {
            return { success: false, message: `Неожиданная ошибка: ${error}`, error: String(error) };
        }
    }
    // Валидация существования раздела
    async validateSectionExists(sectionId) {
        const { data, error } = await supabase
            .from('sections')
            .select('section_id')
            .eq('section_id', sectionId)
            .single();
        return !error && !!data;
    }

    // ===== НОВЫЕ МЕТОДЫ ДЛЯ ГЛОБАЛЬНОГО ПОИСКА =====
    
    /**
     * Получить проекты по менеджеру
     */
    async getProjectsByManager(managerId) {
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('project_manager', managerId);
        return error ? [] : data || [];
    }

    /**
     * Получить проекты по главному инженеру
     */
    async getProjectsByLeadEngineer(leadEngineerId) {
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('project_lead_engineer', leadEngineerId);
        return error ? [] : data || [];
    }

    /**
     * Получить объекты по ответственному
     */
    async getObjectsByResponsible(responsibleId, projectName = null, limit = 20) {
        let query = supabase
            .from('objects')
            .select(`
                *,
                projects!inner(project_name),
                stages!inner(stage_name)
            `)
            .eq('object_responsible', responsibleId)
            .limit(limit);

        if (projectName) {
            query = query.ilike('projects.project_name', `%${projectName}%`);
        }

        const { data, error } = await query;
        if (error) return [];

        return data.map(obj => ({
            ...obj,
            project_name: obj.projects?.project_name,
            stage_name: obj.stages?.stage_name
        }));
    }

    /**
     * Получить разделы по ответственному
     */
    async getSectionsByResponsible(responsibleId, projectName = null, limit = 20) {
        let query = supabase
            .from('sections')
            .select(`
                *,
                projects!inner(project_name),
                objects!inner(object_name)
            `)
            .eq('section_responsible', responsibleId)
            .limit(limit);

        if (projectName) {
            query = query.ilike('projects.project_name', `%${projectName}%`);
        }

        const { data, error } = await query;
        if (error) return [];

        return data.map(section => ({
            ...section,
            project_name: section.projects?.project_name,
            object_name: section.objects?.object_name
        }));
    }

    /**
     * Получить все разделы проекта с ответственными и названиями объектов
     */
    async getProjectSectionsWithResponsibles(projectId) {
        try {
            let query = supabase
                .from('sections')
                .select(`
                    section_id,
                    section_name,
                    section_type,
                    section_description,
                    section_start_date,
                    section_end_date,
                    section_object_id,
                    section_responsible,
                    objects!inner(object_name),
                    profiles_responsible:section_responsible(user_id, first_name, last_name, full_name, email, position_name, department_name)
                `)
                .eq('section_project_id', projectId);

            const { data, error } = await query;
            if (error) return [];

            return (data || []).map((s) => {
                const responsibleProfile = s.profiles_responsible || null;
                const fullName = responsibleProfile?.full_name || `${responsibleProfile?.first_name || ''} ${responsibleProfile?.last_name || ''}`.trim();
                return {
                    section_id: s.section_id,
                    section_name: s.section_name,
                    section_type: s.section_type,
                    section_description: s.section_description,
                    section_start_date: s.section_start_date,
                    section_end_date: s.section_end_date,
                    object_name: s.objects?.object_name || null,
                    responsible: responsibleProfile
                        ? {
                            user_id: responsibleProfile.user_id,
                            full_name: fullName,
                            email: responsibleProfile.email,
                            position_name: responsibleProfile.position_name,
                            department_name: responsibleProfile.department_name
                        }
                        : null
                };
            });
        } catch (error) {
            return [];
        }
    }

    /**
     * Получить команду проекта
     */
    async getProjectTeam(projectId) {
        // Получаем менеджера и главного инженера
        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select(`
                project_manager,
                project_lead_engineer,
                profiles_manager:project_manager(user_id, first_name, last_name, full_name, email, position_name, department_name),
                profiles_lead:project_lead_engineer(user_id, first_name, last_name, full_name, email, position_name, department_name)
            `)
            .eq('project_id', projectId)
            .single();

        if (projectError || !project) return [];

        const teamMembers = [];

        // Добавляем менеджера
        if (project.profiles_manager) {
            teamMembers.push({
                ...project.profiles_manager,
                role: 'manager'
            });
        }

        // Добавляем главного инженера
        if (project.profiles_lead) {
            teamMembers.push({
                ...project.profiles_lead,
                role: 'lead_engineer'
            });
        }

        // Получаем всех ответственных по объектам и разделам
        const { data: responsibles, error: responsiblesError } = await supabase
            .from('view_project_responsibles')
            .select('*')
            .eq('project_id', projectId);

        if (!responsiblesError && responsibles) {
            responsibles.forEach(responsible => {
                teamMembers.push({
                    ...responsible,
                    role: 'responsible'
                });
            });
        }

        return teamMembers;
    }

    /**
     * Получить детальную загрузку сотрудника
     */
    async getEmployeeDetailedWorkload(userId, projectName = null, includeCompleted = false) {
        try {
            // Получаем все разделы сотрудника с детальной информацией
            let query = supabase
                .from('view_sections_with_loadings')
                .select(`
                    *,
                    projects!inner(project_name, project_status),
                    objects!inner(object_name)
                `)
                .or(`section_responsible_id.eq.${userId},loading_responsible.eq.${userId}`);

            if (projectName) {
                query = query.ilike('projects.project_name', `%${projectName}%`);
            }

            if (!includeCompleted) {
                // Исключаем завершенные задачи (можно добавить фильтр по дате окончания)
                query = query.is('section_end_date', null);
            }

            const { data, error } = await query.limit(100);

            if (error) {
                console.error('Ошибка получения загрузки сотрудника:', error);
                return { projects: [] };
            }

            // Группируем по проектам
            const projectGroups = {};
            
            (data || []).forEach(item => {
                const projectName = item.projects?.project_name || 'Неизвестный проект';
                if (!projectGroups[projectName]) {
                    projectGroups[projectName] = {
                        project_name: projectName,
                        project_status: item.projects?.project_status || 'active',
                        sections: []
                    };
                }
                
                projectGroups[projectName].sections.push({
                    section_name: item.section_name,
                    section_type: item.section_type,
                    object_name: item.objects?.object_name,
                    loading_rate: item.loading_rate,
                    section_start_date: item.section_start_date,
                    section_end_date: item.section_end_date,
                    section_description: item.section_description
                });
            });

            return {
                projects: Object.values(projectGroups)
            };
        } catch (error) {
            console.error('Ошибка получения детальной загрузки:', error);
            return { projects: [] };
        }
    }

    /**
     * Получить события календаря пользователя и глобальные события
     */
    async getUserCalendarEvents(userId, fromDate = null, toDate = null, limit = 20) {
        try {
            // Берем только актуальные события: те, что еще не завершились на сегодня,
            // или начинаются сегодня/позже. Для этого используем нижнюю границу effectiveFrom.
            const effectiveFromIso = (() => {
                if (fromDate) {
                    try {
                        const d = new Date(fromDate);
                        return d.toISOString();
                    } catch (_) {
                        // игнорируем неверный формат и fallback на сегодня
                    }
                }
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return today.toISOString();
            })();

            let query = supabase
                .from('calendar_events')
                .select('*')
                .or(`calendar_event_is_global.eq.true,calendar_event_created_by.eq.${userId}`);

            // Условие актуальности:
            // 1) однодневные/с неуказанным окончанием: start >= effectiveFrom
            // 2) многодневные: end >= effectiveFrom
            query = query.or(`and(calendar_event_date_end.is.null,calendar_event_date_start.gte.${effectiveFromIso}),calendar_event_date_end.gte.${effectiveFromIso}`);

            if (toDate) {
                query = query.lte('calendar_event_date_start', toDate);
            }

            const { data, error } = await query
                .order('calendar_event_date_start', { ascending: true })
                .limit(limit);

            return error ? [] : data || [];
        } catch (error) {
            return [];
        }
    }

    /**
     * Получить задания (assignments), переданные в разделы, где пользователь является ответственным
     */
    async getAssignmentsForResponsibleSections(userId, limit = 50) {
        try {
            // Находим разделы, где пользователь ответственный, вместе с проектом и объектом
            const { data: sections, error: sectionsError } = await supabase
                .from('sections')
                .select(`
                    section_id,
                    section_name,
                    section_project_id,
                    section_object_id,
                    projects:section_project_id(project_name),
                    objects:section_object_id(object_name)
                `)
                .eq('section_responsible', userId);

            if (sectionsError || !sections || sections.length === 0) {
                return [];
            }

            const sectionIds = sections.map(s => s.section_id);
            const sectionById = new Map();
            sections.forEach(s => {
                sectionById.set(s.section_id, {
                    section_id: s.section_id,
                    section_name: s.section_name,
                    project_name: s.projects?.project_name || null,
                    object_name: s.objects?.object_name || null
                });
            });

            const { data: assignments, error: assignmentsError } = await supabase
                .from('assignments')
                .select('*')
                .in('to_section_id', sectionIds)
                .order('due_date', { ascending: true })
                .limit(limit);

            if (assignmentsError || !assignments) {
                return [];
            }

            return assignments.map(a => ({
                ...a,
                section: sectionById.get(a.to_section_id) || null
            }));
        } catch (error) {
            return [];
        }
    }

    /**
     * Создать заметку в таблице notions
     * Обязательные поля: notion_created_by (uuid), notion_content (text)
     */
    async createNotion(notionCreatedBy, notionContent) {
        try {
            const createdBy = String(notionCreatedBy || '').trim();
            const content = String(notionContent || '').trim();
            if (!createdBy || !content) {
                return { success: false, message: 'notion_created_by и notion_content обязательны' };
            }

            const { data, error } = await supabase
                .from('notions')
                .insert([{ notion_created_by: createdBy, notion_content: content }])
                .select()
                .single();

            if (error) {
                return { success: false, message: `Ошибка создания заметки: ${error.message}`, error: error.message };
            }

            return { success: true, message: 'Заметка успешно создана', data };
        } catch (error) {
            return { success: false, message: `Неожиданная ошибка: ${error}`, error: String(error) };
        }
    }
    /**
     * Получить разделы проекта и email ответственных по имени менеджера и названию проекта
     * Источник: view_project_tree (колонки: manager_name, project_name, section_name, section_responsible_email)
     */
    async getProjectSectionsByManagerName(projectName, managerName) {
        try {
            const cleanProject = String(projectName || '').trim();
            const cleanManager = String(managerName || '').trim();
            if (!cleanProject || !cleanManager) return [];

            const { data, error } = await supabase
                .from('view_project_tree')
                .select('section_name, section_responsible_email, manager_name, project_name')
                .eq('project_name', cleanProject)
                .eq('manager_name', cleanManager);

            if (error) return [];
            return data || [];
        } catch (error) {
            return [];
        }
    }

    /**
     * Получить разделы проекта (section_id и email ответственного) только по названию проекта
     * Источник: view_project_tree (колонки: project_name, section_id, section_responsible_email)
     */
    async getProjectSectionsByProjectName(projectName) {
        try {
            const cleanProject = String(projectName || '').trim();
            if (!cleanProject) return [];

            const { data, error } = await supabase
                .from('view_project_tree')
                .select('section_id, section_name, section_responsible_id, project_name')
                .eq('project_name', cleanProject);

            if (error) return [];
            return data || [];
        } catch (error) {
            return [];
        }
    }
    /**
     * Получить стадию по ID (с кэшированием)
     */
    async getStage(stageId) {
        try {
            // Проверяем кэш
            if (this.cache.stages.has(stageId) && this.isCacheValid('stages')) {
                const cachedData = this.cache.stages.get(stageId);
                return { success: true, message: 'Стадия найдена (из кэша)', data: cachedData };
            }

            const { data, error } = await supabase
                .from('stages')
                .select('*')
                .eq('stage_id', stageId)
                .single();
            if (error) {
                return { success: false, message: `Стадия не найдена: ${error.message}`, error: error.message };
            }
            
            // Сохраняем в кэш
            this.cache.stages.set(stageId, data);
            this.cacheTimestamps.stages = Date.now();
            
            return { success: true, message: 'Стадия найдена', data };
        } catch (error) {
            return { success: false, message: `Неожиданная ошибка: ${error}`, error: String(error) };
        }
    }

    /**
     * Получить пользователя по ID (с кэшированием)
     */
    async getUser(userId) {
        try {
            // Проверяем кэш
            if (this.cache.users.has(userId) && this.isCacheValid('users')) {
                return this.cache.users.get(userId);
            }

            const { data, error } = await supabase
                .from('view_users')
                .select('*')
                .eq('user_id', userId)
                .eq('is_active', true)
                .single();
            
            const result = error ? null : data;
            
            // Сохраняем в кэш
            if (result) {
                this.cache.users.set(userId, result);
                this.cacheTimestamps.users = Date.now();
            }
            
            return result;
        } catch (error) {
            return null;
        }
    }

    /**
     * Получить пользователя из profiles по user_id (без фильтра активности)
     */
    async getUserFromProfiles(userId) {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('user_id, first_name, last_name, full_name, email')
                .eq('user_id', userId)
                .single();
            return error ? null : data;
        } catch (error) {
            return null;
        }
    }

    /**
     * Получить активного пользователя по email (точное совпадение)
     */
    async getUserByEmail(email) {
        try {
            const clean = String(email).trim().toLowerCase();
            if (!clean) return null;
            const { data, error } = await supabase
                .from('view_users')
                .select('*')
                .eq('email', clean)
                .eq('is_active', true)
                .limit(1)
                .single();
            return error ? null : data;
        } catch (error) {
            return null;
        }
    }

    /**
     * Получить объект по ID
     */
    async getObject(objectId) {
        try {
            const { data, error } = await supabase
                .from('objects')
                .select('*')
                .eq('object_id', objectId)
                .single();
            if (error) {
                return { success: false, message: `Объект не найден: ${error.message}`, error: error.message };
            }
            return { success: true, message: 'Объект найден', data };
        } catch (error) {
            return { success: false, message: `Неожиданная ошибка: ${error}`, error: String(error) };
        }
    }

    // ===== МЕТОДЫ ДЛЯ ПЛАНА НА ДЕНЬ =====


    /**
     * Получить разделы со статусом "в работе" для сотрудника
     * Кейс 3: Разделы со статусом в работе
     */
    async getUserSectionsInProgress(userId, limit = 50) {
        try {
            const { data, error } = await supabase
                .from('sections')
                .select(`
                    section_id,
                    section_name,
                    section_type,
                    section_start_date,
                    section_end_date,
                    section_status_id,
                    last_status_updated,
                    last_responsible_updated,
                    section_statuses!inner(name, color),
                    objects!inner(object_name),
                    projects!inner(project_name)
                `)
                .eq('section_responsible', userId)
                .eq('section_statuses.name', 'В работе')
                .order('section_updated', { ascending: false })
                .limit(limit);

            if (error) {
                console.error('Ошибка получения разделов в работе:', error);
                return [];
            }

            return (data || []).map(section => ({
                section_id: section.section_id,
                section_name: section.section_name,
                section_type: section.section_type,
                section_start_date: section.section_start_date,
                section_end_date: section.section_end_date,
                status_name: section.section_statuses?.name,
                status_color: section.section_statuses?.color,
                last_status_updated: section.last_status_updated,
                last_responsible_updated: section.last_responsible_updated,
                object_name: section.objects?.object_name,
                project_name: section.projects?.project_name
            }));
        } catch (error) {
            console.error('Ошибка получения разделов в работе:', error);
            return [];
        }
    }

    /**
     * Получить разделы с приближающимися дедлайнами
     * Кейс 4: Разделы с приближающимися дедлайнами
     */
    async getUserSectionsWithUpcomingDeadlines(userId, daysThreshold = 7, limit = 50) {
        try {
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + daysThreshold);

            const { data, error } = await supabase
                .from('sections')
                .select(`
                    section_id,
                    section_name,
                    section_type,
                    section_start_date,
                    section_end_date,
                    section_status_id,
                    section_statuses(name, color),
                    objects!inner(object_name),
                    projects!inner(project_name)
                `)
                .eq('section_responsible', userId)
                .not('section_end_date', 'is', null)
                .lte('section_end_date', futureDate.toISOString())
                .gte('section_end_date', new Date().toISOString())
                .order('section_end_date', { ascending: true })
                .limit(limit);

            if (error) {
                console.error('Ошибка получения разделов с дедлайнами:', error);
                return [];
            }

            return (data || []).map(section => ({
                section_id: section.section_id,
                section_name: section.section_name,
                section_type: section.section_type,
                section_start_date: section.section_start_date,
                section_end_date: section.section_end_date,
                status_name: section.section_statuses?.name,
                status_color: section.section_statuses?.color,
                object_name: section.objects?.object_name,
                project_name: section.projects?.project_name,
                days_until_deadline: Math.ceil((new Date(section.section_end_date) - new Date()) / (1000 * 60 * 60 * 24))
            }));
        } catch (error) {
            console.error('Ошибка получения разделов с дедлайнами:', error);
            return [];
        }
    }

    /**
     * Получить активные задачи декомпозиции для сотрудника
     * Кейс 5: Задачи декомпозиции без установленных сроков или с приближающимися сроками (3 дня или меньше)
     */
    async getUserDecompositionTasks(userId, limit = 100) {
        try {
            // Вычисляем дату через 3 дня
            const threeDaysFromNow = new Date();
            threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
            threeDaysFromNow.setHours(23, 59, 59, 999);

            const { data, error } = await supabase
                .from('decomposition_items')
                .select(`
                    decomposition_item_id,
                    decomposition_item_description,
                    decomposition_item_planned_hours,
                    decomposition_item_planned_due_date,
                    decomposition_item_order,
                    decomposition_item_progress,
                    decomposition_item_created_at,
                    decomposition_item_updated_at,
                    decomposition_item_status_id,
                    section_statuses(name, color),
                    work_categories(work_category_name),
                    decomposition_stages(
                        decomposition_stage_name,
                        decomposition_stage_start,
                        decomposition_stage_finish
                    ),
                    sections!inner(
                        section_id,
                        section_name,
                        section_type,
                        section_end_date,
                        objects(object_name),
                        projects(project_name)
                    )
                `)
                .eq('decomposition_item_responsible', userId)
                // Фильтруем задачи: срок не указан ИЛИ срок подходит (осталось 3 дня или меньше)
                .or(`decomposition_item_planned_due_date.is.null,decomposition_item_planned_due_date.lte.${threeDaysFromNow.toISOString()}`)
                .order('decomposition_item_planned_due_date', { ascending: true, nullsFirst: false })
                .limit(limit);

            if (error) {
                console.error('Ошибка получения задач декомпозиции:', error);
                return [];
            }

            return (data || []).map(item => ({
                task_id: item.decomposition_item_id,
                task_description: item.decomposition_item_description,
                planned_hours: item.decomposition_item_planned_hours,
                due_date: item.decomposition_item_planned_due_date,
                progress: item.decomposition_item_progress,
                status_name: item.section_statuses?.name,
                status_color: item.section_statuses?.color,
                work_category: item.work_categories?.work_category_name,
                stage_name: item.decomposition_stages?.decomposition_stage_name,
                stage_start: item.decomposition_stages?.decomposition_stage_start,
                stage_finish: item.decomposition_stages?.decomposition_stage_finish,
                section_name: item.sections?.section_name,
                section_type: item.sections?.section_type,
                section_end_date: item.sections?.section_end_date,
                object_name: item.sections?.objects?.object_name,
                project_name: item.sections?.projects?.project_name,
                has_no_deadline: !item.decomposition_item_planned_due_date,
                days_until_deadline: item.decomposition_item_planned_due_date
                    ? Math.ceil((new Date(item.decomposition_item_planned_due_date) - new Date()) / (1000 * 60 * 60 * 24))
                    : null
            }));
        } catch (error) {
            console.error('Ошибка получения задач декомпозиции:', error);
            return [];
        }
    }

    /**
     * Получить непрочитанные уведомления для сотрудника
     * Кейс 11: Непрочитанные уведомления/объявления
     */
    async getUserUnreadNotifications(userId, limit = 50) {
        try {
            const { data, error } = await supabase
                .from('user_notifications')
                .select(`
                    id,
                    is_read,
                    is_archived,
                    created_at,
                    notifications!inner(
                        id,
                        rendered_text,
                        payload,
                        created_at,
                        entity_types(entity_name)
                    )
                `)
                .eq('user_id', userId)
                .eq('is_read', false)
                .eq('is_archived', false)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) {
                console.error('Ошибка получения непрочитанных уведомлений:', error);
                return [];
            }

            return (data || []).map(notif => ({
                notification_id: notif.id,
                rendered_text: notif.notifications?.rendered_text,
                entity_type: notif.notifications?.entity_types?.entity_name,
                payload: notif.notifications?.payload,
                created_at: notif.created_at,
                notification_created_at: notif.notifications?.created_at
            }));
        } catch (error) {
            console.error('Ошибка получения непрочитанных уведомлений:', error);
            return [];
        }
    }

    /**
     * Получить задания (assignments), где статус не обновлялся несколько дней
     * Кейс 7: Если ответственный не обновлял статус задания в течение нескольких дней
     */
    async getUserSectionsWithStaleStatus(userId, daysThreshold = 3, limit = 50) {
        try {
            const thresholdDate = new Date();
            thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);

            // Получаем задания (assignments) в разделы, где пользователь ответственный
            const { data, error } = await supabase
                .from('assignments')
                .select(`
                    assignment_id,
                    title,
                    description,
                    status,
                    due_date,
                    link,
                    created_at,
                    updated_at,
                    to_section:to_section_id!inner(
                        section_id,
                        section_name,
                        section_type,
                        section_responsible,
                        objects(object_name),
                        projects(project_name, project_id)
                    )
                `)
                .eq('to_section.section_responsible', userId)
                .or(`updated_at.is.null,updated_at.lt.${thresholdDate.toISOString()}`)
                .order('updated_at', { ascending: true, nullsFirst: true })
                .limit(limit);

            if (error) {
                console.error('Ошибка получения заданий с устаревшим статусом:', error);
                return [];
            }

            return (data || []).map(assignment => ({
                assignment_id: assignment.assignment_id,
                assignment_title: assignment.title,
                assignment_description: assignment.description,
                assignment_status: assignment.status,
                assignment_due_date: assignment.due_date,
                assignment_link: assignment.link,
                assignment_created_at: assignment.created_at,
                assignment_updated_at: assignment.updated_at,
                section_id: assignment.to_section?.section_id,
                section_name: assignment.to_section?.section_name,
                section_type: assignment.to_section?.section_type,
                object_name: assignment.to_section?.objects?.object_name,
                project_name: assignment.to_section?.projects?.project_name,
                project_id: assignment.to_section?.projects?.project_id,
                days_since_update: assignment.updated_at
                    ? Math.floor((new Date() - new Date(assignment.updated_at)) / (1000 * 60 * 60 * 24))
                    : null
            }));
        } catch (error) {
            console.error('Ошибка получения заданий с устаревшим статусом:', error);
            return [];
        }
    }

    /**
     * Получить разделы с критической задержкой
     * Кейс 8: Разделы с критической задержкой (дедлайн прошел более 3 дней назад)
     */
    async getUserSectionsWithCriticalDelay(userId, limit = 50) {
        try {
            const now = new Date();
            const criticalThreshold = new Date();
            criticalThreshold.setDate(criticalThreshold.getDate() - 3); // Более 3 дней назад

            const { data, error } = await supabase
                .from('sections')
                .select(`
                    section_id,
                    section_name,
                    section_type,
                    section_start_date,
                    section_end_date,
                    section_status_id,
                    last_status_updated,
                    section_statuses(name, color),
                    objects!inner(object_name),
                    projects!inner(project_name)
                `)
                .eq('section_responsible', userId)
                .not('section_end_date', 'is', null)
                .lt('section_end_date', criticalThreshold.toISOString())
                .order('section_end_date', { ascending: true })
                .limit(limit);

            if (error) {
                console.error('Ошибка получения разделов с критической задержкой:', error);
                return [];
            }

            return (data || []).map(section => {
                const daysUntilDeadline = Math.ceil((new Date(section.section_end_date) - now) / (1000 * 60 * 60 * 24));
                return {
                    section_id: section.section_id,
                    section_name: section.section_name,
                    section_type: section.section_type,
                    section_start_date: section.section_start_date,
                    section_end_date: section.section_end_date,
                    status_name: section.section_statuses?.name,
                    status_color: section.section_statuses?.color,
                    last_status_updated: section.last_status_updated,
                    object_name: section.objects?.object_name,
                    project_name: section.projects?.project_name,
                    days_until_deadline: daysUntilDeadline,
                    is_overdue: daysUntilDeadline < 0
                };
            });
        } catch (error) {
            console.error('Ошибка получения разделов с критической задержкой:', error);
            return [];
        }
    }

    /**
     * Получить разделы где сотрудник работал, но не оставил комментариев
     * Кейс 9: Подготовить отчет по выполненным задачам для проекта и отправить комментарии в раздел
     */
    async getUserSectionsWithoutComments(userId, limit = 50) {
        try {
            // Получаем все разделы где сотрудник ответственный
            const { data: sections, error: sectionsError } = await supabase
                .from('sections')
                .select(`
                    section_id,
                    section_name,
                    section_type,
                    section_start_date,
                    section_end_date,
                    section_status_id,
                    section_statuses(name, color),
                    objects!inner(object_name),
                    projects!inner(project_name, project_id)
                `)
                .eq('section_responsible', userId)
                .limit(limit);

            if (sectionsError || !sections) {
                console.error('Ошибка получения разделов:', sectionsError);
                return [];
            }

            // Получаем комментарии сотрудника для этих разделов
            const sectionIds = sections.map(s => s.section_id);

            const { data: comments, error: commentsError } = await supabase
                .from('section_comments')
                .select('section_id')
                .eq('author_id', userId)
                .in('section_id', sectionIds);

            if (commentsError) {
                console.error('Ошибка получения комментариев:', commentsError);
                return [];
            }

            // Создаем Set для быстрого поиска разделов с комментариями
            const sectionsWithComments = new Set((comments || []).map(c => c.section_id));

            // Фильтруем разделы без комментариев
            const sectionsWithoutComments = sections.filter(section =>
                !sectionsWithComments.has(section.section_id)
            );

            return sectionsWithoutComments.map(section => ({
                section_id: section.section_id,
                section_name: section.section_name,
                section_type: section.section_type,
                section_start_date: section.section_start_date,
                section_end_date: section.section_end_date,
                status_name: section.section_statuses?.name,
                status_color: section.section_statuses?.color,
                object_name: section.objects?.object_name,
                project_name: section.projects?.project_name,
                project_id: section.projects?.project_id
            }));
        } catch (error) {
            console.error('Ошибка получения разделов без комментариев:', error);
            return [];
        }
    }

    /**
     * Получить новые задания (assignments) в разделах сотрудника со статусами "Передано", "Принято", "Выполнено"
     * Кейс 10: Ознакомиться с новыми заданиями в разделе и уточнить их приоритетность
     */
    async getUserSectionsWithNewTasks(userId, daysThreshold = 3, limit = 50) {
        try {
            // Вычисляем дату для фильтрации (по умолчанию - последние 3 дня)
            const now = new Date();
            const startDate = new Date(now.getTime() - daysThreshold * 24 * 60 * 60 * 1000);

            // Формат: "YYYY-MM-DD 00:00:00" для корректного сравнения timestamp
            const year = startDate.getFullYear();
            const month = String(startDate.getMonth() + 1).padStart(2, '0');
            const day = String(startDate.getDate()).padStart(2, '0');
            const startDateStr = `${year}-${month}-${day} 00:00:00`;

            const { data, error } = await supabase
                .from('assignments')
                .select(`
                    assignment_id,
                    title,
                    description,
                    status,
                    due_date,
                    link,
                    created_at,
                    updated_at,
                    planned_transmitted_date,
                    planned_duration,
                    actual_transmitted_date,
                    actual_accepted_date,
                    actual_worked_out_date,
                    from_section:from_section_id(
                        section_id,
                        section_name,
                        section_responsible,
                        profiles:section_responsible(user_id, first_name, last_name, email)
                    ),
                    to_section:to_section_id!inner(
                        section_id,
                        section_name,
                        section_type,
                        section_responsible,
                        objects(object_name),
                        projects(project_name, project_id)
                    )
                `)
                .eq('to_section.section_responsible', userId)
                .in('status', ['Передано', 'Принято', 'Выполнено'])
                .gte('updated_at', startDateStr)
                .order('updated_at', { ascending: false })
                .limit(limit);

            if (error) {
                console.error('[getUserSectionsWithNewTasks] Ошибка получения новых заданий:', error);
                return [];
            }

            // Группируем задания по разделам
            const sectionGroups = {};

            (data || []).forEach(item => {
                const sectionId = item.to_section?.section_id;
                if (!sectionId) return;

                if (!sectionGroups[sectionId]) {
                    sectionGroups[sectionId] = {
                        section_id: sectionId,
                        section_name: item.to_section?.section_name,
                        section_type: item.to_section?.section_type,
                        object_name: item.to_section?.objects?.object_name,
                        project_name: item.to_section?.projects?.project_name,
                        project_id: item.to_section?.projects?.project_id,
                        assignments: []
                    };
                }

                sectionGroups[sectionId].assignments.push({
                    assignment_id: item.assignment_id,
                    title: item.title,
                    description: item.description,
                    status: item.status,
                    due_date: item.due_date,
                    link: item.link,
                    created_at: item.created_at,
                    updated_at: item.updated_at,
                    planned_transmitted_date: item.planned_transmitted_date,
                    planned_duration: item.planned_duration,
                    actual_transmitted_date: item.actual_transmitted_date,
                    actual_accepted_date: item.actual_accepted_date,
                    actual_worked_out_date: item.actual_worked_out_date,
                    from_section_name: item.from_section?.section_name,
                    from_section_responsible: `${item.from_section?.profiles?.first_name || ''} ${item.from_section?.profiles?.last_name || ''}`.trim(),
                    days_since_update: Math.floor((new Date() - new Date(item.updated_at)) / (1000 * 60 * 60 * 24))
                });
            });

            // Возвращаем массив разделов с их заданиями
            return Object.values(sectionGroups);
        } catch (error) {
            console.error('Ошибка получения новых заданий:', error);
            return [];
        }
    }
}
