import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { useFlow } from '@/context/FlowContext';
import { useColors } from '@/hooks/useColors';

export default function TemplatesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { templates, deleteTemplate, hydrated } = useFlow();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const pendingDelete = templates.find((template) => template.id === deleteId);
  return (
    <>
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.content, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 18, paddingBottom: insets.bottom + 90 }]} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><View><AppText style={[styles.kicker, { color: colors.primary }]}>YOUR SYSTEM</AppText><AppText style={styles.title}>Templates</AppText><AppText style={[styles.subtitle, { color: colors.mutedForeground }]}>Make the right next step automatic.</AppText></View><Pressable testID="add-template" accessibilityRole="button" accessibilityLabel="Create template" onPress={() => router.push('/new-template')} style={[styles.add, { backgroundColor: colors.foreground }]}><Feather name="plus" size={20} color={colors.background} /></Pressable></View>
      {hydrated && templates.length === 0 && <AppText style={{ color: colors.mutedForeground }}>No templates yet. Tap + to create your first template.</AppText>}
      {hydrated && templates.map((template) => (
        <View key={template.id} style={[styles.template, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Pressable onPress={() => router.push({ pathname: '/new-project', params: { templateId: template.id } })} accessibilityRole="button" accessibilityLabel={`Create project from ${template.name}`}>
          <View style={styles.templateHeader}><View style={[styles.templateIcon, { backgroundColor: template.color }]}><Feather name="layers" size={17} color="#FFFFFF" /></View><View style={{ flex: 1 }}><AppText style={styles.name}>{template.name}</AppText><AppText style={[styles.category, { color: colors.mutedForeground }]}>{template.category} · {template.steps.length} steps</AppText></View><Feather name="arrow-up-right" size={17} color={colors.mutedForeground} /></View>
          <AppText style={[styles.description, { color: colors.mutedForeground }]}>{template.description}</AppText>
          <View style={styles.stepPreview}>{template.steps.map((step, index) => <View key={step.id} style={styles.step}><View style={[styles.stepNumber, { backgroundColor: index === 0 ? template.color : colors.secondary }]}><AppText style={[styles.stepNumberText, { color: index === 0 ? '#FFFFFF' : colors.secondaryForeground }]}>{index + 1}</AppText></View><AppText style={styles.stepName}>{step.title}</AppText></View>)}</View>
        </Pressable>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" testID={`edit-template-${template.id}`} onPress={() => router.push({ pathname: '/new-template', params: { templateId: template.id } })} style={styles.action}><Feather name="edit-2" size={16} color={colors.primary} /><AppText style={{ color: colors.primary }}>Edit</AppText></Pressable>
          <Pressable accessibilityRole="button" testID={`delete-template-${template.id}`} onPress={() => setDeleteId(template.id)} style={styles.action}><Feather name="trash-2" size={16} color={colors.mutedForeground} /><AppText style={{ color: colors.mutedForeground }}>Delete</AppText></Pressable>
        </View>
        </View>
      ))}
    </ScrollView>
    <Modal visible={!!pendingDelete} transparent animationType="fade" onRequestClose={() => setDeleteId(null)}>
      <View style={styles.overlay}><View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: colors.card }]}>
        <AppText style={styles.name}>Delete “{pendingDelete?.name}”?</AppText>
        <AppText style={[styles.description, { color: colors.mutedForeground }]}>This cannot be undone. Existing projects and their tasks will be kept.</AppText>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={() => setDeleteId(null)} style={styles.action}><AppText>Cancel</AppText></Pressable>
          <Pressable accessibilityRole="button" testID="confirm-delete-template" onPress={() => { if (deleteId) deleteTemplate(deleteId); setDeleteId(null); }} style={styles.action}><AppText style={{ color: colors.primary }}>Delete template</AppText></Pressable>
        </View>
      </View></View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 18, marginTop: 12 },
  action: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 6 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 420, borderRadius: 20, padding: 20 },
  content: { paddingHorizontal: 20, gap: 13 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  kicker: { fontFamily: 'Inter_700Bold', letterSpacing: 1.5, fontSize: 10, marginBottom: 8 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 30, letterSpacing: -1 },
  subtitle: { fontSize: 13, marginTop: 5 },
  add: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  template: { borderWidth: 1, borderRadius: 20, padding: 17, marginBottom: 3 },
  templateHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  templateIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  category: { fontSize: 11, marginTop: 4 },
  description: { fontSize: 12, lineHeight: 18, marginTop: 15 },
  stepPreview: { gap: 9, marginTop: 16 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  stepNumber: { width: 23, height: 23, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  stepName: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18 },
});
