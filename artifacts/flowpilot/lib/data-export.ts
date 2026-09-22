import type { AppData } from '@/lib/data-backup';
import { projectProgress, projectHealth, projectStatus } from '@/lib/project-management';
import { dependencyIds, getTaskWorkflowState } from '@/lib/workflow-intelligence';
import { localDateValue } from '@/lib/task-utils';

export const EXPORT_HEADERS = ['Record Type', 'Project ID', 'Project Name', 'Project Status', 'Archived', 'Project Start Date', 'Project Deadline', 'Project Progress %', 'Project Health', 'Task ID', 'Task Name', 'Task Type', 'Task Due Date', 'Due Time', 'Task Completed', 'Task Completed At', 'Task Workflow State', 'Dependency Count', 'Depends On Task IDs', 'Priority', 'Notes', 'Reminder', 'Recurrence'];
export function csvCell(value: unknown): string {
  let cell = String(value ?? '');
  // Quoting alone does not stop Excel formulas. Protect prefixes after whitespace
  // and control characters too; keep the original readable content after the apostrophe.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(cell) || /^[\t\r\n]/.test(cell)) cell = "'" + cell;
  return '"' + cell.replace(/"/g, '""') + '"';
}
export function exportCsv(data: AppData, calendarDate = localDateValue()): string {
  const rows: unknown[][] = [EXPORT_HEADERS];
  const grouped = new Map<string, typeof data.tasks>();
  for (const task of data.tasks) { const list = grouped.get(task.projectId) ?? []; list.push(task); grouped.set(task.projectId, list); }
  for (const project of data.projects) {
    const tasks = grouped.get(project.id) ?? [];
    const taskIndex = new Map(tasks.map((task) => [task.id, task]));
    const prefix = [project.id, project.name, projectStatus(project, tasks), project.archived === true, project.projectStartDate ?? project.startDate, project.dueDate, projectProgress(project.id, tasks).percent, projectHealth(project, tasks, calendarDate)];
    // Keep zero-task projects visible in reports without inventing a task.
    if (!tasks.length) rows.push(['Project', ...prefix, ...Array(14).fill('')]);
    for (const task of tasks) {
      const deps = dependencyIds(task);
      const prerequisites = deps.flatMap((id) => { const found = taskIndex.get(id); return found ? [found] : []; });
      rows.push(['Project Task', ...prefix, task.id, task.title, task.isManual ? 'Manual Project Task' : 'Template', task.dueDate, '', task.status === 'done', task.completedAt ?? '', getTaskWorkflowState(task, prerequisites), deps.length, JSON.stringify(deps), '', task.description, '', '']);
    }
  }
  for (const task of data.personalTasks) rows.push(['Personal To-do', ...Array(8).fill(''), task.id, task.title, 'Personal', task.dueDate ?? '', task.dueTime ?? '', task.status === 'done', task.completedAt ?? '', '', '', '', task.priority, task.notes, task.reminder, task.recurrence.frequency]);
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
export function dataFilename(kind: 'Backup' | 'Projects_Tasks', extension: 'json' | 'csv', now = new Date()) {
  return `GULABANI_${kind}_${now.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')}.${extension}`;
}
