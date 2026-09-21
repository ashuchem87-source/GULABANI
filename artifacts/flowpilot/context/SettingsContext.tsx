import { View, Text, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, SETTINGS_KEY, decodeSettings, normalizeSettings, formatDate, type SavedSettings, type Settings } from '@/lib/settings';

type SettingsValue = { settings: Settings; error: string; update: <K extends keyof Settings>(key: K, value: Settings[K]) => void; retry: () => void };
const SettingsContext = createContext<SettingsValue>({ settings: DEFAULT_SETTINGS, error: '', update: () => {}, retry: () => {} });

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SavedSettings>(() => normalizeSettings(null));
  const [loaded, setLoaded] = useState(false), [error, setError] = useState('');
  const current = useRef(settings), queue = useRef<Promise<unknown>>(Promise.resolve()), revision = useRef(0);
  const load = () => {
    AsyncStorage.getItem(SETTINGS_KEY).then((raw) => {
      current.current = decodeSettings(raw); setSettings(current.current); setError(''); setLoaded(true);
    }).catch(() => { setError('Settings could not be loaded. Tap Retry before changing preferences.'); });
  };
  useEffect(load, []);
  const save = () => {
    const snapshot = JSON.stringify(current.current), version = ++revision.current;
    queue.current = queue.current.catch(() => undefined).then(() => AsyncStorage.setItem(SETTINGS_KEY, snapshot))
      .then(() => { if (version === revision.current) setError(''); })
      .catch(() => { if (version === revision.current) setError('Settings could not be saved. Tap Retry to save your preferences.'); });
  };
  const update: SettingsValue['update'] = (key, value) => {
    if (error.startsWith('Settings could not be loaded')) return;
    const next = normalizeSettings({ ...current.current, [key]: value });
    current.current = next; setSettings(next); save();
  };
  // Forms mount only after preferences load, so defaults cannot replace saved choices.
  if (!loaded) return error ? <View style={{ flex: 1, padding: 30, justifyContent: 'center', backgroundColor: '#F8F6F1' }}><Text style={{ color: '#15213D' }}>{error}</Text><Pressable accessibilityRole="button" onPress={load} style={{ padding: 20 }}><Text style={{ color: '#15213D' }}>Retry</Text></Pressable></View> : null;
  return <SettingsContext.Provider value={{ settings, error, update, retry: () => error.startsWith('Settings could not be loaded') ? load() : save() }}>{children}</SettingsContext.Provider>;
}
export function useSettings() { return useContext(SettingsContext); }
export function useDateFormatter() {
  const { settings } = useSettings();
  return (value: string) => formatDate(value, settings.dateFormat);
}
