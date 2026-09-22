import AsyncStorage from '@react-native-async-storage/async-storage';
import { SETTINGS_KEY } from '@/lib/settings';
import { validateData, type AppData } from '@/lib/data-backup';

export const FLOW_KEY = 'flowpilot-state-v1';
export const RESTORE_JOURNAL_KEY = 'gulabani-restore-journal-v1';
let queue: Promise<unknown> = Promise.resolve();
let locked = false, generation = 0;
let recovery: Promise<void> | undefined;
export const dataLocked = () => locked;
export const dataGeneration = () => generation;
function serialized<T>(action: () => Promise<T>): Promise<T> {
  const next = queue.catch(() => undefined).then(action); queue = next; return next;
}
export function writeData(key: string, value: string): Promise<void> {
  if (locked) return Promise.reject(new Error('Data recovery is in progress.'));
  return serialized(() => AsyncStorage.setItem(key, value));
}
type Journal = { version: 1; flow: string | null; settings: string | null };
async function put(key: string, value: string | null) {
  if (value === null) await AsyncStorage.removeItem(key); else await AsyncStorage.setItem(key, value);
}
async function rollback(journal: Journal) {
  await put(FLOW_KEY, journal.flow);
  await put(SETTINGS_KEY, journal.settings);
  await AsyncStorage.removeItem(RESTORE_JOURNAL_KEY);
}
// Called before either provider mounts. An interrupted restore is rolled back,
// not silently accepted as a partial dataset. On failure the app remains gated.
export function recoverData(): Promise<void> {
  if (recovery) return recovery;
  locked = true;
  recovery = serialized(async () => {
    const raw = await AsyncStorage.getItem(RESTORE_JOURNAL_KEY);
    if (raw !== null) {
      const journal = JSON.parse(raw) as Journal;
      if (!journal || journal.version !== 1 || ![journal.flow, journal.settings].every((v) => v === null || typeof v === 'string')) throw new Error('Recovery record cannot be read.');
      await rollback(journal);
    }
    locked = false;
  }).finally(() => { recovery = undefined; });
  return recovery;
}
export type RestoreResult = { ok: boolean; error?: string; recoveryRequired?: boolean };
export async function replaceData(input: AppData, commit: (data: AppData) => void, previous?: AppData): Promise<RestoreResult> {
  if (locked) return { ok: false, error: 'Another data operation is in progress.' };
  let data: AppData;
  try { data = validateData(input); } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Invalid backup.' }; }
  locked = true; generation++;
  return serialized(async () => {
    let journal: Journal | undefined, journalWritten = false;
    try {
      journal = { version: 1, flow: await AsyncStorage.getItem(FLOW_KEY), settings: await AsyncStorage.getItem(SETTINGS_KEY) };
      // Include the latest in-memory edits even if their render's autosave has not
      // run yet. A failed restore must not roll those edits back to older disk data.
      if (previous) {
        const { settings, ...flow } = previous;
        journal = { version: 1, flow: JSON.stringify(flow), settings: JSON.stringify(settings) };
      }
      await AsyncStorage.setItem(RESTORE_JOURNAL_KEY, JSON.stringify(journal)); journalWritten = true;
      const { settings, ...flow } = data;
      await AsyncStorage.setItem(FLOW_KEY, JSON.stringify(flow));
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      await AsyncStorage.removeItem(RESTORE_JOURNAL_KEY);
    } catch {
      if (journalWritten && journal) {
        try { await rollback(journal); }
        catch { return { ok: false, recoveryRequired: true, error: 'Restore could not finish and recovery is required. Your previous data is protected by a recovery record. Retry recovery before continuing.' }; }
      } else if (journal) {
        // A rejected write can be ambiguous. Primary data has not been touched;
        // remove any journal that may have landed before allowing future edits.
        try { await AsyncStorage.removeItem(RESTORE_JOURNAL_KEY); }
        catch { return { ok: false, recoveryRequired: true, error: 'Restore could not start safely. Retry recovery before continuing.' }; }
      }
      locked = false;
      return { ok: false, error: 'Restore could not be saved. Your current data has been kept. Please try again.' };
    }
    // No awaited work between committing both in-memory datasets and unlocking.
    commit(data); locked = false;
    return { ok: true };
  });
}
