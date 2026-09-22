const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { host, plain, loadSource } = require('./flow-test-host.cjs');
const dates = loadSource('lib/task-utils.ts'), personal = loadSource('lib/personal-tasks.ts');
const views = loadSource('lib/todo-view.ts'), pm = loadSource('lib/project-management.ts');
const settings = loadSource('lib/settings.ts'), dashboard = loadSource('lib/dashboard.ts');
const backup = loadSource('lib/data-backup.ts'), palettes = loadSource('constants/colors.ts').default;
const today = dates.localDateValue(), day = (offset) => dates.localDateValue(dates.addCalendarDays(dates.readDate(today), offset));
const preferences = (extra = {}) => ({ ...plain(settings.DEFAULT_SETTINGS), ...extra });
const project = (id = 'p', extra = {}) => ({ id, name: 'Project', client: 'Client', summary: 'History', templateId: 'master', startDate: day(-10), dueDate: day(90), reminderFrequency: 'Daily', remindersEnabled: false, status: 'Active', ...extra });
const task = (id = 'step', extra = {}) => ({ id, projectId: 'p', title: id, description: 'Keep description', duration: 1, status: 'todo', dueDate: today, order: 0, ...extra });
const ptask = (id = 'personal', extra = {}) => ({ ...plain(personal.PERSONAL_DEFAULTS), id, title: id, status: 'todo', createdAt: new Date().toISOString(), seriesId: id, occurrence: 0, ...extra });
const template = { id: 'master', name: 'CII SELF', category: 'Custom', description: 'Keep', color: '#fff', steps: [{ id: 'step', title: 'Step', description: '', duration: 1 }] };
const data = (extra = {}) => ({ projects: [project()], tasks: [task()], templates: [plain(template)], personalTasks: [ptask()], settings: preferences(), ...extra });
const ids = (entries) => plain(entries.map((entry) => entry.task.id));
const groups = (source, filter = 'All', prefs = preferences()) => views.todoGroups(source.projects, source.tasks, source.personalTasks, today, filter, prefs);

for (const kind of ['personal', 'workflow', 'manual']) for (const offset of [-405, -1, 0, 1, 6, 7, 8, 30, 405]) {
  test(`${kind} Open horizon ${offset} local days`, () => {
    const source = data({ tasks: kind === 'personal' ? [] : [task('target', { dueDate: day(offset), isManual: kind === 'manual' })], personalTasks: kind === 'personal' ? [ptask('target', { dueDate: day(offset) })] : [] });
    const before = JSON.stringify(source), result = groups(source);
    assert.equal(result.open.length, offset <= 7 ? 1 : 0); assert.equal(result.openCount, offset <= 7 ? 1 : 0);
    assert.equal(result.completed.length, 0); assert.equal(JSON.stringify(source), before);
  });
}
test('time-only and undated daily work are Today; genuinely unscheduled work remains separate', () => {
  const source = data({ tasks: [], personalTasks: [ptask('time', { dueTime: '20:00' }), ptask('daily', { recurrence: { frequency: 'Daily' } }), ptask('unscheduled'), ptask('later-daily', { recurrence: { frequency: 'Daily' }, availableFrom: day(8) })] });
  const result = groups(source); assert.deepEqual(ids(result.open), ['daily', 'time']); assert.deepEqual(ids(result.unscheduled), ['unscheduled']); assert.equal(result.openCount, 3);
  assert.ok(source.personalTasks.every((task) => !task.dueDate));
});
test('Open has no completed records; Completed ignores horizon and legacy false setting', () => {
  const source = data({ tasks: [task('done-project', { status: 'done', dueDate: day(405) })], personalTasks: [ptask('done-undated', { status: 'done' }), ptask('done-personal', { status: 'done', dueDate: day(-405) })] });
  const result = groups(source, 'All', preferences({ showCompleted: false })); assert.equal(result.openCount, 0); assert.equal(result.completed.length, 3);
});
test('archived project records stay out of both task views while personal work remains', () => {
  const source = data({ projects: [project('p', { archived: true })], tasks: [task('open'), task('done', { status: 'done' })], personalTasks: [ptask('personal'), ptask('finished', { status: 'done' })] });
  const result = groups(source); assert.equal(result.open.length, 0); assert.deepEqual(ids(result.unscheduled), ['personal']); assert.deepEqual(ids(result.completed), ['finished']);
});
for (const filter of ['All', 'Personal', 'Projects']) for (const status of ['Open', 'Completed']) test(`ownership filter ${filter} within ${status}`, () => {
  const source = data({ tasks: [task('project-open'), task('project-done', { status: 'done' })], personalTasks: [ptask('personal-open', { dueDate: today }), ptask('personal-done', { status: 'done' })] });
  const result = groups(source, filter, preferences({ showCompleted: false })), selected = status === 'Open' ? result.open : result.completed;
  assert.equal(selected.length, filter === 'All' ? 2 : 1);
  assert.ok(selected.every((entry) => entry.task.status === (status === 'Open' ? 'todo' : 'done')));
  if (filter !== 'All') assert.ok(selected.every((entry) => entry.kind === (filter === 'Personal' ? 'personal' : 'project')));
});
test('visibility preferences continue to filter ownership in both views', () => {
  const source = data({ tasks: [task('project-open'), task('project-done', { status: 'done' })], personalTasks: [ptask('personal-open'), ptask('personal-done', { status: 'done' })] });
  for (const [key, excluded] of [['showPersonal', 'personal'], ['showProjects', 'project']]) {
    const result = groups(source, 'All', preferences({ [key]: false, showCompleted: false }));
    assert.ok([...result.open, ...result.unscheduled, ...result.completed].every((entry) => entry.kind !== excluded));
  }
});
test('Home Upcoming remains unbounded by To-do horizon and no task is mutated', () => {
  const source = data({ tasks: [task('far-project', { dueDate: day(405) })], personalTasks: [ptask('far-personal', { dueDate: day(30) })] }), before = JSON.stringify(source);
  assert.equal(groups(source).openCount, 0); assert.equal(dashboard.dashboardGroups(source.tasks, source.personalTasks, today).upcoming.length, 2);
  assert.equal(JSON.stringify(source), before);
});
for (const TZ of ['Asia/Kolkata', 'America/New_York', 'Europe/London']) for (const season of ['spring', 'fall']) test(`local horizon at midnight across ${season} DST: ${TZ}`, () => {
  const date = season === 'spring' ? '2026-03-07' : '2026-10-31';
  const script = `const assert=require('node:assert/strict'),{loadSource}=require('./artifacts/flowpilot/scripts/flow-test-host.cjs');const d=loadSource('lib/task-utils.ts'),v=loadSource('lib/todo-view.ts');const day='${date}',at=d.readDate(day),plus=n=>d.localDateValue(d.addCalendarDays(at,n));const tasks=[7,8].map(n=>({id:String(n),projectId:'p',status:'todo',dueDate:plus(n)}));for(const hour of [0,23]){at.setHours(hour,59);const result=v.todoGroups([],tasks,[],d.localDateValue(at));assert.deepEqual(Array.from(result.open,x=>x.task.id),['7']);}const tomorrow=v.todoGroups([],tasks,[],plus(1));assert.equal(tomorrow.open.length,2);assert.equal(tasks[1].dueDate,plus(8));`;
  const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', env: { ...process.env, TZ } }); assert.equal(result.status, 0, result.stderr);
});

for (const status of pm.PROJECT_STATUSES) for (const archived of [false, true]) test(`project category ${status}, archived=${archived} is exclusive`, () => {
  const p = project('p', { status, archived }), before = JSON.stringify(p), expected = archived ? 'Archived' : status === 'Completed' ? 'Completed' : 'Active';
  assert.equal(pm.projectView(p, [task()]), expected);
  const counts = ['Active', 'Completed', 'Archived'].map((view) => pm.visibleProjects([p], [task()], view).length);
  assert.equal(counts.reduce((a, b) => a + b, 0), 1); assert.equal(JSON.stringify(p), before);
});
test('legacy derived completion places project in Completed with real progress', () => {
  const p = project('p', { status: undefined }), tasks = [task('one', { status: 'done' }), task('two', { status: 'done', isManual: true })];
  assert.equal(pm.projectView(p, tasks), 'Completed'); assert.equal(pm.projectProgress('p', tasks).percent, 100);
  assert.equal(pm.projectView(p, []), 'Active');
});
function setup(source = data(), options = {}) { const storage = { value: JSON.stringify(source) }; return { storage, render: host(storage, options) }; }
test('automatic project completion and reopening move categories immediately without archive', async () => {
  const h = setup(data({ tasks: [task('only', { isManual: true })] })); let flow = await h.render(); assert.equal(pm.projectView(flow.projects[0], flow.tasks), 'Active');
  flow.toggleTask('only', 'p'); flow = await h.render(); assert.equal(pm.projectView(flow.projects[0], flow.tasks), 'Completed'); assert.equal(flow.projects[0].archived, undefined);
  flow.toggleTask('only', 'p'); flow = await h.render(); assert.equal(pm.projectView(flow.projects[0], flow.tasks), 'Active');
});
for (const manual of [false, true]) test(`template new work categorizes ${manual ? 'manual' : 'automatic'} completion correctly`, async () => {
  const h = setup(data({ projects: [project('p', { status: 'Completed', completionSource: manual ? 'manual' : 'auto' })], tasks: [task('step', { sourceTemplateStepId: 'step', status: 'done', completedAt: '2026-01-01T12:00:00.000Z' })] })); let flow = await h.render();
  flow.updateTemplate('master', { ...template, steps: [...template.steps, { id: 'extra', title: 'Extra', description: '', duration: 1 }] }); flow = await h.render();
  assert.equal(pm.projectView(flow.projects[0], flow.tasks), manual ? 'Completed' : 'Active'); assert.equal(pm.projectProgress('p', flow.tasks).percent, 50);
  assert.equal(flow.tasks.find((task) => task.id === 'step').completedAt, '2026-01-01T12:00:00.000Z');
});
for (const status of pm.PROJECT_STATUSES) test(`archive/unarchive returns ${status} to its category with full history`, async () => {
  const source = data({ projects: [project('p', { status })], tasks: [task('one', { status: 'done', completedAt: '2020-01-01T12:00:00.000Z' }), task('two', { dependsOn: ['one'], isManual: true, order: 1 })] });
  const h = setup(source); let flow = await h.render(); const tasks = plain(flow.tasks);
  assert.equal(flow.setProjectArchived('p', true, true), true); flow = await h.render(); assert.equal(pm.projectView(flow.projects[0], flow.tasks), 'Archived');
  flow.setProjectArchived('p', false); flow = await h.render(); assert.equal(pm.projectView(flow.projects[0], flow.tasks), status === 'Completed' ? 'Completed' : 'Active');
  assert.equal(flow.projects[0].status, status); assert.equal(flow.projects[0].templateId, 'master'); assert.equal(flow.projects[0].startDate, source.projects[0].startDate); assert.equal(flow.projects[0].dueDate, source.projects[0].dueDate); assert.deepEqual(plain(flow.tasks), tasks);
});
test('manual completed override requires confirmation, keeps unfinished work and real progress', async () => {
  const h = setup(); let flow = await h.render(); assert.equal(flow.setProjectStatus('p', 'Completed'), false); assert.equal(flow.setProjectStatus('p', 'Completed', true), true); flow = await h.render();
  assert.equal(pm.projectView(flow.projects[0], flow.tasks), 'Completed'); assert.equal(pm.projectProgress('p', flow.tasks).percent, 0); assert.equal(groups(flow).open.length, 1);
});

function walk(node, predicate) { if (Array.isArray(node)) return node.flatMap((n) => walk(n, predicate)); if (!node || typeof node !== 'object') return []; return [...(predicate(node) ? [node] : []), ...walk(node.props?.children, predicate)]; }
const find = (tree, id) => walk(tree, (n) => n.props?.testID === id)[0];
function text(node) { if (Array.isArray(node)) return node.map(text).join(' '); return node && typeof node === 'object' ? text(node.props?.children) : String(node ?? ''); }
function ui(file, getFlow, prefs = preferences(), params = {}, theme = 'light') {
  const state = []; let cursor = 0; const navigation = [];
  const hooks = { useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], (value) => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; }, useRef(initial) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; }, useMemo: (fn) => fn(), useEffect() {} };
  const api = loadSource(file, { react: hooks,
    'react-native': { Platform: { OS: 'android' }, View: 'View', Pressable: 'Pressable', Modal: 'Modal', ScrollView: 'ScrollView', TextInput: 'TextInput', Switch: 'Switch', KeyboardAvoidingView: 'View', StyleSheet: { create: (s) => s, hairlineWidth: 1 } },
    '@expo/vector-icons': { Feather: 'Feather' }, 'expo-router': { router: { push: (route) => navigation.push(['push', route]), replace: (route) => navigation.push(['replace', route]), back: () => navigation.push(['back']) }, useLocalSearchParams: () => params },
    'expo-constants': { default: { expoConfig: { name: 'GULABANI', version: '1', android: { versionCode: 1 } } } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }, '@/components/AppText': { AppText: 'Text' },
    '@/components/TaskRow': { TaskRow: 'TaskRow' }, '@/components/PersonalTaskRow': { PersonalTaskRow: 'PersonalTaskRow' }, '@/components/QuickAdd': { QuickAdd: 'QuickAdd' }, '@/components/ProjectDateField': { ProjectDateField: 'DateField' },
    '@/context/FlowContext': { useFlow: typeof getFlow === 'function' ? getFlow : () => getFlow, daysRemaining: dates.calendarDaysUntil },
    '@/context/SettingsContext': { useSettings: () => ({ settings: prefs }), useDateFormatter: () => (date) => settings.formatDate(date, prefs.dateFormat) },
    '@/hooks/useColors': { useColors: () => palettes[settings.resolveTheme(prefs.theme, theme)] },
  });
  return { navigation, render(props) { cursor = 0; let tree = (api.default ?? api.PersonalTaskRow)(props); if (typeof tree?.type === 'function') tree = tree.type(tree.props); return tree; } };
}
for (const screen of ['index', 'tasks']) for (const status of ['todo', 'done']) test(`${screen} actual pencil opens ${status} record with separate completion action`, () => {
  const value = ptask('chosen', { status, dueTime: '20:00', completedAt: status === 'done' ? new Date().toISOString() : undefined }); let completeCalls = 0;
  const flow = { ...data({ personalTasks: [value], tasks: [] }), calendarDate: today, hydrated: true, completePersonalTask: () => completeCalls++, reopenPersonalTask: () => completeCalls++ };
  const page = ui(`app/(tabs)/${screen}.tsx`, flow); let tree = page.render();
  if (screen === 'tasks' && status === 'done') { find(tree, 'todo-status-Completed').props.onPress(); tree = page.render(); }
  const rowProps = walk(tree, (n) => n.type === 'PersonalTaskRow')[0].props;
  const row = ui('components/PersonalTaskRow.tsx', flow), rendered = row.render(rowProps), pencil = find(rendered, 'edit-personal-button-chosen');
  assert.ok(pencil); assert.equal(pencil.type, 'Pressable'); assert.equal(pencil.props.children.props.name, 'edit-2'); assert.equal(pencil.props.accessibilityRole, 'button'); assert.match(pencil.props.accessibilityLabel, /Edit chosen/);
  assert.ok(pencil.props.style.minWidth >= 44 && pencil.props.style.minHeight >= 44); pencil.props.onPress();
  assert.equal(completeCalls, 0); assert.deepEqual(plain(row.navigation[0]), ['push', { pathname: '/personal-task', params: { id: 'chosen' } }]);
  find(rendered, 'personal-complete-chosen').props.onPress(); assert.equal(completeCalls, 1);
});
for (const [label, fields] of [['date-only', { dueDate: day(2) }], ['time-only', { dueTime: '20:00' }], ['undated daily', { dueTime: '20:00', recurrence: { frequency: 'Daily' } }], ['legacy minutes', { dueDate: day(2), dueTime: '20:17' }]]) for (const status of ['todo', 'done']) test(`edit ${label} ${status} prefill/save/cancel retains identity and history`, async () => {
  const value = ptask('edit-me', { ...fields, priority: 'High', notes: 'Keep notes', status, completedAt: status === 'done' ? '2020-01-01T12:00:00.000Z' : undefined });
  const h = setup(data({ personalTasks: [value, ptask('other')] })); let flow = await h.render(); const page = ui('app/personal-task.tsx', () => flow, preferences(), { id: value.id });
  let tree = page.render(); assert.equal(find(tree, 'personal-title').props.value, value.title); assert.equal(find(tree, 'personal-notes').props.value, value.notes);
  assert.equal(walk(tree, (n) => n.type === 'DateField')[0].props.value, value.dueDate ?? ''); assert.match(find(tree, 'personal-time').props.accessibilityLabel, new RegExp(value.dueTime ?? 'No Time'));
  for (const [label, expected] of [['PRIORITY', value.priority], ['REMINDER', value.reminder], ['REPEAT', value.recurrence.frequency]]) assert.equal(walk(tree, (n) => n.props?.label === label)[0].props.selected, expected);
  const before = h.storage.value; walk(tree, (n) => n.props?.accessibilityLabel === 'Back')[0].props.onPress(); assert.equal(h.storage.value, before);
  find(tree, 'personal-title').props.onChangeText('Renamed'); find(tree, 'personal-notes').props.onChangeText('Updated notes'); tree = page.render(); await find(tree, 'save-personal-task').props.onPress(); flow = await h.render();
  assert.equal(flow.personalTasks.length, 2); const edited = flow.personalTasks.find((item) => item.id === value.id);
  assert.equal(edited.title, 'Renamed'); assert.equal(edited.notes, 'Updated notes'); assert.equal(edited.status, status); assert.equal(edited.completedAt, value.completedAt); assert.equal(edited.dueTime, value.dueTime); assert.equal(edited.dueDate, value.dueDate);
  assert.deepEqual(page.navigation.at(-1), ['replace', '/tasks']); assert.deepEqual(plain((await host(h.storage)()).personalTasks), plain(flow.personalTasks));
});
test('Delete Task absent on create, accessible on edit, confirmation cancel leaves all records unchanged', async () => {
  const h = setup(); let flow = await h.render(); const create = ui('app/personal-task.tsx', () => flow); assert.equal(find(create.render(), 'delete-personal-task'), undefined);
  const edit = ui('app/personal-task.tsx', () => flow, preferences(), { id: 'personal' }); let tree = edit.render(); const before = h.storage.value;
  assert.equal(text(find(tree, 'delete-personal-task')), 'Delete Task'); assert.equal(find(tree, 'delete-personal-task').props.accessibilityLabel, 'Delete Task');
  find(tree, 'delete-personal-task').props.onPress(); tree = edit.render(); assert.equal(h.storage.value, before);
  const modal = walk(tree, (n) => n.type === 'Modal' && n.props.visible)[0]; assert.match(text(modal), /cannot be undone/);
  modal.props.onRequestClose(); tree = edit.render(); assert.equal(walk(tree, (n) => n.type === 'Modal' && n.props.visible).length, 0); flow = await h.render(); assert.equal(h.storage.value, before);
});

function reminders() {
  const scheduled = new Map(), calls = [], canceled = [];
  const api = loadSource('lib/personal-notifications.ts', { 'react-native': { Platform: { OS: 'android' } }, '@/lib/notifications': { requestReminderPermission: async () => true }, 'expo-notifications': {
    getAllScheduledNotificationsAsync: async () => [...scheduled.values()], getPermissionsAsync: async () => ({ granted: true }),
    cancelScheduledNotificationAsync: async (id) => { canceled.push(id); scheduled.delete(id); }, scheduleNotificationAsync: async (item) => { calls.push(item); scheduled.set(item.identifier, item); return item.identifier; }, SchedulableTriggerInputTypes: { DATE: 'date' },
  } });
  return { ...api, scheduled, calls, canceled };
}
for (const origin of ['index', 'tasks']) test(`delete through ${origin} edit removes only selected occurrence and notification`, async () => {
  const r = reminders(), value = ptask('delete-me', { dueTime: '20:00', reminder: 'At due time', recurrence: { frequency: 'Daily' } });
  const source = data({ personalTasks: [value, ptask('successor', { seriesId: value.seriesId, occurrence: 1, recurrence: { frequency: 'Daily' }, availableFrom: day(1), dueTime: '20:00', reminder: 'At due time' }), ptask('unrelated')] });
  const h = setup(source, { mocks: { '@/lib/personal-notifications': r } }); let flow = await h.render(); const protectedData = plain({ projects: flow.projects, tasks: flow.tasks, templates: flow.templates });
  const home = ui('app/(tabs)/index.tsx', () => flow), todo = ui('app/(tabs)/tasks.tsx', () => flow);
  const entry = walk((origin === 'index' ? home : todo).render(), (n) => n.type === 'PersonalTaskRow' && n.props.task.id === value.id)[0];
  const row = ui('components/PersonalTaskRow.tsx', () => flow); find(row.render(entry.props), 'edit-personal-button-delete-me').props.onPress();
  const edit = ui('app/personal-task.tsx', () => flow, preferences(), row.navigation[0][1].params);
  find(edit.render(), 'delete-personal-task').props.onPress(); let tree = edit.render();
  const beforeCancel = r.canceled.length; walk(tree, (n) => n.type === 'Modal' && n.props.visible)[0].props.onRequestClose(); flow = await h.render(); assert.equal(r.canceled.length, beforeCancel);
  find(edit.render(), 'delete-personal-task').props.onPress(); tree = edit.render(); find(tree, 'confirm-delete-personal').props.onPress(); flow = await h.render();
  assert.deepEqual(plain(flow.personalTasks.map((task) => task.id)), ['successor', 'unrelated']);
  assert.ok(r.canceled.includes('gulabani-personal-delete-me')); assert.equal(r.scheduled.has('gulabani-personal-delete-me'), false); assert.ok(r.scheduled.has('gulabani-personal-successor'));
  assert.deepEqual(plain({ projects: flow.projects, tasks: flow.tasks, templates: flow.templates }), protectedData);
  for (const page of [home, todo]) assert.equal(walk(page.render(), (n) => n.type === 'PersonalTaskRow' && n.props.task.id === value.id).length, 0);
});
test('far-future reminder remains scheduled when Open filtering hides its task', async () => {
  const r = reminders(), value = ptask('future', { dueDate: day(30), dueTime: '12:00', reminder: 'At due time' });
  const h = setup(data({ personalTasks: [value] }), { mocks: { '@/lib/personal-notifications': r } }); let flow = await h.render();
  assert.ok(r.scheduled.has('gulabani-personal-future')); const before = r.calls.length;
  const page = ui('app/(tabs)/tasks.tsx', () => flow); assert.equal(walk(page.render(), (n) => n.type === 'PersonalTaskRow').length, 0);
  find(page.render(), 'todo-status-Completed').props.onPress(); page.render(); flow = await h.render();
  assert.equal(r.calls.length, before); assert.ok(r.scheduled.has('gulabani-personal-future')); assert.equal(r.canceled.length, 0);
});
test('completion and reopening move one record between task views immediately', async () => {
  const h = setup(data({ tasks: [], personalTasks: [ptask('move', { dueTime: '20:00' })] })); let flow = await h.render();
  const page = ui('app/(tabs)/tasks.tsx', () => flow, preferences({ showCompleted: false }));
  assert.equal(find(page.render(), 'todo-status-Open').props.accessibilityState.selected, true);
  flow.completePersonalTask('move'); flow = await h.render(); assert.equal(walk(page.render(), (n) => n.type === 'PersonalTaskRow').length, 0);
  find(page.render(), 'todo-status-Completed').props.onPress(); assert.equal(walk(page.render(), (n) => n.type === 'PersonalTaskRow').length, 1);
  flow.reopenPersonalTask('move'); flow = await h.render(); assert.equal(walk(page.render(), (n) => n.type === 'PersonalTaskRow').length, 0);
  find(page.render(), 'todo-status-Open').props.onPress(); assert.equal(walk(page.render(), (n) => n.type === 'PersonalTaskRow').length, 1);
});
test('Open counter counts near-term plus unscheduled under type filters; Completed counts finished records', () => {
  const source = { ...data({ tasks: [task('soon'), task('far', { dueDate: day(405) }), task('project-done', { status: 'done' })], personalTasks: [ptask('time', { dueTime: '20:00' }), ptask('undated'), ptask('personal-done', { status: 'done' })] }), calendarDate: today };
  const page = ui('app/(tabs)/tasks.tsx', source); let tree = page.render(); assert.equal(find(tree, 'todo-count').props.children, 3);
  assert.ok(find(tree, 'todo-unscheduled-list')); assert.equal(find(tree, 'todo-completed-list'), undefined);
  find(tree, 'todo-filter-Personal').props.onPress(); tree = page.render(); assert.equal(find(tree, 'todo-count').props.children, 2);
  find(tree, 'todo-status-Completed').props.onPress(); tree = page.render(); assert.equal(find(tree, 'todo-count').props.children, 1); assert.equal(find(tree, 'todo-count').props.accessibilityLabel, 'Completed: 1');
  find(tree, 'todo-filter-All').props.onPress(); tree = page.render(); assert.equal(find(tree, 'todo-count').props.children, 2); assert.equal(find(tree, 'todo-open-list'), undefined);
});
for (const theme of ['Light', 'Dark', 'System']) test(`selectors and pencil use theme tokens and accessible targets: ${theme}`, () => {
  const prefs = preferences({ theme }), palette = palettes[settings.resolveTheme(theme, 'dark')];
  const projects = ui('app/(tabs)/projects.tsx', { ...data(), calendarDate: today }, prefs, {}, 'dark'); const tree = projects.render();
  for (const value of ['active', 'completed', 'archived']) { const button = find(tree, 'projects-' + value); assert.ok(button); assert.ok(button.props.style[0].minHeight >= 44); assert.equal(button.props.style[0].flex, 1); assert.equal(button.props.accessibilityState.selected, value === 'active'); assert.equal(button.props.style[1].backgroundColor, value === 'active' ? palette.foreground : palette.card); }
  const todo = ui('app/(tabs)/tasks.tsx', { ...data(), calendarDate: today }, prefs, {}, 'dark').render();
  for (const value of ['Open', 'Completed']) { const button = find(todo, 'todo-status-' + value); assert.ok(button.props.style[0].minHeight >= 44); assert.equal(button.props.accessibilityState.selected, value === 'Open'); }
});
test('Settings removes only obsolete completed controls; legacy settings still load and roundtrip', () => {
  const prefs = preferences({ showCompleted: false, showCompletedProjects: false }), page = ui('app/(tabs)/settings.tsx', data(), prefs), tree = page.render();
  assert.equal(find(tree, 'showCompleted'), undefined); assert.equal(find(tree, 'showCompletedProjects'), undefined);
  for (const key of ['startScreen', 'dateFormat', 'firstDayOfWeek', 'notificationsEnabled', 'defaultReminder', 'showPersonal', 'showProjects', 'defaultPriority', 'projectDuration', 'theme']) assert.ok(find(tree, key), key);
  assert.match(text(tree), /About GULABANI/); assert.match(text(tree), /Help/);
  const normalized = settings.decodeSettings(JSON.stringify(prefs)); assert.equal(normalized.showCompleted, false); assert.equal(normalized.showCompletedProjects, false);
  const source = data({ settings: prefs, projects: [project('p', { status: 'Completed' }), project('archived', { status: 'Completed', archived: true })], personalTasks: [ptask('done', { status: 'done' })] });
  const restored = backup.parseBackup(backup.serializeBackup(source)).data;
  assert.equal(pm.visibleProjects(restored.projects, restored.tasks, 'Completed').length, 1); assert.equal(pm.visibleProjects(restored.projects, restored.tasks, 'Archived').length, 1);
  assert.equal(groups(restored, 'All', restored.settings).completed.length, 1);
  assert.deepEqual(plain(restored), source);
});

for (const status of ['todo', 'done']) test(`edit form changes every field on same ${status} record`, async () => {
  const value = ptask('all-fields', { dueDate: day(2), dueTime: '20:17', status, completedAt: status === 'done' ? '2020-01-01T12:00:00.000Z' : undefined });
  const h = setup(data({ personalTasks: [value] })); let flow = await h.render();
  const page = ui('app/personal-task.tsx', () => flow, preferences(), { id: value.id }); let tree = page.render();
  find(tree, 'personal-title').props.onChangeText('Changed'); find(tree, 'personal-notes').props.onChangeText('New notes');
  walk(tree, (n) => n.type === 'DateField')[0].props.onChange('');
  find(tree, 'personal-time').props.onPress(); tree = page.render(); find(tree, 'time-option-21:30').props.onPress(); tree = page.render();
  for (const [label, selected] of [['PRIORITY', 'Critical'], ['REMINDER', 'At due time'], ['REPEAT', 'Daily']]) {
    walk(tree, (n) => n.props?.label === label)[0].props.onSelect(selected); tree = page.render();
  }
  await find(tree, 'save-personal-task').props.onPress(); flow = await h.render();
  assert.equal(flow.personalTasks.length, 1); const saved = flow.personalTasks[0];
  assert.equal(saved.id, value.id); assert.equal(saved.title, 'Changed'); assert.equal(saved.notes, 'New notes'); assert.equal(saved.dueDate, undefined);
  assert.equal(saved.dueTime, '21:30'); assert.equal(saved.priority, 'Critical'); assert.equal(saved.reminder, 'At due time'); assert.equal(saved.recurrence.frequency, 'Daily');
  assert.equal(saved.status, status); assert.equal(saved.completedAt, value.completedAt);
});
test('completed personal record remains editable and deletable through Completed with legacy false', async () => {
  const h = setup(data({ personalTasks: [ptask('finished', { status: 'done', completedAt: '2020-01-01T12:00:00.000Z' })] })); let flow = await h.render();
  const prefs = preferences({ showCompleted: false }), todo = ui('app/(tabs)/tasks.tsx', () => flow, prefs);
  find(todo.render(), 'todo-status-Completed').props.onPress(); const props = walk(todo.render(), (n) => n.type === 'PersonalTaskRow')[0].props;
  const row = ui('components/PersonalTaskRow.tsx', () => flow); find(row.render(props), 'edit-personal-button-finished').props.onPress();
  const edit = ui('app/personal-task.tsx', () => flow, prefs, row.navigation[0][1].params);
  find(edit.render(), 'delete-personal-task').props.onPress(); find(edit.render(), 'confirm-delete-personal').props.onPress(); flow = await h.render();
  assert.equal(walk(todo.render(), (n) => n.type === 'PersonalTaskRow').length, 0); assert.equal(flow.personalTasks.length, 0);
});
test('reopened distant task remains outside near-term Open while retaining its due date', async () => {
  const h = setup(data({ personalTasks: [ptask('far', { status: 'done', dueDate: day(30), completedAt: new Date().toISOString() })] })); let flow = await h.render();
  assert.equal(groups(flow).completed.length, 1); flow.reopenPersonalTask('far'); flow = await h.render();
  assert.equal(groups(flow).completed.length, 0); assert.equal(groups(flow).open.filter((entry) => entry.kind === 'personal').length, 0);
  assert.equal(flow.personalTasks[0].dueDate, day(30)); assert.equal(dashboard.dashboardGroups([], flow.personalTasks, today).upcoming.length, 1);
});
test('Projects screen reacts immediately to completion, archive and unarchive', async () => {
  const h = setup(data({ tasks: [task('only', { isManual: true })] })); let flow = await h.render();
  const page = ui('app/(tabs)/projects.tsx', () => flow, preferences({ showCompletedProjects: false })); assert.ok(find(page.render(), 'project-card-p'));
  flow.toggleTask('only', 'p'); flow = await h.render(); assert.equal(find(page.render(), 'project-card-p'), undefined);
  find(page.render(), 'projects-completed').props.onPress(); assert.ok(find(page.render(), 'project-card-p'));
  flow.setProjectArchived('p', true, true); flow = await h.render(); assert.equal(find(page.render(), 'project-card-p'), undefined);
  find(page.render(), 'projects-archived').props.onPress(); assert.ok(find(page.render(), 'project-card-p'));
  flow.setProjectArchived('p', false); flow = await h.render(); assert.equal(find(page.render(), 'project-card-p'), undefined);
  find(page.render(), 'projects-completed').props.onPress(); assert.ok(find(page.render(), 'project-card-p'));
});
