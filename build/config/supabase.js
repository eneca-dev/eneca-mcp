/**
 * Конфигурация подключения к Supabase для Eneca MCP Server
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
// Загружаем переменные окружения без отладочного вывода
// Подавляем любой вывод от dotenv перехватывая console.log
const originalLog = console.log;
const originalError = console.error;
console.log = () => { };
console.error = () => { };
dotenv.config({ debug: false });
// Восстанавливаем console методы
console.log = originalLog;
console.error = originalError;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Отсутствуют обязательные переменные окружения: SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY');
}
// Создаем клиент Supabase с Service Role ключом для полного доступа
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});
// Экспортируем конфигурацию для использования в других модулях
export const config = {
    url: supabaseUrl,
    serviceKey: supabaseServiceKey,
    debug: process.env.DEBUG === 'true'
};
