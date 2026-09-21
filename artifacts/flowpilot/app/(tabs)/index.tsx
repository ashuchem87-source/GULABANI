import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { TaskRow } from '@/components/TaskRow';
import { PersonalTaskRow } from '@/components/PersonalTaskRow';
import { QuickAdd } from '@/components/QuickAdd';
import { useFlow } from '@/context/FlowContext';
import { useDateFormatter, useSettings } from '@/context/SettingsContext';
import { useColors } from '@/hooks/useColors';
import { dashboardGroups, dashboardCounts, dashboardEntryKey, DASHBOARD_LIMIT, type DashboardBucket } from '@/lib/dashboard';

export default function HomeScreen() {
  const colors = useColors(), insets = useSafeAreaInsets();
  const { projects, tasks, personalTasks, calendarDate, hydrated } = useFlow();
  const { settings } = useSettings();
  const formatDate = useDateFormatter();
  const groups = useMemo(() => dashboardGroups(tasks, personalTasks, calendarDate, settings),
    [tasks, personalTasks, calendarDate, settings.showPersonal, settings.showProjects, settings.showCompleted]);
  const counts = dashboardCounts(groups);
  const projectNames = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  const summaries: { key: DashboardBucket; label: string }[] = [
    { key: 'today', label: 'Today' }, { key: 'overdue', label: 'Overdue' }, { key: 'upcoming', label: 'Upcoming' },
    ...(settings.showCompleted ? [{ key: 'completed' as const, label: 'Completed Today' }] : []),
  ];
  const section = (key: DashboardBucket, title: string, limit?: number) => {
    const entries = groups[key];
    if (!entries.length) return null;
    return <View key={key} testID={'dashboard-' + key} style={styles.section}>
      <View style={styles.sectionHeader}><AppText accessibilityRole="header" style={[styles.sectionTitle, { color: key === 'overdue' ? colors.accentForeground : colors.foreground }]}>{title}</AppText>
        {limit && entries.length > limit ? <Pressable testID={'view-all-' + key} accessibilityRole="button" accessibilityLabel={'View all ' + title.toLowerCase() + ' tasks in To-do'} onPress={() => router.push('/tasks')} style={styles.viewAll}><AppText style={{ color: colors.primary, fontSize: 13 }}>View all</AppText><Feather name="arrow-up-right" size={15} color={colors.primary} /></Pressable> : null}
      </View>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {(limit ? entries.slice(0, limit) : entries).map((entry) => entry.kind === 'personal'
          ? <PersonalTaskRow key={dashboardEntryKey(entry)} task={entry.task} />
          : <View key={dashboardEntryKey(entry)}>
            <Pressable testID={'open-project-' + entry.task.projectId + '-' + entry.task.id} accessibilityRole="button" accessibilityLabel={'Open project ' + (projectNames.get(entry.task.projectId) ?? entry.task.projectId)} onPress={() => router.push({ pathname: '/project/[id]', params: { id: entry.task.projectId } })} style={styles.projectLink}>
              <AppText numberOfLines={2} style={[styles.projectName, { color: colors.mutedForeground }]}>{projectNames.get(entry.task.projectId) ?? 'Project unavailable'}</AppText><Feather name="arrow-up-right" size={16} color={colors.primary} />
            </Pressable>
            <TaskRow task={entry.task} compact />
          </View>)}
      </View>
    </View>;
  };
  const hidden = !settings.showPersonal && !settings.showProjects;
  return <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.content, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 18, paddingBottom: insets.bottom + 90 }]} showsVerticalScrollIndicator={false}>
    <View><AppText style={[styles.eyebrow, { color: colors.primary }]}>GULABANI</AppText><AppText accessibilityRole="header" style={styles.title}>Today</AppText><AppText testID="dashboard-date" style={[styles.date, { color: colors.mutedForeground }]}>{formatDate(calendarDate)}</AppText></View>
    <QuickAdd />
    {!hydrated ? <AppText style={{ color: colors.mutedForeground }}>Loading your day…</AppText> : <>
      <View style={styles.summaries}>{summaries.map(({ key, label }) => <View key={key} testID={'count-' + key} accessible accessibilityLabel={label + ': ' + counts[key]} style={[styles.summary, { backgroundColor: key === 'overdue' && counts.overdue ? colors.accent : colors.card, borderColor: colors.border }]}><AppText style={[styles.count, { color: key === 'overdue' && counts.overdue ? colors.accentForeground : colors.foreground }]}>{counts[key]}</AppText><AppText style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{label}</AppText></View>)}</View>
      {hidden ? <View style={styles.empty}><AppText style={{ color: colors.mutedForeground }}>Tasks are hidden in Settings.</AppText><Pressable accessibilityRole="button" onPress={() => router.push('/settings')} style={styles.viewAll}><AppText style={{ color: colors.primary }}>Open Settings</AppText></Pressable></View> : <>
        {groups.today.length ? section('today', 'Today') : <AppText testID="empty-today" style={[styles.emptyText, { color: colors.mutedForeground }]}>No tasks due today.</AppText>}
        {section('overdue', 'Overdue')}
        {section('upcoming', 'Upcoming', DASHBOARD_LIMIT)}
        {section('unscheduled', 'No Date', DASHBOARD_LIMIT)}
        {settings.showCompleted && section('completed', 'Completed Today', DASHBOARD_LIMIT)}
      </>}
    </>}
  </ScrollView>;
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 22 }, eyebrow: { fontFamily: 'Inter_700Bold', letterSpacing: 1.5, fontSize: 10, marginBottom: 8 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 30, letterSpacing: -1 }, date: { fontSize: 13, marginTop: 7 },
  summaries: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, summary: { width: '48%', flexGrow: 1, minHeight: 84, borderWidth: 1, borderRadius: 16, padding: 14, gap: 5 },
  count: { fontFamily: 'Inter_700Bold', fontSize: 24 }, summaryLabel: { fontSize: 12 },
  section: { gap: 8 }, sectionHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionTitle: { flexShrink: 1, fontFamily: 'Inter_700Bold', fontSize: 19, letterSpacing: -0.3 }, viewAll: { minHeight: 44, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 3 },
  card: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14 }, projectLink: { minHeight: 44, paddingTop: 6, flexDirection: 'row', gap: 8, alignItems: 'center' }, projectName: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12 },
  empty: { alignItems: 'center', gap: 4 }, emptyText: { paddingVertical: 10, textAlign: 'center', fontSize: 13 },
});
