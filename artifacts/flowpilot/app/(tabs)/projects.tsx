import { useState } from 'react';
import { useDateFormatter } from '@/context/SettingsContext';
import { visibleProjects, projectStatus, projectHealth, type ProjectView } from '@/lib/project-management';
import { ProjectProgress } from '@/components/ProjectProgress';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { daysRemaining, useFlow } from '@/context/FlowContext';
import { useColors } from '@/hooks/useColors';

export default function ProjectsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { projects, tasks, calendarDate } = useFlow();
  const formatDate = useDateFormatter();
  const [view, setView] = useState<ProjectView>('Active');
  const visible = visibleProjects(projects, tasks, view);
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.content, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 18, paddingBottom: insets.bottom + 90 }]} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><View><AppText style={[styles.kicker, { color: colors.primary }]}>WORKSPACE</AppText><AppText style={styles.title}>Projects</AppText><AppText style={[styles.subtitle, { color: colors.mutedForeground }]}>Every active flow, in one place.</AppText></View><Pressable accessibilityRole="button" accessibilityLabel="New Project" onPress={() => router.push('/new-project')} style={[styles.add, { backgroundColor: colors.foreground }]}><Feather name="plus" size={20} color={colors.background} /></Pressable></View>
      <View style={styles.filters}>{(['Active', 'Completed', 'Archived'] as const).map((value) => <Pressable key={value} testID={`projects-${value.toLowerCase()}`} accessibilityRole="button" accessibilityLabel={`${value} projects`} accessibilityState={{ selected: view === value }} onPress={() => setView(value)} style={[styles.filter, { borderColor: colors.border, backgroundColor: view === value ? colors.foreground : colors.card }]}><AppText style={{ color: view === value ? colors.background : colors.foreground, fontSize: 13 }}>{value}</AppText></Pressable>)}</View>
      {!visible.length && <AppText testID="projects-empty" style={{ color: colors.mutedForeground, paddingVertical: 18 }}>{view === 'Archived' ? 'No archived projects.' : view === 'Completed' ? 'No completed projects.' : 'No active projects. Create a project or view Completed and Archived.'}</AppText>}
      {visible.map((project) => {
        return (
          <Pressable key={project.id} testID={'project-card-' + project.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/project/[id]', params: { id: project.id } })} style={({ pressed }) => [styles.project, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.76 : 1 }]}>
            <View style={styles.row}><View style={[styles.dot, { backgroundColor: colors.primary }]} /><AppText style={styles.name}>{project.name}</AppText><Feather name="arrow-up-right" size={17} color={colors.mutedForeground} /></View>
            <AppText style={[styles.client, { color: colors.mutedForeground }]}>{project.client}</AppText>
            <AppText style={[styles.summary, { color: colors.mutedForeground }]} numberOfLines={2}>{project.summary}</AppText>
            <AppText style={[styles.status, { color: colors.mutedForeground }]}>{view === 'Archived' ? 'Archived · ' : ''}{projectStatus(project, tasks)} · {projectHealth(project, tasks, calendarDate)}</AppText>
            <ProjectProgress projectId={project.id} tasks={tasks} />
            <View style={styles.footer}><AppText style={[styles.meta, { color: colors.mutedForeground }]}>Due {formatDate(project.dueDate)}</AppText><View style={[styles.deadline, { backgroundColor: daysRemaining(project.dueDate) <= 2 ? colors.accent : colors.secondary }]}><AppText style={[styles.deadlineText, { color: daysRemaining(project.dueDate) <= 2 ? colors.accentForeground : colors.secondaryForeground }]}>{daysRemaining(project.dueDate)} days remaining</AppText></View></View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: 10 }, filter: { minHeight: 48, flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }, status: { fontSize: 12, marginVertical: 12 },
  content: { paddingHorizontal: 20, gap: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  kicker: { fontFamily: 'Inter_700Bold', letterSpacing: 1.5, fontSize: 10, marginBottom: 8 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 30, letterSpacing: -1 },
  subtitle: { fontSize: 13, marginTop: 5 },
  add: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  project: { borderWidth: 1, borderRadius: 20, padding: 17, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  name: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 16 },
  client: { fontSize: 12, marginTop: 7, marginLeft: 19 },
  summary: { fontSize: 13, lineHeight: 19, marginTop: 14 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginTop: 11 },
  meta: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  deadline: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
  deadlineText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
});
