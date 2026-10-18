(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadicalProfiles=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const own=(o,k)=>Object.hasOwn(o,k),id=x=>typeof x==='string'&&/^[A-Za-z0-9:._-]{1,100}$/.test(x)&&!['__proto__','constructor','prototype'].includes(x);
function need(ok,why){if(!ok)throw Error('PROFILE_INVALID:'+why);}
function text(v){return typeof v==='string'&&v.length>0&&v.length<=20000;}
function unique(items,key){const m=new Map();for(const x of items){need(x&&id(x[key])&&!m.has(x[key]),'DUPLICATE_OR_INVALID_'+key);m.set(x[key],x);}return m;}
function layout(g,steps){
 const depth=new Map(),pending=new Set(g.step_ids);let col=0;
 while(pending.size){const row=[...pending].filter(k=>steps[k].requires.every(p=>depth.has(p)));need(row.length,'CYCLE');for(const k of row){depth.set(k,Math.max(-1,...steps[k].requires.map(p=>depth.get(p)))+1);pending.delete(k);}col++;}
 const columns=new Map();for(const k of g.step_ids){const d=depth.get(k);if(!columns.has(d))columns.set(d,[]);columns.get(d).push(k);}
 const points=Object.create(null);for(const [d,ids] of columns)ids.forEach((k,i)=>{points[k]=[155+d*310,65+i*105];});
 return {points,width:Math.max(360,(Math.max(...depth.values())+1)*310),height:Math.max(180,Math.max(...[...columns.values()].map(x=>x.length))*105+40)};
}
function load(payload,profile,engine){
 need(payload&&typeof payload==='object'&&!Array.isArray(payload),'PAYLOAD');let data;
 if(profile==='legacy-rad01'){
  engine.validate(payload);data=structuredClone(payload);
  data.graphs=data.graphs.map(g=>({...g,title:g.prompt,subtitle:g.conditions.join(' · '),completion_policy:'ALL_STEPS_CORRECT',subquestion_step_groups:null}));
  data.knowledge_nodes=Array.isArray(payload.knowledge_skills)?payload.knowledge_skills.map(k=>({node_id:k.skill_id,title:k.title})):[];
 }else if(profile==='lesson-contract-v01'){
  need(payload.schema_version==='yourdream.webapp.lesson.integration.0.1-DRAFT'&&payload.status==='DRAFT'&&payload.runtime_target==='PROPOSED_ADAPTER_NOT_IMPLEMENTED'&&payload.supports_secure_assessment===false,'CONTRACT_OR_AUDIENCE');
  need(text(payload.package_id)&&text(payload.package_version),'PACKAGE');
  need(Array.isArray(payload.step_graphs)&&payload.step_graphs.length>0&&payload.step_graphs.length<=100,'GRAPH_COUNT');
  need(Array.isArray(payload.knowledge_nodes)&&Array.isArray(payload.sources),'REFERENCES');
  const nodes=unique(payload.knowledge_nodes,'node_id'),sources=unique(payload.sources,'source_id');unique(payload.step_graphs,'graph_id');
  data={package_id:payload.package_id,version:payload.package_version,graphs:[],steps:[],knowledge_nodes:payload.knowledge_nodes.map(n=>({node_id:n.node_id,title:n.title}))};const stepSeen=new Set();
  for(const graph of payload.step_graphs){
   need(graph.canonical_item_id===null||id(graph.canonical_item_id),'CANONICAL_SHAPE'); // display-only, never allocate/register IDs
   need(text(graph.prompt)&&text(graph.original_domain)&&graph.completion_policy==='ALL_STEPS_CORRECT','GRAPH_METADATA');
   need(Array.isArray(graph.steps)&&graph.steps.length>0&&graph.steps.length<=100,'STEP_COUNT');
   const local=unique(graph.steps,'step_id');const itemId=graph.graph_id; // local runtime identity, never substitute a canonical ID
   const edges=new Set();need(Array.isArray(graph.edges),'EDGES');
   for(const e of graph.edges){need(e&&e.kind==='REQUIRES'&&local.has(e.from)&&local.has(e.to)&&e.from!==e.to,'EDGE_REF');const pair=e.from+'>'+e.to;need(!edges.has(pair),'DUPLICATE_EDGE');edges.add(pair);}
   const expectedEdges=new Set();
   for(const s of graph.steps){
    need(!stepSeen.has(s.step_id),'CROSS_GRAPH_STEP');stepSeen.add(s.step_id);
    need(['title','before','after','justification'].every(k=>text(s[k])),'STEP_TEXT');
    need(Array.isArray(s.requires)&&new Set(s.requires).size===s.requires.length&&s.requires.every(p=>local.has(p)&&p!==s.step_id),'REQUIRES');
    for(const p of s.requires)expectedEdges.add(p+'>'+s.step_id);
    need(Array.isArray(s.node_ids)&&s.node_ids.length&&s.node_ids.every(k=>nodes.has(k))&&Array.isArray(s.source_ids)&&s.source_ids.length&&s.source_ids.every(k=>sources.has(k)),'STEP_REFERENCES');
    need(Array.isArray(s.conditions_in_context)&&s.conditions_in_context.every(text),'CONDITIONS');
    const a=s.interaction;need(a&&['rational','choice'].includes(a.answer_type)&&text(a.prompt)&&a.unknown_response_policy==='NEEDS_REVIEW','INTERACTION');engine.normalize(a.answer_type,a.expected);
    need(a.choices&&typeof a.choices==='object'&&!Array.isArray(a.choices)&&Object.entries(a.choices).every(([k,v])=>id(k)&&text(v)),'CHOICES');
    if(a.answer_type==='choice')need(own(a.choices,a.expected),'EXPECTED_CHOICE');else need(Object.keys(a.choices).length===0,'RATIONAL_CHOICES');
    need(Array.isArray(s.hints)&&s.hints.length===3&&s.hints.every((h,i)=>h.level===i+1&&text(h.text)&&h.reveal_when==='EXPLICIT_HINT_REQUEST_IN_PRACTICE'),'HINTS');
    need(s.feedback&&['correct','incorrect','unknown'].every(k=>text(s.feedback[k])),'FEEDBACK');
    if(s.feedback.by_choice){const f=s.feedback.by_choice;need(a.answer_type==='choice'&&Object.keys(f).length===Object.keys(a.choices).length&&Object.entries(a.choices).every(([k])=>own(f,k)&&text(f[k].message)&&f[k].expected_status===(k===a.expected?'CORRECT':'TRY_AGAIN')),'BY_CHOICE');}
    data.steps.push({...s,item_id:itemId,skill_refs:s.node_ids});
   }
   need(edges.size===expectedEdges.size&&[...edges].every(k=>expectedEdges.has(k)),'EDGES_REQUIRES_MISMATCH');
   const stepIds=[...local.keys()],terminals=stepIds.filter(k=>!graph.edges.some(e=>e.from===k));
   need(Array.isArray(graph.terminal_step_ids)&&new Set(graph.terminal_step_ids).size===graph.terminal_step_ids.length&&terminals.length===graph.terminal_step_ids.length&&terminals.every(k=>graph.terminal_step_ids.includes(k)),'TERMINALS');
   let subquestions=null;
   if(graph.subquestion_step_groups){need(typeof graph.subquestion_step_groups==='object'&&!Array.isArray(graph.subquestion_step_groups),'SUBQUESTION');subquestions=Object.create(null);for(const [gk,ids] of Object.entries(graph.subquestion_step_groups)){need(id(gk)&&Array.isArray(ids)&&ids.every(k=>local.has(k)),'SUBQUESTION');subquestions[gk]=[...ids];}}
   data.graphs.push({item_id:itemId,node_id:null,title:graph.prompt,subtitle:graph.original_domain,prompt:graph.prompt,conditions:[graph.original_domain],step_ids:stepIds,terminal_step_ids:graph.terminal_step_ids,completion_policy:graph.completion_policy,edges:graph.edges,subquestion_step_groups:subquestions});
  }
 }else throw Error('PROFILE_NOT_ALLOWED');
 const by=Object.fromEntries(data.steps.map(s=>[s.step_id,s]));for(const g of data.graphs)layout(g,by);return data;
}
function evaluate(engine,data,stepId,answer,completed){
 const result=engine.evaluate(data,stepId,answer,completed),s=data.steps.find(s=>s.step_id===stepId);
 if(s&&s.interaction.answer_type==='choice'&&typeof answer==='string'&&own(s.interaction.choices,answer)&&s.feedback.by_choice&&own(s.feedback.by_choice,answer)){
  const f=s.feedback.by_choice[answer];if(f&&f.expected_status===result.status&&text(f.message))return {...result,feedback:f.message,diagnosis_code:f.diagnosis_code};
 }
 return result;
}
function complete(graph,completed){need(graph.completion_policy==='ALL_STEPS_CORRECT','COMPLETION_POLICY');return graph.step_ids.every(id=>completed.has(id));}
return {load,layout,evaluate,complete};
});
