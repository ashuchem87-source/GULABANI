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
  const { projects, tasks } = useFlow();
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.content, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 18, paddingBottom: insets.bottom + 90 }]} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><View><AppText style={[styles.kicker, { color: colors.primary }]}>WORKSPACE</AppText><AppText style={styles.title}>Projects</AppText><AppText style={[styles.subtitle, { color: colors.mutedForeground }]}>Every active flow, in one place.</AppText></View><Pressable onPress={() => router.push('/new-project')} style={[styles.add, { backgroundColor: colors.foreground }]}><Feather name="plus" size={20} color={colors.background} /></Pressable></View>
      {projects.map((project) => {
        const projectTasks = tasks.filter((task) => task.projectId === project.id);
        const done = projectTasks.filter((task) => task.status === 'done').length;
        return (
          <Pressable key={project.id} onPress={() => router.push({ pathname: '/project/[id]', params: { id: project.id } })} style={({ pressed }) => [styles.project, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.76 : 1 }]}>
            <View style={styles.row}><View style={[styles.dot, { backgroundColor: colors.primary }]} /><AppText style={styles.name}>{project.name}</AppText><Feather name="arrow-up-right" size={17} color={colors.mutedForeground} /></View>
            <AppText style={[styles.client, { color: colors.mutedForeground }]}>{project.client}</AppText>
            <AppText style={[styles.summary, { color: colors.mutedForeground }]} numberOfLines={2}>{project.summary}</AppText>
            <View style={styles.progressLine}><View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${projectTasks.length ? (done / projectTasks.length) * 100 : 0}%` }]} /></View>
            <View style={styles.footer}><AppText style={[styles.meta, { color: colors.mutedForeground }]}>{done}/{projectTasks.length} steps</AppText><View style={[styles.deadline, { backgroundColor: daysRemaining(project.dueDate) <= 2 ? colors.accent : colors.secondary }]}><AppText style={[styles.deadlineText, { color: daysRemaining(project.dueDate) <= 2 ? colors.accentForeground : colors.secondaryForeground }]}>{daysRemaining(project.dueDate)} days remaining</AppText></View></View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  kicker: { fontFamily: 'Inter_700Bold', letterSpacing: 1.5, fontSize: 10, marginBottom: 8 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 30, letterSpacing: -1 },
  subtitle: { fontSize: 13, marginTop: 5 },
  add: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  project: { borderWidth: 1, borderRadius: 20, padding: 17, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  name: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 16 },
  client: { fontSize: 12, marginTop: 7, marginLeft: 19 },
  summary: { fontSize: 13, lineHeight: 19, marginTop: 14 },
  progressLine: { height: 5, borderRadius: 3, backgroundColor: '#EEF0F2', marginTop: 18, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 11 },
  meta: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  deadline: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
  deadlineText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
});