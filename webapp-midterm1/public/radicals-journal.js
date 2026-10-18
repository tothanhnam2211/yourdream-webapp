(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadicalJournal=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const LIMIT=300,HASH='a16d43b62b2b667422778ae140f610115625843319efefa513df65b2a4be25d2';
const types=['ANSWER_SUBMITTED','HINT_OPENED','EXPLANATION_OPENED','ITEM_RESET'];
function create(data,id,legacy=false){return {schema:1,content_sha256:HASH,session_id:id,sequence:0,events:[],truncated:false,coverage:Object.fromEntries(data.graphs.map(g=>[g.item_id,!legacy]))};}
function validEvent(data,e,session){const g=data.graphs.find(g=>g.item_id===e?.item_id);return !!g&&e.session_id===session&&e.content_package_id===data.package_id&&e.content_version===data.version&&e.content_sha256===HASH&&types.includes(e.type)&&Number.isSafeInteger(e.sequence)&&e.sequence>0&&e.event_id===session+':'+e.sequence&&typeof e.observed_at==='string'&&e.observed_at.length<=40&&Number.isInteger(e.hint_level)&&e.hint_level>=0&&e.hint_level<=3&&(e.type==='ITEM_RESET'?e.step_id===null:g.step_ids.includes(e.step_id))&&(e.type!=='ANSWER_SUBMITTED'||(['CORRECT','TRY_AGAIN','NEEDS_REVIEW'].includes(e.result_status)&&typeof e.answer_json==='string'&&e.answer_json.length<=2000));}
function restore(data,value,id,legacy){
 const fresh=()=>create(data,id,legacy);
 if(!value||value.schema!==1||value.content_sha256!==HASH||typeof value.session_id!=='string'||!/^[\w-]{1,80}$/.test(value.session_id)||!Array.isArray(value.events)||value.events.length>LIMIT||!Number.isSafeInteger(value.sequence)||value.sequence<0)return fresh();
 let prev=0;for(const e of value.events){if(!validEvent(data,e,value.session_id)||e.sequence<=prev||e.sequence>value.sequence)return fresh();prev=e.sequence;}
 const j=create(data,value.session_id,true);j.sequence=value.sequence;j.events=JSON.parse(JSON.stringify(value.events));j.truncated=value.truncated===true;
 for(const g of data.graphs)j.coverage[g.item_id]=value.coverage?.[g.item_id]===true;
 return j;
}
function append(data,j,type,itemId,stepId,details={}){
 if(!Number.isSafeInteger(j.sequence)||j.sequence>=Number.MAX_SAFE_INTEGER-1)throw Error('Nhật ký đã đạt giới hạn số thứ tự.');
 const sequence=j.sequence+1,e={event_id:j.session_id+':'+sequence,session_id:j.session_id,sequence,content_package_id:data.package_id,content_version:data.version,content_sha256:HASH,item_id:itemId,step_id:stepId,type,hint_level:details.hint_level||0,observed_at:new Date().toISOString()};
 if(type==='ANSWER_SUBMITTED'){e.answer_json=JSON.stringify(details.answer);e.result_status=details.result_status;}
 if(!validEvent(data,e,j.session_id))throw Error('Sự kiện luyện tập không hợp lệ.');
 j.sequence=sequence;j.events.push(e);if(type==='ITEM_RESET')j.coverage[itemId]=true;
 while(j.events.length>LIMIT){const old=j.events.shift();j.coverage[old.item_id]=false;j.truncated=true;}
 return e;
}
function evidence(j,itemId,stepId){
 const reset=j.events.findLastIndex(e=>e.item_id===itemId&&e.type==='ITEM_RESET');
 const events=j.events.slice(reset+1).filter(e=>e.item_id===itemId&&e.step_id===stepId),answers=events.filter(e=>e.type==='ANSWER_SUBMITTED'),latest=answers.at(-1);
 if(!latest)return {status:'UNKNOWN',attempts:answers.length};
 if(latest.result_status!=='CORRECT')return {status:latest.result_status,attempts:answers.length};
 const support=latest.hint_level>0||events.some(e=>e.sequence<latest.sequence&&(e.type==='HINT_OPENED'||e.type==='EXPLANATION_OPENED'));
 return {status:support?'CORRECT_WITH_SUPPORT':j.coverage[itemId]?'CORRECT_WITHOUT_RECORDED_SUPPORT':'UNKNOWN',attempts:answers.length};
}
return {create,restore,append,evidence,LIMIT,HASH};
});
