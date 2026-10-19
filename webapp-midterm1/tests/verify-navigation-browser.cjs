'use strict';
// Uses an isolated Chrome profile. No package installation, credentials, or student data.
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const BASE=(process.env.STAGING_BASE_URL||'https://yourdream-webapp-staging.tothanhnam.workers.dev').replace(/\/$/,'');
assert.equal(new URL(BASE).hostname,'yourdream-webapp-staging.tothanhnam.workers.dev','This acceptance runner is staging-only.');
const chrome=process.env.YOURDREAM_CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const output=path.resolve(process.env.YOURDREAM_QA_OUTPUT||'qa/navigation-staging');
const results=[],errors=[];let proc,cdp,profile;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
class CDP{
 constructor(url){this.url=url;this.seq=0;this.pending=new Map();this.loads=0;}
 async connect(){this.ws=new WebSocket(this.url);await new Promise((ok,no)=>{this.ws.addEventListener('open',ok,{once:true});this.ws.addEventListener('error',no,{once:true});});this.ws.addEventListener('message',e=>{const x=JSON.parse(e.data);if(x.id){const p=this.pending.get(x.id);if(p){clearTimeout(p.timer);this.pending.delete(x.id);x.error?p.no(Error(JSON.stringify(x.error))):p.ok(x.result);}}else if(x.method==='Page.loadEventFired')this.loads++;else if(x.method==='Runtime.exceptionThrown')errors.push(x.params.exceptionDetails.text+': '+(x.params.exceptionDetails.exception?.description||''));});await this.send('Runtime.enable');await this.send('Page.enable');}
 send(method,params={}){return new Promise((ok,no)=>{const id=++this.seq;const timer=setTimeout(()=>{this.pending.delete(id);no(Error('CDP timeout: '+method));},15000);this.pending.set(id,{ok,no,timer});this.ws.send(JSON.stringify({id,method,params}));});}
 async eval(expression){const r=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;}
 async wait(expression){const until=Date.now()+15000;let last;while(Date.now()<until){try{last=await this.eval(expression);if(last)return last;}catch{}await delay(100);}throw Error('Page did not reach expected state: '+expression+'; last='+JSON.stringify(last));}
 async navigate(method,params={}){const before=this.loads;await this.send(method,params);const until=Date.now()+15000;while(this.loads===before&&Date.now()<until)await delay(50);assert.ok(this.loads>before,'Expected a full page load');await this.wait('document.readyState === "complete"');}
 async go(url){await this.navigate('Page.navigate',{url});}
 async click(selector){await this.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing control');e.click();})()`);}
 async shot(name){const r=await this.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(r.data,'base64'));}
 close(){this.ws.close();}
}
async function check(name,fn){await fn();results.push({name,status:'PASS'});console.log('PASS',name);}
async function pageReady(){await cdp.wait('!!document.querySelector("#yd-app-shell")');}
async function examReady(){await cdp.wait('!!window.YourdreamPreview?.getData() && document.querySelector("#yd-support-actions") && document.querySelector("#load-error").hidden');}
async function selectedPart(){return cdp.eval('({item:window.YourdreamPreview.getState().itemId,part:window.YourdreamPreview.getState().activePartKey,step:window.YourdreamPreview.getState().stepId})');}
async function main(){
 assert.ok(fs.existsSync(chrome),'Chrome not found. Set YOURDREAM_CHROME_PATH to an installed Chrome executable.');
 fs.mkdirSync(output,{recursive:true});profile=fs.mkdtempSync(path.join(os.tmpdir(),'yourdream-nav-'));
 proc=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 proc.on('error',e=>errors.push(e.message));
 const portFile=path.join(profile,'DevToolsActivePort');const deadline=Date.now()+15000;
 while(!fs.existsSync(portFile)&&Date.now()<deadline)await delay(100);
 assert.ok(fs.existsSync(portFile),'Chrome debugging endpoint did not start.');
 const port=fs.readFileSync(portFile,'utf8').split('\n')[0];
 const tabs=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 const target=tabs.find(t=>t.type==='page');assert.ok(target);cdp=new CDP(target.webSocketDebuggerUrl);await cdp.connect();
 for(const width of [1280,375]){
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:920,deviceScaleFactor:1,mobile:width===375});
  await check('A '+width+' · map → lesson → practice → exact topic/tab',async()=>{
   await cdp.go(BASE+'/');await pageReady();
   await cdp.click('[data-topic="0,1"]');await cdp.click('[data-tab="1"]');
   await cdp.click('#panel a[href*="item=RAD-001"]');
   await cdp.wait('document.querySelector("#exercise-title")?.textContent === "Tách và gom căn"');
   assert.equal(await cdp.eval('new URL(location.href).searchParams.get("item")'),'RAD-001');
   await cdp.eval(`document.querySelector('#yd-app-shell .yd-context a').click()`);
   await cdp.wait('document.querySelector("#topicselect")?.value === "0,1"');
   assert.equal(await cdp.eval('document.querySelector("[data-tab=\\"1\\"]").getAttribute("aria-selected")'),'true');
  });
  await check('B '+width+' · exam paper → correct part → paper',async()=>{
   await cdp.go(BASE+'/graph02-preview.html?profile=midterm1-hanoi-01');await examReady();
   assert.equal(await cdp.eval('document.querySelector("#workspace").hidden'),true,'Menu entry shows only the paper, including with saved progress');
   assert.equal(await cdp.eval('document.querySelector("#workspace").getBoundingClientRect().width'),0);
   assert.equal(await cdp.eval('document.querySelectorAll("#exam-paper-list .exam-paper-item").length'),5);
   await cdp.shot('paper-first-'+width);
   await cdp.click('[data-paper-item="YD-G09-MID1-01:G04"][data-paper-part="y_2b"]');
   assert.equal(await cdp.eval('document.querySelector("#workspace").hidden'),false);
   assert.equal(await cdp.eval('Array.from(document.querySelectorAll("#workspace > details")).every(p=>p.hidden && !p.open)'),true);
   assert.deepEqual(await selectedPart(),{item:'YD-G09-MID1-01:G04',part:'y_2b',step:'YD-G09-MID1-01:G04:S03'});
   await cdp.click('[data-action="back-to-paper"]');
   assert.equal(await cdp.eval('document.querySelector("#paper-sheet-shell").dataset.mobileView'),'paper');
   assert.equal(await cdp.eval('document.querySelector("#workspace").hidden'),true);
  });
  await check('C '+width+' · draft → guidance → sheet → reload',async()=>{
   await cdp.click('[data-paper-item="YD-G09-MID1-01:G01"][data-paper-part="y_1"]');
   const selected=await selectedPart();
   const draft=await cdp.eval(`(()=>{const input=document.querySelector('#answer-fields input[name="choice"]');input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));return input.value;})()`);
   await cdp.click('[data-yd-support="exercise-mindmap"]');
   assert.equal(await cdp.eval('document.querySelector("#exercise-mindmap").open'),true);
   assert.equal(await cdp.eval('document.querySelector("#exercise-mindmap").hidden'),false);
   assert.equal(await cdp.eval('document.querySelector("#model-solution-panel").hidden'),true);
   await cdp.click('[data-yd-return]');assert.deepEqual(await selectedPart(),selected);
   assert.equal(await cdp.eval('document.querySelector("#exercise-mindmap").hidden'),true);
   await cdp.navigate('Page.reload');await examReady();
   assert.equal(await cdp.eval('document.querySelector("#workspace").hidden'),false,'A valid sheet URL restores the selected part on reload');
   assert.deepEqual(await selectedPart(),selected);
   assert.equal(await cdp.eval('document.querySelector("#answer-fields input[name=choice]:checked")?.value'),draft);
   assert.equal(await cdp.eval('document.documentElement.scrollWidth<=innerWidth'),true,'No horizontal page overflow');
   if(width===375){await cdp.click('#yd-menu-toggle');assert.equal(await cdp.eval('document.querySelector("#yd-menu-toggle").getAttribute("aria-expanded")'),'true');}
   await cdp.shot('navigation-sheet-'+width);
  });
  await check('D '+width+' · unavailable STEM/journal have no active links',async()=>{
   assert.equal(await cdp.eval(`Array.from(document.querySelectorAll('#yd-main-menu a')).some(a=>/STEM|Nhật ký/.test(a.textContent))`),false);
  });
  await check('E '+width+' · exam reload, direct route, other-profile, back-navigation gate; submit unlocks',async()=>{
   await cdp.click('#exam-mode-btn');
   for(const url of [BASE+'/radicals.html?item=RAD-001',BASE+'/',BASE+'/blueprint.html',BASE+'/graph02-preview.html?profile=legacy#model-solution-panel']){
    await cdp.go(url);await examReady();
    assert.equal(await cdp.eval('new URL(location.href).searchParams.get("profile")'),'midterm1-hanoi-01');
    assert.equal(await cdp.eval('document.querySelector("#practice-mode-btn").disabled'),true);
    assert.equal(await cdp.eval('document.querySelector("#profile-select").disabled'),true);
    assert.equal(await cdp.eval('document.querySelector("#hint-button").disabled'),true);
    assert.equal(await cdp.eval('document.querySelector("#step-after").textContent'),'');
    assert.equal(await cdp.eval('Array.from(document.querySelectorAll("[data-yd-support]")).every(b=>b.disabled)'),true);
    assert.equal(await cdp.eval('document.querySelector("#model-solution-list").textContent.trim()'),'');
   }
   await cdp.navigate('Page.reload');await examReady();assert.equal(await cdp.eval('document.querySelector("#practice-mode-btn").disabled'),true);
   const history=await cdp.send('Page.getNavigationHistory');const prior=history.entries.slice(0,history.currentIndex).reverse().find(e=>e.url.startsWith(BASE+'/')&&!e.url.includes('/graph02-preview.html'));assert.ok(prior);await cdp.send('Page.navigateToHistoryEntry',{entryId:prior.id});await delay(200);await examReady();
   assert.equal(await cdp.eval('document.querySelector("#practice-mode-btn").disabled'),true);
   await cdp.shot('navigation-exam-locked-'+width);
   await cdp.click('#submit-exam-btn');
   assert.equal(await cdp.eval('document.querySelector("#practice-mode-btn").disabled'),false);
   await cdp.click('[data-paper-item="YD-G09-MID1-01:G01"][data-paper-part="y_1"]');
   await cdp.click('[data-yd-support="model-solution-panel"]');assert.equal(await cdp.eval('document.querySelector("#model-solution-panel").open'),true);
   await cdp.go(BASE+'/');await pageReady();await cdp.wait('!!document.querySelector("#panel")');
  });
 }
 assert.deepEqual(errors,[],'No unhandled runtime exceptions');
}
main().then(()=>{fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify({base_url:BASE,status:'PASS',results,runtime_errors:errors,stem_activity_flow:'NOT_APPLICABLE_DESIGN_ONLY'},null,2));}).catch(e=>{process.exitCode=1;console.error(e.stack);fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify({base_url:BASE,status:'FAIL',results,error:e.message,runtime_errors:errors},null,2));}).finally(async()=>{if(cdp)cdp.close();if(proc)proc.kill();if(profile){await delay(300);try{fs.rmSync(profile,{recursive:true,force:true});}catch{}}});
