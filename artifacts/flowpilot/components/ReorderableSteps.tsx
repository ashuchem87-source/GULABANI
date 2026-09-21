import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { AppText } from '@/components/AppText';
import type { WorkflowStep } from '@/context/FlowContext';
import { useColors } from '@/hooks/useColors';
import { moveItem } from '@/lib/task-utils';

export type ScrollMetrics = { offset: number; height: number; contentHeight: number; top: number };
type Drag = { from: number; to: number; dy: number; fingerY: number; startOffset: number };

export function ReorderableSteps({ steps, onChange, renderStep, scrollRef, metrics, onDragging }: {
  steps: WorkflowStep[];
  onChange: (steps: WorkflowStep[]) => void;
  renderStep: (step: WorkflowStep, index: number) => ReactNode;
  scrollRef: RefObject<ScrollView | null>;
  metrics: RefObject<ScrollMetrics>;
  onDragging: (dragging: boolean) => void;
}) {
  const colors = useColors();
  const rows = useRef<Record<string, { y: number; height: number }>>({});
  const drag = useRef<Drag | null>(null);
  const frame = useRef<number | null>(null);
  const [preview, setPreview] = useState<Drag | null>(null);

  const refresh = useCallback(() => {
    const active = drag.current;
    if (!active) return;
    const origin = rows.current[steps[active.from].id];
    if (!origin) return;
    const center = origin.y + origin.height / 2 + active.dy + metrics.current.offset - active.startOffset;
    let to = active.from;
    steps.forEach((step, index) => {
      const row = rows.current[step.id];
      if (!row) return;
      if (index < active.from && center < row.y + row.height / 2) to = Math.min(to, index);
      if (index > active.from && center > row.y + row.height / 2) to = Math.max(to, index);
    });
    active.to = to;
    setPreview({ ...active });
  }, [steps, metrics]);

  const stop = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    drag.current = null;
    setPreview(null);
    onDragging(false);
  }, [onDragging]);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  const begin = (index: number, fingerY: number) => {
    drag.current = { from: index, to: index, dy: 0, fingerY, startOffset: metrics.current.offset };
    onDragging(true);
    scrollRef.current?.getNativeScrollRef()?.measureInWindow((_x, y, _width, height) => {
      metrics.current.top = y;
      metrics.current.height = height;
    });
    refresh();
    const tick = () => {
      const active = drag.current;
      if (!active) return;
      const { offset, top, height, contentHeight } = metrics.current;
      const edge = 64;
      const speed = active.fingerY < top + edge ? -8 : active.fingerY > top + height - edge ? 8 : 0;
      const next = Math.max(0, Math.min(Math.max(0, contentHeight - height), offset + speed));
      if (next !== offset) {
        metrics.current.offset = next;
        scrollRef.current?.scrollTo({ y: next, animated: false });
        refresh();
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };

  return <View style={styles.list}>
    <AppText style={[styles.hint, { color: colors.mutedForeground }]}>Hold the move handle and drag. Use the arrows to move one place.</AppText>
    {steps.map((step, index) => {
      const selected = preview?.from === index;
      const displacement = selected && preview ? preview.dy + metrics.current.offset - preview.startOffset : 0;
      const gesture = Gesture.Pan().activateAfterLongPress(300).maxPointers(1).runOnJS(true)
        .onStart((event) => begin(index, event.absoluteY))
        .onUpdate((event) => {
          if (!drag.current || drag.current.from !== index) return;
          drag.current.dy = event.translationY;
          drag.current.fingerY = event.absoluteY;
          refresh();
        })
        .onEnd((_event, success) => {
          if (success && drag.current) onChange(moveItem(steps, drag.current.from, drag.current.to));
          stop();
        })
        .onFinalize(() => { if (drag.current?.from === index) stop(); });
      return <View key={step.id} onLayout={(event) => { rows.current[step.id] = event.nativeEvent.layout; }} style={[
        styles.item,
        { backgroundColor: colors.background, borderColor: preview?.to === index ? colors.primary : 'transparent' },
        selected && { zIndex: 10, elevation: 8, transform: [{ translateY: displacement }], opacity: 0.92 },
      ]}>
        <View style={styles.controls}>
          <GestureDetector gesture={gesture}>
            <View testID={`drag-step-${step.id}`} accessible accessibilityRole="adjustable" accessibilityLabel={`Move step ${index + 1}: ${step.title}`} accessibilityHint="Hold and drag, or use move up and move down"
              accessibilityActions={[{ name: 'decrement', label: 'Move up' }, { name: 'increment', label: 'Move down' }]}
              onAccessibilityAction={(event) => onChange(moveItem(steps, index, index + (event.nativeEvent.actionName === 'decrement' ? -1 : 1)))}
              style={styles.handle}>
              <Feather name="move" size={17} color={colors.primary} /><AppText style={[styles.hint, { color: colors.mutedForeground }]}>{selected && preview ? `Move to ${preview.to + 1}` : `Step ${index + 1}`}</AppText>
            </View>
          </GestureDetector>
          <Pressable testID={`move-step-up-${index + 1}`} accessibilityRole="button" accessibilityLabel={`Move step ${index + 1} up`} disabled={index === 0 || !!preview} onPress={() => onChange(moveItem(steps, index, index - 1))} style={[styles.arrow, { opacity: index === 0 ? 0.3 : 1 }]}><Feather name="chevron-up" size={20} color={colors.primary} /></Pressable>
          <Pressable testID={`move-step-down-${index + 1}`} accessibilityRole="button" accessibilityLabel={`Move step ${index + 1} down`} disabled={index === steps.length - 1 || !!preview} onPress={() => onChange(moveItem(steps, index, index + 1))} style={[styles.arrow, { opacity: index === steps.length - 1 ? 0.3 : 1 }]}><Feather name="chevron-down" size={20} color={colors.primary} /></Pressable>
        </View>
        {renderStep(step, index)}
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  item: { borderWidth: 1, borderRadius: 15 },
  controls: { flexDirection: 'row', alignItems: 'center' },
  handle: { minHeight: 44, flex: 1, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8 },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 11, lineHeight: 17 },
});
