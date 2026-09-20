import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { useColors } from '@/hooks/useColors';

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <AppText style={[styles.title, { color: colors.foreground }]}>{title}</AppText>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} style={({ pressed }) => pressed && { opacity: 0.6 }}>
          <View style={styles.actionRow}>
            <AppText style={[styles.action, { color: colors.primary }]}>{action}</AppText>
            <Feather name="arrow-up-right" size={14} color={colors.primary} />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 19, letterSpacing: -0.3 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  action: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
});