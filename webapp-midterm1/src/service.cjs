'use strict';
// Domain boundary only. identity MUST come from the trusted server auth adapter,
// never from HTTP JSON or arbitrary caller-supplied headers. No HTTP route here.
class DomainError extends Error {constructor(status,code){super(code);this.status=status;this.code=code;}}
const fail=(status,code)=>{throw new DomainError(status,code);};
function exact(v,fields){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join('|')!==fields.slice().sort().join('|'))fail(400,'INVALID_SHAPE');}
function canonical(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';}
async function digest(s){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
function bounded(v,max){let s;try{s=JSON.stringify(v);}catch{fail(400,'INVALID_JSON');}if(!s||new TextEncoder().encode(s).length>max)fail(413,'TOO_LARGE');return s;}
function id(v){if(typeof v!=='string'||!/^[A-Za-z0-9:_-]{1,100}$/.test(v))fail(400,'INVALID_ID');}
async function createService(db,{rawContent,sha256,engine,siteId}){
 db=typeof db.withSession==='function'?db.withSession('first-primary'):db;
 if(await digest(rawContent)!==sha256)throw Error('CONTENT_HASH_MISMATCH');
 const data=JSON.parse(rawContent);engine.validate(data);
 const contentKey=data.package_id+':'+data.version+':'+sha256,checker='radicals-engine:rad04';
 const by=Object.fromEntries(data.steps.map(s=>[s.step_id,s]));
 const q=(sql,...args)=>db.prepare(sql).bind(...args);
 // Rechecked inside every write batch: revocation/withdrawal cannot race a stale preflight.
 const access=`EXISTS (SELECT 1 FROM learner_profiles l JOIN principals p ON p.principal_id=l.principal_id
 JOIN role_grants g ON g.principal_id=p.principal_id JOIN content_versions c ON c.content_key=?
 WHERE l.learner_id=? AND l.status='ACTIVE' AND p.status='ACTIVE' AND p.site_id=? AND p.site_subject_id=?
 AND g.revoked_at IS NULL AND g.scope_type='site' AND g.scope_id=p.site_id AND c.withdrawn_at IS NULL AND c.validator_version=?
 AND (g.role='pilot_operator' OR (g.role='student' AND c.review_state='APPROVED')))`;
 const accessArgs=(who)=>[contentKey,who.learner_id,siteId,who.subject,checker];
 async function principal(identity){
  if(!identity||typeof identity.subject!=='string'||!identity.subject)fail(401,'AUTH_REQUIRED');
  const p=await q(`SELECT l.learner_id FROM learner_profiles l JOIN principals p ON p.principal_id=l.principal_id
   WHERE p.site_id=? AND p.site_subject_id=? AND p.status='ACTIVE' AND l.status='ACTIVE'`,siteId,identity.subject).first();
  if(!p)fail(403,'NOT_ENROLLED');return {...p,subject:identity.subject};
 }
 async function permit(who){if(!await q('SELECT 1 AS ok WHERE '+access,...accessArgs(who)).first())fail(403,'CONTENT_OR_ROLE_FORBIDDEN');}
 async function duplicate(who,eventId,hash){const row=await q('SELECT request_hash,receipt_json FROM practice_events WHERE learner_id=? AND client_event_id=?',who.learner_id,eventId).first();if(!row)return null;if(row.request_hash!==hash)fail(409,'EVENT_ID_CONFLICT');return JSON.parse(row.receipt_json);}
 async function owned(who,sid){id(sid);const row=await q('SELECT * FROM practice_sessions WHERE session_id=? AND learner_id=?',sid,who.learner_id).first();if(!row)fail(404,'SESSION_NOT_FOUND');return row;}
 function fresh(){return {answers:{},hints:{},explanations:{},attemptIds:{},supportAtAnswer:{}};}
 async function createSession(identity,request){
  const who=await principal(identity);bounded(request,16384);exact(request,['client_event_id','package_id','version','sha256','item_id']);id(request.client_event_id);
  if(request.package_id!==data.package_id||request.version!==data.version||request.sha256!==sha256||!data.graphs.some(g=>g.item_id===request.item_id))fail(400,'UNKNOWN_CONTENT');
  const hash=await digest(canonical({operation:'CREATE',request}));const prior=await duplicate(who,request.client_event_id,hash);if(prior)return prior;
  await permit(who);const sid=crypto.randomUUID(),eid=crypto.randomUUID(),now=new Date().toISOString(),receipt={session_id:sid,event_id:eid,revision:0,cycle_id:0,status:'CREATED'};
  try{await db.batch([
   q(`INSERT INTO practice_sessions VALUES (?,(SELECT ? WHERE ${access}),?,?,0,0,?,'ACTIVE',?)`,sid,who.learner_id,...accessArgs(who),contentKey,request.item_id,JSON.stringify(fresh()),now),
   q('INSERT INTO practice_events VALUES (?,?,?,?,?,0,?,NULL,0,NULL,NULL,?,?,?,?)',eid,who.learner_id,sid,request.client_event_id,hash,'SESSION_CREATED','{}',checker,now,JSON.stringify(receipt))
  ]);}catch(error){const replay=await duplicate(who,request.client_event_id,hash);if(replay)return replay;await permit(who);throw error;}
  return receipt;
 }
 async function submit(identity,sid,request){
  const who=await principal(identity),session=await owned(who,sid);bounded(request,16384);
  const type=request?.type;const fields=['client_event_id','expected_revision','type','step_id'];if(type==='ANSWER_SUBMITTED')fields.push('answer');exact(request,fields);id(request.client_event_id);
  if(!['ANSWER_SUBMITTED','HINT_OPENED','EXPLANATION_OPENED','ITEM_RESET'].includes(type)||!Number.isSafeInteger(request.expected_revision)||request.expected_revision<0)fail(400,'INVALID_EVENT');
  if(type==='ITEM_RESET'){if(request.step_id!==null)fail(400,'INVALID_STEP');}else if(!Object.hasOwn(by,request.step_id)||by[request.step_id].item_id!==session.item_id)fail(400,'INVALID_STEP');
  if(type==='ANSWER_SUBMITTED')bounded(request.answer,2048);
  const hash=await digest(canonical({operation:'EVENT',session_id:sid,request}));const prior=await duplicate(who,request.client_event_id,hash);if(prior)return prior;
  if(session.content_key!==contentKey)fail(409,'CONTENT_VERSION_UNAVAILABLE');await permit(who);
  if(session.status!=='ACTIVE'||session.revision!==request.expected_revision)fail(409,'REVISION_CONFLICT');
  const state=JSON.parse(session.state_json),eid=crypto.randomUUID(),now=new Date().toISOString(),step=request.step_id;
  let result=null,cycle=session.cycle_id,support={hint_level:0,explanation_opened:false};
  if(type==='ITEM_RESET'){Object.assign(state,fresh());cycle++;}else{
   const complete=engine.replay(data,state.answers);if(!by[step].requires.every(k=>complete.has(k)))fail(409,'STEP_LOCKED');
   support={hint_level:state.hints[step]||0,explanation_opened:state.explanations[step]===true};
   if(type==='ANSWER_SUBMITTED'){
    result=engine.evaluate(data,step,request.answer,[...complete]).status;
    state.answers[step]=request.answer;state.attemptIds[step]=eid;
    state.supportAtAnswer[step]=support.hint_level||support.explanation_opened?'RECORDED_SUPPORT':'NO_RECORDED_SUPPORT';
   }else if(type==='HINT_OPENED'){state.hints[step]=Math.min(3,support.hint_level+1);support.hint_level=state.hints[step];}
   else {if(!complete.has(step)&&(state.hints[step]||0)<3)fail(409,'EXPLANATION_LOCKED');state.explanations[step]=true;support.explanation_opened=true;}
  }
  const revision=session.revision+1,receipt={session_id:sid,event_id:eid,revision,cycle_id:cycle,result_status:result,support};
  const complete=engine.replay(data,state.answers),graph=data.graphs.find(g=>g.item_id===session.item_id);
  const rows=graph.step_ids.map(k=>{let status='NOT_STARTED';if(Object.hasOwn(state.answers,k))status=complete.has(k)?'CORRECT':by[k].requires.every(x=>complete.has(x))?engine.evaluate(data,k,state.answers[k],[...complete]).status:'LOCKED';return {step_id:k,status,support:state.supportAtAnswer[k]||'UNKNOWN',attempt:state.attemptIds[k]||null};});
  const guard=`SELECT session_id FROM practice_sessions WHERE session_id=? AND learner_id=? AND revision=? AND status='ACTIVE' AND content_key=? AND ${access}`;
  // A lost CAS produces NULL for a NOT NULL event.session_id, aborting the entire batch.
  // Never rely on UPDATE affected-row count to stop subsequent statements.
  const statements=[
   q(`INSERT INTO practice_events VALUES (?,?,(${guard}),?,?,?,?,?,?,?,?,?,?,?,?)`,eid,who.learner_id,sid,who.learner_id,session.revision,contentKey,...accessArgs(who),request.client_event_id,hash,revision,type,step,cycle,type==='ANSWER_SUBMITTED'?JSON.stringify(request.answer):null,result,JSON.stringify(support),checker,now,JSON.stringify(receipt)),
   q('UPDATE practice_sessions SET revision=?,cycle_id=?,state_json=? WHERE session_id=? AND learner_id=? AND revision=?',revision,cycle,JSON.stringify(state),sid,who.learner_id,session.revision),
   q('DELETE FROM step_progress WHERE session_id=?',sid),
   ...rows.map(r=>q('INSERT INTO step_progress VALUES (?,?,?,?,?,?)',sid,r.step_id,r.attempt,r.status,r.support,'core02-v1'))
  ];
  try{await db.batch(statements);}catch(error){const replay=await duplicate(who,request.client_event_id,hash);if(replay)return replay;await permit(who);const current=await owned(who,sid);if(current.revision!==session.revision||current.status!=='ACTIVE')fail(409,'REVISION_CONFLICT');throw error;}
  return receipt;
 }
 async function resume(identity,sid){const who=await principal(identity),s=await owned(who,sid);return {session_id:s.session_id,content_key:s.content_key,item_id:s.item_id,cycle_id:s.cycle_id,revision:s.revision,state:JSON.parse(s.state_json),status:s.status};}
 async function progress(identity,cursor=''){const who=await principal(identity);if(typeof cursor!=='string'||cursor.length>100)fail(400,'INVALID_CURSOR');const r=await q('SELECT session_id,item_id,revision,cycle_id,status FROM practice_sessions WHERE learner_id=? AND session_id>? ORDER BY session_id LIMIT 51',who.learner_id,cursor).all();return {sessions:r.results.slice(0,50),next_cursor:r.results.length>50?r.results[49].session_id:null};}
 return {createSession,submit,resume,progress,contentKey};
}
module.exports={createService,DomainError};
