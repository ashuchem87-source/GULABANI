const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { host, plain, loadSource } = require('./flow-test-host.cjs');
const w = loadSource('lib/workflow-intelligence.ts');
const dates = loadSource('lib/task-utils.ts');
const pm = loadSource('lib/project-management.ts');
const dashboard = loadSource('lib/dashboard.ts');
const personal = loadSource('lib/personal-tasks.ts');
const settings = loadSource('lib/settings.ts');
const palettes = loadSource('constants/colors.ts').default;
const today = dates.localDateValue();
const date = (offset) => dates.localDateValue(dates.addCalendarDays(dates.readDate(today), offset));
const project = { id: 'p', name: 'Project', client: 'Client', summary: 'Keep', templateId: 'template', startDate: '2021-04-03T13:45:00.000Z', projectStartDate: '2021-04-03', dueDate: date(3), reminderFrequency: 'Daily', remindersEnabled: false, status: 'Active' };
const task = (id, extra = {}) => ({ id, projectId: 'p', title: id, description: 'Keep description', duration: 1, order: 0, status: 'todo', dueDate: date(1), ...extra });
const chain = () => [task('a', { dueDate: date(-3), sourceTemplateStepId: 'a' }), task('b', { dependsOn: ['a'], order: 1 }), task('c', { dependsOn: ['b'], order: 2, dueDate: date(2) })];
const template = { id: 'template', name: 'CII SELF', category: 'Custom', description: '', color: '#fff', steps: [{ id: 'a', title: 'Original step', description: '', duration: 1 }] };
const personalTask = { ...plain(personal.PERSONAL_DEFAULTS), id: 'personal', title: 'Personal', status: 'todo', createdAt: new Date().toISOString(), seriesId: 'personal', occurrence: 0, dueDate: today };
const state = (patch = {}) => ({ projects: [plain(project)], tasks: chain(), templates: [plain(template)], personalTasks: [plain(personalTask)], ...patch });
const ids = (items) => plain(items.map((item) => item.id));
function setup(data = state(), options = {}) {
  const storage = { value: JSON.stringify(data) }, alerts = [];
  return { storage, alerts, render: host(storage, { ...options, mocks: {
    'react-native': { AppState: { addEventListener: () => ({ remove() {} }) }, Alert: { alert: (...args) => alerts.push(args) } },
    ...options.mocks,
  } }) };
}
const proposalFor = (flow, shift) => w.buildRescheduleProposal(flow.projects[0], flow.tasks, 'a', today, shift);

for (const [label, target, others, expected] of [
  ['legacy without metadata', task('a'), [], 'Ready'],
  ['empty dependency list', task('a', { dependsOn: [] }), [], 'Ready'],
  ['incomplete prerequisite', task('b', { dependsOn: ['a'] }), [task('a')], 'Blocked'],
  ['completed prerequisite', task('b', { dependsOn: ['a'] }), [task('a', { status: 'done' })], 'Ready'],
  ['one of multiple prerequisites open', task('c', { dependsOn: ['a', 'b'] }), [task('a', { status: 'done' }), task('b')], 'Blocked'],
  ['all multiple prerequisites complete', task('c', { dependsOn: ['a', 'b'] }), [task('a', { status: 'done' }), task('b', { status: 'done' })], 'Ready'],
  ['completed dependent', task('b', { status: 'done', dependsOn: ['a'] }), [task('a')], 'Completed'],
  ['missing reference ignored', task('b', { dependsOn: ['gone'] }), [task('a')], 'Ready'],
  ['cross-project reference ignored', task('b', { dependsOn: ['a'] }), [task('a', { projectId: 'other' })], 'Ready'],
  ['malformed reference field ignored', task('b', { dependsOn: 'a' }), [task('a')], 'Ready'],
  ['self reference ignored in legacy calculations', task('a', { dependsOn: ['a'] }), [], 'Ready'],
]) test('workflow state: ' + label, () => {
  const tasks = [target, ...others], before = JSON.stringify(tasks);
  assert.equal(w.getTaskWorkflowState(target, tasks), expected);
  assert.equal(JSON.stringify(tasks), before);
});
test('duplicate and malformed dependency IDs do not double-count blockers', () => {
  const target = task('b', { dependsOn: ['a', 'a', null, 9] });
  assert.deepEqual(ids(w.getIncompleteDependencies(target, [task('a'), target])), ['a']);
});
for (const [label, tasks, target, selected, pattern] of [
  ['self', [task('a')], 'a', ['a'], /itself/],
  ['cross-project', [task('a'), task('b', { projectId: 'other' })], 'a', ['b'], /same project/],
  ['missing', [task('a')], 'a', ['gone'], /same project/],
  ['two-node cycle', [task('a'), task('b', { dependsOn: ['a'] })], 'a', ['b'], /circular workflow/],
  ['multi-node cycle', chain(), 'a', ['c'], /circular workflow/],
  ['malformed list', chain(), 'b', null, /valid prerequisite/],
  ['malformed member', chain(), 'b', [1], /valid prerequisite/],
]) test('dependency validation rejects ' + label, () => {
  const before = JSON.stringify(tasks);
  assert.match(w.validateDependencies(tasks.find((item) => item.id === target), selected, tasks), pattern);
  assert.equal(JSON.stringify(tasks), before);
});
test('valid dependency chain and duplicate selections accepted', () => {
  const tasks = chain(); assert.equal(w.validateDependencies(tasks[2], ['a', 'b', 'a'], tasks), undefined);
});
test('shared template IDs resolve prerequisites only inside owning project', () => {
  const tasks = [task('a'), task('a', { projectId: 'other', status: 'done' }), task('b', { dependsOn: ['a'] })];
  assert.equal(w.validateDependencies(tasks[2], ['a'], tasks), undefined);
  assert.equal(w.getTaskWorkflowState(tasks[2], tasks), 'Blocked');
});
test('direct and indirect downstream traversal', () => { const tasks = chain(); assert.deepEqual(ids(w.getDownstreamTasks(tasks[0], tasks)), ['b', 'c']); assert.deepEqual(ids(w.getDownstreamTasks(tasks[1], tasks)), ['c']); });
test('diamond traversal emits shared dependent once', () => {
  const tasks = [task('a'), task('b', { dependsOn: ['a'] }), task('c', { dependsOn: ['a'] }), task('d', { dependsOn: ['b', 'c'] })];
  assert.deepEqual(ids(w.getDownstreamTasks(tasks[0], tasks)), ['b', 'c', 'd']);
});
test('corrupt stored cycles cannot loop or include source in its own downstream list', () => {
  const tasks = chain(); tasks[0].dependsOn = ['c']; assert.deepEqual(ids(w.getDownstreamTasks(tasks[0], tasks)), ['b', 'c']);
});
test('traversal excludes foreign-project and personal tasks', () => {
  const tasks = [...chain(), task('foreign', { projectId: 'other', dependsOn: ['a'] }), { ...personalTask, dependsOn: ['a'] }];
  assert.deepEqual(ids(w.getDownstreamTasks(tasks[0], tasks)), ['b', 'c']);
});
test('iterative graph traversal handles a deep workflow without stack overflow', () => {
  const tasks = Array.from({ length: 5000 }, (_, i) => task(String(i), { dependsOn: i ? [String(i - 1)] : [] }));
  assert.equal(w.getDownstreamTasks(tasks[0], tasks).length, 4999);
  assert.equal(w.wouldCreateCycle(tasks[0], ['4999'], tasks), true);
});
for (const [label, more, expected] of [
  ['past due', { dueDate: date(-2) }, 2], ['today', { dueDate: today }, 0], ['future', { dueDate: date(1) }, 0],
  ['completed past due', { dueDate: date(-2), status: 'done' }, 0], ['undated', { dueDate: '' }, 0], ['invalid', { dueDate: 'bad' }, 0],
]) test('overdue classification: ' + label, () => assert.equal(w.overdueDays(task('a', more), today), expected));
test('impact counts incomplete descendants of delayed tasks, unions branches and ignores completed descendants', () => {
  const tasks = [...chain(), task('d', { dependsOn: ['a', 'b'] }), task('e', { dependsOn: ['d'], status: 'done' })];
  tasks[1].dueDate = date(-1);
  assert.deepEqual(ids(w.getPotentiallyImpactedTasks('p', tasks, today)), ['b', 'c', 'd']);
});
test('blocked future tasks do not cause false delay impact or Attention Needed', () => {
  const tasks = chain().map((item) => ({ ...item, dueDate: date(1) }));
  assert.deepEqual(ids(w.getPotentiallyImpactedTasks('p', tasks, today)), []);
  assert.equal(pm.projectHealth(project, tasks, today), 'On Track');
});
test('workflow summary derives ready, blocked, overdue and unique impacted counts', () => {
  assert.deepEqual(plain(w.workflowCounts('p', chain(), today)), { ready: 1, blocked: 2, overdue: 1, impacted: 2 });
});
for (const size of [0, 1]) test('workflow edge state with ' + size + ' tasks', () => {
  const tasks = Array.from({ length: size }, (_, i) => task(String(i)));
  assert.deepEqual(plain(w.workflowCounts('p', tasks, today)), { ready: size, blocked: 0, overdue: 0, impacted: 0 });
});

test('proposal shifts only dated incomplete downstream tasks, preserving source and other data', () => {
  const tasks = [...chain(), task('done', { dependsOn: ['a'], status: 'done', completedAt: '2020-01-01' }), task('no-date', { dependsOn: ['b'], dueDate: '', isManual: true }), task('other', { dependsOn: ['a'], projectId: 'other' }), personalTask];
  const before = JSON.stringify([project, tasks]);
  const preview = w.buildRescheduleProposal(project, tasks, 'a', today);
  assert.deepEqual(plain(preview.changes.map((item) => item.taskId)), ['b', 'c']);
  for (const change of preview.changes) assert.equal(dates.calendarDaysUntil(change.to, dates.readDate(change.from)), 3);
  assert.equal(preview.undatedCount, 1); assert.equal(preview.beyondDeadlineDays, 2);
  assert.equal(JSON.stringify([project, tasks]), before);
});
test('branching proposal shifts a shared descendant exactly once', () => {
  const tasks = [...chain(), task('d', { dependsOn: ['a', 'b', 'c'] })];
  assert.deepEqual(plain(w.buildRescheduleProposal(project, tasks, 'a', today).changes.map((item) => item.taskId)), ['b', 'c', 'd']);
});
test('zero shift produces no changes and no extension', () => { const proposal = w.buildRescheduleProposal(project, chain(), 'a', today, 0); assert.equal(proposal.changes.length, 0); assert.equal(proposal.beyondDeadlineDays, 0); });
test('custom shift replaces computed delay deterministically', () => { const proposal = w.buildRescheduleProposal(project, chain(), 'a', today, 7); assert.equal(proposal.shiftDays, 7); assert.equal(dates.calendarDaysUntil(proposal.changes[0].to, dates.readDate(date(1))), 7); });
for (const shift of [-1, 1.5, NaN, Infinity, 3651, '3']) test('invalid shift rejected: ' + shift, () => {
  assert.throws(() => w.buildRescheduleProposal(project, chain(), 'a', today, shift), /whole number/);
});
test('archived, completed source, future source and invalid project deadline reject proposals', () => {
  assert.throws(() => w.buildRescheduleProposal({ ...project, archived: true }, chain(), 'a', today));
  assert.throws(() => w.buildRescheduleProposal(project, [task('a', { status: 'done', dueDate: date(-1) })], 'a', today));
  assert.throws(() => w.buildRescheduleProposal(project, [task('a')], 'a', today));
  assert.throws(() => w.buildRescheduleProposal({ ...project, dueDate: 'bad' }, chain(), 'a', today), /deadline/);
});
test('corrupt dates cannot generate NaN schedule proposals', () => {
  const tasks = chain(); tasks[1].dueDate = 'invalid';
  const proposal = w.buildRescheduleProposal(project, tasks, 'a', today);
  assert.equal(proposal.undatedCount, 1); assert.deepEqual(plain(proposal.changes.map((item) => item.taskId)), ['c']);
});
test('proposal with no eligible dated descendants has no changes', () => {
  const tasks = [task('a', { dueDate: date(-1) }), task('b', { dependsOn: ['a'], dueDate: '' })];
  assert.equal(w.buildRescheduleProposal(project, tasks, 'a', today).changes.length, 0);
});
test('proposal validation rejects modified contents and stale local date', () => {
  const tasks = chain(), preview = w.buildRescheduleProposal(project, tasks, 'a', today);
  assert.equal(w.validateRescheduleProposal(preview, project, tasks, today), undefined);
  const tampered = plain(preview); tampered.changes[0].to = date(99);
  assert.match(w.validateRescheduleProposal(tampered, project, tasks, today), /no longer valid/);
  assert.match(w.validateRescheduleProposal(preview, project, tasks, date(1)), /changed/);
});
for (const zone of ['Asia/Kolkata', 'America/New_York', 'Europe/Berlin', 'Pacific/Auckland', 'UTC']) test('local delay and DST-safe shifts in ' + zone, () => {
  const script = `const assert=require('node:assert/strict');const {loadSource}=require(${JSON.stringify(require.resolve('./flow-test-host.cjs'))});const w=loadSource('lib/workflow-intelligence.ts'),d=loadSource('lib/task-utils.ts');for(const [y,m,day] of [[2026,2,8],[2026,10,1],[2026,2,29],[2026,9,25]]){const today=d.localDateValue(new Date(y,m,day));const a={id:'a',projectId:'p',status:'todo',dueDate:new Date(y,m,day-3,23,30).toISOString()};const b={id:'b',projectId:'p',status:'todo',dueDate:new Date(y,m,day,12).toISOString(),dependsOn:['a']};assert.equal(w.overdueDays(a,today),3);assert.equal(w.overdueDays(b,today),0);const p=w.buildRescheduleProposal({id:'p',dueDate:new Date(y,m,day+1).toISOString()},[a,b],'a',today);assert.equal(d.calendarDaysUntil(p.changes[0].to,d.readDate(b.dueDate)),3);assert.equal(d.readDate(p.changes[0].to).getHours(),12);}`;
  const result = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: zone }, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr);
});

for (const isManual of [false, true]) test((isManual ? 'manual' : 'template snapshot') + ' dependencies persist without modifying source template or other projects', async () => {
  const initial = state({ tasks: [task('a'), task('b', { isManual }), task('b', { projectId: 'other' })] }), h = setup(initial);
  let flow = await h.render(); assert.equal(flow.setTaskDependencies('p', 'b', ['a', 'a']), undefined);
  flow = await h.render(); flow = await host(h.storage)();
  assert.deepEqual(plain(flow.tasks[1].dependsOn), ['a']); assert.deepEqual(plain(flow.templates), initial.templates);
  assert.deepEqual(plain(flow.projects), initial.projects); assert.deepEqual(plain(flow.personalTasks), initial.personalTasks); assert.deepEqual(plain(flow.tasks[2]), initial.tasks[2]);
});
test('invalid dependency save is atomic and leaves persisted bytes unchanged', async () => {
  const h = setup(); let flow = await h.render(); const before = h.storage.value;
  assert.match(flow.setTaskDependencies('p', 'a', ['c']), /circular/); flow = await h.render(); assert.equal(h.storage.value, before);
});
test('deliberate dependency edit removes missing refs; hydration itself preserves them', async () => {
  const initial = state(); initial.tasks[1].dependsOn = ['a', 'gone']; const h = setup(initial); let flow = await h.render();
  assert.deepEqual(plain(flow.tasks), initial.tasks); flow.setTaskDependencies('p', 'b', ['a']); flow = await h.render(); assert.deepEqual(plain(flow.tasks[1].dependsOn), ['a']);
});
test('blocked completion prompts, cancel changes nothing, explicit override completes only chosen manual task', async () => {
  const initial = state({ tasks: chain().map((item) => ({ ...item, isManual: true })) }), h = setup(initial); let flow = await h.render(); const before = h.storage.value;
  flow.toggleTask('b', 'p'); flow = await h.render(); assert.equal(h.alerts.length, 1); assert.equal(h.storage.value, before);
  assert.match(h.alerts[0][1], /incomplete prerequisites/); assert.equal(h.alerts[0][2][0].text, 'Cancel');
  h.alerts[0][2][1].onPress(); flow = await h.render();
  assert.equal(flow.tasks[1].status, 'done'); assert.ok(flow.tasks[1].completedAt); assert.deepEqual(plain(flow.tasks[0]), initial.tasks[0]); assert.deepEqual(plain(flow.tasks[2]), initial.tasks[2]);
  assert.deepEqual(plain(flow.tasks[1].dependsOn), ['a']); assert.equal(flow.projects[0].dueDate, initial.projects[0].dueDate);
});
test('template completion override keeps prerequisite incomplete and uses existing completion timestamp behavior', async () => {
  const h = setup(); let flow = await h.render(); flow.toggleTask('b', 'p'); h.alerts[0][2][1].onPress(); flow = await h.render();
  assert.equal(flow.tasks.find((item) => item.id === 'a').status, 'todo');
  const b = flow.tasks.find((item) => item.id === 'b'); assert.equal(b.status, 'done'); assert.equal(dates.localDateValue(dates.readDate(b.completedAt)), today); assert.deepEqual(plain(b.dependsOn), ['a']);
});
test('completion and reopening of a prerequisite derives Ready then Blocked', async () => {
  const h = setup(state({ tasks: chain().map((item) => ({ ...item, isManual: true })) })); let flow = await h.render();
  flow.toggleTask('a', 'p'); flow = await h.render(); assert.equal(w.getTaskWorkflowState(flow.tasks[1], flow.tasks), 'Ready');
  flow.toggleTask('a', 'p'); flow = await h.render(); assert.equal(w.getTaskWorkflowState(flow.tasks[1], flow.tasks), 'Blocked');
});
test('repeated completion confirmation never reopens a task', async () => {
  const h = setup(state({ tasks: chain().map((item) => ({ ...item, isManual: true })) })); let flow = await h.render();
  flow.toggleTask('b', 'p'); const confirm = h.alerts[0][2][1].onPress; confirm(); confirm(); flow = await h.render(); assert.equal(flow.tasks[1].status, 'done');
});
test('changed prerequisites require a fresh blocked completion confirmation', async () => {
  const h = setup(state({ tasks: [...chain(), task('x')] })); let flow = await h.render(); flow.toggleTask('b', 'p');
  flow.setTaskDependencies('p', 'b', ['x']); h.alerts[0][2][1].onPress(); flow = await h.render(); assert.equal(h.alerts.length, 2); assert.equal(flow.tasks[1].status, 'todo');
});
test('dependency edits in one render batch reject a newly introduced cycle', async () => {
  const h = setup(state({ tasks: [task('a'), task('b')] })); let flow = await h.render(); flow.setTaskDependencies('p', 'a', ['b']);
  assert.match(flow.setTaskDependencies('p', 'b', ['a']), /circular/); flow = await h.render(); assert.deepEqual(plain(flow.tasks[0].dependsOn), ['b']); assert.equal(flow.tasks[1].dependsOn, undefined);
});
test('reschedule apply changes only eligible due dates and persists full task metadata', async () => {
  const initial = state({ tasks: [...chain(), task('manual', { dependsOn: ['a'], isManual: true, completedAt: 'legacy-marker' }), task('done', { dependsOn: ['a'], status: 'done', completedAt: '2021-01-01' }), task('undated', { dependsOn: ['a'], dueDate: '' }), task('b', { projectId: 'other' })] });
  const h = setup(initial); let flow = await h.render(); const preview = proposalFor(flow); assert.equal(flow.applyReschedule(preview), undefined); flow = await h.render(); flow = await host(h.storage)();
  const changed = new Map(preview.changes.map((item) => [item.taskId, item.to]));
  assert.deepEqual(plain(flow.tasks), initial.tasks.map((item) => item.projectId === 'p' && changed.has(item.id) ? { ...item, dueDate: changed.get(item.id) } : item));
  assert.deepEqual(plain(flow.projects), initial.projects); assert.deepEqual(plain(flow.templates), initial.templates); assert.deepEqual(plain(flow.personalTasks), initial.personalTasks);
});
for (const extend of [false, true]) test('reschedule deadline extension opt-in: ' + extend, async () => {
  const h = setup(); let flow = await h.render(); const preview = proposalFor(flow); flow.applyReschedule(preview, extend); flow = await h.render();
  assert.deepEqual(plain(flow.projects[0]), { ...project, dueDate: extend ? preview.proposedDeadline : project.dueDate });
  assert.equal(dates.calendarDaysUntil(flow.projects[0].dueDate, dates.readDate(today)), extend ? 5 : 3);
});
test('zero-day application leaves stored dates and metadata untouched', async () => {
  const h = setup(); let flow = await h.render(); const before = h.storage.value; flow.applyReschedule(proposalFor(flow, 0), true); flow = await h.render(); assert.equal(h.storage.value, before);
});
for (const kind of ['dependency', 'completion', 'archive', 'status', 'delete', 'tamper']) test('stale/invalid proposal cannot partially apply after ' + kind, async () => {
  const h = setup(); let flow = await h.render(); const preview = proposalFor(flow);
  if (kind === 'dependency') flow.setTaskDependencies('p', 'c', ['a']);
  if (kind === 'completion') flow.toggleTask('a', 'p');
  if (kind === 'archive') flow.setProjectArchived('p', true, true);
  if (kind === 'status') flow.setProjectStatus('p', 'On Hold');
  if (kind === 'delete') flow.deleteProjectTask('p', 'b', true);
  if (kind === 'tamper') preview.changes[0].to = 'invalid';
  flow = await h.render(); const before = h.storage.value; assert.ok(flow.applyReschedule(preview, true)); flow = await h.render(); assert.equal(h.storage.value, before);
});
test('double applying a proposal cannot shift dates twice, including same render batch', async () => {
  const h = setup(); let flow = await h.render(); const preview = proposalFor(flow); assert.equal(flow.applyReschedule(preview), undefined); assert.match(flow.applyReschedule(preview), /changed/);
  flow = await h.render(); assert.equal(flow.tasks[1].dueDate, preview.changes[0].to);
});
test('dependency cleanup removes only prerequisite reference, never downstream tasks or other project references', () => {
  const tasks = [...chain(), task('foreign', { projectId: 'other', dependsOn: ['a'] })], result = w.removeTaskAndDependencies('p', 'a', tasks);
  assert.deepEqual(ids(result), ['b', 'c', 'foreign']); assert.deepEqual(plain(result[0].dependsOn), []); assert.deepEqual(plain(result[1].dependsOn), ['b']); assert.deepEqual(plain(result[2].dependsOn), ['a']);
});
test('deleting prerequisite needs confirmation, persists cleanup and preserves schedules/template/history', async () => {
  const initial = state(), h = setup(initial); let flow = await h.render(); assert.equal(flow.deleteProjectTask('p', 'a'), false); flow = await h.render(); assert.deepEqual(plain(flow.tasks), initial.tasks);
  assert.equal(flow.deleteProjectTask('p', 'a', true), true); flow = await h.render(); flow = await host(h.storage)(); assert.deepEqual(ids(flow.tasks), ['b', 'c']); assert.deepEqual(plain(flow.tasks[0]), { ...initial.tasks[1], dependsOn: [] }); assert.deepEqual(plain(flow.projects), initial.projects); assert.deepEqual(plain(flow.templates), initial.templates);
});
test('archive/unarchive retains dependencies, rejects edits/reschedule/deletion, restores workflow availability', async () => {
  const h = setup(); let flow = await h.render(); const preview = proposalFor(flow), initial = plain(flow.tasks); flow.setProjectArchived('p', true, true); flow = await h.render();
  assert.ok(flow.setTaskDependencies('p', 'b', [])); assert.equal(flow.deleteProjectTask('p', 'a', true), false); assert.ok(flow.applyReschedule(preview)); assert.equal(pm.normalProjectTasks(flow.tasks, flow.projects).length, 0);
  const reloaded = host(h.storage); flow = await reloaded(); assert.deepEqual(plain(flow.tasks), initial); flow.setProjectArchived('p', false); flow = await reloaded(); assert.equal(w.getTaskWorkflowState(flow.tasks[1], flow.tasks), 'Blocked'); assert.equal(flow.setTaskDependencies('p', 'b', []), undefined);
});
for (const status of ['Active', 'Completed', 'On Hold', 'Not Started']) test(status + ' survives dependency edits and confirmed reschedule', async () => {
  const h = setup(state({ projects: [{ ...project, status }] })); let flow = await h.render(); flow.setTaskDependencies('p', 'c', ['a']); flow = await h.render(); flow.applyReschedule(proposalFor(flow)); flow = await h.render(); assert.equal(flow.projects[0].status, status);
});
test('fully completed project has no ready/blocked/overdue/impact or schedule prompt', () => {
  const tasks = chain().map((item) => ({ ...item, status: 'done' })); assert.deepEqual(plain(w.workflowCounts('p', tasks, today)), { ready: 0, blocked: 0, overdue: 0, impacted: 0 }); assert.equal(pm.projectProgress('p', tasks).percent, 100); assert.equal(pm.projectHealth({ ...project, status: 'Completed' }, tasks, today), 'Completed');
});
test('future start does not mark future tasks overdue or change Not Started status', () => {
  const tasks = chain().map((item) => ({ ...item, dueDate: date(10) })), future = { ...project, startDate: date(5), status: 'Not Started' };
  assert.equal(w.workflowCounts('p', tasks, today).overdue, 0); assert.equal(pm.projectHealth(future, tasks, today), 'Not Started');
});
test('dependency editing leaves Batch 7 progress and objective health unchanged', async () => {
  const h = setup(); let flow = await h.render(); const progress = plain(pm.projectProgress('p', flow.tasks)), health = pm.projectHealth(project, flow.tasks, today); flow.setTaskDependencies('p', 'b', []); flow = await h.render();
  assert.deepEqual(plain(pm.projectProgress('p', flow.tasks)), progress); assert.equal(pm.projectHealth(project, flow.tasks, today), health);
});
test('hydration preserves legacy historical fields, snapshots and unknown metadata without derived persistence', async () => {
  const initial = state({ tasks: [task('legacy', { dueDate: '2021-04-04T13:45:00Z', status: 'done', completedAt: '2021-04-05T14:00:00Z' }), task('open', { dependsOn: ['legacy', 'missing'], unknown: 'keep' })] });
  const h = setup(initial); const flow = await h.render(); w.workflowCounts('p', flow.tasks, today);
  assert.deepEqual(JSON.parse(h.storage.value), initial); assert.equal('dependsOn' in flow.tasks[0], false);
  for (const value of [...flow.projects, ...flow.tasks]) for (const key of ['ready', 'blocked', 'impacted', 'workflowState', 'proposal']) assert.equal(key in value, false);
});
test('new manual Quick Add task defaults to no dependencies and remains project isolated', async () => {
  const h = setup(); let flow = await h.render(); flow.addManualTask('p', { title: 'Surprise', dueDate: today }); flow = await h.render(); const added = flow.tasks.find((item) => item.title === 'Surprise'); assert.equal(added.dependsOn, undefined); assert.equal(w.getTaskWorkflowState(added, flow.tasks), 'Ready'); assert.deepEqual(plain(flow.templates), [template]);
});
test('dependency changes preserve dashboard buckets/counts and To-do order for mixed tasks', () => {
  const tasks = [task('late', { dueDate: date(-1) }), task('today', { dueDate: today }), task('future'), task('done', { status: 'done', completedAt: new Date().toISOString() })];
  const before = dashboard.dashboardCounts(dashboard.dashboardGroups(tasks, [personalTask], today));
  const linked = tasks.map((item) => ({ ...item, dependsOn: item.id === 'late' ? [] : ['late'] }));
  assert.deepEqual(plain(dashboard.dashboardCounts(dashboard.dashboardGroups(linked, [personalTask], today))), plain(before)); assert.deepEqual(plain(before), { today: 2, overdue: 1, upcoming: 1, completed: 1, unscheduled: 0 });
  assert.deepEqual(ids(dates.openTasksByDueDate(linked)), ids(dates.openTasksByDueDate(tasks)));
});
test('personal recurrence and reminder times survive project dependency/reschedule actions unchanged', async () => {
  let syncs = 0; const recurring = { ...personalTask, dueDate: date(2), dueTime: '12:00', reminder: '1 hour before', recurrence: { frequency: 'Daily' } };
  const h = setup(state({ personalTasks: [recurring] }), { mocks: { '@/lib/personal-notifications': { syncPersonalReminders: async () => { syncs++; }, askPersonalReminderPermission: async () => undefined } } });
  let flow = await h.render(); const baseline = syncs, before = personal.personalReminderAt(recurring).toISOString(); flow.setTaskDependencies('p', 'b', []); flow = await h.render(); flow.applyReschedule(proposalFor(flow)); flow = await h.render();
  assert.deepEqual(plain(flow.personalTasks), [recurring]); assert.equal(syncs, baseline); assert.equal(personal.personalReminderAt(flow.personalTasks[0]).toISOString(), before);
  flow.completePersonalTask('personal'); flow = await h.render(); assert.equal(flow.personalTasks.length, 2); assert.equal(flow.personalTasks.find((item) => item.status === 'todo').dueDate, date(3)); assert.ok(syncs > baseline);
});

function walk(node, predicate) { if (Array.isArray(node)) return node.flatMap((item) => walk(item, predicate)); if (!node || typeof node !== 'object') return []; return [...(predicate(node) ? [node] : []), ...walk(node.props?.children, predicate)]; }
const find = (tree, id) => walk(tree, (node) => node.props?.testID === id)[0];
function text(node) { if (Array.isArray(node)) return node.map(text).join(' '); if (node && typeof node === 'object') return text(node.props?.children); return String(node ?? ''); }
const native = { Platform: { OS: 'android' }, StyleSheet: { create: (value) => value, hairlineWidth: 1 }, View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView', Modal: 'Modal', TextInput: 'TextInput', KeyboardAvoidingView: 'View' };
function ui(file, flow, preferences = plain(settings.DEFAULT_SETTINGS), exportName) {
  const state = []; let cursor = 0, system = 'light';
  const api = loadSource(file, {
    react: { useMemo: (fn) => fn(), useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], (next) => { state[i] = typeof next === 'function' ? next(state[i]) : next; }]; } },
    'react-native': native, '@expo/vector-icons': { Feather: 'Feather' }, 'expo-haptics': { selectionAsync() {} },
    'expo-router': { router: { push() {}, replace() {}, back() {} }, useLocalSearchParams: () => ({ id: 'p' }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@/components/AppText': { AppText: 'AppText' }, '@/components/TaskRow': { TaskRow: 'TaskRow' }, '@/components/PersonalTaskRow': { PersonalTaskRow: 'PersonalTaskRow' }, '@/components/QuickAdd': { QuickAdd: 'QuickAdd' },
    '@/context/FlowContext': { useFlow: () => typeof flow === 'function' ? flow() : flow, daysRemaining: (value) => dates.calendarDaysUntil(value) },
    '@/context/SettingsContext': { useSettings: () => ({ settings: preferences }), useDateFormatter: () => (date) => settings.formatDate(date, preferences.dateFormat) },
    '@/hooks/useColors': { useColors: () => palettes[settings.resolveTheme(preferences.theme, system)] },
  });
  return { setSystem: (theme) => { system = theme; }, render(props) { cursor = 0; return (api[exportName] ?? api.default ?? api.TaskRow ?? api.PersonalTaskRow ?? api.QuickAdd)(props); } };
}
function actions(flow, preferences) { const view = ui('components/WorkflowIntelligence.tsx', flow, preferences, 'TaskWorkflowActions'); return { ...view, render(id = 'a') { const current = typeof flow === 'function' ? flow() : flow; return view.render({ project: current.projects[0], task: current.tasks.find((item) => item.id === id) }); } }; }
test('dependency picker lists same-project tasks, visible selection, blockers, saves multiple and can remove', async () => {
  const h = setup(state({ tasks: [...chain(), task('foreign', { projectId: 'other' })] })); let flow = await h.render(); const view = actions(() => flow);
  find(view.render('c'), 'dependencies-c').props.onPress(); let tree = view.render('c'); assert.equal(find(tree, 'prerequisite-c'), undefined); assert.equal(find(tree, 'prerequisite-foreign'), undefined); assert.equal(find(tree, 'prerequisite-b').props.accessibilityState.checked, true); assert.match(text(tree), /Blocked by:\s+b/);
  find(tree, 'prerequisite-a').props.onPress(); find(view.render('c'), 'save-dependencies').props.onPress(); flow = await h.render(); assert.deepEqual(plain(flow.tasks[2].dependsOn), ['b', 'a']);
  find(view.render('c'), 'dependencies-c').props.onPress(); find(view.render('c'), 'prerequisite-b').props.onPress(); find(view.render('c'), 'prerequisite-a').props.onPress(); find(view.render('c'), 'save-dependencies').props.onPress(); flow = await h.render(); assert.deepEqual(plain(flow.tasks[2].dependsOn), []);
});
test('dependency picker displays clear cycle error without saving or closing', async () => {
  const h = setup(); let flow = await h.render(); const view = actions(() => flow); find(view.render(), 'dependencies-a').props.onPress(); find(view.render(), 'prerequisite-c').props.onPress(); find(view.render(), 'save-dependencies').props.onPress(); assert.match(text(view.render()), /This dependency would create a circular workflow/); flow = await h.render(); assert.equal(flow.tasks[0].dependsOn, undefined);
});
test('dependency cancellation leaves storage unchanged', async () => {
  const h = setup(); let flow = await h.render(); const before = h.storage.value, view = actions(() => flow); find(view.render('c'), 'dependencies-c').props.onPress(); find(view.render('c'), 'prerequisite-a').props.onPress(); find(view.render('c'), 'cancel-workflow').props.onPress(); flow = await h.render(); assert.equal(h.storage.value, before);
});
test('schedule preview and Cancel write nothing, apply requires explicit action', async () => {
  const h = setup(); let flow = await h.render(); const view = actions(() => flow), before = h.storage.value;
  find(view.render(), 'impact-a').props.onPress(); assert.equal(find(view.render(), 'apply-schedule'), undefined); find(view.render(), 'preview-schedule').props.onPress(); let tree = view.render();
  assert.match(text(tree), /2\s+downstream tasks will have their due dates changed/); assert.match(text(tree), /Current:.*Proposed:/); assert.equal(find(tree, 'keep-deadline').props.accessibilityState.checked, true); assert.equal(find(tree, 'extend-deadline').props.accessibilityState.checked, false);
  flow = await h.render(); assert.equal(h.storage.value, before); find(view.render(), 'cancel-workflow').props.onPress(); flow = await h.render(); assert.equal(h.storage.value, before);
  find(view.render(), 'impact-a').props.onPress(); find(view.render(), 'preview-schedule').props.onPress(); find(view.render(), 'apply-schedule').props.onPress(); flow = await h.render(); assert.notEqual(h.storage.value, before); assert.equal(flow.projects[0].dueDate, project.dueDate);
});
test('UI explicit extension choice updates deadline only upon Apply Schedule Changes', async () => {
  const h = setup(); let flow = await h.render(); const view = actions(() => flow); find(view.render(), 'impact-a').props.onPress(); find(view.render(), 'preview-schedule').props.onPress(); find(view.render(), 'extend-deadline').props.onPress(); flow = await h.render(); assert.equal(flow.projects[0].dueDate, project.dueDate);
  find(view.render(), 'apply-schedule').props.onPress(); flow = await h.render(); assert.equal(dates.calendarDaysUntil(flow.projects[0].dueDate, dates.readDate(project.dueDate)), 2);
});
test('custom input invalidates preview; invalid shift cannot be confirmed; zero shift has no Apply action', async () => {
  const h = setup(); const flow = await h.render(), view = actions(flow); find(view.render(), 'impact-a').props.onPress(); find(view.render(), 'preview-schedule').props.onPress();
  find(view.render(), 'schedule-shift').props.onChangeText('NaN'); assert.equal(find(view.render(), 'apply-schedule'), undefined); find(view.render(), 'preview-schedule').props.onPress(); assert.match(text(view.render()), /whole number/);
  find(view.render(), 'schedule-shift').props.onChangeText('0'); find(view.render(), 'preview-schedule').props.onPress(); assert.match(text(view.render()), /No dated downstream tasks require rescheduling/); assert.equal(find(view.render(), 'apply-schedule'), undefined);
});
test('stale UI preview shows error and demands new preview instead of partial apply', async () => {
  const h = setup(); let flow = await h.render(); const view = actions(() => flow); find(view.render(), 'impact-a').props.onPress(); find(view.render(), 'preview-schedule').props.onPress(); flow.setTaskDependencies('p', 'c', ['a']); flow = await h.render(); const before = h.storage.value;
  find(view.render(), 'apply-schedule').props.onPress(); assert.match(text(view.render()), /review a fresh preview/); assert.equal(find(view.render(), 'apply-schedule'), undefined); flow = await h.render(); assert.equal(h.storage.value, before);
});
test('impact empty/undated states are useful and never invent dates', async () => {
  const h = setup(state({ tasks: [task('a', { dueDate: date(-1) })] })); const flow = await h.render(), view = actions(flow); find(view.render(), 'impact-a').props.onPress(); assert.match(text(view.render()), /No downstream tasks are affected/);
  const second = setup(state({ tasks: [task('a', { dueDate: date(-1) }), task('b', { dependsOn: ['a'], dueDate: '' })] })), another = actions(await second.render()); find(another.render(), 'impact-a').props.onPress(); find(another.render(), 'preview-schedule').props.onPress(); assert.match(text(another.render()), /no valid due date and will not be changed/); assert.equal(find(another.render(), 'apply-schedule'), undefined);
});
test('delete task UI warns with dependent count, supports Cancel and confirmed cleanup', async () => {
  const h = setup(); let flow = await h.render(); const view = actions(() => flow), before = h.storage.value; find(view.render(), 'delete-task-a').props.onPress(); assert.match(text(view.render()), /1\s+tasks depend on it/); find(view.render(), 'cancel-workflow').props.onPress(); flow = await h.render(); assert.equal(h.storage.value, before);
  find(view.render(), 'delete-task-a').props.onPress(); find(view.render(), 'confirm-delete-task').props.onPress(); flow = await h.render(); assert.deepEqual(ids(flow.tasks), ['b', 'c']); assert.deepEqual(plain(flow.tasks[0].dependsOn), []);
});
test('archive hides workflow summary/actions; unarchive restores them; completed task has no impact action', () => {
  const data = { ...state(), calendarDate: today }, summary = ui('components/WorkflowIntelligence.tsx', data, undefined, 'WorkflowSummary'), view = actions(data);
  assert.ok(summary.render({ project, tasks: data.tasks })); assert.ok(find(view.render(), 'impact-a'));
  data.projects[0].archived = true; assert.equal(view.render(), null); assert.equal(summary.render({ project: data.projects[0], tasks: data.tasks }), null);
  data.projects[0].archived = false; data.tasks[0].status = 'done'; assert.equal(find(view.render(), 'impact-a'), undefined); assert.ok(find(view.render(), 'dependencies-a'));
});
for (const screen of ['app/(tabs)/index.tsx', 'app/(tabs)/tasks.tsx', 'app/project/[id].tsx']) test(screen + ' uses shared blocked completion warning and explicit override', async () => {
  const h = setup(state({ tasks: chain().map((item) => ({ ...item, isManual: true })) })); let flow = await h.render(); const tree = ui(screen, () => flow).render(), row = walk(tree, (node) => node.type === 'TaskRow' && node.props.task.id === 'b')[0]; assert.ok(row);
  const rendered = ui('components/TaskRow.tsx', () => flow).render(row.props); assert.match(text(rendered), /Blocked by 1 task/); find(rendered, 'task-b').props.onPress(); flow = await h.render(); assert.equal(flow.tasks[1].status, 'todo'); assert.equal(h.alerts.length, 1); h.alerts[0][2][1].onPress(); flow = await h.render(); assert.equal(flow.tasks[1].status, 'done');
});
test('TaskRow displays Ready/completed/undated states without invalid dates', () => {
  const data = { ...state(), calendarDate: today }, view = ui('components/TaskRow.tsx', data); assert.match(text(view.render({ task: task('free', { dueDate: '' }) })), /Ready.*No due date/);
  const completed = text(view.render({ task: task('done', { status: 'done' }) })); assert.match(completed, /Completed/); assert.doesNotMatch(completed, /Ready|Blocked/);
});
test('personal rows never display project dependency state', () => { const tree = ui('components/PersonalTaskRow.tsx', state()).render({ task: personalTask }); assert.doesNotMatch(text(tree), /Ready|Blocked/); });
test('Quick Add still excludes archived projects', () => {
  const data = { ...state({ projects: [project, { ...project, id: 'archived', archived: true }] }), hydrated: true }, view = ui('components/QuickAdd.tsx', data); find(view.render(), 'quick-add').props.onPress(); find(view.render(), 'quick-project-task').props.onPress(); assert.ok(find(view.render(), 'quick-project-p')); assert.equal(find(view.render(), 'quick-project-archived'), undefined);
});
for (const theme of ['Light', 'Dark', 'System']) test(theme + ' workflow UI uses central palette and text/checkbox state', () => {
  const data = { ...state(), calendarDate: today }, preferences = { ...plain(settings.DEFAULT_SETTINGS), theme }, view = actions(data, preferences); view.setSystem('dark'); find(view.render('b'), 'dependencies-b').props.onPress(); const tree = view.render('b');
  const dialog = walk(tree, (node) => node.props?.accessibilityViewIsModal)[0]; assert.equal(dialog.props.style[1].backgroundColor, palettes[theme === 'Light' ? 'light' : 'dark'].card); assert.equal(find(tree, 'prerequisite-a').props.accessibilityState.checked, true); assert.match(text(tree), /Blocked by:\s+a/);
});
for (const dateFormat of ['DD/MM/YYYY', 'DD MMM YYYY', 'YYYY-MM-DD']) test('schedule preview respects date format ' + dateFormat, () => {
  const data = { ...state(), calendarDate: today }, view = actions(data, { ...plain(settings.DEFAULT_SETTINGS), dateFormat }); find(view.render(), 'impact-a').props.onPress(); find(view.render(), 'preview-schedule').props.onPress(); const content = text(view.render()); assert.ok(content.includes(settings.formatDate(data.tasks[1].dueDate, dateFormat))); assert.ok(content.includes(settings.formatDate(project.dueDate, dateFormat)));
});

test('dependency edits, preview and cancel never schedule notifications; apply reconciles once', async () => {
  const calls = []; let syncs = 0; const h = setup(state({ projects: [{ ...project, remindersEnabled: true }] }), { mocks: { '@/lib/notifications': { syncProjectReminders: async () => { syncs++; }, scheduleProjectReminders: async (...args) => { calls.push(args); return true; } } } });
  let flow = await h.render(); const baseline = syncs; flow.setTaskDependencies('p', 'c', ['a']); flow = await h.render(); const view = actions(() => flow); find(view.render(), 'impact-a').props.onPress(); find(view.render(), 'preview-schedule').props.onPress(); find(view.render(), 'cancel-workflow').props.onPress(); flow = await h.render(); assert.equal(calls.length, 0); assert.equal(syncs, baseline);
  const proposal = proposalFor(flow); flow.applyReschedule(proposal); flow = await h.render(); assert.equal(calls.length, 1); assert.equal(calls[0][2], false); assert.equal(calls[0][1].find((item) => item.id === 'b').dueDate, proposal.changes[0].to);
});
test('notification master OFF prevents reschedule scheduling', async () => {
  let calls = 0; const h = setup(state({ projects: [{ ...project, remindersEnabled: true }] }), { mocks: { '@/context/SettingsContext': { useSettings: () => ({ settings: { ...settings.DEFAULT_SETTINGS, notificationsEnabled: false } }) }, '@/lib/notifications': { syncProjectReminders: async () => undefined, scheduleProjectReminders: async () => { calls++; } } } });
  let flow = await h.render(); flow.applyReschedule(proposalFor(flow)); flow = await h.render(); assert.equal(calls, 0);
});
test('serialized reminder update replaces old countdowns without duplicates or personal cancellation', async () => {
  const saved = {}, scheduled = new Map(), calls = [];
  const notifications = loadSource('lib/notifications.ts', { 'react-native': native, '@react-native-async-storage/async-storage': { getItem: async (key) => saved[key] ?? null, setItem: async (key, value) => { saved[key] = value; } }, 'expo-notifications': {
    setNotificationHandler() {}, getPermissionsAsync: async () => ({ granted: true }), requestPermissionsAsync: async () => ({ granted: true }), SchedulableTriggerInputTypes: { DATE: 'date' },
    cancelScheduledNotificationAsync: async (id) => { scheduled.delete(id); }, scheduleNotificationAsync: async (item) => { const id = 'n-' + calls.length; calls.push(item); scheduled.set(id, item); return id; },
  } });
  const p = { ...project, remindersEnabled: true }, tasks = chain(); tasks[0].order = 10; const h = setup(state({ projects: [p], tasks }), { mocks: { '@/lib/notifications': notifications } }); let flow = await h.render();
  await notifications.syncProjectReminders(flow.projects, flow.tasks, true); const count = scheduled.size; assert.ok(count > 0); const bodies = [...scheduled.values()].map((item) => item.content.body); scheduled.set('personal-keep', { personal: true });
  flow.applyReschedule(proposalFor(flow)); flow = await h.render(); await notifications.scheduleProjectReminders(flow.projects[0], flow.tasks, false); assert.equal(scheduled.size, count + 1); assert.ok(scheduled.has('personal-keep')); assert.notDeepEqual([...scheduled.values()].filter((item) => item.content).map((item) => item.content.body), bodies);
});
