import { useSettings } from '@/context/SettingsContext';
import { todoEmptyMessage } from '@/lib/settings';
import { Feather } from '@expo/vector-icons';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { TaskRow } from '@/components/TaskRow';
import { daysRemaining, useFlow } from '@/context/FlowContext';
import { useColors } from '@/hooks/useColors';
import { PersonalTaskRow } from '@/components/PersonalTaskRow';
import { todoEntries, type TodoEntry, type TodoFilter } from '@/lib/personal-tasks';

export default function TasksScreen() {
  const colors = useColors();
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();
  const { tasks, personalTasks, personalReminderNotice } = useFlow();
  const [filter, setFilter] = useState<TodoFilter>('All');
  const entries = todoEntries(tasks, personalTasks, filter, settings);
  const openTasks = entries.filter((entry) => entry.task.status === 'todo');
  const doneTasks = entries.filter((entry) => entry.task.status === 'done');
  const row = (entry: TodoEntry) => entry.kind === 'personal'
    ? <PersonalTaskRow key={entry.task.id} task={entry.task} />
    : <TaskRow key={`${entry.task.projectId}:${entry.task.id}`} task={entry.task} />;
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.content, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 18, paddingBottom: insets.bottom + 90 }]} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><View><AppText style={[styles.kicker, { color: colors.primary }]}>THE DAILY LIST</AppText><AppText style={styles.title}>To-do</AppText><AppText style={[styles.subtitle, { color: colors.mutedForeground }]}>One next action at a time.</AppText></View><View style={[styles.count, { backgroundColor: colors.foreground }]}><AppText style={[styles.countNumber, { color: colors.background }]}>{openTasks.length}</AppText><AppText style={[styles.countLabel, { color: colors.background }]}>open</AppText></View></View>
      <Pressable testID="add-personal-todo" accessibilityRole="button" onPress={() => router.push('/personal-task')} style={[styles.addTodo, { backgroundColor: colors.action }]}><Feather name="plus" size={18} color="#FFFFFF" /><AppText style={styles.addText}>Add To-do</AppText></Pressable>
      <View style={styles.filters}>{(['All', 'Personal', 'Projects'] as const).map((value) => <Pressable testID={`todo-filter-${value}`} key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={[styles.filter, { backgroundColor: filter === value ? colors.foreground : colors.card, borderColor: colors.border }]}><AppText style={{ color: filter === value ? colors.background : colors.foreground }}>{value}</AppText></Pressable>)}</View>
      {!!personalReminderNotice && <AppText accessibilityRole="alert" style={[styles.note, { color: colors.primary }]}>{personalReminderNotice}</AppText>}
      <View style={[styles.callout, { backgroundColor: colors.accent }]}><Feather name="bell" size={16} color={colors.accentForeground} /><AppText style={[styles.calloutText, { color: colors.accentForeground }]}>Your list is sorted by what needs attention first.</AppText></View>
      <AppText style={[styles.groupTitle, { color: colors.mutedForeground }]}>UP NEXT</AppText>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{openTasks.length ? openTasks.map(row) : <AppText style={[styles.empty, { color: colors.mutedForeground }]}>{todoEmptyMessage(settings, filter)}</AppText>}</View>
      {doneTasks.length ? <><AppText style={[styles.groupTitle, { color: colors.mutedForeground, marginTop: 19 }]}>COMPLETED</AppText><View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{doneTasks.map(row)}</View></> : null}
      {openTasks.some(({ task }) => task.dueDate && daysRemaining(task.dueDate) < 0) ? <AppText style={[styles.note, { color: colors.primary }]}>A few tasks are past their suggested date. Finish one small thing next.</AppText> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  addTodo: { minHeight: 50, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  addText: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 14 },
  filters: { flexDirection: 'row', gap: 8 }, filter: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, gap: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 7 },
  kicker: { fontFamily: 'Inter_700Bold', letterSpacing: 1.5, fontSize: 10, marginBottom: 8 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 30, letterSpacing: -1 },
  subtitle: { fontSize: 13, marginTop: 5 },
  count: { borderRadius: 15, width: 59, height: 59, alignItems: 'center', justifyContent: 'center' },
  countNumber: { fontFamily: 'Inter_700Bold', fontSize: 19 },
  countLabel: { fontFamily: 'Inter_500Medium', fontSize: 10 },
  callout: { borderRadius: 13, paddingHorizontal: 13, paddingVertical: 11, flexDirection: 'row', gap: 9, alignItems: 'center' },
  calloutText: { fontFamily: 'Inter_500Medium', fontSize: 11, flex: 1 },
  groupTitle: { fontFamily: 'Inter_700Bold', letterSpacing: 1.4, fontSize: 10, marginTop: 8 },
  card: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14 },
  empty: { textAlign: 'center', paddingVertical: 26, fontSize: 13 },
  note: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 },
});
