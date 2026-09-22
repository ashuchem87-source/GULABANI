import { normalizeTemplateLinks, normalizeTemplate, generatedTasks, synchronizeTemplate, detachTemplate } from '@/lib/template-sync';
import { PROJECT_STATUSES, projectProgress, projectStatus, transitionProject, isArchived, type ProjectStatus } from '@/lib/project-management';
import { useSettings } from '@/context/SettingsContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Modal, Pressable, Text, View } from 'react-native';
import { FLOW_KEY, dataLocked, dataGeneration, writeData, replaceData, recoverData, type RestoreResult } from '@/lib/data-storage';
import { parseBackup, snapshotData, type AppData, type Backup } from '@/lib/data-backup';
import { useColors } from '@/hooks/useColors';
import { dependencyIds, getIncompleteDependencies, removeTaskAndDependencies, validateDependencies, validateRescheduleProposal, type RescheduleProposal } from '@/lib/workflow-intelligence';
import { scheduleProjectReminders, syncProjectReminders } from '@/lib/notifications';
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
  status?: ProjectStatus;
  completionSource?: 'auto' | 'manual';
  archived?: boolean;
  id: string;
  name: string;
  client: string;
  summary: string;
  templateId?: string; // Missing/empty means a legacy or detached project.
  startDate: string;
  projectStartDate?: string;
  dueDate: string;
  reminderFrequency: ReminderFrequency;
  remindersEnabled: boolean;
};

export type ProjectTask = WorkflowStep & {
  dependsOn?: string[];
  sourceTemplateStepId?: string;
  templateDetached?: boolean;
  projectId: string;
  status: TaskStatus;
  dueDate: string;
  order: number;
  completedAt?: string;
  isManual?: boolean;
};

type FlowContextValue = {
  getDataSnapshot: () => AppData;
  restoreBackup: (backup: Backup) => Promise<RestoreResult & { warning?: string }>;
  storageError: string;
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
  updateTemplate: (id: string, input: Pick<WorkflowTemplate, 'name' | 'category' | 'description' | 'steps'>) => boolean;
  deleteTemplate: (id: string) => void;
  addTemplate: (input: {
    name: string;
    category: string;
    description: string;
    steps: WorkflowStep[];
  }) => boolean;
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
  setTaskDependencies: (projectId: string, taskId: string, ids: string[]) => string | undefined;
  deleteProjectTask: (projectId: string, taskId: string, confirmed?: boolean) => boolean;
  applyReschedule: (proposal: RescheduleProposal, extendDeadline?: boolean) => string | undefined;
  updateReminderFrequency: (projectId: string, frequency: ReminderFrequency) => void;
  enableProjectReminders: (projectId: string) => Promise<boolean>;
  deleteProject: (projectId: string) => void;
  setProjectStatus: (projectId: string, status: ProjectStatus, confirmIncomplete?: boolean) => boolean;
  setProjectArchived: (projectId: string, archived: boolean, confirmed?: boolean) => boolean;
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
  return generatedTasks(project, template).map((task, index) => ({ ...task,
    status: index === 0 && project.id === 'p-northstar' ? 'done' : 'todo' }));
};

const starterTasks = starterProjects.flatMap((project) => {
  const template = templates.find((item) => item.id === project.templateId) ?? templates[0];
  return makeTasks(project, template);
});

const FlowContext = createContext<FlowContextValue | null>(null);
const STORAGE_KEY = FLOW_KEY;

function recalculateTimeline(project: Project, projectTasks: ProjectTask[]) {
  let cursor = projectStartDate(project, projectTasks);
  const updatedTasks = [...projectTasks]
    .sort((a, b) => a.order - b.order)
    .map((task) => {
      // Manual dates are independent of the sequential workflow timeline.
      if (task.isManual || task.templateDetached) return task;
      if (task.status === 'done') {
        const completedAt = task.completedAt ?? task.dueDate;
        const completedDate = new Date(completedAt);
        cursor = completedDate;
        return { ...task, dueDate: completedDate.toISOString() };
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
  const { settings, getSettingsSnapshot, acceptRestoredSettings } = useSettings();
  const colors = useColors();
  const [storageError, setStorageError] = useState('');
  const [restoring, setRestoring] = useState(false), [recoveryRequired, setRecoveryRequired] = useState(false);
  const generation = dataGeneration();
  const mutable = () => !dataLocked() && generation === dataGeneration();
  const [templateList, setTemplateList] = useState<WorkflowTemplate[]>(templates);
  const templateRef = useRef(templateList);
  templateRef.current = templateList;
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
          const raw = JSON.parse(stored) as { projects: Project[]; tasks: ProjectTask[]; templates?: WorkflowTemplate[]; personalTasks?: PersonalTask[] };
          const parsed = normalizeTemplateLinks({ ...raw, templates: raw.templates ?? templates });
          personalRef.current = parsed.personalTasks ?? [];
          setPersonalTasks(personalRef.current);
          if (parsed.templates) setTemplateList(parsed.templates);
          const storedProjects = parsed.projects.map((project) => ({
            ...project,
            startDate: Number.isFinite(readDate(project.startDate).getTime()) ? project.startDate : projectStartDate(project, parsed.tasks).toISOString(),
            remindersEnabled: project.remindersEnabled ?? false,
          }));
          // A due date is not evidence of completion. Keep unknown legacy timestamps absent.
          const storedTasks = parsed.tasks;
          // Loading must not reschedule historical tasks or overwrite deadlines.
          setProjects(storedProjects);
          setTasks(storedTasks);
        }
      })
      .then(() => setHydrated(true))
      .catch(() => setStorageError('Saved data could not be loaded. Close and reopen the app to retry. Your saved data has not been replaced.'));
  }, []);

  useEffect(() => {
    if (hydrated) {
      void writeData(STORAGE_KEY, JSON.stringify({ projects, tasks, templates: templateList, personalTasks }))
        .then(() => setStorageError('')).catch(() => { if (!dataLocked()) setStorageError('Changes could not be saved. Keep the app open and retry saving before closing.'); });
    }
  }, [hydrated, projects, tasks, templateList, personalTasks]);

  useEffect(() => {
    if (!hydrated || dataLocked()) return;
    let active = true;
    const sync = () => {
      if (dataLocked()) return;
      void syncPersonalReminders(personalRef.current, settings.notificationsEnabled).then((notice) => {
        if (active) setPersonalReminderNotice(notice ?? '');
      }).catch(() => { if (active) setPersonalReminderNotice('Personal reminders could not be updated. Check notification permissions and reopen the app to retry.'); });
    };
    sync();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') sync(); });
    return () => { active = false; subscription.remove(); };
  }, [hydrated, personalTasks, calendarDate, settings.notificationsEnabled]);

  const projectSnapshot = useRef({ projects, tasks });
  projectSnapshot.current = { projects, tasks };
  useEffect(() => {
    if (!hydrated || dataLocked()) return;
    const sync = () => {
      if (dataLocked()) return;
      const latest = projectSnapshot.current;
      void syncProjectReminders(latest.projects, latest.tasks, settings.notificationsEnabled)
        .catch(() => setPersonalReminderNotice('Project reminders could not be updated. Reopen the app to retry.'));
    };
    sync();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') sync(); });
    return () => subscription.remove();
  }, [hydrated, settings.notificationsEnabled, calendarDate]);

  const changePersonal = (update: (current: PersonalTask[]) => PersonalTask[]) => {
    if (!mutable()) return;
    personalRef.current = update(personalRef.current);
    setPersonalTasks(personalRef.current);
  };

  const savePersonalTask: FlowContextValue['savePersonalTask'] = async (input, id) => {
    if (!mutable()) return { ok: false, error: 'Data changed or recovery is in progress. Reopen this form.' };
    if (!hydrated) return { ok: false, error: 'Please wait for your tasks to load.' };
    const existing = id ? personalRef.current.find((task) => task.id === id) : undefined;
    if (id && !existing) return { ok: false, error: 'This personal task no longer exists.' };
    const error = validatePersonal(input, new Date(), existing?.status === 'done', existing);
    if (error) return { ok: false, error };
    let notice: string | undefined;
    if (settings.notificationsEnabled && input.reminder !== 'None' && existing?.status !== 'done') {
      try { notice = await askPersonalReminderPermission(); }
      catch { notice = 'Saved, but notification permission could not be checked. Reopen the app to retry.'; }
    }
    if (!mutable()) return { ok: false, error: 'Data was replaced while this form was open. Please reopen it.' };
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
    if (!mutable() || !hydrated) return false;
    if (!input.name.trim() || !input.steps.length || input.steps.some((step) => !step.title.trim() || !Number.isInteger(step.duration) || step.duration < 0)) return false;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const palette = ['#F26B5E', '#6BAF92', '#6F83C9', '#B787C8'];
    const next = normalizeTemplate({ id, name: input.name.trim(), category: input.category,
      description: input.description, steps: input.steps.map((step) => ({ ...step, title: step.title.trim() })),
      color: palette[templateRef.current.length % palette.length] });
    templateRef.current = [next, ...templateRef.current]; setTemplateList(templateRef.current);
    return true;
  };

  const updateTemplate: FlowContextValue['updateTemplate'] = (id, input) => {
    if (!mutable() || !hydrated) return false;
    if (!input.name.trim() || !input.steps.length || input.steps.some((step) => !step.title.trim() || !Number.isInteger(step.duration) || step.duration < 0)) return false;
    const current = templateRef.current.find((template) => template.id === id);
    if (!current) return false;
    let next;
    try { next = synchronizeTemplate({ ...projectSnapshot.current, templates: templateRef.current }, {
      ...current, ...input, name: input.name.trim(), steps: input.steps.map((step) => ({ ...step, title: step.title.trim() })),
    }); } catch { return false; }
    templateRef.current = next.templates;
    setTemplateList(next.templates);
    commitProjectState(next.projects, next.tasks);
    void syncProjectReminders(next.projects, next.tasks, settings.notificationsEnabled)
      .catch(() => setPersonalReminderNotice('Template saved. Project reminders could not be updated; reopen the app to retry.'));
    return true;
  };

  const deleteTemplate = (id: string) => {
    if (!mutable()) return;
    const next = detachTemplate({ ...projectSnapshot.current, templates: templateRef.current }, id);
    templateRef.current = next.templates; setTemplateList(next.templates);
    commitProjectState(next.projects, next.tasks);
  };

  // Keep task/status/archive decisions consistent across actions in the same render batch.
  const commitProjectState = (nextProjects: Project[], nextTasks = projectSnapshot.current.tasks) => {
    projectSnapshot.current = { projects: nextProjects, tasks: nextTasks };
    setProjects(nextProjects);
    setTasks(nextTasks);
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
    if (!mutable()) return false;
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
      status: 'Active',
    };
    const template = templateRef.current.find((item) => item.id === input.templateId);
    if (!template || !template.steps.length) return false;
    const newTasks = makeTasks(project, template);
    commitProjectState([project, ...projectSnapshot.current.projects], [...newTasks, ...projectSnapshot.current.tasks]);
    // Creation has succeeded; a native permission/reminder error must not invite a duplicate retry.
    if (settings.notificationsEnabled) void scheduleProjectReminders(project, newTasks)
      .catch(() => setPersonalReminderNotice('Project created. Reminders could not be updated; reopen the app to retry.'));
    return true;
  };

  const addManualTask: FlowContextValue['addManualTask'] = (projectId, input) => {
    if (!mutable()) return false;
    const { projects, tasks } = projectSnapshot.current;
    const project = projects.find((item) => item.id === projectId);
    const dueDate = parseTaskDate(input.dueDate);
    if (!hydrated || !project || isArchived(project) || !input.title.trim() || !dueDate) return false;
    const task: ProjectTask = {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      projectId, title: input.title.trim(), description: '', duration: 0,
      status: 'todo', dueDate: dueDate.toISOString(),
      order: tasks.filter((item) => item.projectId === projectId).reduce((max, item) => Math.max(max, item.order), -1) + 1,
      isManual: true,
    };
    const nextTasks = [...tasks, task];
    const updatedProject = transitionProject(project, tasks, nextTasks, 'add');
    commitProjectState(projects.map((item) => item.id === project.id ? updatedProject : item), nextTasks);
    if (project.remindersEnabled) void scheduleProjectReminders(updatedProject, [...tasks, task], false);
    return true;
  };

  const setTaskDependencies: FlowContextValue['setTaskDependencies'] = (projectId, taskId, ids) => {
    if (!mutable()) return 'Data changed or recovery is in progress. Reopen this project.';
    const { projects, tasks } = projectSnapshot.current;
    const project = projects.find((item) => item.id === projectId);
    const task = tasks.find((item) => item.projectId === projectId && item.id === taskId);
    if (!hydrated || !project || isArchived(project) || !task) return 'This task is unavailable. Unarchive its project before editing.';
    const error = validateDependencies(task, ids, tasks);
    if (error) return error;
    commitProjectState(projects, tasks.map((item) => item === task ? { ...item, dependsOn: [...new Set(ids)] } : item));
  };

  const deleteProjectTask: FlowContextValue['deleteProjectTask'] = (projectId, taskId, confirmed = false) => {
    if (!mutable()) return false;
    const { projects, tasks } = projectSnapshot.current;
    const project = projects.find((item) => item.id === projectId);
    if (!hydrated || !confirmed || !project || isArchived(project) || !tasks.some((task) => task.projectId === projectId && task.id === taskId)) return false;
    // Freeze legacy status: deleting a task is not a completion event.
    const updatedProject = { ...project, status: projectStatus(project, tasks) };
    const nextTasks = removeTaskAndDependencies(projectId, taskId, tasks);
    commitProjectState(projects.map((item) => item.id === projectId ? updatedProject : item), nextTasks);
    if (settings.notificationsEnabled && project.remindersEnabled) void scheduleProjectReminders(updatedProject, nextTasks, false)
      .catch(() => setPersonalReminderNotice('Project reminders could not be updated. Reopen the app to retry.'));
    return true;
  };

  const applyReschedule: FlowContextValue['applyReschedule'] = (proposal, extendDeadline = false) => {
    if (!mutable()) return 'Data changed or recovery is in progress. Reopen this project.';
    const { projects, tasks } = projectSnapshot.current;
    const project = projects.find((item) => item.id === proposal.projectId);
    if (!hydrated || !project) return 'This project is unavailable.';
    const error = validateRescheduleProposal(proposal, project, tasks, localDateValue());
    if (error) return error;
    if (!proposal.changes.length) return;
    const dates = new Map(proposal.changes.map((change) => [change.taskId, change.to]));
    const nextTasks = tasks.map((task) => task.projectId === project.id && dates.has(task.id) ? { ...task, dueDate: dates.get(task.id)! } : task);
    const updatedProject = extendDeadline && proposal.beyondDeadlineDays > 0 ? { ...project, dueDate: proposal.proposedDeadline } : project;
    commitProjectState(projects.map((item) => item.id === project.id ? updatedProject : item), nextTasks);
    if (settings.notificationsEnabled && project.remindersEnabled) void scheduleProjectReminders(updatedProject, nextTasks, false)
      .catch(() => setPersonalReminderNotice('Project reminders could not be updated. Reopen the app to retry.'));
  };

  const toggleTask = (taskId: string, projectId?: string, override = false) => {
    if (!mutable()) return;
    const { projects, tasks } = projectSnapshot.current;
    const task = tasks.find((item) => item.id === taskId && (!projectId || item.projectId === projectId));
    const project = task ? projects.find((item) => item.id === task.projectId) : undefined;
    if (!hydrated || !task || !project) return;

    if (!override && task.status !== 'done' && getIncompleteDependencies(task, tasks).length) {
      const selectedDependencies = JSON.stringify(dependencyIds(task));
      Alert.alert('Incomplete prerequisites', 'This task still has incomplete prerequisites. Complete it anyway?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Complete Anyway', onPress: () => {
          const latest = projectSnapshot.current.tasks.find((item) => item.projectId === task.projectId && item.id === task.id);
          // Repeated/stale confirmation must never reopen a completed task.
          if (!latest || latest.status === 'done') return;
          toggleTask(task.id, task.projectId, JSON.stringify(dependencyIds(latest)) === selectedDependencies);
        } },
      ]);
      return;
    }

    if (task.isManual || task.templateDetached) {
      const nextTasks = tasks.map((item) => item.projectId === project.id && item.id === task.id ? {
        ...item, status: task.status === 'done' ? 'todo' as const : 'done' as const,
        completedAt: task.status === 'done' ? undefined : new Date().toISOString(),
      } : item);
      const updatedProject = transitionProject(project, tasks, nextTasks, task.status === 'done' ? 'reopen' : 'complete');
      commitProjectState(projects.map((item) => item.id === project.id ? updatedProject : item), nextTasks);
      if (project.remindersEnabled) void scheduleProjectReminders(updatedProject, nextTasks, false);
      return;
    }

    const reopening = task.status === 'done';
    const nextTasks: ProjectTask[] = tasks.map((item) => {
      if (item.projectId !== task.projectId || item.isManual || item.templateDetached) return item;
      if (reopening && item.order >= task.order) {
        return { ...item, status: 'todo' as const, completedAt: undefined };
      }
      if (!reopening && item.id === taskId) {
        return { ...item, status: 'done' as const, completedAt: new Date().toISOString() };
      }
      return item;
    });
    const recalculated = recalculateTimeline(project, nextTasks.filter((item) => item.projectId === project.id));
    const transitioned = transitionProject(project, tasks, recalculated.tasks, reopening ? 'reopen' : 'complete');
    const updatedProject = { ...recalculated.project, ...(transitioned.status ? { status: transitioned.status, completionSource: transitioned.completionSource } : {}) };
    commitProjectState(projects.map((item) => item.id === project.id ? updatedProject : item),
      tasks.map((item) => item.projectId === project.id ? recalculated.tasks.find((nextTask) => nextTask.id === item.id) ?? item : item));
    if (updatedProject.remindersEnabled) void scheduleProjectReminders(updatedProject, recalculated.tasks, false);
  };

  const updateReminderFrequency = (projectId: string, frequency: ReminderFrequency) => {
    if (!mutable()) return;
    const { projects, tasks } = projectSnapshot.current;
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    const updatedProject = { ...project, reminderFrequency: frequency };
    commitProjectState(projects.map((item) => item.id === projectId ? updatedProject : item));
    if (updatedProject.remindersEnabled) void scheduleProjectReminders(updatedProject, tasks, false);
  };

  const enableProjectReminders = async (projectId: string) => {
    if (!mutable()) return false;
    const { projects, tasks } = projectSnapshot.current;
    const project = projects.find((item) => item.id === projectId);
    if (!project || isArchived(project)) return false;
    const enabledProject = { ...project, remindersEnabled: true };
    commitProjectState(projects.map((item) => item.id === projectId ? enabledProject : item));
    return settings.notificationsEnabled ? scheduleProjectReminders(enabledProject, tasks) : false;
  };

  const setProjectStatus: FlowContextValue['setProjectStatus'] = (projectId, status, confirmIncomplete = false) => {
    if (!mutable()) return false;
    const { projects, tasks } = projectSnapshot.current;
    const project = projects.find((item) => item.id === projectId);
    if (!hydrated || !project || !PROJECT_STATUSES.includes(status)) return false;
    if (status === 'Completed' && projectProgress(projectId, tasks).incomplete > 0 && !confirmIncomplete) return false;
    commitProjectState(projects.map((item) => item.id === projectId ? { ...item, status, completionSource: status === 'Completed' ? 'manual' : undefined } : item));
    return true;
  };

  const setProjectArchived: FlowContextValue['setProjectArchived'] = (projectId, archived, confirmed = false) => {
    if (!mutable()) return false;
    const { projects, tasks } = projectSnapshot.current;
    const project = projects.find((item) => item.id === projectId);
    if (!hydrated || !project || (archived && !confirmed)) return false;
    // Freeze a legacy derived status so task actions while archived cannot change it implicitly.
    const updated = { ...project, archived, status: projectStatus(project, tasks) };
    const next = projects.map((item) => item.id === projectId ? updated : item);
    commitProjectState(next);
    void syncProjectReminders(next, tasks, settings.notificationsEnabled)
      .catch(() => setPersonalReminderNotice('Project reminders could not be updated. Reopen the app to retry.'));
    return true;
  };

  const deleteProject = (projectId: string) => {
    if (!mutable()) return;
    const { projects, tasks } = projectSnapshot.current;
    void syncProjectReminders(projects.filter((project) => project.id !== projectId), tasks, settings.notificationsEnabled).catch(() => setPersonalReminderNotice('Project reminders could not be updated. Reopen the app to retry.'));
    commitProjectState(projects.filter((project) => project.id !== projectId), tasks.filter((task) => task.projectId !== projectId));
  };

  const getDataSnapshot = (): AppData => snapshotData({ ...projectSnapshot.current, templates: templateRef.current, personalTasks: personalRef.current, settings: getSettingsSnapshot() });
  const restoreBackup: FlowContextValue['restoreBackup'] = async (backup) => {
    if (!hydrated || restoring || !mutable()) return { ok: false, error: 'Please wait for data to finish loading or saving.' };
    let validated: Backup;
    try { validated = parseBackup(JSON.stringify(backup)); validated.data = normalizeTemplateLinks(validated.data); }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Invalid backup.' }; }
    setRestoring(true);
    const previous = getDataSnapshot();
    const result = await replaceData(validated.data, (data) => {
      commitProjectState(data.projects, data.tasks); templateRef.current = data.templates; setTemplateList(data.templates);
      personalRef.current = data.personalTasks; setPersonalTasks(data.personalTasks);
      acceptRestoredSettings(data.settings); setStorageError('');
    }, previous);
    if (result.recoveryRequired) { setRecoveryRequired(true); setRestoring(false); return result; }
    let warning: string | undefined;
    if (result.ok) {
      // Reconciliation cancels old dataset IDs and rebuilds only eligible reminders.
      // Permission denial is a warning, never a failed data restore.
      const data = validated.data;
      const results = await Promise.allSettled([
        syncProjectReminders(data.projects, data.tasks, data.settings.notificationsEnabled),
        syncPersonalReminders(data.personalTasks, data.settings.notificationsEnabled),
      ]);
      if (results.some((r) => r.status === 'rejected' || (r.status === 'fulfilled' && r.value))) warning = 'Data restored. Some reminders could not be updated. Check notification permission and reopen the app to retry.';
    }
    setRestoring(false);
    return { ...result, warning };
  };
  const value = useMemo(
    () => ({ projects, tasks, templates: templateList, hydrated, calendarDate, personalTasks, personalReminderNotice, savePersonalTask, completePersonalTask, reopenPersonalTask, deletePersonalTask, addTemplate, updateTemplate, deleteTemplate, addProject, addManualTask, toggleTask, setTaskDependencies, deleteProjectTask, applyReschedule, updateReminderFrequency, enableProjectReminders, deleteProject, setProjectStatus, setProjectArchived, getDataSnapshot, restoreBackup, storageError }),
    [projects, tasks, templateList, hydrated, calendarDate, personalTasks, personalReminderNotice, settings, storageError, restoring, generation],
  );

  return <FlowContext.Provider value={value}>{children}
    <Modal visible={restoring || recoveryRequired || !!storageError} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.45)' }}><View accessibilityViewIsModal style={{ backgroundColor: colors.card, padding: 24, borderRadius: 16, gap: 12 }}>
        <Text accessibilityRole="alert" style={{ color: colors.foreground }}>{recoveryRequired ? 'Restore needs recovery. Your previous data is protected. Retry before continuing.' : storageError || 'Restoring your data…'}</Text>
        {recoveryRequired && <Pressable accessibilityRole="button" accessibilityLabel="Retry data recovery" style={{ minHeight: 48, justifyContent: 'center' }} onPress={() => { void recoverData().then(() => { setRecoveryRequired(false); setStorageError(''); }).catch(() => {}); }}><Text style={{ color: colors.primary }}>Retry Recovery</Text></Pressable>}
        {!!storageError && hydrated && !recoveryRequired && <Pressable accessibilityRole="button" style={{ minHeight: 48, justifyContent: 'center' }} onPress={() => { const { settings: omitted, ...data } = getDataSnapshot(); void writeData(STORAGE_KEY, JSON.stringify(data)).then(() => setStorageError('')).catch(() => {}); }}><Text style={{ color: colors.primary }}>Retry Saving</Text></Pressable>}
      </View></View>
    </Modal>
  </FlowContext.Provider>;
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
