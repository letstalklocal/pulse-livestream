const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, mocks) {
 const code=ts.transpileModule(fs.readFileSync(require.resolve(file),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
 const mod={exports:{}};new Function('require','module','exports',code)(id=>{assert.ok(mocks[id],id);return mocks[id];},mod,mod.exports);return mod.exports;
}
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...(n.children??[]).flatMap(nodes)];
let cursor=0;const slots=[],deps=[],effects=[],alerts=[];
const react={createElement:(type,props,...children)=>({type,props:props??{},children}),useState:v=>{const i=cursor++;if(!(i in slots))slots[i]=v;return[slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},useEffect:(fn,next)=>{const i=cursor++;if(!deps[i]||next.some((v,j)=>v!==deps[i][j])){deps[i]=next;effects.push(fn);}}};
const native={View:'View',Text:'Text',TouchableOpacity:'Button',Modal:'Modal',SafeAreaView:'SafeAreaView',ActivityIndicator:'Spinner',StyleSheet:{create:x=>x,hairlineWidth:1},Alert:{alert:(...args)=>alerts.push(args)}};
const i18n={useAppLanguage:()=>({t:s=>s,localizedTextStyle:()=>({})})};
const mocks={react,'react-native':native,'@/i18n':i18n,'@expo/vector-icons':{Ionicons:'Icon'},'expo-image':{Image:'Image'},'@tanstack/react-query':{useQueryClient:()=>({setQueryData(){}})},'@workspace/api-client-react':{useUnlockMediaDm:()=>({mutateAsync:async()=>({mediaUrl:'purchased-url',balance:99})}),getGetCoinBalanceQueryKey:()=>[]},'@/hooks/useColors':{useColors:()=>({})},'@/context/AuthContext':{useAuth:()=>({user:{uid:1}})},'./DirectVideoThumbnail':{DirectVideoThumbnail:'Thumbnail'},'./DirectMessageVideo':{DirectMessageVideo:'Video'}};
const {DirectMediaMessage}=load('../components/DirectMediaMessage.tsx',mocks);
function render(message){cursor=0;let tree=DirectMediaMessage({message,mine:false});if(effects.length){effects.splice(0).forEach(fn=>fn());cursor=0;tree=DirectMediaMessage({message,mine:false});}return tree;}
(async()=>{
 let message={messageId:'1',mediaType:'video',mediaUrl:'video-url',price:0};
 let tree=render(message);
 assert.equal(nodes(tree).some(n=>n.type==='Image'&&n.props.source?.uri==='video-url'),false,'Video is never sent to an image decoder');
 assert.equal(nodes(tree).some(n=>n.type==='Video'),false,'No player loads in a closed message');
 assert.equal(nodes(tree).find(n=>n.type==='Thumbnail').props.uri,'video-url','Authorized video receives a real thumbnail');
 nodes(tree).find(n=>n.props.testID==='media-msg-1').props.onPress();tree=render(message);
 assert.equal(nodes(tree).find(n=>n.type==='Video').props.uri,'video-url');
 nodes(tree).find(n=>n.type==='Modal').props.onRequestClose();tree=render(message);
 assert.equal(nodes(tree).some(n=>n.type==='Video'),false,'Closing unmounts the player');
 message={...message,mediaUrl:'refreshed-url'};tree=render(message);nodes(tree).find(n=>n.props.testID==='media-msg-1').props.onPress();tree=render(message);
 assert.equal(nodes(tree).find(n=>n.type==='Video').props.uri,'refreshed-url','Uses refreshed signed URLs');
 message={messageId:'2',mediaType:'video',previewUrl:'locked-video',price:10};tree=render(message);
 assert.equal(nodes(tree).some(n=>n.type==='Video'),false);
 assert.equal(nodes(tree).some(n=>n.type==='Thumbnail'),false,'Locked video never extracts a private frame');
 nodes(tree).find(n=>n.props.testID==='media-msg-2').props.onPress();
 assert.equal(alerts.length,1,'Locked video still requires purchase confirmation');
 await alerts[0][2][1].onPress();tree=render(message);nodes(tree).find(n=>n.props.testID==='media-msg-2').props.onPress();tree=render(message);
 assert.equal(nodes(tree).find(n=>n.type==='Video').props.uri,'purchased-url');
 message={messageId:'3',mediaType:'image',mediaUrl:'photo-url',price:0};tree=render(message);nodes(tree).find(n=>n.props.testID==='media-msg-3').props.onPress();tree=render(message);
 assert.equal(nodes(tree).some(n=>n.type==='Video'),false);
 assert.ok(nodes(tree).some(n=>n.type==='Image'&&n.props.contentFit==='contain'),'Photos retain their full-screen renderer');
 let played=0,paused=0,onState,removed=0;const cleanup=[];
 const player={status:'readyToPlay',play:()=>played++,pause:()=>paused++};
 const {DirectMessageVideo}=load('../components/DirectMessageVideo.tsx',{react:{...react,useEffect:fn=>cleanup.push(fn())},'react-native':{...native,AppState:{addEventListener:(_,fn)=>{onState=fn;return{remove:()=>removed++};}}},'@/i18n':i18n,expo:{useEvent:()=>({status:'readyToPlay'})},'expo-video':{useVideoPlayer:(source,setup)=>{assert.equal(source.contentType,'progressive');setup(player);return player;},VideoView:'NativeVideo'}});
 tree=DirectMessageVideo({uri:'signed-video'});assert.equal(played,1);assert.equal(nodes(tree).find(n=>n.type==='NativeVideo').props.nativeControls,true);
 onState('background');assert.equal(paused,1);cleanup.forEach(fn=>fn());assert.equal(removed,1);
 const galleryReact={...react,useState:initial=>[initial,()=>{}]};
 const {MediaPackGallery}=load('../components/MediaPackGallery.tsx',{react:galleryReact,'react-native':{...native,FlatList:'List',useWindowDimensions:()=>({width:390,height:800})},'expo-image':{Image:'Image'},'@expo/vector-icons':{Ionicons:'Icon'},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0})},'@/i18n':i18n,'./DirectMessageVideo':{DirectMessageVideo:'Video'}});
 const gallery=MediaPackGallery({items:[{id:'video',mediaType:'video',mediaUrl:'pack-video'},{id:'photo',mediaType:'image',mediaUrl:'pack-photo'}],onClose:()=>{},embedded:true});
 const galleryList=nodes(gallery).find(n=>n.type==='List');
 assert.equal(nodes(galleryList.props.renderItem({item:galleryList.props.data[0],index:0})).find(n=>n.type==='Video').props.uri,'pack-video','Opening a pack video uses the autoplay DM player');
 assert.equal(nodes(galleryList.props.renderItem({item:galleryList.props.data[1],index:1})).some(n=>n.type==='Video'),false,'Photo pages do not mount a video player');
 const chooser = fs.readFileSync(require.resolve('../components/MediaChooser.tsx'), 'utf8');
 const uploadCode = ts.transpileModule(chooser.slice(chooser.indexOf('  const performUpload ='), chooser.indexOf('  const handleClose =')), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
 for (const [type, mimeType, expected] of [['video', undefined, 'video/mp4'], ['video', 'video/quicktime', 'video/quicktime'], ['image', undefined, 'image/jpeg']]) {
  const seen = {};
  const scope = { asset: {type, mimeType, uri:'local', width:100, height:100}, peerId:'2', AbortController, sendingNow:{current:false}, transfer:{current:null},pending:{current:null},setSending(){},setUploadProgress(){}, setUploading(){},setError(){},setAsset(){},onMediaSent(){},onClose(){},File:class{},requestUpload:{mutateAsync:async request=>{seen.request=request.data.contentType;return {uploadUrl:'upload',objectPath:'/objects/fixture'};}},uploadPrivateMedia:async(uri,contentType)=>{seen.put=contentType;},sendMediaDm:{mutateAsync:async request=>{seen.message=request.data.contentType;}} };
  await new Function(...Object.keys(scope),uploadCode+'\nreturn performUpload;')(...Object.values(scope))(0);
  assert.deepEqual(seen,{request:expected,put:expected,message:expected},'Signing, upload and message agree on the media type');
 }
 console.log('PASS: individual DM videos use native playback only when opened and authorized; close, background, URL refresh, purchase and photo behavior preserved.');
})().catch(e=>{console.error(e);process.exitCode=1;});
