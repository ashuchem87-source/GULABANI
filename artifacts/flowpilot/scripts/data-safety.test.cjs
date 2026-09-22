const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadSource, plain, host } = require('./flow-test-host.cjs');
const backup = loadSource('lib/data-backup.ts'), report = loadSource('lib/data-export.ts');
const settingsModel = loadSource('lib/settings.ts'), dates = loadSource('lib/task-utils.ts');
const workflow = loadSource('lib/workflow-intelligence.ts'), management = loadSource('lib/project-management.ts');
const dashboard = loadSource('lib/dashboard.ts'), personal = loadSource('lib/personal-tasks.ts');
const today = dates.localDateValue(), relative = (n) => dates.localDateValue(dates.addCalendarDays(dates.readDate(today), n));
const fixed = new Date('2026-09-22T05:06:07.008Z');
const p = { id: 'p', name: 'Project, "नमस्ते"\nLong name', client: 'Client', summary: 'Keep', templateId: 'template', startDate: '2020-01-01T10:00:00.000Z', projectStartDate: '2020-01-01', dueDate: relative(10), status: 'On Hold', archived: false, reminderFrequency: 'Daily', remindersEnabled: true, future: { keep: true } };
const task = (id, extra = {}) => ({ id, projectId: 'p', title: 'Task ' + id, description: 'Description', duration: 1, order: 0, status: 'todo', dueDate: relative(2), ...extra });
function data() { return {
  projects: [plain(p), { ...plain(p), id: 'archived', archived: true, status: 'Completed', remindersEnabled: false }],
  templates: [{ id: 'template', name: 'CII SELF', category: 'Custom', description: 'Template description', color: '#F26B5E', steps: [{ id: 'b', title: 'Second first', description: '', duration: 2 }, { id: 'a', title: 'First second', description: '', duration: 1 }] }],
  tasks: [task('a', { dueDate: relative(-3) }), task('b', { order: 1, dependsOn: ['a'], isManual: true }), task('done', { order: 2, status: 'done', completedAt: '2021-02-03T04:05:06.789Z' }), task('a', { projectId: 'archived', status: 'done' })],
  personalTasks: [{ ...plain(personal.PERSONAL_DEFAULTS), id: 'personal', title: 'Personal', dueDate: relative(3), dueTime: '12:30', priority: 'Critical', notes: 'Multi\nline, "notes"', reminder: '1 hour before', recurrence: { frequency: 'Monthly', anchorDay: 22 }, status: 'todo', createdAt: '2021-02-01T04:05:06.000Z', seriesId: 'series', occurrence: 3, future: 42 }],
  settings: { ...plain(settingsModel.DEFAULT_SETTINGS), theme: 'Dark', dateFormat: 'DD MMM YYYY', future: { enabled: true } },
}; }
const migrated = (value) => ({ ...value, tasks: value.tasks.map((task) => task.id === 'a' && !task.isManual ? { ...task, sourceTemplateStepId: 'a' } : task) });
const empty = () => ({ projects: [], tasks: [], templates: [], personalTasks: [], settings: plain(settingsModel.DEFAULT_SETTINGS) });
const encoded = (value = data()) => backup.serializeBackup(value, fixed);
const roundtrip = (value = data()) => backup.parseBackup(encoded(value));
const at = (value, keys) => keys.split('.').reduce((obj, key) => obj[key], value);

test('backup metadata uses centralized format/version, app name and ISO timestamp', () => {
  const value = backup.createBackup(data(), fixed); assert.equal(value.format, 'GULABANI_BACKUP'); assert.equal(value.version, backup.BACKUP_VERSION); assert.equal(value.version, 1); assert.equal(value.app, 'GULABANI'); assert.equal(value.createdAt, fixed.toISOString());
});
for (const key of ['templates', 'templates.0.steps', 'projects.0.id', 'projects.0.name', 'projects.0.startDate', 'projects.0.projectStartDate', 'projects.0.dueDate', 'projects.0.status', 'projects.1.archived', 'projects.0.future', 'tasks.0.id', 'tasks.0.dueDate', 'tasks.2.status', 'tasks.2.completedAt', 'tasks.1.isManual', 'tasks.1.dependsOn', 'personalTasks.0.id', 'personalTasks.0.priority', 'personalTasks.0.notes', 'personalTasks.0.dueTime', 'personalTasks.0.reminder', 'personalTasks.0.recurrence', 'personalTasks.0.seriesId', 'personalTasks.0.occurrence', 'personalTasks.0.future', 'settings']) test('backup and validated restore preserve ' + key, () => {
  const source = data(), result = roundtrip(source); assert.deepEqual(plain(at(result.data, key)), plain(at(source, key)));
});
for (const key of ['progress', 'percent', 'health', 'workflowState', 'ready', 'blocked', 'workflowCounts', 'impactCounts', 'dashboardCounts']) test('derived field excluded: ' + key, () => {
  const source = data(); source.projects[0][key] = 50; source.tasks[0][key] = 50;
  const result = roundtrip(source); assert.equal(key in result.data.projects[0], false); assert.equal(key in result.data.tasks[0], false); assert.equal(source.projects[0][key], 50);
});
test('backup is a detached snapshot and never mutates current data', () => {
  const source = data(), before = JSON.stringify(source), result = backup.createBackup(source, fixed); result.data.tasks[1].dependsOn.push('new'); result.data.templates[0].steps.reverse(); assert.equal(JSON.stringify(source), before);
});
test('valid empty data roundtrips without fabricated defaults or records', () => assert.deepEqual(plain(roundtrip(empty()).data), empty()));
test('legacy optional fields remain absent; settings and personal collection have safe defaults', () => {
  const source = data(); for (const project of source.projects) { delete project.status; delete project.archived; delete project.projectStartDate; delete project.remindersEnabled; }
  for (const task of source.tasks) { delete task.dependsOn; delete task.completedAt; delete task.isManual; }
  const value = JSON.parse(encoded(source)); delete value.data.settings; delete value.data.personalTasks;
  const result = backup.parseBackup(JSON.stringify(value)).data;
  assert.deepEqual(plain(result.projects), source.projects); assert.deepEqual(plain(result.tasks), source.tasks); assert.deepEqual(plain(result.personalTasks), []); assert.deepEqual(plain(result.settings), plain(settingsModel.DEFAULT_SETTINGS));
});
test('unknown harmless metadata accepted while deleted source templates remain valid', () => {
  const value = JSON.parse(encoded()); value.future = { version: 3 }; value.data.future = 'keep-compatible'; value.data.templates = []; assert.equal(backup.parseBackup(JSON.stringify(value)).data.projects[0].templateId, 'template');
});
const corruptions = [
  ['wrong format', (b) => b.format = 'CSV'], ['unsupported version', (b) => b.version = 99], ['missing data', (b) => delete b.data], ['missing app', (b) => delete b.app], ['invalid creation date', (b) => b.createdAt = 'not-a-date'],
  ['wrong projects collection', (b) => b.data.projects = {}], ['wrong task collection', (b) => b.data.tasks = 'bad'], ['null personal collection', (b) => b.data.personalTasks = null], ['wrong templates collection', (b) => b.data.templates = 4], ['non-object task', (b) => b.data.tasks[0] = null],
  ['missing ID', (b) => delete b.data.tasks[0].id], ['duplicate project ID', (b) => b.data.projects[1].id = 'p'], ['duplicate scoped task ID', (b) => b.data.tasks[1].id = 'a'], ['duplicate personal ID', (b) => b.data.personalTasks.push(b.data.personalTasks[0])], ['duplicate step ID', (b) => b.data.templates[0].steps[1].id = 'b'],
  ['invalid deadline', (b) => b.data.projects[0].dueDate = '2026-02-30'], ['invalid start date', (b) => b.data.projects[0].startDate = 'yesterday'], ['invalid completion date', (b) => b.data.tasks[2].completedAt = '2026-02-30T10:00:00Z'], ['wrong archived type', (b) => b.data.projects[0].archived = 'false'], ['unknown status', (b) => b.data.projects[0].status = 'paused'],
  ['wrong task status', (b) => b.data.tasks[0].status = 'completed'], ['invalid duration', (b) => b.data.tasks[0].duration = -2], ['invalid order', (b) => b.data.tasks[0].order = -1], ['orphan task', (b) => b.data.tasks[0].projectId = 'missing'],
  ['self dependency', (b) => b.data.tasks[0].dependsOn = ['a']], ['missing dependency', (b) => b.data.tasks[0].dependsOn = ['missing']], ['cross-project dependency', (b) => { b.data.tasks[3].id = 'foreign'; b.data.tasks[0].dependsOn = ['foreign']; }], ['two-node cycle', (b) => b.data.tasks[0].dependsOn = ['b']], ['multi-node cycle', (b) => { b.data.tasks[0].dependsOn = ['done']; b.data.tasks[2].dependsOn = ['b']; }], ['non-list dependencies', (b) => b.data.tasks[0].dependsOn = 'b'],
  ['wrong settings type', (b) => b.data.settings = []], ['invalid theme', (b) => b.data.settings.theme = 'Blue'], ['invalid switch', (b) => b.data.settings.notificationsEnabled = 1], ['invalid duration preference', (b) => b.data.settings.projectDuration = 0],
  ['invalid priority', (b) => b.data.personalTasks[0].priority = 'Urgent'], ['invalid time', (b) => b.data.personalTasks[0].dueTime = '25:01'], ['time without date', (b) => delete b.data.personalTasks[0].dueDate], ['invalid recurrence', (b) => b.data.personalTasks[0].recurrence.frequency = 'Yearly'], ['invalid anchor', (b) => b.data.personalTasks[0].recurrence.anchorDay = 32], ['invalid occurrence', (b) => b.data.personalTasks[0].occurrence = -1], ['recurrence self loop', (b) => b.data.personalTasks[0].nextOccurrenceId = 'personal'],
];
for (const [name, mutate] of corruptions) test('reject corrupt backup: ' + name, () => { const value = JSON.parse(encoded()); mutate(value); assert.throws(() => backup.parseBackup(JSON.stringify(value)), /valid GULABANI backup|version is not supported/); });
test('malformed JSON and prototype-pollution fields are rejected safely', () => { assert.throws(() => backup.parseBackup('{'), /JSON/); assert.throws(() => backup.parseBackup(encoded().replace('"future": {', '"__proto__": {')), /Unsafe/); assert.equal({}.enabled, undefined); });
test('duplicate dependency IDs remain exact but do not affect graph validation', () => { const value = data(); value.tasks[1].dependsOn = ['a', 'a']; assert.deepEqual(plain(roundtrip(value).data.tasks[1].dependsOn), ['a', 'a']); });
test('missing recurrence successor is tolerated because occurrences may have been deleted', () => { const value = data(); value.personalTasks[0].nextOccurrenceId = 'deleted'; assert.equal(roundtrip(value).data.personalTasks[0].nextOccurrenceId, 'deleted'); });
test('strict restore validation never rewrites bad current dependency data', () => { const source = data(); source.tasks[0].dependsOn = ['missing']; const before = JSON.stringify(source); assert.throws(() => backup.validateData(source)); assert.equal(JSON.stringify(source), before); assert.match(encoded(source), /missing/); });
test('UTF-8 size supports Unicode and refuses oversized import/export', () => {
  assert.equal(backup.utf8Size('Aन😀'), Buffer.byteLength('Aन😀')); assert.throws(() => backup.parseBackup(' '.repeat(backup.MAX_BACKUP_BYTES + 1)), /20 MB/);
  const source = empty(); source.settings.notes = 'a'.repeat(backup.MAX_BACKUP_BYTES); assert.throws(() => backup.serializeBackup(source), /20 MB/);
});
test('deep unknown nesting is safely rejected', () => { const value = JSON.parse(encoded()); value.extra = {}; let node = value.extra; for (let i = 0; i < 110; i++) { node.next = {}; node = node.next; } assert.throws(() => backup.parseBackup(JSON.stringify(value)), /deeply/); });
test('large valid dependency chain validates iteratively', () => { const source = data(); source.tasks = Array.from({ length: 6000 }, (_, i) => task('t' + i, { order: i, dependsOn: i ? ['t' + (i - 1)] : [] })); assert.equal(roundtrip(source).data.tasks.length, 6000); });

// Independent CSV reader exercises delimiters/quotes/newlines rather than relying
// on the generator's own escape function to check its output.
function readCsv(raw) {
  const result = [], row = []; let cell = '', quoted = false;
  raw = raw.replace(/^\uFEFF/, '');
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (char === '"') { if (quoted && raw[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if (char === '\r' && raw[i + 1] === '\n' && !quoted) { row.push(cell); result.push([...row]); row.length = 0; cell = ''; i++; }
    else cell += char;
  }
  assert.equal(quoted, false); return result;
}
const exported = () => { const rows = readCsv(report.exportCsv(data(), today)); return rows.slice(1).map((row) => Object.fromEntries(rows[0].map((key, i) => [key, row[i]]))); };
test('Excel CSV has BOM, CRLF, fixed headers and aligned record widths', () => { const raw = report.exportCsv(data(), today), rows = readCsv(raw); assert.equal(raw.charCodeAt(0), 0xfeff); assert.deepEqual(rows[0], plain(report.EXPORT_HEADERS)); assert.ok(rows.every((row) => row.length === rows[0].length)); assert.ok(raw.endsWith('\r\n')); });
test('empty export contains valid headers even with no personal/projects/templates', () => assert.equal(readCsv(report.exportCsv(empty())).length, 1));
for (const [column, expected] of [['Project ID', 'p'], ['Project Name', p.name], ['Project Status', 'On Hold'], ['Archived', 'false'], ['Project Start Date', p.projectStartDate], ['Project Deadline', p.dueDate], ['Project Progress %', '33'], ['Project Health', 'On Hold'], ['Task ID', 'b'], ['Task Name', 'Task b'], ['Task Type', 'Manual Project Task'], ['Task Due Date', relative(2)], ['Task Completed', 'false'], ['Task Workflow State', 'Blocked'], ['Dependency Count', '1'], ['Depends On Task IDs', '["a"]']]) test('CSV project task column ' + column, () => assert.equal(exported().find((row) => row['Task ID'] === 'b')[column], expected));
for (const [column, expected] of [['Record Type', 'Personal To-do'], ['Project ID', ''], ['Task Name', 'Personal'], ['Task Due Date', relative(3)], ['Due Time', '12:30'], ['Priority', 'Critical'], ['Notes', 'Multi\nline, "notes"'], ['Reminder', '1 hour before'], ['Recurrence', 'Monthly'], ['Task Workflow State', '']]) test('CSV personal column ' + column, () => assert.equal(exported().find((row) => row['Task ID'] === 'personal')[column], expected));
test('CSV includes actual completedAt, template type, legacy unknown completion and archive records', () => { const rows = exported(), done = rows.find((r) => r['Task ID'] === 'done'); assert.equal(done['Task Completed At'], '2021-02-03T04:05:06.789Z'); assert.equal(done['Task Type'], 'Template'); assert.equal(done['Task Completed'], 'true'); assert.equal(done['Task Workflow State'], 'Completed'); assert.equal(rows.find((r) => r['Project ID'] === 'archived')['Task Completed At'], ''); });
test('zero-task project exports a project record with empty task fields', () => { const source = empty(); source.projects = [p]; const rows = readCsv(report.exportCsv(source)); assert.equal(rows[1][0], 'Project'); assert.equal(rows[1].length, rows[0].length); assert.equal(rows[1][9], ''); });
for (const value of ['=SUM(1,2)', '+cmd', '-10+20', '@SUM(A1)', ' \t=1', '\r\n+1', '\u0000@x', '\tordinary']) test('formula protection: ' + JSON.stringify(value), () => { const rows = readCsv(report.csvCell(value) + '\r\n'); assert.equal(rows[0][0], "'" + value); });
for (const value of ['plain text', 'a,b', 'a"b', 'line one\nline two', 'नमस्ते 😀', '2026-09-22T00:00:00Z', 'a'.repeat(20000)]) test('CSV roundtrip readable text: ' + value.slice(0, 30), () => assert.equal(readCsv(report.csvCell(value) + '\r\n')[0][0], value));
test('export does not mutate source data or persist derived report columns', () => { const source = data(), before = JSON.stringify(source); report.exportCsv(source, today); assert.equal(JSON.stringify(source), before); });
test('filenames are timestamped, safe and collision resistant within a second', () => { const name = report.dataFilename('Backup', 'json', fixed); assert.match(name, /^GULABANI_Backup_2026-09-22_05-06-07-008\.json$/); assert.doesNotMatch(name, /[<>:"/\\|?*]/); assert.notEqual(name, report.dataFilename('Backup', 'json', new Date(fixed.getTime() + 1))); });
for (const [label, expected] of [['Projects', 2], ['Archived Projects', 1], ['Templates', 1], ['Project Tasks', 4], ['Personal To-dos', 1], ['Completed Projects', 1], ['Completed Tasks', 2]]) test('derived summary count ' + label, () => assert.equal(backup.dataSummary(data())[label], expected));
test('empty summary has all zero values and never modifies input', () => { const source = empty(), before = JSON.stringify(source); assert.ok(Object.values(backup.dataSummary(source)).every((count) => count === 0)); assert.equal(JSON.stringify(source), before); });

function storageHarness(initial = {}, failure = () => false) {
  const values = new Map(Object.entries(initial)), calls = []; let hook = failure;
  const storage = Object.fromEntries(['getItem', 'setItem', 'removeItem'].map((method) => [method, async (...args) => {
    calls.push([method, ...args]); if (await hook(method, ...args)) throw new Error('simulated disk failure');
    if (method === 'getItem') return values.get(args[0]) ?? null;
    if (method === 'setItem') values.set(args[0], args[1]); else values.delete(args[0]);
  }]));
  const api = loadSource('lib/data-storage.ts', { '@react-native-async-storage/async-storage': storage });
  return { ...api, api, storage, values, calls, fail: (next) => { hook = next; } };
}
const keys = { flow: 'flowpilot-state-v1', settings: settingsModel.SETTINGS_KEY, journal: 'gulabani-restore-journal-v1' };
const oldRecords = { [keys.flow]: '{"old":"flow"}', [keys.settings]: '{"old":"settings"}', notificationIDs: 'keep-device-only' };
test('replace transaction commits both datasets and removes recovery journal', async () => {
  const h = storageHarness(oldRecords); let committed; assert.equal((await h.replaceData(data(), (next) => { committed = next; })).ok, true);
  const { settings, ...flow } = data(); assert.deepEqual(JSON.parse(h.values.get(keys.flow)), flow); assert.deepEqual(JSON.parse(h.values.get(keys.settings)), settings); assert.deepEqual(plain(committed), data()); assert.equal(h.values.has(keys.journal), false); assert.equal(h.values.get('notificationIDs'), 'keep-device-only');
});
test('all restore data is validated before any storage write', async () => { const h = storageHarness(oldRecords), source = data(); source.tasks[0].dependsOn = ['b']; assert.equal((await h.replaceData(source, () => assert.fail('commit'))).ok, false); assert.equal(h.calls.length, 0); assert.deepEqual(Object.fromEntries(h.values), oldRecords); });
for (const failure of ['read', 'journal', 'flow', 'settings', 'clear-journal']) test('restore failure safely rolls back: ' + failure, async () => {
  let failed = false;
  const h = storageHarness(oldRecords, (method, key) => {
    const match = failure === 'read' ? method === 'getItem' : failure === 'clear-journal' ? method === 'removeItem' && key === keys.journal : method === 'setItem' && key === keys[failure];
    if (match && !failed) { failed = true; return true; } return false;
  });
  const result = await h.replaceData(data(), () => assert.fail('must not update memory')); assert.equal(result.ok, false); assert.equal(result.recoveryRequired, undefined); assert.equal(h.dataLocked(), false); assert.deepEqual(Object.fromEntries(h.values), oldRecords);
});
test('rollback failure retains journal and blocks writes until recovery succeeds', async () => {
  const h = storageHarness(oldRecords, (method, key) => method === 'setItem' && key === keys.settings); const result = await h.replaceData(data(), () => assert.fail());
  assert.equal(result.recoveryRequired, true); assert.equal(h.dataLocked(), true); assert.ok(h.values.has(keys.journal)); await assert.rejects(h.writeData(keys.flow, 'unsafe'));
  h.fail(() => false); await h.recoverData(); assert.equal(h.dataLocked(), false); assert.deepEqual(Object.fromEntries(h.values), oldRecords);
});
test('restart recovery rolls back interrupted dataset before loading providers', async () => {
  const h = storageHarness({ ...oldRecords, [keys.flow]: 'partial-new', [keys.journal]: JSON.stringify({ version: 1, flow: oldRecords[keys.flow], settings: oldRecords[keys.settings] }) }); await h.recoverData(); assert.deepEqual(Object.fromEntries(h.values), oldRecords);
});
test('rollback restores missing storage keys as missing rather than defaults', async () => {
  let failed = false; const h = storageHarness({}, (method, key) => { if (method === 'setItem' && key === keys.settings && !failed) { failed = true; return true; } return false; });
  assert.equal((await h.replaceData(data(), () => assert.fail())).ok, false); assert.equal(h.values.size, 0);
});
test('bad journal or unreadable storage gates app without discarding records', async () => {
  const h = storageHarness({ ...oldRecords, [keys.journal]: '{}' }); await assert.rejects(h.recoverData()); assert.equal(h.dataLocked(), true); assert.ok(h.values.has(keys.journal)); assert.equal(h.values.get(keys.flow), oldRecords[keys.flow]);
});
test('normal writes are serialized before replace; writes during replace are rejected', async () => {
  let release; const wait = new Promise((resolve) => { release = resolve; });
  const h = storageHarness(oldRecords, async (method, key, value) => { if (method === 'setItem' && value === 'latest-old') await wait; return false; });
  const save = h.writeData(keys.flow, 'latest-old'), restore = h.replaceData(data(), () => {});
  await assert.rejects(h.writeData(keys.flow, 'stale')); release(); await save; assert.equal((await restore).ok, true);
  const journalWrite = h.calls.find((call) => call[0] === 'setItem' && call[1] === keys.journal); assert.equal(JSON.parse(journalWrite[2]).flow, 'latest-old');
});
test('concurrent replace cannot run two restore transactions', async () => { const h = storageHarness(oldRecords); const first = h.replaceData(data(), () => {}); assert.equal((await h.replaceData(empty(), () => assert.fail())).ok, false); assert.equal((await first).ok, true); });
test('rollback journal includes current memory edits that have not reached autosave', async () => {
  let failed = false; const h = storageHarness(oldRecords, (method, key) => { if (method === 'setItem' && key === keys.settings && !failed) { failed = true; return true; } return false; });
  const previous = data(); previous.projects[0].name = 'Unsaved current edit';
  assert.equal((await h.replaceData(empty(), () => assert.fail(), previous)).ok, false);
  assert.equal(JSON.parse(h.values.get(keys.flow)).projects[0].name, 'Unsaved current edit');
});
test('parallel startup recovery is coalesced and reads the journal once', async () => {
  const h = storageHarness(oldRecords); await Promise.all([h.recoverData(), h.recoverData()]);
  assert.equal(h.calls.filter((call) => call[0] === 'getItem' && call[1] === keys.journal).length, 1);
});

function integration(initial = data(), extras = {}) {
  const { settings, ...flow } = initial, h = storageHarness({ [keys.flow]: JSON.stringify(flow), [keys.settings]: JSON.stringify(settings) }); let preferences = settings;
  const notices = [], schedules = [];
  const render = host({}, { mocks: {
    '@react-native-async-storage/async-storage': h.storage, '@/lib/data-storage': h.api,
    '@/context/SettingsContext': { useSettings: () => ({ settings: preferences, getSettingsSnapshot: () => plain(preferences), acceptRestoredSettings: (next) => { preferences = next; } }) },
    '@/lib/notifications': { syncProjectReminders: async (...args) => { schedules.push(args); }, scheduleProjectReminders: async () => true },
    '@/lib/personal-notifications': { syncPersonalReminders: async (...args) => { notices.push(args); }, askPersonalReminderPermission: async () => undefined },
    ...extras,
  } });
  return { ...h, render, notices, schedules, preferences: () => preferences };
}
test('provider restore updates memory, disk, preferences and derived selectors without new IDs/dates', async () => {
  const h = integration(empty()); let flow = await h.render(); const value = backup.createBackup(data(), fixed);
  assert.equal((await flow.restoreBackup(value)).ok, true); flow = await h.render(); assert.deepEqual(plain(flow.getDataSnapshot()), migrated(data())); assert.deepEqual(plain(h.preferences()), data().settings);
  assert.equal(workflow.getTaskWorkflowState(flow.tasks[1], flow.tasks), 'Blocked'); assert.equal(management.projectProgress('p', flow.tasks).percent, 33); assert.equal(management.normalProjectTasks(flow.tasks, flow.projects).length, 3);
  assert.equal(workflow.getPotentiallyImpactedTasks('p', flow.tasks, today).length, 1); assert.equal(dashboard.dashboardCounts(dashboard.dashboardGroups(flow.tasks, flow.personalTasks, today)).overdue, 1);
  const proposal = workflow.buildRescheduleProposal(flow.projects[0], flow.tasks, 'a', today); assert.equal(proposal.changes.length, 1); assert.equal(flow.tasks[1].dueDate, relative(2));
  const reloaded = integration(flow.getDataSnapshot()); assert.deepEqual(plain((await reloaded.render()).getDataSnapshot()), migrated(data()));
});
for (const kind of ['format', 'version', 'graph']) test('provider invalid restore changes nothing: ' + kind, async () => {
  const h = integration(); let flow = await h.render(); const before = plain(flow.getDataSnapshot()), value = backup.createBackup(data()); if (kind === 'format') value.format = 'bad'; if (kind === 'version') value.version = 999; if (kind === 'graph') value.data.tasks[0].dependsOn = ['b'];
  const callCount = h.calls.length; assert.equal((await flow.restoreBackup(value)).ok, false); flow = await h.render(); assert.deepEqual(plain(flow.getDataSnapshot()), before); assert.equal(h.calls.length, callCount);
});
test('provider restore write failure keeps old memory and disk', async () => {
  const h = integration(); let flow = await h.render(); let failed = false; h.fail((method, key) => { if (method === 'setItem' && key === keys.settings && !failed) { failed = true; return true; } return false; });
  assert.equal((await flow.restoreBackup(backup.createBackup(empty()))).ok, false); flow = await h.render(); assert.deepEqual(plain(flow.getDataSnapshot()), migrated(data())); assert.deepEqual(JSON.parse(h.values.get(keys.settings)), data().settings);
});
test('successful restore reconciles only restored datasets and preferences', async () => {
  const h = integration(); let flow = await h.render(); const next = empty(); next.settings.notificationsEnabled = false;
  assert.equal((await flow.restoreBackup(backup.createBackup(next))).ok, true); flow = await h.render(); assert.deepEqual(plain(h.schedules.at(-1)), [[], [], false]); assert.deepEqual(plain(h.notices.at(-1)), [[], false]); assert.equal(flow.projects.length, 0);
});
for (const kind of ['denied', 'error']) test('notification ' + kind + ' is a warning, not failed restore', async () => {
  const h = integration(empty(), { '@/lib/notifications': { syncProjectReminders: async () => { if (kind === 'error') throw Error('native'); return 'Permission denied'; }, scheduleProjectReminders: async () => false } }); const flow = await h.render(); const result = await flow.restoreBackup(backup.createBackup(data())); assert.equal(result.ok, true); assert.match(result.warning, /Data restored/); assert.equal(JSON.parse(h.values.get(keys.flow)).projects.length, 2);
});
test('stale callbacks and pending personal permission cannot mutate restored records', async () => {
  let release; const h = integration(data(), { '@/lib/personal-notifications': { syncPersonalReminders: async () => undefined, askPersonalReminderPermission: () => new Promise((resolve) => { release = resolve; }) } }); let flow = await h.render();
  const saved = flow.savePersonalTask({ ...data().personalTasks[0], dueDate: relative(5) }); const oldToggle = flow.toggleTask; await flow.restoreBackup(backup.createBackup(empty())); release(); assert.equal((await saved).ok, false); oldToggle('a', 'p'); flow = await h.render(); assert.equal(flow.tasks.length, 0); assert.equal(flow.personalTasks.length, 0);
});
test('normal hydration adds reliable linkage without changing historical data', async () => { const source = data(), h = integration(source); const flow = await h.render(); assert.deepEqual(plain(flow.getDataSnapshot()), migrated(source)); assert.equal(flow.tasks[3].completedAt, undefined); });
test('failed normal hydration never overwrites original stored data', async () => { const h = integration(); h.fail((method, key) => method === 'getItem' && key === keys.flow); const flow = await h.render(); assert.equal(flow.hydrated, false); assert.match(flow.storageError, /could not be loaded/); assert.equal(h.calls.some((call) => call[0] === 'setItem'), false); });

function files(options = {}) {
  const calls = [], file = { size: 20, text: async () => encoded(), ...options.file };
  const saf = { requestDirectoryPermissionsAsync: async () => ({ granted: true, directoryUri: 'content://folder' }), createFileAsync: async (...args) => { calls.push(['create', ...args]); return 'content://new'; }, writeAsStringAsync: async (...args) => { calls.push(['write', ...args]); }, deleteAsync: async (...args) => { calls.push(['delete', ...args]); }, ...options.saf };
  const api = loadSource('lib/data-files.ts', { 'react-native': { Platform: { OS: options.os ?? 'android' } }, 'expo-file-system': { File: { pickFileAsync: options.pick ?? (async () => file) } }, 'expo-file-system/legacy': { StorageAccessFramework: saf } });
  return { ...api, calls };
}
test('backup/export saves actual UTF-8 file through selected Android directory', async () => { const h = files(); assert.equal(await h.saveDataFile('safe.json', 'नमस्ते', 'application/json'), true); assert.deepEqual(h.calls, [['create', 'content://folder', 'safe.json', 'application/json'], ['write', 'content://new', 'नमस्ते']]); });
test('canceling folder chooser writes no file', async () => { const h = files({ saf: { requestDirectoryPermissionsAsync: async () => ({ granted: false }) } }); assert.equal(await h.saveDataFile('safe.json', '', 'application/json'), false); assert.equal(h.calls.length, 0); });
test('write failure cleans only partial new file and reports useful failure', async () => { const h = files({ saf: { writeAsStringAsync: async () => { throw Error('disk'); } } }); await assert.rejects(h.saveDataFile('safe.json', '', 'application/json'), /could not be saved/); assert.deepEqual(h.calls.at(-1), ['delete', 'content://new']); });
test('selected backup is read without restoring; cancellation returns no payload', async () => { const h = files(); assert.equal(await h.readBackupFile(), encoded()); assert.equal(await files({ pick: async () => { throw Error('User canceled'); } }).readBackupFile(), null); });
test('file permission/read failures and oversize inputs are handled', async () => {
  await assert.rejects(files({ pick: async () => { throw Error('permission'); } }).readBackupFile(), /could not be opened/);
  await assert.rejects(files({ file: { text: async () => { throw Error('read'); } } }).readBackupFile(), /could not be read/);
  await assert.rejects(files({ file: { size: backup.MAX_BACKUP_BYTES + 1 } }).readBackupFile(), /too large/);
});
test('non-Android file actions clearly explain platform limitation', async () => { await assert.rejects(files({ os: 'web' }).saveDataFile('x', '', 'text/csv'), /Android/); await assert.rejects(files({ os: 'ios' }).readBackupFile(), /Android/); });
test('folder permission failure is translated into a clear save error', async () => { await assert.rejects(files({ saf: { requestDirectoryPermissionsAsync: async () => { throw Error('native-details'); } } }).saveDataFile('x', '', 'text/csv'), /The file could not be saved/); });

function walk(node, predicate) { if (Array.isArray(node)) return node.flatMap((item) => walk(item, predicate)); if (!node || typeof node !== 'object') return []; return [...(predicate(node) ? [node] : []), ...walk(node.props?.children, predicate)]; }
const find = (node, id) => walk(node, (item) => item.props?.testID === id)[0];
function text(node) { if (Array.isArray(node)) return node.map(text).join(' '); if (node && typeof node === 'object') return text(node.props?.children); return String(node ?? ''); }
const palettes = loadSource('constants/colors.ts').default;
function ui(flow, overrides = {}, theme = 'Light') {
  const state = []; let cursor = 0, system = 'dark';
  const api = loadSource('components/DataManagement.tsx', {
    react: { useRef(initial) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; }, useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (next) => { state[i] = next; }]; } },
    'react-native': { View: 'View', Modal: 'Modal', ScrollView: 'ScrollView', Pressable: 'Pressable', StyleSheet: { create: (v) => v } },
    '@/components/AppText': { AppText: 'AppText' }, '@/hooks/useColors': { useColors: () => palettes[settingsModel.resolveTheme(theme, system)] },
    '@/context/SettingsContext': { useDateFormatter: () => (date) => settingsModel.formatDate(date, 'DD MMM YYYY') }, '@/context/FlowContext': { useFlow: () => flow },
    '@/lib/data-files': { readBackupFile: async () => encoded(), saveDataFile: async () => true, ...overrides },
  });
  return { render() { cursor = 0; return api.DataManagement(); } };
}
const uiFlow = (more = {}) => ({ hydrated: true, getDataSnapshot: () => data(), restoreBackup: async () => ({ ok: true }), ...more });
test('restore UI validates file before showing strong replacement confirmation; Cancel is non-mutating', async () => {
  let calls = 0; const view = ui(uiFlow({ restoreBackup: async () => { calls++; return { ok: true }; } })); await find(view.render(), 'restore-backup').props.onPress(); assert.equal(calls, 0); assert.match(text(view.render()), /current GULABANI data will be replaced/); assert.match(text(view.render()), /Create a backup.*first/); assert.match(text(view.render()), /22 Sep 2026/);
  find(view.render(), 'cancel-data-dialog').props.onPress(); assert.equal(calls, 0); assert.equal(walk(view.render(), (n) => n.type === 'Modal')[0].props.visible, false);
});
test('Restore button explicitly applies validated backup and reports success', async () => { let payload; const view = ui(uiFlow({ restoreBackup: async (value) => { payload = value; return { ok: true }; } })); await find(view.render(), 'restore-backup').props.onPress(); await find(view.render(), 'confirm-restore').props.onPress(); assert.deepEqual(plain(payload.data), data()); assert.match(text(view.render()), /restored successfully/); });
for (const content of ['{bad', JSON.stringify({ format: 'GULABANI_BACKUP', version: 99 }), null]) test('invalid or canceled selection never exposes Restore: ' + content, async () => { const view = ui(uiFlow(), { readBackupFile: async () => content }); await find(view.render(), 'restore-backup').props.onPress(); assert.equal(find(view.render(), 'confirm-restore'), undefined); });
test('data summary shows counts without storage keys or mutations', () => { const view = ui(uiFlow()); find(view.render(), 'data-summary').props.onPress(); const content = text(view.render()); assert.match(content, /Projects\s*:\s+2/); assert.match(content, /Project Tasks\s*:\s+4/); assert.doesNotMatch(content, /flowpilot-state|gulabani-settings/); });
test('backup and export UI save distinct formats from one snapshot each', async () => { const saved = []; let snapshots = 0; const view = ui(uiFlow({ getDataSnapshot: () => { snapshots++; return data(); } }), { saveDataFile: async (...args) => { saved.push(args); return true; } }); await find(view.render(), 'create-backup').props.onPress(); await find(view.render(), 'export-data').props.onPress(); assert.equal(snapshots, 2); assert.equal(saved[0][2], 'application/json'); assert.equal(saved[1][2], 'text/csv'); assert.match(text(view.render()), /CSV cannot restore the app/); });
test('file failure UI shows error and no success claim', async () => { const view = ui(uiFlow(), { saveDataFile: async () => { throw Error('The file could not be saved.'); } }); await find(view.render(), 'create-backup').props.onPress(); assert.match(text(view.render()), /could not be saved/); assert.doesNotMatch(text(view.render()), /Backup saved to/); });
test('notification warning after restore is distinct from restore failure', async () => { const view = ui(uiFlow({ restoreBackup: async () => ({ ok: true, warning: 'Data restored. Check reminder permissions.' }) })); await find(view.render(), 'restore-backup').props.onPress(); await find(view.render(), 'confirm-restore').props.onPress(); assert.match(text(view.render()), /Data restored. Check reminder permissions/); });
test('double-tap prevention runs a data operation only once and disables controls', async () => { let release, calls = 0; const view = ui(uiFlow(), { readBackupFile: () => { calls++; return new Promise((resolve) => { release = resolve; }); } }); const button = find(view.render(), 'restore-backup'); const first = button.props.onPress(); await button.props.onPress(); assert.equal(calls, 1); assert.equal(find(view.render(), 'create-backup').props.disabled, true); release(null); await first; assert.equal(find(view.render(), 'create-backup').props.disabled, false); });
for (const theme of ['Light', 'Dark', 'System']) test(theme + ' data UI uses central colors and accessible actions', () => { const view = ui(uiFlow(), {}, theme), tree = view.render(); for (const id of ['create-backup', 'restore-backup', 'export-data', 'data-summary']) { const action = find(tree, id); assert.equal(action.props.accessibilityRole, 'button'); assert.ok(action.props.accessibilityLabel); assert.ok(action.props.style.minHeight >= 48); } const card = walk(tree, (n) => Array.isArray(n.props?.style) && n.props.style[1]?.backgroundColor)[0]; assert.equal(card.props.style[1].backgroundColor, palettes[theme === 'Light' ? 'light' : 'dark'].card); });
test('only approved exact dependency is newly declared and lockfile uses existing snapshot', () => {
  const root = path.resolve(__dirname, '../../..'), manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'))), lock = fs.readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8');
  assert.equal(manifest.dependencies['expo-file-system'], '57.0.7'); assert.match(lock, /expo-file-system:\s+specifier: 57\.0\.7\s+version: 57\.0\.7\(expo@57\.0\.24\)/); assert.equal(manifest.dependencies.expo, '~57.0.24');
});
test('startup recovery gate withholds children after failure, then Retry permits loading', async () => {
  const state = []; let cursor = 0, effect, fail = true;
  const api = loadSource('components/DataRecovery.tsx', {
    react: { useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (next) => { state[i] = next; }]; }, useEffect(fn) { effect = fn; } },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable' }, '@/lib/data-storage': { recoverData: async () => { if (fail) throw Error('disk'); } },
  });
  const render = () => { cursor = 0; return api.DataRecovery({ children: 'APP DATA' }); };
  assert.doesNotMatch(text(render()), /APP DATA/); effect(); await new Promise(setImmediate); let tree = render(); assert.match(text(tree), /could not be recovered/); assert.doesNotMatch(text(tree), /APP DATA/);
  fail = false; walk(tree, (node) => node.props?.accessibilityLabel === 'Retry data recovery')[0].props.onPress(); await new Promise(setImmediate); assert.equal(render(), 'APP DATA');
});
test('actual reminder reconcilers remove replaced dataset IDs and remain duplicate-free', async () => {
  const scheduled = new Map(), saved = {}; let counter = 0;
  const native = { Platform: { OS: 'android' } }, nativeNotifications = {
    setNotificationHandler() {}, SchedulableTriggerInputTypes: { DATE: 'date' }, getPermissionsAsync: async () => ({ granted: true }), requestPermissionsAsync: async () => ({ granted: true }),
    getAllScheduledNotificationsAsync: async () => [...scheduled.values()],
    cancelScheduledNotificationAsync: async (id) => { scheduled.delete(id); },
    scheduleNotificationAsync: async (value) => { const identifier = value.identifier ?? 'project-' + counter++; scheduled.set(identifier, { ...value, identifier }); return identifier; },
  };
  const projectReminders = loadSource('lib/notifications.ts', { 'react-native': native, 'expo-notifications': nativeNotifications, '@react-native-async-storage/async-storage': { getItem: async (key) => saved[key] ?? null, setItem: async (key, value) => { saved[key] = value; } } });
  const personalReminders = loadSource('lib/personal-notifications.ts', { 'react-native': native, 'expo-notifications': nativeNotifications, '@/lib/notifications': projectReminders });
  const old = data(), next = data(); next.projects[0].id = 'replacement'; next.tasks = next.tasks.filter((task) => task.projectId === 'p').map((task) => ({ ...task, projectId: 'replacement' })); next.personalTasks[0].id = 'replacement-personal';
  await projectReminders.syncProjectReminders(old.projects, old.tasks, true); await personalReminders.syncPersonalReminders(old.personalTasks, true); assert.ok(scheduled.size > 0);
  await projectReminders.syncProjectReminders(next.projects, next.tasks, true); await personalReminders.syncPersonalReminders(next.personalTasks, true); const count = scheduled.size;
  assert.ok([...scheduled.values()].every((item) => item.content.data.projectId !== 'p' && item.content.data.personalTaskId !== 'personal'));
  await projectReminders.syncProjectReminders(next.projects, next.tasks, true); await personalReminders.syncPersonalReminders(next.personalTasks, true); assert.equal(scheduled.size, count);
  await projectReminders.syncProjectReminders([], [], true); await personalReminders.syncPersonalReminders([], true); assert.equal(scheduled.size, 0);
});
