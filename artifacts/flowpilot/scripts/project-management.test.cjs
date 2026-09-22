const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {host,plain,loadSource}=require('./flow-test-host.cjs');
const pm=loadSource('lib/project-management.ts'), dates=loadSource('lib/task-utils.ts');
const personal=loadSource('lib/personal-tasks.ts'), settingsModel=loadSource('lib/settings.ts');
const palettes=loadSource('constants/colors.ts').default;
const today=dates.localDateValue(), stamp=dates.readDate(today).toISOString();
const project={id:'p',name:'KFIL Baramati',client:'Client',summary:'Existing summary',templateId:'flow',startDate:'2021-04-03T13:45:00.000Z',projectStartDate:'2021-04-03',dueDate:'2040-12-31T10:00:00.000Z',reminderFrequency:'Daily',remindersEnabled:false};
const task=(id,status='todo',more={})=>({id,projectId:'p',title:id,description:'Stored description',duration:2,status,dueDate:stamp,order:0,...more});
const template={id:'flow',name:'CII SELF',category:'Custom',description:'Snapshot',color:'#F26B5E',steps:[{id:'step',title:'Step',description:'',duration:2}]};
const personalTask={...plain(personal.PERSONAL_DEFAULTS),id:'personal',title:'Personal',status:'todo',createdAt:stamp,seriesId:'personal',occurrence:0,dueDate:today};
const state=(patch={})=>({projects:[{...project}],tasks:[task('one','done',{completedAt:'2021-04-04T10:00:00.000Z'}),task('manual','todo',{isManual:true,order:1})],templates:[plain(template)],personalTasks:[plain(personalTask)],...patch});
const prefs=patch=>({...plain(settingsModel.DEFAULT_SETTINGS),...patch});
function setup(data=state(),options={}) {const storage={value:JSON.stringify(data)};return{storage,render:host(storage,options)};}
const ids=items=>plain(items.map(item=>item.id));

for(const [label,tasks,expected] of [['zero',[],0],['partial',[task('a','done'),task('b'),task('manual','todo',{isManual:true})],33],['complete',[task('a','done'),task('manual','done',{isManual:true})],100]])test(label+' task progress is derived and clamped',()=>{
  const progress=pm.projectProgress('p',tasks);assert.equal(progress.percent,expected);assert.equal(progress.total,tasks.length);assert.ok(progress.percent>=0&&progress.percent<=100);
});
test('manual tasks count toward progress; personal and other-project tasks do not',()=>{
  assert.deepEqual(plain(pm.projectProgress('p',[task('a','done'),task('manual','todo',{isManual:true}),task('other','done',{projectId:'other'}),personalTask])),{total:2,completed:1,incomplete:1,percent:50});
});
for(const [tasks,expected] of [[[],'Active'],[[task('a')],'Active'],[[task('a','done')],'Completed']])test('legacy status defaults to '+expected+' with '+tasks.length+' tasks/'+(tasks[0]?.status??'empty'),()=>{
  const before=JSON.stringify(project);assert.equal(pm.projectStatus(project,tasks),expected);assert.equal(pm.isArchived(project),false);assert.equal(JSON.stringify(project),before);
});
test('unknown status values safely derive fallback without rewriting input',()=>{assert.equal(pm.projectStatus({...project,status:'old-value'},[]),'Active');});
for(const status of pm.PROJECT_STATUSES)test('manual '+status+' survives reload without changing dates, tasks, templates or personal work',async()=>{
  const h=setup(),before=JSON.parse(h.storage.value);let flow=await h.render();assert.equal(flow.setProjectStatus('p',status,true),true);flow=await h.render();flow=await host(h.storage)();assert.equal(flow.projects[0].status,status);
  assert.deepEqual(plain(flow.tasks),before.tasks);assert.deepEqual(plain(flow.personalTasks),before.personalTasks);assert.deepEqual(plain(flow.templates),before.templates);
  const {status:ignored,completionSource,...rest}=plain(flow.projects[0]);assert.equal(completionSource,status==='Completed'?'manual':undefined);assert.deepEqual(rest,before.projects[0]);
});
test('incomplete manual Completed requires confirmation and keeps real progress',async()=>{
  const h=setup();let flow=await h.render();assert.equal(flow.setProjectStatus('p','Completed'),false);flow=await h.render();assert.equal(pm.projectStatus(flow.projects[0],flow.tasks),'Active');
  assert.equal(flow.setProjectStatus('p','Completed',true),true);flow=await h.render();assert.equal(flow.projects[0].status,'Completed');assert.equal(pm.projectProgress('p',flow.tasks).percent,50);
  flow=await h.render();flow=await host(h.storage)();assert.equal(flow.projects[0].status,'Completed');assert.equal(pm.normalProjectTasks(flow.tasks,flow.projects).length,2);
});
test('manual Completed persists through another partial completion; no reactive loop',async()=>{
  const h=setup(state({tasks:[task('a','todo',{isManual:true}),task('b','todo',{isManual:true}),task('c','todo',{isManual:true})]}));let flow=await h.render();flow.setProjectStatus('p','Completed',true);flow=await h.render();flow.toggleTask('a','p');flow=await h.render();assert.equal(flow.projects[0].status,'Completed');assert.equal(pm.projectProgress('p',flow.tasks).percent,33);
});
for(const manual of [false,true])test((manual?'manual':'workflow')+' final completion sets Completed and reopening sets Active immediately',async()=>{
  const h=setup(state({tasks:[task('last','todo',{isManual:manual})]}));let flow=await h.render();flow.toggleTask('last','p');flow=await h.render();assert.equal(flow.projects[0].status,'Completed');assert.equal(pm.projectProgress('p',flow.tasks).percent,100);
  flow.toggleTask('last','p');flow=await h.render();assert.equal(flow.projects[0].status,'Active');assert.equal(pm.projectProgress('p',flow.tasks).percent,0);assert.equal(flow.tasks[0].completedAt,undefined);
});
for(const status of ['On Hold','Not Started'])test(status+' survives partial completion/reopen/add; final completion can finish project',async()=>{
  const h=setup(state({projects:[{...project,status}],tasks:[task('a','todo',{isManual:true}),task('b','todo',{isManual:true})]}));let flow=await h.render();flow.toggleTask('a','p');flow=await h.render();assert.equal(flow.projects[0].status,status);flow.toggleTask('a','p');flow=await h.render();assert.equal(flow.projects[0].status,status);
  flow.toggleTask('a','p');flow.toggleTask('b','p');flow=await h.render();assert.equal(flow.projects[0].status,'Completed');
});
test('adding new manual work activates Completed project and lowers derived progress',async()=>{
  const h=setup(state({projects:[{...project,status:'Completed'}],tasks:[task('done','done')]}));let flow=await h.render();assert.equal(flow.addManualTask('p',{title:'New work',dueDate:today}),true);flow=await h.render();assert.equal(flow.projects[0].status,'Active');assert.equal(pm.projectProgress('p',flow.tasks).percent,50);
});
for(const start of ['2020-01-01','2090-01-01'])test('new project starts Active even with '+start+' start; no calendar-driven override',async()=>{
  const h=setup();let flow=await h.render();assert.equal(await flow.addProject({name:'New',client:'Client',summary:'',templateId:'flow',projectStartDate:start,dueDate:'2091-01-01T00:00:00.000Z',reminderFrequency:'Daily'}),true);flow=await h.render();assert.equal(flow.projects[0].status,'Active');
});
test('archive requires confirmation and preserves complete project history and status',async()=>{
  const h=setup(state({projects:[{...project,status:'On Hold'}]})),before=JSON.parse(h.storage.value);let flow=await h.render();assert.equal(flow.setProjectArchived('p',true),false);assert.equal(flow.setProjectArchived('p',true,true),true);flow=await h.render();flow=await host(h.storage)();
  assert.equal(flow.projects[0].archived,true);assert.equal(flow.projects[0].status,'On Hold');assert.deepEqual(plain(flow.tasks),before.tasks);assert.deepEqual(plain(flow.personalTasks),before.personalTasks);assert.deepEqual(plain(flow.templates),before.templates);
  const {archived,...rest}=plain(flow.projects[0]);assert.deepEqual(rest,before.projects[0]);
});
test('unarchive preserves status and restores project/task visibility',async()=>{
  const h=setup();let flow=await h.render();flow.setProjectArchived('p',true,true);flow=await h.render();assert.equal(pm.visibleProjects(flow.projects,flow.tasks,'Active').length,0);assert.equal(pm.visibleProjects(flow.projects,flow.tasks,'Archived').length,1);assert.equal(pm.normalProjectTasks(flow.tasks,flow.projects).length,0);
  flow.setProjectArchived('p',false);flow=await h.render();assert.equal(flow.projects[0].status,'Active');assert.equal(pm.visibleProjects(flow.projects,flow.tasks,'Active').length,1);assert.equal(pm.normalProjectTasks(flow.tasks,flow.projects).length,2);
});
test('archived project status is frozen during completion/reopening and manual additions are rejected',async()=>{
  const h=setup();let flow=await h.render();flow.setProjectArchived('p',true,true);assert.equal(flow.addManualTask('p',{title:'Blocked',dueDate:today}),false);flow=await h.render();flow.toggleTask('manual','p');flow=await h.render();assert.equal(flow.projects[0].status,'Active');assert.equal(pm.projectProgress('p',flow.tasks).percent,100);
  flow.toggleTask('manual','p');flow=await h.render();assert.equal(flow.projects[0].status,'Active');assert.equal(flow.tasks.length,2);
});
test('archive and status actions in one render batch retain latest metadata',async()=>{
  const h=setup();let flow=await h.render();flow.setProjectStatus('p','On Hold');flow.setProjectArchived('p',true,true);flow=await h.render();assert.equal(flow.projects[0].status,'On Hold');assert.equal(flow.projects[0].archived,true);
});
test('all metadata and derived fields remain separate; legacy hydration does not migrate historical data',async()=>{
  const initial=state(),h=setup(initial);let flow=await h.render();assert.deepEqual(plain(flow.projects),initial.projects);assert.deepEqual(plain(flow.tasks),initial.tasks);flow.setProjectStatus('p','On Hold');flow=await h.render();
  const record=JSON.parse(h.storage.value).projects[0];assert.deepEqual(Object.keys(record).sort(),[...Object.keys(initial.projects[0]),'status'].sort());for(const key of ['progress','percent','health','completed','total'])assert.equal(key in record,false);
});
test('invalid status or missing project operations leave storage unchanged',async()=>{
  const h=setup();let flow=await h.render();const before=h.storage.value;assert.equal(flow.setProjectStatus('p','Invalid'),false);assert.equal(flow.setProjectArchived('missing',true,true),false);flow=await h.render();assert.equal(h.storage.value,before);
});
for(const show of [true,false])test('Legacy completed preference '+show+' does not merge separate project categories',()=>{
  const projects=[{...project,status:'Completed'},{...project,id:'active',status:'Active'},{...project,id:'archived',status:'Completed',archived:true}];const before=JSON.stringify(projects);
  assert.deepEqual(ids(pm.visibleProjects(projects,[],'Active')),['active']);assert.deepEqual(ids(pm.visibleProjects(projects,[],'Completed')),['p']);assert.deepEqual(ids(pm.visibleProjects(projects,[],'Archived')),['archived']);assert.equal(JSON.stringify(projects),before);
});
for(const [label,change,tasks,expected] of [
  ['future deadline',{},[],'On Track'],['overdue task',{},[task('late','todo',{dueDate:'2020-01-01',isManual:true})],'Attention Needed'],
  ['passed deadline',{dueDate:'2020-01-01'},[],'Attention Needed'],['deadline today',{dueDate:'2026-09-21'},[],'On Track'],
  ['completed overdue task',{},[task('old','done',{dueDate:'2020-01-01'})],'On Track'],
  ['other project overdue',{},[task('other','todo',{projectId:'other',dueDate:'2020-01-01'})],'On Track'],
  ['Completed status',{status:'Completed',dueDate:'2020-01-01'},[task('late')],'Completed'],
  ['On Hold status',{status:'On Hold',dueDate:'2020-01-01'},[task('late')],'On Hold'],
  ['Not Started status',{status:'Not Started',dueDate:'2020-01-01'},[task('late')],'Not Started'],
])test('health rule: '+label,()=>{assert.equal(pm.projectHealth({...project,status:'Active',...change},tasks,'2026-09-21'),expected);});
test('health and progress reflect deleted tasks without stored aggregates',()=>{const tasks=[task('a','done'),task('b')];assert.equal(pm.projectProgress('p',tasks).percent,50);assert.equal(pm.projectProgress('p',tasks.slice(0,1)).percent,100);});
function walk(node,predicate){if(Array.isArray(node))return node.flatMap(n=>walk(n,predicate));if(!node||typeof node!=='object')return[];return[...(predicate(node)?[node]:[]),...walk(node.props?.children,predicate)];}
const find=(tree,id)=>walk(tree,n=>n.props?.testID===id)[0];
function text(node){if(Array.isArray(node))return node.map(text).join(' ');if(node&&typeof node==='object')return text(node.props?.children);return String(node??'');}
const native={Platform:{OS:'android'},StyleSheet:{create:v=>v,hairlineWidth:1},View:'View',Pressable:'Pressable',ScrollView:'ScrollView',Modal:'Modal',TextInput:'TextInput',KeyboardAvoidingView:'View'};
function ui(file,flow,preferences=prefs(),params={id:'p',projectId:'p'}){
 const states=[];let cursor=0,system='light';const navigation=[];const getFlow=typeof flow==='function'?flow:()=>flow;
 const api=loadSource(file,{
  react:{useMemo:fn=>fn(),useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];}},
  'react-native':native,'@expo/vector-icons':{Feather:'Feather'},'expo-haptics':{selectionAsync(){}},'expo-router':{router:{push:path=>navigation.push(path),replace:path=>navigation.push(path),back(){}},useLocalSearchParams:()=>params},
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},'@/components/AppText':{AppText:'AppText'},'@/components/TaskRow':{TaskRow:'TaskRow'},'@/components/PersonalTaskRow':{PersonalTaskRow:'PersonalTaskRow'},'@/components/QuickAdd':{QuickAdd:'QuickAdd'},
  '@/context/FlowContext':{useFlow:getFlow,daysRemaining:date=>dates.calendarDaysUntil(date)},'@/context/SettingsContext':{useSettings:()=>({settings:preferences}),useDateFormatter:()=>date=>settingsModel.formatDate(date,preferences.dateFormat)},'@/hooks/useColors':{useColors:()=>palettes[settingsModel.resolveTheme(preferences.theme,system)]},
 });
 return{navigation,setSystem:theme=>{system=theme;},render(props){cursor=0;return(api.default??api.ProjectManagement??api.ProjectProgress??api.QuickAdd??api.TaskRow)(props);}};
}
test('status dialog confirms unfinished completion; cancellation never changes tasks/status',async()=>{
 const h=setup();let flow=await h.render();const view=ui('components/ProjectManagement.tsx',()=>flow),render=()=>view.render({project:flow.projects[0],tasks:flow.tasks});
 find(render(),'change-project-status').props.onPress();find(render(),'status-Completed').props.onPress();assert.match(text(render()),/1 incomplete tasks/);assert.equal(flow.projects[0].status,undefined);
 find(render(),'cancel-project-management').props.onPress();flow=await h.render();assert.equal(flow.projects[0].status,undefined);
 find(render(),'change-project-status').props.onPress();find(render(),'status-Completed').props.onPress();find(render(),'confirm-project-completed').props.onPress();flow=await h.render();assert.equal(flow.projects[0].status,'Completed');assert.equal(pm.projectProgress('p',flow.tasks).percent,50);
});
test('archive dialog requires confirmation, can cancel, and Unarchive restores previous status',async()=>{
 const h=setup(state({projects:[{...project,status:'On Hold'}]}));let flow=await h.render();const view=ui('components/ProjectManagement.tsx',()=>flow),render=()=>view.render({project:flow.projects[0],tasks:flow.tasks});
 find(render(),'archive-project').props.onPress();assert.match(text(render()),/All data is kept/);assert.equal(flow.projects[0].archived,undefined);find(render(),'cancel-project-management').props.onPress();flow=await h.render();assert.equal(flow.projects[0].archived,undefined);
 find(render(),'archive-project').props.onPress();find(render(),'confirm-project-archive').props.onPress();flow=await h.render();assert.equal(flow.projects[0].archived,true);assert.equal(find(render(),'archive-project').props.accessibilityLabel,'Unarchive Project');find(render(),'archive-project').props.onPress();flow=await h.render();assert.equal(flow.projects[0].archived,false);assert.equal(flow.projects[0].status,'On Hold');
});
test('Projects screen separates Active/Completed/Archived, ignores legacy visibility and keeps creation available',()=>{
 const data={...state({projects:[{...project,status:'Completed'},{...project,id:'archived',archived:true,status:'Completed'}]}),calendarDate:today};const preferences=prefs({showCompletedProjects:false}),view=ui('app/(tabs)/projects.tsx',data,preferences);
 let tree=view.render();assert.equal(find(tree,'project-card-p'),undefined);assert.match(text(find(tree,'projects-empty')),/No active projects/);assert.ok(walk(tree,n=>n.props?.accessibilityLabel==='New Project')[0]);
 preferences.showCompletedProjects=true;tree=view.render();assert.equal(find(tree,'project-card-p'),undefined);find(tree,'projects-completed').props.onPress();preferences.showCompletedProjects=false;tree=view.render();assert.ok(find(tree,'project-card-p'));assert.equal(find(tree,'project-card-archived'),undefined);
 find(tree,'projects-archived').props.onPress();preferences.showCompletedProjects=false;tree=view.render();assert.ok(find(tree,'project-card-archived'));assert.equal(find(tree,'project-card-p'),undefined);
 find(tree,'project-card-archived').props.onPress();assert.deepEqual(plain(view.navigation),[{pathname:'/project/[id]',params:{id:'archived'}}]);
});
test('empty archive view provides a useful empty state',()=>{const view=ui('app/(tabs)/projects.tsx',{...state({projects:[]}),calendarDate:today});find(view.render(),'projects-archived').props.onPress();assert.match(text(view.render()),/No archived projects/);});
test('Project Detail keeps archived tasks readable, preserves actions and removes Add Task',()=>{
 const data={...state({projects:[{...project,status:'On Hold',archived:true}]}),calendarDate:today};const tree=ui('app/project/[id].tsx',data).render();assert.match(text(tree),/Archived.*On Hold/);assert.equal(find(tree,'add-project-task'),undefined);assert.match(text(tree),/Unarchive this project before adding tasks/);assert.match(text(tree),/Project reminders are paused/);assert.equal(walk(tree,n=>n.type==='TaskRow').length,2);assert.equal(walk(tree,n=>n.type==='ProjectManagement').length,1);assert.equal(walk(tree,n=>n.type==='ProjectProgress').length,1);
});
test('manual-task deep link refuses archived projects without exposing an add form',()=>{
 const tree=ui('app/new-task.tsx',{...state({projects:[{...project,archived:true}]}),hydrated:true}).render();assert.match(text(tree),/Unarchive it before adding tasks/);assert.equal(find(tree,'save-manual-task'),undefined);
});
test('Quick Add project selection excludes archives while other creation routes remain',()=>{
 const view=ui('components/QuickAdd.tsx',{...state({projects:[project,{...project,id:'old',archived:true}]}),hydrated:true});find(view.render(),'quick-add').props.onPress();assert.ok(find(view.render(),'quick-personal'));assert.ok(find(view.render(),'quick-new-project'));find(view.render(),'quick-project-task').props.onPress();assert.ok(find(view.render(),'quick-project-p'));assert.equal(find(view.render(),'quick-project-old'),undefined);
});
test('only archived projects gives Quick Add no-project message and New Project action',()=>{const view=ui('components/QuickAdd.tsx',{...state({projects:[{...project,archived:true}]}),hydrated:true});find(view.render(),'quick-add').props.onPress();find(view.render(),'quick-project-task').props.onPress();assert.ok(find(view.render(),'quick-create-first-project'));});
test('archive/unarchive updates Home and every To-do filter, leaving personal tasks unchanged',async()=>{
 const h=setup();let flow=await h.render();const home=ui('app/(tabs)/index.tsx',()=>flow),todo=ui('app/(tabs)/tasks.tsx',()=>flow);assert.equal(find(home.render(),'count-today').props.accessibilityLabel,'Today: 2');
 const personals=JSON.stringify(flow.personalTasks);flow.setProjectArchived('p',true,true);flow=await h.render();assert.equal(find(home.render(),'count-today').props.accessibilityLabel,'Today: 1');assert.equal(walk(todo.render(),n=>n.type==='TaskRow').length,0);assert.equal(walk(todo.render(),n=>n.type==='PersonalTaskRow').length,1);
 find(todo.render(),'todo-filter-Projects').props.onPress();assert.equal(walk(todo.render(),n=>n.type==='TaskRow'||n.type==='PersonalTaskRow').length,0);
 flow.setProjectArchived('p',false);flow=await h.render();assert.equal(walk(todo.render(),n=>n.type==='TaskRow').length,1);assert.equal(find(home.render(),'count-today').props.accessibilityLabel,'Today: 2');assert.equal(JSON.stringify(flow.personalTasks),personals);
});
test('Completed but non-archived unfinished work stays on Home/To-do when completed projects are hidden',async()=>{
 const h=setup();let flow=await h.render();flow.setProjectStatus('p','Completed',true);flow=await h.render();const preferences=prefs({showCompletedProjects:false});const home=ui('app/(tabs)/index.tsx',()=>flow,preferences),todo=ui('app/(tabs)/tasks.tsx',()=>flow,preferences);assert.equal(find(home.render(),'count-today').props.accessibilityLabel,'Today: 2');assert.equal(walk(todo.render(),n=>n.type==='TaskRow').length,1);
});
for(const screen of ['app/(tabs)/index.tsx','app/(tabs)/tasks.tsx'])test(screen+' row completion updates project progress/status/health through centralized logic',async()=>{
 const h=setup(state({tasks:[task('last','todo',{isManual:true})]}));let flow=await h.render();const view=ui(screen,()=>flow),row=walk(view.render(),n=>n.type==='TaskRow')[0];const taskUI=ui('components/TaskRow.tsx',()=>flow);find(taskUI.render(row.props),'task-last').props.onPress();flow=await h.render();assert.equal(pm.projectProgress('p',flow.tasks).percent,100);assert.equal(flow.projects[0].status,'Completed');assert.equal(pm.projectHealth(flow.projects[0],flow.tasks,flow.calendarDate),'Completed');
});
for(const theme of ['Light','Dark','System'])test(theme+' project progress uses centralized tokens, accessible numeric and textual progress',()=>{
 const preferences=prefs({theme}),view=ui('components/ProjectProgress.tsx',state(),preferences);view.setSystem('dark');const tree=view.render({projectId:'p',tasks:state().tasks});const bar=walk(tree,n=>n.props?.accessibilityRole==='progressbar')[0];assert.equal(bar.props.accessibilityValue.now,50);assert.match(text(tree),/50\s*% complete.*1\s+of\s+2\s+tasks completed/);assert.equal(bar.props.style.backgroundColor,palettes[theme==='Light'?'light':'dark'].secondary);
});
test('Projects and Detail format dates through settings without mutating project dates',()=>{
 const data={...state(),calendarDate:today},before=JSON.stringify(data),preferences=prefs({dateFormat:'YYYY-MM-DD'});assert.match(text(ui('app/(tabs)/projects.tsx',data,preferences).render()),/2040-12-31/);assert.match(text(ui('app/project/[id].tsx',data,preferences).render()),/2040-12-31/);assert.equal(JSON.stringify(data),before);
});
test('status changes leave project reminder cadence and scheduling untouched',async()=>{
 let syncs=0,schedules=0;const h=setup(state({projects:[{...project,remindersEnabled:true}]}),{mocks:{'@/lib/notifications':{syncProjectReminders:async()=>{syncs++;},scheduleProjectReminders:async()=>{schedules++;return true;}}}});let flow=await h.render();const initial=syncs;flow.setProjectStatus('p','On Hold');flow=await h.render();assert.equal(syncs,initial);assert.equal(schedules,0);assert.equal(flow.projects[0].remindersEnabled,true);assert.equal(flow.projects[0].reminderFrequency,'Daily');assert.equal(flow.projects[0].dueDate,project.dueDate);
});
test('local-calendar health stays On Track until next day across timezones and DST',()=>{
 for(const zone of ['Asia/Kolkata','America/New_York','Europe/Berlin','Pacific/Auckland','UTC']){
  const script=`const assert=require('node:assert/strict');const {loadSource}=require(${JSON.stringify(require.resolve('./flow-test-host.cjs'))});const {projectHealth}=loadSource('lib/project-management.ts');const {localDateValue}=loadSource('lib/task-utils.ts');for(const [y,m,d] of [[2026,2,8],[2026,10,1],[2026,2,29],[2026,9,25],[2026,8,21]]){const due=new Date(y,m,d,0,1).toISOString();const project={id:'p',status:'Active',dueDate:due};assert.equal(projectHealth(project,[],localDateValue(new Date(y,m,d,23,59))),'On Track');assert.equal(projectHealth(project,[],localDateValue(new Date(y,m,d+1,0,1))),'Attention Needed');project.dueDate=new Date(y,m,d+10).toISOString();assert.equal(projectHealth(project,[{projectId:'p',status:'todo',dueDate:due}],localDateValue(new Date(y,m,d+1))),'Attention Needed');}`;
  const result=spawnSync(process.execPath,['-e',script],{env:{...process.env,TZ:zone},encoding:'utf8'});assert.equal(result.status,0,zone+'\n'+result.stderr);
 }
});
function notificationHost(){
 const scheduled=new Map(),saved={},calls=[];
 const api=loadSource('lib/notifications.ts',{'react-native':native,'@react-native-async-storage/async-storage':{getItem:async key=>saved[key]??null,setItem:async(key,value)=>{saved[key]=value;}},'expo-notifications':{
  setNotificationHandler(){},getPermissionsAsync:async()=>({granted:true}),requestPermissionsAsync:async()=>({granted:true}),SchedulableTriggerInputTypes:{DATE:'date'},
  cancelScheduledNotificationAsync:async id=>{scheduled.delete(id);},scheduleNotificationAsync:async item=>{const id='project-'+calls.length;calls.push(item);scheduled.set(id,item);return id;},
 }});return{...api,scheduled,calls};
}
test('archive cancels only project reminders; unarchive safely restores eligible notifications without duplicates',async()=>{
 const h=notificationHost(),enabled={...project,remindersEnabled:true},tasks=[task('open')];
 await h.syncProjectReminders([enabled],tasks,true);const count=h.scheduled.size;assert.ok(count>0);h.scheduled.set('gulabani-personal-keep',{personal:true});
 await h.syncProjectReminders([{...enabled,archived:true}],tasks,true);assert.deepEqual([...h.scheduled.keys()],['gulabani-personal-keep']);
 await h.scheduleProjectReminders({...enabled,archived:true},tasks);assert.equal(h.scheduled.size,1);
 await h.syncProjectReminders([enabled],tasks,true);assert.equal(h.scheduled.size,count+1);await h.syncProjectReminders([enabled],tasks,true);assert.equal(h.scheduled.size,count+1);
});
test('archive/unarchive never bypasses notification master OFF, while non-archived Completed work can still remind',async()=>{
 const h=notificationHost(),enabled={...project,remindersEnabled:true,status:'Completed'},tasks=[task('open')];await h.syncProjectReminders([{...enabled,archived:true}],tasks,false);await h.syncProjectReminders([enabled],tasks,false);assert.equal(h.scheduled.size,0);await h.syncProjectReminders([enabled],tasks,true);assert.ok(h.scheduled.size>0);
});
test('queued task scheduling followed by archive leaves no live project reminders',async()=>{
 const h=notificationHost(),enabled={...project,remindersEnabled:true},tasks=[task('open')];await Promise.all([h.scheduleProjectReminders(enabled,tasks),h.syncProjectReminders([{...enabled,archived:true}],tasks,true)]);assert.equal(h.scheduled.size,0);
});
test('archive preserves legacy-derived Completed status even when a task is reopened before unarchive',async()=>{
 const h=setup(state({tasks:[task('done','done',{isManual:true,completedAt:'2021-04-04T10:00:00.000Z'})]}));let flow=await h.render();assert.equal(flow.projects[0].status,undefined);flow.setProjectArchived('p',true,true);flow=await h.render();assert.equal(flow.projects[0].status,'Completed');flow.toggleTask('done','p');flow=await h.render();assert.equal(flow.projects[0].status,'Completed');flow.setProjectArchived('p',false);flow=await h.render();assert.equal(flow.projects[0].status,'Completed');assert.equal(pm.projectProgress('p',flow.tasks).percent,0);
});
