import type { TaskCategory } from '@/types';

export const EXPENSE_CATEGORIES = [
  'Продукты', 'Жильё', 'Коммунальные услуги', 'Автомобиль', 'Топливо', 'Кредиты', 'Техника',
  'Развлечения', 'Подписки', 'Здоровье', 'Одежда', 'Другое',
];
export const INCOME_CATEGORIES = ['Зарплата', 'Подработка', 'Премия', 'Другое'];
export const CAR_EXPENSE_CATEGORIES = [
  'Масло', 'Ремонт', 'Запчасти', 'Шиномонтаж', 'Мойка', 'Страховка', 'Налог', 'Диагностика', 'Обслуживание', 'Другое',
];
export const FUEL_TYPES = ['АИ-92', 'АИ-95', 'АИ-98', 'ДТ', 'Газ', 'Электро'];
export const GOAL_CATEGORIES = ['Финансы', 'Автомобиль', 'Долги', 'Накопления', 'Обучение', 'Личное'];
export const COMMAND_CATEGORIES = ['Linux', 'Git', 'Docker', 'SQL', 'macOS', 'Windows', 'Networking'];

export const TASK_CATEGORIES: Array<{ value: TaskCategory; label: string }> = [
  { value: 'today', label: 'Сегодня' },
  { value: 'work', label: 'Работа' },
  { value: 'car', label: 'Автомобиль' },
  { value: 'finance', label: 'Финансы' },
  { value: 'learning', label: 'Обучение' },
  { value: 'personal', label: 'Личное' },
];

export const PRIORITY_LABEL = { low: 'Низкий', medium: 'Средний', high: 'Высокий' } as const;
export const RECURRENCE_LABEL = { none: 'Не повторять', daily: 'Каждый день', weekly: 'Каждую неделю', monthly: 'Каждый месяц' } as const;
export const FREQUENCY_LABEL = { weekly: 'Каждую неделю', monthly: 'Каждый месяц', yearly: 'Каждый год' } as const;

export const LEARNING_PRESETS = ['Python', 'Linux', 'Git', 'Docker', 'Go', 'DevOps', 'SQL', 'Сети'];

export const DEFAULT_COMMANDS: Array<{ command: string; description: string; category: string }> = [
  { command: 'docker ps', description: 'Показать запущенные контейнеры', category: 'Docker' },
  { command: 'docker logs -f <container>', description: 'Следить за логами контейнера', category: 'Docker' },
  { command: 'docker compose up -d', description: 'Поднять сервисы в фоне', category: 'Docker' },
  { command: 'git status -sb', description: 'Краткий статус репозитория', category: 'Git' },
  { command: 'git log --oneline --graph --decorate -20', description: 'Компактная история коммитов', category: 'Git' },
  { command: 'git stash -u', description: 'Спрятать изменения, включая новые файлы', category: 'Git' },
  { command: 'ls -lah', description: 'Список файлов с размерами и скрытыми', category: 'Linux' },
  { command: 'df -h', description: 'Свободное место на дисках', category: 'Linux' },
  { command: 'journalctl -u <service> -n 100 --no-pager', description: 'Последние строки лога службы', category: 'Linux' },
  { command: 'ss -tulpn', description: 'Открытые порты и процессы', category: 'Networking' },
  { command: 'ping -c 4 1.1.1.1', description: 'Проверить доступность сети', category: 'Networking' },
  { command: 'SELECT * FROM table LIMIT 10;', description: 'Посмотреть первые строки таблицы', category: 'SQL' },
  { command: 'brew update && brew upgrade', description: 'Обновить пакеты Homebrew', category: 'macOS' },
  { command: 'ipconfig /all', description: 'Полная информация о сетевых адаптерах', category: 'Windows' },
];
