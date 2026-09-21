import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { requestReminderPermission } from '@/lib/notifications';
import { personalReminderAt, type PersonalTask } from '@/lib/personal-tasks';

const PREFIX = 'gulabani-personal-';
let queue: Promise<unknown> = Promise.resolve();

export async function askPersonalReminderPermission(): Promise<string | undefined> {
  if (Platform.OS === 'web') return 'Saved. Personal reminders are only available in the mobile app.';
  return await requestReminderPermission() ? undefined : 'Saved without a scheduled reminder. Notification permission was not granted.';
}

// Reconcile only our own deterministic IDs. Serializing prevents edit/complete/delete races.
export function syncPersonalReminders(tasks: PersonalTask[]): Promise<string | undefined> {
  const run = queue.catch(() => undefined).then(async () => {
    if (Platform.OS === 'web') return tasks.some((task) => task.status === 'todo' && task.reminder !== 'None') ? 'Personal reminders are only available in the mobile app.' : undefined;
    const existing = (await Notifications.getAllScheduledNotificationsAsync()).filter((item) => item.identifier.startsWith(PREFIX));
    const allowed = (await Notifications.getPermissionsAsync()).granted;
    const desired = new Map<string, { task: PersonalTask; date: Date; signature: string }>();
    let unscheduled = false;
    for (const task of tasks) {
      if (task.status !== 'todo' || task.reminder === 'None') continue;
      const date = personalReminderAt(task);
      if (!date || date.getTime() <= Date.now()) { unscheduled = true; continue; }
      if (!allowed) { unscheduled = true; continue; }
      desired.set(PREFIX + task.id, { task, date, signature: JSON.stringify([task.title, date.toISOString()]) });
    }
    for (const item of existing) {
      const next = desired.get(item.identifier);
      if (!next || item.content.data?.personalSignature !== next.signature) await Notifications.cancelScheduledNotificationAsync(item.identifier);
      else desired.delete(item.identifier);
    }
    for (const [identifier, { task, date, signature }] of desired) {
      await Notifications.scheduleNotificationAsync({ identifier,
        content: { title: 'GULABANI · Personal', body: task.title, data: { personalTaskId: task.id, personalSignature: signature } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
      });
    }
    return unscheduled ? 'Some personal reminders could not be scheduled: permission is off, the time has passed, or the local time is unavailable. Edit the task to choose a future reminder.' : undefined;
  });
  queue = run;
  return run;
}
