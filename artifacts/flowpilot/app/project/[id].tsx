import { ProjectProgress } from '@/components/ProjectProgress';
import { WorkflowSummary, TaskWorkflowActions } from '@/components/WorkflowIntelligence';
import { ProjectManagement } from '@/components/ProjectManagement';
import { projectProgress, projectStatus, projectHealth, isArchived } from '@/lib/project-management';
import { useDateFormatter, useSettings } from '@/context/SettingsContext';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { TaskRow } from '@/components/TaskRow';
import { daysRemaining, useFlow } from '@/context/FlowContext';
import { useColors } from '@/hooks/useColors';

export default function ProjectDetailScreen() {
  const colors = useColors();
  const formatShortDate = useDateFormatter();
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { projects, tasks, templates, calendarDate, deleteProject, updateReminderFrequency, enableProjectReminders } = useFlow();
  const project = projects.find((item) => item.id === id);
  if (!project) return <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}><AppText>Project not found.</AppText></View>;
  const projectTasks = tasks.filter((task) => task.projectId === project.id).sort((a, b) => a.order - b.order);
  const { completed: done, percent } = projectProgress(project.id, projectTasks);
  const archived = isArchived(project);
  const template = templates.find((item) => item.id === project.templateId);
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.content, { paddingTop: Platform.OS === 'web' ? 24 : insets.top + 14, paddingBottom: insets.bottom + 50 }]} showsVerticalScrollIndicator={false}>
      <View style={styles.top}><Pressable onPress={() => router.back()} hitSlop={10}><Feather name="arrow-left" size={22} color={colors.foreground} /></Pressable><Pressable onPress={() => { deleteProject(project.id); router.replace('/projects'); }} hitSlop={10}><Feather name="trash-2" size={18} color={colors.mutedForeground} /></Pressable></View>
      <View style={styles.titleRow}><View style={[styles.projectDot, { backgroundColor: colors.primary }]} /><View style={{ flex: 1 }}><AppText style={styles.title}>{project.name}</AppText><AppText style={[styles.client, { color: colors.mutedForeground }]}>{project.client}</AppText></View></View>
      <AppText style={[styles.summary, { color: colors.mutedForeground }]}>{project.summary}</AppText>
      <AppText style={{ color: colors.mutedForeground }}>{archived ? 'Archived · ' : ''}{projectStatus(project, projectTasks)} · {projectHealth(project, projectTasks, calendarDate)}</AppText>
      <ProjectProgress projectId={project.id} tasks={projectTasks} />
      <ProjectManagement project={project} tasks={projectTasks} />
      <WorkflowSummary project={project} tasks={projectTasks} />
      <View style={[styles.deadlineCard, { backgroundColor: colors.panel }]}><View><AppText style={styles.deadlineLabel}>PROJECT DEADLINE</AppText><AppText style={styles.days}>{daysRemaining(project.dueDate)} <AppText style={styles.daysUnit}>days</AppText></AppText><AppText style={styles.date}>Due {formatShortDate(project.dueDate)}</AppText></View><View style={styles.ring}><AppText style={styles.ringText}>{percent}%</AppText><AppText style={styles.ringLabel}>done</AppText></View></View>
      <View style={styles.metaGrid}><View><AppText style={[styles.metaLabel, { color: colors.mutedForeground }]}>FLOW</AppText><AppText style={styles.metaValue}>{template?.name ?? 'Deleted template'}</AppText></View><View><AppText style={[styles.metaLabel, { color: colors.mutedForeground }]}>STARTED</AppText><AppText style={styles.metaValue}>{formatShortDate(project.startDate)}</AppText></View><View><AppText style={[styles.metaLabel, { color: colors.mutedForeground }]}>REMINDERS</AppText><View style={styles.reminderOptions}>{(['Daily', 'Every 2 days', 'Weekly'] as const).map((frequency) => <Pressable key={frequency} disabled={archived} onPress={() => updateReminderFrequency(project.id, frequency)} style={[styles.reminderButton, { backgroundColor: project.reminderFrequency === frequency ? colors.accent : colors.secondary }]}><AppText style={[styles.reminderText, { color: project.reminderFrequency === frequency ? colors.accentForeground : colors.mutedForeground }]}>{frequency === 'Every 2 days' ? '2d' : frequency === 'Daily' ? '1d' : '7d'}</AppText></Pressable>)}</View></View></View>
      <Pressable disabled={archived} onPress={() => settings.notificationsEnabled ? enableProjectReminders(project.id) : router.push('/settings')} style={[styles.reminderCard, { backgroundColor: project.remindersEnabled ? colors.secondary : colors.accent }]}><Feather name={project.remindersEnabled ? 'check-circle' : 'bell'} size={16} color={project.remindersEnabled ? colors.secondaryForeground : colors.accentForeground} /><View style={{ flex: 1 }}><AppText style={[styles.reminderTitle, { color: project.remindersEnabled ? colors.secondaryForeground : colors.accentForeground }]}>{archived ? 'Project reminders are paused' : !settings.notificationsEnabled ? 'Notifications are off in Settings' : project.remindersEnabled ? 'Reminders are on' : 'Turn on daily reminders'}</AppText><AppText style={[styles.reminderDescription, { color: project.remindersEnabled ? colors.mutedForeground : colors.accentForeground }]}>{archived ? 'Unarchive this project to restore eligible reminders.' : !settings.notificationsEnabled ? 'Tap to open Settings. Your reminder choices are kept.' : project.remindersEnabled ? `You’ll get a ${project.reminderFrequency.toLowerCase()} reminder with the current step countdown.` : 'FlowPilot will tell you how many days remain for the next open step.'}</AppText></View>{!project.remindersEnabled ? <Feather name="arrow-right" size={15} color={colors.accentForeground} /> : null}</Pressable>
      <View style={styles.stepHeader}><AppText style={styles.stepsTitle}>Workflow steps</AppText><AppText style={[styles.stepCount, { color: colors.mutedForeground }]}>{done} of {projectTasks.length} complete</AppText></View>
      {archived ? <AppText style={{ color: colors.mutedForeground }}>Unarchive this project before adding tasks.</AppText> : <Pressable testID="add-project-task" accessibilityRole="button" onPress={() => router.push({ pathname: '/new-task', params: { projectId: project.id } })} style={[styles.addTask, { borderColor: colors.input }]}><Feather name="plus" size={16} color={colors.primary} /><AppText style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Add Task</AppText></Pressable>}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{projectTasks.map((task) => <View key={task.id}><TaskRow task={task} />{!archived && <TaskWorkflowActions project={project} task={task} />}</View>)}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  addTask: { minHeight: 44, borderRadius: 13, borderWidth: 1, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  content: { paddingHorizontal: 20, gap: 18 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  projectDot: { width: 11, height: 11, borderRadius: 6 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 27, letterSpacing: -0.8 },
  client: { fontSize: 13, marginTop: 4 },
  summary: { fontSize: 13, lineHeight: 20, marginTop: -4 },
  deadlineCard: { borderRadius: 21, padding: 19, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  deadlineLabel: { color: '#B7C1D4', fontFamily: 'Inter_700Bold', letterSpacing: 1.3, fontSize: 9 },
  days: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 32, letterSpacing: -1, marginTop: 8 },
  daysUnit: { color: '#D6DCE8', fontFamily: 'Inter_500Medium', fontSize: 13, letterSpacing: 0 },
  date: { color: '#B7C1D4', fontSize: 11, marginTop: 3 },
  ring: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#30405F', alignItems: 'center', justifyContent: 'center' },
  ringText: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 15 },
  ringLabel: { color: '#B7C1D4', fontSize: 9, marginTop: 2 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  metaLabel: { fontFamily: 'Inter_700Bold', letterSpacing: 1.2, fontSize: 9, marginBottom: 7 },
  metaValue: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  reminderOptions: { flexDirection: 'row', gap: 5 },
  reminderButton: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4 },
  reminderText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  reminderCard: { borderRadius: 15, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  reminderTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  reminderDescription: { fontSize: 11, lineHeight: 17, marginTop: 3 },
  stepHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 2 },
  stepsTitle: { fontFamily: 'Inter_700Bold', fontSize: 19 },
  stepCount: { fontSize: 11 },
  card: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14 },
});
