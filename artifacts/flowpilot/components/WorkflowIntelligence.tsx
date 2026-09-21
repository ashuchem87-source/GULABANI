import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { useFlow, type Project, type ProjectTask } from '@/context/FlowContext';
import { useDateFormatter } from '@/context/SettingsContext';
import { useColors } from '@/hooks/useColors';
import { readDate } from '@/lib/task-utils';
import { buildRescheduleProposal, dependencyIds, getDownstreamTasks, getIncompleteDependencies, overdueDays, workflowCounts, type RescheduleProposal } from '@/lib/workflow-intelligence';

export function WorkflowSummary({ project, tasks }: { project: Project; tasks: ProjectTask[] }) {
  const colors = useColors();
  const { calendarDate } = useFlow();
  if (project.archived) return null;
  const counts = workflowCounts(project.id, tasks, calendarDate);
  return <View testID="workflow-summary" style={[styles.summary, { backgroundColor: colors.secondary }]}>
    <AppText style={styles.heading}>Workflow overview</AppText>
    <AppText>Ready: {counts.ready} · Blocked: {counts.blocked}</AppText>
    <AppText>Overdue: {counts.overdue} · Potentially impacted: {counts.impacted}</AppText>
    <AppText style={{ color: colors.mutedForeground }}>Impact follows explicit dependencies. Analysis does not change dates.</AppText>
  </View>;
}

export function TaskWorkflowActions({ project, task }: { project: Project; task: ProjectTask }) {
  const colors = useColors();
  const formatDate = useDateFormatter();
  const { tasks, calendarDate, setTaskDependencies, deleteProjectTask, applyReschedule } = useFlow();
  const [dialog, setDialog] = useState<'dependencies' | 'impact' | 'delete' | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [shift, setShift] = useState('');
  const [proposal, setProposal] = useState<RescheduleProposal | null>(null);
  const [extend, setExtend] = useState(false);
  const [error, setError] = useState('');
  if (project.archived) return null;
  const candidates = tasks.filter((other) => other.projectId === project.id && other.id !== task.id);
  const blockers = getIncompleteDependencies(task, tasks);
  const downstream = getDownstreamTasks(task, tasks);
  const impacted = downstream.filter((other) => other.status !== 'done');
  const delay = overdueDays(task, calendarDate);
  const directCount = candidates.filter((other) => dependencyIds(other).includes(task.id)).length;
  const dateLabel = (date: string) => Number.isFinite(readDate(date).getTime()) ? formatDate(date) : 'No valid due date';
  const close = () => { setDialog(null); setProposal(null); setError(''); setExtend(false); };
  const openDependencies = () => {
    // Deliberate editing cleans dangling/self references, never hydration.
    setSelected(dependencyIds(task).filter((id) => candidates.some((other) => other.id === id)));
    setError(''); setDialog('dependencies');
  };
  const preview = () => {
    setProposal(null); setExtend(false); setError('');
    if (!/^\d+$/.test(shift.trim())) { setError('Enter a whole number from 0 to 3650 days.'); return; }
    try { setProposal(buildRescheduleProposal(project, tasks, task.id, calendarDate, Number(shift))); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to prepare this schedule.'); }
  };
  return <View style={styles.taskActions}>
    {delay > 0 && impacted.length > 0 && <AppText style={{ color: colors.mutedForeground }}>Overdue by {delay} days · May affect {impacted.length} downstream tasks</AppText>}
    <View style={styles.actions}>
      <Pressable testID={`dependencies-${task.id}`} accessibilityRole="button" accessibilityLabel={`Manage dependencies for ${task.title}`} onPress={openDependencies} style={styles.button}><AppText style={{ color: colors.primary }}>Dependencies</AppText></Pressable>
      {delay > 0 && <Pressable testID={`impact-${task.id}`} accessibilityRole="button" accessibilityLabel={`Review schedule impact for ${task.title}`} onPress={() => { setShift(String(delay)); setProposal(null); setExtend(false); setError(''); setDialog('impact'); }} style={styles.button}><AppText style={{ color: colors.primary }}>Review Schedule Impact</AppText></Pressable>}
      <Pressable testID={`delete-task-${task.id}`} accessibilityRole="button" accessibilityLabel={`Delete ${task.title}`} onPress={() => { setError(''); setDialog('delete'); }} style={styles.button}><AppText style={{ color: colors.destructive }}>Delete Task</AppText></Pressable>
    </View>
    <Modal visible={dialog !== null} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}><View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: colors.card }]}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
        <AppText accessibilityRole="header" style={styles.heading}>{dialog === 'dependencies' ? 'Manage Dependencies' : dialog === 'delete' ? 'Delete Task?' : 'Schedule impact'}</AppText>
        <AppText style={styles.taskTitle}>{task.title}</AppText>
        {dialog === 'dependencies' && <>
          <AppText>Select prerequisites in this project. All must be complete for this task to be Ready.</AppText>
          {blockers.length > 0 && <AppText>Blocked by: {blockers.map((other) => other.title).join(', ')}</AppText>}
          {!candidates.length && <AppText>No other tasks in this project.</AppText>}
          {candidates.map((other) => <Pressable key={other.id} testID={`prerequisite-${other.id}`} accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(other.id) }} onPress={() => setSelected((current) => current.includes(other.id) ? current.filter((id) => id !== other.id) : [...current, other.id])} style={[styles.option, { borderColor: colors.border }]}>
            <AppText>{selected.includes(other.id) ? '✓ ' : '○ '}{other.title}</AppText><AppText style={{ color: colors.mutedForeground }}>{other.status === 'done' ? 'Completed' : 'Incomplete'} · {dateLabel(other.dueDate)}</AppText>
          </Pressable>)}
          <Pressable testID="save-dependencies" accessibilityRole="button" onPress={() => { const failure = setTaskDependencies(project.id, task.id, selected); if (failure) setError(failure); else close(); }} style={[styles.confirm, { backgroundColor: colors.action }]}><AppText style={{ color: colors.primaryForeground }}>Save Dependencies</AppText></Pressable>
        </>}
        {dialog === 'delete' && <>
          <AppText>Delete this task? {directCount} tasks depend on it. Its prerequisite references will be removed from those tasks. Their tasks and dates will be kept.</AppText>
          <Pressable testID="confirm-delete-task" accessibilityRole="button" onPress={() => { if (deleteProjectTask(project.id, task.id, true)) close(); else setError('This task cannot be deleted. Reopen the project and try again.'); }} style={[styles.confirm, { backgroundColor: colors.destructive }]}><AppText style={{ color: colors.primaryForeground }}>Delete Task</AppText></Pressable>
        </>}
        {dialog === 'impact' && <>
          <AppText>Current fact: overdue by {delay} calendar days.</AppText>
          <AppText>Potentially impacted tasks may require rescheduling. Only their own due dates determine whether they are overdue.</AppText>
          {!impacted.length && <AppText>No downstream tasks are affected.</AppText>}
          {impacted.map((other) => <View key={other.id} style={[styles.option, { borderColor: colors.border }]}><AppText>{other.title}</AppText><AppText style={{ color: colors.mutedForeground }}>Current due: {dateLabel(other.dueDate)}{overdueDays(other, calendarDate) ? ' · Overdue' : ''}</AppText></View>)}
          {downstream.some((other) => other.status === 'done') && <AppText>Completed downstream tasks are excluded from changes.</AppText>}
          {impacted.length > 0 && <>
            <AppText>Shift downstream tasks by calendar days (0–3650)</AppText>
            <TextInput testID="schedule-shift" accessibilityLabel="Shift downstream tasks by days" keyboardType="number-pad" value={shift} onChangeText={(value) => { setShift(value); setProposal(null); setExtend(false); setError(''); }} style={[styles.input, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.background }]} />
            <AppText style={{ color: colors.mutedForeground }}>Default: {delay} days overdue. The initiating task and project start date stay unchanged. Existing task completion/reopening still follows the current workflow timeline rules.</AppText>
            <Pressable testID="preview-schedule" accessibilityRole="button" onPress={preview} style={styles.button}><AppText style={{ color: colors.primary }}>Preview Schedule Changes</AppText></Pressable>
          </>}
          {proposal && <View testID="schedule-preview" style={{ gap: 12 }}>
            <AppText>{proposal.changes.length} downstream tasks will have their due dates changed.</AppText>
            {proposal.changes.map((change) => <View key={change.taskId} style={[styles.option, { borderColor: colors.border }]}><AppText>{change.title}</AppText><AppText>Current: {dateLabel(change.from)}</AppText><AppText>Proposed: {dateLabel(change.to)} (+{proposal.shiftDays} days)</AppText></View>)}
            {proposal.undatedCount > 0 && <AppText>{proposal.undatedCount} impacted tasks have no valid due date and will not be changed.</AppText>}
            {!proposal.changes.length && <AppText>No dated downstream tasks require rescheduling.</AppText>}
            <AppText>Current project deadline: {dateLabel(proposal.deadline)}</AppText>
            {proposal.beyondDeadlineDays > 0 && <>
              <AppText>Proposed task dates extend {proposal.beyondDeadlineDays} days beyond the current project deadline.</AppText>
              <Pressable testID="keep-deadline" accessibilityRole="radio" accessibilityState={{ checked: !extend }} onPress={() => setExtend(false)} style={styles.button}><AppText>{!extend ? '✓ ' : '○ '}Keep Current Project Deadline</AppText></Pressable>
              <Pressable testID="extend-deadline" accessibilityRole="radio" accessibilityState={{ checked: extend }} onPress={() => setExtend(true)} style={styles.button}><AppText>{extend ? '✓ ' : '○ '}Extend Project Deadline to {dateLabel(proposal.proposedDeadline)}</AppText></Pressable>
            </>}
            {proposal.changes.length > 0 && <Pressable testID="apply-schedule" accessibilityRole="button" onPress={() => { const failure = applyReschedule(proposal, extend); if (failure) { setError(failure); setProposal(null); setExtend(false); } else close(); }} style={[styles.confirm, { backgroundColor: colors.action }]}><AppText style={{ color: colors.primaryForeground }}>Apply Schedule Changes</AppText></Pressable>}
          </View>}
        </>}
        {!!error && <AppText accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</AppText>}
        <Pressable testID="cancel-workflow" accessibilityRole="button" onPress={close} style={styles.button}><AppText>Cancel</AppText></Pressable>
      </ScrollView></View></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  summary: { padding: 16, borderRadius: 16, gap: 8 }, heading: { fontFamily: 'Inter_700Bold', fontSize: 18 }, taskTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  taskActions: { paddingBottom: 8 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, button: { minHeight: 48, paddingHorizontal: 8, justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', padding: 20, justifyContent: 'center' }, dialog: { width: '100%', maxWidth: 480, maxHeight: '85%', alignSelf: 'center', borderRadius: 20, padding: 20 },
  option: { minHeight: 48, paddingVertical: 10, gap: 5, borderBottomWidth: StyleSheet.hairlineWidth }, input: { borderWidth: 1, borderRadius: 12, minHeight: 48, padding: 12 },
  confirm: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: 12 },
});
