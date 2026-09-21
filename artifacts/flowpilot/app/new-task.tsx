import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { useFlow } from '@/context/FlowContext';
import { useColors } from '@/hooks/useColors';
import { parseTaskDate } from '@/lib/task-utils';

export default function NewTaskScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { projects, hydrated, addManualTask } = useFlow();
  const project = projects.find((item) => item.id === projectId);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const canSave = hydrated && !!project && !!title.trim() && !!parseTaskDate(date);

  const save = () => {
    if (!canSave || !project) return;
    if (addManualTask(project.id, { title, dueDate: date })) router.back();
    else setError('Unable to add this task. Check the project, name and due date.');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: Platform.OS === 'web' ? 24 : insets.top + 14, paddingBottom: insets.bottom + 34 }]}>
        <View style={styles.top}><Pressable accessibilityLabel="Back" onPress={() => router.back()} hitSlop={10}><Feather name="arrow-left" size={22} color={colors.foreground} /></Pressable><AppText style={styles.topTitle}>Add task</AppText><View style={{ width: 22 }} /></View>
        <AppText style={styles.heading}>{project ? project.name : hydrated ? 'Project unavailable' : 'Loading project…'}</AppText>
        <AppText style={[styles.intro, { color: colors.mutedForeground }]}>Add unexpected work to this project. Its template stays the same.</AppText>
        <AppText style={styles.label}>TASK NAME</AppText>
        <TextInput testID="manual-task-name" accessibilityLabel="Task name" value={title} onChangeText={setTitle} placeholder="e.g. Arrange an extra site visit" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input }]} />
        <AppText style={styles.label}>DUE DATE</AppText>
        <TextInput testID="manual-task-date" accessibilityLabel="Due date, YYYY-MM-DD" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" autoCapitalize="none" maxLength={10} placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input }]} />
        <AppText style={[styles.intro, { color: colors.mutedForeground }]}>Enter a valid date as YYYY-MM-DD. Past dates are allowed.</AppText>
        <View style={[styles.note, { backgroundColor: colors.secondary }]}><Feather name="bell" size={16} color={colors.primary} /><AppText style={[styles.noteText, { color: colors.mutedForeground }]}>Reminders use this project's settings. Individual task reminders are not available. You can manage reminders on the project screen.</AppText></View>
        {!!error && <AppText style={{ color: colors.destructive }}>{error}</AppText>}
        <Pressable testID="save-manual-task" accessibilityRole="button" disabled={!canSave} onPress={save} style={[styles.save, { backgroundColor: canSave ? colors.primary : colors.input }]}><Feather name="plus" size={17} color="#FFFFFF" /><AppText style={styles.saveText}>Add task</AppText></Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 15 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 17 },
  topTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 27, letterSpacing: -0.8 },
  intro: { fontSize: 13, lineHeight: 19 },
  label: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, fontFamily: 'Inter_500Medium', fontSize: 13 },
  note: { borderRadius: 15, padding: 14, flexDirection: 'row', gap: 11 },
  noteText: { flex: 1, fontSize: 12, lineHeight: 18 },
  save: { minHeight: 53, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  saveText: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 14 },
});
