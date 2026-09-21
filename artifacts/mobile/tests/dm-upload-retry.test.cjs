const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const chooser=fs.readFileSync(require.resolve('../components/MediaChooser.tsx'),'utf8');
const code=ts.transpileModule(chooser.slice(chooser.indexOf('  const performUpload ='),chooser.indexOf('  const handleClose =')),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
(async()=>{
 const sent=[],errors=[];let sessions=0,uploaded=0,closed=0,fail=true,release;
 const scope={AbortController,asset:{type:'video',uri:'local',width:100,height:100},peerId:'42',sendingNow:{current:false},pending:{current:null},transfer:{current:null},setSending(){},setUploading(){},setUploadProgress(){},setError:e=>errors.push(e),setAsset(){},onMediaSent(){},onClose:()=>closed++,requestUpload:{mutateAsync:async({data})=>{sessions++;assert.equal(data.resumable,true);return{uploadUrl:'private',objectPath:'/objects/test'};}},uploadPrivateMedia:async(uri,mime,session,signal,progress)=>{if(!session.completed){uploaded++;session.completed=true;}progress(100);},sendMediaDm:{mutateAsync:async({data})=>{sent.push(data);if(fail)throw Error('response lost');}}};
 const send=new Function(...Object.keys(scope),code+'\nreturn performUpload;')(...Object.values(scope));
 await send(5);assert.equal(closed,0);fail=false;await send(9);
 assert.equal(sessions,1);assert.equal(uploaded,1);assert.deepEqual(sent[0],sent[1],'retry preserves original recipient, price, object and idempotency key');assert.equal(closed,1);
 scope.sendMediaDm.mutateAsync=async()=>new Promise(r=>release=r);
 const first=send(0);await new Promise(setImmediate);await send(0);assert.equal(sessions,2,'rapid second tap creates no second session');release();await first;
 console.log('PASS: lost send response retries identical message without reupload, original price retained, rapid taps guarded, successful send closes once.');
})().catch(e=>{console.error(e);process.exitCode=1;});
