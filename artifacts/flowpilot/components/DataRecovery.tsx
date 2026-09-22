import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { recoverData } from '@/lib/data-storage';
import { useColors } from '@/hooks/useColors';

// Mount before Settings/Flow so partially written restore data is never hydrated.
export function DataRecovery({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const [ready, setReady] = useState(false), [error, setError] = useState(false);
  const recover = () => { setError(false); void recoverData().then(() => setReady(true)).catch(() => setError(true)); };
  useEffect(recover, []);
  if (ready) return children;
  return <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.background }}>
    <Text style={{ color: colors.foreground }}>{error ? 'Your data could not be recovered safely. No data has been discarded. Please retry recovery before continuing.' : 'Checking saved data…'}</Text>
    {error && <Pressable accessibilityRole="button" accessibilityLabel="Retry data recovery" onPress={recover} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: colors.primary }}>Retry Recovery</Text></Pressable>}
  </View>;
}
