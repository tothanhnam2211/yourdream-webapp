(function(){'use strict';
const $=id=>document.getElementById(id),E=window.RadicalEngine,L=window.RadicalProfiles,J=window.RadicalPreviewJournal,M=window.YourdreamMath,S=window.YourdreamErrorScaffolding,P=window.YourdreamPreview||{};
const N=window.YourdreamNavigation;
const validKey=k=>typeof k==='string'&&/^[A-Za-z0-9:._-]{1,100}$/.test(k)&&!['__proto__','constructor','prototype'].includes(k);
let profiles=[],data=null,by=Object.create(null),state=null,journal=null,key='',complete=new Set(),mode=window.innerWidth<800?'list':'map',examMode='practice',examSubmitted=false,examPaperOpen=true,mobileView='paper',generation=0,storageOK=true,activeProfileId='',paperSheetModule=null;
const safe=s=>M.escape(s),math=s=>M.mixed(s,window.katex),graph=()=>data?data.graphs.find(g=>g.item_id===state?.itemId):null,step=()=>state?by[state.stepId]:null;
const ready=s=>!!s&&(examMode==='exam'&&!examSubmitted?true:s.requires.every(k=>complete.has(k)));
const SUPPORT_PANEL_IDS=['step-map-details','exercise-mindmap','error-decision-tree','exercise-trap-library','model-solution-panel','skill-diagnosis'];
function collapseSupportPanels(){
 for(const pid of SUPPORT_PANEL_IDS){const el=$(pid);if(el){el.open=false;el.hidden=true;}}
 if($('explanation'))$('explanation').open=false;
}
function openSupportPanel(panel){
 if(!data||!state||!SUPPORT_PANEL_IDS.includes(panel)||(examMode==='exam'&&!examSubmitted)||N?.examSession(localStorage))return false;
 const el=$(panel);if(!el)return false;
 collapseSupportPanels();mobileView='sheet';syncShellView();
 el.hidden=false;el.open=true;
 if(N){history.replaceState(null,'',location.pathname+location.search+'#'+panel);N.openSupport(panel);}
 else el.scrollIntoView?.({block:'start'});
 return true;
}
function subLabel(k){
 if(typeof P.formatPartLabel==='function')return P.formatPartLabel(k);
 if(k==='main')return 'Toàn bài';
 if(k==='shared_domain')return 'ĐKXĐ chung';
 return typeof k==='string'&&/^y_(.+)$/i.test(k)?`Ý ${k.slice(2)}`:`Ý ${k}`;
}
function orderedParts(g){
 if(typeof P.getOrderedPartEntries==='function')return P.getOrderedPartEntries(g);
 if(!g||typeof g!=='object')return [];
 const raw=g.subquestion_step_groups?Object.entries(g.subquestion_step_groups).filter(([k,ids])=>validKey(k)&&Array.isArray(ids)&&ids.length):[];
 if(!raw.length)return [['main',Array.isArray(g.step_ids)?g.step_ids.slice():[]]];
 return raw.sort(([a],[b])=>(a==='shared_domain'?-1:b==='shared_domain'?1:a.localeCompare(b,'vi',{numeric:true})));
}
function resolvePartKey(g,stepId,preferredPartKey){
 if(typeof P.resolvePartForStep==='function')return P.resolvePartForStep(g,stepId,preferredPartKey);
 const entries=orderedParts(g);if(!entries.length)return 'main';
 if(preferredPartKey&&validKey(preferredPartKey)){const pref=entries.find(([k])=>k===preferredPartKey);if(pref&&(!stepId||pref[1].includes(stepId)))return pref[0];}
 if(stepId&&validKey(stepId)){const found=entries.find(([,ids])=>ids.includes(stepId));if(found)return found[0];}
 return entries[0][0];
}
function stepErrorMap(){return data&&journal&&S&&typeof S.diagnoseStudentErrors==='function'&&(examMode!=='exam'||examSubmitted)?S.diagnoseStudentErrors(data,journal,complete,state?.itemId).by_step_id:Object.create(null);}
function status(s,errMap){
 if(examMode==='exam'&&!examSubmitted)return Object.hasOwn(state?.answers||{},s.step_id)?'Đã ghi bài làm':'Chưa trả lời';
 if(complete.has(s.step_id))return 'Đã làm đúng';
 const err=errMap&&errMap[s.step_id];
 if(err)return `Cần sửa [${err.error_type}]`;
 return ready(s)?'Sẵn sàng':'Cần bước trước';
}
function syncShellView(){
 const shell=$('paper-sheet-shell');
 if(shell)shell.setAttribute('data-mobile-view',mobileView);
 if($('workspace'))$('workspace').hidden=mobileView!=='sheet';
}
function showStorage(){ if($('storage-status'))$('storage-status').textContent=storageOK?'Đã lưu thử trên trình duyệt này · chưa lưu máy chủ.':'Chưa lưu được trên trình duyệt; trạng thái chỉ giữ khi trang còn mở.'; }
function disableWorkspace(){
 data=null;by=Object.create(null);state=null;journal=null;key='';complete=new Set();
 if($('workspace'))$('workspace').hidden=true;
 if($('exam-paper-panel'))$('exam-paper-panel').hidden=true;
 if($('total-progress'))$('total-progress').textContent='';
 if($('exercise-list'))$('exercise-list').innerHTML='';
 if($('answer-fields'))$('answer-fields').innerHTML='';
 if($('check-answer'))$('check-answer').disabled=true;
 if($('hint-button'))$('hint-button').disabled=true;
 if($('feedback'))$('feedback').hidden=true;
 if($('subquestion-tabs')){$('subquestion-tabs').hidden=true;$('subquestion-tabs').innerHTML='';}
 if($('sheet-header'))$('sheet-header').innerHTML='';
 if($('geometry-precheck'))$('geometry-precheck').hidden=true;
 if($('diagnosis-summary'))$('diagnosis-summary').textContent='';
 if($('diagnosis-list'))$('diagnosis-list').innerHTML='';
 if($('active-remediation-card'))$('active-remediation-card').innerHTML='';
 if($('trap-library-list'))$('trap-library-list').innerHTML='';
 collapseSupportPanels();
}
function save(){if(!data||!state||!journal)return;updateNavigation();try{localStorage.setItem(key,JSON.stringify({...state,activePartKey:state.activePartKey||null,mobileView,geometryChecks:state.geometryChecks||{},examMode,examSubmitted,version:data.version,content_sha256:data.content_sha256,journal}));storageOK=true;}catch{storageOK=false;}showStorage();}
function updateNavigation(){
 if(!N||!data||!state)return;
 const g=graph();if(!g)return;
 N.setURL({profile:activeProfileId,graph_id:g.item_id,part:state.activePartKey==='main'?null:state.activePartKey,step_id:state.stepId,view:mobileView});
 N.setContext({title:`${examMode==='exam'&&!examSubmitted?'Đang thi thử':'Đang học'} · Bài ${data.graphs.indexOf(g)+1} · ${subLabel(state.activePartKey)}`,crumbs:[activeProfileId==='midterm1-hanoi-01'?'Đề giữa kỳ I':'Bộ luyện theo bước',`Bài ${data.graphs.indexOf(g)+1}`,subLabel(state.activePartKey),`Bước ${g.step_ids.indexOf(state.stepId)+1}`]});
 let bar=$('yd-support-actions');if(!bar){bar=document.createElement('div');bar.id='yd-support-actions';bar.className='yd-support-actions';$('workspace').prepend(bar);}
 const locked=examMode==='exam'&&!examSubmitted;
 const supportButton=([id,label])=>`<button type="button" data-yd-support="${id}" aria-controls="${id}" ${locked?'disabled':''}>${label}${locked?' · Khóa khi thi':''}</button>`;
 bar.innerHTML='<button type="button" data-yd-return>Giấy làm bài</button>'+[['step-map-details','Hướng dẫn từng bước'],['exercise-mindmap','Sơ đồ tư duy'],['model-solution-panel','Lời giải mẫu']].map(supportButton).join('')+'<details class="support-more"><summary>Hỗ trợ khác</summary><div>'+[['error-decision-tree','Gợi ý sửa lỗi'],['exercise-trap-library','Bẫy lỗi thường gặp'],['skill-diagnosis','Chẩn đoán kỹ năng']].map(supportButton).join('')+'</div></details>';
 bar.querySelector('[data-yd-return]').onclick=()=>{collapseSupportPanels();history.replaceState(null,'',location.pathname+location.search);$('practice').scrollIntoView({block:'start'});};
 bar.querySelectorAll('[data-yd-support]').forEach(b=>b.onclick=()=>{if(!locked)openSupportPanel(b.dataset.ydSupport);});
}
function record(type,id,details={}){if(!data||!journal||!state)return;J.append(data,journal,type,state.itemId,id,details);}
function ensurePaperSheetModule(){
 if(paperSheetModule)return paperSheetModule;
 if(typeof P.createPaperSheetModule==='function'){
  paperSheetModule=P.createPaperSheetModule({
   paperRoot:$('exam-paper-list'),
   sheetHeaderRoot:$('sheet-header'),
   subquestionRoot:$('subquestion-tabs'),
   ports:{escapeHtml:safe,renderMath:math},
   callbacks:{
    onSelectPart:(itemId,partKey)=>selectPart(itemId||state?.itemId,partKey),
    onSelectItem:itemId=>selectItem(itemId),
    onSelectStep:stepId=>selectStep(stepId),
    onBackToPaper:()=>openPaperView()
   }
  });
 }
 return paperSheetModule;
}
function buildPaperSheetSnapshot(){
 if(!data||!state)return null;
 const errMap=stepErrorMap();
 const curG=graph()||data.graphs[0];
 const activePartKey=resolvePartKey(curG,state.stepId,state.activePartKey);
 state.activePartKey=activePartKey;
 const exercises=data.graphs.map((g,idx)=>{
  const partEntries=orderedParts(g);
  const parts=partEntries.map(([pk,sids])=>{
   const steps=sids.map(sid=>{
    const s=by[sid];
    const orderIdx=g.step_ids.indexOf(sid)+1;
    return {
     stepId:sid,
     orderInExercise:orderIdx,
     title:s?s.title:sid,
     statusText:s?status(s,errMap):'',
     isCompleted:complete.has(sid),
     isAnswered:Object.hasOwn(state.answers||{},sid),
     isReady:s?ready(s):false,
     isActive:state.stepId===sid
    };
   });
   return {
    partKey:pk,
    label:subLabel(pk),
    stepIds:sids.slice(),
    completedCount:sids.filter(id=>complete.has(id)).length,
    answeredCount:sids.filter(id=>Object.hasOwn(state.answers||{},id)).length,
    isActive:g.item_id===state.itemId&&pk===activePartKey,
    steps
   };
  });
  return {
   itemId:g.item_id,
   index:idx+1,
   title:g.title,
   prompt:g.prompt,
   subtitle:g.subtitle,
   totalSteps:g.step_ids.length,
   completedStepCount:g.step_ids.filter(k=>complete.has(k)).length,
   answeredStepCount:g.step_ids.filter(k=>Object.hasOwn(state.answers||{},k)).length,
   parts
  };
 });
 return Object.freeze({
  activeItemId:state.itemId,
  activePartKey,
  activeStepId:state.stepId,
  examMode,
  examSubmitted,
  mobileView,
  isFixture:activeProfileId==='midterm1-fixture',
  isBatch02A:activeProfileId==='midterm1-hanoi-01',
  exercises
 });
}
function drawSubquestions(g){
 const mod=ensurePaperSheetModule();
 if(mod){mod.render(buildPaperSheetSnapshot());return;}
 const box=$('subquestion-tabs');if(!box||!g)return;
 const groups=orderedParts(g);
 if(groups.length<=1){box.hidden=true;box.innerHTML='';return;}
 box.hidden=false;
 const activePart=resolvePartKey(g,state.stepId,state.activePartKey);
 box.innerHTML=groups.map(([gk,ids])=>{
  const done=ids.filter(id=>complete.has(id)).length,active=gk===activePart;
  return `<button type="button" data-sub="${safe(gk)}" aria-pressed="${active}">${safe(subLabel(gk))} (${done}/${ids.length})</button>`;
 }).join('');
 box.querySelectorAll('[data-sub]').forEach(b=>b.onclick=()=>selectPart(g.item_id,b.dataset.sub));
}
function drawExamPaper(){
 const panel=$('exam-paper-panel'),listEl=$('exam-paper-list'),noteEl=$('exam-mode-status'),subBtn=$('submit-exam-btn'),pBtn=$('practice-mode-btn'),eBtn=$('exam-mode-btn'),tBtn=$('toggle-exam-paper');
 if(pBtn){pBtn.setAttribute('aria-pressed',String(examMode==='practice'));pBtn.disabled=examMode==='exam'&&!examSubmitted;}
 if($('profile-select'))$('profile-select').disabled=examMode==='exam'&&!examSubmitted;
 if(eBtn)eBtn.setAttribute('aria-pressed',String(examMode==='exam'));
 const showPanel=examPaperOpen||(examMode==='exam'&&!examSubmitted);
 if(tBtn)tBtn.setAttribute('aria-expanded',String(mobileView==='paper'));
 syncShellView();
 if(!panel||!listEl||!data)return;
 panel.hidden=!showPanel;
 if(subBtn)subBtn.hidden=!(examMode==='exam'&&!examSubmitted);
 if(noteEl){
  const answeredCount=data.steps.filter(s=>Object.hasOwn(state?.answers||{},s.step_id)).length;
  noteEl.textContent=examMode==='exam'?(examSubmitted?`Đã nộp bài thi thử: đạt ${complete.size}/${data.steps.length} bước. Cây quyết định 5 nhóm lỗi và Lời giải mẫu đã mở bên dưới.`:`Đang ở Chế độ Thi thử (${answeredCount}/${data.steps.length} bước đã ghi bài làm): Gợi ý, Sơ đồ tư duy, Bẫy lỗi và Lời giải mẫu được khóa cho tới khi bấm "Nộp bài thi thử & Chẩn đoán 5 nhóm lỗi".`):'Tờ đề tự luận là màn hình chính giúp học sinh đọc toàn bộ 5 bài và bấm chọn từng Ý (y_1, y_2, y_2a...) để mở Giấy làm bài tương ứng.';
 }
 const mod=ensurePaperSheetModule();
 if(mod){mod.render(buildPaperSheetSnapshot());return;}
 listEl.innerHTML=data.graphs.map((g,i)=>{
  const doneCnt=g.step_ids.filter(k=>complete.has(k)).length;
  const partBtns=orderedParts(g).map(([pk,ids])=>`<button type="button" data-paper-item="${safe(g.item_id)}" data-paper-part="${safe(pk)}">${safe(subLabel(pk))} [${safe(pk)}] (${ids.filter(id=>complete.has(id)).length}/${ids.length})</button>`).join('');
  return `<div class="exam-paper-item"><strong>Bài ${i+1} (${g.step_ids.length} bước · Đã hoàn thành ${doneCnt}/${g.step_ids.length})</strong><div class="math-text">${math(g.prompt)}</div><small>Điều kiện / Xuất xứ: ${math(g.subtitle)}</small><div class="skill-actions" style="margin-top:8px">${partBtns}</div></div>`;
 }).join('');
 listEl.querySelectorAll('[data-paper-item]').forEach(b=>b.onclick=()=>selectPart(b.dataset.paperItem,b.dataset.paperPart||'main'));
}
function drawGeometryPrecheck(g){
 const box=$('geometry-precheck'),titleEl=$('geometry-precheck-title'),noteEl=$('geometry-precheck-notice'),listEl=$('geometry-precheck-list'),statEl=$('geometry-precheck-status');
 if(!box||!listEl||!S||typeof S.getGeometryPrecheck!=='function')return;
 const pre=S.getGeometryPrecheck(g);
 if(!pre){box.hidden=true;listEl.innerHTML='';return;}
 box.hidden=false;
 if(!state.geometryChecks)state.geometryChecks=Object.create(null);
 if(titleEl)titleEl.textContent=pre.title;
 if(noteEl)noteEl.textContent=pre.notice;
 const checkedCount=pre.checks.filter(c=>state.geometryChecks[c.check_id]===true).length;
 listEl.innerHTML=pre.checks.map(c=>`<label class="precheck-item"><input type="checkbox" data-geo-check="${safe(c.check_id)}" ${state.geometryChecks[c.check_id]===true?'checked':''}><span>${safe(c.label)}</span></label>`).join('');
 if(statEl)statEl.textContent=checkedCount===pre.checks.length?`Đã đối chiếu đủ ${checkedCount}/${pre.checks.length} chốt Giả thiết – Ký hiệu – Hình vẽ (Phòng ngừa DIAGRAM_ERROR).`:`Đã đối chiếu ${checkedCount}/${pre.checks.length} chốt hình học trước khi giải — hãy hoàn tất đủ ${pre.checks.length} chốt để tránh lỗi DIAGRAM_ERROR.`;
 listEl.querySelectorAll('[data-geo-check]').forEach(chk=>chk.onchange=()=>{
  const cid=chk.dataset.geoCheck;if(!validKey(cid))return;
  state.geometryChecks[cid]=!!chk.checked;save();drawGeometryPrecheck(g);
 });
}
function drawStudyResources(g){
 if(!S||typeof S.buildExerciseStudyGuide!=='function')return;
 const guide=S.buildExerciseStudyGuide(data,g.item_id);if(!guide)return;
 const inUnsubmittedExam=examMode==='exam'&&!examSubmitted;
 const mmEl=$('mindmap-branches');
 if(mmEl){
  mmEl.innerHTML=inUnsubmittedExam?'<p class="panel-note">Đang trong Chế độ Thi thử chưa nộp: Sơ đồ tư duy gợi mở hướng giải được khóa cho đến khi em nộp bài thi thử.</p>':guide.mindmap_branches.map(b=>`<div class="mindmap-card"><h4>${safe(b.title)}</h4><p>${math(b.summary)}</p><p><strong>Chốt phòng lỗi:</strong> ${safe(b.key_guard)}</p></div>`).join('');
 }
 const msNote=$('model-solution-note'),msList=$('model-solution-list');
 if(msNote&&msList){
  if(inUnsubmittedExam){
   msNote.textContent='Đang trong Chế độ Thi thử: Lời giải mẫu hoàn chỉnh được khóa cho đến khi em nộp bài thi thử.';
   msList.innerHTML='';
  }else{
   msNote.textContent=`Lời giải mẫu hoàn chỉnh gồm ${guide.model_solution_steps.length} bước trình bày chuẩn tự luận (đối chiếu sau khi tự làm):`;
   msList.innerHTML=guide.model_solution_steps.map(st=>`<div class="model-solution-item"><strong>Bước ${st.step_number}: ${safe(st.title)}</strong><div class="math-text" style="margin:6px 0">${M.formula(st.before,window.katex)} <span>→</span> ${M.formula(st.after,window.katex)}</div><p style="margin:4px 0;font-size:13.5px"><em>Lập luận trình bày:</em> ${math(st.justification)}</p><small><strong>Kết quả bước ${st.step_number}:</strong> ${math(String(st.expected_display))}</small></div>`).join('');
  }
 }
}
function drawErrorScaffolding(g){
 const noticeEl=$('error-boundary-notice'),sumEl=$('error-tree-summary'),cardEl=$('active-remediation-card'),trapEl=$('trap-library-list');
 if(!S||!data||!journal)return;
 if(noticeEl)noticeEl.textContent=S.VERIFICATION_BOUNDARY_NOTICE;
 const inUnsubmittedExam=examMode==='exam'&&!examSubmitted;
 const errDiag=S.diagnoseStudentErrors(data,journal,complete,g.item_id);
 const traps=S.getExerciseTrapLibrary(data,g.item_id);
 if(inUnsubmittedExam){
  if(sumEl)sumEl.textContent='Chế độ Thi thử đang diễn ra: Cây quyết định giàn giáo sẽ phân tích lỗi và giao từng nhiệm vụ sửa ngay sau khi em bấm "Nộp bài thi thử".';
  if(cardEl)cardEl.innerHTML='';
  if(trapEl)trapEl.innerHTML='<p class="panel-note">Đang trong Chế độ Thi thử chưa nộp: Thư viện 5 nhóm bẫy lỗi và lời sửa mẫu được khóa cho đến khi em nộp bài thi thử.</p>';
  return;
 }
 if(sumEl&&cardEl){
  const t=errDiag.active_remediation_task;
  sumEl.textContent=t?`Phát hiện ${errDiag.total_active_errors} lỗi có bằng chứng trong phiên (${errDiag.queued_errors_count} lỗi xếp hàng chờ lượt sau) · Cây quyết định chỉ giao 1 nhiệm vụ sửa ưu tiên sớm nhất ở lượt này:`:`Hiện có 0 lỗi tồn đọng cần sửa trên các bước đã kiểm tra. Nếu gặp vướng mắc, hãy xem Thư viện 5 nhóm bẫy lỗi bên dưới.`;
  if(t){
   const hintsHtml=(t.hints||[]).map(h=>`<li>${math(h)}</li>`).join('');
   cardEl.innerHTML=`<div class="remediation-card" data-active-error-type="${safe(t.error_type)}" data-active-error-step="${safe(t.step_id)}"><div class="remediation-meta"><span class="tag-badge error-tag">${safe(t.label_vi)}</span><span class="tag-badge layer-tag">${safe(t.origin_label_vi)}</span><span class="tag-badge">Ưu tiên bước sớm nhất: Bài ${t.exercise_index} · Bước ${t.step_order}</span></div><h4>Nhiệm vụ sửa lỗi lượt này: ${safe(t.trap_title)} (${safe(t.step_title)})</h4><p><strong>1. Câu hỏi phát hiện lỗi:</strong> ${math(t.detection_question)}</p><div><strong>2. Gợi ý giàn giáo 3 mức:</strong><ol>${hintsHtml}</ol></div><p><strong>3. Hoạt động tự sửa:</strong> ${math(t.self_correction_activity)}</p><p><strong>4. Lời sửa mẫu:</strong> ${math(t.model_correction)}</p><p><strong>5. Quy tắc tránh lặp lại trong bài thi tiếp theo:</strong> ${safe(t.exam_prevention_rule)}</p><div class="skill-actions"><button type="button" data-fix-item="${safe(t.item_id)}" data-fix-step="${safe(t.step_id)}">Chuyển tới bước này để tự sửa ngay</button></div></div>`;
   cardEl.querySelectorAll('[data-fix-step]').forEach(b=>b.onclick=()=>{retrySkillStep(b.dataset.fixItem,b.dataset.fixStep,false);});
  }else{
   cardEl.innerHTML=`<div class="remediation-card clean"><strong>Trạng thái giàn giáo:</strong> Chưa phát hiện lỗi tồn đọng ở lượt hiện tại. Hãy tiếp tục giải các bước tiếp theo hoặc đối chiếu 5 nhóm bẫy lỗi của bài.</div>`;
  }
 }
 if(trapEl){
  const activeTypes=new Set(errDiag.detected_errors.filter(e=>e.item_id===g.item_id).map(e=>e.error_type));
  trapEl.innerHTML=traps.map(tr=>{
   const isHit=activeTypes.has(tr.error_type);
   const hintsHtml=(tr.hints||[]).map(h=>`<li>${math(h)}</li>`).join('');
   return `<div class="trap-card ${isHit?'active-trap':''}" data-trap-type="${safe(tr.error_type)}"><div class="remediation-meta"><span class="tag-badge error-tag">${safe(tr.label_vi)}</span><span class="tag-badge layer-tag">${safe(tr.origin_label_vi)}</span>${isHit?'<span class="tag-badge">Đang gặp ở bài này</span>':''}</div><h4>${safe(tr.trap_title)}</h4><p><small>Liên kết Step Graph: <code>${safe(tr.linked_step_id||'')}</code> — ${safe(tr.linked_step_title||'')}</small></p><p><strong>Câu hỏi phát hiện:</strong> ${math(tr.detection_question)}</p><details><summary>Xem gợi ý mức 1–3, hoạt động tự sửa &amp; lời sửa mẫu</summary><ol>${hintsHtml}</ol><p><strong>Hoạt động tự sửa:</strong> ${math(tr.self_correction_activity)}</p><p><strong>Lời sửa mẫu:</strong> ${math(tr.model_correction)}</p><p><strong>Phòng tránh ở bài thi tiếp theo:</strong> ${safe(tr.exam_prevention_rule)}</p></details>${tr.linked_step_id?`<div class="skill-actions" style="margin-top:8px"><button type="button" data-trap-step="${safe(tr.linked_step_id)}">Mở bước liên kết trên Step Graph</button></div>`:''}</div>`;
  }).join('');
  trapEl.querySelectorAll('[data-trap-step]').forEach(b=>b.onclick=()=>selectStep(b.dataset.trapStep));
 }
}
function drawDiagnosis(){
 const sumEl=$('diagnosis-summary'),listEl=$('diagnosis-list');if(!sumEl||!listEl||!data||!journal||typeof J.diagnoseSkills!=='function')return;
 if(examMode==='exam'&&!examSubmitted){
  sumEl.textContent='Đang trong Chế độ Thi thử chưa nộp: Bảng chẩn đoán kỹ năng sẽ cập nhật sau khi nộp bài thi thử.';
  listEl.innerHTML='';
  return;
 }
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
 if(state.itemId!==itemId)collapseSupportPanels();
 state.itemId=itemId;
 if(resetCycle){
  record('ITEM_RESET',null);
  for(const k of g.step_ids){delete state.answers[k];delete state.drafts[k];delete state.hints[k];}
  complete=E.replay(data,state.answers);
 }
 const target=ready(by[stepId])?stepId:(g.step_ids.find(k=>!complete.has(k)&&ready(by[k]))||g.step_ids[0]);
 state.stepId=target;state.activePartKey=resolvePartKey(g,target,null);mobileView='sheet';save();draw();if($('practice'))$('practice').focus();return true;
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
 $('total-progress').textContent=examMode==='exam'&&!examSubmitted?`${Object.keys(state.answers).length} / ${data.steps.length} bước đã ghi bài làm`:`${complete.size} / ${data.steps.length} bước đã làm đúng · ${doneGraphs} / ${data.graphs.length} bài hoàn thành${fixtureTag}`;
 $('exercise-list').innerHTML=data.graphs.map((g,i)=>`<button type="button" data-item="${safe(g.item_id)}" aria-current="${g.item_id===state.itemId}"><strong>Bài ${i+1} (${orderedParts(g).length} ý)</strong><small>${examMode==='exam'&&!examSubmitted?g.step_ids.filter(k=>Object.hasOwn(state.answers,k)).length:g.step_ids.filter(k=>complete.has(k)).length}/${g.step_ids.length} bước${examMode!=='exam'&&L.complete(g,complete)?' · Hoàn thành':''}</small></button>`).join('');
 $('exercise-list').querySelectorAll('[data-item]').forEach(b=>b.onclick=()=>selectItem(b.dataset.item));
 const g=graph();
 state.activePartKey=resolvePartKey(g,state.stepId,state.activePartKey);
 const partLabel=subLabel(state.activePartKey);
 $('exercise-title').textContent=`Bài ${data.graphs.indexOf(g)+1} / ${data.graphs.length} · ${partLabel}${isFixture?' (TEST FIXTURE)':isBatch02A?' (Đề luyện tập tự biên soạn · DRAFT)':''}`;
 $('exercise-prompt').innerHTML=math(g.prompt);
 $('exercise-domain').innerHTML=math(g.subtitle);
 drawExamPaper();drawGeometryPrecheck(g);drawStudyResources(g);drawMap();drawStep();drawErrorScaffolding(g);drawDiagnosis();
}
function selectPart(itemId,partKey){
 if(!data||!state)return false;
 const targetItemId=validKey(itemId)?itemId:state.itemId;
 const g=data.graphs.find(x=>x.item_id===targetItemId);if(!g)return false;
 const entries=orderedParts(g);
 const entry=validKey(partKey)?entries.find(([k])=>k===partKey):entries[0];
 if(!entry)return false;
 const [resolvedKey,partStepIds]=entry;
 collapseSupportPanels();
 state.itemId=g.item_id;
 state.activePartKey=resolvedKey;
 const targetStep=partStepIds.find(k=>!complete.has(k)&&ready(by[k]))||partStepIds[0];
 if(targetStep)state.stepId=targetStep;
 mobileView='sheet';
 examPaperOpen=true;
 save();draw();
 if($('exercise-title'))$('exercise-title').focus();
 return true;
}
function openPaperView(){
 collapseSupportPanels();
 if(N)history.replaceState(null,'',location.pathname+location.search);
 mobileView='paper';
 examPaperOpen=true;
 save();drawExamPaper();
 if($('exam-paper-heading'))$('exam-paper-heading').focus();
 return true;
}
function selectItem(id){
 if(!data||!validKey(id))return false;
 const g=data.graphs.find(g=>g.item_id===id);if(!g)return false;
 collapseSupportPanels();
 state.itemId=id;
 state.stepId=g.step_ids.find(k=>!complete.has(k)&&ready(by[k]))||g.step_ids[0];
 state.activePartKey=resolvePartKey(g,state.stepId,null);
 mobileView='sheet';
 examPaperOpen=true;
 save();draw();
 if($('exercise-title'))$('exercise-title').focus();
 return true;
}
function selectStep(id){
 if(!data||!state||!validKey(id)||!Object.hasOwn(by,id)||by[id].item_id!==state.itemId)return false;
 state.stepId=id;
 const g=graph();
 state.activePartKey=resolvePartKey(g,id,state.activePartKey);
 mobileView='sheet';
 save();drawExamPaper();drawMap();drawStep();drawErrorScaffolding(g);
 if($('practice'))$('practice').focus();
 return true;
}
function drawMap(){
 const g=graph(),view=L.layout(g,by),p=view.points,errMap=stepErrorMap();
 $('map-mode').setAttribute('aria-pressed',String(mode==='map'));$('list-mode').setAttribute('aria-pressed',String(mode==='list'));$('graph-scroll').hidden=mode!=='map';$('step-list').hidden=mode!=='list';
 $('step-map').setAttribute('viewBox',`0 0 ${view.width} ${view.height}`);$('step-map').setAttribute('width',String(view.width));$('step-map').setAttribute('height',String(view.height));
 const edges=g.edges.map(e=>{const a=p[e.from],b=p[e.to],sx=a[0]+123,ex=b[0]-123,mid=(sx+ex)/2;return `<path class="edge" d="M${sx} ${a[1]} C${mid} ${a[1]},${mid} ${b[1]},${ex} ${b[1]}" marker-end="url(#preview-arrow)"/>`;}).join('');
 $('step-map').innerHTML='<defs><marker id="preview-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="#98ae8d"/></marker></defs>'+edges+g.step_ids.map((id,i)=>{const s=by[id],xy=p[id],stTxt=status(s,errMap),hasErr=!!errMap[id],cls=`${complete.has(id)&&(examMode!=='exam'||examSubmitted)?'is-correct ':''}${hasErr?'has-error ':''}${!ready(s)?'is-locked ':''}${state.stepId===id?'is-selected':''}`;return `<g class="node ${cls}" transform="translate(${xy[0]},${xy[1]})" role="button" tabindex="0" data-step="${safe(id)}" aria-pressed="${state.stepId===id}" aria-label="${safe(s.title)}. ${safe(stTxt)}"><title>${safe(s.title)}</title><rect x="-120" y="-32" width="240" height="64" rx="10"/><text x="-107" y="-2">${i+1}. ${safe(s.title.length>27?s.title.slice(0,25)+'…':s.title)}</text><text class="node-state" x="-107" y="18">${safe(stTxt)}</text></g>`;}).join('');
 $('step-list').innerHTML=g.step_ids.map((id,i)=>`<button type="button" data-step="${safe(id)}" aria-pressed="${id===state.stepId}"><b>${i+1}</b><span>${safe(by[id].title)}</span><small>${safe(status(by[id],errMap))}</small></button>`).join('');
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
function feedback(r){
 const el=$('feedback');if(!el)return;
 if(examMode==='exam'&&!examSubmitted){
  const s=step();
  if(s&&Object.hasOwn(state?.answers||{},s.step_id)){el.hidden=false;el.className='review';el.innerHTML='Đã ghi nhận câu trả lời cho bước này trong Chế độ Thi thử. Bấm <strong>Nộp bài thi thử &amp; Chẩn đoán 5 nhóm lỗi</strong> khi hoàn thành.';}
  else el.hidden=true;
  return;
 }
 el.hidden=!r||r.status==='LOCKED';if(el.hidden)return;
 el.className=r.status==='CORRECT'?'correct':r.status==='TRY_AGAIN'?'incorrect':'review';
 let html=math(r.feedback||'Chưa kiểm tra được cách viết này.');
 if(r.status!=='CORRECT'&&S&&typeof S.classifyCodeOrHeuristic==='function'){
  const s=step(),rawAns=s&&Object.hasOwn(state?.answers||{},s.step_id)?JSON.stringify(state.answers[s.step_id]):null;
  const info=S.classifyCodeOrHeuristic(r.diagnosis_code||null,s,rawAns,r.status);
  if(info)html+=`<div class="feedback-error-link"><strong>Phân loại 5 nhóm lỗi cốt lõi:</strong> <code>${safe(info.error_type)}</code> (${safe(info.origin_label_vi)}) — <em>Câu hỏi tự phát hiện:</em> ${math(info.detection_question)}</div>`;
 }
 el.innerHTML=html;
}
function drawStep(){
 const s=step(),g=graph();if(!s||!g)return;const can=ready(s),count=state.hints[s.step_id]||0,errMap=stepErrorMap();
 const inUnsubmittedExam=examMode==='exam'&&!examSubmitted;
 $('step-title').textContent=s.title;$('step-state').textContent=status(s,errMap);$('step-question').innerHTML=math(s.interaction.prompt);
 $('locked-note').textContent=can?'':'Cần làm đúng: '+s.requires.filter(k=>!complete.has(k)).map(k=>by[k].title).join(' · ');
 $('answer-fields').innerHTML=fields(s);$('answer-form').querySelectorAll('input,select,button').forEach(e=>e.disabled=!can);$('check-answer').disabled=!can;
 $('check-answer').textContent=inUnsubmittedExam?'Ghi câu trả lời (Thi thử)':'Kiểm tra';
 $('hint-button').disabled=!can||count>=3||inUnsubmittedExam;
 $('hint-button').textContent=inUnsubmittedExam?'Gợi ý khóa khi Thi thử':count>=3?'Đã mở đủ 3 gợi ý':`Mở gợi ý ${count+1} / 3`;
 $('hints').innerHTML=inUnsubmittedExam?'':s.hints.slice(0,count).map(h=>`<li>${math(h.text)}</li>`).join('');
 $('explanation').hidden=inUnsubmittedExam||!(complete.has(s.step_id)||count===3);if(inUnsubmittedExam)$('explanation').open=false;$('step-before').innerHTML=inUnsubmittedExam?'':M.formula(s.before,window.katex);$('step-after').innerHTML=inUnsubmittedExam?'':M.formula(s.after,window.katex);$('step-reason').innerHTML=inUnsubmittedExam?'':math(s.justification);
 $('item-progress').textContent=inUnsubmittedExam?`${g.step_ids.filter(k=>Object.hasOwn(state.answers,k)).length}/${g.step_ids.length} bước đã ghi bài làm`:L.complete(g,complete)?`Đã làm đúng ${g.step_ids.length}/${g.step_ids.length} bước. Hãy thử tự giải lại.`:`${g.step_ids.filter(k=>complete.has(k)).length}/${g.step_ids.length} bước đã làm đúng.`;
 const ev=J.evidence(journal,state.itemId,s.step_id);
 const errTag=errMap[s.step_id]?` · Nhóm lỗi: ${errMap[s.step_id].error_type}`:'';
 $('attempt-evidence').textContent=inUnsubmittedExam?'Kết quả được mở sau khi nộp bài thi thử.':`${ev.attempts} lượt kiểm tra trong chu kỳ · ${ev.status}${ev.diagnosis_code?' ('+ev.diagnosis_code+')':''}${errTag}. Đây là bằng chứng hiện có trong phiên, chưa phải đánh giá thành thạo tuyệt đối.`;
 feedback(Object.hasOwn(state.answers,s.step_id)?L.evaluate(E,data,s.step_id,state.answers[s.step_id],[...complete]):null);
}
async function load(id){
 const lock=N?.examSession(localStorage);if(lock)id=lock.profileId;
 const requestedContext=new URLSearchParams(location.search);
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
  if(stored?.content_sha256!==digest)stored=null;state=E.restore(data,stored);state.geometryChecks=stored?.geometryChecks&&typeof stored.geometryChecks==='object'?stored.geometryChecks:Object.create(null);state.activePartKey=resolvePartKey(graph(),state.stepId,stored?.activePartKey);mobileView='paper';examPaperOpen=true;
  const lockNow=N?.examSession(localStorage);
  examMode=lockNow||stored?.examMode==='exam'?'exam':'practice';examSubmitted=!lockNow&&examMode==='exam';
  if(examMode==='exam'&&!examSubmitted&&N&&!lockNow&&!N.startExam(localStorage,id,digest))throw Error('Không lưu được phiên thi thử; hãy cho phép lưu trên trình duyệt rồi thử lại.');
  if(lockNow&&lockNow.contentHash!==digest)throw Error('Học liệu đã đổi trong phiên thi thử. Cần khôi phục đúng phiên bản trước khi tiếp tục.');
  const target=N?.resolveGraphContext(data,requestedContext);
  if(target){mobileView='sheet';state.itemId=target.itemId;state.stepId=target.stepId;state.activePartKey=resolvePartKey(graph(),target.stepId,target.part);}
  if(requestedContext.get('view')==='paper')mobileView='paper';
  journal=J.restore(data,stored?.journal,crypto.randomUUID(),!!stored);complete=E.replay(data,state.answers);collapseSupportPanels();if($('exam-paper-panel'))$('exam-paper-panel').hidden=false;save();draw();if(target&&mobileView==='sheet')openSupportPanel(location.hash.slice(1));
 }catch(e){if(gen!==generation)return;disableWorkspace();$('load-error').hidden=false;$('load-error').textContent=e.message||'Không mở được học liệu.';}
}
function setExamMode(nextMode){
 if(nextMode!=='practice'&&nextMode!=='exam')return false;
 if(!data||!state)return false;
 if(nextMode==='practice'&&N?.examSession(localStorage))return false;
 if(nextMode==='exam'&&N&&!N.startExam(localStorage,activeProfileId,data.content_sha256)){if($('exam-mode-status'))$('exam-mode-status').textContent='Chưa lưu được phiên thi thử. Hãy cho phép lưu trên trình duyệt rồi thử lại.';return false;}
 examMode=nextMode;
 if(examMode==='exam'){examSubmitted=false;examPaperOpen=true;collapseSupportPanels();}
 save();draw();return true;
}
function submitMockExam(){
 if(!data||!state||examMode!=='exam'||examSubmitted)return null;
 if(N&&!N.finishExam(localStorage,activeProfileId,data.content_sha256))return null;
 examSubmitted=true;complete=E.replay(data,state.answers);save();draw();
 return S&&typeof S.diagnoseStudentErrors==='function'?S.diagnoseStudentErrors(data,journal,complete,state.itemId):null;
}
function toggleGeometryCheck(checkId,checked){
 if(!state||!validKey(checkId))return false;
 if(!state.geometryChecks)state.geometryChecks=Object.create(null);
 state.geometryChecks[checkId]=!!checked;save();if(graph())drawGeometryPrecheck(graph());return true;
}
const saveCurrentDraft=()=>{if(!data||!state||!validKey(state.stepId))return;const val=read();if(val!==null&&val!=='')state.drafts[state.stepId]=val;save();};
$('answer-form').onsubmit=e=>{e.preventDefault();if(!data||!state)return;const s=step();if(!ready(s))return;const answer=read();if(answer===null||answer===''){feedback({status:'TRY_AGAIN',feedback:'Hãy nhập hoặc chọn câu trả lời.'});return;}const result=L.evaluate(E,data,s.step_id,answer,[...complete]);state.answers[s.step_id]=answer;state.drafts[s.step_id]=answer;record('ANSWER_SUBMITTED',s.step_id,{answer,result_status:result.status,diagnosis_code:result.diagnosis_code||null,hint_level:state.hints[s.step_id]||0});complete=E.replay(data,state.answers);save();draw();feedback(result);};
$('answer-form').oninput=saveCurrentDraft;
$('answer-form').onchange=saveCurrentDraft;
$('hint-button').onclick=()=>{if(!data||!state||(examMode==='exam'&&!examSubmitted))return;const s=step();if(!ready(s)||(state.hints[s.step_id]||0)>=3)return;state.hints[s.step_id]=(state.hints[s.step_id]||0)+1;record('HINT_OPENED',s.step_id,{hint_level:state.hints[s.step_id]});save();drawStep();if(graph())drawErrorScaffolding(graph());drawDiagnosis();};
$('explanation').ontoggle=()=>{if(!data||!state||(examMode==='exam'&&!examSubmitted))return;const s=step();if(!s||!$('explanation').open||$('explanation').hidden)return;const reset=journal.events.findLastIndex(e=>e.item_id===state.itemId&&e.type==='ITEM_RESET');if(!journal.events.slice(reset+1).some(e=>e.step_id===s.step_id&&e.type==='EXPLANATION_OPENED')){record('EXPLANATION_OPENED',s.step_id,{hint_level:state.hints[s.step_id]||0});save();if(graph())drawErrorScaffolding(graph());drawDiagnosis();}};
$('reset-item').onclick=()=>{if(!data||!state)return;const g=graph();if(!g)return;record('ITEM_RESET',null);for(const k of g.step_ids){delete state.answers[k];delete state.drafts[k];delete state.hints[k];}state.stepId=g.step_ids[0];state.activePartKey=resolvePartKey(g,state.stepId,null);complete=E.replay(data,state.answers);save();draw();};
$('map-mode').onclick=()=>{if(!data||!state)return;mode='map';drawMap();};$('list-mode').onclick=()=>{if(!data||!state)return;mode='list';drawMap();};
$('next-step').onclick=()=>{if(!data||!state)return;const g=graph();if(!g)return;const next=g.step_ids.find(k=>!complete.has(k)&&ready(by[k]));if(next)selectStep(next);else selectItem(data.graphs[(data.graphs.indexOf(g)+1)%data.graphs.length].item_id);};
if(N)window.addEventListener('yd-exam-session-changed',()=>{if(!data||!state)return;const lock=N?.examSession(localStorage);if(lock){if(lock.profileId!==activeProfileId){N.enforce(window);return;}examMode='exam';examSubmitted=false;collapseSupportPanels();save();draw();}else if(examMode==='exam'&&!examSubmitted){examSubmitted=true;save();draw();}});
$('profile-select').onchange=()=>load($('profile-select').value);
if($('practice-mode-btn'))$('practice-mode-btn').onclick=()=>setExamMode('practice');
if($('exam-mode-btn'))$('exam-mode-btn').onclick=()=>setExamMode('exam');
if($('toggle-exam-paper'))$('toggle-exam-paper').onclick=()=>openPaperView();
if($('submit-exam-btn'))$('submit-exam-btn').onclick=()=>submitMockExam();
async function init(){try{const r=await fetch('data/practice-preview-profiles.json',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('Không tải được danh mục.');const meta=await r.json();if(meta.status!=='DRAFT_LOCAL_PREVIEW_ONLY')throw Error('Danh mục không hợp lệ.');profiles=meta.profiles;const allowed=['data/radical-steps-v0.1.json','data/graph02-v1-preview.json','data/graph02-v2-preview.json','data/midterm1-fixture-preview.json','data/midterm1-hanoi-exam01-preview.json'];if(!Array.isArray(profiles)||!profiles.length||profiles.some(p=>!allowed.includes(p.path)||!['legacy-rad01','lesson-contract-v01'].includes(p.profile)||!/^[a-f0-9]{64}$/.test(p.sha256)))throw Error('Đường dẫn profile không được phép.');const requested=N?.examSession(localStorage)?.profileId||new URLSearchParams(location.search).get('profile'),defaultId=(validKey(meta.default_profile)&&profiles.some(p=>p.id===meta.default_profile))?meta.default_profile:(profiles.some(p=>p.id==='midterm1-hanoi-01')?'midterm1-hanoi-01':profiles[0].id),id=profiles.some(p=>p.id===requested)?requested:defaultId;$('profile-select').innerHTML=profiles.map(p=>`<option value="${safe(p.id)}"${p.id===id?' selected':''}>${safe(p.label)}</option>`).join('');$('profile-select').disabled=false;$('profile-select').value=id;await load(id);}catch(e){disableWorkspace();$('load-error').hidden=false;$('load-error').textContent=e.message;}}
window.YourdreamPreview=Object.assign(window.YourdreamPreview||{},{ready:null,getData:()=>data,getState:()=>state,getJournal:()=>journal,getCompleted:()=>[...complete],getActiveView:()=>mobileView,getPaperSheetModule:()=>paperSheetModule,getSkillDiagnosis:()=>data&&journal?J.diagnoseSkills(data,journal,complete):null,getErrorDiagnosis:()=>data&&journal&&S?S.diagnoseStudentErrors(data,journal,complete,state?.itemId):null,getExerciseTrapLibrary:itemId=>data&&S?S.getExerciseTrapLibrary(data,itemId||state?.itemId):[],getStudyGuide:itemId=>data&&S?S.buildExerciseStudyGuide(data,itemId||state?.itemId):null,setExamMode,submitMockExam,toggleGeometryCheck,selectItem,selectPart,selectStep,openPaperView,openSupportPanel,retrySkillStep,loadProfile:load});window.YourdreamPreview.ready=init();
})();
