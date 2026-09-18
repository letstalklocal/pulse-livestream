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
  'react/jsx-runtime': `export const Fragment='Fragment';export const jsx=(type,props)=>({type,props:{...props,children:[props.children]}});export const jsxs=jsx;`,
  'react-native': `
    export const Modal='Modal',View='View',Text='Text',Pressable='Pressable',TouchableOpacity='TouchableOpacity',ActivityIndicator='ActivityIndicator';
    export const Platform={OS:process.env.PARTY_TEST_PLATFORM || 'android'};
    export const StyleSheet={create:s=>s,absoluteFill:{position:'absolute'}};
    export const useWindowDimensions=()=>({width:360,height:800});
    export const PanResponder={create:handlers=>({panHandlers:handlers})};
    export const AccessibilityInfo={isReduceMotionEnabled:async()=>false,addEventListener:(name,fn)=>{globalThis.battleMotion=fn;return {remove(){}}}};
    export const AppState={currentState:'active',addEventListener:(name,fn)=>{globalThis.battleAppState=fn;return {remove(){}}}};
    export const Easing={linear:v=>v,cubic:v=>v*v*v,inOut:fn=>fn,out:fn=>fn};
    export const Animated={parallel:steps=>({start(){steps.forEach(s=>s.start())},stop(){steps.forEach(s=>s.stop())}}),sequence:steps=>{let running=false;const blink=steps.length===2&&steps.every(s=>s.duration===500);return {isSequence:true,start(){if(blink){running=true;globalThis.battleBlinkLoops=(globalThis.battleBlinkLoops??0)+1;globalThis.battleBlinkStarts=(globalThis.battleBlinkStarts??0)+1}steps.forEach(s=>s.start())},stop(){if(running){running=false;globalThis.battleBlinkLoops--}steps.forEach(s=>s.stop())}}},loop:animation=>{if(!animation.isSequence)throw new Error("Battle highlight must not loop");let running=false;return {start(){running=true;globalThis.battleBlinkLoops=(globalThis.battleBlinkLoops??0)+1;animation.start()},stop(){if(running){running=false;globalThis.battleBlinkLoops--}animation.stop()}}},View:'Animated.View',Value:class{constructor(v){this.value=v;this.listeners=new Map()}setValue(v){this.value=v;this.listeners.forEach(fn=>fn({value:v}))}addListener(fn){const id=String(this.listeners.size);this.listeners.set(id,fn);return id}removeListener(id){this.listeners.delete(id)}stopAnimation(callback){callback?.(this.value)}interpolate(config){return {...config,source:this}}},timing:(value,config)=>({duration:config.duration,start(){(globalThis.battleAnimationEvents??=[]).push({value,from:value.value,to:config.toValue,duration:config.duration});if(config.toValue===1.6)(globalThis.winnerPops??=[]).push({from:value.value,to:config.toValue,duration:config.duration});if(config.duration===650)(globalThis.battleTransitions??=[]).push({from:value.value,to:config.toValue});if(config.duration===1050)globalThis.battleSweeps=(globalThis.battleSweeps??0)+1;value.setValue(config.toValue)},stop(){}})};
  `,
  'react-native-safe-area-context': `export const useSafeAreaInsets=()=>({top:24,bottom:24});`,
  'expo-linear-gradient': `export const LinearGradient='LinearGradient';`,
  '@expo/vector-icons': `export const Ionicons='Icon';`,
  '@/utils/agora': `export const RtcSurfaceViewComponent='NativeVideo',RtcTextureViewComponent='TextureVideo',VideoSourceType={VideoSourceRemote:0};`,
  '@workspace/api-client-react': `export const actOnStreamParty=async()=>({});export const getPartyMedia=async()=>({});`,
  '@/utils/partyConnection': `export const joins=[];export function openPartyConnection(engine,fetchToken,uid,onState,isMuted){joins.push({uid,isMuted});onState({connection:{channelId:'partner-channel',localUid:99},ready:true,error:null});return ()=>{}}`,
  './Avatar': `export const Avatar='Avatar';`,
};
try {
  await build({
    stdin: {contents:`export {PartyStage} from '../../mobile/components/PartyStage';export {battleMotionFrame} from '../../mobile/utils/battleMotion';export {render,reset} from 'react';export {usePartyMedia} from '../../mobile/hooks/usePartyMedia';export {joins} from '@/utils/partyConnection';export {openPartyConnection} from '../../mobile/utils/partyConnection';`,resolveDir:fileURLToPath(new URL('.',import.meta.url))},
    bundle:true,platform:'node',format:'cjs',jsx:'transform',outfile:out,logLevel:'silent',
    plugins:[{name:'native-mocks',setup(b){
      b.onResolve({filter:/.*/},a=>{
        if(a.path in mocks)return {path:a.path,namespace:'mock'};
        if(a.path==='@/utils/partyLayout')return {path:fileURLToPath(new URL('../../mobile/utils/partyLayout.ts',import.meta.url))};
      });
      b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path]}));
    }}],
  });
  const {PartyStage,battleMotionFrame,render,reset,usePartyMedia,joins,openPartyConnection}=createRequire(import.meta.url)(out);
  const videoType = (process.env.PARTY_TEST_PLATFORM || 'android') === 'android' ? 'TextureVideo' : 'NativeVideo';
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
  assert.ok(find(n=>n.type===videoType),'Use a clippable texture for Android floating video and the surface renderer on iOS');
  assert.equal(layout().borderRadius,5);
  assert.equal(layout().overflow,'hidden');
  const video = find(n=>n.type===videoType);
  assert.deepEqual(video.props.connection,props.media.connection,'Preserve the secondary channel');
  assert.equal(video.props.canvas.uid,2,'Render the party partner');
  assert.equal(video.props.zOrderMediaOverlay,videoType==='TextureVideo'?undefined:true);
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
  assert.ok(find(n=>n.type===videoType),'Hidden video remains mounted');
  restore().props.onPress();refresh();assert.equal(layout().width,90);assert.equal(layout().transform[0].translateX.value,0);
  swipe(20,0,0.8);assert.ok(restore());
  props.party={...props.party,id:'party-2'};refresh();
  assert.equal(restore(),undefined);assert.equal(layout().width,120);
  props.party={...props.party,battle:{status:'active',endsAt:10000,firstScore:10,secondScore:20}};refresh();
  assert.equal(layout().width,120);assert.equal(layout().top,pinnedTop);assert.ok(resize());
  assert.equal(interactions.at(-1),false);
  const segmentOpacity=id=>Object.assign({},...find(n=>n.props.testID===id).props.style).opacity;
  const markerPosition=()=>`${Object.assign({},...find(n=>n.props.testID==='battle-score-mine').props.style).width.source.value}%`;
  const flowValue=()=>Object.assign({},...find(n=>n.props.testID==='battle-score-flow').props.style).transform[0].translateX;
  const flowOpacity=()=>Object.assign({},...find(n=>n.props.testID==='battle-score-flow').props.style).opacity.value;
  assert.equal(find(n=>n.props.testID==='battle-score-marker'),undefined,'No circular dot');
  assert.equal(find(n=>n.props.testID==='battle-score-tip').props.colors[0],'rgba(255,255,255,0)');
  assert.equal(flowOpacity(),0,'Opening an existing battle does not replay awards');
  assert.equal(markerPosition(),`${(10/30)*100}%`);
  assert.equal(segmentOpacity('battle-score-mine'),1);assert.equal(segmentOpacity('battle-score-peer'),1);
  props.party.battle={id:'test-round',simulated:true,status:'active',startsAt:3100,endsAt:183100,firstScore:0,secondScore:0};
  refresh();assert.equal(markerPosition(),'50%');
  assert.equal(segmentOpacity('battle-score-mine'),0.25);assert.equal(segmentOpacity('battle-score-peer'),0.25);
  assert.equal(find(n=>n.props.testID==='battle-score-tie').props.style.opacity.value,0,'Zero scores have no white tie highlight');
  assert.equal(find(n=>n.props.testID==='battle-score-tip'),undefined,'No winning tip on a tie');
  assert.equal(flowOpacity(),0,'No idle flow on a tie');
  assert.ok(find(n=>n.type==='Text'&&n.props.children.includes('Test battle')));
  assert.ok(find(n=>n.type==='Text'&&n.props.children.includes('Starts 3')));
  globalThis.battleAnimationEvents=[];
  props.now=9100;props.party.battle.firstScore=100;refresh();assert.equal(markerPosition(),'95%');
  assert.equal(segmentOpacity('battle-score-mine'),1);assert.equal(segmentOpacity('battle-score-peer'),0.25);
  assert.equal(find(n=>n.props.testID==='battle-score-tip').props.colors[2],'rgba(255,255,255,0)');
  assert.equal(globalThis.battleAnimationEvents.filter(event=>event.duration===1050).length,1,'One continuous animation drives the whole handoff');
  assert.equal(battleMotionFrame(50,95,268,'mine',0.2).percent,50,'Edge waits until the highlight approaches');
  const approaching=battleMotionFrame(50,95,268,'mine',0.49);
  assert.ok(approaching.percent>50&&approaching.merge>0&&approaching.merge<1,'Edge starts moving while the highlights overlap');
  const merged=battleMotionFrame(50,95,268,'mine',0.7);
  assert.ok(Math.abs(merged.flowX+28-merged.percent*268/100)<1e-8,'After merging, highlight and edge share one moving position');
  assert.equal(merged.flowOpacity,0,'Traveling highlight blends into the attached edge');
  for(const [from,to,side] of [[50,95,'mine'],[95,50,'peer'],[50,50,'mine'],[50,5,'peer']]) {
    let previous=from;
    for(let step=0;step<=100;step++) {
      const frame=battleMotionFrame(from,to,268,side,step/100);
      assert.ok(to>=from?frame.percent>=previous-1e-8:frame.percent<=previous+1e-8,'Boundary motion never reverses during a merge');
      previous=frame.percent;
    }
    assert.equal(previous,to,'Continuous motion reaches exact target');
  }
  const sweepsAfterAward=globalThis.battleSweeps;
  props.now+=1000;refresh();refresh();
  assert.equal(globalThis.battleSweeps,sweepsAfterAward,'Clock and identical polls do not replay the sweep');
  globalThis.battleMotion(true);refresh();
  assert.equal(find(n=>n.props.testID==='battle-score-flow'),undefined,'Reduced motion keeps a static tip');
  assert.ok(find(n=>n.props.testID==='battle-score-tip'));
  globalThis.battleMotion(false);globalThis.battleAppState('background');refresh();
  assert.equal(find(n=>n.props.testID==='battle-score-flow'),undefined,'Background pauses flow');
  globalThis.battleAppState('active');refresh();assert.ok(find(n=>n.props.testID==='battle-score-flow'));
  assert.equal(globalThis.battleSweeps,sweepsAfterAward,'Foreground and motion preference changes do not replay scores');
  props.now=9100;refresh();
  assert.ok(find(n=>n.type==='Text'&&n.props.children.includes('2:54')));
  globalThis.battleTransitions=[];globalThis.battleAnimationEvents=[];
  props.party.battle.secondScore=100;refresh();assert.equal(markerPosition(),'50%');
  assert.equal(globalThis.battleAnimationEvents.filter(e=>e.duration===1050).length,1,'Returning to a tie uses the same uninterrupted motion');
  const reverse=battleMotionFrame(95,50,268,'peer',0.5);
  assert.ok(Math.abs(reverse.flowX-reverse.percent*268/100)<1e-8,'Right-origin highlight merges and follows the retreating edge');
  assert.equal(segmentOpacity('battle-score-mine'),1);assert.equal(segmentOpacity('battle-score-peer'),1);
  assert.equal(find(n=>n.props.testID==='battle-score-tie').props.style.opacity.value,1,'Scored tie retains white center');
  assert.equal(find(n=>n.props.testID==='battle-score-tie').props.style.left.source.value,50);
  props.party.battle.firstScore=200;refresh();assert.equal(markerPosition(),`${(200/300)*100}%`);
  assert.equal(globalThis.battleSweeps,sweepsAfterAward+2,'Tie and next lead each push once');
  props.channelId='second';refresh();assert.equal(markerPosition(),`${(10/30)*100}%`);
  assert.equal(segmentOpacity('battle-score-mine'),1);assert.equal(segmentOpacity('battle-score-peer'),1);
  props.now=props.party.battle.endsAt-11000;refresh();assert.equal(globalThis.battleBlinkLoops,0);
  props.now=props.party.battle.endsAt-10000;refresh();assert.equal(globalThis.battleBlinkLoops,1,'Blink starts at ten seconds');
  const blinksAtTen=globalThis.battleBlinkStarts;
  props.now+=1000;refresh();assert.equal(globalThis.battleBlinkLoops,1,'Only one blink is active');
  assert.equal(globalThis.battleBlinkStarts,blinksAtTen+1,'Changing 10 to 9 starts exactly one matching blink');
  refresh();assert.equal(globalThis.battleBlinkStarts,blinksAtTen+1,'Same-second polls do not blink again');
  globalThis.battleMotion(true);refresh();assert.equal(globalThis.battleBlinkLoops,0,'Reduced Motion keeps warning steady');
  assert.equal(Object.assign({},...find(n=>n.props.testID==='battle-countdown').props.style).opacity.value,1);
  globalThis.battleMotion(false);refresh();assert.equal(globalThis.battleBlinkLoops,1);
  globalThis.battleAppState('background');refresh();assert.equal(globalThis.battleBlinkLoops,0);
  globalThis.battleAppState('active');refresh();assert.equal(globalThis.battleBlinkLoops,1);
  props.party.battle={...props.party.battle,status:'finished',winnerUid:1,firstScore:1800,secondScore:1700};
  props.now=183100;refresh();
  assert.equal(globalThis.battleBlinkLoops,0,'Finishing stops blink');
  assert.ok(find(n=>n.type==='Text'&&n.props.children.flat(Infinity).includes('Winner')));
  assert.equal(find(n=>n.type==='Avatar'&&n.props.size===96).props.uid,1);
  assert.deepEqual(globalThis.winnerPops.at(-1),{from:0.35,to:1.6,duration:320},'Winner grows beyond normal size before settling');
  const popCount=globalThis.winnerPops.length;
  const avatarScale=()=>Object.assign({},...find(n=>n.props.testID==='battle-winner-avatar').props.style).transform[0].scale.value;
  assert.equal(avatarScale(),1,'Pop settles to full size');
  assert.ok(globalThis.battleAnimationEvents.some(e=>e.from===1.6&&e.to===1&&e.duration===650),'Oversized avatar visibly shrinks back to normal');
  props.now+=1000;refresh();refresh();assert.equal(globalThis.winnerPops.length,popCount,'Clock ticks and polls do not repeat pop');
  globalThis.battleAppState('background');refresh();globalThis.battleAppState('active');refresh();
  assert.equal(globalThis.winnerPops.length,popCount,'Foreground does not replay the same result');
  props.now-=1000;refresh();
  assert.equal(find(n=>n.props.testID==='battle-result').props.style.justifyContent,'center');
  assert.equal(find(n=>n.props.testID==='battle-result').props.pointerEvents,'none');
  globalThis.battleMotion(true);refresh();
  props.party.battle.winnerUid=2;refresh();assert.equal(find(n=>n.type==='Avatar'&&n.props.size===96).props.uid,2);
  assert.equal(globalThis.winnerPops.length,popCount,'Reduced Motion suppresses pop for a new winner');
  assert.equal(avatarScale(),1);globalThis.battleMotion(false);refresh();
  assert.equal(globalThis.winnerPops.length,popCount,'Toggling motion does not replay result');
  props.party.battle.winnerUid=null;refresh();assert.equal(find(n=>n.type==='Avatar'&&n.props.size===96),undefined);
  assert.ok(find(n=>n.type==='Text'&&n.props.children.flat(Infinity).includes('VS ends in a draw')));
  props.now+=10000;refresh();assert.equal(find(n=>n.props.testID==='battle-result'),undefined,'Result expires after ten seconds');
  props.now-=10000;props.party.battle.status='cancelled';refresh();assert.equal(find(n=>n.props.testID==='battle-result'),undefined,'Cancelled rounds never announce a winner');
  assert.equal(find(n=>n.props.testID==='battle-score-marker'),undefined);
  assert.equal(find(n=>n.props.testID==='battle-score-flow'),undefined,'Finished rounds stop flow');
  props.channelId='first';props.now=100;
  console.log('PASS: real/test blended winning edge, directional flow, no dot, ties, mirrored scores, reduced motion, background pause, countdown and winner (mocked).');
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
