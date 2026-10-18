'use strict';
const {parentPort,workerData}=require('node:worker_threads'),{LocalD1}=require('./sqlite-d1.cjs'),{options}=require('./fixtures.cjs'),{createService}=require('../src/service.cjs');
(async()=>{const db=new LocalD1(workerData.path),service=await createService(db,options),gate=new Int32Array(workerData.gate);
 db.beforeBatch=async()=>{parentPort.postMessage({ready:true});if(Atomics.wait(gate,0,0,10000)==='timed-out')throw Error('RACE_GATE_TIMEOUT');};
 try{const receipt=await service.submit({subject:'A'},workerData.sid,workerData.request);parentPort.postMessage({status:200,receipt});}catch(e){parentPort.postMessage({status:e.status||500,code:e.code||e.message});}finally{db.close();}
})().catch(e=>{parentPort.postMessage({status:500,code:e.message});});
