'use strict';
const {DatabaseSync}=require('node:sqlite');
class LocalD1 {
 constructor(path){this.sqlite=new DatabaseSync(path);this.sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000;');this.beforeBatch=null;this.failAfter=null;}
 prepare(sql){const db=this;return {sql,args:[],bind(...args){return {...this,args,first:async()=>db.sqlite.prepare(sql).get(...args)||null,all:async()=>({results:db.sqlite.prepare(sql).all(...args)} )};}};}
 async batch(statements){if(this.beforeBatch)await this.beforeBatch();this.sqlite.exec('BEGIN IMMEDIATE');try{const results=[];for(let i=0;i<statements.length;i++){const s=statements[i];const r=this.sqlite.prepare(s.sql).run(...s.args);results.push({success:true,meta:{changes:r.changes}});if(this.failAfter===i)throw Error('INJECTED_BATCH_FAILURE');}this.sqlite.exec('COMMIT');return results;}catch(e){this.sqlite.exec('ROLLBACK');throw e;}}
 close(){this.sqlite.close();}
}
module.exports={LocalD1};
