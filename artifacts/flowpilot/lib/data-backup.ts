import type { Project, ProjectTask, WorkflowTemplate } from '@/context/FlowContext';
import { PRIORITIES, REMINDERS, REPEATS, type PersonalTask } from '@/lib/personal-tasks';
import { DEFAULT_SETTINGS, OPTIONS, normalizeSettings, parseDuration, type SavedSettings } from '@/lib/settings';
import { PROJECT_STATUSES, projectStatus } from '@/lib/project-management';
import { parseTaskDate, readDate } from '@/lib/task-utils';

export const BACKUP_FORMAT = 'GULABANI_BACKUP';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
export type AppData = { projects: Project[]; tasks: ProjectTask[]; templates: WorkflowTemplate[]; personalTasks: PersonalTask[]; settings: SavedSettings };
export type Backup = { format: typeof BACKUP_FORMAT; version: number; app: 'GULABANI'; createdAt: string; data: AppData };
type RecordValue = Record<string, unknown>;
const object = (value: unknown): value is RecordValue => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string';
const id = (value: unknown): value is string => text(value) && value.trim().length > 0;
const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const boolean = (value: unknown) => typeof value === 'boolean';
const enumValue = (values: readonly unknown[]) => (value: unknown) => values.includes(value);
const date = (value: unknown) => text(value) && (/^\d{4}-\d{2}-\d{2}$/.test(value) ? !!parseTaskDate(value) : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !!parseTaskDate(value.slice(0, 10)) && Number.isFinite(readDate(value).getTime()));
const optional = (record: RecordValue, key: string, check: (value: unknown) => boolean) => record[key] === undefined || check(record[key]);
const fail = (detail: string): never => { throw new Error(`This file is not a valid GULABANI backup. ${detail}`); };
const requireValue = (condition: unknown, detail: string) => { if (!condition) fail(detail); };
const derived = new Set(['progress', 'percent', 'health', 'workflowState', 'ready', 'blocked', 'workflowCounts', 'impactCounts', 'dashboardCounts', 'potentiallyImpacted']);

// Strip only known derived record fields. Preserve harmless unknown fields and all
// actual historical values; never trim names, reassign IDs or recalculate dates.
function recordCopy<T>(record: T): T {
  return Object.fromEntries(Object.entries(record as RecordValue).filter(([key]) => !derived.has(key))) as T;
}
export function snapshotData(data: AppData): AppData {
  const clone = JSON.parse(JSON.stringify(data)) as AppData;
  return { projects: clone.projects.map(recordCopy), tasks: clone.tasks.map(recordCopy),
    templates: clone.templates.map((template) => ({ ...recordCopy(template), steps: template.steps.map(recordCopy) })),
    personalTasks: clone.personalTasks.map(recordCopy), settings: normalizeSettings(clone.settings) };
}
export function createBackup(data: AppData, now = new Date()): Backup {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, app: 'GULABANI', createdAt: now.toISOString(), data: snapshotData(data) };
}
export function utf8Size(value: string) {
  let size = 0;
  for (const char of value) { const point = char.codePointAt(0)!; size += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4; }
  return size;
}
export function serializeBackup(data: AppData, now = new Date()) {
  const raw = JSON.stringify(createBackup(data, now), null, 2);
  if (utf8Size(raw) > MAX_BACKUP_BYTES) throw new Error('This backup exceeds the supported 20 MB limit. No data has been changed.');
  return raw;
}

function safeTree(value: unknown) {
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  while (pending.length) {
    const current = pending.pop()!;
    requireValue(current.depth <= 100, 'The data is nested too deeply.');
    if (current.value && typeof current.value === 'object') for (const [key, child] of Object.entries(current.value)) {
      requireValue(!['__proto__', 'prototype', 'constructor'].includes(key), 'Unsafe object fields.');
      pending.push({ value: child, depth: current.depth + 1 });
    }
  }
}
function records(value: unknown, label: string): RecordValue[] {
  requireValue(Array.isArray(value), `${label} must be a list.`);
  const list = value as unknown[];
  requireValue(list.every(object), `${label} contains an invalid record.`);
  return list as RecordValue[];
}
function unique(records: RecordValue[], key: (record: RecordValue) => string, label: string) {
  const seen = new Set<string>();
  for (const record of records) {
    requireValue(id(record.id), `${label} needs an ID.`);
    const value = key(record);
    requireValue(!seen.has(value), `${label} contains duplicate IDs.`); seen.add(value);
  }
}
function step(record: RecordValue) {
  requireValue(id(record.id) && text(record.title) && text(record.description) && numeric(record.duration) && record.duration >= 0 && Number.isInteger(record.duration), 'Invalid task or template step.');
}

export function validateData(value: unknown): AppData {
  requireValue(object(value), 'Missing data.');
  const data = value as RecordValue;
  safeTree(data);
  const projects = records(data.projects, 'Projects'), tasks = records(data.tasks, 'Project tasks'), templates = records(data.templates, 'Templates');
  const personal = records(data.personalTasks === undefined ? [] : data.personalTasks, 'Personal tasks');
  unique(projects, (r) => String(r.id), 'Projects'); unique(templates, (r) => String(r.id), 'Templates'); unique(personal, (r) => String(r.id), 'Personal tasks');
  unique(tasks, (r) => JSON.stringify([r.projectId, r.id]), 'Project tasks');
  const projectIds = new Set(projects.map((r) => r.id));
  for (const p of projects) {
    requireValue(['name', 'client', 'summary', 'templateId'].every((key) => text(p[key])) && date(p.startDate) && date(p.dueDate), 'Invalid project fields or dates.');
    requireValue(optional(p, 'projectStartDate', (v) => text(v) && !!parseTaskDate(v)) && optional(p, 'status', enumValue(PROJECT_STATUSES)) && optional(p, 'archived', boolean) && optional(p, 'remindersEnabled', boolean) && enumValue(['Daily', 'Every 2 days', 'Weekly'])(p.reminderFrequency), 'Invalid project preferences.');
  }
  for (const t of templates) {
    requireValue(['name', 'category', 'description', 'color'].every((key) => text(t[key])), 'Invalid template fields.');
    const steps = records(t.steps, 'Template steps'); unique(steps, (r) => String(r.id), 'Template steps'); steps.forEach(step);
  }
  const byProject = new Map<string, Map<string, RecordValue>>();
  for (const t of tasks) {
    step(t);
    requireValue(id(t.projectId) && projectIds.has(t.projectId), 'A task references a missing project.');
    requireValue(enumValue(['todo', 'done'])(t.status) && (t.dueDate === '' || date(t.dueDate)) && numeric(t.order) && Number.isInteger(t.order) && t.order >= 0 && optional(t, 'completedAt', date) && optional(t, 'isManual', boolean), 'Invalid project task fields or dates.');
    requireValue(optional(t, 'dependsOn', (v) => Array.isArray(v) && v.every(id)), 'Invalid dependency list.');
    const owned = byProject.get(t.projectId as string) ?? new Map(); owned.set(t.id as string, t); byProject.set(t.projectId as string, owned);
  }
  // Kahn's algorithm validates each project graph in linear time, including deep chains.
  for (const owned of byProject.values()) {
    const degrees = new Map<string, number>(), children = new Map<string, string[]>();
    for (const [taskId, t] of owned) {
      const deps = [...new Set((t.dependsOn ?? []) as string[])]; degrees.set(taskId, deps.length);
      for (const dependency of deps) {
        requireValue(dependency !== taskId && owned.has(dependency), 'A dependency references itself, a missing task or another project.');
        const list = children.get(dependency) ?? []; list.push(taskId); children.set(dependency, list);
      }
    }
    const ready = [...degrees].filter(([, count]) => !count).map(([taskId]) => taskId); let visited = 0;
    while (ready.length) { const taskId = ready.pop()!; visited++; for (const child of children.get(taskId) ?? []) { const count = degrees.get(child)! - 1; degrees.set(child, count); if (!count) ready.push(child); } }
    requireValue(visited === owned.size, 'The dependency graph contains a circular workflow.');
  }
  const personalIds = new Map(personal.map((t) => [t.id, t]));
  for (const t of personal) {
    requireValue(text(t.title) && enumValue(['todo', 'done'])(t.status) && date(t.createdAt) && optional(t, 'completedAt', date) && optional(t, 'dueDate', (v) => text(v) && !!parseTaskDate(v)), 'Invalid personal task fields or dates.');
    requireValue(optional(t, 'dueTime', (v) => text(v) && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) && !!t.dueDate) && enumValue(PRIORITIES)(t.priority) && text(t.notes) && enumValue(REMINDERS)(t.reminder), 'Invalid personal task preferences.');
    requireValue(object(t.recurrence) && enumValue(REPEATS)((t.recurrence as RecordValue).frequency), 'Invalid recurrence.');
    const recurrence = t.recurrence as RecordValue;
    requireValue(optional(recurrence, 'anchorDay', (v) => numeric(v) && Number.isInteger(v) && v >= 1 && v <= 31) && (recurrence.frequency === 'None' || !!t.dueDate), 'Invalid recurrence date.');
    requireValue(id(t.seriesId) && numeric(t.occurrence) && Number.isInteger(t.occurrence) && t.occurrence >= 0 && optional(t, 'nextOccurrenceId', id), 'Invalid recurrence history.');
    if (t.nextOccurrenceId && personalIds.has(t.nextOccurrenceId)) requireValue(t.nextOccurrenceId !== t.id && personalIds.get(t.nextOccurrenceId)!.seriesId === t.seriesId && Number(personalIds.get(t.nextOccurrenceId)!.occurrence) > Number(t.occurrence), 'Invalid recurrence chain.');
    requireValue(t.reminder === 'None' || (!!t.dueDate && !!t.dueTime), 'A personal reminder needs a date and time.');
  }
  requireValue(data.settings === undefined || object(data.settings), 'Settings must be an object.');
  const settings = (data.settings ?? {}) as RecordValue;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (settings[key] === undefined) continue;
    const candidate = settings[key];
    requireValue(key in OPTIONS ? enumValue(OPTIONS[key as keyof typeof OPTIONS])(candidate) : key === 'projectDuration' ? numeric(candidate) && parseDuration(String(candidate)) === candidate : boolean(candidate), 'Invalid settings preference.');
  }
  return snapshotData({ projects, tasks, templates, personalTasks: personal, settings: normalizeSettings(settings) } as unknown as AppData);
}

export function parseBackup(raw: string): Backup {
  if (typeof raw !== 'string' || raw.length > MAX_BACKUP_BYTES || utf8Size(raw) > MAX_BACKUP_BYTES) fail('The file is too large (20 MB maximum).');
  let value: unknown;
  try { value = JSON.parse(raw.replace(/^\uFEFF/, '')); } catch { return fail('The JSON could not be read.'); }
  requireValue(object(value) && value.format === BACKUP_FORMAT, 'Incorrect backup format.');
  const record = value as RecordValue;
  if (record.version !== BACKUP_VERSION) throw new Error('This backup version is not supported.');
  requireValue(record.app === 'GULABANI' && date(record.createdAt), 'Missing backup metadata.');
  safeTree(record);
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, app: 'GULABANI', createdAt: record.createdAt as string, data: validateData(record.data) };
}

export function dataSummary(data: Pick<AppData, 'projects' | 'tasks' | 'templates' | 'personalTasks'>) {
  return { Projects: data.projects.length, 'Archived Projects': data.projects.filter((p) => p.archived === true).length,
    Templates: data.templates.length, 'Project Tasks': data.tasks.length, 'Personal To-dos': data.personalTasks.length,
    'Completed Projects': data.projects.filter((p) => projectStatus(p, data.tasks) === 'Completed').length,
    'Completed Tasks': data.tasks.filter((t) => t.status === 'done').length + data.personalTasks.filter((t) => t.status === 'done').length };
}
