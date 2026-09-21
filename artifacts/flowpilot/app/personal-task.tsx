import { useSettings } from '@/context/SettingsContext';
import { personalInitial, applyReminderDefault } from '@/lib/settings';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { ProjectDateField } from '@/components/ProjectDateField';
import { useFlow } from '@/context/FlowContext';
import { useColors } from '@/hooks/useColors';
import { PRIORITIES, REMINDERS, REPEATS, personalDueAt, validatePersonal, type PersonalInput, type PersonalTask } from '@/lib/personal-tasks';

export default function PersonalTaskScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { personalTasks, hydrated } = useFlow();
  if (!hydrated) return <AppText>Loading to-dos…</AppText>;
  const task = personalTasks.find((item) => item.id === id);
  if (id && !task) return <View style={{ padding: 24 }}><AppText>This to-do no longer exists.</AppText><Pressable onPress={() => router.replace('/tasks')}><AppText>Back to To-do</AppText></Pressable></View>;
  return <PersonalForm key={id ?? 'new'} task={task} />;
}

function PersonalForm({ task }: { task?: PersonalTask }) {
  const colors = useColors(), insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const reminderTouched = useRef(false);
  const { savePersonalTask, deletePersonalTask } = useFlow();
  const [input, setInput] = useState<PersonalInput>(() => personalInitial(settings, task));
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirmDelete, setConfirmDelete] = useState(false);
  const change = (patch: Partial<PersonalInput>) => setInput((current) => applyReminderDefault({ ...current, ...patch }, settings, !!task, reminderTouched.current));
  const set = <K extends keyof PersonalInput>(key: K, value: PersonalInput[K]) => {
    if (key === 'reminder') reminderTouched.current = true;
    change({ [key]: value });
  };
  const validation = validatePersonal(input, new Date(), task?.status === 'done');
  const save = async () => {
    if (busy) return;
    if (validation) { setError(validation); return; }
    setBusy(true);
    try {
      const result = await savePersonalTask(input, task?.id);
      if (result.ok) router.replace('/tasks');
      else setError(result.error ?? 'Unable to save this to-do.');
    } catch { setError('Unable to save this to-do. Please try again.'); }
    finally { setBusy(false); }
  };
  const inputStyle = [styles.input, { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground }];
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: Platform.OS === 'web' ? 24 : insets.top + 14, paddingBottom: insets.bottom + 34 }]}>
      <View style={styles.top}><Pressable accessibilityLabel="Back" onPress={() => router.back()} hitSlop={10}><Feather name="arrow-left" size={22} color={colors.foreground} /></Pressable><AppText style={styles.heading}>{task ? 'Edit personal to-do' : 'Add personal to-do'}</AppText></View>
      <AppText style={{ color: colors.mutedForeground }}>For everyday life. No project needed.</AppText>
      <AppText style={styles.label}>TASK NAME</AppText><TextInput testID="personal-title" accessibilityLabel="Task name" value={input.title} onChangeText={(value) => set('title', value)} placeholder="e.g. Call daughter" placeholderTextColor={colors.mutedForeground} style={inputStyle} />
      <ProjectDateField label="DUE DATE (OPTIONAL)" optional value={input.dueDate ?? ''} onChange={(value) => change({ dueDate: value || undefined, ...(value ? {} : { dueTime: undefined, reminder: 'None', recurrence: { frequency: 'None' } }) })} />
      <AppText style={styles.label}>DUE TIME (OPTIONAL, 24-HOUR)</AppText><TextInput testID="personal-time" accessibilityLabel="Due time, HH:mm" value={input.dueTime ?? ''} onChangeText={(value) => set('dueTime', value || undefined)} editable={!!input.dueDate} placeholder="HH:mm" maxLength={5} autoCapitalize="none" placeholderTextColor={colors.mutedForeground} style={inputStyle} />
      <Choices label="PRIORITY" values={PRIORITIES} selected={input.priority} onSelect={(value) => set('priority', value)} />
      <AppText style={styles.label}>NOTES</AppText><TextInput testID="personal-notes" accessibilityLabel="Notes" multiline value={input.notes} onChangeText={(value) => set('notes', value)} placeholder="Anything to remember…" placeholderTextColor={colors.mutedForeground} style={[inputStyle, { minHeight: 100, textAlignVertical: 'top', paddingTop: 14 }]} />
      <Choices label="REMINDER" values={REMINDERS} selected={input.reminder} onSelect={(value) => set('reminder', value)} disabled={(value) => value !== 'None' && (!input.dueTime || !personalDueAt(input))} />
      {(!input.dueDate || !input.dueTime) && <AppText style={[styles.hint, { color: colors.mutedForeground }]}>Set a date and time to enable reminders.</AppText>}
      <Choices label="REPEAT" values={REPEATS} selected={input.recurrence.frequency} onSelect={(value) => set('recurrence', { frequency: value })} disabled={(value) => value !== 'None' && !input.dueDate} />
      <AppText style={[styles.hint, { color: colors.mutedForeground }]}>Repeating tasks need a date. Completing one creates the next occurrence from its due date. Reopening keeps that next occurrence; edits and deletion affect only this occurrence.</AppText>
      {!!error && <AppText accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</AppText>}
      <Pressable testID="save-personal-task" accessibilityRole="button" disabled={busy} onPress={save} style={[styles.button, { backgroundColor: colors.action, opacity: busy ? 0.5 : 1 }]}><AppText style={styles.buttonText}>{busy ? 'Saving…' : 'Save To-do'}</AppText></Pressable>
      {!!task && <Pressable testID="delete-personal-task" disabled={busy} accessibilityRole="button" onPress={() => setConfirmDelete(true)} style={styles.button}><AppText style={{ color: colors.destructive }}>Delete To-do</AppText></Pressable>}
    </ScrollView>
    <Modal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(false)}><View style={styles.overlay}><View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: colors.card }]}>
      <AppText style={styles.heading}>Delete this personal to-do?</AppText><AppText style={styles.hint}>This occurrence will be permanently deleted. Other occurrences and project tasks will be kept.</AppText>
      <Pressable accessibilityRole="button" onPress={() => setConfirmDelete(false)} style={styles.button}><AppText>Cancel</AppText></Pressable>
      <Pressable testID="confirm-delete-personal" accessibilityRole="button" onPress={() => { if (task) deletePersonalTask(task.id); setConfirmDelete(false); router.replace('/tasks'); }} style={[styles.button, { backgroundColor: colors.dangerAction }]}><AppText style={styles.buttonText}>Delete</AppText></Pressable>
    </View></View></Modal>
  </KeyboardAvoidingView>;
}

function Choices<T extends string>({ label, values, selected, onSelect, disabled }: { label: string; values: readonly T[]; selected: T; onSelect: (value: T) => void; disabled?: (value: T) => boolean }) {
  const colors = useColors();
  return <View style={{ gap: 8 }}><AppText style={styles.label}>{label}</AppText><View style={styles.choices}>{values.map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: selected === value, disabled: disabled?.(value) }} disabled={disabled?.(value)} onPress={() => onSelect(value)} style={[styles.choice, { backgroundColor: selected === value ? colors.foreground : colors.card, borderColor: colors.border, opacity: disabled?.(value) ? 0.4 : 1 }]}><AppText style={{ color: selected === value ? colors.background : colors.foreground, fontSize: 12 }}>{value}</AppText></Pressable>)}</View></View>;
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 15 }, top: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 6 },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 20, flexShrink: 1 }, label: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, fontFamily: 'Inter_500Medium', fontSize: 13 },
  hint: { fontSize: 12, lineHeight: 18 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { minHeight: 44, borderRadius: 12, borderWidth: 1, paddingHorizontal: 13, justifyContent: 'center' },
  button: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 14 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }, dialog: { width: '100%', maxWidth: 400, borderRadius: 20, padding: 20, gap: 14 },
});
