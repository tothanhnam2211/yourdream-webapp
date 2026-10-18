(function(){'use strict';
const $=id=>document.getElementById(id),E=window.RadicalEngine,L=window.RadicalProfiles,J=window.RadicalPreviewJournal,M=window.YourdreamMath;
const validKey=k=>typeof k==='string'&&/^[A-Za-z0-9:._-]{1,100}$/.test(k)&&!['__proto__','constructor','prototype'].includes(k);
let profiles=[],data=null,by=Object.create(null),state=null,journal=null,key='',complete=new Set(),mode=window.innerWidth<800?'list':'map',generation=0,storageOK=true,activeProfileId='';
const safe=s=>M.escape(s),math=s=>M.mixed(s,window.katex),graph=()=>data?data.graphs.find(g=>g.item_id===state?.itemId):null,step=()=>state?by[state.stepId]:null;
const ready=s=>!!s&&s.requires.every(k=>complete.has(k)),status=s=>complete.has(s.step_id)?'Đã làm đúng':ready(s)?'Sẵn sàng':'Cần bước trước';
function showStorage(){ $('storage-status').textContent=storageOK?'Đã lưu thử trên trình duyệt này · chưa lưu máy chủ.':'Chưa lưu được trên trình duyệt; trạng thái chỉ giữ khi trang còn mở.'; }
function disableWorkspace(){
 data=null;by=Object.create(null);state=null;journal=null;key='';complete=new Set();
 $('workspace').hidden=true;$('total-progress').textContent='';$('exercise-list').innerHTML='';$('answer-fields').innerHTML='';
 $('check-answer').disabled=true;$('hint-button').disabled=true;$('feedback').hidden=true;
 if($('subquestion-tabs')){$('subquestion-tabs').hidden=true;$('subquestion-tabs').innerHTML='';}
 if($('diagnosis-summary'))$('diagnosis-summary').textContent='';
 if($('diagnosis-list'))$('diagnosis-list').innerHTML='';
}
function save(){if(!data||!state||!journal)return;try{localStorage.setItem(key,JSON.stringify({...state,version:data.version,content_sha256:data.content_sha256,journal}));storageOK=true;}catch{storageOK=false;}showStorage();}
function record(type,id,details={}){if(!data||!journal||!state)return;J.append(data,journal,type,state.itemId,id,details);}
function subLabel(k){return k==='main'?'Toàn bài':k==='shared_domain'?'ĐKXĐ chung':`Ý ${k}`;}
function drawSubquestions(g){
 const box=$('subquestion-tabs');if(!box)return;
 const rawGroups=g.subquestion_step_groups?Object.entries(g.subquestion_step_groups):[];
 const groups=rawGroups.sort(([a],[b])=>(a==='shared_domain'?-1:b==='shared_domain'?1:a.localeCompare(b,'vi',{numeric:true})));
 if(groups.length<=1){box.hidden=true;box.innerHTML='';return;}
 box.hidden=false;
 box.innerHTML=groups.map(([gk,ids])=>{
  const done=ids.filter(id=>complete.has(id)).length,active=ids.includes(state.stepId);
  return `<button type="button" data-sub="${safe(gk)}" aria-pressed="${active}">${safe(subLabel(gk))} (${done}/${ids.length})</button>`;
 }).join('');
 box.querySelectorAll('[data-sub]').forEach(b=>b.onclick=()=>{
  const gk=b.dataset.sub,ids=validKey(gk)&&g.subquestion_step_groups?.[gk];
  if(!Array.isArray(ids)||!ids.length)return;
  const target=ids.find(k=>!complete.has(k)&&ready(by[k]))||ids[0];
  selectStep(target);
 });
}
function drawDiagnosis(){
 const sumEl=$('diagnosis-summary'),listEl=$('diagnosis-list');if(!sumEl||!listEl||!data||!journal||typeof J.diagnoseSkills!=='function')return;
 const diag=J.diagnoseSkills(data,journal,complete);
 sumEl.textContent=`Theo dõi ${diag.skills.length} kỹ năng trên ${data.graphs.length} bài (${data.steps.length} bước) [policy_version: ${diag.policy_version}]: ${diag.needs_retry_count} kỹ năng cần sửa lỗi ngay · ${diag.needs_reinforcement_count} kỹ năng cần củng cố không gợi ý · ${diag.insufficient_evidence_count} chưa đủ bằng chứng · ${diag.not_started_count} chưa học · ${diag.criteria_met_count} đạt tiêu chí trong phiên.`;
 listEl.innerHTML=diag.skills.map(sk=>{
  const cls=sk.status==='NEEDS_RETRY'?'needs-retry':sk.status==='NEEDS_REINFORCEMENT'?'needs-reinforcement':sk.status==='SOLID_IN_SESSION'?'solid':'';
  const badge=sk.batch01_label_vi||(sk.status==='NEEDS_RETRY'?'Đang luyện · Cần sửa lỗi':sk.status==='NEEDS_REINFORCEMENT'?'Đang luyện · Đúng khi có gợi ý / từng sai':sk.status==='SOLID_IN_SESSION'?'Đã đạt tiêu chí trong phiên (tự giải sạch)':sk.status==='IN_PROGRESS'?'Chưa đủ bằng chứng':'Chưa học');
  const codeTxt=sk.diagnosis_codes.length?` · Mã chẩn đoán: ${safe(sk.diagnosis_codes.join(', '))}`:'';
  const t=sk.recommended_target;
  const actions=t?`<div class="skill-actions"><button type="button" data-retry-item="${safe(t.item_id)}" data-retry-step="${safe(t.step_id)}">Mở bước cần luyện</button><button type="button" data-reset-skill-item="${safe(t.item_id)}" data-reset-skill-step="${safe(t.step_id)}">Làm lại chu kỳ bài này</button></div>`:'';
  return `<div class="skill-card ${cls}" data-skill-id="${safe(sk.skill_id)}" data-batch01-state="${safe(sk.batch01_state||'')}"><div class="skill-meta"><strong>${safe(sk.title)}</strong><small>${safe(badge)} [${safe(sk.batch01_state||'NOT_STARTED')}] · Đạt ${sk.completed_steps}/${sk.total_steps} bước (tự giải sạch: ${sk.clean_steps})${codeTxt}</small></div>${actions}</div>`;
 }).join('');
 listEl.querySelectorAll('[data-retry-step]').forEach(b=>b.onclick=()=>{retrySkillStep(b.dataset.retryItem,b.dataset.retryStep,false);});
 listEl.querySelectorAll('[data-reset-skill-step]').forEach(b=>b.onclick=()=>{retrySkillStep(b.dataset.resetSkillItem,b.dataset.resetSkillStep,true);});
}
function retrySkillStep(itemId,stepId,resetCycle=false){
 if(!data||!validKey(itemId)||!validKey(stepId))return false;
 const g=data.graphs.find(x=>x.item_id===itemId);if(!g||!g.step_ids.includes(stepId))return false;
 state.itemId=itemId;
 if(resetCycle){
  record('ITEM_RESET',null);
  for(const k of g.step_ids){delete state.answers[k];delete state.drafts[k];delete state.hints[k];}
  complete=E.replay(data,state.answers);
 }
 const target=ready(by[stepId])?stepId:(g.step_ids.find(k=>!complete.has(k)&&ready(by[k]))||g.step_ids[0]);
 state.stepId=target;save();draw();$('practice').focus();return true;
}
function draw(){
 if(!data||!state)return;
 const doneGraphs=data.graphs.filter(g=>L.complete(g,complete)).length;
 const isFixture=activeProfileId==='midterm1-fixture',isBatch02A=activeProfileId==='midterm1-hanoi-01';
 const fixtureTag=isFixture?' · TEST FIXTURE (không phải đề thi giữa kỳ)':isBatch02A?' · ĐỀ LUYỆN TẬP TỰ BIÊN SOẠN (Batch 02A DRAFT)':' · DRAFT';
 if(typeof document!=='undefined'&&'title' in document)document.title=isFixture?'YOURDREAM · Học liệu thử nghiệm (TEST FIXTURE · 5 bài / 26 bước)':isBatch02A?'YOURDREAM · Đề luyện tập Giữa kỳ I Toán 9 Hà Nội (Batch 02A · 5 bài / 24 bước)':'YOURDREAM · Bản xem trước học liệu (DRAFT)';
 if($('profile-select')&&activeProfileId)$('profile-select').value=activeProfileId;
 if($('fixture-badge'))$('fixture-badge').textContent=isFixture?'DRAFT · TEST FIXTURE (5 bài / 26 bước)':isBatch02A?'DRAFT · ĐỀ LUYỆN TẬP TỰ BIÊN SOẠN (5 bài / 24 bước)':'DRAFT · Bản xem trước';
 if($('fixture-notice'))$('fixture-notice').innerHTML=isFixture?'<strong>TEST FIXTURE (Dữ liệu thử nghiệm kỹ thuật — không phải đề thi giữa kỳ chính thức):</strong> Bộ TEST FIXTURE 5 bài / 26 bước ghép từ các bước giải đã kiểm định trong <code>EXAM-GRAPH-02 v0.2</code>. Đáp án có trong dữ liệu; tiến trình thử chỉ lưu trên trình duyệt, chưa đồng bộ máy chủ.':isBatch02A?'<strong>ĐỀ LUYỆN TẬP GIỮA HỌC KỲ I TOÁN 9 HÀ NỘI — ĐỀ SỐ 01 (Tự biên soạn mới 100% · DRAFT):</strong> Biên soạn theo SGK Toán 9 Tập 1 (Kết nối tri thức với cuộc sống) và Ma trận Kỹ năng Batch 01 (5 bài · 10,0 điểm · 24 bước giải); không gắn nhãn đề gốc của bất kỳ trường học nào. Đáp án có trong dữ liệu; tiến trình thử chỉ lưu trên trình duyệt, chưa đồng bộ máy chủ.':'<strong>Bản xem trước học liệu (DRAFT):</strong> Đáp án có trong dữ liệu; tiến trình thử chỉ lưu trên trình duyệt, chưa đồng bộ máy chủ.';
 $('total-progress').textContent=`${complete.size} / ${data.steps.length} bước đã làm đúng · ${doneGraphs} / ${data.graphs.length} bài hoàn thành${fixtureTag}`;
 $('exercise-list').innerHTML=data.graphs.map((g,i)=>`<button type="button" data-item="${safe(g.item_id)}" aria-current="${g.item_id===state.itemId}"><strong>Bài ${i+1}. ${safe(g.title)}</strong><small>${g.step_ids.filter(k=>complete.has(k)).length}/${g.step_ids.length} bước${L.complete(g,complete)?' · Hoàn thành':''}</small></button>`).join('');
 $('exercise-list').querySelectorAll('[data-item]').forEach(b=>b.onclick=()=>selectItem(b.dataset.item));
 const g=graph();$('exercise-title').textContent=`Bài ${data.graphs.indexOf(g)+1} / ${data.graphs.length}${isFixture?' (TEST FIXTURE)':isBatch02A?' (Đề luyện tập tự biên soạn · DRAFT)':''}`;$('exercise-prompt').innerHTML=math(g.prompt);$('exercise-domain').innerHTML=math(g.subtitle);
 drawSubquestions(g);drawMap();drawStep();drawDiagnosis();
}
function selectItem(id){if(!data||!validKey(id))return;const g=data.graphs.find(g=>g.item_id===id);if(!g)return;state.itemId=id;state.stepId=g.step_ids.find(k=>!complete.has(k)&&ready(by[k]))||g.step_ids[0];save();draw();}
function selectStep(id){if(!data||!state||!validKey(id)||!Object.hasOwn(by,id)||by[id].item_id!==state.itemId)return;state.stepId=id;save();drawSubquestions(graph());drawMap();drawStep();$('practice').focus();}
function drawMap(){
 const g=graph(),view=L.layout(g,by),p=view.points;
 $('map-mode').setAttribute('aria-pressed',String(mode==='map'));$('list-mode').setAttribute('aria-pressed',String(mode==='list'));$('graph-scroll').hidden=mode!=='map';$('step-list').hidden=mode!=='list';
 $('step-map').setAttribute('viewBox',`0 0 ${view.width} ${view.height}`);$('step-map').setAttribute('width',String(view.width));$('step-map').setAttribute('height',String(view.height));
 const edges=g.edges.map(e=>{const a=p[e.from],b=p[e.to],sx=a[0]+123,ex=b[0]-123,mid=(sx+ex)/2;return `<path class="edge" d="M${sx} ${a[1]} C${mid} ${a[1]},${mid} ${b[1]},${ex} ${b[1]}" marker-end="url(#preview-arrow)"/>`;}).join('');
 $('step-map').innerHTML='<defs><marker id="preview-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="#98ae8d"/></marker></defs>'+edges+g.step_ids.map((id,i)=>{const s=by[id],xy=p[id],cls=`${complete.has(id)?'is-correct ':''}${!ready(s)?'is-locked ':''}${state.stepId===id?'is-selected':''}`;return `<g class="node ${cls}" transform="translate(${xy[0]},${xy[1]})" role="button" tabindex="0" data-step="${safe(id)}" aria-pressed="${state.stepId===id}" aria-label="${safe(s.title)}. ${safe(status(s))}"><title>${safe(s.title)}</title><rect x="-120" y="-32" width="240" height="64" rx="10"/><text x="-107" y="-2">${i+1}. ${safe(s.title.length>27?s.title.slice(0,25)+'…':s.title)}</text><text class="node-state" x="-107" y="18">${status(s)}</text></g>`;}).join('');
 $('step-list').innerHTML=g.step_ids.map((id,i)=>`<button type="button" data-step="${safe(id)}" aria-pressed="${id===state.stepId}"><b>${i+1}</b><span>${safe(by[id].title)}</span><small>${status(by[id])}</small></button>`).join('');
 for(const box of [$('step-map'),$('step-list')])box.querySelectorAll('[data-step]').forEach(b=>{b.onclick=()=>selectStep(b.dataset.step);b.onkeydown=e=>{if(b.tagName.toLowerCase()==='g'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();selectStep(b.dataset.step);}};});
}
function field(name,label,value=''){return `<label>${safe(label)}<input type="text" name="${name}" maxlength="180" autocomplete="off" value="${safe(value)}"></label>`;}
function fields(s){
 const a=s.interaction,old=Object.hasOwn(state.drafts,s.step_id)?state.drafts[s.step_id]:state.answers[s.step_id],v=old&&typeof old==='object'?old:{};
 if(a.answer_type==='rational')return field('value','Giá trị',typeof old==='string'||typeof old==='number'?old:'');
 if(a.answer_type==='choice')return `<fieldset><legend>Chọn một phương án</legend>${Object.entries(a.choices).map(([k,v])=>`<label class="choice"><input type="radio" name="choice" value="${safe(k)}" ${old===k?'checked':''}><span>${math(v)}</span></label>`).join('')}</fieldset>`;
 if(['linear','quadratic_pair'].includes(a.answer_type))return field('constant','Hạng tử a',v.constant??'')+field('coefficient',a.answer_type==='linear'?'Hệ số b của x':'Hệ số b của √3',v.coefficient??'');
 return (a.answer_type==='domain_expression'?`<label>Biểu thức<select name="expression"><option value="">Chọn kết quả</option>${Object.entries(a.expression_choices||{sqrt_x_plus_1:'√x + 1',sqrt_x_minus_1:'√x − 1'}).map(([k,v])=>`<option value="${safe(k)}" ${old?.expression===k?'selected':''}>${safe(v)}</option>`).join('')}</select></label>`:'')+field('lower','Cận dưới',v.lower??'')+`<label><input type="checkbox" name="inclusive" ${v.lower_inclusive===true?'checked':''}>Lấy cận dưới</label>`+field('exclusions','Giá trị loại trừ (ngăn bởi ;)',(v.exclusions||[]).join(';'));
}
function read(){const s=step();if(!s)return null;const a=s.interaction,f=new FormData($('answer-form')),str=k=>String(f.get(k)||'').trim();if(a.answer_type==='rational')return str('value');if(a.answer_type==='choice')return f.get('choice');if(['linear','quadratic_pair'].includes(a.answer_type)){const x={constant:str('constant'),coefficient:str('coefficient')};if(a.answer_type==='quadratic_pair')x.radicand=3;return x;}const x={variable:'x',lower:str('lower'),lower_inclusive:f.get('inclusive')==='on',exclusions:str('exclusions').split(/[;,]/).map(s=>s.trim()).filter(Boolean)};if(a.answer_type==='domain_expression')x.expression=str('expression');return x;}
function feedback(r){const el=$('feedback');el.hidden=!r||r.status==='LOCKED';if(el.hidden)return;el.className=r.status==='CORRECT'?'correct':r.status==='TRY_AGAIN'?'incorrect':'review';el.innerHTML=math(r.feedback||'Chưa kiểm tra được cách viết này.');}
function drawStep(){
 const s=step(),g=graph();if(!s||!g)return;const can=ready(s),count=state.hints[s.step_id]||0;
 $('step-title').textContent=s.title;$('step-state').textContent=status(s);$('step-question').innerHTML=math(s.interaction.prompt);$('locked-note').textContent=can?'':'Cần làm đúng: '+s.requires.filter(k=>!complete.has(k)).map(k=>by[k].title).join(' · ');
 $('answer-fields').innerHTML=fields(s);$('answer-form').querySelectorAll('input,select,button').forEach(e=>e.disabled=!can);$('check-answer').disabled=!can;
 $('hint-button').disabled=!can||count>=3;$('hint-button').textContent=count>=3?'Đã mở đủ 3 gợi ý':`Mở gợi ý ${count+1} / 3`;$('hints').innerHTML=s.hints.slice(0,count).map(h=>`<li>${math(h.text)}</li>`).join('');
 $('explanation').hidden=!(complete.has(s.step_id)||count===3);$('explanation').open=complete.has(s.step_id);$('step-before').innerHTML=M.formula(s.before,window.katex);$('step-after').innerHTML=M.formula(s.after,window.katex);$('step-reason').innerHTML=math(s.justification);
 $('item-progress').textContent=L.complete(g,complete)?`Đã làm đúng ${g.step_ids.length}/${g.step_ids.length} bước. Hãy thử tự giải lại.`:`${g.step_ids.filter(k=>complete.has(k)).length}/${g.step_ids.length} bước đã làm đúng.`;
 const ev=J.evidence(journal,state.itemId,s.step_id);$('attempt-evidence').textContent=`${ev.attempts} lượt kiểm tra trong chu kỳ · ${ev.status}${ev.diagnosis_code?' ('+ev.diagnosis_code+')':''}. Đây là bằng chứng hiện có trong phiên, chưa phải đánh giá thành thạo tuyệt đối.`;
 feedback(Object.hasOwn(state.answers,s.step_id)?L.evaluate(E,data,s.step_id,state.answers[s.step_id],[...complete]):null);
}
async function load(id){
 const gen=++generation;disableWorkspace();$('load-error').hidden=true;
 try{
  if(!validKey(id))throw Error('Bộ học liệu chưa được khai báo.');
  const selected=profiles.find(p=>p.id===id);if(!selected)throw Error('Bộ học liệu chưa được khai báo.');
  if($('profile-select'))$('profile-select').value=id;
  try{if(window.history&&typeof window.history.replaceState==='function'){const params=new URLSearchParams(location.search||'');if(params.get('profile')!==id){params.set('profile',id);const q=params.toString();window.history.replaceState(null,'',(location.pathname||'/graph02-preview.html')+(q?'?'+q:'')+(location.hash||''));}}}catch{}
  const r=await fetch(selected.path,{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('Không tải được học liệu.');const raw=await r.text(),digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(gen!==generation)return;if(digest!==selected.sha256)throw Error('Mã băm học liệu không khớp bản đã khóa.');
  const next=L.load(JSON.parse(raw),selected.profile,E);if(gen!==generation)return;activeProfileId=id;if($('profile-select'))$('profile-select').value=id;
  data=next;data.content_sha256=digest;by=Object.assign(Object.create(null),Object.fromEntries(data.steps.map(s=>[s.step_id,s])));key='yd-eng-gap02-preview:'+id+':'+digest;
  let stored=null;try{const raw=localStorage.getItem(key);if(raw&&raw.length<1500000)stored=JSON.parse(raw);}catch{storageOK=false;}
  if(stored?.content_sha256!==digest)stored=null;state=E.restore(data,stored);journal=J.restore(data,stored?.journal,crypto.randomUUID(),!!stored);complete=E.replay(data,state.answers);$('workspace').hidden=false;save();draw();
 }catch(e){if(gen!==generation)return;disableWorkspace();$('load-error').hidden=false;$('load-error').textContent=e.message||'Không mở được học liệu.';}
}
$('answer-form').onsubmit=e=>{e.preventDefault();if(!data||!state)return;const s=step();if(!ready(s))return;const answer=read();if(answer===null||answer===''){feedback({status:'TRY_AGAIN',feedback:'Hãy nhập hoặc chọn câu trả lời.'});return;}const result=L.evaluate(E,data,s.step_id,answer,[...complete]);state.answers[s.step_id]=answer;state.drafts[s.step_id]=answer;record('ANSWER_SUBMITTED',s.step_id,{answer,result_status:result.status,diagnosis_code:result.diagnosis_code||null,hint_level:state.hints[s.step_id]||0});complete=E.replay(data,state.answers);save();draw();feedback(result);};
$('answer-form').oninput=()=>{if(!data||!state||!validKey(state.stepId))return;state.drafts[state.stepId]=read();save();};
$('hint-button').onclick=()=>{if(!data||!state)return;const s=step();if(!ready(s)||(state.hints[s.step_id]||0)>=3)return;state.hints[s.step_id]=(state.hints[s.step_id]||0)+1;record('HINT_OPENED',s.step_id,{hint_level:state.hints[s.step_id]});save();drawStep();drawDiagnosis();};
$('explanation').ontoggle=()=>{if(!data||!state)return;const s=step();if(!s||!$('explanation').open||$('explanation').hidden)return;const reset=journal.events.findLastIndex(e=>e.item_id===state.itemId&&e.type==='ITEM_RESET');if(!journal.events.slice(reset+1).some(e=>e.step_id===s.step_id&&e.type==='EXPLANATION_OPENED')){record('EXPLANATION_OPENED',s.step_id,{hint_level:state.hints[s.step_id]||0});save();drawDiagnosis();}};
$('reset-item').onclick=()=>{if(!data||!state)return;const g=graph();if(!g)return;record('ITEM_RESET',null);for(const k of g.step_ids){delete state.answers[k];delete state.drafts[k];delete state.hints[k];}state.stepId=g.step_ids[0];complete=E.replay(data,state.answers);save();draw();};
$('map-mode').onclick=()=>{if(!data||!state)return;mode='map';drawMap();};$('list-mode').onclick=()=>{if(!data||!state)return;mode='list';drawMap();};
$('next-step').onclick=()=>{if(!data||!state)return;const g=graph();if(!g)return;const next=g.step_ids.find(k=>!complete.has(k)&&ready(by[k]));if(next)selectStep(next);else selectItem(data.graphs[(data.graphs.indexOf(g)+1)%data.graphs.length].item_id);};
$('profile-select').onchange=()=>load($('profile-select').value);
async function init(){try{const r=await fetch('data/practice-preview-profiles.json',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('Không tải được danh mục.');const meta=await r.json();if(meta.status!=='DRAFT_LOCAL_PREVIEW_ONLY')throw Error('Danh mục không hợp lệ.');profiles=meta.profiles;const allowed=['data/radical-steps-v0.1.json','data/graph02-v1-preview.json','data/graph02-v2-preview.json','data/midterm1-fixture-preview.json','data/midterm1-hanoi-exam01-preview.json'];if(!Array.isArray(profiles)||!profiles.length||profiles.some(p=>!allowed.includes(p.path)||!['legacy-rad01','lesson-contract-v01'].includes(p.profile)||!/^[a-f0-9]{64}$/.test(p.sha256)))throw Error('Đường dẫn profile không được phép.');const requested=new URLSearchParams(location.search).get('profile'),defaultId=(validKey(meta.default_profile)&&profiles.some(p=>p.id===meta.default_profile))?meta.default_profile:(profiles.some(p=>p.id==='midterm1-hanoi-01')?'midterm1-hanoi-01':profiles[0].id),id=profiles.some(p=>p.id===requested)?requested:defaultId;$('profile-select').innerHTML=profiles.map(p=>`<option value="${safe(p.id)}"${p.id===id?' selected':''}>${safe(p.label)}</option>`).join('');$('profile-select').disabled=false;$('profile-select').value=id;await load(id);}catch(e){disableWorkspace();$('load-error').hidden=false;$('load-error').textContent=e.message;}}
window.YourdreamPreview={ready:null,getData:()=>data,getState:()=>state,getJournal:()=>journal,getCompleted:()=>[...complete],getSkillDiagnosis:()=>data&&journal?J.diagnoseSkills(data,journal,complete):null,selectItem,selectStep,retrySkillStep,loadProfile:load};window.YourdreamPreview.ready=init();
})();
