import type { Project, ProjectTask } from '@/context/FlowContext';

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// Parse a calendar date in local time, without UTC date-only parsing or rollover.
export function parseTaskDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function localDateValue(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function readDate(value: string | null | undefined): Date {
  if (typeof value !== 'string' || !value.trim()) return new Date(NaN);
  // Date-only strings represent local dates, not UTC midnight.
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseTaskDate(value) ?? new Date(NaN) : new Date(value);
}

export function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function calendarDaysUntil(value: string, today = new Date()): number {
  const target = readDate(value);
  // Compare calendar labels on a synthetic UTC axis, not elapsed local hours.
  const dayNumber = (date: Date) => {
    const label = new Date(0);
    label.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    return label.getTime() / 86400000;
  };
  return dayNumber(target) - dayNumber(today);
}

export function projectStartDate(project: Project, tasks: ProjectTask[] = []): Date {
  const explicit = project.projectStartDate && parseTaskDate(project.projectStartDate);
  if (explicit) return explicit;
  const legacy = readDate(project.startDate);
  if (Number.isFinite(legacy.getTime())) return legacy;
  // Only used for malformed/older records lacking startDate as well.
  let elapsed = 0;
  for (const task of tasks.filter((item) => item.projectId === project.id && !item.isManual).sort((a, b) => a.order - b.order)) {
    elapsed += Number.isFinite(task.duration) ? task.duration : 0;
    const due = readDate(task.dueDate);
    if (Number.isFinite(due.getTime())) return addCalendarDays(due, -elapsed);
  }
  const deadline = readDate(project.dueDate);
  return Number.isFinite(deadline.getTime()) ? deadline : parseTaskDate(localDateValue())!;
}

export function openTasksByDueDate(tasks: ProjectTask[]) {
  return tasks.filter((task) => task.status === 'todo')
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
}
