import { availableProjects } from '@/lib/project-management';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { AppText } from '@/components/AppText';
import { useFlow } from '@/context/FlowContext';
import { useColors } from '@/hooks/useColors';

export function QuickAdd() {
  const colors = useColors();
  const { projects: allProjects, hydrated } = useFlow();
  const projects = availableProjects(allProjects);
  const [page, setPage] = useState<'menu' | 'projects' | null>(null);
  const navigate = (route: Href) => { setPage(null); router.push(route); };
  const option = (id: string, label: string, onPress: () => void) => <Pressable key={id} testID={id} accessibilityRole="button" onPress={onPress} style={[styles.option, { borderBottomColor: colors.border }]}><AppText style={{ flex: 1 }}>{label}</AppText><Feather name="chevron-right" size={18} color={colors.primary} /></Pressable>;
  return <>
    <Pressable testID="quick-add" accessibilityRole="button" accessibilityLabel="Quick Add" disabled={!hydrated} onPress={() => setPage('menu')} style={[styles.button, { backgroundColor: colors.action, opacity: hydrated ? 1 : 0.5 }]}><Feather name="plus" size={20} color={colors.primaryForeground} /><AppText style={[styles.buttonText, { color: colors.primaryForeground }]}>Quick Add</AppText></Pressable>
    <Modal visible={page !== null} transparent animationType="fade" onRequestClose={() => setPage(null)}>
      <View style={styles.overlay}><View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: colors.card }]}>
        <AppText accessibilityRole="header" style={styles.heading}>{page === 'projects' ? 'Choose a project' : 'Quick Add'}</AppText>
        <ScrollView keyboardShouldPersistTaps="handled">
          {page === 'menu' && <>
            {option('quick-personal', 'Personal To-do', () => navigate('/personal-task'))}
            {option('quick-project-task', 'Project Task', () => setPage('projects'))}
            {option('quick-new-project', 'New Project', () => navigate('/new-project'))}
          </>}
          {page === 'projects' && (projects.length ? projects.map((project) => <Pressable key={project.id} testID={'quick-project-' + project.id} accessibilityRole="button" accessibilityLabel={'Add task to ' + project.name} onPress={() => navigate({ pathname: '/new-task', params: { projectId: project.id } })} style={[styles.option, { borderBottomColor: colors.border }]}><View style={{ flex: 1, gap: 4 }}><AppText numberOfLines={2}>{project.name}</AppText><AppText numberOfLines={1} style={{ fontSize: 12, color: colors.mutedForeground }}>{project.client}</AppText></View><Feather name="plus" size={18} color={colors.primary} /></Pressable>) : <>
            <AppText style={[styles.empty, { color: colors.mutedForeground }]}>Create a project before adding a project task.</AppText>
            {option('quick-create-first-project', 'New Project', () => navigate('/new-project'))}
          </>)}
        </ScrollView>
        <View style={styles.footer}>{page === 'projects' && <Pressable accessibilityRole="button" onPress={() => setPage('menu')} style={styles.close}><AppText>Back</AppText></Pressable>}<Pressable testID="quick-close" accessibilityRole="button" onPress={() => setPage(null)} style={styles.close}><AppText>Cancel</AppText></Pressable></View>
      </View></View>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  button: { minHeight: 50, borderRadius: 15, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  dialog: { borderRadius: 20, padding: 18, width: '100%', maxWidth: 450, maxHeight: '80%', alignSelf: 'center' },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 20, marginBottom: 12 },
  option: { minHeight: 56, paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, alignItems: 'center' },
  empty: { fontSize: 13, lineHeight: 20, paddingVertical: 12 }, footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16 }, close: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 10 },
});
