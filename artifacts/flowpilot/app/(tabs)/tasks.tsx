import { todoGroups, type TodoStatusView } from '@/lib/todo-view';
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
import { type TodoEntry, type TodoFilter } from '@/lib/personal-tasks';

export default function TasksScreen() {
  const colors = useColors();
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();
  const { projects, tasks, personalTasks, personalReminderNotice, calendarDate } = useFlow();
  const [filter, setFilter] = useState<TodoFilter>('All');
  const [status, setStatus] = useState<TodoStatusView>('Open');
  const { open: openTasks, unscheduled, completed: doneTasks, openCount } = todoGroups(projects, tasks, personalTasks, calendarDate, filter, settings);
  const row = (entry: TodoEntry) => entry.kind === 'personal'
    ? <PersonalTaskRow key={entry.task.id} task={entry.task} />
    : <TaskRow key={`${entry.task.projectId}:${entry.task.id}`} task={entry.task} />;
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.content, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 18, paddingBottom: insets.bottom + 90 }]} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><View><AppText style={[styles.kicker, { color: colors.primary }]}>THE DAILY LIST</AppText><AppText style={styles.title}>To-do</AppText><AppText style={[styles.subtitle, { color: colors.mutedForeground }]}>One next action at a time.</AppText></View><View style={[styles.count, { backgroundColor: colors.foreground }]}><AppText testID="todo-count" accessibilityLabel={`${status}: ${status === 'Open' ? openCount : doneTasks.length}`} style={[styles.countNumber, { color: colors.background }]}>{status === 'Open' ? openCount : doneTasks.length}</AppText><AppText style={[styles.countLabel, { color: colors.background }]}>{status === 'Open' ? 'open' : 'completed'}</AppText></View></View>
      <Pressable testID="add-personal-todo" accessibilityRole="button" onPress={() => router.push('/personal-task')} style={[styles.addTodo, { backgroundColor: colors.action }]}><Feather name="plus" size={18} color="#FFFFFF" /><AppText style={styles.addText}>Add To-do</AppText></Pressable>
      <View style={styles.filters}>{(['Open', 'Completed'] as const).map((value) => <Pressable testID={`todo-status-${value}`} key={value} accessibilityRole="button" accessibilityLabel={`${value} to-dos`} accessibilityState={{ selected: status === value }} onPress={() => setStatus(value)} style={[styles.filter, { backgroundColor: status === value ? colors.foreground : colors.card, borderColor: colors.border }]}><AppText style={{ color: status === value ? colors.background : colors.foreground }}>{value}</AppText></Pressable>)}</View>
      <View style={styles.filters}>{(['All', 'Personal', 'Projects'] as const).map((value) => <Pressable testID={`todo-filter-${value}`} key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={[styles.filter, { backgroundColor: filter === value ? colors.foreground : colors.card, borderColor: colors.border }]}><AppText style={{ color: filter === value ? colors.background : colors.foreground }}>{value}</AppText></Pressable>)}</View>
      {!!personalReminderNotice && <AppText accessibilityRole="alert" style={[styles.note, { color: colors.primary }]}>{personalReminderNotice}</AppText>}
      {status === 'Open' ? <>
        <View style={[styles.callout, { backgroundColor: colors.accent }]}><Feather name="bell" size={16} color={colors.accentForeground} /><AppText style={[styles.calloutText, { color: colors.accentForeground }]}>Overdue, today and the next 7 days.</AppText></View>
        <AppText style={[styles.groupTitle, { color: colors.mutedForeground }]}>UP NEXT</AppText>
        <View testID="todo-open-list" style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{openTasks.length ? openTasks.map(row) : <AppText style={styles.empty}>{todoEmptyMessage(settings, filter)}</AppText>}</View>
        {!!unscheduled.length && <><AppText style={[styles.groupTitle, { color: colors.mutedForeground }]}>UNSCHEDULED</AppText><View testID="todo-unscheduled-list" style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{unscheduled.map(row)}</View></>}
        {openTasks.some(({ task }) => task.dueDate && daysRemaining(task.dueDate) < 0) ? <AppText style={[styles.note, { color: colors.primary }]}>A few tasks are past their suggested date. Finish one small thing next.</AppText> : null}
      </> : <>
        <AppText style={[styles.groupTitle, { color: colors.mutedForeground }]}>COMPLETED</AppText>
        <View testID="todo-completed-list" style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{doneTasks.length ? doneTasks.map(row) : <AppText style={styles.empty}>{!settings.showPersonal || !settings.showProjects ? todoEmptyMessage(settings, filter) : 'No completed tasks in this view.'}</AppText>}</View>
      </>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  addTodo: { minHeight: 50, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  addText: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 14 },
  filters: { flexDirection: 'row', gap: 8 }, filter: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, gap: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 7 },
  kicker: { fontFamily: 'Inter_700Bold', letterSpacing: 1.5, fontSize: 10, marginBottom: 8 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 30, letterSpacing: -1 },
  subtitle: { fontSize: 13, marginTop: 5 },
  count: { borderRadius: 15, minWidth: 72, paddingHorizontal: 6, height: 59, alignItems: 'center', justifyContent: 'center' },
  countNumber: { fontFamily: 'Inter_700Bold', fontSize: 19 },
  countLabel: { fontFamily: 'Inter_500Medium', fontSize: 10 },
  callout: { borderRadius: 13, paddingHorizontal: 13, paddingVertical: 11, flexDirection: 'row', gap: 9, alignItems: 'center' },
  calloutText: { fontFamily: 'Inter_500Medium', fontSize: 11, flex: 1 },
  groupTitle: { fontFamily: 'Inter_700Bold', letterSpacing: 1.4, fontSize: 10, marginTop: 8 },
  card: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14 },
  empty: { textAlign: 'center', paddingVertical: 26, fontSize: 13 },
  note: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 },
});
