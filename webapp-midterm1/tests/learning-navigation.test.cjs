'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const pub=path.resolve(__dirname,'../public');
const mod={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(pub,'learning-navigation.js'),'utf8'),{module:mod,URL,URLSearchParams});const N=mod.exports;
const EMod={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(pub,'radicals-engine.js'),'utf8'),{module:EMod});
const PMod={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(pub,'radicals-profiles.js'),'utf8'),{module:PMod,structuredClone});
const data=PMod.exports.load(JSON.parse(fs.readFileSync(path.join(pub,'data/midterm1-hanoi-exam01-preview.json'))),'lesson-contract-v01',EMod.exports);
function storage(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
const profile='midterm1-hanoi-01',hash='25a9c543df43f8912176294ad4651390e8b4040aa89c281aeed2fa0a56291b99';
test('Navigation returns only to real same-origin routes',()=>{for(const x of ['javascript:alert(1)','//evil.test/x','/missing.html','/radicals.html#answer','/\\evil.test','/graph02-preview.html?expected=answer'])assert.equal(N.safeRoute(x),null,x);assert.equal(N.safeRoute('/?branch=algebra&topic=1&tab=2'),'/?branch=algebra&topic=1&tab=2');});
test('Graph deep link resolves actual part membership and rejects conflicting or invented IDs',()=>{
 const g=data.graphs[3],step=g.subquestion_step_groups.y_2b[0];
 const v=N.resolveGraphContext(data,new URLSearchParams({graph_id:g.item_id,part:'y_2b',step_id:step}));
 assert.equal(v.itemId,g.item_id);assert.equal(v.stepId,step);assert.equal(v.part,'y_2b');
 assert.equal(N.resolveGraphContext(data,new URLSearchParams({graph_id:g.item_id,part:'y_fake'})),null);
 assert.equal(N.resolveGraphContext(data,new URLSearchParams({graph_id:g.item_id,step_id:data.graphs[0].step_ids[0]})),null);
 assert.equal(N.resolveGraphContext(data,new URLSearchParams({graph_id:g.item_id,part:'y_1',step_id:step})),null);
});
test('Exam lock survives a new page instance; another package cannot release it',()=>{
 const s=storage();assert.equal(N.startExam(s,profile,hash),true);assert.equal(N.examSession(s).profileId,profile);
 assert.equal(N.startExam(s,'legacy',hash),false);assert.equal(N.finishExam(s,'legacy',hash),false);
 assert.equal(N.finishExam(s,profile,'a'.repeat(64)),false);assert.ok(N.examSession(s));
 assert.equal(N.finishExam(s,profile,hash),true);assert.equal(N.examSession(s),null);
});
test('Exam UI cannot start if durable session write fails',()=>{assert.equal(N.startExam({getItem:()=>null,setItem:()=>{throw Error('quota');}},profile,hash),false);});
test('Active exam redirects learning, design and other-profile routes before their UI renders',()=>{
 const s=storage();N.startExam(s,profile,hash);
 for(const [pathname,search] of [['/',''],['/radicals.html',''],['/blueprint.html',''],['/graph02-preview.html','?profile=legacy']]){
  let redirect=null;const w={localStorage:s,document:{documentElement:{style:{}}},location:{pathname,search,replace:u=>redirect=u}};
  assert.equal(N.enforce(w),true);assert.equal(redirect,N.examURL(N.examSession(s)));assert.equal(w.document.documentElement.style.visibility,'hidden');
 }
 assert.equal(N.enforce({localStorage:s,location:{pathname:'/graph02-preview.html',search:'?profile='+profile}}),false);
});
