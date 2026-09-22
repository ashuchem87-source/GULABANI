// Run with: node --test scripts/template-management.test.cjs
// Exercises the real provider with an in-memory AsyncStorage and hook host.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { host, plain } = require('./flow-test-host.cjs');
test('legacy CII SELF: edit, unlimited steps, linked project sync, safe delete and reload', async () => {
  const storage = {};
  let render = host(storage);
  let flow = await render();
  flow.addTemplate({ name: 'CII SELF', category: 'Custom', description: 'Legacy', steps: [
    { id: 'legacy-a', title: 'First', description: 'Keep description', duration: 2 },
    { id: 'legacy-b', title: 'Second', description: '', duration: 3 },
  ] });
  flow = await render();
  const template = plain(flow.templates[0]);
  const projectInput = { name: 'Existing', client: 'Client', summary: '', templateId: template.id,
    dueDate: new Date().toISOString(), reminderFrequency: 'Daily' };
  await flow.addProject(projectInput);
  flow = await render();
  const originalProjects = plain(flow.projects), originalTasks = plain(flow.tasks);
  const steps = [{ ...template.steps[0], title: 'Renamed first' },
    ...Array.from({ length: 150 }, (_, i) => ({ id: `extra-${i}`, title: `Extra ${i}`, description: '', duration: 1 }))];
  flow.updateTemplate(template.id, { ...template, name: ' CII SELF edited ', steps });
  flow = await render();
  assert.equal(flow.templates[0].id, template.id);
  assert.equal(flow.templates[0].color, template.color);
  assert.equal(flow.templates[0].name, 'CII SELF edited');
  assert.equal(flow.templates[0].steps.length, 151);
  assert.equal(flow.templates[0].steps[0].description, 'Keep description');
  assert.deepEqual(plain(flow.projects), originalProjects);
  const synchronized = plain(flow.tasks);
  const owner = flow.projects.find((project) => project.templateId === template.id).id;
  assert.equal(synchronized.filter((task) => task.projectId === owner).length, 151);
  assert.deepEqual(synchronized.filter((task) => task.projectId !== owner), originalTasks.filter((task) => task.projectId !== owner));
  const renamed = synchronized.find((task) => task.projectId === owner && task.sourceTemplateStepId === 'legacy-a');
  assert.equal(renamed.title, 'Renamed first');
  assert.equal(renamed.id, originalTasks.find((task) => task.projectId === owner && task.sourceTemplateStepId === 'legacy-a').id);
  steps[0].title = 'Caller mutation';
  assert.equal(flow.templates[0].steps[0].title, 'Renamed first');
  const saved = plain(flow.templates);
  flow.updateTemplate(template.id, { ...template, name: ' ' });
  flow.updateTemplate(template.id, { ...template, steps: [{ ...template.steps[0], title: ' ' }] });
  flow.updateTemplate(template.id, { ...template, steps: [] });
  flow.addTemplate({ ...template, name: ' ' });
  flow = await render();
  assert.deepEqual(plain(flow.templates), saved);
  render = host(storage);
  flow = await render();
  assert.deepEqual(plain(flow.templates), saved);
  assert.deepEqual(plain(flow.tasks), synchronized);
  await flow.addProject({ ...projectInput, name: 'Future' });
  flow = await render();
  assert.equal(flow.tasks.filter((task) => task.projectId === flow.projects[0].id).length, 151);
  const beforeDelete = { projects: plain(flow.projects), tasks: plain(flow.tasks) };
  flow.templates.forEach((item) => flow.deleteTemplate(item.id));
  flow = await render();
  assert.equal(flow.templates.length, 0);
  assert.deepEqual(plain(flow.projects), beforeDelete.projects.map((project) => ({ ...project, templateId: '' })));
  assert.deepEqual(plain(flow.tasks), beforeDelete.tasks.map(({ sourceTemplateStepId, ...task }) => task.isManual ? task : ({ ...task, templateDetached: true })));
  await flow.addProject(projectInput);
  flow = await render();
  assert.deepEqual(plain(flow.projects), beforeDelete.projects.map((project) => ({ ...project, templateId: '' })));
  render = host(storage);
  flow = await render();
  assert.equal(flow.templates.length, 0);
  assert.deepEqual(plain(flow.tasks), beforeDelete.tasks.map(({ sourceTemplateStepId, ...task }) => task.isManual ? task : ({ ...task, templateDetached: true })));
  assert.equal(flow.projects.length, beforeDelete.projects.length);
});

test('older storage without templates retains projects and task snapshots', async () => {
  const storage = {};
  let flow = await host(storage)();
  const oldData = plain({ projects: flow.projects, tasks: flow.tasks });
  storage.value = JSON.stringify(oldData);
  flow = await host(storage)();
  assert.equal(flow.templates.length, 3);
  assert.deepEqual(plain(flow.tasks), oldData.tasks);
  assert.equal(flow.projects.length, oldData.projects.length);
});
