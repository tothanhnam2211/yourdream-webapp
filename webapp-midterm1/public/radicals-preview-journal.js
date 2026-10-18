(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadicalPreviewJournal=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const LIMIT=300;function hash(data){if(!/^[a-f0-9]{64}$/.test(data.content_sha256))throw Error('PREVIEW_HASH_REQUIRED');return data.content_sha256;}
const types=['ANSWER_SUBMITTED','HINT_OPENED','EXPLANATION_OPENED','ITEM_RESET'];
const validDiag=v=>v===undefined||v===null||(typeof v==='string'&&/^[A-Za-z0-9:._-]{1,100}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v));
function create(data,id,legacy=false){return {schema:1,content_sha256:hash(data),session_id:id,sequence:0,events:[],truncated:false,coverage:Object.fromEntries(data.graphs.map(g=>[g.item_id,!legacy]))};}
function validEvent(data,e,session){const g=data.graphs.find(g=>g.item_id===e?.item_id);return !!g&&e.session_id===session&&e.content_package_id===data.package_id&&e.content_version===data.version&&e.content_sha256===hash(data)&&types.includes(e.type)&&Number.isSafeInteger(e.sequence)&&e.sequence>0&&e.event_id===session+':'+e.sequence&&typeof e.observed_at==='string'&&e.observed_at.length<=40&&Number.isInteger(e.hint_level)&&e.hint_level>=0&&e.hint_level<=3&&(e.type==='ITEM_RESET'?e.step_id===null:g.step_ids.includes(e.step_id))&&(e.type!=='ANSWER_SUBMITTED'||(['CORRECT','TRY_AGAIN','NEEDS_REVIEW'].includes(e.result_status)&&typeof e.answer_json==='string'&&e.answer_json.length<=2000&&validDiag(e.diagnosis_code)));}
function restore(data,value,id,legacy){
 const fresh=()=>create(data,id,legacy);
 if(!value||value.schema!==1||value.content_sha256!==hash(data)||typeof value.session_id!=='string'||!/^[\w-]{1,80}$/.test(value.session_id)||!Array.isArray(value.events)||value.events.length>LIMIT||!Number.isSafeInteger(value.sequence)||value.sequence<0)return fresh();
 let prev=0;for(const e of value.events){if(!validEvent(data,e,value.session_id)||e.sequence<=prev||e.sequence>value.sequence)return fresh();prev=e.sequence;}
 const j=create(data,value.session_id,true);j.sequence=value.sequence;j.events=JSON.parse(JSON.stringify(value.events));j.truncated=value.truncated===true;
 for(const g of data.graphs)j.coverage[g.item_id]=value.coverage?.[g.item_id]===true;
 return j;
}
function append(data,j,type,itemId,stepId,details={}){
 if(!Number.isSafeInteger(j.sequence)||j.sequence>=Number.MAX_SAFE_INTEGER-1)throw Error('Nhật ký đã đạt giới hạn số thứ tự.');
 const sequence=j.sequence+1,e={event_id:j.session_id+':'+sequence,session_id:j.session_id,sequence,content_package_id:data.package_id,content_version:data.version,content_sha256:hash(data),item_id:itemId,step_id:stepId,type,hint_level:details.hint_level||0,observed_at:new Date().toISOString()};
 if(type==='ANSWER_SUBMITTED'){e.answer_json=JSON.stringify(details.answer);e.result_status=details.result_status;if(validDiag(details.diagnosis_code)&&details.diagnosis_code)e.diagnosis_code=details.diagnosis_code;}
 if(!validEvent(data,e,j.session_id))throw Error('Sự kiện luyện tập không hợp lệ.');
 j.sequence=sequence;j.events.push(e);if(type==='ITEM_RESET')j.coverage[itemId]=true;
 while(j.events.length>LIMIT){const old=j.events.shift();j.coverage[old.item_id]=false;j.truncated=true;}
 return e;
}
function evidence(j,itemId,stepId){
 const reset=j.events.findLastIndex(e=>e.item_id===itemId&&e.type==='ITEM_RESET');
 const events=j.events.slice(reset+1).filter(e=>e.item_id===itemId&&e.step_id===stepId),answers=events.filter(e=>e.type==='ANSWER_SUBMITTED'),latest=answers.at(-1);
 const priorIncorrect=answers.some(a=>a.result_status!=='CORRECT'),hintOpened=events.some(e=>e.type==='HINT_OPENED'),explanationOpened=events.some(e=>e.type==='EXPLANATION_OPENED');
 if(!latest)return {status:hintOpened||explanationOpened?'SUPPORT_ONLY':'UNKNOWN',attempts:answers.length,diagnosis_code:null,used_support:hintOpened||explanationOpened,prior_incorrect:false};
 if(latest.result_status!=='CORRECT')return {status:latest.result_status,attempts:answers.length,diagnosis_code:latest.diagnosis_code||null,used_support:hintOpened||explanationOpened||latest.hint_level>0,prior_incorrect:true};
 const support=latest.hint_level>0||events.some(e=>e.sequence<latest.sequence&&(e.type==='HINT_OPENED'||e.type==='EXPLANATION_OPENED'));
 return {status:support?'CORRECT_WITH_SUPPORT':j.coverage[itemId]?'CORRECT_WITHOUT_RECORDED_SUPPORT':'UNKNOWN',attempts:answers.length,diagnosis_code:latest.diagnosis_code||null,used_support:support,prior_incorrect:priorIncorrect};
}
const BATCH01_STATE_MAP={
 UNATTEMPTED:{code:'NOT_STARTED',label_vi:'Chưa học'},
 IN_PROGRESS:{code:'INSUFFICIENT_EVIDENCE',label_vi:'Chưa đủ bằng chứng'},
 NEEDS_RETRY:{code:'IN_PRACTICE_NEEDS_RETRY',label_vi:'Đang luyện · Cần sửa lỗi'},
 NEEDS_REINFORCEMENT:{code:'IN_PRACTICE_WITH_SUPPORT',label_vi:'Đang luyện · Đúng khi có gợi ý / từng sai'},
 SOLID_IN_SESSION:{code:'CRITERIA_MET_IN_SESSION',label_vi:'Đã đạt tiêu chí trong phiên (tự giải sạch)'}
};
function diagnoseSkills(data,j,completedSet){
 const done=completedSet instanceof Set?completedSet:new Set(completedSet||[]);
 const titles=new Map((data.knowledge_nodes||[]).map(n=>[n.node_id,n.title]));
 const bySkill=new Map();
 for(const s of data.steps){
  const refs=Array.isArray(s.skill_refs)&&s.skill_refs.length?s.skill_refs:(Array.isArray(s.node_ids)?s.node_ids:[]);
  const ev=evidence(j,s.item_id,s.step_id),isDone=done.has(s.step_id);
  for(const skillId of refs){
   if(!bySkill.has(skillId))bySkill.set(skillId,{skill_id:skillId,title:titles.get(skillId)||skillId,total_steps:0,attempted_steps:0,completed_steps:0,clean_steps:0,support_steps:0,retry_steps:[],support_step_ids:[],diagnosis_codes:[],status:'UNATTEMPTED'});
   const rec=bySkill.get(skillId);rec.total_steps++;
   if(ev.attempts>0||ev.used_support||isDone)rec.attempted_steps++;
   if(isDone)rec.completed_steps++;
   if(ev.diagnosis_code&&ev.status!=='CORRECT_WITHOUT_RECORDED_SUPPORT'&&!rec.diagnosis_codes.includes(ev.diagnosis_code))rec.diagnosis_codes.push(ev.diagnosis_code);
   if(ev.status==='TRY_AGAIN'||ev.status==='NEEDS_REVIEW'){rec.retry_steps.push({item_id:s.item_id,step_id:s.step_id,title:s.title,status:ev.status,diagnosis_code:ev.diagnosis_code});}
   else if(ev.status==='CORRECT_WITH_SUPPORT'||ev.status==='SUPPORT_ONLY'||(isDone&&ev.prior_incorrect)){rec.support_steps++;rec.support_step_ids.push({item_id:s.item_id,step_id:s.step_id,title:s.title});}
   else if(isDone&&ev.status==='CORRECT_WITHOUT_RECORDED_SUPPORT'){rec.clean_steps++;}
  }
 }
 const skills=[...bySkill.values()].map(r=>{
  let status='UNATTEMPTED';
  if(r.retry_steps.length>0)status='NEEDS_RETRY';
  else if(r.support_steps>0)status='NEEDS_REINFORCEMENT';
  else if(r.completed_steps>0&&r.completed_steps===r.total_steps&&r.clean_steps===r.total_steps)status='SOLID_IN_SESSION';
  else if(r.attempted_steps>0||r.completed_steps>0)status='IN_PROGRESS';
  const b01=BATCH01_STATE_MAP[status]||BATCH01_STATE_MAP.UNATTEMPTED;
  const target=r.retry_steps[0]||r.support_step_ids[0]||null;
  return {...r,status,batch01_state:b01.code,batch01_label_vi:b01.label_vi,policy_version:'PENDING',recommended_target:target};
 });
 return {policy_version:'PENDING',skills,needs_retry_count:skills.filter(s=>s.status==='NEEDS_RETRY').length,needs_reinforcement_count:skills.filter(s=>s.status==='NEEDS_REINFORCEMENT').length,insufficient_evidence_count:skills.filter(s=>s.status==='IN_PROGRESS').length,not_started_count:skills.filter(s=>s.status==='UNATTEMPTED').length,criteria_met_count:skills.filter(s=>s.status==='SOLID_IN_SESSION').length};
}
return {create,restore,append,evidence,diagnoseSkills,BATCH01_STATE_MAP,LIMIT};
});
