(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.YourdreamNavigation=api;api.boot(root);}})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const EXAM_KEY='yd-learning-exam:v1',CONTEXT_KEY='yd-learning-context:v1';
const routes=['/','/index.html','/radicals.html','/graph02-preview.html','/blueprint.html'];
const panels=['exercise-mindmap','model-solution-panel','step-map-details','skill-diagnosis','error-decision-tree','exercise-trap-library'];
const id=v=>typeof v==='string'&&/^[A-Za-z0-9:._-]{1,100}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function read(storage,key){try{const raw=storage.getItem(key);return raw&&raw.length<16000?JSON.parse(raw):null;}catch{return null;}}
function safeRoute(value){
 if(typeof value!=='string'||value.length>3000||!value.startsWith('/')||value.startsWith('//'))return null;
 try{const u=new URL(value,'https://yourdream.invalid');if(u.origin!=='https://yourdream.invalid'||!routes.includes(u.pathname))return null;
 const allowed=['profile','item','graph_id','part','step_id','view','branch','topic','tab','return_to'];
 for(const [k,v] of u.searchParams){if(!allowed.includes(k)||v.length>1500)return null;}
 if(u.hash&&!panels.includes(u.hash.slice(1))&&u.hash!=='#practice')return null;
 return u.pathname+u.search+u.hash;}catch{return null;}
}
function resolveGraphContext(data,params){
 const graphId=params.get('graph_id')||params.get('item');
 const g=data.graphs.find(g=>g.item_id===graphId);if(!g)return null;
 const part=params.get('part'),stepId=params.get('step_id');
 const parts=g.subquestion_step_groups;
 if(part&&(!parts||!Object.hasOwn(parts,part)))return null;
 if(stepId&&(!g.step_ids.includes(stepId)||(part&&!parts[part].includes(stepId))))return null;
 return {itemId:g.item_id,stepId:stepId||(part?parts[part][0]:g.step_ids[0]),part:part||null};
}
function examSession(storage){const x=read(storage,EXAM_KEY);return x&&x.active===true&&id(x.profileId)&&/^[a-f0-9]{64}$/.test(x.contentHash)?x:null;}
function examURL(x){return '/graph02-preview.html?profile='+encodeURIComponent(x.profileId);}
function startExam(storage,profileId,contentHash){
 if(!id(profileId)||!/^[a-f0-9]{64}$/.test(contentHash))return false;
 const existing=examSession(storage);if(existing&&(existing.profileId!==profileId||existing.contentHash!==contentHash))return false;
 try{storage.setItem(EXAM_KEY,JSON.stringify({active:true,profileId,contentHash}));return !!examSession(storage);}catch{return false;}
}
function finishExam(storage,profileId,contentHash){const x=examSession(storage);if(!x||x.profileId!==profileId||x.contentHash!==contentHash)return false;try{storage.removeItem(EXAM_KEY);return !examSession(storage);}catch{return false;}}
function enforce(win){const x=examSession(win.localStorage);if(!x)return false;const p=new URLSearchParams(win.location.search);if(win.location.pathname!=='/graph02-preview.html'||p.get('profile')!==x.profileId){win.document.documentElement.style.visibility='hidden';win.location.replace(examURL(x));return true;}return false;}
let win=null,context=null,previous=null,returnTo=null;
function persist(){if(!win||!context)return;try{win.localStorage.setItem(CONTEXT_KEY,JSON.stringify({url:safeRoute(win.location.pathname+win.location.search),title:context.title,crumbs:context.crumbs}));}catch{}}
function setContext(next){context=next;persist();render();}
function setURL(params){if(!win)return;const u=new URL(win.location.href);for(const [k,v] of Object.entries(params)){if(v===null||v===undefined)u.searchParams.delete(k);else u.searchParams.set(k,String(v));}win.history.replaceState(null,'',u.pathname+u.search+u.hash);persist();}
function render(){
 if(!win||!win.document.body)return;const doc=win.document;let box=doc.getElementById('yd-app-shell');
 if(!box){box=doc.createElement('header');box.id='yd-app-shell';const old=doc.querySelector('body > header');if(old)old.replaceWith(box);else doc.body.prepend(box);}
 const locked=examSession(win.localStorage),path=win.location.pathname,back=locked?null:(returnTo||previous?.url),resume=locked?examURL(locked):previous?.url;
 const links=[['/','Bản đồ kiến thức'],['/radicals.html','Luyện căn thức'],['/graph02-preview.html?profile=midterm1-hanoi-01','Đề giữa kỳ']];
 box.innerHTML=`<div class="yd-top"><a class="yd-brand" href="${locked?escape(examURL(locked)):'/'}"><b>π</b><span>YOURDREAM<small>HỌC HIỂU · VỮNG BƯỚC</small></span></a><button type="button" id="yd-menu-toggle" aria-expanded="false" aria-controls="yd-main-menu">Menu ☰</button><nav id="yd-main-menu" aria-label="Điều hướng chung">${links.map(([url,label])=>locked&&url!==examURL(locked)?`<span aria-disabled="true">${label} · Khóa khi thi</span>`:`<a href="${url}"${path===url.split('?')[0]?' aria-current="page"':''}>${label}</a>`).join('')}<span aria-disabled="true" title="Mới có thiết kế, chưa có hoạt động tích hợp">STEM Hub · Chưa có</span><span aria-disabled="true" title="Đã lưu bằng chứng luyện tập; màn hình nhật ký đang chờ hoàn thiện">Nhật ký · Chờ hoàn thiện</span></nav></div><div class="yd-context"><nav aria-label="Vị trí học tập">${(context?.crumbs||['Toán 9 · Hà Nội']).map(s=>`<span>${escape(s)}</span>`).join('<span aria-hidden="true"> → </span>')}</nav><div>${back?`<a href="${escape(back)}">← Về vị trí trước</a>`:''}${resume&&resume!==back?`<a href="${escape(resume)}">Tiếp tục vị trí trước</a>`:''}<span id="yd-current">${escape(context?.title||'Đang mở học liệu…')}</span></div></div>${locked?'<p class="yd-exam-notice" role="status">Đang thi thử: nộp bài trước khi mở nội dung học và hỗ trợ. Giới hạn phía trình duyệt.</p>':''}`;
 doc.getElementById('yd-menu-toggle').onclick=()=>{const b=doc.getElementById('yd-menu-toggle');b.setAttribute('aria-expanded',String(b.getAttribute('aria-expanded')!=='true'));};
}
function openSupport(panel){
 if(!win||!panels.includes(panel)||examSession(win.localStorage))return false;
 const el=win.document.getElementById(panel);if(!el)return false;el.open=true;el.scrollIntoView({block:'start',behavior:'auto'});return true;
}
function boot(w){
 win=w;enforce(w);
 previous=read(w.localStorage,CONTEXT_KEY);if(!safeRoute(previous?.url)||previous.url.split('?')[0]===w.location.pathname)previous=null;
 returnTo=safeRoute(new URLSearchParams(w.location.search).get('return_to'));
 w.addEventListener('storage',e=>{if(e.key===EXAM_KEY||e.key===null){enforce(w);w.dispatchEvent(new w.Event('yd-exam-session-changed'));render();}});
 w.addEventListener('pageshow',()=>{enforce(w);w.dispatchEvent(new w.Event('yd-exam-session-changed'));});
 w.document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a)return;const x=examSession(w.localStorage);if(!x)return;const u=new URL(a.href,w.location.href);if(u.origin!==w.location.origin||u.pathname!=='/graph02-preview.html'||u.searchParams.get('profile')!==x.profileId){e.preventDefault();w.location.assign(examURL(x));}},true);
 w.document.addEventListener('DOMContentLoaded',()=>{render();});
}
return {resolveGraphContext,EXAM_KEY,CONTEXT_KEY,safeRoute,examSession,startExam,finishExam,examURL,enforce,setContext,setURL,openSupport,boot};
});
