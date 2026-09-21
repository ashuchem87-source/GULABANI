import type { ProjectTask } from '@/context/FlowContext';
import { addCalendarDays, localDateValue, parseTaskDate, readDate } from '@/lib/task-utils';

export const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
export const REMINDERS = ['None', 'At due time', '10 minutes before', '1 hour before', '1 day before'] as const;
export const REPEATS = ['None', 'Daily', 'Weekly', 'Monthly'] as const;
export type PersonalInput = {
  title: string;
  dueDate?: string; // Local YYYY-MM-DD, independent of a project or timezone offset.
  dueTime?: string; // Local HH:mm; requires a date.
  priority: typeof PRIORITIES[number];
  notes: string;
  reminder: typeof REMINDERS[number];
  recurrence: { frequency: typeof REPEATS[number]; anchorDay?: number };
};
export type PersonalTask = PersonalInput & {
  id: string;
  status: 'todo' | 'done';
  createdAt: string;
  completedAt?: string;
  seriesId: string;
  occurrence: number;
  nextOccurrenceId?: string;
};
export const PERSONAL_DEFAULTS: PersonalInput = {
  title: '', priority: 'Medium', notes: '', reminder: 'None', recurrence: { frequency: 'None' },
};

export function personalDueAt(input: Pick<PersonalInput, 'dueDate' | 'dueTime'>): Date | null {
  const date = input.dueDate ? parseTaskDate(input.dueDate) : null;
  if (!date) return null;
  if (input.dueTime) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.dueTime)) return null;
    const [hours, minutes] = input.dueTime.split(':').map(Number);
    date.setHours(hours, minutes, 0, 0);
    // Reject nonexistent local times during a spring-forward gap.
    if (date.getHours() !== hours || date.getMinutes() !== minutes) return null;
  }
  return date;
}

export function personalReminderAt(input: PersonalInput): Date | null {
  if (input.reminder === 'None' || !input.dueTime) return null;
  const due = personalDueAt(input);
  if (!due) return null;
  if (input.reminder === '1 day before') return addCalendarDays(due, -1);
  const minutes = input.reminder === '10 minutes before' ? 10 : input.reminder === '1 hour before' ? 60 : 0;
  return new Date(due.getTime() - minutes * 60000);
}

export function validatePersonal(input: PersonalInput, now = new Date(), completed = false): string | null {
  if (!input.title.trim()) return 'Enter a task name.';
  if (!PRIORITIES.includes(input.priority)) return 'Choose a valid priority.';
  if (!REMINDERS.includes(input.reminder)) return 'Choose a valid reminder.';
  if (!REPEATS.includes(input.recurrence.frequency)) return 'Choose a valid repeat option.';
  if (input.dueDate && !parseTaskDate(input.dueDate)) return 'Enter a valid due date as YYYY-MM-DD.';
  if (input.dueTime && !input.dueDate) return 'Choose a due date before entering a time.';
  if (input.dueTime && !personalDueAt(input)) return 'Enter a valid local time as HH:mm (24-hour time).';
  if (input.recurrence.frequency !== 'None' && !input.dueDate) return 'Choose a due date for a repeating task.';
  if (input.reminder !== 'None') {
    const reminder = personalReminderAt(input);
    if (!input.dueDate || !input.dueTime || !reminder) return 'A reminder needs both a due date and a due time.';
    if (!completed && reminder.getTime() <= now.getTime()) return 'The reminder time has passed. Choose a future date/time or None.';
  }
  return null;
}

export function personalFields(input: PersonalInput, previous?: PersonalTask): PersonalInput {
  const dueDate = input.dueDate?.trim() || undefined;
  const anchorDay = input.recurrence.frequency === 'Monthly' && dueDate
    ? previous?.dueDate === dueDate && previous.recurrence.frequency === 'Monthly'
      ? previous.recurrence.anchorDay ?? parseTaskDate(dueDate)!.getDate()
      : parseTaskDate(dueDate)!.getDate()
    : undefined;
  return {
    title: input.title.trim(), dueDate, dueTime: input.dueTime?.trim() || undefined,
    priority: input.priority, notes: input.notes, reminder: input.reminder,
    recurrence: { frequency: input.recurrence.frequency, ...(anchorDay ? { anchorDay } : {}) },
  };
}

export function completePersonal(tasks: PersonalTask[], id: string, now = new Date()): PersonalTask[] {
  const task = tasks.find((item) => item.id === id);
  if (!task || task.status === 'done') return tasks;
  let next: PersonalTask | undefined;
  const due = task.dueDate ? parseTaskDate(task.dueDate) : null;
  if (due && task.recurrence.frequency !== 'None' && !task.nextOccurrenceId) {
    let nextDate: Date;
    if (task.recurrence.frequency === 'Monthly') {
      const anchor = task.recurrence.anchorDay ?? due.getDate();
      const lastDay = new Date(due.getFullYear(), due.getMonth() + 2, 0).getDate();
      nextDate = new Date(due.getFullYear(), due.getMonth() + 1, Math.min(anchor, lastDay));
    } else nextDate = addCalendarDays(due, task.recurrence.frequency === 'Weekly' ? 7 : 1);
    next = { ...task, id: `${task.seriesId}:occurrence:${task.occurrence + 1}`, occurrence: task.occurrence + 1,
      dueDate: localDateValue(nextDate), status: 'todo', createdAt: now.toISOString(), completedAt: undefined,
      recurrence: task.recurrence.frequency === 'Monthly' ? { ...task.recurrence, anchorDay: task.recurrence.anchorDay ?? due.getDate() } : { ...task.recurrence },
      nextOccurrenceId: undefined };
  }
  const updated = tasks.map((item) => item.id === id ? {
    ...item, status: 'done' as const, completedAt: now.toISOString(), nextOccurrenceId: task.nextOccurrenceId ?? next?.id,
  } : item);
  return next && !updated.some((item) => item.id === next!.id) ? [...updated, next] : updated;
}

export type TodoFilter = 'All' | 'Personal' | 'Projects';
export type TodoEntry = { kind: 'personal'; task: PersonalTask } | { kind: 'project'; task: ProjectTask };
export const TODO_DEFAULTS = { showPersonal: true, showProjects: true, showCompleted: true };
export function todoEntries(projectTasks: ProjectTask[], personalTasks: PersonalTask[], filter: TodoFilter = 'All', options = TODO_DEFAULTS): TodoEntry[] {
  const entries: TodoEntry[] = [];
  if (options.showProjects && filter !== 'Personal') entries.push(...projectTasks.map((task) => ({ kind: 'project' as const, task })));
  if (options.showPersonal && filter !== 'Projects') entries.push(...personalTasks.map((task) => ({ kind: 'personal' as const, task })));
  const due = (entry: TodoEntry) => entry.kind === 'project' ? readDate(entry.task.dueDate).getTime() : personalDueAt(entry.task)?.getTime() ?? Infinity;
  const priority = (entry: TodoEntry) => entry.kind === 'personal' ? PRIORITIES.indexOf(entry.task.priority) : 1;
  return entries.filter((entry) => options.showCompleted || entry.task.status !== 'done').sort((a, b) =>
    Number(a.task.status === 'done') - Number(b.task.status === 'done') ||
    (a.task.status === 'done' ? 0 : due(a) - due(b) || priority(b) - priority(a)));
}
