import type { ProjectTask } from '@/context/FlowContext';

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

export function openTasksByDueDate(tasks: ProjectTask[]) {
  return tasks.filter((task) => task.status === 'todo')
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
}
