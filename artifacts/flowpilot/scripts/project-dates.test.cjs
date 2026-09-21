const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { host, plain, loadSource } = require('./flow-test-host.cjs');
const { localDateValue, parseTaskDate, readDate, addCalendarDays, calendarDaysUntil, projectStartDate } = loadSource('lib/task-utils.ts');

async function create(flow, date, name = 'Date test') {
  return flow.addProject({ name, client: 'Client', summary: '', templateId: flow.templates[0].id,
    projectStartDate: date, dueDate: addCalendarDays(parseTaskDate(date), 10).toISOString(), reminderFrequency: 'Daily' });
}

for (const [label, date] of [['today', localDateValue()], ['past', '2020-02-28'], ['future', '2032-12-25']]) {
  test(`${label} project start persists and anchors sequential task dates`, async () => {
    const storage = {}, render = host(storage);
    let flow = await render();
    const steps = plain(flow.templates[0].steps);
    assert.equal(await create(flow, date), true);
    flow = await render();
    const project = plain(flow.projects[0]);
    assert.equal(project.projectStartDate, date);
    assert.equal(localDateValue(readDate(project.startDate)), date);
    assert.equal(localDateValue(readDate(project.dueDate)), localDateValue(addCalendarDays(parseTaskDate(date), 10)));
    const tasks = plain(flow.tasks.filter((task) => task.projectId === project.id).sort((a, b) => a.order - b.order));
    let elapsed = 0;
    tasks.forEach((task, index) => {
      elapsed += steps[index].duration;
      assert.equal(localDateValue(readDate(task.dueDate)), localDateValue(addCalendarDays(parseTaskDate(date), elapsed)));
    });
    flow = await host(storage)();
    assert.deepEqual(plain(flow.projects.find((item) => item.id === project.id)), project);
    assert.deepEqual(plain(flow.tasks.filter((task) => task.projectId === project.id)), tasks);
  });
}

test('10 days means start + 10 calendar days; later step durations are cumulative', async () => {
  const storage = {}, render = host(storage);
  let flow = await render();
  const template = flow.templates[0];
  flow.updateTemplate(template.id, { ...template, steps: [
    { id: 'first', title: 'Ten days', duration: 10, description: '' },
    { id: 'next', title: 'Two more days', duration: 2, description: '' },
  ] }); flow = await render();
  await create(flow, '2026-09-21'); flow = await render();
  const dates = flow.tasks.filter((task) => task.projectId === flow.projects[0].id).map((task) => localDateValue(readDate(task.dueDate)));
  assert.deepEqual(plain(dates), ['2026-10-01', '2026-10-03']);
});

test('same template shifts with start date; later template edits and reload preserve existing projects', async () => {
  const storage = {}, render = host(storage);
  let flow = await render();
  await create(flow, '2026-09-21', 'First'); flow = await render();
  const firstId = flow.projects[0].id;
  await create(flow, '2026-10-01', 'Second'); flow = await render();
  const secondId = flow.projects[0].id;
  const first = flow.tasks.filter((task) => task.projectId === firstId);
  const second = flow.tasks.filter((task) => task.projectId === secondId);
  first.forEach((task, i) => assert.equal(calendarDaysUntil(second[i].dueDate, readDate(task.dueDate)), 10));
  const snapshot = plain({ projects: flow.projects, tasks: flow.tasks });
  const template = flow.templates[0];
  flow.updateTemplate(template.id, { ...template, steps: [...template.steps].reverse().map((step) => ({ ...step, duration: 99 })) });
  flow = await render();
  flow = await host(storage)();
  assert.deepEqual(plain(flow.projects), snapshot.projects);
  assert.deepEqual(plain(flow.tasks), snapshot.tasks);
});

test('legacy startDate fallback and deliberately stored task/deadline dates survive hydration', async () => {
  const storage = {};
  let flow = await host(storage)();
  const legacyProject = { ...plain(flow.projects[0]), startDate: '2021-04-03T13:45:00.000Z', dueDate: '2031-11-20T17:12:00.000Z' };
  delete legacyProject.projectStartDate;
  const tasks = plain(flow.tasks.filter((task) => task.projectId === legacyProject.id));
  tasks[0].dueDate = '2021-04-25T22:30:00.000Z';
  tasks[0].completedAt = '2021-04-18T09:00:00.000Z';
  tasks[1].dueDate = '2022-08-31T14:20:00.000Z';
  storage.value = JSON.stringify({ projects: [legacyProject], tasks });
  flow = await host(storage)();
  assert.equal(projectStartDate(flow.projects[0]).toISOString(), legacyProject.startDate);
  assert.deepEqual(plain(flow.projects[0]), legacyProject);
  assert.deepEqual(plain(flow.tasks), tasks);
  flow = await host(storage)();
  assert.deepEqual(plain(flow.tasks), tasks);
});

test('missing legacy startDate falls back to task evidence without moving any due dates', async () => {
  const storage = {};
  let flow = await host(storage)();
  const project = plain(flow.projects[0]);
  delete project.startDate;
  const tasks = plain(flow.tasks.filter((task) => task.projectId === project.id));
  tasks[0].dueDate = parseTaskDate('2026-09-22').toISOString();
  storage.value = JSON.stringify({ projects: [project], tasks });
  flow = await host(storage)();
  assert.equal(localDateValue(readDate(flow.projects[0].startDate)), '2026-09-21');
  assert.equal(flow.projects[0].dueDate, project.dueDate);
  assert.deepEqual(plain(flow.tasks), tasks);
});

test('creating other start dates never changes existing manual-task dates', async () => {
  const storage = {}, render = host(storage);
  let flow = await render();
  flow.addManualTask(flow.projects[0].id, { title: 'Surprise', dueDate: '2027-01-15' }); flow = await render();
  const manual = plain(flow.tasks.find((task) => task.isManual));
  await create(flow, '2020-01-01'); flow = await render();
  await create(flow, '2030-01-01'); flow = await render();
  flow = await host(storage)();
  assert.deepEqual(plain(flow.tasks.find((task) => task.id === manual.id)), manual);
});

test('invalid selected project dates cannot create project/task records', async () => {
  const storage = {}, render = host(storage);
  let flow = await render();
  const before = plain({ projects: flow.projects, tasks: flow.tasks });
  for (const projectStartDate of ['', '2026-02-30', 'not a date']) {
    assert.equal(await flow.addProject({ name: 'Invalid', client: 'Client', summary: '', templateId: flow.templates[0].id,
      projectStartDate, dueDate: new Date().toISOString(), reminderFrequency: 'Daily' }), false);
  }
  flow = await render();
  assert.deepEqual(plain({ projects: flow.projects, tasks: flow.tasks }), before);
});

test('days-left uses local dates across times of day, UTC boundaries and both DST transitions', () => {
  for (const timezone of ['Asia/Kolkata', 'America/New_York', 'Europe/Berlin', 'Pacific/Auckland', 'UTC']) {
    const script = `
      const assert = require('node:assert/strict');
      const { loadSource } = require(${JSON.stringify(require.resolve('./flow-test-host.cjs'))});
      const { calendarDaysUntil, localDateValue, parseTaskDate, addCalendarDays } = loadSource('lib/task-utils.ts');
      for (const [year, month, day] of [[2026, 8, 21], [2026, 2, 8], [2026, 10, 1], [2026, 2, 29], [2026, 9, 25], [2026, 3, 5], [2026, 8, 27]]) {
        const now = new Date(year, month, day, 23, 59);
        assert.equal(calendarDaysUntil(new Date(year, month, day, 0, 1).toISOString(), now), 0);
        assert.equal(calendarDaysUntil(new Date(year, month, day, 23, 59).toISOString(), new Date(year, month, day, 0, 1)), 0);
        assert.equal(calendarDaysUntil(new Date(year, month, day + 1, 0, 1).toISOString(), now), 1);
        assert.equal(calendarDaysUntil(new Date(year, month, day - 1, 23, 59).toISOString(), now), -1);
        assert.equal(calendarDaysUntil(new Date(year, month, day + 3, 12).toISOString(), now), 3);
        assert.equal(calendarDaysUntil(localDateValue(now), now), 0);
        const midnight = new Date(year, month, day);
        assert.equal(calendarDaysUntil(addCalendarDays(midnight, 10).toISOString(), midnight), 10);
        assert.equal(localDateValue(parseTaskDate(localDateValue(now))), localDateValue(now));
      }
      const boundary = new Date('2026-09-21T00:30:00.000Z');
      assert.equal(calendarDaysUntil(boundary.toISOString(), new Date(boundary.getFullYear(), boundary.getMonth(), boundary.getDate(), 12)), 0);
      if (process.env.TZ === 'America/New_York') {
        assert.equal((new Date(2026, 2, 9) - new Date(2026, 2, 8)) / 3600000, 23);
        assert.equal((new Date(2026, 10, 2) - new Date(2026, 10, 1)) / 3600000, 25);
      }
    `;
    const result = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: timezone }, encoding: 'utf8' });
    assert.equal(result.status, 0, `${timezone}: ${result.stderr || result.error || result.stdout}`);
  }
});

function walk(node, predicate) {
  if (Array.isArray(node)) return node.flatMap((child) => walk(child, predicate));
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...walk(node.props?.children, predicate)];
}

test('New Project defaults to today and submits selected calendar date plus relative project deadline', async () => {
  const state = []; let cursor = 0, saved;
  const { default: Screen } = loadSource('app/new-project.tsx', {
    react: { useState: (initial) => {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], (value) => { state[index] = value; }];
    }, useMemo: (fn) => fn() },
    '@expo/vector-icons': { Feather: 'Feather' }, 'expo-haptics': { notificationAsync: () => {}, NotificationFeedbackType: { Success: 'success' } },
    'expo-router': { router: { replace() {}, back() {} }, useLocalSearchParams: () => ({}) },
    'react-native': { Platform: { OS: 'web' }, KeyboardAvoidingView: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView', TextInput: 'TextInput', View: 'View', StyleSheet: { create: (value) => value } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@/components/AppText': { AppText: 'AppText' }, '@/components/ProjectDateField': { ProjectDateField: 'DateField' },
    '@/context/FlowContext': { useFlow: () => ({ templates: [{ id: 't', name: 'Flow', steps: [{ title: 'Step' }] }], addProject: async (input) => { saved = input; return true; } }) },
    '@/hooks/useColors': { useColors: () => ({}) },
  });
  const render = () => { cursor = 0; return Screen(); };
  let tree = render();
  assert.equal(walk(tree, (node) => node.type === 'DateField')[0].props.value, localDateValue());
  for (const label of ['PROJECT NAME', 'CLIENT OR TEAM']) walk(tree, (node) => node.props?.label === label)[0].props.onChangeText('Test');
  walk(tree, (node) => node.type === 'DateField')[0].props.onChange('2026-09-21');
  tree = render();
  const save = walk(tree, (node) => node.props?.testID === 'save-project')[0];
  assert.equal(save.props.disabled, false);
  await save.props.onPress();
  assert.equal(saved.projectStartDate, '2026-09-21');
  assert.equal(localDateValue(readDate(saved.dueDate)), '2026-10-01');
});

test('calendar picker selects a real leap day and cancel keeps the selected date', () => {
  const state = []; let cursor = 0, selected;
  const { ProjectDateField } = loadSource('components/ProjectDateField.tsx', {
    react: { useState: (initial) => {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    } },
    '@expo/vector-icons': { Feather: 'Feather' }, '@/components/AppText': { AppText: 'AppText' }, '@/hooks/useColors': { useColors: () => ({}) },
    'react-native': { Modal: 'Modal', Pressable: 'Pressable', TextInput: 'TextInput', View: 'View', StyleSheet: { create: (value) => value } },
  });
  const render = () => { cursor = 0; return ProjectDateField({ value: '2028-02-10', onChange: (date) => { selected = date; } }); };
  let tree = render();
  walk(tree, (node) => node.props?.testID === 'open-project-calendar')[0].props.onPress(); tree = render();
  assert.equal(walk(tree, (node) => node.type === 'Modal')[0].props.visible, true);
  assert.equal(walk(tree, (node) => node.props?.testID === 'calendar-2028-02-30').length, 0);
  walk(tree, (node) => node.props?.testID === 'calendar-2028-02-29')[0].props.onPress(); tree = render();
  assert.equal(selected, '2028-02-29');
  assert.equal(walk(tree, (node) => node.type === 'Modal')[0].props.visible, false);
  walk(tree, (node) => node.props?.testID === 'open-project-calendar')[0].props.onPress(); tree = render();
  walk(tree, (node) => node.type === 'Modal')[0].props.onRequestClose();
  assert.equal(selected, '2028-02-29');
});

test('midnight and app resume refresh date-dependent UI without changing saved data', async () => {
  let date = '2026-09-21', timer, onState;
  const storage = {};
  const utilities = loadSource('lib/task-utils.ts');
  const render = host(storage, {
    mocks: {
      '@/lib/task-utils': { ...utilities, localDateValue: () => date },
      'react-native': { AppState: { addEventListener: (_event, callback) => { onState = callback; return { remove() {} }; } } },
    },
    globals: { setTimeout: (callback, delay) => { timer = callback; assert.ok(delay > 0 && delay <= 26 * 3600000); return 1; } },
  });
  let flow = await render();
  const stored = storage.value;
  assert.equal(flow.calendarDate, date);
  date = '2026-09-22'; timer(); flow = await render();
  assert.equal(flow.calendarDate, date);
  date = '2026-09-25'; onState('active'); flow = await render();
  assert.equal(flow.calendarDate, date);
  assert.equal(storage.value, stored);
});

test('notification day labels use the same calendar rule as screens', async () => {
  const calls = [];
  const { scheduleProjectReminders } = loadSource('lib/notifications.ts', {
    'expo-notifications': {
      setNotificationHandler() {}, getPermissionsAsync: async () => ({ granted: true }),
      cancelScheduledNotificationAsync: async () => {}, SchedulableTriggerInputTypes: { DATE: 'date' },
      scheduleNotificationAsync: async (request) => { calls.push(request); return String(calls.length); },
    },
    '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async () => {} },
    'react-native': { Platform: { OS: 'android' } },
  });
  const due = addCalendarDays(new Date(), 1); due.setHours(23, 59, 0, 0);
  await scheduleProjectReminders({ id: 'p', name: 'Test', dueDate: due.toISOString(), remindersEnabled: true, reminderFrequency: 'Daily' },
    [{ id: 't', projectId: 'p', title: 'Step', dueDate: due.toISOString(), status: 'todo', order: 0 }], false);
  const onDueDay = calls.find((request) => localDateValue(request.trigger.date) === localDateValue(due));
  assert.ok(onDueDay);
  assert.match(onDueDay.content.body, /Due today/);
  assert.equal(calendarDaysUntil(due.toISOString(), onDueDay.trigger.date), 0);
});
