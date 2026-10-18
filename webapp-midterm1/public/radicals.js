(function(){'use strict';
const $=id=>document.getElementById(id),E=window.RadicalEngine,J=window.RadicalJournal;
const revision='a16d43b62b2b',titles={'RAD-001':'Tách và gom căn','RAD-002':'Hiểu giá trị tuyệt đối','RAD-003':'Giữ điều kiện xác định','RAD-004':'Dùng biểu thức liên hợp'},subtitles={'RAD-001':'Căn đồng dạng','RAD-002':'Xét dấu với x < 2','RAD-003':'Khử nhân tử đúng miền','RAD-004':'Trục căn ở mẫu'};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data,by,state,storageKey,completed=new Set(),mode=window.innerWidth<750?'list':'map',storageAvailable=true,journal,hadLocalProgressAtBoot=false;
let anonDomain=null,staleFormSnapshot=null,activeFlushGen=0;
const accountDomains=new Map();

const server={
 mode:'local',
 accountScope:null,
 generation:0,
 sessions:{},
 savedRevisions:{},
 queue:[],
 flushing:false,
 conflict:null,
 syncError:null,
 lastSavedRevision:null,
 ready:null
};

const graph=()=>data.graphs.find(g=>g.item_id===state.itemId),current=()=>by[state.stepId];
function ready(s){return s.requires.every(k=>completed.has(k));}
function status(s){return completed.has(s.step_id)?'Đã làm đúng':ready(s)?'Sẵn sàng':'Cần bước trước';}

function queueStorageKey(scope){return `yd-rad-srv-queue:${revision}:${scope}`;}
function sessionStorageKey(scope){return `yd-rad-srv-sessions:${revision}:${scope}`;}
function draftStorageKey(scope){return `yd-rad-srv-drafts:${revision}:${scope}`;}

function makeClientEventId(prefix='ce'){
 const rand=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID().replace(/-/g,''):Math.random().toString(36).slice(2)+Date.now().toString(36);
 return `${prefix}_${rand.slice(0,40)}`;
}

function safeReadAnswerJson(){
 try{
  if(!data||!by||!state||!state.stepId||!by[state.stepId])return null;
  return JSON.stringify(readAnswer());
 }catch{
  return null;
 }
}

function getOrCreateAccountDomain(scope){
 let dom=accountDomains.get(scope);
 if(!dom){
  const defaultItem=state&&state.itemId&&data.graphs.some(g=>g.item_id===state.itemId)?state.itemId:data.graphs[0].item_id;
  const defaultStep=data.graphs.find(g=>g.item_id===defaultItem).step_ids[0];
  dom={
   scope,
   state:{answers:{},drafts:{},hints:{},itemId:defaultItem,stepId:defaultStep},
   journal:J.restore(data,null,crypto.randomUUID(),false)
  };
  accountDomains.set(scope,dom);
 }
 return dom;
}

function preserveForeignQueueEvent(ev){
 if(!ev||typeof ev.account_scope!=='string'||!ev.account_scope||typeof ev.client_event_id!=='string'||!Number.isInteger(ev.expected_revision))return;
 try{
  const key=queueStorageKey(ev.account_scope);
  const raw=localStorage.getItem(key);
  const parsed=raw&&raw.length<500000?JSON.parse(raw):[];
  const list=Array.isArray(parsed)?parsed:[];
  if(!list.some(x=>x&&x.client_event_id===ev.client_event_id)){
   list.push({...ev});
   localStorage.setItem(key,JSON.stringify(list));
  }
 }catch{}
}

function saveServerScopeState(targetScope=server.accountScope){
 if(!targetScope)return;
 try{
  for(const q of server.queue){
   if(q&&q.account_scope&&q.account_scope!==targetScope){
    preserveForeignQueueEvent(q);
   }
  }
  const filteredQueue=server.queue.filter(q=>q&&q.account_scope===targetScope&&typeof q.client_event_id==='string'&&Number.isInteger(q.expected_revision));
  let queueToWrite=filteredQueue;
  if(filteredQueue.length===0&&targetScope!==server.accountScope){
   const existingRaw=localStorage.getItem(queueStorageKey(targetScope));
   if(existingRaw&&existingRaw.length<500000){
    const parsed=JSON.parse(existingRaw);
    if(Array.isArray(parsed))queueToWrite=parsed;
   }
  }
  localStorage.setItem(queueStorageKey(targetScope),JSON.stringify(queueToWrite));
  if(targetScope===server.accountScope){
   const scopedSessions={};
   for(const [k,v] of Object.entries(server.sessions)){
    if(v&&(!v.account_scope||v.account_scope===targetScope)){
     scopedSessions[k]=v;
    }
   }
   localStorage.setItem(sessionStorageKey(targetScope),JSON.stringify(scopedSessions));
   const dom=accountDomains.get(targetScope);
   if(dom&&dom.state&&dom.state.drafts){
    localStorage.setItem(draftStorageKey(targetScope),JSON.stringify(dom.state.drafts));
   }
  }
 }catch{storageAvailable=false;}
}

function loadServerScopeState(scope){
 server.sessions={};
 server.queue=[];
 if(!scope)return;
 try{
  const rawSessions=localStorage.getItem(sessionStorageKey(scope));
  if(rawSessions&&rawSessions.length<500000){
   const parsed=JSON.parse(rawSessions);
   if(parsed&&typeof parsed==='object'){
    const validSessions={};
    for(const [k,v] of Object.entries(parsed)){
     if(v&&typeof v==='object'&&(!v.account_scope||v.account_scope===scope)){
      validSessions[k]={...v,account_scope:scope};
     }
    }
    server.sessions=validSessions;
   }
  }
  const rawQueue=localStorage.getItem(queueStorageKey(scope));
  if(rawQueue&&rawQueue.length<500000){
   const parsedQ=JSON.parse(rawQueue);
   if(Array.isArray(parsedQ)){
    server.queue=parsedQ.filter(item=>item&&item.account_scope===scope&&typeof item.client_event_id==='string'&&Number.isInteger(item.expected_revision));
   }
  }
 }catch{
  server.sessions={};
  server.queue=[];
 }
}

function getActiveItemSession(){
 if(server.mode!=='authenticated'||!server.accountScope||!state||!state.itemId)return null;
 const sess=server.sessions[state.itemId];
 if(!sess||!sess.session_id||(sess.account_scope&&sess.account_scope!==server.accountScope))return null;
 if(sess.item_id&&sess.item_id!==state.itemId)return null;
 return sess;
}

function syncActiveSavedRevision(){
 const sess=getActiveItemSession();
 if(!sess||!Number.isInteger(sess.revision)){
  server.lastSavedRevision=null;
  return null;
 }
 const savedRev=server.savedRevisions[state.itemId];
 server.lastSavedRevision=Number.isInteger(savedRev)&&savedRev===sess.revision?sess.revision:null;
 return server.lastSavedRevision;
}

function renderSyncStatus(){
 const badge=$('sync-badge'),signin=$('auth-signin-link'),signout=$('auth-signout-link'),retry=$('sync-retry'),banner=$('conflict-banner'),msg=$('conflict-message'),note=$('storage-note');
 if(!badge)return;
 if(server.mode==='authenticated'){
  const activeItemId=state?state.itemId:null;
  const activeSess=getActiveItemSession();
  const activeSavedRev=syncActiveSavedRevision();
  const activePending=activeItemId?server.queue.filter(q=>q&&q.account_scope===server.accountScope&&q.item_id===activeItemId):[];
  signin.hidden=true;signout.hidden=false;
  if(server.conflict&&(!server.conflict.event||server.conflict.event.item_id===activeItemId)){
   badge.className='sync-badge sync-conflict';
   badge.textContent='Xung đột máy chủ — cần xử lý';
   retry.hidden=true;
   banner.hidden=false;
   msg.textContent=server.conflict.message||'Phiên trên máy chủ đã thay đổi. Câu trả lời bạn đang nhập vẫn được giữ nguyên; hãy chọn gửi lại hoặc dùng trạng thái máy chủ.';
  }else if(server.syncError){
   badge.className='sync-badge sync-error';
   badge.textContent='Chưa lưu máy chủ — đang chờ gửi';
   retry.hidden=false;
   banner.hidden=true;
  }else if(activePending.length>0){
   badge.className='sync-badge sync-pending';
   badge.textContent=`Đang lưu máy chủ… (${activePending.length} mục chờ)`;
   retry.hidden=true;
   banner.hidden=true;
  }else if(activeSavedRev!==null){
   badge.className='sync-badge sync-saved';
   badge.textContent=`Đã lưu máy chủ (phiên bản #${activeSavedRev})`;
   retry.hidden=true;
   banner.hidden=true;
  }else if(activeSess&&Number.isInteger(activeSess.revision)){
   badge.className='sync-badge sync-saved';
   badge.textContent=`Đã tải từ máy chủ (phiên bản #${activeSess.revision})`;
   retry.hidden=true;
   banner.hidden=true;
  }else{
   badge.className='sync-badge sync-saved';
   badge.textContent='Đã kết nối máy chủ (bản thử riêng tư)';
   retry.hidden=true;
   banner.hidden=true;
  }
  note.textContent=hadLocalProgressAtBoot
   ?'Đang dùng chế độ lưu máy chủ. Tiến trình cục bộ cũ được giữ riêng trên trình duyệt, không tự nhập thành kết quả xác thực.'
   :'Chế độ lưu máy chủ đang bật cho chủ dự án. Chỉ báo "Đã lưu máy chủ" sau khi máy chủ xác nhận receipt.';
 }else if(server.mode==='forbidden'){
  badge.className='sync-badge sync-local';
  badge.textContent='Chế độ cục bộ · Chưa có quyền xem trước máy chủ';
  signin.hidden=true;signout.hidden=false;retry.hidden=true;banner.hidden=true;
  note.textContent='Tài khoản chưa được cấp quyền pilot_operator trên máy chủ; tiến trình chỉ lưu trên trình duyệt này.';
 }else{
  badge.className='sync-badge sync-local';
  badge.textContent='Chế độ cục bộ · Chưa đăng nhập máy chủ';
  signin.hidden=false;signout.hidden=true;retry.hidden=true;banner.hidden=true;
  note.textContent=storageAvailable?'Tiến trình chỉ lưu trên trình duyệt này.':'Trình duyệt chưa cho lưu; phiên này chỉ giữ khi trang còn mở.';
 }
}

function save(){
 if(server.mode!=='authenticated'){
  if(anonDomain&&state===anonDomain.state&&journal===anonDomain.journal){
   try{localStorage.setItem(storageKey,JSON.stringify({...anonDomain.state,version:data.version,journal:anonDomain.journal}));storageAvailable=true;}catch{storageAvailable=false;}
  }
 }else if(server.accountScope){
  saveServerScopeState(server.accountScope);
 }
 renderSyncStatus();
}

function nextExpectedRevision(itemId){
 const pendingForItem=server.queue.filter(q=>q.account_scope===server.accountScope&&q.item_id===itemId);
 if(pendingForItem.length>0)return pendingForItem[pendingForItem.length-1].expected_revision+1;
 const sess=server.sessions[itemId];
 return sess&&(!sess.account_scope||sess.account_scope===server.accountScope)&&Number.isInteger(sess.revision)?sess.revision:0;
}

function enqueueServerEvent(type,stepId,details={}){
 if(server.mode!=='authenticated'||!server.accountScope)return;
 const activeScope=server.accountScope;
 const itemId=state.itemId;
 const sess=server.sessions[itemId];
 const validSess=sess&&(!sess.account_scope||sess.account_scope===activeScope)?sess:null;
 const ev={
  client_event_id:makeClientEventId('evt'),
  account_scope:activeScope,
  item_id:itemId,
  session_id:validSess?validSess.session_id:null,
  expected_revision:nextExpectedRevision(itemId),
  type,
  step_id:stepId
 };
 if(type==='ANSWER_SUBMITTED')ev.answer=details.answer;
 server.queue.push(ev);
 server.syncError=null;
 saveServerScopeState(activeScope);
 renderSyncStatus();
 void flushServerQueue();
}

function record(type,stepId,details={}){
 J.append(data,journal,type,state.itemId,stepId,details);
 if(server.mode==='authenticated'){
  enqueueServerEvent(type,stepId,details);
 }
}

function recordExplanation(){
 const d=$('explanation');if(!d.open||d.hidden)return;const s=current();
 const lastReset=journal.events.findLastIndex(e=>e.item_id===state.itemId&&e.type==='ITEM_RESET');
 if(!journal.events.slice(lastReset+1).some(e=>e.step_id===s.step_id&&e.type==='EXPLANATION_OPENED')){
  const details={hint_level:state.hints[s.step_id]||0};
  J.append(data,journal,'EXPLANATION_OPENED',state.itemId,s.step_id,details);
  if(server.mode==='authenticated'&&!completed.has(s.step_id)){
   enqueueServerEvent('EXPLANATION_OPENED',s.step_id,details);
  }
  save();
 }
}

function selectStep(id,focus=false){if(!Object.hasOwn(by,id)||by[id].item_id!==state.itemId)return;state.stepId=id;save();renderMap();renderStep();if(focus)$('practice').focus({preventScroll:false});}
function selectItem(id){
 const g=data.graphs.find(g=>g.item_id===id);if(!g)return;
 state.itemId=id;state.stepId=g.step_ids.find(k=>!completed.has(k)&&ready(by[k]))||g.step_ids[0];
 save();render();
 if(server.mode==='authenticated'&&server.accountScope){
  const opScope=server.accountScope,opGen=server.generation;
  void ensureItemSession(id,opScope,opGen).then(sess=>{
   if(!isOpCurrent(opScope,opGen)||!sess)return;
   applyServerStateToView();render();void flushServerQueue();
  }).catch(()=>{});
 }
}

function renderNav(){
 $('exercise-list').innerHTML=data.graphs.map((g,i)=>{const count=g.step_ids.filter(k=>completed.has(k)).length;return `<button type="button" class="exercise-button ${g.item_id===state.itemId?'active':''}" data-item="${esc(g.item_id)}" ${g.item_id===state.itemId?'aria-current="true"':''}><span class="exercise-index">0${i+1}</span><span><b>${esc(titles[g.item_id])}</b><small>${esc(subtitles[g.item_id])} · ${count}/${g.step_ids.length} bước</small></span></button>`;}).join('');
 $('exercise-list').querySelectorAll('[data-item]').forEach(b=>b.onclick=()=>selectItem(b.dataset.item));
 $('total-progress').innerHTML=`${completed.size} <small>/ 15 bước đã làm đúng</small>`;$('total-bar').style.width=(completed.size/15*100)+'%';
 const g=graph(),i=data.graphs.indexOf(g);$('exercise-number').textContent='BÀI 0'+(i+1);$('exercise-title').textContent=titles[g.item_id];$('exercise-prompt').textContent=g.prompt;
}
function coords(g){if(g.item_id==='RAD-001')return [[160,64],[160,165],[160,266],[530,165]];if(g.step_ids.length===3)return [[165,82],[530,82],[350,245]];return [[165,82],[530,82],[530,245],[165,245]];}
function edgePath(a,b){const dx=b[0]-a[0],dy=b[1]-a[1];if(Math.abs(dx)>Math.abs(dy)){const dir=dx>0?1:-1,sx=a[0]+dir*118,ex=b[0]-dir*122,m=(sx+ex)/2;return `M ${sx} ${a[1]} C ${m} ${a[1]}, ${m} ${b[1]}, ${ex} ${b[1]}`;}const dir=dy>0?1:-1,sy=a[1]+dir*34,ey=b[1]-dir*38,m=(sy+ey)/2;return `M ${a[0]} ${sy} C ${a[0]} ${m}, ${b[0]} ${m}, ${b[0]} ${ey}`;}
function renderMap(){
 const g=graph(),positions=coords(g),points=Object.fromEntries(g.step_ids.map((k,i)=>[k,positions[i]]));
 $('map-mode').setAttribute('aria-pressed',String(mode==='map'));$('list-mode').setAttribute('aria-pressed',String(mode==='list'));$('graph-scroll').hidden=mode!=='map';$('step-list').hidden=mode!=='list';
 $('graph-caption').textContent=g.item_id==='RAD-001'?'Ba nhánh tách căn độc lập, cùng dẫn đến bước gom kết quả.':'Mũi tên chỉ những bước cần hoàn thành trước.';
 const cls=s=>[s.step_id===state.stepId?'is-selected':'',completed.has(s.step_id)?'is-correct':!ready(s)?'is-locked':''].join(' ');
 const edges=g.edges.map(x=>`<path class="edge" d="${edgePath(points[x.from],points[x.to])}" marker-end="url(#rad-arrow)"/>`).join('');
 $('step-map').innerHTML=`<defs><marker id="rad-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#a7bb96"/></marker></defs>${edges}`+g.step_ids.map((k,i)=>{const s=by[k],p=points[k],title=s.title.length>23?s.title.slice(0,21)+'…':s.title;return `<g class="node ${cls(s)}" transform="translate(${p[0]},${p[1]})" data-step="${esc(k)}" tabindex="0" role="button" aria-label="Bước ${i+1}: ${esc(s.title)}. ${status(s)}" aria-pressed="${k===state.stepId}"><title>${esc(s.title)} · ${status(s)}</title><rect x="-118" y="-34" width="236" height="68" rx="12"/><text x="-101" y="4" class="node-number">${completed.has(k)?'✓':String(i+1).padStart(2,'0')}</text><text x="-73" y="-4" class="node-title">${esc(title)}</text><text x="-73" y="16" class="node-state">${status(s)}</text></g>`;}).join('');
 $('step-list').innerHTML=g.step_ids.map((k,i)=>{const s=by[k];return `<button type="button" data-step="${esc(k)}" class="list-step ${cls(s)}" aria-pressed="${k===state.stepId}"><span>${completed.has(k)?'✓':String(i+1).padStart(2,'0')}</span><strong>${esc(s.title)}</strong><small>${status(s)}</small></button>`;}).join('');
 for(const container of [$('step-map'),$('step-list')])container.querySelectorAll('[data-step]').forEach(b=>{b.onclick=()=>selectStep(b.dataset.step,true);if(b.tagName.toLowerCase()==='g')b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectStep(b.dataset.step,true);}};});
}
function field(name,label,value='',placeholder=''){return `<label for="answer-${name}">${esc(label)}<input type="text" id="answer-${name}" name="${name}" inputmode="text" autocomplete="off" spellcheck="false" maxlength="180" value="${esc(value)}" placeholder="${esc(placeholder)}"></label>`;}
function renderFields(s){
 const a=s.interaction,old=Object.hasOwn(state.drafts,s.step_id)?state.drafts[s.step_id]:state.answers[s.step_id],v=old&&typeof old==='object'?old:{},kind=a.answer_type;
 if(kind==='rational')return field('value','Giá trị cần điền',typeof old==='string'||typeof old==='number'?old:'','Ví dụ: 3 hoặc 3/2');
 if(kind==='choice')return `<fieldset><legend>Chọn một phương án</legend>${Object.entries(a.choices).map(([key,label])=>`<label class="choice"><input type="radio" name="choice" value="${esc(key)}" ${old===key?'checked':''}>${esc(label)}</label>`).join('')}</fieldset>`;
 if(kind==='linear'||kind==='quadratic_pair')return field('constant','Hạng tử a',v.constant||'','Số hoặc phân số')+field('coefficient',kind==='linear'?'Hệ số b của x':'Hệ số b của √3',v.coefficient||'','Số hoặc phân số');
 if(kind==='domain'||kind==='domain_expression')return (kind==='domain_expression'?`<label for="answer-expression">Biểu thức rút gọn<select id="answer-expression" name="expression"><option value="">Chọn kết quả</option><option value="sqrt_x_plus_1" ${v.expression==='sqrt_x_plus_1'?'selected':''}>√x + 1</option><option value="sqrt_x_minus_1" ${v.expression==='sqrt_x_minus_1'?'selected':''}>√x − 1</option></select></label>`:'')+field('lower','Cận dưới của x',v.lower??'','Nhập giá trị')+`<label class="checkbox"><input type="checkbox" name="inclusive" ${v.lower_inclusive===true?'checked':''}>Có lấy cận dưới</label>`+field('exclusions','Giá trị x phải loại',(Array.isArray(v.exclusions)?v.exclusions:[]).join('; '),'Ví dụ: 1; 2');
 return '<p>Dạng trả lời này cần người hướng dẫn xem xét.</p>';
}
function readAnswer(){const s=current(),kind=s.interaction.answer_type,f=new FormData($('answer-form'));if(kind==='rational')return String(f.get('value')||'').trim();if(kind==='choice')return f.get('choice');if(kind==='linear'||kind==='quadratic_pair'){const a={constant:String(f.get('constant')||'').trim(),coefficient:String(f.get('coefficient')||'').trim()};if(kind==='quadratic_pair')a.radicand=3;return a;}const d={variable:'x',lower:String(f.get('lower')||'').trim(),lower_inclusive:f.get('inclusive')==='on',exclusions:String(f.get('exclusions')||'').split(/[;,]/).map(s=>s.trim()).filter(Boolean)};if(kind==='domain_expression')d.expression=String(f.get('expression')||'');return d;}
function showFeedback(result){const f=$('feedback');f.hidden=!result||result.status==='LOCKED';if(f.hidden)return;f.className=result.status==='CORRECT'?'correct':result.status==='TRY_AGAIN'?'incorrect':'review';f.textContent=(result.status==='CORRECT'?'✓ Đúng ở bước này. ':result.status==='TRY_AGAIN'?'Cùng kiểm tra lại. ':'Cần xem xét. ')+(result.feedback||'Chưa kiểm tra được cách viết này.');}
function renderStep(){
 const s=current(),g=graph(),i=g.step_ids.indexOf(s.step_id),can=ready(s),count=state.hints[s.step_id]||0;
 $('step-number').textContent=String(i+1).padStart(2,'0');$('step-title').textContent=s.title;$('step-state').textContent=status(s);$('step-question').textContent=s.interaction.prompt;
 $('locked-note').hidden=can;$('locked-note').innerHTML=can?'':`Bước này cần kết quả của: ${s.requires.filter(k=>!completed.has(k)).map(k=>`<button type="button" data-predecessor="${esc(k)}">${esc(by[k].title)}</button>`).join(' · ')}. Bạn vẫn có thể xem câu hỏi.`;
 $('locked-note').querySelectorAll('[data-predecessor]').forEach(b=>b.onclick=()=>selectStep(b.dataset.predecessor,true));
 $('answer-fields').innerHTML=renderFields(s);$('answer-form').querySelectorAll('input,select,button').forEach(x=>x.disabled=!can);$('check-answer').disabled=!can;
 $('answer-guide').textContent=['linear','quadratic_pair','rational'].includes(s.interaction.answer_type)?'Có thể nhập phân số dạng 1/2.':'Điền theo dạng trả lời của bước này.';
 $('hint-button').disabled=!can||count>=3;$('hint-button').textContent=count>=3?'Đã mở đủ 3 gợi ý':`Mở gợi ý ${count+1} / 3`;
 $('hints').innerHTML=s.hints.slice(0,count).map(h=>`<li><span>GỢI Ý ${h.level}</span>${esc(h.text)}</li>`).join('');
 $('explanation').hidden=!(completed.has(s.step_id)||count===3);$('explanation').open=completed.has(s.step_id);$('step-before').textContent=s.before;$('step-after').textContent=s.after;$('step-reason').textContent=s.justification;
 const done=g.step_ids.filter(k=>completed.has(k)).length;$('item-progress').textContent=done===g.step_ids.length?`Đã làm đúng ${done}/${done} bước trong bài này. Hãy thử tự giải lại.`:`${done}/${g.step_ids.length} bước đã làm đúng trong bài này.`;
 $('next-step').hidden=!completed.has(s.step_id);$('next-step').textContent=done===g.step_ids.length?(data.graphs.indexOf(g)===3?'Xem lại bài khác →':`Sang bài ${data.graphs.indexOf(g)+2} →`):'Chọn bước tiếp theo →';
 const evalRes=Object.hasOwn(state.answers,s.step_id)?E.evaluate(data,s.step_id,state.answers[s.step_id],[...completed]):null;
 showFeedback(evalRes);
 const localEv=J.evidence(journal,state.itemId,s.step_id);
 let ev=localEv;
 const sess=server.mode==='authenticated'?server.sessions[state.itemId]:null;
 if(sess&&sess.state&&sess.state.supportAtAnswer&&sess.state.supportAtAnswer[s.step_id]){
  const sup=sess.state.supportAtAnswer[s.step_id];
  const st=completed.has(s.step_id)?(sup==='RECORDED_SUPPORT'?'CORRECT_WITH_SUPPORT':'CORRECT_WITHOUT_RECORDED_SUPPORT'):(evalRes?evalRes.status:'UNKNOWN');
  ev={attempts:Math.max(1,localEv.attempts),status:st};
 }
 const labels={UNKNOWN:'Chưa đủ lịch sử để xác định mức hỗ trợ.',CORRECT_WITH_SUPPORT:'Lần đúng gần nhất có dùng hỗ trợ ở bước này trong chu kỳ hiện tại.',CORRECT_WITHOUT_RECORDED_SUPPORT:'Lần đúng gần nhất chưa ghi nhận dùng hỗ trợ ở bước này trong chu kỳ hiện tại.',TRY_AGAIN:'Lần trả lời gần nhất cần thử lại.',NEEDS_REVIEW:'Lần trả lời gần nhất cần xem xét.'};
 $('attempt-evidence').textContent=`${ev.attempts} lượt kiểm tra được lưu trong chu kỳ. ${labels[ev.status]||labels.UNKNOWN} Đây chưa phải đánh giá thành thạo.`;
 recordExplanation();
 const opened=Object.values(state.hints).reduce((a,b)=>a+b,0);
 $('session-detail').textContent=server.mode==='authenticated'
  ?`Đang mở ${opened} gợi ý. Phiên máy chủ lưu theo tài khoản chủ dự án; chỉ xác nhận lưu sau khi nhận receipt. Mở gợi ý không bị trừ điểm hoặc phần thưởng.`
  :`Đang mở ${opened} gợi ý. Nhật ký giữ tối đa ${J.LIMIT} sự kiện trên trình duyệt này; chưa đồng bộ. ${journal.truncated?'Lịch sử cũ đã được rút gọn. ':''}Mở gợi ý không bị trừ điểm hoặc phần thưởng.`;
 renderSyncStatus();
}
function render(){renderNav();renderMap();renderStep();}
function next(){const g=graph(),k=g.step_ids.find(k=>!completed.has(k)&&ready(by[k]));if(k){selectStep(k,true);return;}const i=data.graphs.indexOf(g);selectItem(data.graphs[(i+1)%data.graphs.length].item_id);$('practice').focus();}

function isOpCurrent(opScope,opGen){
 return server.mode==='authenticated'&&Boolean(opScope)&&server.accountScope===opScope&&server.generation===opGen;
}

function transitionToNonAuthMode(nextMode,forbiddenScope=null,keepGen=null){
 if(server.mode==='authenticated'&&server.accountScope){
  saveServerScopeState(server.accountScope);
 }
 if(server.mode==='authenticated'){
  staleFormSnapshot=safeReadAnswerJson();
 }
 if(keepGen===null){
  server.generation+=1;
 }
 server.mode=nextMode;
 server.accountScope=nextMode==='forbidden'?(forbiddenScope||null):null;
 server.sessions={};
 server.savedRevisions={};
 server.queue=[];
 server.conflict=null;
 server.syncError=null;
 server.lastSavedRevision=null;
 if(anonDomain){
  state=anonDomain.state;
  journal=anonDomain.journal;
 }
 completed=E.replay(data,state.answers);
 render();
}

function activateAccountScope(scope,keepGen=null){
 if(server.mode==='authenticated'&&server.accountScope){
  saveServerScopeState(server.accountScope);
 }
 staleFormSnapshot=safeReadAnswerJson();
 if(keepGen===null){
  server.generation+=1;
 }
 const prevItemId=state&&state.itemId&&data.graphs.some(g=>g.item_id===state.itemId)?state.itemId:data.graphs[0].item_id;
 server.mode='authenticated';
 server.accountScope=scope;
 server.savedRevisions={};
 server.conflict=null;
 server.syncError=null;
 server.lastSavedRevision=null;
 const dom=getOrCreateAccountDomain(scope);
 dom.state.itemId=prevItemId;
 state=dom.state;
 journal=dom.journal;
 loadServerScopeState(scope);
 applyServerStateToView();
 const g=graph();
 state.stepId=g.step_ids.find(k=>!completed.has(k)&&ready(by[k]))||g.step_ids[0];
 render();
}

function verifyResponseScopeAndGen(res,opScope,opGen){
 if(!isOpCurrent(opScope,opGen))return false;
 const respScope=res&&res.headers&&typeof res.headers.get==='function'?res.headers.get('x-yd-account-scope'):null;
 if(res.status===401){
  transitionToNonAuthMode('anonymous',null);
  return false;
 }
 if(res.status===403){
  transitionToNonAuthMode('forbidden',respScope||null);
  return false;
 }
 if(respScope&&respScope!==opScope){
  activateAccountScope(respScope);
  return false;
 }
 return isOpCurrent(opScope,opGen);
}

function applyServerStateToView(preserveStepDraftId=null,preservedDraftValue=undefined){
 if(server.mode!=='authenticated'||!server.accountScope)return;
 const activeScope=server.accountScope;
 const nextAnswers={},nextDrafts={},nextHints={};
 for(const g of data.graphs){
  const sess=server.sessions[g.item_id];
  if(!sess||!sess.state||(sess.account_scope&&sess.account_scope!==activeScope))continue;
  if(sess.state.answers&&typeof sess.state.answers==='object'){
   for(const [k,v] of Object.entries(sess.state.answers)){
    nextAnswers[k]=v;
    nextDrafts[k]=v;
   }
  }
  if(sess.state.hints&&typeof sess.state.hints==='object'){
   for(const [k,v] of Object.entries(sess.state.hints))nextHints[k]=v;
  }
 }
 state.answers=nextAnswers;
 state.drafts=nextDrafts;
 state.hints=nextHints;
 if(preserveStepDraftId!==null&&preservedDraftValue!==undefined){
  state.drafts[preserveStepDraftId]=preservedDraftValue;
 }
 completed=E.replay(data,state.answers);
}

async function ensureItemSession(itemId,expectedScope=server.accountScope,expectedGen=server.generation){
 if(!isOpCurrent(expectedScope,expectedGen))return null;
 const existing=server.sessions[itemId];
 if(existing&&existing.session_id&&(!existing.account_scope||existing.account_scope===expectedScope)){
  const res=await fetch(`/api/practice/sessions/${encodeURIComponent(existing.session_id)}`,{method:'GET',credentials:'same-origin',headers:{'Accept':'application/json'}});
  if(!verifyResponseScopeAndGen(res,expectedScope,expectedGen))return null;
  if(res.ok){
   const resumed=await res.json();
   if(!isOpCurrent(expectedScope,expectedGen))return null;
   const latest=server.sessions[itemId];
   if(latest&&latest.session_id===resumed.session_id&&(!latest.account_scope||latest.account_scope===expectedScope)&&Number.isInteger(latest.revision)&&Number.isInteger(resumed.revision)&&latest.revision>resumed.revision){
    return latest;
   }
   resumed.item_id=resumed.item_id||itemId;
   resumed.account_scope=expectedScope;
   server.sessions[itemId]=resumed;
   saveServerScopeState(expectedScope);
   return resumed;
  }
 }
 if(!isOpCurrent(expectedScope,expectedGen))return null;
 const createEventId=`create_${expectedScope}_${itemId}`;
 const createRes=await fetch('/api/practice/sessions',{
  method:'POST',
  credentials:'same-origin',
  headers:{'Content-Type':'application/json','Accept':'application/json'},
  body:JSON.stringify({
   client_event_id:createEventId,
   package_id:data.package_id,
   version:data.version,
   sha256:J.HASH,
   item_id:itemId
  })
 });
 if(!verifyResponseScopeAndGen(createRes,expectedScope,expectedGen))return null;
 if(!createRes.ok)throw Error('Không khởi tạo được phiên luyện tập trên máy chủ.');
 const created=await createRes.json();
 if(!isOpCurrent(expectedScope,expectedGen))return null;
 const resumeRes=await fetch(`/api/practice/sessions/${encodeURIComponent(created.session_id)}`,{method:'GET',credentials:'same-origin',headers:{'Accept':'application/json'}});
 if(!verifyResponseScopeAndGen(resumeRes,expectedScope,expectedGen))return null;
 if(resumeRes.ok){
  const resumed=await resumeRes.json();
  if(!isOpCurrent(expectedScope,expectedGen))return null;
  const latest=server.sessions[itemId];
  if(latest&&latest.session_id===resumed.session_id&&(!latest.account_scope||latest.account_scope===expectedScope)&&Number.isInteger(latest.revision)&&Number.isInteger(resumed.revision)&&latest.revision>resumed.revision){
   return latest;
  }
  resumed.item_id=resumed.item_id||itemId;
  resumed.account_scope=expectedScope;
  server.sessions[itemId]=resumed;
  saveServerScopeState(expectedScope);
  return resumed;
 }
 if(!isOpCurrent(expectedScope,expectedGen))return null;
 server.sessions[itemId]={
  session_id:created.session_id,
  item_id:itemId,
  account_scope:expectedScope,
  revision:created.revision||0,
  cycle_id:created.cycle_id||0,
  status:created.status||'ACTIVE',
  state:{answers:{},hints:{},explanations:{},attemptIds:{},supportAtAnswer:{}}
 };
 saveServerScopeState(expectedScope);
 return server.sessions[itemId];
}

async function flushServerQueue(){
 if(server.mode!=='authenticated'||!server.accountScope||server.conflict)return;
 const opScope=server.accountScope,opGen=server.generation;
 if(server.flushing&&activeFlushGen===opGen)return;
 activeFlushGen=opGen;
 server.flushing=true;
 saveServerScopeState(opScope);
 renderSyncStatus();
 try{
  while(server.queue.length>0&&!server.conflict&&isOpCurrent(opScope,opGen)){
   const ev=server.queue[0];
   if(!ev||ev.account_scope!==opScope){
    if(ev&&ev.account_scope&&ev.account_scope!==opScope){
     preserveForeignQueueEvent(ev);
    }
    server.queue.shift();
    saveServerScopeState(opScope);
    continue;
   }
   let sess=server.sessions[ev.item_id];
   if(sess&&sess.account_scope&&sess.account_scope!==opScope){
    sess=null;
   }
   if(!sess||!sess.session_id){
    sess=await ensureItemSession(ev.item_id,opScope,opGen);
   }
   if(!isOpCurrent(opScope,opGen)||!sess||!sess.session_id||(sess.account_scope&&sess.account_scope!==opScope)||ev.account_scope!==opScope){
    break;
   }
   const targetSessionId=ev.session_id||sess.session_id;
   const payload={
    client_event_id:ev.client_event_id,
    expected_revision:ev.expected_revision,
    type:ev.type,
    step_id:ev.step_id
   };
   if(ev.type==='ANSWER_SUBMITTED')payload.answer=ev.answer;
   const res=await fetch(`/api/practice/sessions/${encodeURIComponent(targetSessionId)}/events`,{
    method:'POST',
    credentials:'same-origin',
    headers:{'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify(payload)
   });
   if(!verifyResponseScopeAndGen(res,opScope,opGen))break;
   ev.session_id=targetSessionId;
   if(res.status===200){
    const receipt=await res.json();
    if(!isOpCurrent(opScope,opGen))break;
    if(!receipt||receipt.session_id!==targetSessionId||!Number.isInteger(receipt.revision)){
     throw Error('Phản hồi máy chủ thiếu receipt hợp lệ.');
    }
    const currentItemSess=server.sessions[ev.item_id];
    if(!currentItemSess||currentItemSess.session_id!==targetSessionId||(currentItemSess.account_scope&&currentItemSess.account_scope!==opScope)){
     break;
    }
    const isStaleReceipt=Number.isInteger(currentItemSess.revision)&&receipt.revision<currentItemSess.revision;
    if(!isStaleReceipt){
     currentItemSess.revision=receipt.revision;
     currentItemSess.cycle_id=receipt.cycle_id;
     currentItemSess.item_id=ev.item_id;
     currentItemSess.account_scope=opScope;
     currentItemSess.state=currentItemSess.state||{answers:{},hints:{},explanations:{},attemptIds:{},supportAtAnswer:{}};
     if(ev.type==='ANSWER_SUBMITTED'){
      currentItemSess.state.answers[ev.step_id]=ev.answer;
      currentItemSess.state.attemptIds[ev.step_id]=receipt.event_id;
      currentItemSess.state.supportAtAnswer[ev.step_id]=receipt.support&&(receipt.support.hint_level||receipt.support.explanation_opened)?'RECORDED_SUPPORT':'NO_RECORDED_SUPPORT';
     }else if(ev.type==='HINT_OPENED'){
      currentItemSess.state.hints[ev.step_id]=receipt.support?receipt.support.hint_level:((currentItemSess.state.hints[ev.step_id]||0)+1);
     }else if(ev.type==='EXPLANATION_OPENED'){
      currentItemSess.state.explanations[ev.step_id]=true;
     }else if(ev.type==='ITEM_RESET'){
      currentItemSess.state={answers:{},hints:{},explanations:{},attemptIds:{},supportAtAnswer:{}};
     }
     server.savedRevisions[ev.item_id]=receipt.revision;
    }
    if(server.queue[0]===ev){
     server.queue.shift();
    }
    syncActiveSavedRevision();
    server.syncError=null;
    saveServerScopeState(opScope);
   }else if(res.status===409){
    let errBody=null;
    try{errBody=await res.json();}catch{}
    if(!isOpCurrent(opScope,opGen))break;
    const code=errBody?.error||'REVISION_CONFLICT';
    const targetStepId=ev.step_id||state.stepId;
    const preservedDraft=Object.hasOwn(state.drafts,targetStepId)?state.drafts[targetStepId]:(ev.type==='ANSWER_SUBMITTED'?ev.answer:readAnswer());
    const resumeRes=await fetch(`/api/practice/sessions/${encodeURIComponent(targetSessionId)}`,{method:'GET',credentials:'same-origin',headers:{'Accept':'application/json'}});
    if(!verifyResponseScopeAndGen(resumeRes,opScope,opGen))break;
    let resumed=sess;
    if(resumeRes.ok){
     const parsedResumed=await resumeRes.json();
     if(!isOpCurrent(opScope,opGen))break;
     parsedResumed.item_id=parsedResumed.item_id||ev.item_id;
     parsedResumed.account_scope=opScope;
     resumed=parsedResumed;
     server.sessions[ev.item_id]=resumed;
     saveServerScopeState(opScope);
    }
    if(!isOpCurrent(opScope,opGen))break;
    applyServerStateToView(targetStepId,preservedDraft);
    server.conflict={
     code,
     accountScope:opScope,
     event:ev,
     serverSession:resumed,
     stepId:targetStepId,
     preservedDraft,
     message:`Xung đột dữ liệu máy chủ (${code}): trạng thái máy chủ hiện ở phiên bản #${resumed.revision}. Câu trả lời bạn đang nhập vẫn được giữ nguyên.`
    };
    render();
    break;
   }else{
    server.syncError='Chưa lưu được sự kiện lên máy chủ.';
    break;
   }
  }
 }catch(err){
  if(isOpCurrent(opScope,opGen)){
   server.syncError=err?.message||'Lỗi kết nối máy chủ.';
  }
 }finally{
  if(activeFlushGen===opGen){
   activeFlushGen=0;
   server.flushing=false;
   renderSyncStatus();
  }
 }
}

async function resolveConflictResubmit(){
 if(!server.conflict||server.mode!=='authenticated'||!server.accountScope)return;
 const {event:failedEv,stepId,preservedDraft,accountScope:conflictScope}=server.conflict;
 if((conflictScope&&conflictScope!==server.accountScope)||(failedEv&&failedEv.account_scope!==server.accountScope))return;
 const activeScope=server.accountScope;
 const itemId=failedEv.item_id;
 server.queue=server.queue.filter(q=>!(q.account_scope===activeScope&&q.item_id===itemId));
 server.conflict=null;
 saveServerScopeState(activeScope);
 if(stepId&&by[stepId]){
  state.itemId=by[stepId].item_id;
  state.stepId=stepId;
  state.drafts[stepId]=preservedDraft;
 }
 render();
 const s=current();
 if(failedEv.type==='ANSWER_SUBMITTED'&&ready(s)){
  const answer=preservedDraft!==undefined?preservedDraft:readAnswer();
  const result=E.evaluate(data,s.step_id,answer,[...completed]);
  state.answers[s.step_id]=answer;
  state.drafts[s.step_id]=answer;
  completed=E.replay(data,state.answers);
  enqueueServerEvent('ANSWER_SUBMITTED',s.step_id,{answer,result_status:result.status,hint_level:state.hints[s.step_id]||0});
  render();
  showFeedback(result);
 }else{
  enqueueServerEvent(failedEv.type,failedEv.step_id,{answer:preservedDraft});
  render();
 }
}

function resolveConflictUseServer(){
 if(!server.conflict||server.mode!=='authenticated'||!server.accountScope)return;
 const {event:failedEv,accountScope:conflictScope}=server.conflict;
 if((conflictScope&&conflictScope!==server.accountScope)||(failedEv&&failedEv.account_scope!==server.accountScope))return;
 const activeScope=server.accountScope;
 const itemId=failedEv.item_id;
 server.queue=server.queue.filter(q=>!(q.account_scope===activeScope&&q.item_id===itemId));
 delete server.savedRevisions[itemId];
 server.conflict=null;
 saveServerScopeState(activeScope);
 applyServerStateToView();
 render();
}

async function initServerSync(){
 if(server.mode==='authenticated'&&server.accountScope){
  saveServerScopeState(server.accountScope);
 }
 server.generation+=1;
 const opGen=server.generation;
 try{
  const res=await fetch('/api/me/progress',{method:'GET',credentials:'same-origin',headers:{'Accept':'application/json'}});
  if(server.generation!==opGen)return;
  const scope=res.headers&&typeof res.headers.get==='function'?res.headers.get('x-yd-account-scope'):null;
  if(res.status===401){
   transitionToNonAuthMode('anonymous',null,opGen);
   return;
  }
  if(res.status===403){
   transitionToNonAuthMode('forbidden',scope||null,opGen);
   return;
  }
  if(!res.ok||!scope){
   transitionToNonAuthMode('local',null,opGen);
   return;
  }
  const progress=await res.json();
  if(server.generation!==opGen)return;
  activateAccountScope(scope,opGen);
  const opScope=scope;
  const itemsToHydrate=new Set([state.itemId]);
  if(Array.isArray(progress.sessions)){
   for(const sessSummary of progress.sessions){
    if(sessSummary&&sessSummary.item_id&&sessSummary.session_id){
     server.sessions[sessSummary.item_id]=server.sessions[sessSummary.item_id]||{
      session_id:sessSummary.session_id,
      item_id:sessSummary.item_id,
      account_scope:opScope,
      revision:sessSummary.revision||0
     };
     itemsToHydrate.add(sessSummary.item_id);
    }
   }
  }
  for(const k of Object.keys(server.sessions))itemsToHydrate.add(k);
  for(const itemId of itemsToHydrate){
   if(!isOpCurrent(opScope,opGen))return;
   if(data.graphs.some(g=>g.item_id===itemId)){
    const hydrated=await ensureItemSession(itemId,opScope,opGen);
    if(!isOpCurrent(opScope,opGen)||!hydrated)return;
   }
  }
  if(!isOpCurrent(opScope,opGen))return;
  syncActiveSavedRevision();
  applyServerStateToView();
  const g=graph();
  state.stepId=g.step_ids.find(k=>!completed.has(k)&&ready(by[k]))||g.step_ids[0];
  render();
  if(server.queue.length>0&&isOpCurrent(opScope,opGen)){
   await flushServerQueue();
  }
 }catch{
  if(server.generation===opGen){
   transitionToNonAuthMode('local',null,opGen);
  }
 }
}

async function init(){
 try{
  const r=await fetch(`data/radical-steps-v0.1.json?v=${revision}`);
  if(!r.ok)throw Error('Không tải được dữ liệu bài học.');
  data=await r.json();
  E.validate(data);
  by=E.index?E.index(data):Object.fromEntries(data.steps.map(s=>[s.step_id,s]));
  storageKey='yd-rad-practice:'+revision;
  let stored=null;
  try{
   const raw=localStorage.getItem(storageKey);
   if(raw&&raw.length<1500000)stored=JSON.parse(raw);
  }catch{storageAvailable=false;}
  hadLocalProgressAtBoot=Boolean(stored&&((stored.answers&&Object.keys(stored.answers).length>0)||(stored.journal&&Array.isArray(stored.journal.events)&&stored.journal.events.length>0)));
  state=E.restore(data,stored);
  journal=J.restore(data,stored?.journal,crypto.randomUUID(),!!stored);
  anonDomain={state,journal};
  $('explanation').ontoggle=recordExplanation;
  const requested=new URLSearchParams(location.search).get('item');
  if(requested&&data.graphs.some(g=>g.item_id===requested)){
   state.itemId=requested;
   state.stepId=data.graphs.find(g=>g.item_id===requested).step_ids[0];
  }
  completed=E.replay(data,state.answers);
  render();
  save();
  $('answer-form').oninput=()=>{
   const ans=readAnswer();
   const ansJson=JSON.stringify(ans);
   if(staleFormSnapshot!==null){
    const currentExpected=Object.hasOwn(state.drafts,state.stepId)?state.drafts[state.stepId]:state.answers[state.stepId];
    const expectedJson=JSON.stringify(currentExpected??'');
    const snap=staleFormSnapshot;
    staleFormSnapshot=null;
    if(ansJson===snap&&ansJson!==expectedJson){
     save();
     return;
    }
   }
   state.drafts[state.stepId]=ans;
   save();
  };
  $('answer-form').onsubmit=e=>{
   e.preventDefault();
   staleFormSnapshot=null;
   const s=current();if(!ready(s))return;
   const answer=readAnswer(),kind=s.interaction.answer_type;
   const empty=answer==null||answer===''||(['linear','quadratic_pair'].includes(kind)&&(!answer.constant||!answer.coefficient))||(['domain','domain_expression'].includes(kind)&&(!answer.lower||(kind==='domain_expression'&&!answer.expression)));
   if(empty){showFeedback({status:'TRY_AGAIN',feedback:'Hãy điền hoặc chọn câu trả lời trước khi kiểm tra.'});return;}
   const result=E.evaluate(data,s.step_id,answer,[...completed]);
   record('ANSWER_SUBMITTED',s.step_id,{answer,result_status:result.status,hint_level:state.hints[s.step_id]||0});
   state.answers[s.step_id]=answer;state.drafts[s.step_id]=answer;
   completed=E.replay(data,state.answers);
   save();renderNav();renderMap();renderStep();showFeedback(result);
  };
  $('hint-button').onclick=()=>{
   const s=current();if(!ready(s))return;
   if((state.hints[s.step_id]||0)>=3)return;
   state.hints[s.step_id]=Math.min(3,(state.hints[s.step_id]||0)+1);
   record('HINT_OPENED',s.step_id,{hint_level:state.hints[s.step_id]});
   save();renderStep();
  };
  $('map-mode').onclick=()=>{mode='map';renderMap();};
  $('list-mode').onclick=()=>{mode='list';renderMap();};
  $('next-step').onclick=next;
  $('reset-open').onclick=()=>$('reset-dialog').showModal();
  $('reset-cancel').onclick=()=>$('reset-dialog').close();
  $('reset-confirm').onclick=()=>{
   const g=graph();
   record('ITEM_RESET',null);
   for(const k of g.step_ids){delete state.answers[k];delete state.drafts[k];delete state.hints[k];}
   state.stepId=g.step_ids[0];
   completed=E.replay(data,state.answers);
   save();render();$('reset-dialog').close();
  };
  $('sync-retry').onclick=()=>{server.syncError=null;void flushServerQueue();};
  $('conflict-resubmit').onclick=()=>{void resolveConflictResubmit();};
  $('conflict-use-server').onclick=()=>{resolveConflictUseServer();};
  window.addEventListener('pagehide',save);
  server.ready=initServerSync();
  window.RadicalServerSync={
   server,
   getState:()=>state,
   getLocalJournal:()=>journal,
   selectItem,
   flushServerQueue,
   initServerSync,
   resolveConflictResubmit,
   resolveConflictUseServer
  };
 }catch(error){
  $('load-error').hidden=false;
  $('load-error-message').textContent=error.message||'Vui lòng thử lại.';
  $('answer-form').hidden=true;
  $('reset-open').disabled=true;
  $('hint-button').disabled=true;
 }
}
$('retry-load').onclick=()=>location.reload();init();
})();
