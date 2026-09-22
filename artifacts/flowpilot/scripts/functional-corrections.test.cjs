const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { host, plain, loadSource } = require('./flow-test-host.cjs');
const personal = loadSource('lib/personal-tasks.ts');
const dates = loadSource('lib/task-utils.ts');
const sync = loadSource('lib/template-sync.ts');
const dashboard = loadSource('lib/dashboard.ts');
const management = loadSource('lib/project-management.ts');
const backup = loadSource('lib/data-backup.ts');
const workflow = loadSource('lib/workflow-intelligence.ts');
const settings = loadSource('lib/settings.ts');
const now = new Date(2026, 8, 22, 10, 0);
const input = (extra = {}) => ({ ...plain(personal.PERSONAL_DEFAULTS), title: 'Call daughter', ...extra });
const occurrence = (extra = {}) => ({ ...input(), id: 'personal', seriesId: 'personal', occurrence: 0, status: 'todo', createdAt: now.toISOString(), ...extra });
const step = (id, extra = {}) => ({ id, title: id, description: 'Description ' + id, duration: 1, ...extra });
const template = { id: 'master', name: 'CII SELF', category: 'Custom', description: '', color: '#fff', steps: [step('a'), step('b'), step('c')] };
const project = (id = 'p', extra = {}) => ({ id, name: id, client: 'Client', summary: 'Keep', templateId: 'master', startDate: new Date(2026, 8, 1).toISOString(), projectStartDate: '2026-09-01', dueDate: '2026-12-31', reminderFrequency: 'Daily', remindersEnabled: false, status: 'Active', ...extra });
function data() {
  const projects = [project('p'), project('q'), project('unrelated', { templateId: 'other' })];
  return { projects, templates: [plain(template), { ...plain(template), id: 'other' }],
    tasks: plain(projects.flatMap((p) => sync.generatedTasks(p, template))), personalTasks: [occurrence()], settings: plain(settings.DEFAULT_SETTINGS) };
}
const owned = (value, id = 'p') => value.tasks.filter((task) => task.projectId === id).sort((a, b) => a.order - b.order);
const replacement = (steps) => ({ ...plain(template), steps });

for (const [label, fields] of [['date only', { dueDate: '2026-09-25' }], ['time only', { dueTime: '20:00' }], ['date and time', { dueDate: '2026-09-25', dueTime: '20:00' }], ['neither', {}], ['legacy minutes', { dueTime: '20:17' }], ['undated daily time', { dueTime: '20:00', recurrence: { frequency: 'Daily' } }], ['undated daily no time', { recurrence: { frequency: 'Daily' } }]]) {
  test('personal validation and persistence: ' + label, async () => {
    assert.equal(personal.validatePersonal(input(fields), now), null);
    const storage = { value: JSON.stringify({ projects: [], tasks: [], templates: [] }) }, render = host(storage);
    let flow = await render(); assert.equal((await flow.savePersonalTask(input(fields))).ok, true); flow = await render();
    const saved = plain(flow.personalTasks[0]); assert.equal(saved.dueDate, fields.dueDate); assert.equal(saved.dueTime, fields.dueTime);
    assert.deepEqual(plain((await host(storage)()).personalTasks), [saved]);
  });
}
test('time picker has exactly 48 unique half-hour slots including both day boundaries', () => {
  assert.equal(personal.TIME_OPTIONS.length, 48); assert.equal(new Set(personal.TIME_OPTIONS).size, 48);
  assert.equal(personal.TIME_OPTIONS[0], '00:00'); assert.equal(personal.TIME_OPTIONS[47], '23:30');
  personal.TIME_OPTIONS.forEach((time, index) => assert.equal(Number(time.slice(0, 2)) * 60 + Number(time.slice(3)), index * 30));
});
for (const frequency of ['Weekly', 'Monthly']) test(frequency + ' keeps a required date anchor independently of time', () => {
  assert.match(personal.validatePersonal(input({ dueTime: '20:00', recurrence: { frequency } }), now), /anchor date/);
  assert.equal(personal.validatePersonal(input({ dueDate: '2026-09-25', recurrence: { frequency } }), now), null);
});
test('time-only task is Today on successive local days, never stored or historically overdue', () => {
  const task = occurrence({ dueTime: '18:00' }), before = JSON.stringify(task);
  for (const day of ['2026-09-22', '2026-09-23', '2027-01-01']) {
    const groups = dashboard.dashboardGroups([], [task], day); assert.equal(groups.today.length, 1); assert.equal(groups.overdue.length, 0);
  }
  assert.equal(JSON.stringify(task), before); assert.equal(task.dueDate, undefined);
});
test('mixed To-do ordering puts overdue, dated/time-only today, future, unscheduled in order', () => {
  const tasks = [occurrence({ id: 'unscheduled' }), occurrence({ id: 'future', dueDate: '2026-09-24' }), occurrence({ id: 'time', dueTime: '12:00' }), occurrence({ id: 'today', dueDate: '2026-09-22', dueTime: '11:00' }), occurrence({ id: 'overdue', dueDate: '2026-09-21' })];
  assert.deepEqual(plain(personal.todoEntries([], tasks, 'All', personal.TODO_DEFAULTS, now).map((entry) => entry.task.id)), ['overdue', 'today', 'time', 'future', 'unscheduled']);
  assert.deepEqual(plain(dashboard.dashboardGroups([], tasks, '2026-09-22').today.map((entry) => entry.task.id)), ['today', 'time']);
});
for (const dueTime of [undefined, '20:00']) test('undated daily completion creates exactly one tomorrow occurrence: ' + (dueTime ?? 'no time'), () => {
  const task = occurrence({ dueTime, recurrence: { frequency: 'Daily' } });
  const next = personal.completePersonal([task], task.id, now);
  assert.equal(next.length, 2); assert.equal(next[0].completedAt, now.toISOString()); assert.equal(next[1].dueDate, undefined);
  assert.equal(next[1].availableFrom, '2026-09-23'); assert.equal(next[1].dueTime, dueTime);
  assert.equal(dashboard.dashboardGroups([], next, '2026-09-22').today.length, 0);
  assert.equal(dashboard.dashboardGroups([], next, '2026-09-23').today.length, 1);
  assert.equal(dashboard.dashboardGroups([], next, '2026-09-28').today.length, 1);
  assert.equal(personal.completePersonal(next, task.id, now).length, 2);
  const reopened = next.map((item) => item.id === task.id ? { ...item, status: 'todo', completedAt: undefined } : item);
  assert.equal(personal.completePersonal(reopened, task.id, now).length, 2);
});
for (const reminder of personal.REMINDERS.filter((value) => value !== 'None')) test('undated reminder is strictly future and stable: ' + reminder, () => {
  for (const hour of [0, 10, 20, 23]) {
    const at = new Date(2026, 8, 22, hour, 45), value = input({ dueTime: '20:00', reminder, recurrence: { frequency: 'Daily' } });
    const result = personal.personalReminderAt(value, at); assert.ok(result > at);
    assert.equal(result.toISOString(), personal.personalReminderAt(value, at).toISOString()); assert.equal(value.dueDate, undefined);
    assert.equal(personal.validatePersonal(value, at), null);
  }
});
test('a no-time reminder is rejected clearly while daily no-time recurrence stays valid', () => {
  assert.match(personal.validatePersonal(input({ reminder: 'At due time', recurrence: { frequency: 'Daily' } }), now), /time/);
});
test('past unchanged reminder does not prevent editing title or notes; new past schedule still rejected', () => {
  const old = occurrence({ dueDate: '2020-01-01', dueTime: '12:00', reminder: 'At due time' });
  assert.equal(personal.validatePersonal({ ...old, title: 'Changed', notes: 'Note' }, now, false, old), null);
  assert.match(personal.validatePersonal({ ...old, dueTime: '13:00' }, now, false, old), /passed/);
});
for (const status of ['todo', 'done']) test('all personal fields edit in place with ID and completion preserved: ' + status, async () => {
  const task = occurrence({ status, completedAt: status === 'done' ? now.toISOString() : undefined, dueDate: '2026-09-25', dueTime: '20:17' });
  const storage = { value: JSON.stringify({ projects: [], tasks: [], templates: [], personalTasks: [task] }) }, render = host(storage);
  let flow = await render();
  const changes = { ...task, title: 'Changed', dueDate: undefined, dueTime: '21:30', notes: 'Edited', priority: 'Critical', reminder: 'At due time', recurrence: { frequency: 'Daily' } };
  assert.equal((await flow.savePersonalTask(changes, task.id)).ok, true); flow = await render();
  assert.equal(flow.personalTasks.length, 1); assert.equal(flow.personalTasks[0].id, task.id);
  assert.equal(flow.personalTasks[0].status, status); assert.equal(flow.personalTasks[0].completedAt, task.completedAt);
  for (const key of ['title', 'dueDate', 'dueTime', 'notes', 'priority', 'reminder']) assert.equal(flow.personalTasks[0][key], changes[key]);
  assert.deepEqual(plain((await host(storage)()).personalTasks), plain(flow.personalTasks));
});

test('legacy identity migration uses exact source IDs and persists idempotently', async () => {
  const source = data(); source.templates[0].steps.push({ title: 'No ID', description: '', duration: 2 });
  source.tasks = [ { ...owned(source)[0], id: 'a', sourceTemplateStepId: undefined }, { ...owned(source)[1], id: 'unknown', sourceTemplateStepId: undefined }, { ...owned(source)[2], id: 'c', isManual: true, sourceTemplateStepId: undefined } ];
  source.projects.push(project('missing', { templateId: undefined }));
  const before = JSON.stringify(source), migrated = sync.normalizeTemplateLinks(source);
  assert.equal(JSON.stringify(source), before); assert.equal(migrated.tasks[0].sourceTemplateStepId, 'a');
  assert.equal(migrated.tasks[1].sourceTemplateStepId, undefined); assert.equal(migrated.tasks[2].sourceTemplateStepId, undefined);
  assert.equal(migrated.projects.at(-1).templateId, undefined); assert.ok(migrated.templates[0].steps.at(-1).id);
  assert.deepEqual(plain(sync.normalizeTemplateLinks(migrated)), plain(migrated));
  const storage = { value: before }; let flow = await host(storage)(); const first = plain({ templates: flow.templates, tasks: flow.tasks, projects: flow.projects });
  flow = await host(storage)(); assert.deepEqual(plain({ templates: flow.templates, tasks: flow.tasks, projects: flow.projects }), first);
});
test('normalization repairs missing/duplicate step IDs without changing valid IDs or names', () => {
  const value = replacement([step('a'), step('a'), step(''), step('step:master:2')]);
  const result = sync.normalizeTemplate(value); assert.equal(new Set(result.steps.map((s) => s.id)).size, 4);
  assert.equal(result.steps[0].id, 'a'); assert.equal(result.steps[3].id, 'step:master:2');
  assert.deepEqual(plain(sync.normalizeTemplate(result)), plain(result));
});
test('new project tasks own unique IDs distinct from stable source steps', async () => {
  const storage = {}, render = host(storage); let flow = await render(); const master = flow.templates[0];
  await flow.addProject({ name: 'New', client: 'Client', summary: '', templateId: master.id, projectStartDate: '2026-09-22', dueDate: '2026-12-31', reminderFrequency: 'Daily' }); flow = await render();
  const tasks = owned(flow, flow.projects[0].id); assert.equal(tasks.length, master.steps.length);
  tasks.forEach((task, index) => { assert.notEqual(task.id, master.steps[index].id); assert.equal(task.sourceTemplateStepId, master.steps[index].id); });
  assert.equal(new Set(flow.tasks.map((task) => task.id)).size, flow.tasks.length);
  flow.addManualTask(flow.projects[0].id, { title: 'Independent', dueDate: '2026-12-31' }); flow = await render();
  assert.equal(flow.tasks.find((task) => task.isManual).sourceTemplateStepId, undefined);
});
test('master add updates every linked project once, preserves unrelated and personal records and project dates', () => {
  const source = data(), before = JSON.stringify(source), master = replacement([...template.steps, step('d', { duration: 4 })]);
  const result = sync.synchronizeTemplate(source, master);
  for (const id of ['p', 'q']) {
    const tasks = owned(result, id); assert.equal(tasks.length, 4); assert.equal(tasks[3].sourceTemplateStepId, 'd');
    assert.equal(dates.localDateValue(dates.readDate(tasks[3].dueDate)), '2026-09-08'); assert.equal(tasks[3].dependsOn, undefined);
    assert.deepEqual(plain(tasks.slice(0, 3)), plain(owned(source, id)));
  }
  assert.deepEqual(plain(result.projects), source.projects); assert.deepEqual(plain(owned(result, 'unrelated')), plain(owned(source, 'unrelated')));
  assert.equal(JSON.stringify(source), before); assert.deepEqual(plain(sync.synchronizeTemplate(result, master)), plain(result));
});
for (const change of ['rename', 'reorder', 'duration', 'description']) test('master ' + change + ' preserves task IDs, dates, history and dependencies', () => {
  const source = data(); source.tasks[0] = { ...source.tasks[0], status: 'done', completedAt: '2022-01-01T12:00:00.000Z' };
  source.tasks[1] = { ...source.tasks[1], dueDate: '2040-06-30', dependsOn: [source.tasks[0].id], customHistory: { keep: true } };
  const steps = template.steps.map((s) => ({ ...s, ...(change === 'rename' ? { title: s.title + ' changed' } : change === 'duration' ? { duration: 99 } : change === 'description' ? { description: 'Updated' } : {}) }));
  if (change === 'reorder') steps.reverse();
  const result = sync.synchronizeTemplate(source, replacement(steps));
  for (const old of owned(source)) {
    const task = result.tasks.find((item) => item.id === old.id); assert.ok(task);
    for (const key of ['id', 'status', 'completedAt', 'dueDate']) assert.equal(task[key], old[key]);
    assert.deepEqual(plain(task.dependsOn ?? []), plain(old.dependsOn ?? []));
    assert.deepEqual(plain(task.customHistory ?? {}), plain(old.customHistory ?? {}));
    assert.equal(task[change === 'rename' ? 'title' : change === 'duration' ? 'duration' : 'description'], steps.find((s) => s.id === task.sourceTemplateStepId)[change === 'rename' ? 'title' : change === 'duration' ? 'duration' : 'description']);
  }
  assert.deepEqual(plain(owned(result).map((task) => task.sourceTemplateStepId)), steps.map((s) => s.id));
  assert.deepEqual(result.projects, source.projects); assert.equal(workflow.getTaskWorkflowState(result.tasks.find((task) => task.id === source.tasks[1].id), result.tasks), 'Ready');
});
test('manual same-name tasks retain fields and relative order after master steps', () => {
  const source = data(); const manual = [ { ...source.tasks[0], id: 'm1', isManual: true, sourceTemplateStepId: undefined, order: 1 }, { ...source.tasks[0], id: 'm2', isManual: true, sourceTemplateStepId: undefined, order: 2 } ];
  source.tasks.push(...manual);
  const result = sync.synchronizeTemplate(source, replacement([...template.steps].reverse().map((s) => ({ ...s, title: 'Renamed' }))));
  assert.deepEqual(plain(owned(result).slice(-2).map((task) => task.id)), ['m1', 'm2']);
  for (const old of manual) { const { order, ...task } = result.tasks.find((task) => task.id === old.id); const { order: ignored, ...expected } = old; assert.deepEqual(plain(task), plain(expected)); }
});
for (const kind of ['untouched', 'completed', 'timestamp', 'rescheduled', 'dependency child', 'dependency parent', 'custom title']) test('deleted master step safeguard: ' + kind, () => {
  const source = data(), old = source.tasks[0];
  if (kind === 'completed') { old.status = 'done'; old.completedAt = '2022-01-01T12:00:00.000Z'; }
  if (kind === 'timestamp') old.completedAt = '2022-01-01T12:00:00.000Z';
  if (kind === 'rescheduled') old.dueDate = '2040-01-01';
  if (kind === 'dependency child') old.dependsOn = [source.tasks[1].id];
  if (kind === 'dependency parent') source.tasks[1].dependsOn = [old.id];
  if (kind === 'custom title') old.title = 'Custom';
  const result = sync.synchronizeTemplate(source, replacement(template.steps.slice(1)));
  const retained = result.tasks.find((task) => task.id === old.id);
  if (kind === 'untouched') assert.equal(retained, undefined);
  else { assert.ok(retained); assert.equal(retained.templateDetached, true); assert.equal(retained.sourceTemplateStepId, undefined);
    for (const key of ['id', 'title', 'status', 'completedAt', 'dueDate']) assert.equal(retained[key], old[key]); }
  for (const task of result.tasks) for (const id of task.dependsOn ?? []) assert.ok(result.tasks.some((other) => other.id === id && other.projectId === task.projectId));
  assert.deepEqual(result.projects, source.projects); assert.ok(result.tasks.some((task) => task.id === source.tasks[1].id));
});
test('whole-template deletion safely detaches projects without losing any task history', () => {
  const source = data(); source.tasks[0].completedAt = now.toISOString(); source.tasks[0].status = 'done'; source.tasks[1].dependsOn = [source.tasks[0].id];
  const result = sync.detachTemplate(source, 'master'); assert.equal(result.projects.length, source.projects.length); assert.equal(result.tasks.length, source.tasks.length);
  assert.equal(result.projects[0].templateId, ''); assert.equal(result.projects[2].templateId, 'other');
  source.tasks.forEach((old) => { const task = result.tasks.find((task) => task.id === old.id); const { sourceTemplateStepId, ...expected } = old;
    assert.deepEqual(plain(task), plain(old.projectId === 'unrelated' ? old : { ...expected, templateDetached: true })); });
  assert.deepEqual(plain(sync.synchronizeTemplate(result, template)), plain(result));
});
for (const mode of ['auto', 'legacy auto', 'manual', 'legacy manual', 'archived auto']) test('sync respects completion provenance: ' + mode, () => {
  const source = data(); source.projects[0].status = 'Completed';
  if (mode === 'auto' || mode === 'archived auto') source.projects[0].completionSource = 'auto';
  if (mode === 'manual') source.projects[0].completionSource = 'manual';
  if (mode === 'archived auto') source.projects[0].archived = true;
  source.tasks = source.tasks.map((task) => task.projectId === 'p' ? { ...task, status: mode === 'legacy manual' ? 'todo' : 'done' } : task);
  const result = sync.synchronizeTemplate(source, replacement([...template.steps, step('d')]));
  assert.equal(result.projects[0].status, mode.includes('manual') ? 'Completed' : 'Active');
  assert.equal(result.projects[0].archived, source.projects[0].archived);
  if (mode === 'archived auto') assert.ok(management.normalProjectTasks(result.tasks, result.projects).every((task) => task.projectId !== 'p'));
});
test('eight completed tasks plus new work gives 89 percent and derived attention health', () => {
  const master = replacement(Array.from({ length: 8 }, (_, i) => step(String(i))));
  const p = project('p', { status: 'Completed', completionSource: 'auto' });
  const source = { projects: [p], templates: [master], tasks: sync.generatedTasks(p, master).map((task) => ({ ...task, status: 'done' })) };
  const result = sync.synchronizeTemplate(source, { ...master, steps: [...master.steps, step('new')] });
  assert.equal(management.projectProgress('p', result.tasks).percent, 89);
  assert.equal(management.projectHealth(result.projects[0], result.tasks, '2026-09-22'), 'Attention Needed');
  assert.equal(result.projects[0].health, undefined);
});
test('provider sync persists coherent template/projects/tasks through reload and repeated same-render saves', async () => {
  const source = data(), storage = { value: JSON.stringify(source) }, render = host(storage); let flow = await render();
  const master = replacement([...template.steps, step('d')]); flow.updateTemplate('master', master); flow.updateTemplate('master', master); flow = await render();
  assert.equal(owned(flow).length, 4); assert.equal(owned(flow, 'q').length, 4); assert.deepEqual(plain(flow.personalTasks), source.personalTasks);
  const persisted = JSON.parse(storage.value); assert.equal(persisted.templates[0].steps.length, 4); assert.equal(owned(persisted).length, 4);
  const reloaded = await host(storage)(); assert.deepEqual(plain(reloaded.tasks), plain(flow.tasks));
  flow.deleteTemplate('master'); flow = await render(); assert.equal(flow.projects[0].templateId, ''); assert.equal(owned(flow).length, 4);
});
test('template rename keeps stable IDs and linkage', () => {
  const source = data(), result = sync.synchronizeTemplate(source, { ...template, name: 'New name' });
  assert.equal(result.templates[0].id, template.id); assert.equal(result.projects[0].templateId, template.id); assert.deepEqual(plain(result.tasks), source.tasks);
});
test('backup v1 roundtrip retains Batch 10 metadata and date-independent personal recurrence', () => {
  const source = data(); source.projects[0].completionSource = 'manual'; source.tasks[0].templateDetached = true; delete source.tasks[0].sourceTemplateStepId;
  source.personalTasks = [occurrence({ dueTime: '20:00', recurrence: { frequency: 'Daily' }, availableFrom: '2026-09-23', reminder: 'At due time' })];
  const result = backup.parseBackup(backup.serializeBackup(source)); assert.equal(result.version, 1); assert.deepEqual(plain(result.data), source);
});
for (const [field, value] of [['sourceTemplateStepId', ''], ['templateDetached', 'yes']]) test('backup rejects invalid task metadata ' + field, () => {
  const source = data(); source.tasks[0][field] = value; assert.throws(() => backup.parseBackup(backup.serializeBackup(source)));
});
test('backup rejects manual source linkage and invalid recurrence availability/provenance', () => {
  const source = data(); source.tasks[0].isManual = true; assert.throws(() => backup.validateData(source));
  delete source.tasks[0].isManual; source.projects[0].completionSource = 'invalid'; assert.throws(() => backup.validateData(source));
  delete source.projects[0].completionSource; source.personalTasks[0].availableFrom = '2026-02-30'; assert.throws(() => backup.validateData(source));
});
test('old v1 backup with missing linkage remains valid and unknown project stays unlinked', () => {
  const source = data(); delete source.projects[0].templateId; source.tasks.forEach((task) => delete task.sourceTemplateStepId);
  const parsed = backup.parseBackup(backup.serializeBackup(source)); assert.deepEqual(plain(parsed.data), source);
  const normalized = sync.normalizeTemplateLinks(parsed.data); assert.equal(normalized.projects[0].templateId, undefined);
  assert.ok(owned(normalized).every((task) => !task.sourceTemplateStepId));
});
test('CSV exports time-only and undated daily records without fabricating dates', () => {
  const source = data(); source.personalTasks = [occurrence({ dueTime: '20:00', recurrence: { frequency: 'Daily' } })];
  const api = loadSource('lib/data-export.ts'); const csv = api.exportCsv(source);
  assert.match(csv, /20:00/); assert.match(csv, /Daily/); assert.equal(source.personalTasks[0].dueDate, undefined);
});

function walk(node, predicate) {
  if (!node) return []; if (Array.isArray(node)) return node.flatMap((item) => walk(item, predicate));
  if (typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...walk(node.props?.children, predicate)];
}
const find = (tree, id) => walk(tree, (node) => node.props?.testID === id)[0];
function ui(file, flow, params = {}, options = {}) {
  const values = []; let cursor = 0; const navigation = [], colors = loadSource('constants/colors.ts').default[options.theme ?? 'light'];
  const hooks = { useState(initial) { const index = cursor++; if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial; return [values[index], (value) => { values[index] = typeof value === 'function' ? value(values[index]) : value; }]; }, useRef(initial) { const index = cursor++; if (!(index in values)) values[index] = { current: initial }; return values[index]; }, useMemo: (fn) => fn(), useEffect() {} };
  const module = loadSource(file, { react: hooks, 'expo-router': { router: { push: (value) => navigation.push(['push', value]), replace: (value) => navigation.push(['replace', value]), dismissTo: (value) => navigation.push(['dismissTo', value]), back: () => navigation.push(['back']) }, useLocalSearchParams: () => params },
    'react-native': { Platform: { OS: 'android' }, StyleSheet: { create: (s) => s, hairlineWidth: 1 }, View: 'View', Modal: 'Modal', TextInput: 'TextInput', Pressable: 'Pressable', ScrollView: 'ScrollView', KeyboardAvoidingView: 'View' },
    '@expo/vector-icons': { Feather: 'Feather' }, 'expo-haptics': { notificationAsync: async () => { if (options.hapticFailure) throw Error('haptic'); }, NotificationFeedbackType: { Success: 'success' } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }, '@/hooks/useColors': { useColors: () => colors },
    '@/components/AppText': { AppText: 'Text' }, '@/components/ProjectDateField': { ProjectDateField: 'DateField' },
    '@/context/FlowContext': { useFlow: () => flow, daysRemaining: dates.calendarDaysUntil },
  });
  return { navigation, render(props) { cursor = 0; let tree = (module.default ?? module.PersonalTaskRow)(props); if (typeof tree?.type === 'function') tree = tree.type(tree.props); return tree; } };
}
for (const theme of ['light', 'dark']) test('personal time selector is themed, accessible, independent and preserves legacy minutes: ' + theme, () => {
  const task = occurrence({ dueDate: '2026-09-25', dueTime: '20:17' });
  const h = ui('app/personal-task.tsx', { hydrated: true, personalTasks: [task] }, { id: task.id }, { theme }); let tree = h.render();
  assert.match(find(tree, 'personal-time').props.accessibilityLabel, /20:17/);
  walk(tree, (n) => n.type === 'DateField')[0].props.onChange(''); tree = h.render(); assert.match(find(tree, 'personal-time').props.accessibilityLabel, /20:17/);
  find(tree, 'personal-time').props.onPress(); tree = h.render(); assert.equal(walk(tree, (n) => n.type === 'Modal' && n.props.visible).length, 1);
  const options = walk(tree, (n) => n.props?.testID?.startsWith('time-option-')); assert.equal(options.length, 49);
  options.forEach((n) => assert.equal(n.props.accessibilityRole, 'radio'));
  find(tree, 'time-option-20:30').props.onPress(); tree = h.render(); assert.match(find(tree, 'personal-time').props.accessibilityLabel, /20:30/);
  walk(tree, (n) => n.type === 'DateField')[0].props.onChange('2026-09-28'); tree = h.render(); find(tree, 'time-option-No Time').props.onPress(); tree = h.render();
  assert.match(find(tree, 'personal-time').props.accessibilityLabel, /No Time/); assert.equal(walk(tree, (n) => n.type === 'DateField')[0].props.value, '2026-09-28');
});
test('personal edit form prefills every field and saves same ID then closes; cancel writes nothing', async () => {
  const task = occurrence({ dueDate: '2026-09-25', dueTime: '20:17', priority: 'High', notes: 'Keep', reminder: 'None', recurrence: { frequency: 'Daily' } }); let saved;
  const h = ui('app/personal-task.tsx', { hydrated: true, personalTasks: [task], savePersonalTask: async (value, id) => { saved = { value, id }; return { ok: true }; } }, { id: task.id });
  let tree = h.render(); assert.equal(find(tree, 'personal-title').props.value, task.title); assert.equal(find(tree, 'personal-notes').props.value, task.notes);
  assert.equal(walk(tree, (n) => n.type === 'DateField')[0].props.value, task.dueDate);
  for (const [label, value] of [['PRIORITY', task.priority], ['REMINDER', task.reminder], ['REPEAT', 'Daily']]) assert.equal(walk(tree, (n) => n.props?.label === label)[0].props.selected, value);
  walk(tree, (n) => n.props?.accessibilityLabel === 'Back')[0].props.onPress(); assert.equal(saved, undefined);
  find(tree, 'personal-title').props.onChangeText('Changed'); tree = h.render(); await find(tree, 'save-personal-task').props.onPress();
  assert.equal(saved.id, task.id); assert.equal(saved.value.title, 'Changed'); assert.deepEqual(h.navigation.at(-1), ['replace', '/tasks']);
});
test('shared personal row has separate edit and completion actions for Home and To-do', () => {
  const task = occurrence({ dueTime: '20:00' }); let completed;
  const h = ui('components/PersonalTaskRow.tsx', { completePersonalTask: (id) => { completed = id; } }); const tree = h.render({ task });
  find(tree, 'edit-personal-personal').props.onPress(); assert.equal(completed, undefined); assert.equal(h.navigation[0][1].params.id, task.id);
  find(tree, 'personal-complete-personal').props.onPress(); assert.equal(completed, task.id);
  const fs = require('node:fs'), path = require('node:path');
  for (const screen of ['index.tsx', 'tasks.tsx']) assert.match(fs.readFileSync(path.join(__dirname, '../app/(tabs)', screen), 'utf8'), /PersonalTaskRow/);
});
function readyProject(h) { let tree = h.render(); for (const label of ['PROJECT NAME', 'CLIENT OR TEAM']) walk(tree, (n) => n.props?.label === label)[0].props.onChangeText('Test'); return h.render(); }
test('project success closes to Projects once, rapid double tap is guarded even before rerender', async () => {
  let calls = 0, release; const h = ui('app/new-project.tsx', { templates: [template], addProject: () => { calls++; return new Promise((resolve) => { release = resolve; }); } }, { templateId: 'master' });
  const tree = readyProject(h), press = find(tree, 'save-project').props.onPress; const pending = press(); await press(); assert.equal(calls, 1);
  assert.equal(find(h.render(), 'save-project').props.disabled, true); release(true); await pending;
  assert.deepEqual(h.navigation, [['dismissTo', '/projects']]); await press(); assert.equal(calls, 1);
});
for (const failure of ['false', 'throw']) test('project creation ' + failure + ' stays on form and allows retry', async () => {
  let calls = 0; const h = ui('app/new-project.tsx', { templates: [template], addProject: async () => { calls++; if (calls === 1) { if (failure === 'throw') throw Error('failed'); return false; } return true; } });
  await find(readyProject(h), 'save-project').props.onPress(); assert.equal(h.navigation.length, 0);
  let tree = h.render(); assert.equal(find(tree, 'save-project').props.disabled, false); assert.ok(walk(tree, (n) => n.props?.accessibilityRole === 'alert')[0].props.children);
  await find(tree, 'save-project').props.onPress(); assert.equal(calls, 2); assert.deepEqual(h.navigation, [['dismissTo', '/projects']]);
});
test('haptic failure cannot trap a successfully created project on its form', async () => {
  const h = ui('app/new-project.tsx', { templates: [template], addProject: async () => true }, {}, { hapticFailure: true });
  await find(readyProject(h), 'save-project').props.onPress(); assert.deepEqual(h.navigation, [['dismissTo', '/projects']]);
});
test('native reminder failure still returns successful creation exactly once', async () => {
  const storage = {}, render = host(storage, { mocks: { '@/lib/notifications': { syncProjectReminders: async () => undefined, scheduleProjectReminders: async () => { throw Error('native unavailable'); } } } }); let flow = await render();
  const before = flow.projects.length; assert.equal(await flow.addProject({ name: 'New', client: 'Client', summary: '', templateId: flow.templates[0].id, dueDate: '2030-01-01', reminderFrequency: 'Daily' }), true);
  flow = await render(); assert.equal(flow.projects.length, before + 1); assert.match(flow.personalReminderNotice, /Project created/);
});
test('local time-only midnight and DST behavior in three timezones', () => {
  const script = `const assert=require('node:assert/strict');const {loadSource}=require('./artifacts/flowpilot/scripts/flow-test-host.cjs');const p=loadSource('lib/personal-tasks.ts');const d=loadSource('lib/dashboard.ts');const task={...p.PERSONAL_DEFAULTS,id:'t',seriesId:'t',occurrence:0,status:'todo',dueTime:'20:00',recurrence:{frequency:'Daily'}};const now=new Date(2026,2,7,23,59);const next=p.completePersonal([task],'t',now);assert.equal(next[1].availableFrom,'2026-03-08');assert.equal(next[1].dueDate,undefined);assert.equal(d.dashboardGroups([],next,'2026-03-08').today.length,1);const reminder=p.personalReminderAt({...task,dueTime:'02:30',reminder:'At due time'},new Date(2026,2,8,0));assert.ok(reminder>new Date(2026,2,8,0));assert.equal(reminder.getHours(),2);`;
  for (const TZ of ['Asia/Kolkata', 'America/New_York', 'Europe/London']) { const result = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); }
});

function reminders() {
  const scheduled = new Map(), calls = [], canceled = [];
  const api = loadSource('lib/personal-notifications.ts', {
    'react-native': { Platform: { OS: 'android' } }, '@/lib/notifications': { requestReminderPermission: async () => true },
    'expo-notifications': { getAllScheduledNotificationsAsync: async () => [...scheduled.values()], getPermissionsAsync: async () => ({ granted: true }),
      cancelScheduledNotificationAsync: async (id) => { canceled.push(id); scheduled.delete(id); },
      scheduleNotificationAsync: async (item) => { calls.push(item); scheduled.set(item.identifier, item); return item.identifier; }, SchedulableTriggerInputTypes: { DATE: 'date' } },
  });
  return { ...api, scheduled, calls, canceled };
}
for (const frequency of ['None', 'Daily']) test('time-only reminders deduplicate, reconcile edits, and cancel: ' + frequency, async () => {
  const h = reminders(), task = occurrence({ dueTime: '20:00', reminder: 'At due time', recurrence: { frequency } });
  await h.syncPersonalReminders([task]); await h.syncPersonalReminders([task]); assert.equal(h.calls.length, 1);
  assert.ok(h.calls[0].trigger.date > new Date()); assert.equal(h.scheduled.size, 1);
  await h.syncPersonalReminders([{ ...task, notes: 'Only notes' }]); assert.equal(h.calls.length, 1);
  const renamed = { ...task, title: 'New title' }; await h.syncPersonalReminders([renamed]); assert.equal(h.calls.length, 2); assert.equal(h.scheduled.size, 1);
  const edited = { ...renamed, dueTime: '21:30' }; await h.syncPersonalReminders([edited]); assert.equal(h.calls.length, 3); assert.equal(h.canceled.length, 2); assert.equal(h.scheduled.size, 1);
  await h.syncPersonalReminders([{ ...edited, reminder: 'None' }]); assert.equal(h.scheduled.size, 0);
  await h.syncPersonalReminders([edited]); await h.syncPersonalReminders([{ ...edited, status: 'done' }]); assert.equal(h.scheduled.size, 0);
});
test('daily completion replaces old reminder with one successor reminder and preserves future availability', async () => {
  const h = reminders(), task = occurrence({ dueTime: '20:00', reminder: 'At due time', recurrence: { frequency: 'Daily' } });
  await h.syncPersonalReminders([task]); const next = personal.completePersonal([task], task.id, new Date());
  await h.syncPersonalReminders(next); await h.syncPersonalReminders(next);
  assert.equal(h.scheduled.size, 1); assert.ok(h.canceled.includes('gulabani-personal-' + task.id));
  assert.equal([...h.scheduled.keys()][0], 'gulabani-personal-' + next[1].id);
  const edited = personal.personalFields({ ...next[1], notes: 'Edit next occurrence' }, next[1]); assert.equal(edited.availableFrom, next[1].availableFrom);
  const stopped = personal.personalFields({ ...next[1], recurrence: { frequency: 'None' } }, next[1]); assert.equal(stopped.availableFrom, undefined);
});
test('overlapping time-only reminder edits finish in latest state without duplicate IDs', async () => {
  const h = reminders(), task = occurrence({ dueTime: '20:00', reminder: 'At due time' });
  await Promise.all([h.syncPersonalReminders([task]), h.syncPersonalReminders([{ ...task, dueTime: '21:30' }]), h.syncPersonalReminders([])]);
  assert.equal(h.scheduled.size, 0);
});
test('unknown historical metadata prevents automatic master-step deletion', () => {
  const source = data(); source.tasks[0].rescheduleHistory = [{ old: '2026-01-01' }];
  const result = sync.synchronizeTemplate(source, replacement(template.steps.slice(1))), retained = result.tasks.find((task) => task.id === source.tasks[0].id);
  assert.equal(retained.templateDetached, true); assert.deepEqual(retained.rescheduleHistory, source.tasks[0].rescheduleHistory);
});
test('detached completed history survives unrelated workflow completion and reopening', async () => {
  const source = data(); source.tasks[0].status = 'done'; source.tasks[0].completedAt = '2022-01-01T12:00:00.000Z';
  const storage = { value: JSON.stringify(source) }, render = host(storage); let flow = await render();
  flow.updateTemplate('master', replacement(template.steps.slice(1))); flow = await render(); const detached = plain(flow.tasks.find((task) => task.id === source.tasks[0].id));
  flow.toggleTask(source.tasks[1].id, 'p'); flow = await render(); flow.toggleTask(source.tasks[1].id, 'p'); flow = await render();
  assert.deepEqual(plain(flow.tasks.find((task) => task.id === detached.id)), detached);
});
test('project with no tasks receives new template structure and repeated saves remain idempotent', () => {
  const source = data(); source.tasks = source.tasks.filter((task) => task.projectId !== 'p');
  const first = sync.synchronizeTemplate(source, template); assert.equal(owned(first).length, 3);
  assert.deepEqual(plain(sync.synchronizeTemplate(first, template)), plain(first));
});
test('failed sync calculation makes no partial template/project mutations', async () => {
  const storage = { value: JSON.stringify(data()) }, render = host(storage); let flow = await render();
  const before = plain({ templates: flow.templates, projects: flow.projects, tasks: flow.tasks });
  assert.equal(flow.updateTemplate('master', replacement([...template.steps, step('overflow', { duration: Number.MAX_SAFE_INTEGER })])), false);
  flow = await render(); assert.deepEqual(plain({ templates: flow.templates, projects: flow.projects, tasks: flow.tasks }), before);
});
test('sync storage failure leaves coherent memory, intact old disk, and a visible retry error', async () => {
  let value = JSON.stringify(data()), fail = false;
  const render = host({}, { mocks: { '@react-native-async-storage/async-storage': { getItem: async () => value, setItem: async (key, next) => { if (fail) throw Error('disk'); value = next; } } } });
  let flow = await render(); const before = value; fail = true;
  const master = replacement([...template.steps, step('d')]); assert.equal(flow.updateTemplate('master', master), true); flow = await render();
  assert.equal(value, before); assert.equal(flow.templates[0].steps.length, 4); assert.equal(owned(flow).length, 4); assert.equal(owned(flow, 'q').length, 4);
  assert.match(flow.storageError, /could not be saved/);
  fail = false; flow.updateTemplate('master', master); flow = await render(); assert.equal(flow.storageError, ''); assert.equal(owned(JSON.parse(value)).length, 4);
});
test('sync preserves rescheduled dates and valid dependency graph after add/reorder/duration changes', () => {
  const source = data(); source.tasks[1].dependsOn = [source.tasks[0].id]; source.tasks[2].dependsOn = [source.tasks[1].id];
  const proposal = workflow.buildRescheduleProposal(source.projects[0], source.tasks, source.tasks[0].id, '2026-09-22', 3);
  assert.ok(proposal.changes.length > 0);
  for (const change of proposal.changes) { const task = source.tasks.find((task) => task.id === change.taskId); task.dueDate = change.to; }
  const result = sync.synchronizeTemplate(source, replacement([step('new'), ...template.steps.slice().reverse().map((s) => ({ ...s, duration: 15 }))]));
  for (const old of owned(source)) { const task = result.tasks.find((task) => task.id === old.id); assert.equal(task.dueDate, old.dueDate); assert.deepEqual(task.dependsOn, old.dependsOn); }
  assert.equal(workflow.validateDependencies(result.tasks.find((task) => task.id === source.tasks[0].id), [source.tasks[2].id], result.tasks)?.includes('circular'), true);
});
