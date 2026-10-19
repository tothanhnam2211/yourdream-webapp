'use strict';
// Run on the existing authenticated workstation after fast-forwarding the fix branch.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'qa','navigation-staging');
const config=JSON.parse(fs.readFileSync(path.join(root,'wrangler.staging.json'),'utf8'));
if(config.name!=='yourdream-webapp-staging'||!config.d1_databases.some(x=>x.database_id==='4f22972a-ffe0-47d2-aeab-2304b26359d0'))throw Error('Staging Worker/DB configuration does not match the authorized target.');
fs.mkdirSync(qa,{recursive:true});const stages=[];
function run(label,command,args){
 const result=spawnSync(command,args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024});
 const output=(result.stdout||'')+(result.stderr||'');process.stdout.write(output);
 fs.writeFileSync(path.join(qa,label+'.log'),output);
 const status=result.status===0?'PASS':'FAIL';stages.push({stage:label,status,exit_code:result.status});
 fs.writeFileSync(path.join(qa,'completion-results.json'),JSON.stringify({target:config.name,status:'IN_PROGRESS',stages,approval:'NOT_GRANTED'},null,2));
 if(result.error)throw result.error;if(result.status!==0)throw Error(label+' failed; see qa/navigation-staging/'+label+'.log');
}
function npm(label,script){if(process.platform==='win32')run(label,'cmd.exe',['/d','/s','/c','npm run '+script]);else run(label,'npm',['run',script]);}
try{
 run('node-tests',process.execPath,['--disable-warning=ExperimentalWarning','--test','--test-concurrency=1','tests/contract.test.cjs','tests/core03-integration.test.cjs','tests/midterm1-phase-a.test.cjs','tests/learning-navigation.test.cjs']);
 npm('build','build');npm('deploy-staging','deploy:staging');
 run('browser-acceptance',process.execPath,['tests/verify-navigation-browser.cjs']);
 fs.writeFileSync(path.join(qa,'completion-results.json'),JSON.stringify({target:config.name,status:'STAGING_DEPLOYED_BROWSER_VALIDATED',stages,approval:'NOT_GRANTED',production:'UNCHANGED'},null,2));
}catch(e){fs.writeFileSync(path.join(qa,'completion-results.json'),JSON.stringify({target:config.name,status:'INCOMPLETE',stages,error:e.message,approval:'NOT_GRANTED'},null,2));console.error(e.message);process.exitCode=1;}
