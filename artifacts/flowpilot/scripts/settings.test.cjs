const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource, plain, host } = require('./flow-test-host.cjs');
const model = loadSource('lib/settings.ts');
const personal = loadSource('lib/personal-tasks.ts');
const defaults = plain(model.DEFAULT_SETTINGS);
const settings = (patch = {}) => ({ ...defaults, ...patch });
const tick = () => new Promise(setImmediate);
function hooks() {
  const state = [], deps = [], cleanups = []; let cursor = 0, effectCursor = 0, effects = [];
  const react = {
    createContext: (value) => ({ Provider: 'Provider', value }), useContext: (context) => context.value,
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; },
    useMemo: (fn) => fn(),
    useEffect(fn, next) { const i = effectCursor++; if (!deps[i] || next.some((v,j) => v !== deps[i][j])) { cleanups[i]?.(); effects.push(() => { cleanups[i] = fn(); }); } deps[i] = next; },
  };
  return { react, render(fn) { cursor = 0; effectCursor = 0; effects = []; const value = fn(); effects.forEach(fn => fn()); return value; } };
}
const native = { View: 'View', Text: 'Text', Pressable: 'Pressable', Switch: 'Switch', TextInput: 'TextInput', ScrollView: 'ScrollView', Modal: 'Modal', KeyboardAvoidingView: 'View', Platform: { OS: 'android' }, StyleSheet: { create: value => value } };
function provider(storage = {}) {
  const h = hooks();
  const api = loadSource('context/SettingsContext.tsx', { react: h.react, 'react-native': native, '@react-native-async-storage/async-storage': {
    getItem: async key => { assert.equal(key, model.SETTINGS_KEY); if (storage.readFail) throw Error('read'); return storage.raw ?? null; },
    setItem: async (key, raw) => { assert.equal(key, model.SETTINGS_KEY); if (storage.writeFail) throw Error('write'); storage.raw = raw; },
  } });
  return { async render() { let tree; for (let i=0;i<3;i++) { tree = h.render(() => api.SettingsProvider({children: 'children'})); await tick(); } return tree; } };
}
function walk(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(item => walk(item, predicate));
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...walk(node.props?.children, predicate)];
}
const find = (tree, id) => walk(tree, node => node.props?.testID === id)[0];
function content(node) {
  if (Array.isArray(node)) return node.map(content).join(' ');
  if (node && typeof node === 'object') return content(node.props?.children);
  return String(node ?? '');
}
function ui(file, flow = {}, preference = settings(), extra = {}) {
  const h = hooks(), navigation = [];
  const api = loadSource(file, {
    react: h.react, 'react-native': native,
    'expo-router': { router: { push: path => navigation.push(path), replace: path => navigation.push(path), back() {} }, useLocalSearchParams: () => ({}) },
    'expo-haptics': { notificationAsync() {}, NotificationFeedbackType: { Success: 'success' } },
    'expo-constants': { expoConfig: { name: 'GULABANI', version: '9.8.7', android: { versionCode: 123 } } },
    '@expo/vector-icons': { Feather: 'Feather' }, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({top:0,bottom:0}) },
    '@/components/AppText': { AppText: 'AppText' }, '@/components/TaskRow': { TaskRow: 'TaskRow' }, '@/components/PersonalTaskRow': { PersonalTaskRow: 'PersonalTaskRow' }, '@/components/ProjectDateField': { ProjectDateField: 'DateField' },
    '@/hooks/useColors': { useColors: () => ({}) }, '@/context/FlowContext': { useFlow: () => flow, daysRemaining: () => 1 },
    '@/context/SettingsContext': { useSettings: () => ({ settings: preference, error: '', update: (key,value) => { preference[key] = value; }, retry() {} }), useDateFormatter: () => date => model.formatDate(date,preference.dateFormat) },
    ...extra,
  });
  return { navigation, render: () => h.render(() => { const tree = api.default ? api.default() : api.ProjectDateField({value:'2026-06-01',onChange() {}}); return typeof tree.type === 'function' ? tree.type(tree.props) : tree; }) };
}

test('settings defaults load on existing installations without settings', async () => {
  assert.deepEqual(plain((await provider().render()).props.value.settings), defaults);
});
for (const [key,value] of Object.entries({ startScreen:'To-do',dateFormat:'DD MMM YYYY',firstDayOfWeek:'Sunday',notificationsEnabled:false,defaultReminder:'1 day before',showPersonal:false,showProjects:false,showCompleted:false,defaultPriority:'Critical',projectDuration:25,showCompletedProjects:false,theme:'Dark' })) {
  test(key + ' persists through provider reload', async () => {
    const storage = {}, h = provider(storage); const tree = await h.render();
    tree.props.value.update(key,value); await tick();
    assert.equal((await provider(storage).render()).props.value.settings[key],value);
  });
}
test('partial, invalid and corrupt settings receive safe defaults', () => {
  assert.deepEqual(plain(model.decodeSettings('{bad')),defaults);
  assert.deepEqual(plain(model.decodeSettings('null')),defaults);
  assert.deepEqual(plain(model.normalizeSettings({ theme:'Light',showPersonal:'false',projectDuration:0 })),settings({theme:'Light'}));
});
test('rapid saves preserve unknown future fields and the latest values', async () => {
  const storage = {raw:JSON.stringify({ future:{ dashboard:true },startScreen:'Projects' })}; const p=provider(storage), tree=await p.render();
  tree.props.value.update('theme','Dark'); tree.props.value.update('showPersonal',false); tree.props.value.update('dateFormat','YYYY-MM-DD'); await tick();
  const saved=(await provider(storage).render()).props.value.settings;
  assert.deepEqual(plain(saved.future),{dashboard:true}); assert.equal(saved.theme,'Dark'); assert.equal(saved.showPersonal,false); assert.equal(saved.dateFormat,'YYYY-MM-DD'); assert.equal(saved.startScreen,'Projects');
});
test('storage failures are visible, retryable, and never overwrite unread preferences', async () => {
  const storage={readFail:true,raw:JSON.stringify({theme:'Dark'})}, p=provider(storage);
  let tree=await p.render(); assert.match(content(tree),/could not be loaded/); assert.equal(tree.type,'View');
  storage.readFail=false; walk(tree,n=>n.type==='Pressable')[0].props.onPress(); tree=await p.render();
  storage.writeFail=true; tree.props.value.update('theme','Light'); tree=await p.render(); assert.match(tree.props.value.error,/could not be saved/);
  assert.equal(JSON.parse(storage.raw).theme,'Dark'); storage.writeFail=false; tree.props.value.retry(); tree=await p.render(); assert.equal(tree.props.value.error,''); assert.equal(JSON.parse(storage.raw).theme,'Light');
});
test('date formats follow preference without mutating underlying dates', () => {
  const task={dueDate:'2026-06-09'}, before=JSON.stringify(task);
  assert.equal(model.formatDate(task.dueDate,'DD/MM/YYYY'),'09/06/2026'); assert.equal(model.formatDate(task.dueDate,'DD MMM YYYY'),'09 Jun 2026'); assert.equal(model.formatDate(task.dueDate,'YYYY-MM-DD'),'2026-06-09'); assert.equal(JSON.stringify(task),before); assert.equal(model.formatDate('bad','DD/MM/YYYY'),'Unknown date');
});
test('launch destinations respect Home and preserve non-root routes', () => {
  assert.equal(model.startRoute('Home','/'),undefined); assert.equal(model.startRoute('Projects','/'),'/projects'); assert.equal(model.startRoute('To-do','/'),'/tasks'); for(const path of ['/personal-task','/project/123','/settings','/tasks']) assert.equal(model.startRoute('Projects',path),undefined);
});
test('calendar week headings follow Monday and Sunday preference', () => {
  const preference=settings(); const h=ui('components/ProjectDateField.tsx',{},preference);
  let text=content(h.render()); assert.match(text,/Mon Tue Wed Thu Fri Sat Sun/);
  preference.firstDayOfWeek='Sunday'; text=content(h.render()); assert.match(text,/Sun Mon Tue Wed Thu Fri Sat/);
});
test('default priority and reminder affect only new eligible personal tasks', () => {
  const prefs=settings({defaultPriority:'Critical',defaultReminder:'1 hour before'}), initial=model.personalInitial(prefs);
  assert.equal(initial.priority,'Critical'); assert.equal(initial.reminder,'None');
  const eligible={...initial,dueDate:'2090-06-01',dueTime:'12:00'};
  assert.equal(model.applyReminderDefault(eligible,prefs,false,false).reminder,'1 hour before');
  assert.equal(model.applyReminderDefault(eligible,prefs,false,true).reminder,'None');
  const existing={...eligible,priority:'Low',reminder:'10 minutes before'}, before=JSON.stringify(existing);
  assert.equal(model.personalInitial(prefs,existing).priority,'Low'); assert.equal(model.applyReminderDefault(existing,prefs,true,false).reminder,'10 minutes before'); assert.equal(JSON.stringify(existing),before);
  assert.match(personal.validatePersonal({...initial,title:'Test',reminder:'At due time'}),/date.*time/i);
});
test('personal form uses defaults when date/time become eligible and respects explicit None', async () => {
  let saved; const h=ui('app/personal-task.tsx',{hydrated:true,personalTasks:[],savePersonalTask:async input=>{saved=input;return{ok:true};}}, settings({defaultPriority:'High',defaultReminder:'At due time'}));
  let tree=h.render(); find(tree,'personal-title').props.onChangeText('Task'); walk(tree,n=>n.type==='DateField')[0].props.onChange('2090-06-01'); tree=h.render(); find(tree,'personal-time').props.onChangeText('12:00'); tree=h.render();
  await find(tree,'save-personal-task').props.onPress(); assert.equal(saved.priority,'High'); assert.equal(saved.reminder,'At due time');
  const choices=walk(tree,n=>typeof n.type==='function' && n.props?.label==='REMINDER')[0]; choices.props.onSelect('None'); tree=h.render(); find(tree,'personal-time').props.onChangeText('13:00'); tree=h.render(); await find(tree,'save-personal-task').props.onPress(); assert.equal(saved.reminder,'None');
});
const projectTasks=[{id:'p1',projectId:'p',status:'todo',dueDate:'2090-01-01'},{id:'p2',projectId:'p',status:'done',dueDate:'2090-01-01'}];
const personalTasks=[{...personal.PERSONAL_DEFAULTS,id:'a',status:'todo'},{...personal.PERSONAL_DEFAULTS,id:'b',status:'done'}];
for(const [key,kind] of [['showPersonal','personal'],['showProjects','project']]) test(key+' hides only display, preserves filters and stored data',()=>{
  const before=JSON.stringify([projectTasks,personalTasks]), prefs=settings({[key]:false});
  for(const filter of ['All','Personal','Projects']) assert.ok(personal.todoEntries(projectTasks,personalTasks,filter,prefs).every(entry=>entry.kind!==kind));
  assert.equal(JSON.stringify([projectTasks,personalTasks]),before);
});
test('completed visibility and both-hidden empty states work with all filters',()=>{
  assert.equal(personal.todoEntries(projectTasks,personalTasks,'All',settings({showCompleted:false})).length,2);
  const hidden=settings({showPersonal:false,showProjects:false}); assert.equal(personal.todoEntries(projectTasks,personalTasks,'All',hidden).length,0); assert.match(model.todoEmptyMessage(hidden,'All'),/Enable them in Settings/);
  assert.match(model.todoEmptyMessage(settings({showPersonal:false}),'Personal'),/Personal tasks are hidden/); assert.match(model.todoEmptyMessage(settings({showProjects:false}),'Projects'),/Project tasks are hidden/);
});
test('To-do screen consumes settings, keeps Add To-do and explains hidden filters',()=>{
  const prefs=settings({showPersonal:false}), h=ui('app/(tabs)/tasks.tsx',{tasks:projectTasks,personalTasks},prefs);
  let tree=h.render(); assert.equal(walk(tree,n=>n.type==='PersonalTaskRow').length,0); assert.equal(walk(tree,n=>n.type==='TaskRow').length,2); assert.ok(find(tree,'add-personal-todo'));
  find(tree,'todo-filter-Personal').props.onPress(); tree=h.render(); assert.match(content(tree),/Personal tasks are hidden in Settings/);
  prefs.showProjects=false; find(tree,'todo-filter-All').props.onPress(); assert.match(content(h.render()),/Enable them in Settings/);
});
test('new project initializes configured duration and still accepts an individual override',()=>{
  const h=ui('app/new-project.tsx',{templates:[]},settings({projectDuration:27})); let tree=h.render();
  const field=walk(tree,n=>n.type==='TextInput' && n.props.value==='27')[0]; assert.ok(field); field.props.onChangeText('15'); tree=h.render(); assert.ok(walk(tree,n=>n.type==='TextInput' && n.props.value==='15')[0]);
});
test('invalid duration defaults are rejected or safely normalized',()=>{
  for(const value of ['0','-1','1.5','1e2','abc','Infinity','999999999999','3651',' 2 ','']) assert.equal(model.parseDuration(value),undefined,value);
  for(const value of [0,-1,1.5,Infinity,'20',3651]) assert.equal(model.normalizeSettings({projectDuration:value}).projectDuration,10);
  assert.equal(model.parseDuration('1'),1); assert.equal(model.parseDuration('3650'),3650);
});
test('System Light Dark resolve correctly and all palette token names match',()=>{
  assert.equal(model.resolveTheme('System','dark'),'dark'); assert.equal(model.resolveTheme('System',null),'light'); assert.equal(model.resolveTheme('Light','dark'),'light'); assert.equal(model.resolveTheme('Dark','light'),'dark');
  const colors=loadSource('constants/colors.ts').default; assert.deepEqual(Object.keys(colors.light).sort(),Object.keys(colors.dark).sort());
  function luminance(hex) { const c=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4); return c[0]*.2126+c[1]*.7152+c[2]*.0722; }
  const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  for(const background of ['background','card']) for(const text of ['foreground','mutedForeground']) assert.ok(contrast(colors.dark[text],colors.dark[background])>=4.5, text+'/'+background);
  assert.ok(contrast('#FFFFFF',colors.dark.action)>=4.5); assert.ok(contrast('#FFFFFF',colors.dark.panel)>=4.5);
});
test('Settings renders all sections, config version/build and expandable Help',()=>{
  const h=ui('app/(tabs)/settings.tsx'); let tree=h.render(); const text=content(tree);
  for(const heading of ['General','Notifications','To-do Preferences','Project Preferences','Appearance','About GULABANI','Help','9.8.7','123']) assert.ok(text.includes(heading),heading);
  assert.ok(text.includes('Controls completed projects in the Active list'));
  const button=walk(tree,n=>n.type==='Pressable'&&content(n)==='Projects ')[0] ?? walk(tree,n=>n.type==='Pressable'&&content(n).trim()==='Projects')[0]; assert.ok(button); button.props.onPress(); tree=h.render(); assert.match(content(tree),/Create a project from a template/);
});
function notifications({ failAt } = {}) {
  const scheduled=new Map(), cancelled=[], calls=[], stored={}; let asked=0;
  const mocks={
    'react-native':native,
    '@react-native-async-storage/async-storage':{getItem:async key=>stored[key]??null,setItem:async(key,value)=>{stored[key]=value;}},
    'expo-notifications':{
      setNotificationHandler() {},getPermissionsAsync:async()=>({granted:true}),requestPermissionsAsync:async()=>{asked++;return{granted:true};},
      getAllScheduledNotificationsAsync:async()=>[...scheduled.values()],cancelScheduledNotificationAsync:async id=>{cancelled.push(id);scheduled.delete(id);},
      scheduleNotificationAsync:async item=>{if(calls.length===failAt) throw Error('schedule failed'); const id=item.identifier??'project-'+calls.length;calls.push(item);scheduled.set(id,{...item,identifier:id});return id;},
      SchedulableTriggerInputTypes:{DATE:'date'},
    },
  };
  const project=loadSource('lib/notifications.ts',mocks);
  const personal=loadSource('lib/personal-notifications.ts',{...mocks,'@/lib/notifications':project});
  return {...project,...personal,scheduled,cancelled,calls,stored,get asked(){return asked;}};
}
const reminderTask={...personal.PERSONAL_DEFAULTS,title:'Future',id:'future',status:'todo',dueDate:'2090-06-01',dueTime:'12:00',reminder:'At due time'};
const reminderProject={id:'p',name:'Project',dueDate:'2090-06-01',reminderFrequency:'Weekly',remindersEnabled:true};
const reminderProjectTasks=[{id:'step',projectId:'p',title:'Work',status:'todo',dueDate:'2090-01-01',order:0}];
test('master OFF prevents new personal and project scheduling without permission prompts',async()=>{
  const h=notifications(); await h.syncProjectReminders([reminderProject],reminderProjectTasks,false); await h.scheduleProjectReminders(reminderProject,reminderProjectTasks); await h.syncPersonalReminders([reminderTask],false);
  assert.equal(h.scheduled.size,0);assert.equal(h.calls.length,0);assert.equal(h.asked,0);
});
test('master OFF cancels personal and legacy project reminder IDs, preserving unrelated notifications',async()=>{
  const h=notifications(); await h.scheduleProjectReminders(reminderProject,reminderProjectTasks); await h.syncPersonalReminders([reminderTask],true); assert.ok(h.scheduled.size>1);
  h.scheduled.set('unrelated',{identifier:'unrelated',content:{}});
  await h.syncProjectReminders([reminderProject],reminderProjectTasks,false); await h.syncPersonalReminders([reminderTask],false);
  assert.deepEqual([...h.scheduled.keys()],['unrelated']); assert.deepEqual(JSON.parse(h.stored['flowpilot-scheduled-reminder-ids-v1']),{});
});
test('master ON restores eligible project and personal reminders without duplicate live notifications',async()=>{
  const h=notifications(), before=JSON.stringify([reminderTask,reminderProject,reminderProjectTasks]);
  await h.syncProjectReminders([reminderProject],reminderProjectTasks,false); await h.syncPersonalReminders([reminderTask],false);
  await h.syncProjectReminders([reminderProject],reminderProjectTasks,true); await h.syncPersonalReminders([reminderTask],true); const count=h.scheduled.size;
  assert.ok(count>1); await h.syncProjectReminders([reminderProject],reminderProjectTasks,true); await h.syncPersonalReminders([reminderTask],true); assert.equal(h.scheduled.size,count);
  const signatures=[...h.scheduled.values()].map(item=>JSON.stringify([item.content.data,item.trigger.date])); assert.equal(new Set(signatures).size,count); assert.equal(JSON.stringify([reminderTask,reminderProject,reminderProjectTasks]),before);
});
test('rapid notification toggles and queued schedules settle at OFF without orphan IDs',async()=>{
  const h=notifications(); await Promise.all([h.scheduleProjectReminders(reminderProject,reminderProjectTasks),h.syncProjectReminders([reminderProject],reminderProjectTasks,false),h.syncPersonalReminders([reminderTask],true),h.syncPersonalReminders([reminderTask],false)]);
  assert.equal(h.scheduled.size,0);
});
test('project notification serialization retains records for multiple projects',async()=>{
  const h=notifications(), other={...reminderProject,id:'p2'}, otherTasks=reminderProjectTasks.map(t=>({...t,projectId:'p2'}));
  await Promise.all([h.scheduleProjectReminders(reminderProject,reminderProjectTasks),h.scheduleProjectReminders(other,otherTasks)]);
  assert.deepEqual(Object.keys(JSON.parse(h.stored['flowpilot-scheduled-reminder-ids-v1'])).sort(),['p','p2']);
  await h.syncProjectReminders([],[],false); assert.equal(h.scheduled.size,0);
});
test('settings toggles preserve all persisted projects/templates/tasks and skip personal permission while OFF',async()=>{
  const storage={}, prefs=settings({notificationsEnabled:false}); let asked=0; const syncs=[];
  const render=host(storage,{mocks:{'@/context/SettingsContext':{useSettings:()=>({settings:prefs})},'@/lib/personal-notifications':{askPersonalReminderPermission:async()=>{asked++;},syncPersonalReminders:async(tasks,enabled)=>{syncs.push(enabled);}}}});
  let flow=await render(); await flow.savePersonalTask(reminderTask); flow=await render(); assert.equal(asked,0); assert.equal(syncs.at(-1),false);
  const before=JSON.stringify({projects:flow.projects,tasks:flow.tasks,templates:flow.templates,personalTasks:flow.personalTasks});
  Object.assign(prefs,{notificationsEnabled:true,projectDuration:30,dateFormat:'YYYY-MM-DD',showPersonal:false,showProjects:false,showCompletedProjects:false,defaultPriority:'Critical'});
  flow=await render(); assert.equal(syncs.at(-1),true); assert.equal(JSON.stringify({projects:flow.projects,tasks:flow.tasks,templates:flow.templates,personalTasks:flow.personalTasks}),before);
  const reloaded=await host(storage)(); assert.equal(JSON.stringify({projects:reloaded.projects,tasks:reloaded.tasks,templates:reloaded.templates,personalTasks:reloaded.personalTasks}),before);
});
test('settings controls update immediately and duration dialog rejects malformed input',()=>{
  const prefs=settings(),h=ui('app/(tabs)/settings.tsx',{},prefs);let tree=h.render();
  find(tree,'notificationsEnabled').props.onValueChange(false);assert.equal(prefs.notificationsEnabled,false);
  find(tree,'projectDuration').props.onPress();tree=h.render();
  walk(tree,n=>n.type==='TextInput')[0].props.onChangeText('0');tree=h.render();
  walk(tree,n=>n.type==='Pressable'&&content(n)==='Save duration')[0].props.onPress();tree=h.render();assert.match(content(tree),/Enter a whole number/);assert.equal(prefs.projectDuration,10);
  walk(tree,n=>n.type==='TextInput')[0].props.onChangeText('21');tree=h.render();walk(tree,n=>n.type==='Pressable'&&content(n)==='Save duration')[0].props.onPress();assert.equal(prefs.projectDuration,21);
});
test('global colors hook follows explicit theme and subsequent system changes',()=>{
  let scheme='light';const prefs=settings(),colors=loadSource('constants/colors.ts').default;
  const api=loadSource('hooks/useColors.ts',{'react-native':{useColorScheme:()=>scheme},'@/constants/colors':{default:colors,__esModule:true},'@/context/SettingsContext':{useSettings:()=>({settings:prefs})}});
  assert.equal(api.useColors().background,colors.light.background);scheme='dark';assert.equal(api.useColors().background,colors.dark.background);
  prefs.theme='Light';assert.equal(api.useColors().isDark,false);prefs.theme='Dark';scheme='light';assert.equal(api.useColors().isDark,true);
});
function launch(initialURL) {
  const h=hooks(), prefs=settings({startScreen:'Projects'}), navigation=[];let pathname='/';
  const component=()=>null;
  const api=loadSource('app/_layout.tsx',{
    react:h.react,'react-native':{...native,Linking:{getInitialURL:async()=>initialURL}},
    '@/context/SettingsContext':{SettingsProvider:'SettingsProvider',useSettings:()=>({settings:prefs})},'@/context/FlowContext':{FlowProvider:'FlowProvider'},
    '@/hooks/useColors':{useColors:()=>({})},'expo-status-bar':{StatusBar:'StatusBar'},
    '@tanstack/react-query':{QueryClient:class{},QueryClientProvider:'QueryClientProvider'},'react-native-gesture-handler':{GestureHandlerRootView:'View'},'react-native-keyboard-controller':{KeyboardProvider:'KeyboardProvider'},'react-native-safe-area-context':{SafeAreaProvider:'SafeAreaProvider'},'@/components/ErrorBoundary':{ErrorBoundary:'ErrorBoundary'},
    '@expo-google-fonts/inter':{useFonts:()=>[true,null]},'expo-splash-screen':{preventAutoHideAsync(){},hideAsync(){}},
    'expo-router':{Stack:Object.assign(component,{Screen:'Screen'}),router:{replace:path=>navigation.push(path)},usePathname:()=>pathname,useRootNavigationState:()=>({key:'ready'})},
  });
  let navComponent;h.render(()=>{const tree=api.default();navComponent=walk(tree,n=>typeof n.type==='function')[0].type;});
  return { navigation, prefs, render: () => h.render(navComponent), go: path => { pathname=path; } };
}
test('launch navigation applies once and never redirects when a preference changes later',async()=>{
  const h=launch(null);h.render();await tick();assert.deepEqual(h.navigation,['/projects']);
  h.prefs.startScreen='To-do';h.render();await tick();assert.deepEqual(h.navigation,['/projects']);
});
test('launch navigation preserves initial links and a user navigation during URL lookup',async()=>{
  const link=launch('gulabani://personal-task');link.render();await tick();assert.deepEqual(link.navigation,[]);
  const moving=launch(null);moving.render();moving.go('/personal-task');moving.render();await tick();assert.deepEqual(moving.navigation,[]);
});
test('partially failed project scheduling retains cancellable IDs',async()=>{
  const h=notifications({failAt:1});await assert.rejects(h.scheduleProjectReminders(reminderProject,reminderProjectTasks),/schedule failed/);
  assert.equal(h.scheduled.size,1);assert.equal(JSON.parse(h.stored['flowpilot-scheduled-reminder-ids-v1']).p.length,1);
  await h.syncProjectReminders([reminderProject],reminderProjectTasks,false);assert.equal(h.scheduled.size,0);
});
test('project screen explains master OFF and opens Settings without claiming reminders are on',()=>{
  const h=ui('app/project/[id].tsx',{projects:[reminderProject],tasks:reminderProjectTasks,templates:[]},settings({notificationsEnabled:false}),{'expo-router':{useLocalSearchParams:()=>({id:'p'}),router:{push(){},replace(){},back(){}}}});
  assert.match(content(h.render()),/Notifications are off in Settings/);assert.doesNotMatch(content(h.render()),/Reminders are on/);
});
