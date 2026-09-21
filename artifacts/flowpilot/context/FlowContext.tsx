import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { scheduleProjectReminders } from '@/lib/notifications';

export type ReminderFrequency = 'Daily' | 'Every 2 days' | 'Weekly';
export type TaskStatus = 'todo' | 'done';

export type WorkflowStep = {
  id: string;
  title: string;
  description: string;
  duration: number;
};

export type WorkflowTemplate = {
  id: string;
  name: string;
  category: string;
  description: string;
  steps: WorkflowStep[];
  color: string;
};

export type Project = {
  id: string;
  name: string;
  client: string;
  summary: string;
  templateId: string;
  startDate: string;
  dueDate: string;
  reminderFrequency: ReminderFrequency;
  remindersEnabled: boolean;
};

export type ProjectTask = WorkflowStep & {
  projectId: string;
  status: TaskStatus;
  dueDate: string;
  order: number;
  completedAt?: string;
};

type FlowContextValue = {
  projects: Project[];
  tasks: ProjectTask[];
  templates: WorkflowTemplate[];
  hydrated: boolean;
  updateTemplate: (id: string, input: Pick<WorkflowTemplate, 'name' | 'category' | 'description' | 'steps'>) => void;
  deleteTemplate: (id: string) => void;
  addTemplate: (input: {
    name: string;
    category: string;
    description: string;
    steps: WorkflowStep[];
  }) => void;
  addProject: (input: {
    name: string;
    client: string;
    summary: string;
    templateId: string;
    dueDate: string;
    reminderFrequency: ReminderFrequency;
  }) => void;
  toggleTask: (taskId: string) => void;
  updateReminderFrequency: (projectId: string, frequency: ReminderFrequency) => void;
  enableProjectReminders: (projectId: string) => Promise<boolean>;
  deleteProject: (projectId: string) => void;
};

const templates: WorkflowTemplate[] = [
  {
    id: 'brand-launch',
    name: 'Brand launch',
    category: 'Creative',
    description: 'From first brief to a ready-to-share brand launch.',
    color: '#F26B5E',
    steps: [
      { id: 'brief', title: 'Review the brief', description: 'Align on the goal, audience, and success measure.', duration: 1 },
      { id: 'direction', title: 'Create first direction', description: 'Turn the brief into a clear creative route.', duration: 3 },
      { id: 'review', title: 'Share for review', description: 'Collect focused feedback from the client.', duration: 2 },
      { id: 'refine', title: 'Refine and package', description: 'Apply feedback and prepare final files.', duration: 3 },
    ],
  },
  {
    id: 'content-series',
    name: 'Content series',
    category: 'Marketing',
    description: 'A dependable rhythm for planning and delivering content.',
    color: '#6BAF92',
    steps: [
      { id: 'research', title: 'Research and outline', description: 'Gather inputs and map the story.', duration: 2 },
      { id: 'draft', title: 'Write the first draft', description: 'Build the full piece without polishing too early.', duration: 3 },
      { id: 'edit', title: 'Edit and fact check', description: 'Tighten the story and validate key details.', duration: 2 },
      { id: 'schedule', title: 'Schedule and publish', description: 'Load the final version and set it live.', duration: 1 },
    ],
  },
  {
    id: 'client-project',
    name: 'Client project',
    category: 'General',
    description: 'A flexible flow for projects with a clear handoff.',
    color: '#6F83C9',
    steps: [
      { id: 'kickoff', title: 'Set the kickoff', description: 'Confirm scope, people, and the first milestone.', duration: 1 },
      { id: 'work', title: 'Complete the first milestone', description: 'Make progress on the highest-impact deliverable.', duration: 5 },
      { id: 'handoff', title: 'Prepare the handoff', description: 'Document what is ready and what needs review.', duration: 2 },
    ],
  },
];

const today = new Date();
const isoFromToday = (offset: number) => {
  const date = new Date(today);
  date.setDate(date.getDate() + offset);
  return date.toISOString();
};

const starterProjects: Project[] = [
  {
    id: 'p-northstar',
    name: 'Northstar identity',
    client: 'Northstar Studio',
    summary: 'A focused identity system for a new creative practice.',
    templateId: 'brand-launch',
    startDate: isoFromToday(-5),
    dueDate: isoFromToday(7),
    reminderFrequency: 'Daily',
    remindersEnabled: false,
  },
  {
    id: 'p-sunday',
    name: 'Sunday notes',
    client: 'Cedar & Co.',
    summary: 'A four-part editorial series for the spring campaign.',
    templateId: 'content-series',
    startDate: isoFromToday(-2),
    dueDate: isoFromToday(11),
    reminderFrequency: 'Every 2 days',
    remindersEnabled: false,
  },
];

const makeTasks = (project: Project, template: WorkflowTemplate): ProjectTask[] => {
  let cursor = new Date(project.startDate);
  return template.steps.map((step, index) => {
    const dueDate = new Date(cursor);
    dueDate.setDate(dueDate.getDate() + step.duration);
    cursor = dueDate;
    return {
      ...step,
      projectId: project.id,
      status: index === 0 && project.id === 'p-northstar' ? 'done' : 'todo',
      dueDate: dueDate.toISOString(),
      order: index,
      ...(index === 0 && project.id === 'p-northstar' ? { completedAt: dueDate.toISOString() } : {}),
    };
  });
};

const starterTasks = starterProjects.flatMap((project) => {
  const template = templates.find((item) => item.id === project.templateId) ?? templates[0];
  return makeTasks(project, template);
});

const FlowContext = createContext<FlowContextValue | null>(null);
const STORAGE_KEY = 'flowpilot-state-v1';

function recalculateTimeline(project: Project, projectTasks: ProjectTask[]) {
  let cursor = new Date(project.startDate);
  const updatedTasks = [...projectTasks]
    .sort((a, b) => a.order - b.order)
    .map((task) => {
      if (task.status === 'done') {
        const completedAt = task.completedAt ?? task.dueDate;
        const completedDate = new Date(completedAt);
        cursor = completedDate;
        return { ...task, dueDate: completedDate.toISOString(), completedAt: completedDate.toISOString() };
      }

      const dueDate = new Date(cursor);
      dueDate.setDate(dueDate.getDate() + task.duration);
      cursor = dueDate;
      return { ...task, dueDate: dueDate.toISOString(), completedAt: undefined };
    });

  return {
    tasks: updatedTasks,
    project: { ...project, dueDate: cursor.toISOString() },
  };
}

export function FlowProvider({ children }: { children: React.ReactNode }) {
  const [templateList, setTemplateList] = useState<WorkflowTemplate[]>(templates);
  const [projects, setProjects] = useState<Project[]>(starterProjects);
  const [tasks, setTasks] = useState<ProjectTask[]>(starterTasks);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored) {
          const parsed = JSON.parse(stored) as { projects: Project[]; tasks: ProjectTask[]; templates?: WorkflowTemplate[] };
          if (parsed.templates) setTemplateList(parsed.templates);
          const storedProjects = parsed.projects.map((project) => ({ ...project, remindersEnabled: project.remindersEnabled ?? false }));
          const storedTasks = parsed.tasks.map((task) => ({
            ...task,
            ...(task.status === 'done' ? { completedAt: task.completedAt ?? task.dueDate } : {}),
          }));
          const normalized = storedProjects.map((project) => recalculateTimeline(project, storedTasks.filter((task) => task.projectId === project.id)));
          setProjects(normalized.map(({ project }) => project));
          setTasks(normalized.flatMap(({ tasks }) => tasks).concat(storedTasks.filter((task) => !storedProjects.some((project) => project.id === task.projectId))));
        }
      })
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (hydrated) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ projects, tasks, templates: templateList })).catch(() => undefined);
    }
  }, [hydrated, projects, tasks, templateList]);

  const addTemplate = (input: {
    name: string;
    category: string;
    description: string;
    steps: WorkflowStep[];
  }) => {
    if (!input.name.trim() || !input.steps.length || input.steps.some((step) => !step.title.trim())) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const palette = ['#F26B5E', '#6BAF92', '#6F83C9', '#B787C8'];
    setTemplateList((current) => [
      {
        id,
        name: input.name.trim(),
        category: input.category,
        description: input.description,
        steps: input.steps.map((step) => ({ ...step, title: step.title.trim() })),
        color: palette[current.length % palette.length],
      },
      ...current,
    ]);
  };

  const updateTemplate: FlowContextValue['updateTemplate'] = (id, input) => {
    if (!input.name.trim() || !input.steps.length || input.steps.some((step) => !step.title.trim())) return;
    // Project tasks are independent snapshots; only the template collection changes.
    setTemplateList((current) => current.map((template) => template.id === id ? {
      ...template,
      name: input.name.trim(),
      category: input.category,
      description: input.description,
      steps: input.steps.map((step) => ({ ...step, title: step.title.trim() })),
    } : template));
  };

  const deleteTemplate = (id: string) => {
    setTemplateList((current) => current.filter((template) => template.id !== id));
  };

  const addProject = async (input: {
    name: string;
    client: string;
    summary: string;
    templateId: string;
    dueDate: string;
    reminderFrequency: ReminderFrequency;
  }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const project: Project = {
      id,
      name: input.name,
      client: input.client,
      summary: input.summary,
      templateId: input.templateId,
      startDate: new Date().toISOString(),
      dueDate: input.dueDate,
      reminderFrequency: input.reminderFrequency,
      remindersEnabled: true,
    };
    const template = templateList.find((item) => item.id === input.templateId);
    if (!template || !template.steps.length) return;
    const newTasks = makeTasks(project, template);
    setProjects((current) => [project, ...current]);
    setTasks((current) => [...newTasks, ...current]);
    await scheduleProjectReminders(project, newTasks);
  };

  const toggleTask = (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    const project = task ? projects.find((item) => item.id === task.projectId) : undefined;
    if (!task || !project) return;

    const reopening = task.status === 'done';
    const nextTasks: ProjectTask[] = tasks.map((item) => {
      if (item.projectId !== task.projectId) return item;
      if (reopening && item.order >= task.order) {
        return { ...item, status: 'todo' as const, completedAt: undefined };
      }
      if (!reopening && item.id === taskId) {
        return { ...item, status: 'done' as const, completedAt: new Date().toISOString() };
      }
      return item;
    });
    const recalculated = recalculateTimeline(project, nextTasks.filter((item) => item.projectId === project.id));
    const updatedProject = recalculated.project;
    setProjects((current) => current.map((item) => (item.id === project.id ? updatedProject : item)));
    setTasks((current) => current.map((item) => (item.projectId === project.id ? recalculated.tasks.find((nextTask) => nextTask.id === item.id) ?? item : item)));
    if (updatedProject.remindersEnabled) void scheduleProjectReminders(updatedProject, recalculated.tasks, false);
  };

  const updateReminderFrequency = (projectId: string, frequency: ReminderFrequency) => {
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    const updatedProject = { ...project, reminderFrequency: frequency };
    setProjects((current) => current.map((item) => (item.id === projectId ? updatedProject : item)));
    if (updatedProject.remindersEnabled) void scheduleProjectReminders(updatedProject, tasks, false);
  };

  const enableProjectReminders = async (projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    if (!project) return false;
    const enabledProject = { ...project, remindersEnabled: true };
    setProjects((current) => current.map((item) => (item.id === projectId ? enabledProject : item)));
    return scheduleProjectReminders(enabledProject, tasks);
  };

  const deleteProject = (projectId: string) => {
    setProjects((current) => current.filter((project) => project.id !== projectId));
    setTasks((current) => current.filter((task) => task.projectId !== projectId));
  };

  const value = useMemo(
    () => ({ projects, tasks, templates: templateList, hydrated, addTemplate, updateTemplate, deleteTemplate, addProject, toggleTask, updateReminderFrequency, enableProjectReminders, deleteProject }),
    [projects, tasks, templateList, hydrated],
  );

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function useFlow() {
  const context = useContext(FlowContext);
  if (!context) throw new Error('useFlow must be used within FlowProvider');
  return context;
}

export function daysRemaining(date: string) {
  const target = new Date(date).getTime();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Math.ceil((target - start.getTime()) / 86400000);
}

export function formatShortDate(date: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(date));
}
