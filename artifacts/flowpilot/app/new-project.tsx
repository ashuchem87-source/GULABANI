import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { ReminderFrequency, useFlow } from '@/context/FlowContext';
import { useColors } from '@/hooks/useColors';

export default function NewProjectScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { templates, addProject } = useFlow();
  const params = useLocalSearchParams<{ templateId?: string }>();
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [summary, setSummary] = useState('');
  const [templateId, setTemplateId] = useState(params.templateId ?? templates[0]?.id);
  const [days, setDays] = useState('10');
  const [frequency, setFrequency] = useState<ReminderFrequency>('Daily');
  const selectedTemplate = useMemo(() => templates.find((template) => template.id === templateId) ?? templates[0], [templateId, templates]);
  const canSave = name.trim().length > 1 && client.trim().length > 1 && !!selectedTemplate?.steps.length;
  const save = async () => {
    if (!canSave || !selectedTemplate) return;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + Math.max(1, Number(days) || 10));
    await addProject({ name: name.trim(), client: client.trim(), summary: summary.trim() || 'A new project ready to move through your system.', templateId: selectedTemplate.id, dueDate: dueDate.toISOString(), reminderFrequency: frequency });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/projects');
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: Platform.OS === 'web' ? 24 : insets.top + 14, paddingBottom: insets.bottom + 34 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.top}><Pressable onPress={() => router.back()} hitSlop={10}><Feather name="arrow-left" size={22} color={colors.foreground} /></Pressable><AppText style={styles.topTitle}>New project</AppText><View style={{ width: 22 }} /></View>
        <AppText style={styles.heading}>Start with the right flow.</AppText>
        <AppText style={[styles.intro, { color: colors.mutedForeground }]}>Choose a template once. FlowPilot will assign its steps and keep the next one visible.</AppText>
        <Field label="PROJECT NAME" value={name} onChangeText={setName} placeholder="e.g. Spring campaign" colors={colors} />
        <Field label="CLIENT OR TEAM" value={client} onChangeText={setClient} placeholder="e.g. Cedar & Co." colors={colors} />
        <Field label="SHORT SUMMARY" value={summary} onChangeText={setSummary} placeholder="What does this project need to achieve?" colors={colors} multiline />
        <AppText style={styles.label}>FLOW TEMPLATE</AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templateRow}>
          {templates.map((template) => <Pressable key={template.id} onPress={() => setTemplateId(template.id)} style={[styles.templateChoice, { borderColor: template.id === templateId ? template.color : colors.border, backgroundColor: template.id === templateId ? colors.card : 'transparent' }]}><View style={[styles.choiceDot, { backgroundColor: template.color }]} /><AppText style={styles.choiceName}>{template.name}</AppText><AppText style={[styles.choiceMeta, { color: colors.mutedForeground }]}>{template.steps.length} steps</AppText></Pressable>)}
        </ScrollView>
        <View style={styles.inlineFields}><View style={{ flex: 1 }}><AppText style={styles.label}>DEADLINE IN</AppText><View style={[styles.input, { borderColor: colors.input, backgroundColor: colors.card }]}><TextInput value={days} onChangeText={setDays} keyboardType="number-pad" style={[styles.inputText, { color: colors.foreground }]} /><AppText style={[styles.suffix, { color: colors.mutedForeground }]}>days</AppText></View></View><View style={{ flex: 1.3 }}><AppText style={styles.label}>REMIND ME</AppText><View style={styles.frequencyRow}>{(['Daily', 'Every 2 days', 'Weekly'] as ReminderFrequency[]).map((item) => <Pressable key={item} onPress={() => setFrequency(item)} style={[styles.frequency, { backgroundColor: frequency === item ? colors.foreground : colors.card, borderColor: frequency === item ? colors.foreground : colors.border }]}><AppText style={[styles.frequencyText, { color: frequency === item ? colors.background : colors.foreground }]}>{item === 'Every 2 days' ? '2d' : item === 'Daily' ? '1d' : '7d'}</AppText></Pressable>)}</View></View></View>
        <View style={[styles.preview, { backgroundColor: colors.secondary }]}><Feather name="zap" size={16} color={colors.primary} /><View style={{ flex: 1 }}><AppText style={styles.previewTitle}>{selectedTemplate ? `${selectedTemplate.name} is ready` : 'Create a template first'}</AppText><AppText style={[styles.previewText, { color: colors.mutedForeground }]}>{selectedTemplate ? `${selectedTemplate.steps.length} steps will be assigned automatically, starting with “${selectedTemplate.steps[0]?.title ?? ''}”.` : 'Add a template in the Templates tab before creating a project.'}</AppText></View></View>
        <Pressable testID="save-project" disabled={!canSave} onPress={save} style={({ pressed }) => [styles.save, { backgroundColor: canSave ? colors.primary : colors.input, opacity: pressed ? 0.78 : 1 }]}><AppText style={styles.saveText}>Create project</AppText><Feather name="arrow-right" size={17} color="#FFFFFF" /></Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, value, onChangeText, placeholder, colors, multiline = false }: { label: string; value: string; onChangeText: (text: string) => void; placeholder: string; colors: ReturnType<typeof useColors>; multiline?: boolean }) {
  return <View style={styles.field}><AppText style={styles.label}>{label}</AppText><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} multiline={multiline} style={[styles.input, styles.inputText, { borderColor: colors.input, backgroundColor: colors.card, color: colors.foreground }, multiline && styles.multiline]} /></View>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 15 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 17 },
  topTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 29, letterSpacing: -1 },
  intro: { fontSize: 13, lineHeight: 19, marginTop: -7, marginBottom: 5 },
  field: { gap: 7 },
  label: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, justifyContent: 'center' },
  inputText: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  multiline: { minHeight: 76, paddingTop: 13, textAlignVertical: 'top' },
  templateRow: { gap: 9, paddingVertical: 1 },
  templateChoice: { width: 132, borderWidth: 1.5, borderRadius: 15, padding: 12, gap: 5 },
  choiceDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 4 },
  choiceName: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  choiceMeta: { fontSize: 10 },
  inlineFields: { flexDirection: 'row', gap: 12 },
  suffix: { position: 'absolute', right: 13, fontSize: 12 },
  frequencyRow: { flexDirection: 'row', gap: 6, height: 48, alignItems: 'center' },
  frequency: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  frequencyText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  preview: { borderRadius: 15, padding: 14, flexDirection: 'row', gap: 11, alignItems: 'flex-start', marginTop: 1 },
  previewTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  previewText: { fontSize: 11, lineHeight: 17, marginTop: 3 },
  save: { minHeight: 53, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 3 },
  saveText: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 14 },
});
