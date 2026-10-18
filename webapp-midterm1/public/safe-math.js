(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.YourdreamMath=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function formula(tex,katex,display=false){
 const s=String(tex);if(s.length>4000||/\\(?:href|url|includegraphics|html\w*|def|gdef|edef|xdef|newcommand|renewcommand|let|futurelet|catcode|csname|require|input|include|write|openout|read|usepackage)\b/.test(s))return '<code class="math-fallback">'+escape(s)+'</code>';
 try{if(!katex||typeof katex.renderToString!=='function')throw Error('MATH_RENDERER_UNAVAILABLE');return katex.renderToString(s,{trust:false,throwOnError:true,strict:'error',maxExpand:500,maxSize:20,displayMode:display,output:'htmlAndMathml',macros:{}});}catch{return '<code class="math-fallback">'+escape(s)+'</code>';}
}
function mixed(value,katex){
 const s=String(value);if(s.length>20000)return escape(s.slice(0,20000));const re=/\$\$([\s\S]*?)\$\$|\$([^\n$]+?)\$|\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g;let out='',at=0,m;
 while((m=re.exec(s))){out+=escape(s.slice(at,m.index));out+=formula(m[1]??m[2]??m[3]??m[4],katex,m[1]!==undefined||m[4]!==undefined);at=re.lastIndex;}
 return out+escape(s.slice(at));
}
return {escape,formula,mixed};
});
