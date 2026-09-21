import { Feather } from '@expo/vector-icons';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { TaskRow } from '@/components/TaskRow';
import { daysRemaining, useFlow } from '@/context/FlowContext';
import { useColors } from '@/hooks/useColors';
import { openTasksByDueDate } from '@/lib/task-utils';

export default function TasksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { tasks } = useFlow();
  const openTasks = openTasksByDueDate(tasks);
  const doneTasks = tasks.filter((task) => task.status === 'done');
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.content, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 18, paddingBottom: insets.bottom + 90 }]} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><View><AppText style={[styles.kicker, { color: colors.primary }]}>THE DAILY LIST</AppText><AppText style={styles.title}>To-do</AppText><AppText style={[styles.subtitle, { color: colors.mutedForeground }]}>One next action at a time.</AppText></View><View style={[styles.count, { backgroundColor: colors.foreground }]}><AppText style={[styles.countNumber, { color: colors.background }]}>{openTasks.length}</AppText><AppText style={[styles.countLabel, { color: '#B7C1D4' }]}>open</AppText></View></View>
      <View style={[styles.callout, { backgroundColor: colors.accent }]}><Feather name="bell" size={16} color={colors.accentForeground} /><AppText style={[styles.calloutText, { color: colors.accentForeground }]}>Your list is sorted by what needs attention first.</AppText></View>
      <AppText style={[styles.groupTitle, { color: colors.mutedForeground }]}>UP NEXT</AppText>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{openTasks.length ? openTasks.map((task) => <TaskRow key={`${task.projectId}:${task.id}`} task={task} />) : <AppText style={[styles.empty, { color: colors.mutedForeground }]}>Your work is clear for now.</AppText>}</View>
      {doneTasks.length ? <><AppText style={[styles.groupTitle, { color: colors.mutedForeground, marginTop: 19 }]}>COMPLETED</AppText><View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{doneTasks.map((task) => <TaskRow key={`${task.projectId}:${task.id}`} task={task} />)}</View></> : null}
      {openTasks.some((task) => daysRemaining(task.dueDate) < 0) ? <AppText style={[styles.note, { color: colors.primary }]}>A few tasks are past their suggested date. Finish one small thing next.</AppText> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
