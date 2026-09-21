import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { Project, ProjectTask } from '@/context/FlowContext';
import { calendarDaysUntil } from '@/lib/task-utils';

const REMINDER_IDS_KEY = 'flowpilot-scheduled-reminder-ids-v1';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

type StoredReminderIds = Record<string, string[]>;

async function readReminderIds(): Promise<StoredReminderIds> {
  const stored = await AsyncStorage.getItem(REMINDER_IDS_KEY);
  return stored ? (JSON.parse(stored) as StoredReminderIds) : {};
}

async function cancelProjectReminders(projectId: string) {
  if (Platform.OS === 'web') return;
  const stored = await readReminderIds();
  await Promise.all((stored[projectId] ?? []).map((id) => Notifications.cancelScheduledNotificationAsync(id)));
  delete stored[projectId];
  await AsyncStorage.setItem(REMINDER_IDS_KEY, JSON.stringify(stored));
}

export async function requestReminderPermission() {
  if (Platform.OS === 'web') return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

function cadenceInDays(project: Project) {
  if (project.reminderFrequency === 'Every 2 days') return 2;
  if (project.reminderFrequency === 'Weekly') return 7;
  return 1;
}

function remainingLabel(days: number) {
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return '1 day remaining';
  return `${days} days remaining`;
}

export async function scheduleProjectReminders(project: Project, tasks: ProjectTask[], askForPermission = true) {
  if (Platform.OS === 'web') return false;
  await cancelProjectReminders(project.id);
  const allowed = askForPermission ? await requestReminderPermission() : (await Notifications.getPermissionsAsync()).granted;
  if (!allowed || !project.remindersEnabled) return allowed;

  const nextTask = tasks
    .filter((task) => task.projectId === project.id && task.status === 'todo')
    .sort((a, b) => a.order - b.order)[0];
  if (!nextTask) return true;

  const firstReminder = new Date();
  firstReminder.setHours(9, 0, 0, 0);
  if (firstReminder.getTime() <= Date.now()) firstReminder.setDate(firstReminder.getDate() + 1);

  const projectDeadline = new Date(project.dueDate);
  projectDeadline.setHours(23, 59, 59, 999);
  const interval = cadenceInDays(project);
  const ids: string[] = [];
  for (let fireAt = new Date(firstReminder); fireAt <= projectDeadline && ids.length < 60; fireAt.setDate(fireAt.getDate() + interval)) {
    const days = calendarDaysUntil(nextTask.dueDate, fireAt);
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'FlowPilot · Next step',
        body: `${nextTask.title} · ${remainingLabel(days)} in ${project.name}`,
        data: { projectId: project.id, taskId: nextTask.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(fireAt),
      },
    });
    ids.push(id);
  }
  const stored = await readReminderIds();
  stored[project.id] = ids;
  await AsyncStorage.setItem(REMINDER_IDS_KEY, JSON.stringify(stored));
  return true;
}
