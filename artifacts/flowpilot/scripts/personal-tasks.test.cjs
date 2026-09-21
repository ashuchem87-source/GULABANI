const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { host, plain, loadSource } = require('./flow-test-host.cjs');
const personal = loadSource('lib/personal-tasks.ts');
const { PERSONAL_DEFAULTS, PRIORITIES, validatePersonal, personalDueAt, personalReminderAt, completePersonal, todoEntries } = personal;
const input = (overrides = {}) => ({ ...PERSONAL_DEFAULTS, title: 'Call daughter', recurrence: { frequency: 'None' }, ...overrides });

test('create undated personal task without project; persistence and ownership isolation', async () => {
  const storage = {}, render = host(storage);
  let flow = await render();
  const before = plain({ projects: flow.projects, tasks: flow.tasks, templates: flow.templates });
  assert.equal((await flow.savePersonalTask(input({ title: '  Call daughter  ', notes: 'Ask about school' }))).ok, true);
  flow = await render();
  const task = plain(flow.personalTasks[0]);
  assert.equal(task.title, 'Call daughter');
  assert.equal(task.priority, 'Medium');
  assert.equal(task.notes, 'Ask about school');
  assert.equal(task.projectId, undefined);
  assert.equal(task.dueDate, undefined);
  assert.ok(task.id.startsWith('personal-'));
  assert.ok(!flow.tasks.some((item) => item.id === task.id));
  flow = await host(storage)();
  assert.deepEqual(plain(flow.personalTasks), [task]);
  assert.deepEqual(plain({ projects: flow.projects, tasks: flow.tasks, templates: flow.templates }), before);
});

test('all personal operations preserve every project, task, template and historical deadline', async () => {
  const storage = {}, render = host(storage);
  let flow = await render();
  const before = plain({ projects: flow.projects, tasks: flow.tasks, templates: flow.templates });
  await flow.savePersonalTask(input()); flow = await render();
  const id = flow.personalTasks[0].id;
  await flow.savePersonalTask(input({ title: 'Changed', dueDate: '2026-12-01', dueTime: '15:20', priority: 'Critical', notes: 'Changed notes' }), id); flow = await render();
  assert.equal(flow.personalTasks[0].title, 'Changed');
  assert.equal(flow.personalTasks[0].notes, 'Changed notes');
  assert.equal(flow.personalTasks[0].dueTime, '15:20');
  flow.completePersonalTask(id); flow = await render();
  assert.equal(flow.personalTasks[0].status, 'done');
  assert.ok(flow.personalTasks[0].completedAt);
  flow.reopenPersonalTask(id); flow = await render();
  assert.equal(flow.personalTasks[0].status, 'todo');
  assert.equal(flow.personalTasks[0].completedAt, undefined);
  assert.deepEqual(plain({ projects: flow.projects, tasks: flow.tasks, templates: flow.templates }), before);
  flow.deletePersonalTask(id); flow = await render();
  assert.equal(flow.personalTasks.length, 0);
  flow = await host(storage)();
  assert.equal(flow.personalTasks.length, 0);
  assert.deepEqual(plain({ projects: flow.projects, tasks: flow.tasks, templates: flow.templates }), before);
});

test('date-only task, notes and all four priorities persist through edits', async () => {
  const storage = {}, render = host(storage);
  let flow = await render();
  await flow.savePersonalTask(input({ dueDate: '2026-11-30' })); flow = await render();
  const id = flow.personalTasks[0].id;
  assert.equal(flow.personalTasks[0].dueTime, undefined);
  for (const priority of PRIORITIES) {
    assert.equal((await flow.savePersonalTask(input({ priority, notes: `Notes ${priority}`, dueDate: '2026-11-30' }), id)).ok, true);
    flow = await render();
    const reloaded = await host(storage)();
    assert.equal(reloaded.personalTasks[0].priority, priority);
    assert.equal(reloaded.personalTasks[0].notes, `Notes ${priority}`);
    assert.equal(reloaded.personalTasks[0].dueDate, '2026-11-30');
  }
});

test('no-project empty account and legacy data without personalTasks load normally', async () => {
  const storage = { value: JSON.stringify({ projects: [], tasks: [], templates: [] }) }, render = host(storage);
  let flow = await render();
  assert.deepEqual(plain(flow.personalTasks), []);
  assert.equal((await flow.savePersonalTask(input())).ok, true);
  flow = await render();
  assert.equal(flow.personalTasks.length, 1);
  assert.equal(flow.projects.length, 0);
  assert.equal(flow.tasks.length, 0);
});

test('reminder and date/time validation rejects invalid combinations; blank title never saves', async () => {
  const now = new Date('2025-01-01T00:00:00Z');
  for (const overrides of [
    { title: ' ' }, { dueTime: '12:00' }, { dueDate: '2026-02-30' }, { dueDate: '2026-10-01', dueTime: '24:00' },
    { reminder: 'At due time' }, { dueDate: '2026-10-01', reminder: '10 minutes before' },
    { recurrence: { frequency: 'Daily' } }, { priority: 'Urgent' },
    { dueDate: '2020-01-01', dueTime: '10:00', reminder: 'At due time' },
  ]) assert.ok(validatePersonal(input(overrides), now));
  assert.equal(validatePersonal(input(), now), null);
  assert.equal(validatePersonal(input({ dueDate: '2026-10-01' }), now), null);
  const storage = {}, render = host(storage); let flow = await render();
  assert.equal((await flow.savePersonalTask(input({ title: ' ' }))).ok, false);
  flow = await render(); assert.equal(flow.personalTasks.length, 0);
});

test('reminder offsets and serialized local date plus time', () => {
  const task = input({ dueDate: '2030-06-15', dueTime: '12:30' });
  const due = personalDueAt(task);
  assert.equal(due.getHours(), 12); assert.equal(due.getMinutes(), 30);
  assert.equal(personalReminderAt(task), null);
  for (const [reminder, minutes] of [['At due time', 0], ['10 minutes before', 10], ['1 hour before', 60]]) {
    assert.equal((due - personalReminderAt({ ...task, reminder })) / 60000, minutes);
  }
  const dayBefore = personalReminderAt({ ...task, reminder: '1 day before' });
  assert.equal(dayBefore.getDate(), 14); assert.equal(dayBefore.getHours(), 12);
});

for (const [frequency, expected] of [['Daily', '2026-10-01'], ['Weekly', '2026-10-07'], ['Monthly', '2026-10-30']]) {
  test(`${frequency} recurrence preserves completion and creates only one next occurrence`, async () => {
    const storage = {}, render = host(storage); let flow = await render();
    await flow.savePersonalTask(input({ dueDate: '2026-09-30', dueTime: '08:00', recurrence: { frequency } })); flow = await render();
    const original = flow.personalTasks[0];
    // Same render's handler called twice: the provider's latest collection must prevent duplicates.
    flow.completePersonalTask(original.id); flow.completePersonalTask(original.id); flow = await render();
    assert.equal(flow.personalTasks.length, 2);
    assert.equal(flow.personalTasks[0].status, 'done');
    assert.equal(flow.personalTasks[1].dueDate, expected);
    assert.equal(flow.personalTasks[1].dueTime, '08:00');
    assert.equal(flow.personalTasks[1].status, 'todo');
    flow.reopenPersonalTask(original.id); flow = await render();
    flow.completePersonalTask(original.id); flow = await render();
    assert.equal(flow.personalTasks.length, 2);
    const reloaded = await host(storage)(); assert.deepEqual(plain(reloaded.personalTasks), plain(flow.personalTasks));
  });
}

test('monthly Jan 31 clamps to February then returns to March 31, including leap year', async () => {
  for (const [year, february] of [[2027, '2027-02-28'], [2028, '2028-02-29']]) {
    const storage = {}, render = host(storage); let flow = await render();
    await flow.savePersonalTask(input({ dueDate: `${year}-01-31`, recurrence: { frequency: 'Monthly' } })); flow = await render();
    flow.completePersonalTask(flow.personalTasks[0].id); flow = await render();
    assert.equal(flow.personalTasks[1].dueDate, february);
    const child = flow.personalTasks[1];
    // Editing notes alone must not lose the original monthly anchor.
    await flow.savePersonalTask({ ...child, notes: 'Updated' }, child.id); flow = await render();
    flow.completePersonalTask(child.id); flow = await render();
    assert.equal(flow.personalTasks[2].dueDate, `${year}-03-31`);
  }
});

test('deleting the generated occurrence does not recreate it by reopening/completing its parent', async () => {
  const storage = {}, render = host(storage); let flow = await render();
  await flow.savePersonalTask(input({ dueDate: '2026-10-01', recurrence: { frequency: 'Daily' } })); flow = await render();
  const id = flow.personalTasks[0].id;
  flow.completePersonalTask(id); flow = await render();
  flow.deletePersonalTask(flow.personalTasks[1].id); flow.reopenPersonalTask(id); flow.completePersonalTask(id); flow = await render();
  assert.equal(flow.personalTasks.length, 1);
});

test('filters preserve project tasks, overdue prominence, undated items and completed visibility', () => {
  const projects = [{ id: 'p-task', projectId: 'p', status: 'todo', dueDate: '2026-10-02' }];
  const personals = [
    { ...input({ title: 'Undated', priority: 'Critical' }), id: 'a', status: 'todo' },
    { ...input({ title: 'Overdue', dueDate: '2020-01-01' }), id: 'b', status: 'todo' },
    { ...input({ title: 'Completed' }), id: 'c', status: 'done' },
  ];
  assert.deepEqual(plain(todoEntries(projects, personals).map((entry) => entry.task.id)), ['b', 'p-task', 'a', 'c']);
  assert.equal(todoEntries(projects, personals, 'Personal').length, 3);
  assert.equal(todoEntries(projects, personals, 'Projects').length, 1);
  assert.equal(todoEntries(projects, personals, 'All', { showPersonal: false, showProjects: true, showCompleted: false }).length, 1);
  assert.equal(todoEntries(projects, personals, 'All', { showPersonal: true, showProjects: true, showCompleted: false }).length, 3);
});

function notificationHost({ allowed = true, web = false } = {}) {
  const scheduled = new Map(), cancelled = [], calls = [];
  const api = loadSource('lib/personal-notifications.ts', {
    'react-native': { Platform: { OS: web ? 'web' : 'android' } },
    '@/lib/notifications': { requestReminderPermission: async () => allowed },
    'expo-notifications': {
      getAllScheduledNotificationsAsync: async () => [...scheduled.values()], getPermissionsAsync: async () => ({ granted: allowed }),
      cancelScheduledNotificationAsync: async (id) => { cancelled.push(id); scheduled.delete(id); },
      scheduleNotificationAsync: async (item) => { calls.push(item); scheduled.set(item.identifier, item); return item.identifier; },
      SchedulableTriggerInputTypes: { DATE: 'date' },
    },
  });
  return { ...api, scheduled, cancelled, calls };
}
const remindTask = (overrides = {}) => ({ ...input({ dueDate: '2090-06-15', dueTime: '10:00', reminder: 'At due time' }), id: 'personal-notify', status: 'todo', ...overrides });

test('notifications schedule, deduplicate, reschedule on edits, and cancel on completion/deletion/removal', async () => {
  const h = notificationHost();
  h.scheduled.set('project-notification', { identifier: 'project-notification', content: { data: {} } });
  const task = remindTask();
  await h.syncPersonalReminders([task]); await h.syncPersonalReminders([task]);
  assert.equal(h.calls.length, 1);
  await h.syncPersonalReminders([{ ...task, dueTime: '11:00', title: 'New title' }]);
  assert.equal(h.calls.length, 2); assert.equal(h.cancelled.length, 1);
  await h.syncPersonalReminders([{ ...task, status: 'done' }]);
  assert.equal(h.scheduled.size, 1);
  await h.syncPersonalReminders([task]); await h.syncPersonalReminders([]);
  assert.equal(h.scheduled.size, 1);
  await h.syncPersonalReminders([task]); await h.syncPersonalReminders([{ ...task, reminder: 'None' }]);
  assert.equal(h.scheduled.size, 1);
  assert.ok(h.scheduled.has('project-notification'));
});

test('notification queue finishes in latest state even for overlapping edits/deletion', async () => {
  const h = notificationHost(), task = remindTask();
  await Promise.all([h.syncPersonalReminders([task]), h.syncPersonalReminders([{ ...task, dueTime: '11:00' }]), h.syncPersonalReminders([])]);
  assert.equal(h.scheduled.size, 0);
});

test('permission denial, unsupported web and expired reminders do not schedule invalid notifications', async () => {
  const denied = notificationHost({ allowed: false });
  assert.match(await denied.askPersonalReminderPermission(), /permission/);
  assert.ok(await denied.syncPersonalReminders([remindTask()])); assert.equal(denied.calls.length, 0);
  const web = notificationHost({ web: true }); assert.match(await web.askPersonalReminderPermission(), /mobile/);
  await web.syncPersonalReminders([remindTask()]); assert.equal(web.calls.length, 0);
  const expired = notificationHost();
  assert.ok(await expired.syncPersonalReminders([remindTask({ dueDate: '2020-01-01' })])); assert.equal(expired.calls.length, 0);
});

test('completion cancels the current reminder and schedules the next recurring occurrence', async () => {
  const h = notificationHost();
  const task = remindTask({ seriesId: 'personal-notify', occurrence: 0, recurrence: { frequency: 'Daily' }, createdAt: new Date().toISOString() });
  await h.syncPersonalReminders([task]);
  const next = completePersonal([task], task.id);
  await h.syncPersonalReminders(next);
  assert.equal(h.scheduled.size, 1);
  assert.ok(h.cancelled.includes('gulabani-personal-' + task.id));
  assert.ok([...h.scheduled.keys()][0].endsWith(':occurrence:1'));
});

test('local recurrence boundaries and DST keep calendar dates and clock times stable', () => {
  for (const zone of ['Asia/Kolkata', 'America/New_York', 'Europe/Berlin']) {
    const code = `
      const assert = require('node:assert/strict');
      const {loadSource} = require(${JSON.stringify(require.resolve('./flow-test-host.cjs'))});
      const {completePersonal, personalDueAt, validatePersonal, PERSONAL_DEFAULTS} = loadSource('lib/personal-tasks.ts');
      const first = {...PERSONAL_DEFAULTS, title:'Daily', id:'personal-dst', seriesId:'personal-dst', occurrence:0, status:'todo', dueDate:'2026-03-07', dueTime:'09:30', recurrence:{frequency:'Daily'}};
      const second = completePersonal([first], first.id)[1];
      assert.equal(second.dueDate,'2026-03-08');
      assert.equal(personalDueAt(second).getHours(),9);
      assert.equal(personalDueAt(second).getMinutes(),30);
      assert.equal(completePersonal([second], second.id)[1].dueDate,'2026-03-09');
      if (process.env.TZ === 'America/New_York') assert.ok(validatePersonal({...first, dueDate:'2026-03-08', dueTime:'02:30'},new Date('2020-01-01')));
    `;
    const result = spawnSync(process.execPath, ['-e', code], { env: { ...process.env, TZ: zone }, encoding: 'utf8' });
    assert.equal(result.status, 0, zone + result.stderr);
  }
});

test('provider requests reminder permission and reconciles reminders after save/edit/complete/reopen/delete', async () => {
  const storage = {}, snapshots = []; let asked = 0;
  const render = host(storage, { mocks: { '@/lib/personal-notifications': {
    askPersonalReminderPermission: async () => { asked++; return undefined; },
    syncPersonalReminders: async (tasks) => { snapshots.push(plain(tasks)); return undefined; },
  } } });
  let flow = await render();
  await flow.savePersonalTask(input({ dueDate: '2090-12-01', dueTime: '10:00', reminder: 'At due time' })); flow = await render();
  assert.equal(asked, 1);
  const id = flow.personalTasks[0].id;
  assert.equal(snapshots.at(-1)[0].reminder, 'At due time');
  await flow.savePersonalTask({ ...flow.personalTasks[0], dueTime: '11:00', reminder: '1 hour before' }, id); flow = await render();
  assert.equal(snapshots.at(-1)[0].dueTime, '11:00');
  flow.completePersonalTask(id); flow = await render(); assert.equal(snapshots.at(-1)[0].status, 'done');
  flow.reopenPersonalTask(id); flow = await render(); assert.equal(snapshots.at(-1)[0].status, 'todo');
  flow.deletePersonalTask(id); flow = await render(); assert.deepEqual(snapshots.at(-1), []);
});

test('permission denial saves the task with a visible reminder warning', async () => {
  const storage = {}, render = host(storage, { mocks: { '@/lib/personal-notifications': {
    askPersonalReminderPermission: async () => 'Permission denied', syncPersonalReminders: async (tasks) => tasks.length ? 'Permission denied' : undefined,
  } } });
  let flow = await render();
  assert.equal((await flow.savePersonalTask(input({ dueDate: '2090-12-01', dueTime: '10:00', reminder: 'At due time' }))).ok, true);
  flow = await render();
  assert.equal(flow.personalTasks.length, 1);
  assert.match(flow.personalReminderNotice, /Permission denied/);
});

function walk(node, predicate) {
  if (Array.isArray(node)) return node.flatMap((item) => walk(item, predicate));
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...walk(node.props?.children, predicate)];
}
function uiHost(file, flow, params = {}) {
  const state = []; let cursor = 0;
  const navigation = [];
  const module = loadSource(file, {
    react: { useRef: (initial) => {
      const index = cursor++; if (!(index in state)) state[index] = { current: initial };
      return state[index];
    }, useState: (initial) => {
      const index = cursor++; if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    } },
    'expo-router': { router: { push: (path) => navigation.push(path), replace: (path) => navigation.push(path), back() {} }, useLocalSearchParams: () => params },
    '@expo/vector-icons': { Feather: 'Feather' },
    'react-native': { Platform: { OS: 'web' }, StyleSheet: { create: (value) => value }, View: 'View', ScrollView: 'ScrollView', Pressable: 'Pressable', TextInput: 'TextInput', Modal: 'Modal', KeyboardAvoidingView: 'View' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@/components/AppText': { AppText: 'AppText' }, '@/components/TaskRow': { TaskRow: 'TaskRow' }, '@/components/PersonalTaskRow': { PersonalTaskRow: 'PersonalTaskRow' },
    '@/components/ProjectDateField': { ProjectDateField: 'DateField' },
    '@/hooks/useColors': { useColors: () => ({}) }, '@/context/FlowContext': { useFlow: () => flow, daysRemaining: () => 1 },
  });
  return { navigation, render: () => { cursor = 0; const tree = module.default(); return typeof tree.type === 'function' ? tree.type(tree.props) : tree; } };
}

test('To-do screen shows direct Add To-do and all three functional filters', () => {
  const h = uiHost('app/(tabs)/tasks.tsx', {
    tasks: [{ id: 'p1', projectId: 'p', dueDate: '2026-01-01', status: 'todo' }],
    personalTasks: [{ ...input(), id: 'personal-1', status: 'todo' }],
  });
  let tree = h.render();
  assert.equal(walk(tree, (node) => node.type === 'TaskRow').length, 1);
  assert.equal(walk(tree, (node) => node.type === 'PersonalTaskRow').length, 1);
  walk(tree, (node) => node.props?.testID === 'add-personal-todo')[0].props.onPress();
  assert.equal(h.navigation[0], '/personal-task');
  walk(tree, (node) => node.props?.testID === 'todo-filter-Personal')[0].props.onPress(); tree = h.render();
  assert.equal(walk(tree, (node) => node.type === 'TaskRow').length, 0);
  assert.equal(walk(tree, (node) => node.type === 'PersonalTaskRow').length, 1);
  walk(tree, (node) => node.props?.testID === 'todo-filter-Projects')[0].props.onPress(); tree = h.render();
  assert.equal(walk(tree, (node) => node.type === 'TaskRow').length, 1);
  assert.equal(walk(tree, (node) => node.type === 'PersonalTaskRow').length, 0);
});

test('personal form rejects blank title, saves editable notes, and confirms deletion before mutation', async () => {
  let saved, deleted;
  const task = { ...input({ notes: 'Old notes' }), id: 'personal-form', status: 'todo' };
  const h = uiHost('app/personal-task.tsx', { hydrated: true, personalTasks: [task],
    savePersonalTask: async (value, id) => { saved = { value, id }; return { ok: true }; },
    deletePersonalTask: (id) => { deleted = id; },
  }, { id: task.id });
  let tree = h.render();
  walk(tree, (node) => node.props?.testID === 'personal-title')[0].props.onChangeText(' '); tree = h.render();
  await walk(tree, (node) => node.props?.testID === 'save-personal-task')[0].props.onPress();
  assert.equal(saved, undefined);
  tree = h.render();
  walk(tree, (node) => node.props?.testID === 'personal-title')[0].props.onChangeText('Renamed');
  walk(tree, (node) => node.props?.testID === 'personal-notes')[0].props.onChangeText('New notes'); tree = h.render();
  await walk(tree, (node) => node.props?.testID === 'save-personal-task')[0].props.onPress();
  assert.equal(saved.value.notes, 'New notes'); assert.equal(saved.value.title, 'Renamed'); assert.equal(saved.id, task.id);
  tree = h.render();
  walk(tree, (node) => node.props?.testID === 'delete-personal-task')[0].props.onPress(); tree = h.render();
  assert.equal(deleted, undefined);
  assert.equal(walk(tree, (node) => node.type === 'Modal')[0].props.visible, true);
  walk(tree, (node) => node.type === 'Modal')[0].props.onRequestClose(); tree = h.render();
  assert.equal(deleted, undefined);
  walk(tree, (node) => node.props?.testID === 'delete-personal-task')[0].props.onPress(); tree = h.render();
  walk(tree, (node) => node.props?.testID === 'confirm-delete-personal')[0].props.onPress();
  assert.equal(deleted, task.id);
});
