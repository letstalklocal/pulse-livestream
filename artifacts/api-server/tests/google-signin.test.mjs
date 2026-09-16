import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const root=fileURLToPath(new URL('../../mobile/',import.meta.url));
const out=fileURLToPath(new URL(`.google-${randomUUID()}.cjs`,import.meta.url));
const mocks={
 react:`let slots=[],index=0,cleanups=[];export default {};export function useState(initial){const i=index++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>slots[i]=v]}export function useRef(initial){const [ref]=useState({current:initial});return ref}export function useEffect(fn,deps){const i=index++;if(!slots[i]){slots[i]=deps;cleanups.push(fn())}}export function render(Component,props){index=0;return Component(props)}export function reset(){cleanups.forEach(fn=>fn?.());slots=[];cleanups=[];index=0}`,
 'react/jsx-runtime':`export const jsx=(type,props)=>({type,props});export const jsxs=jsx;`,
 'react-native':`export const ActivityIndicator='Spinner',Text='Text',View='View',TouchableOpacity='Button',StyleSheet={create:s=>s};`,
 '@expo/vector-icons':`export const Ionicons='Icon';`,
 '@/hooks/useColors':`export const useColors=()=>({card:'#222',border:'#444',foreground:'#fff'});`,
 '@/i18n':`export const useAppLanguage=()=>({t:s=>s,localizedTextStyle:()=>({})});`,
 '@clerk/expo':`export const auth={isLoaded:true,isSignedIn:false};export const useAuth=()=>auth;`,
 '@clerk/expo/experimental':`export const calls=[];export const fixture={run:async()=>({authSessionResult:{type:'cancel'}})};export const useSSO=()=>({startSSOFlow:async params=>{calls.push(params);return fixture.run()}});`,
 'expo-auth-session':`export const makeRedirectUri=({scheme,path})=>scheme+'://'+path;`,
 'expo-web-browser':`export const maybeCompleteAuthSession=()=>{};`,
};
try {
 await build({stdin:{contents:`export {default as Google} from './components/GoogleSignInButton';export {render,reset} from 'react';export {auth} from '@clerk/expo';export {calls,fixture} from '@clerk/expo/experimental';`,resolveDir:root},bundle:true,platform:'node',format:'cjs',jsx:'automatic',outfile:out,logLevel:'silent',plugins:[{name:'mocks',setup(b){b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path]}))}}]});
 const m=createRequire(import.meta.url)(out);
 const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];
 let tree;const render=(props={})=>tree=m.render(m.Google,props);
 const button=()=>nodes(tree).find(n=>n.type==='Button');
 const error=()=>nodes(tree).find(n=>n.props?.accessibilityLiveRegion==='polite');
 render();assert.equal(button().props.disabled,false);assert.equal(button().props.accessibilityLabel,'Sign in with Google');
 await button().props.onPress();render();assert.equal(error(),undefined,'Cancellation is silent');
 assert.deepEqual(m.calls[0],{strategy:'oauth_google',redirectUrl:'mobile://sso-callback'},'No implicit birthday, terms or verification flags');
 for(const result of [
  {authSessionResult:{type:'dismiss'}},
  {createdSessionId:'fixture-session',authSessionResult:{type:'success'}},
  {signIn:{existingSession:{sessionId:'existing'}},authSessionResult:{type:'success'}},
 ]) {m.fixture.run=async()=>result;await button().props.onPress();render();assert.equal(error(),undefined);}
 m.fixture.run=async()=>({createdSessionId:null,authSessionResult:{type:'success'},signUp:{status:'missing_requirements'}});
 await button().props.onPress();render();assert.ok(error(),'Incomplete OAuth never implies success');
 m.fixture.run=async()=>{throw new Error('private-provider-detail')};await button().props.onPress();render();assert.ok(error());assert.ok(!JSON.stringify(tree).includes('private-provider-detail'),'No raw provider details exposed');
 let release;m.fixture.run=()=>new Promise(resolve=>release=resolve);
 const oldButton=button();const count=m.calls.length;const pending=oldButton.props.onPress();await oldButton.props.onPress();
 render();assert.equal(button().props.disabled,true);assert.equal(button().props.accessibilityState.busy,true);assert.equal(error(),undefined,'Retry clears old error');assert.equal(m.calls.length,count+1,'Repeated taps open one browser flow');
 release({authSessionResult:{type:'cancel'}});await pending;render();assert.equal(button().props.disabled,false);
 for(const [loaded,signedIn,disabled] of [[false,false,false],[true,true,false],[true,false,true]]){
  m.auth.isLoaded=loaded;m.auth.isSignedIn=signedIn;render({disabled});const count=m.calls.length;await button().props.onPress();assert.equal(m.calls.length,count);assert.equal(button().props.disabled,true);
 }
 m.auth.isLoaded=true;m.auth.isSignedIn=false;render({signup:true});assert.equal(button().props.testID,'signup-google');assert.equal(button().props.accessibilityLabel,'Sign up with Google');
 m.reset();
 render({provider:'apple'});assert.equal(button().props.accessibilityLabel,'Sign in with Apple');
 m.fixture.run=async()=>({createdSessionId:'apple-session',authSessionResult:{type:'success'}});
 await button().props.onPress();render({provider:'apple'});
 assert.deepEqual(m.calls.at(-1),{strategy:'oauth_apple',redirectUrl:'mobile://sso-callback'});
 assert.equal(error(),undefined,'Apple uses the same completed-session handling');
 m.fixture.run=async()=>({authSessionResult:{type:'cancel'}});await button().props.onPress();render({provider:'apple'});assert.equal(error(),undefined);
 m.fixture.run=async()=>{throw new Error('private-apple-detail')};await button().props.onPress();render({provider:'apple'});
 assert.equal(error().props.children,'Could not complete Apple sign-in. Please try again or use email.');
 assert.ok(!JSON.stringify(tree).includes('private-apple-detail'));
 render({provider:'apple',signup:true});assert.equal(button().props.accessibilityLabel,'Sign up with Apple');assert.equal(button().props.testID,'signup-apple');
 m.reset();console.log('PASS: Apple and Google OAuth strategy/callback, no fabricated onboarding data, signup/signin labels, cancellation, existing/completed sessions, incomplete requirements, safe failure/retry, duplicate taps, loading and signed-in guards. Clerk/browser/native are mocked; no real Google account or session was created.');
} finally {try{unlinkSync(out)}catch{}}
