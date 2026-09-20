import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { useFlow } from '@/context/FlowContext';
import { useColors } from '@/hooks/useColors';

export default function TemplatesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { templates } = useFlow();
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.content, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 18, paddingBottom: insets.bottom + 90 }]} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><View><AppText style={[styles.kicker, { color: colors.primary }]}>YOUR SYSTEM</AppText><AppText style={styles.title}>Templates</AppText><AppText style={[styles.subtitle, { color: colors.mutedForeground }]}>Make the right next step automatic.</AppText></View><Pressable testID="add-template" onPress={() => router.push('/new-template')} style={[styles.add, { backgroundColor: colors.foreground }]}><Feather name="plus" size={20} color={colors.background} /></Pressable></View>
      {templates.map((template) => (
        <Pressable key={template.id} onPress={() => router.push({ pathname: '/new-project', params: { templateId: template.id } })} style={({ pressed }) => [styles.template, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}>
          <View style={styles.templateHeader}><View style={[styles.templateIcon, { backgroundColor: template.color }]}><Feather name="layers" size={17} color="#FFFFFF" /></View><View style={{ flex: 1 }}><AppText style={styles.name}>{template.name}</AppText><AppText style={[styles.category, { color: colors.mutedForeground }]}>{template.category} · {template.steps.length} steps</AppText></View><Feather name="arrow-up-right" size={17} color={colors.mutedForeground} /></View>
          <AppText style={[styles.description, { color: colors.mutedForeground }]}>{template.description}</AppText>
          <View style={styles.stepPreview}>{template.steps.map((step, index) => <View key={step.id} style={styles.step}><View style={[styles.stepNumber, { backgroundColor: index === 0 ? template.color : colors.secondary }]}><AppText style={[styles.stepNumberText, { color: index === 0 ? '#FFFFFF' : colors.secondaryForeground }]}>{index + 1}</AppText></View><AppText style={styles.stepName}>{step.title}</AppText></View>)}</View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 13 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  kicker: { fontFamily: 'Inter_700Bold', letterSpacing: 1.5, fontSize: 10, marginBottom: 8 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 30, letterSpacing: -1 },
  subtitle: { fontSize: 13, marginTop: 5 },
  add: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  template: { borderWidth: 1, borderRadius: 20, padding: 17, marginBottom: 3 },
  templateHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  templateIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  category: { fontSize: 11, marginTop: 4 },
  description: { fontSize: 12, lineHeight: 18, marginTop: 15 },
  stepPreview: { gap: 9, marginTop: 16 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  stepNumber: { width: 23, height: 23, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  stepName: { fontFamily: 'Inter_500Medium', fontSize: 12 },
});