import type { Project, ProjectTask } from '@/context/FlowContext';
import { addCalendarDays, calendarDaysUntil, readDate } from '@/lib/task-utils';

// IDs are scoped to the project: template snapshots can reuse step IDs.
export function dependencyIds(task: ProjectTask): string[] {
  return Array.isArray(task.dependsOn) ? [...new Set(task.dependsOn.filter((id) => typeof id === 'string'))] : [];
}

export function getIncompleteDependencies(task: ProjectTask, tasks: ProjectTask[]) {
  const ids = new Set(dependencyIds(task));
  return tasks.filter((other) => other.projectId === task.projectId && other.id !== task.id && ids.has(other.id) && other.status !== 'done');
}

export function getTaskWorkflowState(task: ProjectTask, tasks: ProjectTask[]) {
  return task.status === 'done' ? 'Completed' : getIncompleteDependencies(task, tasks).length ? 'Blocked' : 'Ready';
}

// Iterative traversal is safe for deep chains and for corrupted stored cycles.
export function wouldCreateCycle(task: ProjectTask, ids: string[], tasks: ProjectTask[]) {
  const byId = new Map(tasks.filter((other) => other.projectId === task.projectId).map((other) => [other.id, other]));
  const pending = [...ids], visited = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === task.id) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    const other = byId.get(id);
    if (other) pending.push(...dependencyIds(other));
  }
  return false;
}

export function validateDependencies(task: ProjectTask, ids: string[], tasks: ProjectTask[]): string | undefined {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) return 'Choose valid prerequisite tasks.';
  if (ids.includes(task.id)) return 'A task cannot depend on itself.';
  if (ids.some((id) => !tasks.some((other) => other.projectId === task.projectId && other.id === id))) return 'Prerequisites must exist in the same project.';
  if (wouldCreateCycle(task, ids, tasks)) return 'This dependency would create a circular workflow.';
}

export function getDownstreamTasks(task: ProjectTask, tasks: ProjectTask[]) {
  const owned = tasks.filter((other) => other.projectId === task.projectId);
  const dependents = new Map<string, string[]>();
  for (const other of owned) for (const id of dependencyIds(other)) {
    const list = dependents.get(id) ?? [];
    list.push(other.id);
    dependents.set(id, list);
  }
  const visited = new Set([task.id]), pending = [task.id];
  while (pending.length) for (const id of dependents.get(pending.pop()!) ?? []) {
    if (!visited.has(id)) { visited.add(id); pending.push(id); }
  }
  const emitted = new Set<string>();
  return owned.filter((other) => {
    if (other.id === task.id || !visited.has(other.id) || emitted.has(other.id)) return false;
    emitted.add(other.id);
    return true;
  });
}

export function overdueDays(task: ProjectTask, calendarDate: string) {
  const days = -calendarDaysUntil(task.dueDate, readDate(calendarDate));
  return task.status !== 'done' && Number.isFinite(days) && days > 0 ? days : 0;
}

export function getOverdueProjectTasks(projectId: string, tasks: ProjectTask[], calendarDate: string) {
  return tasks.filter((task) => task.projectId === projectId && overdueDays(task, calendarDate) > 0);
}

export function getPotentiallyImpactedTasks(projectId: string, tasks: ProjectTask[], calendarDate: string) {
  const ids = new Set(getOverdueProjectTasks(projectId, tasks, calendarDate)
    .flatMap((task) => getDownstreamTasks(task, tasks).filter((other) => other.status !== 'done').map((other) => other.id)));
  return tasks.filter((task) => task.projectId === projectId && ids.has(task.id));
}

export function workflowCounts(projectId: string, tasks: ProjectTask[], calendarDate: string) {
  const open = tasks.filter((task) => task.projectId === projectId && task.status !== 'done');
  const blocked = open.filter((task) => getTaskWorkflowState(task, tasks) === 'Blocked').length;
  return { ready: open.length - blocked, blocked, overdue: getOverdueProjectTasks(projectId, tasks, calendarDate).length,
    impacted: getPotentiallyImpactedTasks(projectId, tasks, calendarDate).length };
}

export function removeTaskAndDependencies(projectId: string, taskId: string, tasks: ProjectTask[]) {
  return tasks.filter((task) => task.projectId !== projectId || task.id !== taskId).map((task) => {
    if (task.projectId !== projectId || !dependencyIds(task).includes(taskId)) return task;
    return { ...task, dependsOn: dependencyIds(task).filter((id) => id !== taskId) };
  });
}

export type RescheduleProposal = {
  projectId: string;
  sourceId: string;
  calendarDate: string;
  shiftDays: number;
  snapshot: string;
  changes: { taskId: string; title: string; from: string; to: string }[];
  undatedCount: number;
  deadline: string;
  proposedDeadline: string;
  beyondDeadlineDays: number;
};

// Temporary preview token; never stored. Reject any project/task edit after preview,
// including a second application, so a stale proposal cannot overwrite newer work.
function scheduleSnapshot(project: Project, tasks: ProjectTask[]) {
  return JSON.stringify([project, tasks.filter((task) => task.projectId === project.id)]);
}

export function buildRescheduleProposal(project: Project, tasks: ProjectTask[], sourceId: string, calendarDate: string, shiftDays?: number): RescheduleProposal {
  const source = tasks.find((task) => task.projectId === project.id && task.id === sourceId);
  if (project.archived === true || !source || !overdueDays(source, calendarDate)) throw new Error('Choose an incomplete overdue task in an unarchived project.');
  const shift = shiftDays ?? overdueDays(source, calendarDate);
  if (!Number.isInteger(shift) || shift < 0 || shift > 3650) throw new Error('Enter a whole number from 0 to 3650 days.');
  if (!Number.isFinite(readDate(project.dueDate).getTime())) throw new Error('The project deadline is invalid.');
  const eligible = getDownstreamTasks(source, tasks).filter((task) => task.status !== 'done');
  const dated = eligible.filter((task) => Number.isFinite(readDate(task.dueDate).getTime()));
  const changes = shift === 0 ? [] : dated.map((task) => {
    const next = addCalendarDays(readDate(task.dueDate), shift);
    if (!Number.isFinite(next.getTime()) || next.getFullYear() > 9999) throw new Error('The proposed date is outside the supported range.');
    return { taskId: task.id, title: task.title, from: task.dueDate, to: next.toISOString() };
  });
  let proposedDeadline = project.dueDate;
  for (const change of changes) if (calendarDaysUntil(change.to, readDate(proposedDeadline)) > 0) proposedDeadline = change.to;
  return { projectId: project.id, sourceId, calendarDate, shiftDays: shift, snapshot: scheduleSnapshot(project, tasks),
    changes, undatedCount: eligible.length - dated.length, deadline: project.dueDate, proposedDeadline,
    beyondDeadlineDays: calendarDaysUntil(proposedDeadline, readDate(project.dueDate)) };
}

export function validateRescheduleProposal(proposal: RescheduleProposal, project: Project, tasks: ProjectTask[], calendarDate: string): string | undefined {
  try {
    if (proposal.projectId !== project.id || proposal.calendarDate !== calendarDate || proposal.snapshot !== scheduleSnapshot(project, tasks)) return 'The project or date changed. Please review a fresh preview.';
    const fresh = buildRescheduleProposal(project, tasks, proposal.sourceId, calendarDate, proposal.shiftDays);
    if (JSON.stringify(fresh) !== JSON.stringify(proposal)) return 'The proposal is no longer valid. Please review a fresh preview.';
  } catch (error) { return error instanceof Error ? error.message : 'Invalid schedule proposal.'; }
}
