import { i18nMock } from './i18n-mock.mjs';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const out = fileURLToPath(new URL(`.party-window-${randomUUID()}.cjs`, import.meta.url));
const mocks = {
  '@/i18n': i18nMock,
  react: `
    let slots=[], index=0, effects=[], dirty=false;
    export const createElement=(type,props,...children)=>({type,props:{...props,children}});
    export default {createElement};
    export function useState(initial){const i=index++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{const next=typeof v==='function'?v(slots[i]):v;if(next!==slots[i]){slots[i]=next;dirty=true}}]}
    export function useRef(value){const i=index++;return slots[i]??(slots[i]={current:value})}
    export function useEffect(fn,deps){const i=index++;if(!slots[i]||deps.some((v,j)=>v!==slots[i].deps[j])){effects.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:fn()}})}}
    export function reset(){slots.forEach(s=>s?.cleanup?.());slots=[];index=0;effects=[];dirty=false}
    export function render(Component,props){let tree;do{dirty=false;index=0;effects=[];tree=Component(props);effects.forEach(f=>f())}while(dirty);return tree}
  `,
  'react/jsx-runtime': `export const jsx=(type,props)=>({type,props:{...props,children:[props.children]}});export const jsxs=jsx;`,
  'react-native': `
    export const Modal='Modal',View='View',Text='Text',Pressable='Pressable',TouchableOpacity='TouchableOpacity',ActivityIndicator='ActivityIndicator';
    export const StyleSheet={create:s=>s,absoluteFill:{position:'absolute'}};
    export const useWindowDimensions=()=>({width:360,height:800});
    export const PanResponder={create:handlers=>({panHandlers:handlers})};
    export const Animated={View:'Animated.View',Value:class{constructor(v){this.value=v}setValue(v){this.value=v}},timing:(value,config)=>({start(){value.setValue(config.toValue)},stop(){}})};
  `,
  'react-native-safe-area-context': `export const useSafeAreaInsets=()=>({top:24,bottom:24});`,
  '@expo/vector-icons': `export const Ionicons='Icon';`,
  '@/utils/agora': `export const RtcSurfaceViewComponent='NativeVideo',VideoSourceType={VideoSourceRemote:0};`,
  '@workspace/api-client-react': `export const actOnStreamParty=async()=>({});export const getPartyMedia=async()=>({});`,
  '@/utils/partyConnection': `export const joins=[];export function openPartyConnection(engine,fetchToken,uid,onState,isMuted){joins.push({uid,isMuted});onState({connection:{channelId:'partner-channel',localUid:99},ready:true,error:null});return ()=>{}}`,
  './Avatar': `export const Avatar='Avatar';`,
};
try {
  await build({
    stdin: {contents:`export {PartyStage} from '../../mobile/components/PartyStage';export {render,reset} from 'react';export {usePartyMedia} from '../../mobile/hooks/usePartyMedia';export {joins} from '@/utils/partyConnection';export {openPartyConnection} from '../../mobile/utils/partyConnection';`,resolveDir:fileURLToPath(new URL('.',import.meta.url))},
    bundle:true,platform:'node',format:'cjs',jsx:'transform',outfile:out,logLevel:'silent',
    plugins:[{name:'native-mocks',setup(b){
      b.onResolve({filter:/.*/},a=>{
        if(a.path in mocks)return {path:a.path,namespace:'mock'};
        if(a.path==='@/utils/partyLayout')return {path:fileURLToPath(new URL('../../mobile/utils/partyLayout.ts',import.meta.url))};
      });
      b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path]}));
    }}],
  });
  const {PartyStage,render,reset,usePartyMedia,joins,openPartyConnection}=createRequire(import.meta.url)(out);
  const participants=[{uid:1,channelId:'first',name:'First'},{uid:2,channelId:'second',name:'Second'}];
  const interactions=[];
  const audioRequests=[];
  const props={main:'main-video',mainName:'First',channelId:'first',now:100,
    party:{id:'party-1',status:'active',participants},
    media:{connection:{channelId:'second',localUid:5},ready:true,retry(){},audioMuted:false,audioError:null,setAudioMuted:v=>audioRequests.push(v)},
    onWindowInteraction:v=>interactions.push(v)};
  const nodes=t=>!t||typeof t!=='object'?[]:[t,...(t.props?.children??[]).flat(Infinity).flatMap(nodes)];
  let tree;
  const refresh=()=>{tree=render(PartyStage,props)};
  const find=pred=>nodes(tree).find(pred);
  const panel=()=>find(n=>n.type==='Animated.View');
  const resize=()=>find(n=>n.type==='Pressable'&&n.props.accessibilityHint);
  const restore=()=>find(n=>n.type==='Pressable'&&n.props.accessibilityLabel?.startsWith('Show '));
  const layout=()=>Object.assign({},...panel().props.style);
  const swipe=(dx,dy=0,vx=0)=>{
    const p=panel().props;p.onTouchStart();
    assert.equal(p.onMoveShouldSetPanResponderCapture(null,{dx,dy}),true);
    p.onPanResponderRelease(null,{dx,dy,vx});refresh();
  };
  refresh();
  assert.equal(layout().width,120);
  assert.equal(layout().height,120*16/9);
  assert.equal(layout().left,228);
  const pinnedTop=layout().top;
  assert.equal(pinnedTop,24+92+14);
  assert.equal(find(n=>n.type==='Text'&&n.props.children?.includes('Second')),undefined,'No partner name strip');
  resize().props.onLongPress();resize().props.onPress();refresh();
  assert.equal(layout().width,120,'Long press does not resize');
  assert.ok(find(n=>n.type==='Modal'));
  find(n=>n.props?.accessibilityLabel==='Mute partner audio').props.onPress();
  assert.deepEqual(audioRequests,[true]);
  props.media.audioMuted=true;refresh();
  find(n=>n.props?.accessibilityLabel==='Unmute partner audio').props.onPress();
  assert.deepEqual(audioRequests,[true,false]);
  find(n=>n.props?.accessibilityLabel==='Close partner information').props.onPress();refresh();
  assert.equal(find(n=>n.type==='Modal'),undefined);
  resize().props.onPressIn();
  resize().props.onPress();refresh();assert.equal(layout().width,90);assert.equal(layout().left,258);
  resize().props.onPress();refresh();assert.equal(layout().width,120);
  assert.equal(panel().props.onMoveShouldSetPanResponderCapture(null,{dx:2,dy:2}),false);
  swipe(-70);assert.equal(restore(),undefined);
  swipe(0,90);assert.equal(restore(),undefined);assert.equal(layout().top,pinnedTop);
  swipe(18,0,0.1);assert.equal(restore(),undefined);
  resize().props.onPress();refresh();
  swipe(70);assert.ok(restore());
  const tabStyle=Object.assign({},...restore().props.style);
  assert.equal(tabStyle.height,88);assert.equal(tabStyle.alignItems,'center');assert.equal(tabStyle.justifyContent,'center');
  assert.equal(find(n=>n.type==='Icon'&&n.props.name==='chevron-back').props.size,22);assert.equal(panel().props.pointerEvents,'none');
  assert.equal(layout().width,90);assert.equal(layout().transform[0].translateX.value,102);
  assert.ok(find(n=>n.type==='NativeVideo'),'Hidden video remains mounted');
  restore().props.onPress();refresh();assert.equal(layout().width,90);assert.equal(layout().transform[0].translateX.value,0);
  swipe(20,0,0.8);assert.ok(restore());
  props.party={...props.party,id:'party-2'};refresh();
  assert.equal(restore(),undefined);assert.equal(layout().width,120);
  props.party={...props.party,battle:{status:'active',endsAt:10000,firstScore:10,secondScore:20}};refresh();
  assert.equal(layout().width,120);assert.equal(layout().top,pinnedTop);assert.ok(resize());
  assert.equal(interactions.at(-1),false);
  props.party=null;refresh();assert.equal(panel(),undefined);assert.equal(restore(),undefined);
  reset();
  mock.timers.enable({apis:['Date','setTimeout'],now:10000});
  const switched=[];
  props.party={id:'viewer-party',status:'active',participants};
  props.onPartnerDoubleTap=target=>switched.push(target);
  refresh();
  const tap=()=>{resize().props.onPressIn();resize().props.onPress();refresh()};
  tap();assert.equal(layout().width,120);
  mock.timers.tick(150);tap();
  assert.deepEqual(switched,['second']);assert.equal(layout().width,120);
  mock.timers.tick(500);refresh();assert.equal(layout().width,120,'Double tap must not resize later');
  tap();mock.timers.tick(301);refresh();assert.equal(layout().width,90,'Single viewer tap resizes after double-tap interval');
  tap();mock.timers.tick(100);resize().props.onPressIn();mock.timers.tick(500);
  resize().props.onLongPress();resize().props.onPress();refresh();
  assert.equal(layout().width,90);assert.ok(find(n=>n.type==='Modal'));assert.equal(switched.length,1);
  find(n=>n.props?.accessibilityLabel==='Close partner information').props.onPress();refresh();
  tap();swipe(70);mock.timers.tick(500);refresh();assert.equal(layout().width,90);assert.ok(restore());
  restore().props.onPress();refresh();
  tap();panel().props.onTouchCancel();mock.timers.tick(500);refresh();assert.equal(layout().width,90);
  tap();props.party={...props.party,id:'replacement-viewer-party'};refresh();
  mock.timers.tick(500);refresh();assert.equal(layout().width,120,'New party cancels the old pending resize');
  resize().props.onAccessibilityAction({nativeEvent:{actionName:'switchStream'}});
  assert.deepEqual(switched,['second','second']);
  reset();mock.timers.reset();
  console.log('PASS: viewer double tap switches once without resizing, single tap resizes, long press/swipe/cancellation/new party cancel pending taps, and an accessible switch action is available. Host controls remain single-tap resize.');
  const muteCalls=[];
  let rejectMute=false;
  const engineRef={current:{muteRemoteAudioStreamEx(uid,muted,connection){muteCalls.push({uid,muted,connection});return rejectMute?-4:0}}};
  let audioParty={id:'audio-party',status:'active',participants};
  const hook=()=>usePartyMedia(engineRef,'first',audioParty,true,false);
  let audio=render(hook,{});
  assert.equal(audio.audioMuted,false);
  assert.equal(joins.at(-1).isMuted(),false);
  audio.setAudioMuted(true);audio=render(hook,{});
  assert.equal(audio.audioMuted,true);
  assert.ok(muteCalls.every(c=>c.uid===2&&c.connection.channelId==='partner-channel'));
  audio.retry();audio=render(hook,{});
  assert.equal(audio.audioMuted,true);assert.equal(joins.at(-1).isMuted(),true);
  rejectMute=true;audio.setAudioMuted(false);audio=render(hook,{});
  assert.equal(audio.audioMuted,true);assert.match(audio.audioError,/Could not change/);
  rejectMute=false;audio.setAudioMuted(false);audio=render(hook,{});
  assert.equal(audio.audioMuted,false);assert.equal(audio.audioError,null);
  audio.setAudioMuted(true);audio=render(hook,{});
  audioParty={...audioParty,id:'new-audio-party'};audio=render(hook,{});
  assert.equal(audio.audioMuted,false);assert.equal(joins.at(-1).isMuted(),false);
  reset();
  // Real secondary connection receives the preference before subscribing audio.
  for(const muted of [false,true]){
    let handler,joinOptions;
    const native={registerEventHandler:h=>{handler=h},unregisterEventHandler(){},
      joinChannelEx(token,connection,options){joinOptions=options;return 0},
      leaveChannelEx(connection,options){assert.equal(options.stopMicrophoneRecording,false);handler.onLeaveChannel(connection);return 0}};
    const dispose=openPartyConnection(native,async()=>({token:'test',channelName:'partner',uid:99}),2,()=>{},()=>muted);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(joinOptions.autoSubscribeAudio,!muted);
    assert.equal(joinOptions.publishMicrophoneTrack,false);
    await dispose();
  }
  console.log('PASS: partner mute is scoped to the secondary user/channel, survives retry, reports failures without changing the selected state, resets for a new party, and is applied before reconnect subscription. Native audio is mocked.');
  console.log('PASS: party window starts at 1/3, toggles to 1/4, stays top-right at 9:16, hides only on right swipe, restores the selected size, keeps native video mounted, resets for a new party, works during battle without shifting, doubles the restore tab without enlarging the arrow, and opens audio controls on long press without resizing. Native gestures/rendering are mocked.');
} finally {mock.timers.reset();try{unlinkSync(out)}catch{}}
