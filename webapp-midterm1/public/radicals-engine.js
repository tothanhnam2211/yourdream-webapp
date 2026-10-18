(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadicalEngine=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function gcd(a,b){a=a<0n?-a:a;b=b<0n?-b:b;while(b){const t=b;b=a%b;a=t;}return a||1n;}
function rational(v){if(typeof v==='number'){if(!Number.isSafeInteger(v))throw Error('number');v=String(v);}if(typeof v!=='string'||!/^[+-]?\d{1,20}(?:\/[+-]?\d{1,20})?$/.test(v.trim()))throw Error('rational');const p=v.trim().split('/');let a=BigInt(p[0]),b=p[1]===undefined?1n:BigInt(p[1]);if(!b)throw Error('zero denominator');if(b<0n){a=-a;b=-b;}const g=gcd(a,b);return String(a/g)+'/'+String(b/g);}
function keys(v,wanted){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join('|')!==wanted.slice().sort().join('|'))throw Error('shape');}
function normalize(kind,v){
 if(kind==='rational')return rational(v);
 if(kind==='choice'){if(typeof v!=='string')throw Error('choice');return v;}
 if(kind==='linear'||kind==='quadratic_pair'){keys(v,kind==='linear'?['constant','coefficient']:['constant','coefficient','radicand']);if(kind==='quadratic_pair'&&v.radicand!==3)throw Error('basis');return [rational(v.constant),rational(v.coefficient)];}
 if(kind==='domain'||kind==='domain_expression'){const fields=['variable','lower','lower_inclusive','exclusions'];if(kind==='domain_expression')fields.push('expression');keys(v,fields);if(v.variable!=='x'||typeof v.lower_inclusive!=='boolean'||!Array.isArray(v.exclusions)||v.exclusions.length>20)throw Error('domain');const a=[rational(v.lower),v.lower_inclusive,[...new Set(v.exclusions.map(rational))].sort()];if(kind==='domain_expression'){if(typeof v.expression!=='string')throw Error('expression');a.push(v.expression);}return a;}
 throw Error('unsupported kind');
}
function index(data){return Object.fromEntries(data.steps.map(s=>[s.step_id,s]));}
function evaluate(data,id,answer,completed=[]){const s=index(data)[id];if(!s)return {status:'NEEDS_REVIEW',reason:'UNKNOWN_STEP'};if(!s.requires.every(k=>completed.includes(k)))return {status:'LOCKED',reason:'PREDECESSORS_NOT_CONFIRMED'};const a=s.interaction;let candidate;try{candidate=normalize(a.answer_type,answer);if(a.answer_type==='choice'&&!Object.hasOwn(a.choices,candidate))throw Error('unknown choice');}catch{return {status:'NEEDS_REVIEW',reason:'UNSUPPORTED_RESPONSE',feedback:s.feedback.unknown};}const good=JSON.stringify(candidate)===JSON.stringify(normalize(a.answer_type,a.expected));return {status:good?'CORRECT':'TRY_AGAIN',feedback:s.feedback[good?'correct':'incorrect'],mastery_changed:false};}
function replay(data,answers){const complete=new Set();let changed=true;while(changed){changed=false;for(const s of data.steps){if(!complete.has(s.step_id)&&Object.hasOwn(answers,s.step_id)&&evaluate(data,s.step_id,answers[s.step_id],[...complete]).status==='CORRECT'){complete.add(s.step_id);changed=true;}}}return complete;}
function restore(data,value){const blank={answers:{},drafts:{},hints:{},itemId:data.graphs[0].item_id,stepId:data.graphs[0].step_ids[0]};if(!value||typeof value!=='object'||value.version!==data.version)return blank;const by=index(data),answers={},drafts={},hints={};for(const [input,output] of [[value.answers,answers],[value.drafts,drafts]])if(input&&typeof input==='object')for(const [k,v] of Object.entries(input))if(Object.hasOwn(by,k))output[k]=v;if(value.hints&&typeof value.hints==='object')for(const [k,v] of Object.entries(value.hints))if(Object.hasOwn(by,k)&&Number.isInteger(v)&&v>=0&&v<=3)hints[k]=v;const g=data.graphs.find(g=>g.item_id===value.itemId)||data.graphs[0];return {answers,drafts,hints,itemId:g.item_id,stepId:g.step_ids.includes(value.stepId)?value.stepId:g.step_ids[0]};}
function validate(data){
 const fail=()=>{throw Error('Cấu trúc bản đồ bài học không hợp lệ.');};
 if(!data||data.package_id!=='EXAM-RAD-01'||!Array.isArray(data.graphs)||!Array.isArray(data.steps)||data.graphs.length!==4||data.steps.length!==15)fail();
 const validId=x=>typeof x==='string'&&/^[A-Za-z0-9:_-]{1,80}$/.test(x);
 if(data.steps.some(s=>!s||!validId(s.step_id)||!validId(s.item_id)))fail();
 const expectedCounts={'RAD-001':4,'RAD-002':3,'RAD-003':4,'RAD-004':4};
 const by=index(data),items=new Set(),listed=new Set();if(Object.keys(by).length!==15)fail();
 for(const s of data.steps){
  if(!Array.isArray(s.requires)||new Set(s.requires).size!==s.requires.length||s.requires.some(k=>!Object.hasOwn(by,k)||k===s.step_id||by[k].item_id!==s.item_id))fail();
  normalize(s.interaction.answer_type,s.interaction.expected);
 }
 for(const g of data.graphs){
  if(!g||!Object.hasOwn(expectedCounts,g.item_id)||items.has(g.item_id)||!Array.isArray(g.step_ids)||g.step_ids.length!==expectedCounts[g.item_id]||!Array.isArray(g.edges))fail();items.add(g.item_id);
  for(const k of g.step_ids){if(!Object.hasOwn(by,k)||by[k].item_id!==g.item_id||listed.has(k))fail();listed.add(k);}
  const local=new Set(g.step_ids),actual=new Set(),expected=new Set();
  for(const k of g.step_ids)for(const from of by[k].requires)expected.add(from+'>'+k);
  for(const e of g.edges){if(!e||!local.has(e.from)||!local.has(e.to))fail();const pair=e.from+'>'+e.to;if(actual.has(pair)||!expected.has(pair))fail();actual.add(pair);}
  if(actual.size!==expected.size)fail();
 }
 if(listed.size!==data.steps.length)fail();
 const complete=new Set();let last=-1;while(last!==complete.size){last=complete.size;for(const s of data.steps)if(s.requires.every(x=>complete.has(x)))complete.add(s.step_id);}if(complete.size!==15)fail();
 return true;
}
return {rational,normalize,evaluate,replay,restore,validate};
});
