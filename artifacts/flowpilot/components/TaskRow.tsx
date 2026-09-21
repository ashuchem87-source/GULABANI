import { useDateFormatter } from '@/context/SettingsContext';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { ProjectTask, daysRemaining, useFlow } from '@/context/FlowContext';
import { useColors } from '@/hooks/useColors';

export function TaskRow({ task, compact = false }: { task: ProjectTask; compact?: boolean }) {
  const colors = useColors();
  const formatShortDate = useDateFormatter();
  const { toggleTask, projects } = useFlow();
  const project = projects.find((item) => item.id === task.projectId);
  const remaining = daysRemaining(task.dueDate);
  const isDone = task.status === 'done';
  const dueLabel = isDone ? task.completedAt ? `Completed ${formatShortDate(task.completedAt)}` : 'Completed' : remaining < 0 ? `${Math.abs(remaining)}d overdue` : remaining === 0 ? 'Due today' : `${remaining}d left`;

  return (
    <Pressable
      testID={`task-${task.id}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isDone }}
      accessibilityLabel={`${isDone ? 'Reopen' : 'Complete'} ${task.title}`}
      onPress={() => {
        Haptics.selectionAsync();
        toggleTask(task.id, task.projectId);
      }}
      style={({ pressed }) => [styles.row, compact && styles.compact, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[styles.checkbox, { borderColor: isDone ? colors.primary : colors.input, backgroundColor: isDone ? colors.action : 'transparent' }]}>
        {isDone ? <Feather name="check" size={14} color={colors.primaryForeground} /> : null}
      </View>
      <View style={styles.copy}>
        <AppText style={[styles.title, { color: isDone ? colors.mutedForeground : colors.foreground, textDecorationLine: isDone ? 'line-through' : 'none' }]}>{task.title}</AppText>
        {!compact && project ? <AppText style={[styles.project, { color: colors.mutedForeground }]}>{project.name}</AppText> : null}
      </View>
      {!isDone ? (
        <View style={[styles.due, { backgroundColor: remaining <= 1 ? colors.accent : colors.secondary }]}>
          <AppText style={[styles.dueText, { color: remaining <= 1 ? colors.accentForeground : colors.secondaryForeground }]}>{dueLabel}</AppText>
        </View>
      ) : (
        <AppText style={[styles.doneText, { color: colors.mutedForeground }]}>{dueLabel}</AppText>
      )}
      {!compact && !isDone ? <AppText style={[styles.date, { color: colors.mutedForeground }]}>{formatShortDate(task.dueDate)}</AppText> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 70, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 },
  compact: { minHeight: 62 },
  checkbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 5 },
  title: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  project: { fontSize: 12 },
  due: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  dueText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  doneText: { maxWidth: '45%', fontFamily: 'Inter_500Medium', fontSize: 11 },
  date: { fontSize: 11, minWidth: 45, textAlign: 'right' },
});
