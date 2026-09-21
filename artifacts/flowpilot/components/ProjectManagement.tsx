import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { useFlow, type Project, type ProjectTask } from '@/context/FlowContext';
import { useColors } from '@/hooks/useColors';
import { PROJECT_STATUSES, isArchived, projectProgress, projectStatus, type ProjectStatus } from '@/lib/project-management';

export function ProjectManagement({ project, tasks }: { project: Project; tasks: ProjectTask[] }) {
  const colors = useColors();
  const { setProjectStatus, setProjectArchived } = useFlow();
  const [dialog, setDialog] = useState<'status' | 'complete' | 'archive' | null>(null);
  const [error, setError] = useState('');
  const status = projectStatus(project, tasks), archived = isArchived(project);
  const { incomplete } = projectProgress(project.id, tasks);
  const finish = (ok: boolean) => { if (ok) { setDialog(null); setError(''); } else setError('Unable to update this project. Please try again.'); };
  const choose = (next: ProjectStatus) => {
    if (next === 'Completed' && incomplete > 0) { setDialog('complete'); return; }
    finish(setProjectStatus(project.id, next));
  };
  return <View style={{ gap: 8 }}>
    <View style={styles.actions}>
      <Pressable testID="change-project-status" accessibilityRole="button" accessibilityLabel="Change project status" onPress={() => { setError(''); setDialog('status'); }} style={[styles.action, { borderColor: colors.border }]}><AppText style={{ color: colors.primary }}>Change Status</AppText></Pressable>
      <Pressable testID="archive-project" accessibilityRole="button" accessibilityLabel={archived ? 'Unarchive Project' : 'Archive Project'} onPress={() => { setError(''); if (archived) finish(setProjectArchived(project.id, false)); else setDialog('archive'); }} style={[styles.action, { borderColor: colors.border }]}><AppText style={{ color: colors.primary }}>{archived ? 'Unarchive Project' : 'Archive Project'}</AppText></Pressable>
    </View>
    {!!error && <AppText accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</AppText>}
    <Modal visible={dialog !== null} transparent animationType="fade" onRequestClose={() => setDialog(null)}><View style={styles.overlay}><View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: colors.card }]}><ScrollView>
      <AppText accessibilityRole="header" style={styles.heading}>{dialog === 'status' ? 'Project status' : dialog === 'complete' ? 'Mark project Completed?' : 'Archive Project?'}</AppText>
      {dialog === 'status' ? PROJECT_STATUSES.map((value) => <Pressable key={value} testID={'status-' + value} accessibilityRole="radio" accessibilityState={{ checked: status === value }} onPress={() => choose(value)} style={styles.option}><AppText style={{ color: status === value ? colors.primary : colors.foreground }}>{value}{status === value ? ' ✓' : ''}</AppText></Pressable>) : <>
        <AppText style={styles.description}>{dialog === 'complete' ? 'This project still has ' + incomplete + ' incomplete tasks. Mark project as Completed anyway? Tasks and dates will stay unchanged.' : 'Archive this project? It and its tasks will be hidden from daily lists. Project reminders will pause. All data is kept, and you can unarchive it later.'}</AppText>
        <Pressable testID={dialog === 'complete' ? 'confirm-project-completed' : 'confirm-project-archive'} accessibilityRole="button" onPress={() => finish(dialog === 'complete' ? setProjectStatus(project.id, 'Completed', true) : setProjectArchived(project.id, true, true))} style={[styles.confirm, { backgroundColor: colors.action }]}><AppText style={{ color: colors.primaryForeground }}>{dialog === 'complete' ? 'Mark Completed' : 'Archive Project'}</AppText></Pressable>
      </>}
      {!!error && <AppText accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</AppText>}
      <Pressable testID="cancel-project-management" accessibilityRole="button" onPress={() => setDialog(null)} style={styles.option}><AppText>Cancel</AppText></Pressable>
    </ScrollView></View></View></Modal>
  </View>;
}
const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, action: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', padding: 24, justifyContent: 'center' }, dialog: { width: '100%', maxWidth: 440, maxHeight: '85%', alignSelf: 'center', borderRadius: 20, padding: 20 },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 20, marginBottom: 12 }, description: { fontSize: 13, lineHeight: 20, marginBottom: 16 }, option: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 10 }, confirm: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: 12 },
});
