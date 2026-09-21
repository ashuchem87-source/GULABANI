import type { ProjectTask } from '@/context/FlowContext';
import { TODO_DEFAULTS, type PersonalTask, type TodoEntry } from '@/lib/personal-tasks';
import { calendarDaysUntil, readDate } from '@/lib/task-utils';

export const DASHBOARD_LIMIT = 5;
export type DashboardBucket = 'today' | 'overdue' | 'upcoming' | 'completed' | 'unscheduled';
export type DashboardGroups = Record<DashboardBucket, TodoEntry[]>;

// Compare local calendar labels only. Due time affects order, never the bucket.
export function dashboardBucket(entry: TodoEntry, today: Date): DashboardBucket | null {
  const task = entry.task;
  if (task.status === 'done') {
    return task.completedAt && calendarDaysUntil(task.completedAt, today) === 0 ? 'completed' : null;
  }
  if (task.status !== 'todo') return null;
  if (!task.dueDate) return entry.kind === 'personal' ? 'unscheduled' : null;
  const days = calendarDaysUntil(task.dueDate, today);
  if (!Number.isFinite(days)) return null;
  return days < 0 ? 'overdue' : days > 0 ? 'upcoming' : 'today';
}

export function dashboardGroups(projectTasks: ProjectTask[], personalTasks: PersonalTask[], calendarDate: string, visibility = TODO_DEFAULTS): DashboardGroups {
  const today = readDate(calendarDate);
  const entries: TodoEntry[] = [];
  if (visibility.showProjects) for (const task of projectTasks) entries.push({ kind: 'project', task });
  if (visibility.showPersonal) for (const task of personalTasks) entries.push({ kind: 'personal', task });
  const groups: DashboardGroups = { today: [], overdue: [], upcoming: [], completed: [], unscheduled: [] };
  // Decorate once for sorting; preserve stored order for all ties and unscheduled work.
  const decorated = entries.map((entry, index) => {
    const time = entry.kind === 'personal' ? entry.task.dueTime : undefined;
    return { entry, index, day: entry.task.dueDate ? calendarDaysUntil(entry.task.dueDate, today) : Infinity,
      time: time && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : Infinity,
      completed: readDate(entry.task.completedAt).getTime(), bucket: dashboardBucket(entry, today) };
  });
  decorated.sort((a, b) => {
    if (a.bucket === 'completed' && b.bucket === 'completed') return b.completed - a.completed || a.index - b.index;
    if (a.bucket === 'unscheduled' && b.bucket === 'unscheduled') return a.index - b.index;
    // Different buckets are grouped below, so keep a total order between them too.
    if (a.bucket !== b.bucket) return String(a.bucket).localeCompare(String(b.bucket));
    return a.day - b.day || a.time - b.time || a.index - b.index;
  });
  for (const { entry, bucket } of decorated) {
    if (bucket && (bucket !== 'completed' || visibility.showCompleted)) groups[bucket].push(entry);
  }
  return groups;
}
export function dashboardCounts(groups: DashboardGroups): Record<DashboardBucket, number> {
  return { today: groups.today.length, overdue: groups.overdue.length, upcoming: groups.upcoming.length,
    completed: groups.completed.length, unscheduled: groups.unscheduled.length };
}
// Shared workflow step IDs are scoped to their owning project.
export function dashboardEntryKey(entry: TodoEntry): string {
  return entry.kind === 'project' ? JSON.stringify(['project', entry.task.projectId, entry.task.id]) : JSON.stringify(['personal', entry.task.id]);
}
