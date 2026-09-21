import { useColorScheme } from 'react-native';
import colors from '@/constants/colors';
import { useSettings } from '@/context/SettingsContext';
import { resolveTheme } from '@/lib/settings';

export function useColors() {
  const system = useColorScheme();
  const { settings } = useSettings();
  const scheme = resolveTheme(settings.theme, system);
  return { ...colors[scheme], radius: colors.radius, isDark: scheme === 'dark' };
}
