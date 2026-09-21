const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=ts.transpileModule(fs.readFileSync(require('node:path').resolve(__dirname,'../../../lib/api-client-react/src/custom-fetch.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};vm.runInNewContext(source,{module:mod,exports:mod.exports,Response,Headers,URL,AbortController,setTimeout,clearTimeout});
for(const contentType of ['text/html','text/plain']){
 const response=new Response(null,{status:500,statusText:'Internal Server Error',headers:{'Content-Type':contentType}});
 const error=new mod.exports.ApiError(response,'<!DOCTYPE html><html><body><pre>Internal Server Error</pre><script src="https://i.replit.com/script.js"></script></body></html>',{method:'POST',url:'/api/media-packs'});
 assert.equal(error.message,'HTTP 500 Internal Server Error: Please try again.');assert.equal(error.status,500);
}
const json=new mod.exports.ApiError(new Response(null,{status:400}),{error:'Choose a valid sticker gift'},{method:'POST',url:'/api/media-packs'});
assert.ok(json.message.includes('Choose a valid sticker gift'),'structured validation stays useful');
console.log('PASS: HTML server/proxy errors hidden, status retained, JSON validation preserved.');
