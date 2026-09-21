import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { scheduleProjectReminders } from '@/lib/notifications';
import { addCalendarDays, calendarDaysUntil, localDateValue, parseTaskDate, projectStartDate, readDate } from '@/lib/task-utils';
import { completePersonal, personalFields, validatePersonal, type PersonalInput, type PersonalTask } from '@/lib/personal-tasks';
import { askPersonalReminderPermission, syncPersonalReminders } from '@/lib/personal-notifications';

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
  projectStartDate?: string;
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
  isManual?: boolean;
};

type FlowContextValue = {
  personalTasks: PersonalTask[];
  personalReminderNotice: string;
  savePersonalTask: (input: PersonalInput, id?: string) => Promise<{ ok: boolean; error?: string }>;
  completePersonalTask: (id: string) => void;
  reopenPersonalTask: (id: string) => void;
  deletePersonalTask: (id: string) => void;
  projects: Project[];
  tasks: ProjectTask[];
  templates: WorkflowTemplate[];
  hydrated: boolean;
  calendarDate: string;
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
    projectStartDate?: string;
    reminderFrequency: ReminderFrequency;
  }) => Promise<boolean>;
  addManualTask: (projectId: string, input: { title: string; dueDate: string }) => boolean;
  toggleTask: (taskId: string, projectId?: string) => void;
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
  let cursor = projectStartDate(project);
  return template.steps.map((step, index) => {
    const dueDate = addCalendarDays(cursor, step.duration);
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
  let cursor = projectStartDate(project, projectTasks);
  const updatedTasks = [...projectTasks]
    .sort((a, b) => a.order - b.order)
    .map((task) => {
      // Manual dates are independent of the sequential workflow timeline.
      if (task.isManual) return task;
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
  const [personalTasks, setPersonalTasks] = useState<PersonalTask[]>([]);
  const personalRef = useRef<PersonalTask[]>([]);
  const [personalReminderNotice, setPersonalReminderNotice] = useState('');
  const [calendarDate, setCalendarDate] = useState(localDateValue);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      setCalendarDate(localDateValue());
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(refresh, midnight.getTime() - now.getTime() + 50);
    };
    refresh();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored) {
          const parsed = JSON.parse(stored) as { projects: Project[]; tasks: ProjectTask[]; templates?: WorkflowTemplate[]; personalTasks?: PersonalTask[] };
          personalRef.current = parsed.personalTasks ?? [];
          setPersonalTasks(personalRef.current);
          if (parsed.templates) setTemplateList(parsed.templates);
          const storedProjects = parsed.projects.map((project) => ({
            ...project,
            startDate: Number.isFinite(readDate(project.startDate).getTime()) ? project.startDate : projectStartDate(project, parsed.tasks).toISOString(),
            remindersEnabled: project.remindersEnabled ?? false,
          }));
          const storedTasks = parsed.tasks.map((task) => ({
            ...task,
            ...(task.status === 'done' ? { completedAt: task.completedAt ?? task.dueDate } : {}),
          }));
          // Loading must not reschedule historical tasks or overwrite deadlines.
          setProjects(storedProjects);
          setTasks(storedTasks);
        }
      })
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (hydrated) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ projects, tasks, templates: templateList, personalTasks })).catch(() => undefined);
    }
  }, [hydrated, projects, tasks, templateList, personalTasks]);

  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    const sync = () => {
      void syncPersonalReminders(personalRef.current).then((notice) => {
        if (active) setPersonalReminderNotice(notice ?? '');
      }).catch(() => { if (active) setPersonalReminderNotice('Personal reminders could not be updated. Check notification permissions and reopen the app to retry.'); });
    };
    sync();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') sync(); });
    return () => { active = false; subscription.remove(); };
  }, [hydrated, personalTasks, calendarDate]);

  const changePersonal = (update: (current: PersonalTask[]) => PersonalTask[]) => {
    personalRef.current = update(personalRef.current);
    setPersonalTasks(personalRef.current);
  };

  const savePersonalTask: FlowContextValue['savePersonalTask'] = async (input, id) => {
    if (!hydrated) return { ok: false, error: 'Please wait for your tasks to load.' };
    const existing = id ? personalRef.current.find((task) => task.id === id) : undefined;
    if (id && !existing) return { ok: false, error: 'This personal task no longer exists.' };
    const error = validatePersonal(input, new Date(), existing?.status === 'done');
    if (error) return { ok: false, error };
    let notice: string | undefined;
    if (input.reminder !== 'None' && existing?.status !== 'done') {
      try { notice = await askPersonalReminderPermission(); }
      catch { notice = 'Saved, but notification permission could not be checked. Reopen the app to retry.'; }
    }
    if (id && !personalRef.current.some((task) => task.id === id)) return { ok: false, error: 'This personal task was deleted.' };
    let taskId = id;
    if (!taskId) {
      do { taskId = `personal-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`; }
      while (personalRef.current.some((task) => task.id === taskId) || tasks.some((task) => task.id === taskId) || projects.some((project) => project.id === taskId));
    }
    const fields = personalFields(input, existing);
    const newTask: PersonalTask = { ...fields, id: taskId, status: 'todo', createdAt: new Date().toISOString(), seriesId: taskId, occurrence: 0 };
    changePersonal((current) => id ? current.map((task) => task.id === id ? { ...task, ...fields } : task) : [...current, newTask]);
    setPersonalReminderNotice(notice ?? '');
    return { ok: true };
  };
  const completePersonalTask = (id: string) => changePersonal((current) => completePersonal(current, id));
  const reopenPersonalTask = (id: string) => changePersonal((current) => current.map((task) => task.id === id ? { ...task, status: 'todo', completedAt: undefined } : task));
  const deletePersonalTask = (id: string) => changePersonal((current) => current.filter((task) => task.id !== id));

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
    projectStartDate?: string;
    reminderFrequency: ReminderFrequency;
  }) => {
    const selectedStart = parseTaskDate(input.projectStartDate ?? localDateValue());
    if (!selectedStart || !Number.isFinite(readDate(input.dueDate).getTime())) return false;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const project: Project = {
      id,
      name: input.name,
      client: input.client,
      summary: input.summary,
      templateId: input.templateId,
      startDate: selectedStart.toISOString(),
      projectStartDate: localDateValue(selectedStart),
      dueDate: input.dueDate,
      reminderFrequency: input.reminderFrequency,
      remindersEnabled: true,
    };
    const template = templateList.find((item) => item.id === input.templateId);
    if (!template || !template.steps.length) return false;
    const newTasks = makeTasks(project, template);
    setProjects((current) => [project, ...current]);
    setTasks((current) => [...newTasks, ...current]);
    await scheduleProjectReminders(project, newTasks);
    return true;
  };

  const addManualTask: FlowContextValue['addManualTask'] = (projectId, input) => {
    const project = projects.find((item) => item.id === projectId);
    const dueDate = parseTaskDate(input.dueDate);
    if (!hydrated || !project || !input.title.trim() || !dueDate) return false;
    const task: ProjectTask = {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      projectId, title: input.title.trim(), description: '', duration: 0,
      status: 'todo', dueDate: dueDate.toISOString(),
      order: tasks.filter((item) => item.projectId === projectId).reduce((max, item) => Math.max(max, item.order), -1) + 1,
      isManual: true,
    };
    setTasks((current) => [...current, {
      ...task, order: current.filter((item) => item.projectId === projectId)
        .reduce((max, item) => Math.max(max, item.order), -1) + 1,
    }]);
    if (project.remindersEnabled) void scheduleProjectReminders(project, [...tasks, task], false);
    return true;
  };

  const toggleTask = (taskId: string, projectId?: string) => {
    const task = tasks.find((item) => item.id === taskId && (!projectId || item.projectId === projectId));
    const project = task ? projects.find((item) => item.id === task.projectId) : undefined;
    if (!task || !project) return;

    if (task.isManual) {
      const nextTasks = tasks.map((item) => item.projectId === project.id && item.id === task.id ? {
        ...item, status: task.status === 'done' ? 'todo' as const : 'done' as const,
        completedAt: task.status === 'done' ? undefined : new Date().toISOString(),
      } : item);
      setTasks(nextTasks);
      if (project.remindersEnabled) void scheduleProjectReminders(project, nextTasks, false);
      return;
    }

    const reopening = task.status === 'done';
    const nextTasks: ProjectTask[] = tasks.map((item) => {
      if (item.projectId !== task.projectId || item.isManual) return item;
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
    () => ({ projects, tasks, templates: templateList, hydrated, calendarDate, personalTasks, personalReminderNotice, savePersonalTask, completePersonalTask, reopenPersonalTask, deletePersonalTask, addTemplate, updateTemplate, deleteTemplate, addProject, addManualTask, toggleTask, updateReminderFrequency, enableProjectReminders, deleteProject }),
    [projects, tasks, templateList, hydrated, calendarDate, personalTasks, personalReminderNotice],
  );

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function useFlow() {
  const context = useContext(FlowContext);
  if (!context) throw new Error('useFlow must be used within FlowProvider');
  return context;
}

export function daysRemaining(date: string, today = new Date()) {
  return calendarDaysUntil(date, today);
}

export function formatShortDate(date: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(readDate(date));
}
