export type SupportedLocale = 'en' | 'zh';

export type TranslationKey =
  | 'toast.task_completed'
  | 'toast.task_completion_message'
  | 'toast.status_queued'
  | 'toast.concurrency_info';

type TranslationDict = Record<string, string>;

export const locales: Record<SupportedLocale, TranslationDict> = {
  en: {
    'toast.task_completed': 'Task Completed',
    'toast.task_completion_message':
      '"{{description}}" finished in {{duration}}',
    'toast.status_queued': 'Queued',
    'toast.concurrency_info': ' [{{total}}/{{limit}}]',
  },
  zh: {
    'toast.task_completed': '任务完成',
    'toast.task_completion_message': '"{{description}}" 在 {{duration}} 内完成',
    'toast.status_queued': '排队中',
    'toast.concurrency_info': ' [{{total}}/{{limit}}]',
  },
};
