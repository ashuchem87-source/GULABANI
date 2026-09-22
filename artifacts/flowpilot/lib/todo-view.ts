import type { Project, ProjectTask } from '@/context/FlowContext';
import { personalDay, todoEntries, TODO_DEFAULTS, type PersonalTask, type TodoEntry, type TodoFilter } from '@/lib/personal-tasks';
import { normalProjectTasks } from '@/lib/project-management';
import { calendarDaysUntil, localDateValue, readDate } from '@/lib/task-utils';

export type TodoStatusView = 'Open' | 'Completed';

// Presentation only: keep the full stored collections available to reminders,
// Home and project details. Legacy completed-visibility preferences are ignored
// here because completed records now have a dedicated view.
export function todoGroups(projects: Project[], tasks: ProjectTask[], personalTasks: PersonalTask[],
  calendarDate = localDateValue(), filter: TodoFilter = 'All', visibility = TODO_DEFAULTS) {
  const today = readDate(calendarDate);
  const entries = todoEntries(normalProjectTasks(tasks, projects), personalTasks, filter, { ...visibility, showCompleted: true }, today);
  const open: TodoEntry[] = [], unscheduled: TodoEntry[] = [], completed: TodoEntry[] = [];
  for (const entry of entries) {
    if (entry.task.status === 'done') { completed.push(entry); continue; }
    if (entry.task.status !== 'todo') continue;
    const day = entry.kind === 'personal' ? personalDay(entry.task, today) : entry.task.dueDate;
    if (!day && entry.kind === 'personal') { unscheduled.push(entry); continue; }
    const days = calendarDaysUntil(day ?? '', today);
    if (Number.isFinite(days) && days <= 7) open.push(entry);
  }
  return { open, unscheduled, completed, openCount: open.length + unscheduled.length };
}
