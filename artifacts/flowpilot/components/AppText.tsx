import { Text, TextProps } from 'react-native';
import { useColors } from '@/hooks/useColors';

export function AppText({ style, ...props }: TextProps) {
  const colors = useColors();
  return <Text {...props} style={[{ color: colors.foreground, fontFamily: 'Inter_400Regular' }, style]} />;
}