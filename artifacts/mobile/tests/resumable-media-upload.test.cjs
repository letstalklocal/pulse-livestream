const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(require.resolve('../utils/resumableMediaUpload.ts'), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const bytes=Uint8Array.from({length:2*1024*1024+19},(_,i)=>i%251);
function harness({lost=false,partial=false,offline=false,cancel=false}={}) {
 let offset=0,handles=0,queries=0,puts=0,fail=lost; const progress=[],controller=new AbortController(),session={uploadUrl:'https://storage.googleapis.com/private-session',objectPath:'/objects/test'};
 const mod={exports:{}};
 vm.runInNewContext(source,{module:mod,exports:mod.exports,URL,AbortController,Uint8Array,
 setTimeout:(fn,ms)=>setTimeout(fn,ms===45000?ms:0),clearTimeout,
 require:id=>{
  if(id==='expo-file-system')return{FileMode:{ReadOnly:'r'},File:class{size=bytes.length;open(){handles++;return{offset:0,readBytes(n){assert.ok(n<=1024*1024);return bytes.slice(this.offset,this.offset+n);},close(){handles--;}};}}};
  if(id==='expo/fetch')return{fetch:async(url,options)=>{
   assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers['Content-Type'],'video/mp4');
   if(offline)throw Error('offline');
   const range=options.headers['Content-Range'];
   if(range.startsWith('bytes */')){queries++;return offset===bytes.length?new Response(null,{status:200}):new Response(null,{status:308,headers:offset?{range:`bytes=0-${offset-1}`}:{}});}
   puts++; const [_,start,end,total]=/bytes (\d+)-(\d+)\/(\d+)/.exec(range);
   assert.equal(+start,offset);assert.equal(+total,bytes.length);assert.deepEqual(options.body,bytes.slice(+start,+end+1));
   offset=fail&&partial?offset+262144:+end+1;
   if(cancel){controller.abort();throw Error('aborted');}
   if(fail){fail=false;throw Error('response lost');}
   return new Response(null,{status:offset===bytes.length?200:308,headers:{range:`bytes=0-${offset-1}`}});
  }};throw Error(id);
 }});
 return{run:()=>mod.exports.uploadPrivateMedia('local','video/mp4',session,controller.signal,p=>progress.push(p)),session,progress,controller,online:()=>offline=false,stats:()=>({offset,handles,queries,puts})};
}
(async()=>{
 for(const options of [{},{lost:true},{lost:true,partial:true}]){
  const h=harness(options);await h.run();assert.equal(h.stats().offset,bytes.length);assert.equal(h.stats().handles,0);assert.equal(h.progress.at(-1),100);assert.equal(h.session.completed,true);
  if(options.lost)assert.ok(h.stats().queries>1);
  const puts=h.stats().puts;await h.run();assert.equal(h.stats().puts,puts,'completed upload reused without retransferring');
 }
 let h=harness({offline:true});await assert.rejects(h.run(),/Upload failed/);h.online();await h.run();assert.equal(h.session.completed,true,'manual retry reuses session');
 h=harness({cancel:true});await assert.rejects(h.run(),/cancelled/);assert.equal(h.stats().handles,0);assert.equal(h.session.completed,undefined);
 h=harness();h.session.uploadUrl='https://evil.example/session';await assert.rejects(h.run());assert.equal(h.stats().puts,0);
 console.log('PASS: private upload chunks, exact partial-offset recovery, lost responses, bounded offline retries, resumed session, completed reuse, cancellation, file cleanup and destination/token isolation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
