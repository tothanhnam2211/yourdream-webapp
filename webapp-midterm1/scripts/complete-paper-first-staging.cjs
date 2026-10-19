'use strict';
// Standalone bundle runner: validate all inputs, back up changed files, then stage only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const standalone=fs.existsSync(path.join(__dirname,'manifest.json'));
const manifestPath=standalone?path.join(__dirname,'manifest.json'):path.join(root,'qa','paper-first','PATCH_MANIFEST.json');
const sourceRoot=standalone?path.join(__dirname,'payload'):root;
const checkOnly=process.argv.includes('--check-only'),applyOnly=process.argv.includes('--apply-only');
const allowed=['public/graph02-preview.html','public/graph02-preview.css','public/graph02-preview.js','tests/midterm1-phase-a.test.cjs','tests/verify-navigation-browser.cjs'];
const normalize=s=>s.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function prepare(){
 const config=JSON.parse(fs.readFileSync(path.join(root,'wrangler.staging.json'),'utf8'));
 if(config.name!=='yourdream-webapp-staging'||!config.d1_databases?.some(x=>x.database_id==='4f22972a-ffe0-47d2-aeab-2304b26359d0'))throw Error('Unexpected staging Worker/DB; no files changed.');
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 if(JSON.stringify(manifest.files.map(x=>x.path).sort())!==JSON.stringify([...allowed].sort()))throw Error('Unexpected patch file list.');
 const files=manifest.files.map(entry=>{
  const source=fs.readFileSync(path.join(sourceRoot,entry.path));
  if(hash(source)!==entry.sha256)throw Error('Bundle hash mismatch: '+entry.path);
  const target=path.join(root,entry.path),before=fs.readFileSync(target);
  const current=hash(normalize(before.toString('utf8')));
  if(current!==entry.base_sha256&&current!==hash(normalize(source.toString('utf8'))))throw Error('Local file has other edits; no files changed: '+entry.path);
  return {...entry,source,target,before};
 });
 return files;
}
function apply(files){
 const backup=path.join(root,'qa','paper-first-staging','backups',new Date().toISOString().replace(/[:.]/g,'-'));
 for(const file of files){
  if(file.before.equals(file.source))continue;
  const saved=path.join(backup,file.path);fs.mkdirSync(path.dirname(saved),{recursive:true});fs.writeFileSync(saved,file.before);
 }
 for(const file of files)fs.writeFileSync(file.target,file.source);
 console.log('PASS: 5 files applied; original files backed up under qa/paper-first-staging/backups.');
}
function main(){
 const files=prepare();
 console.log('PASS: staging target, bundle hashes, and local source match.');
 if(checkOnly)return;
 const chrome=process.env.YOURDREAM_CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
 if(!applyOnly&&!fs.existsSync(chrome))throw Error('Chrome not found; set YOURDREAM_CHROME_PATH. No files changed.');
 apply(files);if(applyOnly)return;
 const output=path.join(root,'qa','paper-first-staging'),stages=[];fs.mkdirSync(output,{recursive:true});
 const receipt={target:'yourdream-webapp-staging',status:'IN_PROGRESS',stages,approval:'NOT_GRANTED_FOR_THIS_UI_UPDATE',production:'UNCHANGED'};
 const save=()=>fs.writeFileSync(path.join(output,'completion-results.json'),JSON.stringify(receipt,null,2)+'\n');
 function run(label,command,args){
  const result=spawnSync(command,args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024,env:{...process.env,YOURDREAM_QA_OUTPUT:output}});
  const log=(result.stdout||'')+(result.stderr||'');process.stdout.write(log);fs.writeFileSync(path.join(output,label+'.log'),log);
  stages.push({stage:label,status:result.status===0?'PASS':'FAIL',exit_code:result.status});save();
  if(result.error)throw result.error;if(result.status!==0)throw Error(label+' failed; see '+output);
 }
 const npm=(label,script)=>process.platform==='win32'?run(label,'cmd.exe',['/d','/s','/c','npm run '+script]):run(label,'npm',['run',script]);
 try{
  run('node-tests',process.execPath,['--disable-warning=ExperimentalWarning','--test','--test-concurrency=1','tests/contract.test.cjs','tests/core03-integration.test.cjs','tests/midterm1-phase-a.test.cjs','tests/learning-navigation.test.cjs']);
  npm('build','build');npm('deploy-staging','deploy:staging');
  run('browser-acceptance',process.execPath,['tests/verify-navigation-browser.cjs']);
  receipt.status='STAGING_DEPLOYED_BROWSER_VALIDATED';save();
 }catch(e){receipt.status='INCOMPLETE';receipt.error=e.message;save();throw e;}
}
try{main();}catch(e){console.error(e.message);process.exitCode=1;}
