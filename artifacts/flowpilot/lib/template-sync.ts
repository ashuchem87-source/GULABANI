import type { Project, ProjectTask, WorkflowTemplate } from '@/context/FlowContext';
import { addCalendarDays, projectStartDate } from '@/lib/task-utils';
import { projectStatus } from '@/lib/project-management';

type FlowData = { projects: Project[]; tasks: ProjectTask[]; templates: WorkflowTemplate[] };

// Deterministic, collision-checked identity also makes repeated hydration safe.
export function normalizeTemplate(template: WorkflowTemplate): WorkflowTemplate {
  const used = new Set(template.steps.map((step) => step.id).filter(Boolean));
  const seen = new Set<string>();
  return { ...template, steps: template.steps.map((step, index) => {
    let id = step.id;
    if (!id || seen.has(id)) {
      const base = `step:${template.id}:${index}`; id = base;
      for (let suffix = 1; used.has(id); suffix++) id = `${base}:${suffix}`;
      used.add(id);
    }
    seen.add(id); return { ...step, id };
  }) };
}

export function normalizeTemplateLinks<T extends FlowData>(data: T): T {
  const templates = data.templates.map(normalizeTemplate);
  const masters = new Map(templates.map((template) => [template.id, template]));
  const owners = new Map(data.projects.map((project) => [project.id, project]));
  const tasks = data.tasks.map((task) => {
    if (task.isManual || task.templateDetached || task.sourceTemplateStepId) return task;
    const master = masters.get(owners.get(task.projectId)?.templateId ?? '');
    // Pre-Batch-10 generated task IDs were exactly their source step IDs.
    // Never infer identity by title, position, or similarity.
    return master?.steps.some((step) => step.id === task.id) ? { ...task, sourceTemplateStepId: task.id } : task;
  });
  return { ...data, templates, tasks };
}

export function generatedTasks(project: Project, template: WorkflowTemplate, used = new Set<string>()): ProjectTask[] {
  let cursor = projectStartDate(project);
  return template.steps.map((step, order) => {
    cursor = addCalendarDays(cursor, step.duration);
    const base = `task:${project.id}:${step.id}`;
    let id = base;
    for (let suffix = 1; used.has(id) || id === step.id; suffix++) id = `${base}:${suffix}`;
    used.add(id);
    return { ...step, id, sourceTemplateStepId: step.id, projectId: project.id,
      status: 'todo', dueDate: cursor.toISOString(), order };
  });
}

function detach(task: ProjectTask): ProjectTask {
  const { sourceTemplateStepId: omitted, ...rest } = task;
  return { ...rest, templateDetached: true };
}

export function synchronizeTemplate(data: FlowData, replacement: WorkflowTemplate): FlowData {
  const normalized = normalizeTemplateLinks(data);
  const previous = normalized.templates.find((template) => template.id === replacement.id);
  if (!previous) return data;
  const master = normalizeTemplate(replacement);
  const stepIds = new Set(master.steps.map((step) => step.id));
  const replacements = new Map<string, ProjectTask[]>();
  const used = new Set(normalized.tasks.map((task) => task.id));
  const projects = normalized.projects.map((project) => {
    if (project.templateId !== master.id) return project;
    const owned = normalized.tasks.filter((task) => task.projectId === project.id).sort((a, b) => a.order - b.order);
    const referenced = new Set(owned.flatMap((task) => task.dependsOn ?? []));
    const priorSchedule = new Map(generatedTasks(project, previous).map((task) => [task.sourceTemplateStepId, task]));
    const bySource = new Map<string, ProjectTask>();
    const independent: ProjectTask[] = [];
    for (const task of owned) {
      const source = !task.isManual && !task.templateDetached ? task.sourceTemplateStepId : undefined;
      if (!source) { independent.push(task); continue; }
      if (stepIds.has(source) && !bySource.has(source)) { bySource.set(source, task); continue; }
      const original = priorSchedule.get(source);
      // Unknown/adjusted dates or metadata are history, not disposable work.
      const untouched = original && task.status === 'todo' && !task.completedAt && !task.dependsOn?.length && !referenced.has(task.id)
        && Object.keys(task).every((key) => ['id', 'title', 'description', 'duration', 'projectId', 'status', 'dueDate', 'order', 'sourceTemplateStepId', 'isManual', 'templateDetached', 'dependsOn', 'completedAt'].includes(key))
        && task.dueDate === original.dueDate && task.title === original.title && task.description === original.description && task.duration === original.duration;
      if (!untouched || stepIds.has(source)) independent.push(detach(task));
    }
    const scheduled = generatedTasks(project, master, used);
    const linked = scheduled.map((fresh) => {
      const existing = bySource.get(fresh.sourceTemplateStepId!);
      return existing ? { ...existing, title: fresh.title, description: fresh.description, duration: fresh.duration } : fresh;
    });
    // Linked steps first in master order; independent/historical tasks follow in
    // their previous relative order. No project-specific dependency is inferred.
    const next = [...linked, ...independent].map((task, order) => task.order === order ? task : { ...task, order });
    replacements.set(project.id, next);
    const added = linked.some((task) => !bySource.has(task.sourceTemplateStepId!));
    const beforeComplete = projectStatus(project, owned) === 'Completed';
    // Old explicit Completed with unfinished work is an identifiable override.
    const manual = project.completionSource === 'manual' || (!project.completionSource && owned.some((task) => task.status !== 'done'));
    if (added && beforeComplete && !manual) return { ...project, status: 'Active' as const, completionSource: undefined };
    return beforeComplete && !project.completionSource ? { ...project, completionSource: manual ? 'manual' as const : 'auto' as const } : project;
  });
  return { projects, templates: normalized.templates.map((template) => template.id === master.id ? master : template),
    tasks: normalized.tasks.flatMap((task) => {
      const next = replacements.get(task.projectId);
      if (!next) return [task];
      replacements.set(task.projectId, []);
      return next;
    }).concat([...replacements.entries()].filter(([id]) => !normalized.tasks.some((task) => task.projectId === id)).flatMap(([, tasks]) => tasks)) };
}

export function detachTemplate(data: FlowData, id: string): FlowData {
  const owners = new Set(data.projects.filter((project) => project.templateId === id).map((project) => project.id));
  return { templates: data.templates.filter((template) => template.id !== id),
    projects: data.projects.map((project) => owners.has(project.id) ? { ...project, templateId: '' } : project),
    tasks: data.tasks.map((task) => owners.has(task.projectId) && !task.isManual ? detach(task) : task) };
}
