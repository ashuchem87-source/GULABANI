import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { useColors } from '@/hooks/useColors';
import { localDateValue, parseTaskDate } from '@/lib/task-utils';

// Calendar UI uses only existing React Native components; no native module needed.
export function ProjectDateField({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => parseTaskDate(value) ?? new Date());
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((first.getDay() + count) / 7) * 7 }, (_, index) => index - first.getDay() + 1);
  const choose = (date: Date) => { onChange(localDateValue(date)); setOpen(false); };
  const shiftMonth = (amount: number) => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  return <View style={{ gap: 7 }}>
    <AppText style={styles.label}>PROJECT START DATE / ALLOCATION DATE</AppText>
    <View style={[styles.field, { backgroundColor: colors.card, borderColor: colors.input }]}>
      <TextInput testID="project-start-date" accessibilityLabel="Project start date, YYYY-MM-DD" value={value} onChangeText={onChange} placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground} maxLength={10} autoCapitalize="none" style={[styles.input, { color: colors.foreground }]} />
      <Pressable testID="open-project-calendar" accessibilityRole="button" accessibilityLabel="Choose project start date" onPress={() => { setMonth(parseTaskDate(value) ?? new Date()); setOpen(true); }} style={styles.icon}><Feather name="calendar" size={20} color={colors.primary} /></Pressable>
    </View>
    <AppText style={[styles.hint, { color: parseTaskDate(value) ? colors.mutedForeground : colors.destructive }]}>{parseTaskDate(value) ? 'Choose a date or enter YYYY-MM-DD. Past and future dates are allowed.' : 'Enter a valid date as YYYY-MM-DD.'}</AppText>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.overlay}><View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: colors.card }]}>
        <AppText style={styles.title}>Project start date</AppText>
        <View style={styles.navigation}>
          <Pressable accessibilityLabel="Previous month" accessibilityRole="button" onPress={() => shiftMonth(-1)} style={styles.icon}><Feather name="chevron-left" size={22} color={colors.primary} /></Pressable>
          <AppText accessibilityLiveRegion="polite" style={styles.month}>{new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(first)}</AppText>
          <Pressable accessibilityLabel="Next month" accessibilityRole="button" onPress={() => shiftMonth(1)} style={styles.icon}><Feather name="chevron-right" size={22} color={colors.primary} /></Pressable>
        </View>
        <View style={styles.grid}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <View key={day} style={styles.weekday}><AppText style={[styles.hint, { color: colors.mutedForeground }]}>{day}</AppText></View>)}</View>
        <View style={styles.grid}>{cells.map((day, index) => {
          if (day < 1 || day > count) return <View key={index} style={styles.cell} />;
          const date = new Date(first.getFullYear(), first.getMonth(), day);
          const dateValue = localDateValue(date);
          const selected = dateValue === value;
          return <Pressable key={index} testID={`calendar-${dateValue}`} accessibilityRole="button" accessibilityLabel={dateValue} accessibilityState={{ selected }} onPress={() => choose(date)} style={[styles.cell, { backgroundColor: selected ? colors.primary : 'transparent' }]}><AppText style={{ color: selected ? '#FFFFFF' : colors.foreground }}>{day}</AppText></Pressable>;
        })}</View>
        <View style={styles.footer}><Pressable accessibilityRole="button" onPress={() => choose(new Date())} style={styles.action}><AppText style={{ color: colors.primary }}>Today</AppText></Pressable><Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.action}><AppText>Cancel</AppText></Pressable></View>
      </View></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  label: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2 },
  field: { minHeight: 48, borderWidth: 1, borderRadius: 13, flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, paddingHorizontal: 14, fontFamily: 'Inter_500Medium', fontSize: 13 },
  hint: { fontSize: 11, lineHeight: 17 },
  icon: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  dialog: { width: '100%', maxWidth: 380, padding: 12, borderRadius: 20 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 18, padding: 8 },
  navigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  month: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.285714%', alignItems: 'center', paddingVertical: 8 },
  cell: { width: '14.285714%', minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
});
