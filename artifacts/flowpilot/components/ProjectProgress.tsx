import { View, type DimensionValue } from 'react-native';
import { AppText } from '@/components/AppText';
import { useColors } from '@/hooks/useColors';
import { projectProgress } from '@/lib/project-management';
import type { ProjectTask } from '@/context/FlowContext';

export function ProjectProgress({ projectId, tasks }: { projectId: string; tasks: ProjectTask[] }) {
  const colors = useColors();
  const { percent, completed, total } = projectProgress(projectId, tasks);
  return <View style={{ gap: 8 }}>
    <View accessibilityRole="progressbar" accessibilityLabel="Project progress" accessibilityValue={{ min: 0, max: 100, now: percent, text: percent + '% complete' }} style={{ height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.secondary }}><View style={{ height: '100%', width: (percent + '%') as DimensionValue, backgroundColor: colors.primary }} /></View>
    <AppText style={{ fontSize: 12, color: colors.mutedForeground }}>{percent}% complete · {completed} of {total} tasks completed</AppText>
  </View>;
}
