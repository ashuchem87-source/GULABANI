import { useDateFormatter } from '@/context/SettingsContext';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { daysRemaining, useFlow } from '@/context/FlowContext';
import { useColors } from '@/hooks/useColors';
import { personalDay, type PersonalTask } from '@/lib/personal-tasks';

export function PersonalTaskRow({ task }: { task: PersonalTask }) {
  const colors = useColors();
  const formatShortDate = useDateFormatter();
  const { completePersonalTask, reopenPersonalTask } = useFlow();
  const done = task.status === 'done';
  const edit = () => router.push({ pathname: '/personal-task', params: { id: task.id } });
  const day = personalDay(task);
  const days = day ? daysRemaining(day) : null;
  const due = days === null ? 'No due date' : days === 0 ? 'Due today' : days < 0 ? `${-days}d overdue` : `${days}d left`;
  return <View style={[styles.row, { borderBottomColor: colors.border }]}>
    <Pressable testID={`personal-complete-${task.id}`} accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={`${done ? 'Reopen' : 'Complete'} ${task.title}`} onPress={() => done ? reopenPersonalTask(task.id) : completePersonalTask(task.id)} style={styles.checkTouch}>
      <View style={[styles.check, { borderColor: done ? colors.primary : colors.input, backgroundColor: done ? colors.action : 'transparent' }]}>{done && <Feather name="check" size={14} color="#FFFFFF" />}</View>
    </Pressable>
    <Pressable testID={`edit-personal-${task.id}`} accessibilityRole="button" accessibilityLabel={`Edit ${task.title}`} onPress={edit} style={styles.copy}>
      <AppText style={[styles.meta, { color: colors.mutedForeground }]}>Personal · {task.priority}{task.recurrence.frequency !== 'None' ? ` · ${task.recurrence.frequency}` : ''}</AppText>
      <AppText style={[styles.title, { color: done ? colors.mutedForeground : colors.foreground, textDecorationLine: done ? 'line-through' : 'none' }]}>{task.title}</AppText>
      <AppText style={[styles.meta, { color: !done && days !== null && days < 0 ? colors.primary : colors.mutedForeground }]}>{done ? task.completedAt ? `Completed ${formatShortDate(task.completedAt)}` : 'Completed' : `${due}${task.dueDate ? ` · ${formatShortDate(task.dueDate)}` : ''}${task.dueTime ? ` ${task.dueTime}` : ''}`}</AppText>
    </Pressable>
    <Pressable testID={`edit-personal-button-${task.id}`} accessibilityRole="button" accessibilityLabel={`Edit ${task.title}`} onPress={edit} style={styles.editTouch}><Feather name="edit-2" size={18} color={colors.mutedForeground} /></Pressable>
  </View>;
}
const styles = StyleSheet.create({
  row: { minHeight: 82, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  editTouch: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  checkTouch: { minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  check: { width: 24, height: 24, borderWidth: 1.5, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, paddingVertical: 13, gap: 4 },
  title: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  meta: { fontSize: 11, lineHeight: 16 },
});
