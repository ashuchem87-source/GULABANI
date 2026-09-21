import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { SectionTitle } from '@/components/SectionTitle';
import { TaskRow } from '@/components/TaskRow';
import { daysRemaining, useFlow } from '@/context/FlowContext';
import { useColors } from '@/hooks/useColors';

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { projects, tasks, calendarDate } = useFlow();
  const openTasks = tasks.filter((task) => task.status === 'todo');
  const nextTask = [...openTasks].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
  const activeProjects = projects.filter((project) => daysRemaining(project.dueDate) >= 0).length;
  const completed = tasks.filter((task) => task.status === 'done').length;
  const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  const urgentTasks = useMemo(() => openTasks.filter((task) => daysRemaining(task.dueDate) <= 2).slice(0, 3), [tasks, calendarDate]);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 18, paddingBottom: insets.bottom + 90 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View>
          <AppText style={[styles.eyebrow, { color: colors.primary }]}>SUNDAY, SEPTEMBER 20</AppText>
          <AppText style={styles.greeting}>Good morning, Ashu.</AppText>
          <AppText style={[styles.subhead, { color: colors.mutedForeground }]}>Let’s keep the important things moving.</AppText>
        </View>
        <Pressable testID="add-project" onPress={() => router.push('/new-project')} style={({ pressed }) => [styles.addButton, { backgroundColor: colors.foreground, opacity: pressed ? 0.8 : 1 }]}>
          <Feather name="plus" size={20} color={colors.background} />
        </Pressable>
      </View>

      <View style={[styles.hero, { backgroundColor: colors.foreground }]}>
        <View style={styles.heroTop}>
          <View style={styles.nextLabel}><View style={[styles.liveDot, { backgroundColor: colors.primary }]} /><AppText style={[styles.heroLabel, { color: '#D6DCE8' }]}>YOUR NEXT STEP</AppText></View>
          <Feather name="arrow-up-right" size={20} color="#B7C1D4" />
        </View>
        {nextTask ? (
          <>
            <AppText style={styles.heroTitle}>{nextTask.title}</AppText>
            <AppText style={styles.heroProject}>{projects.find((project) => project.id === nextTask.projectId)?.name ?? 'Project'}</AppText>
            <View style={styles.heroBottom}>
              <AppText style={[styles.heroDue, { color: daysRemaining(nextTask.dueDate) <= 1 ? '#FFB6A9' : '#D6DCE8' }]}>{daysRemaining(nextTask.dueDate) <= 0 ? 'Needs attention today' : `${daysRemaining(nextTask.dueDate)} days remaining`}</AppText>
              <Pressable onPress={() => router.push('/tasks')} style={({ pressed }) => [styles.openButton, { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 }]}><AppText style={styles.openButtonText}>Open task</AppText><Feather name="arrow-right" size={14} color={colors.primaryForeground} /></Pressable>
            </View>
          </>
        ) : <AppText style={styles.heroTitle}>You’re all caught up.</AppText>}
      </View>

      <View style={styles.metrics}>
        <View style={styles.metric}><AppText style={[styles.metricValue, { color: colors.foreground }]}>{activeProjects}</AppText><AppText style={[styles.metricLabel, { color: colors.mutedForeground }]}>Active projects</AppText></View>
        <View style={[styles.metric, { borderLeftColor: colors.border, borderLeftWidth: 1 }]}><AppText style={[styles.metricValue, { color: colors.foreground }]}>{openTasks.length}</AppText><AppText style={[styles.metricLabel, { color: colors.mutedForeground }]}>Open steps</AppText></View>
        <View style={[styles.metric, { borderLeftColor: colors.border, borderLeftWidth: 1 }]}><AppText style={[styles.metricValue, { color: colors.primary }]}>{progress}%</AppText><AppText style={[styles.metricLabel, { color: colors.mutedForeground }]}>Complete</AppText></View>
      </View>

      <View style={styles.section}>
        <SectionTitle title="Needs attention" action="See all" onAction={() => router.push('/tasks')} />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{urgentTasks.length ? urgentTasks.map((task) => <TaskRow key={task.id} task={task} compact />) : <AppText style={[styles.empty, { color: colors.mutedForeground }]}>Nothing urgent right now.</AppText>}</View>
      </View>

      <View style={styles.section}>
        <SectionTitle title="Your projects" action="View all" onAction={() => router.push('/projects')} />
        {projects.slice(0, 3).map((project) => {
          const projectTasks = tasks.filter((task) => task.projectId === project.id);
          const done = projectTasks.filter((task) => task.status === 'done').length;
          return (
            <Pressable key={project.id} onPress={() => router.push({ pathname: '/project/[id]', params: { id: project.id } })} style={({ pressed }) => [styles.projectCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}>
              <View style={styles.projectInfo}><View style={[styles.projectDot, { backgroundColor: colors.primary }]} /><View style={{ flex: 1, gap: 4 }}><AppText style={styles.projectName}>{project.name}</AppText><AppText style={[styles.projectClient, { color: colors.mutedForeground }]}>{project.client}</AppText></View><Feather name="chevron-right" size={18} color={colors.mutedForeground} /></View>
              <View style={styles.progressLine}><View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${projectTasks.length ? (done / projectTasks.length) * 100 : 0}%` }]} /></View>
              <View style={styles.projectMeta}><AppText style={[styles.projectClient, { color: colors.mutedForeground }]}>{done} of {projectTasks.length} steps complete</AppText><AppText style={[styles.projectClient, { color: colors.mutedForeground }]}>{daysRemaining(project.dueDate)}d left</AppText></View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 26 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: { fontFamily: 'Inter_700Bold', letterSpacing: 1.5, fontSize: 10, marginBottom: 8 },
  greeting: { fontFamily: 'Inter_700Bold', fontSize: 28, letterSpacing: -1 },
  subhead: { fontSize: 13, marginTop: 7 },
  addButton: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  hero: { borderRadius: 24, padding: 20, minHeight: 190 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nextLabel: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  heroLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.4 },
  heroTitle: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 25, letterSpacing: -0.6, marginTop: 25 },
  heroProject: { color: '#AEB8CB', fontFamily: 'Inter_500Medium', fontSize: 13, marginTop: 6 },
  heroBottom: { marginTop: 25, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroDue: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  openButton: { flexDirection: 'row', gap: 7, alignItems: 'center', paddingHorizontal: 13, paddingVertical: 10, borderRadius: 12 },
  openButtonText: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  metrics: { flexDirection: 'row', justifyContent: 'space-between' },
  metric: { flex: 1, gap: 5 },
  metricValue: { fontFamily: 'Inter_700Bold', fontSize: 23 },
  metricLabel: { fontSize: 11 },
  section: { gap: 1 },
  card: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14 },
  empty: { paddingVertical: 24, textAlign: 'center', fontSize: 13 },
  projectCard: { borderWidth: 1, borderRadius: 18, padding: 15, marginBottom: 10 },
  projectInfo: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  projectDot: { width: 9, height: 9, borderRadius: 5 },
  projectName: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  projectClient: { fontSize: 11 },
  progressLine: { height: 5, borderRadius: 3, backgroundColor: '#EEF0F2', marginTop: 16, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  projectMeta: { marginTop: 9, flexDirection: 'row', justifyContent: 'space-between' },
});
