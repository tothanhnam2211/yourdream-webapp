'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const E=require('../vendor/radicals-engine.cjs'),data=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/data/radical-steps-v0.1.json'),'utf8')),vectors=JSON.parse(fs.readFileSync(path.join(__dirname,'radicals-parity-vectors.json'),'utf8'));
let passed=0;function check(name,fn){fn();passed++;}
check('validate actual 4-item lesson',()=>assert.equal(E.validate(data),true));
for(const v of vectors)check(v.name,()=>assert.equal(E.evaluate(data,v.step_id,v.answer,v.completed).status,v.expected_status,v.name));
check('replay accepts all valid submitted steps',()=>{const a=Object.fromEntries(data.steps.map(s=>[s.step_id,s.interaction.expected]));assert.equal(E.replay(data,a).size,15);});
check('replay does not accept orphan final answer',()=>assert.equal(E.replay(data,{'RAD-001:S04':'6'}).size,0));
check('changing a prior answer invalidates downstream practice completion',()=>{const a=Object.fromEntries(data.steps.map(s=>[s.step_id,s.interaction.expected]));a['RAD-003:S01']={variable:'x',lower:'0',lower_inclusive:true,exclusions:[]};const r=E.replay(data,a);for(const n of [1,2,3,4])assert.equal(r.has(`RAD-003:S0${n}`),false);assert.equal(r.size,11);});
check('restore preserves drafts without marking them correct',()=>{const r=E.restore(data,{version:data.version,answers:{},drafts:{'RAD-001:S01':'3'},hints:{'RAD-001:S01':2},itemId:'RAD-001',stepId:'RAD-001:S01'});assert.equal(r.drafts['RAD-001:S01'],'3');assert.equal(r.hints['RAD-001:S01'],2);assert.equal(E.replay(data,r.answers).size,0);});
check('restore filters foreign step IDs and unbounded hint counts',()=>{const r=E.restore(data,{version:data.version,answers:{foreign:'6'},hints:{'RAD-001:S01':99},itemId:'missing',stepId:'missing'});assert.deepEqual(r.answers,{});assert.deepEqual(r.hints,{});assert.equal(r.itemId,'RAD-001');});
check('foreign data version does not import old progress',()=>{const r=E.restore(data,{version:'other',answers:{'RAD-001:S01':'3'}});assert.deepEqual(r.answers,{});});
check('no competency claim from a correct answer',()=>assert.equal(E.evaluate(data,'RAD-001:S01','3').mastery_changed,false));
console.log(JSON.stringify({checks_passed:passed,checks_total:passed,python_parity_vectors:vectors.length,browser_engine:'PASS_BOUNDED',end_to_end_browser_test:false}));
