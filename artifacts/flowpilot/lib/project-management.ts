import type { Project, ProjectTask } from '@/context/FlowContext';
import { calendarDaysUntil, readDate } from '@/lib/task-utils';

export const PROJECT_STATUSES = ['Not Started', 'Active', 'On Hold', 'Completed'] as const;
export type ProjectStatus = typeof PROJECT_STATUSES[number];
export type ProjectHealth = ProjectStatus | 'On Track' | 'Attention Needed';

export function projectProgress(projectId: string, tasks: ProjectTask[]) {
  const owned = tasks.filter((task) => task.projectId === projectId);
  const total = owned.length, completed = owned.filter((task) => task.status === 'done').length;
  return { total, completed, incomplete: total - completed,
    percent: total ? Math.max(0, Math.min(100, Math.round(completed / total * 100))) : 0 };
}
export function projectStatus(project: Project, tasks: ProjectTask[]): ProjectStatus {
  if (PROJECT_STATUSES.includes(project.status as ProjectStatus)) return project.status!;
  const { total, incomplete } = projectProgress(project.id, tasks);
  return total > 0 && incomplete === 0 ? 'Completed' : 'Active';
}
export function isArchived(project: Project): boolean { return project.archived === true; }
export function availableProjects(projects: Project[]) { return projects.filter((project) => !isArchived(project)); }
export function visibleProjects(projects: Project[], tasks: ProjectTask[], archived: boolean, showCompleted: boolean) {
  return projects.filter((project) => isArchived(project) === archived &&
    (archived || showCompleted || projectStatus(project, tasks) !== 'Completed'));
}
export function normalProjectTasks(tasks: ProjectTask[], projects: Project[] = []) {
  const archivedIds = new Set(projects.filter(isArchived).map((project) => project.id));
  return tasks.filter((task) => !archivedIds.has(task.projectId));
}
export function projectHealth(project: Project, tasks: ProjectTask[], calendarDate: string): ProjectHealth {
  const status = projectStatus(project, tasks);
  if (status !== 'Active') return status;
  const today = readDate(calendarDate);
  return calendarDaysUntil(project.dueDate, today) < 0 || tasks.some((task) =>
    task.projectId === project.id && task.status !== 'done' && calendarDaysUntil(task.dueDate, today) < 0)
    ? 'Attention Needed' : 'On Track';
}
// Transitions run only for a task event, never during hydration/render/date refresh.
// A manual Completed choice survives existing unfinished work until new work is added/reopened.
export function transitionProject(project: Project, before: ProjectTask[], after: ProjectTask[], event: 'complete' | 'reopen' | 'add'): Project {
  if (isArchived(project)) return project;
  const status = projectStatus(project, before);
  const progress = projectProgress(project.id, after);
  let next = status;
  if (event === 'complete' && progress.total > 0 && progress.incomplete === 0) next = 'Completed';
  else if ((event === 'reopen' || event === 'add') && status === 'Completed') next = 'Active';
  return next === status ? project : { ...project, status: next };
}
