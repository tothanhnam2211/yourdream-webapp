'use strict';
const fs=require('node:fs'),path=require('node:path');
const rawContent=fs.readFileSync(path.join(__dirname,'../vendor/radical-steps-v0.1.json'),'utf8');
const options={rawContent,sha256:'a16d43b62b2b667422778ae140f610115625843319efefa513df65b2a4be25d2',engine:require('../vendor/radicals-engine.cjs'),siteId:'test-site'};
function seed(db){db.sqlite.exec(fs.readFileSync(path.join(__dirname,'../src/schema.sql'),'utf8'));
 for(const [subject,role] of [['A','pilot_operator'],['B','pilot_operator'],['S','student'],['T','teacher'],['P','parent']]){
  db.sqlite.prepare('INSERT INTO principals VALUES (?,?,?,?,?)').run('p'+subject,'test-site',subject,'ACTIVE','test');
  db.sqlite.prepare('INSERT INTO learner_profiles VALUES (?,?,?)').run('l'+subject,'p'+subject,'ACTIVE');
  db.sqlite.prepare('INSERT INTO role_grants VALUES (?,?,?,?,?,?,NULL)').run('g'+subject,'p'+subject,role,'site','test-site','explicit-test-fixture');
 }
 const d=JSON.parse(rawContent),key=d.package_id+':'+d.version+':'+options.sha256;
 db.sqlite.prepare('INSERT INTO content_versions VALUES (?,?,?,?,?,?,?,NULL)').run(key,d.package_id,d.version,options.sha256,'DRAFT','real-source-pilot','radicals-engine:rad04');
}
const create=(event='create-1',item='RAD-001')=>({client_event_id:event,package_id:'EXAM-RAD-01',version:'0.1.0-DRAFT',sha256:options.sha256,item_id:item});
const answer=(event='answer-1',revision=0,step='RAD-001:S01',value='3')=>({client_event_id:event,expected_revision:revision,type:'ANSWER_SUBMITTED',step_id:step,answer:value});
module.exports={options,seed,create,answer};
