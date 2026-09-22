import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { WorkflowStep, WorkflowTemplate, useFlow } from '@/context/FlowContext';
import { useColors } from '@/hooks/useColors';
import { ReorderableSteps, type ScrollMetrics } from '@/components/ReorderableSteps';

export default function NewTemplateScreen() {
  const { templateId } = useLocalSearchParams<{ templateId?: string }>();
  const { templates, hydrated } = useFlow();
  const template = templates.find((item) => item.id === templateId);
  if (!hydrated) return <AppText>Loading templates…</AppText>;
  if (templateId && !template) return <View style={{ padding: 24 }}><AppText>This template is no longer available.</AppText><Pressable onPress={() => router.replace('/templates')}><AppText>Back to templates</AppText></Pressable></View>;
  return <TemplateForm key={templateId ?? 'new'} template={template} />;
}

function TemplateForm({ template }: { template?: WorkflowTemplate }) {
  const scrollRef = useRef<ScrollView>(null);
  const scrollMetrics = useRef<ScrollMetrics>({ offset: 0, height: 0, contentHeight: 0, top: 0 });
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addTemplate, updateTemplate } = useFlow();
  const [name, setName] = useState(template?.name ?? '');
  const [category, setCategory] = useState(template?.category ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [steps, setSteps] = useState<WorkflowStep[]>(() => template ? template.steps.map((step) => ({ ...step })) : [
    { id: 'step-1', title: '', description: '', duration: 1 },
    { id: 'step-2', title: '', description: '', duration: 1 },
  ]);
  const canSave = name.trim().length > 0 && steps.length > 0 && steps.every((step) => step.title.trim().length > 0 && Number.isInteger(step.duration) && step.duration >= 0);

  const updateStep = (id: string, title: string) => {
    setSteps((current) => current.map((step) => (step.id === id ? { ...step, title } : step)));
  };

  const updateStepDuration = (id: string, duration: string) => {
    setSteps((current) => current.map((step) => (step.id === id ? { ...step, duration: Math.max(1, Number(duration) || 1) } : step)));
  };

  const addStep = () => {
    setSteps((current) => [...current, { id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: '', description: '', duration: 1 }]);
  };

  const save = () => {
    if (!canSave) return;
    const input = {
      name: name.trim(),
      category: category.trim() || 'General',
      description: description.trim() || 'A reusable project flow for your work.',
      steps: steps.map((step) => ({ ...step, title: step.title.trim() })),
    };
    const saved = template ? updateTemplate(template.id, input) : addTemplate(input);
    if (saved === false) { setError('Unable to save and synchronize this template. Check step durations and try again.'); return; }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.replace('/templates');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scrollRef} scrollEnabled={!dragging} scrollEventThrottle={16} removeClippedSubviews={false}
        onScroll={(event) => { scrollMetrics.current.offset = event.nativeEvent.contentOffset.y; }}
        onLayout={(event) => { scrollMetrics.current.height = event.nativeEvent.layout.height; }}
        onContentSizeChange={(_width, height) => { scrollMetrics.current.contentHeight = height; }}
        contentContainerStyle={[styles.content, { paddingTop: Platform.OS === 'web' ? 24 : insets.top + 14, paddingBottom: insets.bottom + 34 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.top}><Pressable onPress={() => router.back()} hitSlop={10}><Feather name="arrow-left" size={22} color={colors.foreground} /></Pressable><AppText style={styles.topTitle}>{template ? 'Edit template' : 'New template'}</AppText><View style={{ width: 22 }} /></View>
        <AppText style={styles.heading}>{template ? 'Update your repeatable flow.' : 'Build your repeatable flow.'}</AppText>
        <AppText style={[styles.intro, { color: colors.mutedForeground }]}>Saving updates all linked projects. Existing task dates and completion history are preserved; manual tasks remain independent.</AppText>

        {!!error && <AppText accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</AppText>}
        <Field label="TEMPLATE NAME" value={name} onChangeText={setName} placeholder="e.g. Website launch" colors={colors} />
        <Field label="CATEGORY" value={category} onChangeText={setCategory} placeholder="e.g. Marketing or Operations" colors={colors} />
        <Field label="DESCRIPTION" value={description} onChangeText={setDescription} placeholder="What kind of work is this flow for?" colors={colors} multiline />

        <View style={styles.stepHeading}><AppText style={styles.label}>WORKFLOW STEPS</AppText><AppText style={[styles.stepHint, { color: colors.mutedForeground }]}>{steps.length} steps</AppText></View>
        <ReorderableSteps steps={steps} onChange={setSteps} scrollRef={scrollRef} metrics={scrollMetrics} onDragging={setDragging} renderStep={(step, index) => (
          <View key={step.id} style={[styles.stepCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.stepNumber, { backgroundColor: colors.foreground }]}><AppText style={[styles.stepNumberText, { color: colors.background }]}>{index + 1}</AppText></View>
            <TextInput testID={`template-step-${index + 1}`} value={step.title} onChangeText={(value) => updateStep(step.id, value)} placeholder="Name this step" placeholderTextColor={colors.mutedForeground} style={[styles.stepInput, { color: colors.foreground }]} />
            <View style={[styles.durationInput, { borderLeftColor: colors.border }]}><TextInput value={String(step.duration)} onChangeText={(value) => updateStepDuration(step.id, value)} keyboardType="number-pad" style={[styles.durationText, { color: colors.foreground }]} /><AppText style={[styles.durationSuffix, { color: colors.mutedForeground }]}>days</AppText></View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Delete step ${index + 1}`} testID={`delete-template-step-${index + 1}`} onPress={() => setSteps((current) => current.filter((item) => item.id !== step.id))} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Feather name="trash-2" size={17} color={colors.mutedForeground} /></Pressable>
          </View>
        )} />
        <Pressable onPress={addStep} style={({ pressed }) => [styles.addStep, { borderColor: colors.input, opacity: pressed ? 0.65 : 1 }]}><Feather name="plus" size={15} color={colors.primary} /><AppText style={[styles.addStepText, { color: colors.primary }]}>Add another step</AppText></Pressable>

        {!canSave && <AppText style={[styles.stepHint, { color: colors.mutedForeground }]}>Enter a template name and at least one step. Every step needs a name.</AppText>}
        <View style={[styles.preview, { backgroundColor: colors.secondary }]}><Feather name="layers" size={16} color={colors.primary} /><View style={{ flex: 1 }}><AppText style={styles.previewTitle}>Ready to reuse</AppText><AppText style={[styles.previewText, { color: colors.mutedForeground }]}>{template ? 'Changes apply to future projects. Existing projects keep their current tasks.' : 'Your template will appear in the Templates tab and can be selected when creating a project.'}</AppText></View></View>
        <Pressable testID="save-template" disabled={!canSave} onPress={save} style={({ pressed }) => [styles.save, { backgroundColor: canSave ? colors.action : colors.input, opacity: pressed ? 0.78 : 1 }]}><AppText style={styles.saveText}>Save template</AppText><Feather name="check" size={17} color="#FFFFFF" /></Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, value, onChangeText, placeholder, colors, multiline = false }: { label: string; value: string; onChangeText: (text: string) => void; placeholder: string; colors: ReturnType<typeof useColors>; multiline?: boolean }) {
  return <View style={styles.field}><AppText style={styles.label}>{label}</AppText><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} multiline={multiline} style={[styles.input, { borderColor: colors.input, backgroundColor: colors.card, color: colors.foreground }, multiline && styles.multiline]} /></View>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 15 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 17 },
  topTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 29, letterSpacing: -1 },
  intro: { fontSize: 13, lineHeight: 19, marginTop: -7, marginBottom: 5 },
  field: { gap: 7 },
  label: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, fontFamily: 'Inter_500Medium', fontSize: 13 },
  multiline: { minHeight: 76, paddingTop: 13, textAlignVertical: 'top' },
  stepHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 3 },
  stepHint: { fontSize: 11 },
  stepCard: { minHeight: 55, borderRadius: 14, borderWidth: 1, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepNumber: { width: 27, height: 27, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  stepInput: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13 },
  durationInput: { borderLeftWidth: 1, paddingLeft: 10, flexDirection: 'row', alignItems: 'center', gap: 3 },
  durationText: { width: 22, textAlign: 'center', fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  durationSuffix: { fontSize: 10 },
  addStep: { minHeight: 43, borderRadius: 13, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  addStepText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  preview: { borderRadius: 15, padding: 14, flexDirection: 'row', gap: 11, alignItems: 'flex-start', marginTop: 1 },
  previewTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  previewText: { fontSize: 11, lineHeight: 17, marginTop: 3 },
  save: { minHeight: 53, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 3 },
  saveText: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 14 },
});
