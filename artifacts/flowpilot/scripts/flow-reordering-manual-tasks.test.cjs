const { test } = require('node:test');
const assert = require('node:assert/strict');
const { host, plain, loadSource } = require('./flow-test-host.cjs');
const { moveItem, parseTaskDate, openTasksByDueDate } = loadSource('lib/task-utils.ts');

test('reordering persists and affects only projects created afterwards', async () => {
  const storage = {};
  let render = host(storage), flow = await render();
  const template = flow.templates[0];
  const originalSteps = plain(template.steps), projects = plain(flow.projects), tasks = plain(flow.tasks);
  const moved = moveItem(template.steps, 3, 1);
  assert.deepEqual(plain(template.steps), originalSteps);
  flow.updateTemplate(template.id, { ...template, steps: moved });
  flow = await render();
  assert.deepEqual(plain(flow.projects), projects);
  assert.deepEqual(plain(flow.tasks), tasks);
  render = host(storage); flow = await render();
  assert.deepEqual(plain(flow.templates[0].steps), plain(moved));
  await flow.addProject({ name: 'After reorder', client: 'Client', summary: '', templateId: template.id,
    dueDate: new Date().toISOString(), reminderFrequency: 'Daily' });
  flow = await render();
  const generated = flow.tasks.filter((task) => task.projectId === flow.projects[0].id).sort((a, b) => a.order - b.order);
  assert.deepEqual(plain(generated.map((task) => task.title)), plain(moved.map((step) => step.title)));
  assert.deepEqual(plain(generated.map((task) => task.order)), [0, 1, 2, 3]);
  assert.deepEqual(plain(flow.tasks.filter((task) => task.projectId !== flow.projects[0].id)), tasks);
  flow.addTemplate({ ...template, name: 'Reordered at creation', steps: moved });
  flow = await render();
  assert.deepEqual(plain(flow.templates[0].steps), plain(moved));
});

test('manual task persistence, isolation, completion, and combined To-do sorting', async () => {
  const storage = {};
  let render = host(storage), flow = await render();
  // Normalize baseline through the existing reload behavior before comparing deadlines.
  render = host(storage); flow = await render();
  const original = plain({ projects: flow.projects, tasks: flow.tasks, templates: flow.templates });
  const projectId = flow.projects[0].id;
  assert.equal(flow.addManualTask(projectId, { title: '  Extra site visit  ', dueDate: '2027-02-15' }), true);
  flow = await render();
  const manual = plain(flow.tasks.find((task) => task.isManual));
  assert.equal(manual.title, 'Extra site visit');
  assert.equal(manual.projectId, projectId);
  assert.equal(manual.dueDate, parseTaskDate('2027-02-15').toISOString());
  assert.deepEqual(plain(flow.projects), original.projects);
  assert.deepEqual(plain(flow.templates), original.templates);
  assert.deepEqual(plain(flow.tasks.filter((task) => !task.isManual)), original.tasks);
  assert.equal(flow.tasks.filter((task) => task.projectId !== projectId && task.isManual).length, 0);
  const combined = openTasksByDueDate(flow.tasks);
  assert.ok(combined.some((task) => task.id === manual.id));
  assert.ok(combined.some((task) => !task.isManual));
  for (let i = 1; i < combined.length; i++) assert.ok(Date.parse(combined[i - 1].dueDate) <= Date.parse(combined[i].dueDate));
  flow.toggleTask(manual.id, projectId); flow = await render();
  assert.equal(flow.tasks.find((task) => task.id === manual.id).status, 'done');
  assert.deepEqual(plain(flow.projects), original.projects);
  assert.deepEqual(plain(flow.tasks.filter((task) => !task.isManual)), original.tasks);
  render = host(storage); flow = await render();
  const completed = flow.tasks.find((task) => task.id === manual.id);
  assert.equal(completed.status, 'done');
  assert.equal(completed.dueDate, manual.dueDate);
  assert.ok(completed.completedAt);
  assert.deepEqual(plain(flow.projects), original.projects);
  flow.toggleTask(manual.id, projectId); flow = await render();
  assert.equal(flow.tasks.find((task) => task.id === manual.id).status, 'todo');
  assert.equal(flow.tasks.find((task) => task.id === manual.id).dueDate, manual.dueDate);
  render = host(storage); flow = await render();
  assert.deepEqual(plain(flow.tasks.find((task) => task.id === manual.id)), manual);
  assert.deepEqual(plain(flow.templates), original.templates);
});

test('normal completion/reopening cannot reschedule or reopen manual work', async () => {
  const storage = {}, render = host(storage);
  let flow = await render();
  const projectId = flow.projects[0].id;
  flow.addManualTask(projectId, { title: 'Extra', dueDate: '2025-01-01' }); flow = await render();
  const task = flow.tasks.find((item) => item.isManual);
  flow.toggleTask(task.id, projectId); flow = await render();
  const snapshot = plain(flow.tasks.find((item) => item.id === task.id));
  const workflowTask = flow.tasks.find((item) => item.projectId === projectId && !item.isManual && item.status === 'todo');
  flow.toggleTask(workflowTask.id, projectId); flow = await render();
  flow.toggleTask(workflowTask.id, projectId); flow = await render();
  assert.deepEqual(plain(flow.tasks.find((item) => item.id === task.id)), snapshot);
});

test('manual tasks can be added after the source template is deleted', async () => {
  const storage = {}, render = host(storage);
  let flow = await render();
  const project = flow.projects[0];
  flow.deleteTemplate(project.templateId); flow = await render();
  assert.equal(flow.addManualTask(project.id, { title: 'Follow-up', dueDate: '2026-12-31' }), true);
  flow = await render();
  assert.ok(flow.tasks.some((task) => task.isManual && task.projectId === project.id));
  assert.equal(flow.templates.some((template) => template.id === project.templateId), false);
});

test('manual task validation rejects blanks, invalid dates and missing projects', async () => {
  const storage = {}, render = host(storage);
  let flow = await render();
  const original = plain(flow.tasks), projectId = flow.projects[0].id;
  for (const date of ['', '2027-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-09-00', 'not a date']) {
    assert.equal(flow.addManualTask(projectId, { title: 'Task', dueDate: date }), false);
  }
  assert.equal(flow.addManualTask(projectId, { title: ' ', dueDate: '2028-02-29' }), false);
  assert.equal(flow.addManualTask('missing', { title: 'Task', dueDate: '2028-02-29' }), false);
  flow = await render();
  assert.deepEqual(plain(flow.tasks), original);
  assert.ok(parseTaskDate('2028-02-29'));
});

test('completion targets the selected project even when workflow step IDs are shared', async () => {
  const storage = {}, render = host(storage);
  let flow = await render();
  await flow.addProject({ name: 'Same template', client: 'Client', summary: '', templateId: flow.templates[0].id,
    dueDate: new Date().toISOString(), reminderFrequency: 'Daily' });
  flow = await render();
  const target = flow.tasks.find((task) => task.projectId === 'p-northstar' && task.status === 'todo');
  const otherTasks = plain(flow.tasks.filter((task) => task.projectId !== target.projectId));
  flow.toggleTask(target.id, target.projectId); flow = await render();
  assert.equal(flow.tasks.find((task) => task.projectId === target.projectId && task.id === target.id).status, 'done');
  assert.deepEqual(plain(flow.tasks.filter((task) => task.projectId !== target.projectId)), otherTasks);
});

test('reorder boundaries and large lists preserve all step identities', () => {
  const steps = Array.from({ length: 200 }, (_, i) => ({ id: String(i) }));
  assert.equal(moveItem(steps, 0, -1), steps);
  assert.equal(moveItem(steps, 199, 200), steps);
  const moved = moveItem(steps, 199, 1);
  assert.equal(moved[1].id, '199');
  assert.equal(new Set(moved.map((step) => step.id)).size, 200);
  assert.equal(steps[1].id, '1');
});

test('To-do screen actually renders manual tasks alongside workflow tasks', () => {
  const manual = { id: 'manual-test', projectId: 'a', title: 'Extra', status: 'todo', dueDate: '2026-01-01', isManual: true };
  const normal = { id: 'step', projectId: 'b', title: 'Workflow', status: 'todo', dueDate: '2026-01-02' };
  const { default: TasksScreen } = loadSource('app/(tabs)/tasks.tsx', {
    react: { useState: (value) => [value, () => {}] },
    'expo-router': { router: {} },
    '@/components/PersonalTaskRow': { PersonalTaskRow: 'PersonalTaskRow' },
    '@expo/vector-icons': { Feather: 'Feather' },
    'react-native': { Platform: { OS: 'web' }, ScrollView: 'ScrollView', View: 'View', StyleSheet: { create: (value) => value } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@/components/AppText': { AppText: 'AppText' }, '@/components/TaskRow': { TaskRow: 'TaskRow' },
    '@/context/FlowContext': { useFlow: () => ({ tasks: [normal, manual], personalTasks: [] }), daysRemaining: () => 1 },
    '@/hooks/useColors': { useColors: () => ({}) },
  });
  const found = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (node.type === 'TaskRow') found.push(node.props.task.id);
    walk(node.props?.children);
  };
  walk(TasksScreen());
  assert.deepEqual(found, ['manual-test', 'step']);
});

test('drag callbacks move fifth step to second, cancel safely, and scroll at edges', () => {
  let nextFrame;
  const pans = [], dragging = [];
  const metrics = { current: { offset: 0, top: 0, height: 600, contentHeight: 1200 } };
  const offsets = [];
  const steps = ['Payment', 'Launch', 'Site Visit', 'Hand Holding', 'Pre assessment'].map((title, i) => ({ id: String(i), title }));
  let changed;
  const { ReorderableSteps } = loadSource('components/ReorderableSteps.tsx', {
    react: { useRef: (value) => ({ current: value }), useState: (value) => [value, () => {}], useCallback: (fn) => fn, useEffect: () => {} },
    '@expo/vector-icons': { Feather: 'Feather' },
    'react-native': { View: 'View', Pressable: 'Pressable', StyleSheet: { create: (value) => value } },
    'react-native-gesture-handler': { GestureDetector: 'GestureDetector', Gesture: { Pan: () => {
      const pan = { callbacks: {}, activateAfterLongPress(ms) { this.delay = ms; return this; }, maxPointers() { return this; }, runOnJS() { return this; } };
      for (const event of ['onStart', 'onUpdate', 'onEnd', 'onFinalize']) pan[event] = function (fn) { this.callbacks[event] = fn; return this; };
      pans.push(pan); return pan;
    } } },
    '@/components/AppText': { AppText: 'AppText' }, '@/hooks/useColors': { useColors: () => ({}) },
  }, { requestAnimationFrame: (fn) => { nextFrame = fn; return 1; }, cancelAnimationFrame: () => { nextFrame = null; } });
  const tree = ReorderableSteps({ steps, onChange: (items) => { changed = items; }, renderStep: () => null,
    metrics, onDragging: (value) => dragging.push(value), scrollRef: { current: {
      getNativeScrollRef: () => ({ measureInWindow: (callback) => callback(0, 0, 300, 600) }),
      scrollTo: ({ y }) => offsets.push(y),
    } } });
  const rows = tree.props.children[1];
  rows.forEach((row, i) => row.props.onLayout({ nativeEvent: { layout: { y: i * 110, height: 100 } } }));
  assert.equal(pans[4].delay, 300);
  pans[4].callbacks.onStart({ absoluteY: 490 });
  pans[4].callbacks.onUpdate({ translationY: -350, absoluteY: 140 });
  pans[4].callbacks.onEnd({}, true);
  assert.deepEqual(plain(changed.map((step) => step.title)), ['Payment', 'Pre assessment', 'Launch', 'Site Visit', 'Hand Holding']);
  assert.deepEqual(dragging, [true, false]);
  changed = undefined;
  pans[0].callbacks.onStart({ absoluteY: 50 });
  pans[0].callbacks.onUpdate({ translationY: 350, absoluteY: 400 });
  pans[0].callbacks.onFinalize();
  assert.equal(changed, undefined);
  pans[0].callbacks.onStart({ absoluteY: 590 });
  nextFrame();
  assert.equal(offsets.at(-1), 8);
  pans[0].callbacks.onFinalize();
  assert.equal(nextFrame, null);
});
