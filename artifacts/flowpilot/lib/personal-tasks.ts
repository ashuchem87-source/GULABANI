import type { ProjectTask } from '@/context/FlowContext';
import { addCalendarDays, localDateValue, parseTaskDate, readDate } from '@/lib/task-utils';

export const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
export const REMINDERS = ['None', 'At due time', '10 minutes before', '1 hour before', '1 day before'] as const;
export const REPEATS = ['None', 'Daily', 'Weekly', 'Monthly'] as const;
export type PersonalInput = {
  title: string;
  dueDate?: string; // Local YYYY-MM-DD, independent of a project or timezone offset.
  dueTime?: string; // Local HH:mm, independent of due date.
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
  availableFrom?: string; // Earliest local day of an undated daily occurrence, not a due date.
};
export const PERSONAL_DEFAULTS: PersonalInput = {
  title: '', priority: 'Medium', notes: '', reminder: 'None', recurrence: { frequency: 'None' },
};

export const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) =>
  String(Math.floor(index / 2)).padStart(2, '0') + ':' + (index % 2 ? '30' : '00'));

type PersonalSchedule = Pick<PersonalInput, 'dueDate' | 'dueTime'> & Partial<Pick<PersonalInput, 'recurrence'>> & { availableFrom?: string };
export function personalDay(input: PersonalSchedule, now = new Date()): string | undefined {
  if (input.dueDate) return input.dueDate;
  if (!input.dueTime && input.recurrence?.frequency !== 'Daily') return undefined;
  const today = localDateValue(now);
  return input.recurrence?.frequency === 'Daily' && input.availableFrom && input.availableFrom > today ? input.availableFrom : today;
}
export function personalDueAt(input: PersonalSchedule, now = new Date()): Date | null {
  const day = personalDay(input, now);
  const date = day ? parseTaskDate(day) : null;
  if (!date) return null;
  if (input.dueTime) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.dueTime)) return null;
    const [hours, minutes] = input.dueTime.split(':').map(Number);
    date.setHours(hours, minutes, 0, 0);
    if (date.getHours() !== hours || date.getMinutes() !== minutes) return null;
  }
  return date;
}
export function personalReminderAt(input: PersonalInput & { availableFrom?: string }, now = new Date()): Date | null {
  if (input.reminder === 'None' || !input.dueTime) return null;
  const offset = (due: Date) => input.reminder === '1 day before' ? addCalendarDays(due, -1)
    : new Date(due.getTime() - (input.reminder === '10 minutes before' ? 10 : input.reminder === '1 hour before' ? 60 : 0) * 60000);
  if (input.dueDate) { const due = personalDueAt(input, now); return due ? offset(due) : null; }
  // Schedule one next local occurrence. Reconciliation on foreground/midnight
  // advances it without storing an invented date or creating duplicate IDs.
  const day = personalDay(input, now);
  const first = day && parseTaskDate(day);
  if (!first) return null;
  for (let days = 0; days < 4; days++) {
    const due = personalDueAt({ ...input, dueDate: localDateValue(addCalendarDays(first, days)) }, now);
    const reminder = due && offset(due);
    if (reminder && reminder.getTime() > now.getTime()) return reminder;
  }
  return null;
}

export function validatePersonal(input: PersonalInput, now = new Date(), completed = false, previous?: PersonalTask): string | null {
  if (!input.title.trim()) return 'Enter a task name.';
  if (!PRIORITIES.includes(input.priority)) return 'Choose a valid priority.';
  if (!REMINDERS.includes(input.reminder)) return 'Choose a valid reminder.';
  if (!REPEATS.includes(input.recurrence.frequency)) return 'Choose a valid repeat option.';
  if (input.dueDate && !parseTaskDate(input.dueDate)) return 'Enter a valid due date as YYYY-MM-DD.';
  if (input.dueTime && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.dueTime) || (input.dueDate && !personalDueAt(input, now)))) return 'Enter a valid local time as HH:mm (24-hour time).';
  if (['Weekly', 'Monthly'].includes(input.recurrence.frequency) && !input.dueDate) return 'Choose an anchor date for Weekly or Monthly repeat.';
  if (input.reminder !== 'None') {
    const reminder = personalReminderAt(input, now);
    if (!input.dueTime || !reminder) return 'A reminder needs a valid due time.';
    if (!completed && reminder.getTime() <= now.getTime() && !(previous && previous.dueDate === input.dueDate && previous.dueTime === input.dueTime && previous.reminder === input.reminder && previous.recurrence.frequency === input.recurrence.frequency)) return 'The reminder time has passed. Choose a future date/time or None.';
  }
  return null;
}

export function personalFields(input: PersonalInput, previous?: PersonalTask): PersonalInput & { availableFrom?: string } {
  const dueDate = input.dueDate?.trim() || undefined;
  const anchorDay = input.recurrence.frequency === 'Monthly' && dueDate
    ? previous?.dueDate === dueDate && previous.recurrence.frequency === 'Monthly'
      ? previous.recurrence.anchorDay ?? parseTaskDate(dueDate)!.getDate()
      : parseTaskDate(dueDate)!.getDate()
    : undefined;
  return {
    title: input.title.trim(), dueDate, dueTime: input.dueTime?.trim() || undefined,
    priority: input.priority, notes: input.notes, reminder: input.reminder,
    availableFrom: !dueDate && input.recurrence.frequency === 'Daily' && previous?.recurrence.frequency === 'Daily' && !previous.dueDate ? previous.availableFrom : undefined,
    recurrence: { frequency: input.recurrence.frequency, ...(anchorDay ? { anchorDay } : {}) },
  };
}

export function completePersonal(tasks: PersonalTask[], id: string, now = new Date()): PersonalTask[] {
  const task = tasks.find((item) => item.id === id);
  if (!task || task.status === 'done') return tasks;
  let next: PersonalTask | undefined;
  const undatedDaily = !task.dueDate && task.recurrence.frequency === 'Daily';
  const due = task.dueDate ? parseTaskDate(task.dueDate) : undatedDaily ? parseTaskDate(personalDay(task, now)!) : null;
  if (due && task.recurrence.frequency !== 'None' && !task.nextOccurrenceId) {
    let nextDate: Date;
    if (task.recurrence.frequency === 'Monthly') {
      const anchor = task.recurrence.anchorDay ?? due.getDate();
      const lastDay = new Date(due.getFullYear(), due.getMonth() + 2, 0).getDate();
      nextDate = new Date(due.getFullYear(), due.getMonth() + 1, Math.min(anchor, lastDay));
    } else nextDate = addCalendarDays(due, task.recurrence.frequency === 'Weekly' ? 7 : 1);
    next = { ...task, id: `${task.seriesId}:occurrence:${task.occurrence + 1}`, occurrence: task.occurrence + 1,
      dueDate: undatedDaily ? undefined : localDateValue(nextDate), availableFrom: undatedDaily ? localDateValue(nextDate) : undefined, status: 'todo', createdAt: now.toISOString(), completedAt: undefined,
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
export function todoEntries(projectTasks: ProjectTask[], personalTasks: PersonalTask[], filter: TodoFilter = 'All', options = TODO_DEFAULTS, now = new Date()): TodoEntry[] {
  const entries: TodoEntry[] = [];
  if (options.showProjects && filter !== 'Personal') entries.push(...projectTasks.map((task) => ({ kind: 'project' as const, task })));
  if (options.showPersonal && filter !== 'Projects') entries.push(...personalTasks.map((task) => ({ kind: 'personal' as const, task })));
  const due = (entry: TodoEntry) => entry.kind === 'project' ? readDate(entry.task.dueDate).getTime() : personalDueAt(entry.task, now)?.getTime() ?? Infinity;
  const priority = (entry: TodoEntry) => entry.kind === 'personal' ? PRIORITIES.indexOf(entry.task.priority) : 1;
  return entries.filter((entry) => options.showCompleted || entry.task.status !== 'done').sort((a, b) =>
    Number(a.task.status === 'done') - Number(b.task.status === 'done') ||
    (a.task.status === 'done' ? 0 : due(a) - due(b) || priority(b) - priority(a)));
}
