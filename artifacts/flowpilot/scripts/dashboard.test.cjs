const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { host, plain, loadSource } = require('./flow-test-host.cjs');
const dashboard = loadSource('lib/dashboard.ts');
const personal = loadSource('lib/personal-tasks.ts');
const dates = loadSource('lib/task-utils.ts');
const settingsModel = loadSource('lib/settings.ts');
const palettes = loadSource('constants/colors.ts').default;
const TODAY = '2026-09-21';
const iso = (day, hour = 12) => { const date=dates.readDate(day);date.setHours(hour,0,0,0);return date.toISOString(); };
const ptask = (id, dueDate = TODAY, more = {}) => ({ id,projectId:'p',title:id,description:'',duration:1,status:'todo',dueDate:iso(dueDate),order:0,...more });
const personalTask = (id, dueDate = TODAY, more = {}) => ({ ...personal.PERSONAL_DEFAULTS,id,title:id,dueDate,status:'todo',createdAt:iso('2026-09-01'),seriesId:id,occurrence:0,...more });
const pref = patch => ({...plain(settingsModel.DEFAULT_SETTINGS),...patch});
const project = {id:'p',name:'KFIL BARAMATI',client:'Client',summary:'',templateId:'flow',projectStartDate:'2026-09-01',startDate:iso('2026-09-01'),dueDate:iso('2026-10-31'),reminderFrequency:'Daily',remindersEnabled:false};
const groups = (tasks=[], personals=[], settings=pref()) => dashboard.dashboardGroups(tasks,personals,TODAY,settings);
const ids = entries => plain(entries.map(e=>e.task.id));

for(const [label,date,bucket] of [['due today',TODAY,'today'],['overdue','2026-09-20','overdue'],['upcoming','2026-09-22','upcoming']]) {
  test('classifies '+label+' workflow, manual and personal tasks together',()=>{
    const workflow=ptask('workflow',date),manual=ptask('manual',date,{isManual:true}),general=personalTask('personal',date);
    const result=groups([workflow,manual],[general]);assert.deepEqual(ids(result[bucket]),['workflow','manual','personal']);
    assert.equal(dashboard.dashboardCounts(result)[bucket],3);assert.equal(Object.values(result).flat().length,3);
    assert.equal(result[bucket][0].task,workflow);assert.equal(result[bucket][1].task,manual);assert.equal(result[bucket][2].task,general);
  });
}
test('undated personal tasks are Unscheduled only; invalid dates are not misclassified',()=>{
  const task=personalTask('undated',undefined,{dueDate:undefined});const result=groups([], [task,personalTask('bad','not-a-date')]);
  assert.deepEqual(ids(result.unscheduled),['undated']);assert.equal(result.today.length+result.overdue.length+result.upcoming.length,0);
});
test('completed tasks never enter open buckets; completion uses timestamp, not due date',()=>{
  const result=groups([ptask('today-completion','2026-09-10',{status:'done',completedAt:iso(TODAY)}),ptask('historic',TODAY,{status:'done',completedAt:iso('2026-09-20')})],[personalTask('done', '2026-09-25',{status:'done',completedAt:iso(TODAY)})]);
  assert.deepEqual(ids(result.completed),['today-completion','done']);assert.equal(dashboard.dashboardCounts(result).completed,2);
  assert.equal(result.today.length+result.overdue.length+result.upcoming.length,0);
});
test('legacy missing/invalid completion timestamps never fall back to due or creation dates',()=>{
  const result=groups([ptask('legacy',TODAY,{status:'done'}),ptask('invalid',TODAY,{status:'done',completedAt:'bad'})],[personalTask('legacy-personal',TODAY,{status:'done',createdAt:iso(TODAY)})]);
  assert.equal(Object.values(result).flat().length,0);
});
test('Today sorts explicit times first then date-only tasks, preserving stable ties',()=>{
  const result=groups([ptask('workflow'),ptask('manual',TODAY,{isManual:true})],[personalTask('late',TODAY,{dueTime:'20:00'}),personalTask('early',TODAY,{dueTime:'08:00'}),personalTask('same',TODAY,{dueTime:'08:00'}),personalTask('date-only')]);
  assert.deepEqual(ids(result.today),['early','same','late','workflow','manual','date-only']);
});
test('Overdue sorts oldest calendar date first and Upcoming nearest first',()=>{
  const result=groups([ptask('near','2026-09-22'),ptask('recent','2026-09-20'),ptask('far','2026-12-01'),ptask('oldest','2020-01-01')],[personalTask('middle','2026-10-01')]);
  assert.deepEqual(ids(result.overdue),['oldest','recent']);assert.deepEqual(ids(result.upcoming),['near','middle','far']);
});
test('Completed Today sorts most recent first; Unscheduled keeps stored order',()=>{
  const result=groups([ptask('early',TODAY,{status:'done',completedAt:iso(TODAY,8)})],[personalTask('late',undefined,{status:'done',completedAt:iso(TODAY,20)}),personalTask('a',undefined,{dueDate:undefined}),personalTask('b',undefined,{dueDate:undefined})]);
  assert.deepEqual(ids(result.completed),['late','early']);assert.deepEqual(ids(result.unscheduled),['a','b']);
});
for(const [key,kind] of [['showPersonal','personal'],['showProjects','project']]) test(key+' hides matching lists/counts without changing ownership or input data',()=>{
  const projects=[ptask('p')], personals=[personalTask('a'),personalTask('undated',undefined,{dueDate:undefined}),personalTask('done',TODAY,{status:'done',completedAt:iso(TODAY)})];
  const before=JSON.stringify([projects,personals]),result=groups(projects,personals,pref({[key]:false}));
  assert.ok(Object.values(result).flat().every(e=>e.kind!==kind));assert.equal(result.today.length,1);assert.equal(JSON.stringify([projects,personals]),before);
});
test('Show Completed OFF removes completed data/counts but leaves open tasks',()=>{
  const result=groups([ptask('open'),ptask('done',TODAY,{status:'done',completedAt:iso(TODAY)})],[],pref({showCompleted:false}));
  assert.equal(result.today.length,1);assert.equal(result.completed.length,0);assert.equal(dashboard.dashboardCounts(result).completed,0);
});
test('shared workflow IDs and personal IDs retain distinct ownership keys',()=>{
  const entries=groups([ptask('same'),ptask('same',TODAY,{projectId:'other'})],[personalTask('same')]).today;
  assert.equal(new Set(entries.map(dashboard.dashboardEntryKey)).size,3);
});
test('selectors are pure, preserve historical deadlines/snapshots, and handle a large task list',()=>{
  const tasks=Array.from({length:2500},(_,i)=>ptask('task-'+i,'2026-09-22'));tasks.forEach(Object.freeze);Object.freeze(tasks);
  const before=JSON.stringify(tasks);const result=groups(tasks);assert.equal(result.upcoming.length,2500);assert.equal(JSON.stringify(tasks),before);
});

function walk(node, predicate) {
  if(Array.isArray(node))return node.flatMap(item=>walk(item,predicate));
  if(!node||typeof node!=='object')return[];
  return [...(predicate(node)?[node]:[]),...walk(node.props?.children,predicate)];
}
const find=(tree,id)=>walk(tree,n=>n.props?.testID===id)[0];
function text(node){if(Array.isArray(node))return node.map(text).join(' ');if(node&&typeof node==='object')return text(node.props?.children);return String(node??'');}
const native={Platform:{OS:'android'},StyleSheet:{create:v=>v,hairlineWidth:1},View:'View',Pressable:'Pressable',ScrollView:'ScrollView',Modal:'Modal'};
function ui(file, flow, preferences=pref(), more={}) {
  const state=[];let cursor=0,system='light';const navigation=[];
  const getFlow=typeof flow==='function'?flow:()=>flow;
  const mocks={
    react:{useMemo:fn=>fn(),useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}];}},
    'react-native':native,'@expo/vector-icons':{Feather:'Feather'},'expo-router':{router:{push:path=>navigation.push(path)}},
    'expo-haptics':{selectionAsync(){}},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},
    '@/components/AppText':{AppText:'AppText'},'@/components/TaskRow':{TaskRow:'TaskRow'},'@/components/PersonalTaskRow':{PersonalTaskRow:'PersonalTaskRow'},'@/components/QuickAdd':{QuickAdd:'QuickAdd'},
    '@/context/FlowContext':{useFlow:getFlow,daysRemaining:value=>dates.calendarDaysUntil(value,dates.readDate(getFlow().calendarDate??TODAY))},
    '@/context/SettingsContext':{useSettings:()=>({settings:preferences}),useDateFormatter:()=>value=>settingsModel.formatDate(value,preferences.dateFormat)},
    '@/hooks/useColors':{useColors:()=>({...palettes[settingsModel.resolveTheme(preferences.theme,system)]})},...more,
  };
  const api=loadSource(file,mocks);
  return {navigation,setSystem:value=>{system=value;},render(props){cursor=0;const component=api.default??api.QuickAdd??api.TaskRow??api.PersonalTaskRow;return component(props);}};
}
const flowState=(patch={})=>({projects:[project],tasks:[],personalTasks:[],calendarDate:TODAY,hydrated:true,...patch});

test('Home summary counts include all items while Upcoming, No Date and Completed show five with View all',()=>{
  const tasks=Array.from({length:8},(_,i)=>ptask('upcoming-'+i,'2026-09-22'));
  const personals=[...Array.from({length:7},(_,i)=>personalTask('no-date-'+i,undefined,{dueDate:undefined})),...Array.from({length:9},(_,i)=>personalTask('done-'+i,TODAY,{status:'done',completedAt:iso(TODAY)}))];
  const h=ui('app/(tabs)/index.tsx',flowState({tasks,personalTasks:personals})),tree=h.render();
  assert.equal(find(tree,'count-upcoming').props.accessibilityLabel,'Upcoming: 8');assert.equal(find(tree,'count-completed').props.accessibilityLabel,'Completed Today: 9');
  for(const bucket of ['upcoming','unscheduled','completed']) {const section=find(tree,'dashboard-'+bucket);assert.equal(walk(section,n=>n.type==='TaskRow'||n.type==='PersonalTaskRow').length,5);find(tree,'view-all-'+bucket).props.onPress();}
  assert.deepEqual(h.navigation,['/tasks','/tasks','/tasks']);
});
test('Home omits empty sections, retains Quick Add in an empty account and avoids starter data while loading',()=>{
  const state=flowState({projects:[]}),h=ui('app/(tabs)/index.tsx',state);let tree=h.render();assert.match(text(tree),/No tasks due today/);assert.equal(walk(tree,n=>n.type==='QuickAdd').length,1);
  for(const key of ['overdue','upcoming','unscheduled','completed'])assert.equal(find(tree,'dashboard-'+key),undefined);
  state.hydrated=false;tree=h.render();assert.match(text(tree),/Loading your day/);assert.equal(find(tree,'count-today'),undefined);
});
test('Home consumes visibility settings, hides completed summary and explains both-hidden state',()=>{
  const preferences=pref(),state=flowState({tasks:[ptask('project')],personalTasks:[personalTask('personal'),personalTask('done',TODAY,{status:'done',completedAt:iso(TODAY)})]}),h=ui('app/(tabs)/index.tsx',state,preferences);
  assert.equal(find(h.render(),'count-today').props.accessibilityLabel,'Today: 2');preferences.showPersonal=false;assert.equal(find(h.render(),'count-today').props.accessibilityLabel,'Today: 1');
  preferences.showCompleted=false;assert.equal(find(h.render(),'count-completed'),undefined);assert.equal(find(h.render(),'dashboard-completed'),undefined);
  preferences.showProjects=false;assert.match(text(h.render()),/Tasks are hidden in Settings/);assert.equal(find(h.render(),'count-today').props.accessibilityLabel,'Today: 0');
});
test('Home date follows every preference without changing source dates',()=>{
  const state=flowState({tasks:[ptask('work')]}),preferences=pref(),h=ui('app/(tabs)/index.tsx',state,preferences),before=JSON.stringify(state);
  for(const [format,expected] of [['DD/MM/YYYY','21/09/2026'],['DD MMM YYYY','21 Sep 2026'],['YYYY-MM-DD','2026-09-21']]){preferences.dateFormat=format;assert.equal(text(find(h.render(),'dashboard-date')),expected);}
  assert.equal(JSON.stringify(state),before);
});
test('Home uses centralized Light, Dark and System colors',()=>{
  const preferences=pref(),h=ui('app/(tabs)/index.tsx',flowState({tasks:[ptask('overdue','2020-01-01')]}),preferences);
  preferences.theme='Dark';assert.equal(h.render().props.style.backgroundColor,palettes.dark.background);
  preferences.theme='Light';h.setSystem('dark');assert.equal(h.render().props.style.backgroundColor,palettes.light.background);
  preferences.theme='System';assert.equal(h.render().props.style.backgroundColor,palettes.dark.background);
  const card=find(h.render(),'count-overdue');assert.equal(card.props.style[1].backgroundColor,palettes.dark.accent);
});
test('Home updates immediately for add/edit/delete/reschedule and never creates dashboard copies',()=>{
  const state=flowState(),h=ui('app/(tabs)/index.tsx',state);assert.equal(find(h.render(),'count-today').props.accessibilityLabel,'Today: 0');
  const task=personalTask('a');state.personalTasks=[task];let tree=h.render();assert.equal(find(tree,'count-today').props.accessibilityLabel,'Today: 1');assert.equal(walk(tree,n=>n.type==='PersonalTaskRow')[0].props.task,task);
  state.personalTasks=[{...task,title:'Edited',dueDate:'2026-09-22'}];tree=h.render();assert.equal(find(tree,'count-today').props.accessibilityLabel,'Today: 0');assert.equal(find(tree,'count-upcoming').props.accessibilityLabel,'Upcoming: 1');
  state.personalTasks=[];assert.equal(find(h.render(),'count-upcoming').props.accessibilityLabel,'Upcoming: 0');
});
test('dashboard project links open correct existing project context; row labels distinguish sources',()=>{
  const h=ui('app/(tabs)/index.tsx',flowState({tasks:[ptask('work')],personalTasks:[personalTask('personal')]})),tree=h.render();
  assert.match(text(tree),/KFIL BARAMATI/);find(tree,'open-project-p-work').props.onPress();assert.deepEqual(plain(h.navigation),[{pathname:'/project/[id]',params:{id:'p'}}]);
  const personalUI=ui('components/PersonalTaskRow.tsx',flowState());const personalTree=personalUI.render({task:personalTask('a')});assert.match(text(personalTree),/Personal/);
  find(personalTree,'edit-personal-a').props.onPress();assert.deepEqual(plain(personalUI.navigation),[{pathname:'/personal-task',params:{id:'a'}}]);
});
for(const [id,route] of [['quick-personal','/personal-task'],['quick-new-project','/new-project']])test('Quick Add '+id+' reuses existing route',()=>{
  const h=ui('components/QuickAdd.tsx',flowState());let tree=h.render();assert.equal(find(tree,'quick-add').props.accessibilityLabel,'Quick Add');find(tree,'quick-add').props.onPress();tree=h.render();find(tree,id).props.onPress();assert.deepEqual(h.navigation,[route]);assert.equal(walk(h.render(),n=>n.type==='Modal')[0].props.visible,false);
});
test('Quick Add project picker passes the chosen project to existing manual-task form',()=>{
  const h=ui('components/QuickAdd.tsx',flowState({projects:[project,{...project,id:'other',name:'Other'}]}));find(h.render(),'quick-add').props.onPress();find(h.render(),'quick-project-task').props.onPress();find(h.render(),'quick-project-other').props.onPress();assert.deepEqual(plain(h.navigation),[{pathname:'/new-task',params:{projectId:'other'}}]);
});
test('Quick Add no-project state offers New Project, and cancel leaves data/navigation unchanged',()=>{
  const state=flowState({projects:[]}),before=JSON.stringify(state),h=ui('components/QuickAdd.tsx',state);find(h.render(),'quick-add').props.onPress();find(h.render(),'quick-project-task').props.onPress();assert.match(text(h.render()),/Create a project before/);
  find(h.render(),'quick-close').props.onPress();assert.equal(h.navigation.length,0);assert.equal(JSON.stringify(state),before);
  find(h.render(),'quick-add').props.onPress();find(h.render(),'quick-project-task').props.onPress();find(h.render(),'quick-create-first-project').props.onPress();assert.deepEqual(h.navigation,['/new-project']);
});
function timedHost(data={projects:[project],tasks:[],templates:[],personalTasks:[]}, extra={}) {
  let now=iso(TODAY,10); const RealDate=Date;
  class ClockDate extends RealDate { constructor(...args){super(...(args.length?args:[now]));}static now(){return new RealDate(now).getTime();} }
  const storage={value:JSON.stringify(data)};
  const render=host(storage,{globals:{Date:ClockDate,...extra.globals},mocks:{
    '@react-native-async-storage/async-storage': { getItem: async () => storage.value, setItem: async (key, value) => { assert.equal(key, 'flowpilot-state-v1'); storage.value = value; storage.writes = (storage.writes ?? 0) + 1; } },
    '@/lib/task-utils':{...dates,localDateValue:date=>dates.localDateValue(date??new Date(now))},
    '@/lib/personal-tasks':{...personal,completePersonal:(tasks,id)=>personal.completePersonal(tasks,id,new Date(now))},...extra.mocks,
  }});
  return {storage,render,advance:value=>{now=value;}};
}
test('personal complete/reopen/re-complete records actual timestamps and immediately changes Home',async()=>{
  const h=timedHost({projects:[],tasks:[],templates:[],personalTasks:[personalTask('a')]}),snapshots=[];let flow=await h.render();
  const home=ui('app/(tabs)/index.tsx',()=>flow),row=ui('components/PersonalTaskRow.tsx',()=>flow);
  find(row.render({task:flow.personalTasks[0]}),'personal-complete-a').props.onPress();flow=await h.render();snapshots.push(flow.personalTasks[0].completedAt);
  assert.equal(snapshots[0],iso(TODAY,10));assert.equal(find(home.render(),'count-today').props.accessibilityLabel,'Today: 0');assert.equal(find(home.render(),'count-completed').props.accessibilityLabel,'Completed Today: 1');
  find(row.render({task:flow.personalTasks[0]}),'personal-complete-a').props.onPress();flow=await h.render();assert.equal(flow.personalTasks[0].completedAt,undefined);assert.equal(find(home.render(),'count-today').props.accessibilityLabel,'Today: 1');
  h.advance(iso(TODAY,15));find(row.render({task:flow.personalTasks[0]}),'personal-complete-a').props.onPress();flow=await h.render();assert.equal(flow.personalTasks[0].completedAt,iso(TODAY,15));assert.notEqual(flow.personalTasks[0].completedAt,snapshots[0]);
  assert.equal((await host(h.storage)()).personalTasks[0].completedAt,iso(TODAY,15));
});
for(const manual of [false,true])test((manual?'manual':'workflow')+' dashboard row uses scoped central completion, clear and new timestamps',async()=>{
  const task=ptask('shared',TODAY,{isManual:manual}),other=ptask('shared',TODAY,{projectId:'other',isManual:manual});
  const h=timedHost({projects:[project,{...project,id:'other'}],tasks:[task,other],templates:[],personalTasks:[]});let flow=await h.render();const beforeOther=JSON.stringify(flow.tasks[1]),row=ui('components/TaskRow.tsx',()=>flow),home=ui('app/(tabs)/index.tsx',()=>flow);
  find(row.render({task:flow.tasks[0],compact:true}),'task-shared').props.onPress();flow=await h.render();assert.equal(flow.tasks[0].completedAt,iso(TODAY,10));assert.equal(flow.tasks[0].status,'done');assert.equal(JSON.stringify(flow.tasks[1]),beforeOther);assert.equal(find(home.render(),'count-completed').props.accessibilityLabel,'Completed Today: 1');
  find(row.render({task:flow.tasks[0],compact:true}),'task-shared').props.onPress();flow=await h.render();assert.equal(flow.tasks[0].completedAt,undefined);assert.equal(flow.tasks[0].status,'todo');
  h.advance(iso(TODAY,16));find(row.render({task:flow.tasks[0]}),'task-shared').props.onPress();flow=await h.render();assert.equal(flow.tasks[0].completedAt,iso(TODAY,16));
  if(manual)assert.equal(flow.projects[0].dueDate,project.dueDate);
});
for(const frequency of ['Daily','Weekly','Monthly'])test(frequency+' recurring dashboard completion creates exactly one next occurrence and retains Completed Today',async()=>{
  const h=timedHost({projects:[],tasks:[],templates:[],personalTasks:[personalTask('repeat',TODAY,{recurrence:{frequency}})]});let flow=await h.render();
  flow.completePersonalTask('repeat');flow.completePersonalTask('repeat');flow=await h.render();assert.equal(flow.personalTasks.length,2);
  let grouped=groups([],flow.personalTasks);assert.equal(grouped.completed.length,1);assert.equal(grouped.upcoming.length,1);assert.equal(grouped.today.length,0);
  flow.reopenPersonalTask('repeat');flow=await h.render();flow.completePersonalTask('repeat');flow=await h.render();assert.equal(flow.personalTasks.length,2);
  grouped=groups([],flow.personalTasks);assert.equal(grouped.completed.length,1);assert.equal(grouped.upcoming.length,1);
});
test('legacy AsyncStorage hydration preserves completed records without adding timestamps or moving dates',async()=>{
  const legacy=ptask('legacy',TODAY,{status:'done'}),manual=ptask('old-manual',TODAY,{status:'done',isManual:true}),general=personalTask('legacy-personal',TODAY,{status:'done'});
  const original={projects:[project],tasks:[legacy,manual],templates:[],personalTasks:[general]},h=timedHost(original);let flow=await h.render();
  assert.deepEqual(plain({projects:flow.projects,tasks:flow.tasks,templates:flow.templates,personalTasks:flow.personalTasks}),plain(original));assert.equal(groups(flow.tasks,flow.personalTasks).completed.length,0);
  flow=await host(h.storage)();assert.deepEqual(plain(flow.tasks),original.tasks);assert.equal(flow.personalTasks[0].completedAt,undefined);
});
test('completing another workflow step never invents timestamps for prior legacy completions',async()=>{
  const legacy=ptask('legacy','2026-09-20',{status:'done',order:0}),next=ptask('next',TODAY,{order:1});const h=timedHost({projects:[project],tasks:[legacy,next],templates:[],personalTasks:[]});let flow=await h.render();flow.toggleTask('next','p');flow=await h.render();
  assert.equal(flow.tasks[0].completedAt,undefined);assert.equal(flow.tasks[0].dueDate,legacy.dueDate);assert.deepEqual(ids(groups(flow.tasks).completed),['next']);
});
test('legacy completed rows say Completed without displaying a guessed date',()=>{
  const task=ptask('old',TODAY,{status:'done'}),p=ui('components/TaskRow.tsx',flowState()),personalUI=ui('components/PersonalTaskRow.tsx',flowState());
  assert.match(text(p.render({task})),/Completed/);assert.doesNotMatch(text(p.render({task})),/21\/09\/2026/);
  assert.doesNotMatch(text(personalUI.render({task:personalTask('old',TODAY,{status:'done'})})),/21\/09\/2026/);
});
test('midnight and app resume update dashboard buckets/date without writes or historical mutations',async()=>{
  let timer,scheduledDelay;const listeners=new Set();
  const h = timedHost({ projects: [project], tasks: [ptask('work', TODAY)], templates: [], personalTasks: [] }, {
    globals: { setTimeout: (callback, delay) => { timer = callback; scheduledDelay = delay; return 1; } },
    mocks: { 'react-native': { AppState: { addEventListener: (_event, fn) => {
      listeners.add(fn); return { remove() { listeners.delete(fn); } };
    } } } },
  });
  let flow=await h.render();const before=h.storage.value, writes=h.storage.writes,home=ui('app/(tabs)/index.tsx',()=>flow);assert.equal(find(home.render(),'count-today').props.accessibilityLabel,'Today: 1');assert.ok(scheduledDelay>0&&scheduledDelay<=26*3600000);
  h.advance(iso('2026-09-22',0));timer();flow=await h.render();assert.equal(find(home.render(),'count-overdue').props.accessibilityLabel,'Overdue: 1');assert.equal(text(find(home.render(),'dashboard-date')),'22/09/2026');
  h.advance(iso('2026-09-25',12));listeners.forEach(fn=>fn('active'));flow=await h.render();assert.equal(text(find(home.render(),'dashboard-date')),'25/09/2026');assert.equal(h.storage.value,before);
  for(let i=0;i<5;i++)home.render();assert.equal(h.storage.writes,writes);assert.equal(h.storage.value,before);assert.deepEqual(Object.keys(JSON.parse(h.storage.value)).sort(),['personalTasks','projects','tasks','templates']);
});
test('personal dashboard completion/reopen synchronizes existing reminders and To-do data',async()=>{
  const snapshots=[];const h=timedHost({projects:[],tasks:[],templates:[],personalTasks:[personalTask('reminder',TODAY,{dueTime:'20:00',reminder:'At due time'})]}, {mocks:{'@/lib/personal-notifications':{syncPersonalReminders:async(tasks,enabled)=>{snapshots.push({tasks:plain(tasks),enabled});},askPersonalReminderPermission:async()=>undefined}}});
  let flow=await h.render();const row=ui('components/PersonalTaskRow.tsx',()=>flow);find(row.render({task:flow.personalTasks[0]}),'personal-complete-reminder').props.onPress();flow=await h.render();assert.equal(snapshots.at(-1).tasks[0].status,'done');assert.equal(snapshots.at(-1).enabled,true);
  assert.equal(personal.todoEntries(flow.tasks,flow.personalTasks,'Personal')[0].task.status,'done');find(row.render({task:flow.personalTasks[0]}),'personal-complete-reminder').props.onPress();flow=await h.render();assert.equal(snapshots.at(-1).tasks[0].status,'todo');
});
test('due times never change buckets across local midnight and DST transitions in five timezones',()=>{
  for(const zone of ['Asia/Kolkata','America/New_York','Europe/Berlin','Pacific/Auckland','UTC']) {
    const script=`
      const assert=require('node:assert/strict');const {loadSource}=require(${JSON.stringify(require.resolve('./flow-test-host.cjs'))});
      const {dashboardGroups,dashboardBucket}=loadSource('lib/dashboard.ts');const {localDateValue,addCalendarDays}=loadSource('lib/task-utils.ts');
      for(const [y,m,d] of [[2026,8,21],[2026,2,8],[2026,10,1],[2026,2,29],[2026,9,25],[2026,3,5],[2026,8,27]]) {
        const day=new Date(y,m,d,23,59),label=localDateValue(day);const entry={kind:'personal',task:{id:'p',status:'todo',dueDate:label,dueTime:'08:00'}};
        assert.equal(dashboardBucket(entry,day),'today');assert.equal(dashboardBucket(entry,new Date(y,m,d,0,1)),'today');
        entry.task.dueTime='23:59';assert.equal(dashboardBucket(entry,new Date(y,m,d,0,1)),'today');
        assert.equal(dashboardBucket(entry,new Date(y,m,d+1,0,1)),'overdue');
        const project={id:'x',projectId:'p',status:'todo',dueDate:new Date(y,m,d,0,1).toISOString()};
        const grouped=dashboardGroups([project],[entry.task],label);assert.equal(grouped.today.length,2);
        project.status='done';project.completedAt=new Date(y,m,d,23,58).toISOString();assert.equal(dashboardGroups([project],[],label).completed.length,1);
        project.completedAt=new Date(y,m,d-1,23,59).toISOString();assert.equal(dashboardGroups([project],[],label).completed.length,0);
        project.status='todo';project.dueDate=addCalendarDays(day,1).toISOString();assert.equal(dashboardGroups([project],[],label).upcoming.length,1);
      }
      const boundary=new Date('2026-09-21T00:30:00.000Z');const task={id:'utc-boundary',projectId:'p',status:'todo',dueDate:boundary.toISOString()};
      assert.equal(dashboardGroups([task],[],localDateValue(boundary)).today.length,1);
    `;
    const result=spawnSync(process.execPath,['-e',script],{env:{...process.env,TZ:zone},encoding:'utf8'});assert.equal(result.status,0,zone+'\n'+result.stderr);
  }
});
test('manual dashboard completion uses project reminder reconciliation without changing deadline or template',async()=>{
  const snapshots=[];const template={id:'flow',name:'CII SELF',category:'Custom',description:'',color:'#F26B5E',steps:[]};
  const h=timedHost({projects:[{...project,remindersEnabled:true}],tasks:[ptask('manual',TODAY,{isManual:true})],templates:[template],personalTasks:[]},{mocks:{'@/lib/notifications':{
    syncProjectReminders:async()=>{},scheduleProjectReminders:async(project,tasks)=>{snapshots.push(plain({project,tasks}));return true;},
  }}});
  let flow=await h.render();const row=ui('components/TaskRow.tsx',()=>flow);find(row.render({task:flow.tasks[0]}),'task-manual').props.onPress();flow=await h.render();
  assert.equal(snapshots.at(-1).tasks[0].status,'done');assert.equal(snapshots.at(-1).project.id,'p');assert.equal(flow.projects[0].dueDate,project.dueDate);assert.deepEqual(plain(flow.templates),[template]);
});
