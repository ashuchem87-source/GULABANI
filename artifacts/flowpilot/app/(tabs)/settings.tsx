import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, TextInput, View, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { useColors } from '@/hooks/useColors';
import { useSettings } from '@/context/SettingsContext';
import { OPTIONS, HELP, parseDuration, type Settings } from '@/lib/settings';

const sections: { title: string; rows: { key: keyof Settings; label: string; hint?: string }[] }[] = [
  { title: 'General', rows: [{ key: 'startScreen', label: 'Default Start Screen', hint: 'Used on a fresh launch. Links keep their destination.' }, { key: 'dateFormat', label: 'Date Format' }, { key: 'firstDayOfWeek', label: 'First Day of Week' }] },
  { title: 'Notifications', rows: [{ key: 'notificationsEnabled', label: 'Notifications' }, { key: 'defaultReminder', label: 'Default Reminder', hint: 'For new personal tasks with a date and time.' }] },
  { title: 'To-do Preferences', rows: [{ key: 'showPersonal', label: 'Show Personal Tasks' }, { key: 'showProjects', label: 'Show Project Tasks' }, { key: 'showCompleted', label: 'Show Completed Tasks' }, { key: 'defaultPriority', label: 'Default Priority' }] },
  { title: 'Project Preferences', rows: [{ key: 'projectDuration', label: 'Default Project Duration', hint: 'For new projects only. Choose 1–3650 days.' }, { key: 'showCompletedProjects', label: 'Show Completed Projects', hint: 'Controls completed projects in the Active list. Archived projects have their own view.' }] },
  { title: 'Appearance', rows: [{ key: 'theme', label: 'Theme' }] },
];
export default function SettingsScreen() {
  const colors = useColors(), insets = useSafeAreaInsets();
  const { settings, update, error, retry } = useSettings();
  const [selection, setSelection] = useState<keyof Settings | null>(null);
  const [duration, setDuration] = useState(''), [invalid, setInvalid] = useState('');
  const [help, setHelp] = useState<string | null>(null);
  const row = sections.flatMap((section) => section.rows).find((item) => item.key === selection);
  const values = selection && selection in OPTIONS ? OPTIONS[selection as keyof typeof OPTIONS] : [];
  const config = Constants.expoConfig;
  const build = Platform.OS === 'android' ? config?.android?.versionCode : config?.ios?.buildNumber;
  return <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}>
    <AppText style={styles.title}>Settings</AppText>
    {!!error && <View style={styles.section}><AppText accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</AppText><Pressable accessibilityRole="button" onPress={retry} style={styles.row}><AppText style={{ color: colors.primary }}>Retry</AppText></Pressable></View>}
    {sections.map((section) => <View key={section.title} style={styles.section}>
      <AppText style={[styles.label, { color: colors.mutedForeground }]}>{section.title}</AppText>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{section.rows.map(({ key, label, hint }) => {
        const value = settings[key];
        const text = <View style={{ flex: 1, gap: 5 }}><AppText>{label}</AppText>{!!hint && <AppText style={[styles.hint, { color: colors.mutedForeground }]}>{hint}</AppText>}</View>;
        return typeof value === 'boolean' ? <View key={key} style={[styles.row, { borderBottomColor: colors.border }]}>{text}<Switch testID={key} accessibilityLabel={label} value={value} onValueChange={(next) => update(key, next)} trackColor={{ false: colors.input, true: colors.primary }} /></View>
          : <Pressable key={key} testID={key} accessibilityRole="button" accessibilityLabel={label + ', ' + value} onPress={() => { setSelection(key); setDuration(String(settings.projectDuration)); setInvalid(''); }} style={[styles.row, { borderBottomColor: colors.border }]}>{text}<AppText style={[styles.value, { color: colors.primary }]}>{value}{key === 'projectDuration' ? ' days' : ''}</AppText><Feather name="chevron-right" size={16} color={colors.mutedForeground} /></Pressable>;
      })}</View>
    </View>)}
    <View style={styles.section}><AppText style={[styles.label, { color: colors.mutedForeground }]}>About GULABANI</AppText><View style={[styles.card, styles.about, { backgroundColor: colors.card, borderColor: colors.border }]}><AppText>{config?.name ?? 'GULABANI'}</AppText><AppText style={styles.hint}>Version {config?.version ?? 'Not available'}</AppText>{build != null && <AppText style={styles.hint}>Build {build}</AppText>}</View></View>
    <View style={styles.section}><AppText style={[styles.label, { color: colors.mutedForeground }]}>Help</AppText><View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{Object.entries(HELP).map(([title, body]) => <View key={title}><Pressable accessibilityRole="button" accessibilityState={{ expanded: help === title }} onPress={() => setHelp(help === title ? null : title)} style={styles.row}><AppText style={{ flex: 1 }}>{title}</AppText><Feather name={help === title ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} /></Pressable>{help === title && <AppText style={[styles.help, { color: colors.mutedForeground }]}>{body}</AppText>}</View>)}</View></View>
    <Modal visible={selection !== null} transparent animationType="fade" onRequestClose={() => setSelection(null)}><View style={styles.overlay}><View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: colors.card }]}><ScrollView keyboardShouldPersistTaps="handled">
      <AppText style={styles.label}>{row?.label}</AppText>
      {selection === 'projectDuration' ? <><TextInput accessibilityLabel="Default Project Duration in days" value={duration} onChangeText={setDuration} keyboardType="number-pad" maxLength={8} style={[styles.duration, { color: colors.foreground, borderColor: colors.input }]} />{!!invalid && <AppText accessibilityRole="alert" style={{ color: colors.destructive }}>{invalid}</AppText>}<Pressable accessibilityRole="button" style={styles.row} onPress={() => { const days = parseDuration(duration); if (!days) { setInvalid('Enter a whole number from 1 to 3650.'); return; } update('projectDuration', days); setSelection(null); }}><AppText style={{ color: colors.primary }}>Save duration</AppText></Pressable></>
      : values.map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: selection ? settings[selection] === value : false }} style={styles.row} onPress={() => { if (selection) update(selection, value); setSelection(null); }}><AppText style={{ flex: 1 }}>{value}</AppText>{selection && settings[selection] === value && <Feather name="check" size={20} color={colors.primary} />}</Pressable>)}
      <Pressable accessibilityRole="button" onPress={() => setSelection(null)} style={styles.row}><AppText>Cancel</AppText></Pressable>
    </ScrollView></View></View></Modal>
  </ScrollView>;
}
const styles = StyleSheet.create({
  content: { padding: 20, gap: 24 }, title: { fontSize: 30, fontFamily: 'Inter_700Bold' }, section: { gap: 10 },
  label: { fontFamily: 'Inter_700Bold', fontSize: 14 }, card: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  row: { minHeight: 56, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }, hint: { fontSize: 12, lineHeight: 18 },
  value: { maxWidth: '42%', fontSize: 12, textAlign: 'right' }, about: { padding: 16, gap: 8 }, help: { paddingHorizontal: 14, paddingBottom: 16, fontSize: 13, lineHeight: 20 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }, dialog: { borderRadius: 20, padding: 16, maxHeight: '85%', width: '100%', maxWidth: 450, alignSelf: 'center' },
  duration: { minHeight: 50, borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 16, fontSize: 16 },
});
