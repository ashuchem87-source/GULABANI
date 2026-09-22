import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { useFlow } from '@/context/FlowContext';
import { useDateFormatter } from '@/context/SettingsContext';
import { useColors } from '@/hooks/useColors';
import { dataSummary, parseBackup, serializeBackup, validateData, type Backup } from '@/lib/data-backup';
import { dataFilename, exportCsv } from '@/lib/data-export';
import { readBackupFile, saveDataFile } from '@/lib/data-files';

export function DataManagement() {
  const colors = useColors(), formatDate = useDateFormatter();
  const { hydrated, getDataSnapshot, restoreBackup } = useFlow();
  const [busy, setBusy] = useState(false), running = useRef(false);
  const [message, setMessage] = useState(''), [error, setError] = useState('');
  const [pending, setPending] = useState<Backup | null>(null);
  const [summary, setSummary] = useState<ReturnType<typeof dataSummary> | null>(null);
  const [integrity, setIntegrity] = useState('');
  const perform = async (action: () => Promise<void>) => {
    if (running.current || !hydrated) return;
    running.current = true; setBusy(true); setMessage(''); setError('');
    try { await action(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'This data operation could not be completed. Please try again.'); }
    finally { running.current = false; setBusy(false); }
  };
  const backup = () => perform(async () => {
    const snapshot = getDataSnapshot(), now = new Date();
    const content = serializeBackup(snapshot, now);
    if (await saveDataFile(dataFilename('Backup', 'json', now), content, 'application/json')) setMessage('Backup saved to your selected folder. Keep this JSON file somewhere safe.');
  });
  const exportData = () => perform(async () => {
    const snapshot = getDataSnapshot(), now = new Date();
    if (await saveDataFile(dataFilename('Projects_Tasks', 'csv', now), exportCsv(snapshot), 'text/csv')) setMessage('Excel-compatible CSV saved. It includes projects, project tasks and personal To-dos. CSV cannot restore the app.');
  });
  const selectBackup = () => perform(async () => {
    const raw = await readBackupFile(); if (raw === null) return;
    setPending(parseBackup(raw));
  });
  const restore = () => perform(async () => {
    if (!pending) return;
    const result = await restoreBackup(pending);
    if (!result.ok) { setError(result.error ?? 'Restore could not be completed.'); return; }
    setPending(null); setSummary(null);
    setMessage(result.warning ?? 'Backup restored successfully. Your saved data and preferences are now in use.');
  });
  const showSummary = () => {
    const snapshot = getDataSnapshot(); setSummary(dataSummary(snapshot)); setIntegrity('');
    try { validateData(snapshot); }
    catch { setIntegrity('Some existing records need attention before they can be restored from a backup. You can still save a backup for safekeeping. Current data has not been changed.'); }
  };
  const actions = [
    ['create-backup', 'Create Backup', 'Save all GULABANI data and preferences to a restorable JSON file.', backup],
    ['restore-backup', 'Restore Backup', 'Select a JSON backup. Review and confirm before replacing current data.', selectBackup],
    ['export-data', 'Export Projects & Tasks', 'Save Excel-compatible CSV for reporting. CSV cannot restore the app.', exportData],
    ['data-summary', 'Data Summary', 'View counts and check data integrity without changing records.', showSummary],
  ] as const;
  const close = () => { if (!running.current) { setPending(null); setSummary(null); setError(''); } };
  return <View style={{ gap: 10 }}>
    <AppText accessibilityRole="header" style={styles.heading}>Data & Backup</AppText>
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{actions.map(([key, title, hint, action]) => <Pressable key={key} testID={key} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: busy || !hydrated }} disabled={busy || !hydrated} onPress={action} style={styles.action}><AppText style={{ color: colors.primary }}>{title}</AppText><AppText style={[styles.hint, { color: colors.mutedForeground }]}>{hint}</AppText></Pressable>)}</View>
    {busy && <AppText accessibilityLiveRegion="polite">Working… Please keep the app open.</AppText>}
    {!!message && <AppText accessibilityLiveRegion="polite">{message}</AppText>}
    {!!error && <AppText accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</AppText>}
    <Modal visible={pending !== null || summary !== null} transparent animationType="fade" onRequestClose={close}><View style={styles.overlay}><View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: colors.card }]}><ScrollView contentContainerStyle={{ gap: 14 }}>
      <AppText accessibilityRole="header" style={styles.heading}>{pending ? 'Restore this backup?' : 'Data Summary'}</AppText>
      {pending && <><AppText>Your current GULABANI data will be replaced with the data from this backup.</AppText><AppText>Create a backup of your current data first if you may need it later.</AppText><AppText>Backup created: {formatDate(pending.createdAt)}</AppText></>}
      {Object.entries(pending ? dataSummary(pending.data) : summary ?? {}).map(([label, count]) => <AppText key={label}>{label}: {count}</AppText>)}
      {!pending && !!integrity && <AppText style={{ color: colors.destructive }}>{integrity}</AppText>}
      {pending && <Pressable testID="confirm-restore" accessibilityRole="button" disabled={busy} accessibilityState={{ disabled: busy }} onPress={restore} style={[styles.confirm, { backgroundColor: colors.destructive }]}><AppText style={{ color: colors.primaryForeground }}>Restore — Replace Current Data</AppText></Pressable>}
      {!!error && <AppText accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</AppText>}
      <Pressable testID="cancel-data-dialog" accessibilityRole="button" disabled={busy} onPress={close} style={styles.action}><AppText>{pending ? 'Cancel' : 'Close'}</AppText></Pressable>
    </ScrollView></View></View></Modal>
  </View>;
}
const styles = StyleSheet.create({
  heading: { fontFamily: 'Inter_700Bold', fontSize: 15 }, card: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  action: { minHeight: 52, padding: 14, gap: 5 }, hint: { fontSize: 12, lineHeight: 18 },
  overlay: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)', padding: 24 },
  dialog: { maxHeight: '85%', width: '100%', maxWidth: 460, alignSelf: 'center', padding: 20, borderRadius: 20 },
  confirm: { minHeight: 52, borderRadius: 12, padding: 14, alignItems: 'center', justifyContent: 'center' },
});
