import { readDate } from '@/lib/task-utils';
import { PERSONAL_DEFAULTS, personalDueAt, type PersonalInput, type PersonalTask } from '@/lib/personal-tasks';

export const SETTINGS_KEY = 'gulabani-settings-v1';
export const OPTIONS = {
  startScreen: ['Home', 'Projects', 'To-do'],
  dateFormat: ['DD/MM/YYYY', 'DD MMM YYYY', 'YYYY-MM-DD'],
  firstDayOfWeek: ['Monday', 'Sunday'],
  defaultReminder: ['None', 'At due time', '10 minutes before', '1 hour before', '1 day before'],
  defaultPriority: ['Low', 'Medium', 'High', 'Critical'],
  theme: ['System', 'Light', 'Dark'],
} as const;
export type Settings = { [K in keyof typeof OPTIONS]: (typeof OPTIONS)[K][number] } & {
  notificationsEnabled: boolean; showPersonal: boolean; showProjects: boolean;
  // Retained for old settings/backups. Dedicated Completed views ignore these.
  showCompleted: boolean; projectDuration: number; showCompletedProjects: boolean;
};
export const DEFAULT_SETTINGS: Settings = {
  startScreen: 'Home', dateFormat: 'DD/MM/YYYY', firstDayOfWeek: 'Monday',
  notificationsEnabled: true, defaultReminder: 'None', showPersonal: true,
  showProjects: true, showCompleted: true, defaultPriority: 'Medium',
  projectDuration: 10, showCompletedProjects: true, theme: 'System',
};
export type SavedSettings = Settings & Record<string, unknown>;

// Bound the preference to ten years; reject fractions, exponents and overflow.
export function parseDuration(value: string): number | undefined {
  if (!/^\d{1,4}$/.test(value)) return undefined;
  const days = Number(value);
  return days >= 1 && days <= 3650 ? days : undefined;
}
export function normalizeSettings(value: unknown): SavedSettings {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const result = { ...raw, ...DEFAULT_SETTINGS } as SavedSettings;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const candidate = raw[key];
    const valid = key in OPTIONS ? (OPTIONS[key as keyof typeof OPTIONS] as readonly unknown[]).includes(candidate)
      : key === 'projectDuration' ? typeof candidate === 'number' && parseDuration(String(candidate)) === candidate
      : typeof candidate === 'boolean';
    if (valid) Object.assign(result, { [key]: candidate });
  }
  return result;
}
export function decodeSettings(raw: string | null): SavedSettings {
  try { return normalizeSettings(raw ? JSON.parse(raw) : null); }
  catch { return normalizeSettings(null); }
}
export function formatDate(value: string, format: Settings['dateFormat']): string {
  const date = readDate(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown date';
  const day = String(date.getDate()).padStart(2, '0'), month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).padStart(4, '0');
  if (format === 'YYYY-MM-DD') return `${year}-${month}-${day}`;
  if (format === 'DD MMM YYYY') return `${day} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][date.getMonth()]} ${year}`;
  return `${day}/${month}/${year}`;
}
export function startRoute(screen: Settings['startScreen'], pathname: string) {
  if (pathname !== '/') return undefined;
  return screen === 'Projects' ? '/projects' : screen === 'To-do' ? '/tasks' : undefined;
}
export function resolveTheme(theme: Settings['theme'], system: string | null | undefined) {
  return theme === 'Dark' || (theme === 'System' && system === 'dark') ? 'dark' : 'light';
}
export function personalInitial(settings: Settings, task?: PersonalTask): PersonalInput {
  return task ? { ...task, recurrence: { ...task.recurrence } }
    : { ...PERSONAL_DEFAULTS, priority: settings.defaultPriority, recurrence: { ...PERSONAL_DEFAULTS.recurrence } };
}
export function applyReminderDefault(input: PersonalInput, settings: Settings, existing: boolean, touched: boolean): PersonalInput {
  if (existing || touched) return input;
  return { ...input, reminder: input.dueTime && personalDueAt(input) ? settings.defaultReminder : 'None' };
}
export function todoEmptyMessage(settings: Settings, filter: string) {
  if (!settings.showPersonal && !settings.showProjects) return 'Personal and project tasks are hidden. Enable them in Settings.';
  if (filter === 'Personal' && !settings.showPersonal) return 'Personal tasks are hidden in Settings.';
  if (filter === 'Projects' && !settings.showProjects) return 'Project tasks are hidden in Settings.';
  return 'Your work is clear for now.';
}
export const HELP = {
  'Data & Backup': 'Create Backup saves a restorable JSON file with your data and preferences. Restore replaces current data only after confirmation. Save a backup first. Excel-compatible CSV is for reporting and cannot restore the app. Files are saved to the folder you select; you can share them from Android Files.',
  Projects: 'Create a project from a template to generate its workflow tasks. Use Add Task inside a project for an extra task with its own due date. Active, Completed and Archived separate project records without deleting history.',
  Templates: 'Create, rename or delete templates and their steps. Hold a step to drag it into a new position. Saving a master template updates linked projects. Existing dates and completed history are protected; manual tasks stay independent.',
  'To-do': 'Add To-do creates a personal task without a project. Open shows overdue work, today and the next 7 calendar days, with undated personal work under Unscheduled. Completed keeps finished records. All, Personal and Projects filter either view. Tap the completion circle to finish or reopen a task. Tap a personal task or its pencil to edit it; Delete Task in the edit form asks for confirmation. Completing a repeating personal task creates its next occurrence.',
  Reminders: 'Personal reminders need a time. Without a date they use the next eligible local time. Daily repeat can omit a date; Weekly and Monthly need an anchor date. Project reminders follow the project cadence. Enable Notifications here and allow notifications in Android settings. Turning notifications off keeps your saved reminder choices.',
};
