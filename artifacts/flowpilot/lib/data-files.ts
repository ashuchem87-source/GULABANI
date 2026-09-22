import { File } from 'expo-file-system';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { MAX_BACKUP_BYTES } from '@/lib/data-backup';

export async function saveDataFile(name: string, content: string, mime: string): Promise<boolean> {
  if (Platform.OS !== 'android') throw new Error('File backup and export are available in the Android app.');
  let uri: string | undefined;
  try {
    const permission = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted) return false;
    // Android's document provider creates a distinct file if the name exists.
    uri = await StorageAccessFramework.createFileAsync(permission.directoryUri, name, mime);
    await StorageAccessFramework.writeAsStringAsync(uri, content);
    return true;
  } catch {
    // Best-effort cleanup of only the new partial output, never existing files.
    if (uri) try { await StorageAccessFramework.deleteAsync(uri); } catch { /* User may remove a partial file from the selected folder. */ }
    throw new Error('The file could not be saved. Check the selected folder and available storage, then try again.');
  }
}
export async function readBackupFile(): Promise<string | null> {
  if (Platform.OS !== 'android') throw new Error('Restore is available in the Android app.');
  // The legacy overload throws on read/picker errors; the newer SDK overload
  // reports every picker failure as cancellation, hiding genuine access errors.
  let selected: File | File[];
  try { selected = await File.pickFileAsync(undefined, '*/*'); }
  catch (error) {
    if (error instanceof Error && /cancel/i.test(error.message)) return null;
    throw new Error('The backup file could not be opened. Please try again.');
  }
  const file = Array.isArray(selected) ? selected[0] : selected;
  if (!file) return null;
  let size: number;
  try { size = file.size; } catch { throw new Error('The backup file could not be read. Check file access and try again.'); }
  if (size > MAX_BACKUP_BYTES) throw new Error('The backup is too large (20 MB maximum).');
  try { return await file.text(); } catch { throw new Error('The backup file could not be read. Check file access and try again.'); }
}
