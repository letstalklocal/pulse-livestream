import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {unlinkSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const output=new URL(`.verification-mobile-${randomUUID()}.cjs`,import.meta.url).pathname;
const stub=`const element=(type,props,...children)=>({type,props:{...props,...(children.length?{children}: {})}});export default {createElement:element};export const createElement=element;export const jsx=element;export const jsxs=element;export const Fragment='Fragment';export const useState=v=>[v,()=>{}];export const useRef=v=>({current:v});export const useEffect=()=>{};export const useCallback=f=>f;export const ActivityIndicator='ActivityIndicator',View='View',Text='Text',TouchableOpacity='TouchableOpacity',ScrollView='ScrollView',Ionicons='Ionicons',Redirect='Redirect';export const StyleSheet={create:s=>s};export const Platform={OS:'ios'};export const AppState={addEventListener:()=>({remove(){}})};export const Linking={openURL:async()=>{}};export const useAuth=()=>({userId:'test-user',isLoaded:true,getToken:async()=>'test-token'});export const useQuery=()=>({data:globalThis.screenStatus,isError:false,isPending:false,isFetching:false,refetch:async()=>{}});export const useRouter=()=>({canGoBack:()=>true,back(){}});export const useFocusEffect=()=>{};export const useSafeAreaInsets=()=>({top:0,bottom:0});export const useColors=()=>({});export const useAppLanguage=()=>({t:s=>s,localizedTextStyle:()=>({})});export const maybeCompleteAuthSession=()=>{};export const openAuthSessionAsync=async(url,returnUrl)=>{globalThis.browserVisits.push({url,returnUrl})};export const openBrowserAsync=async()=>{};`;
await build({entryPoints:[new URL('../../mobile/app/verification.tsx',import.meta.url).pathname],outfile:output,bundle:true,platform:'node',format:'cjs',logLevel:'silent',plugins:[{name:'native-harness',setup(b){b.onResolve({filter:/^(react($|\/)|react-native$|@clerk\/expo$|expo-router$|expo-web-browser$|@expo\/vector-icons$|@tanstack\/react-query$|react-native-safe-area-context$|@\/)/},a=>({path:a.path,namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:stub,loader:'js'}));}}]});
const originalFetch=globalThis.fetch;globalThis.browserVisits=[];const requests=[];
try{
 const Screen=createRequire(import.meta.url)(output).default;
 const base={isVerified:false,idFallbackRequired:false,idFallbackAvailable:true,verificationType:null,upgradeStatus:'not_started',status:'not_started',available:true,consentVersion:'pulse-id-18-v1'};
 const walk=n=>[...(n&&typeof n==='object'?[n]:[]),...(Array.isArray(n)?n:n?.props?.children?[n.props.children]:[]).flatMap(walk)];
 const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(''):text(n?.props?.children??'');
 const render=changes=>{globalThis.screenStatus={...base,...changes};return walk(Screen());};
 let nodes=render({status:'review_needed'});assert.ok(!nodes.some(n=>n.type==='TouchableOpacity'&&text(n)==='Verify now'));assert.ok(!nodes.some(n=>n.props?.accessibilityRole==='checkbox'));assert.ok(nodes.some(n=>text(n)==='Check verification status'));
 nodes=render({status:'verified',isVerified:true,verificationType:'selfie'});assert.ok(nodes.some(n=>text(n)==='You’re Verified'));assert.ok(nodes.some(n=>text(n)==='Your age was verified with a selfie.'));assert.ok(!nodes.some(n=>text(n)==='Continue with ID'));
 nodes=render({status:'not_started'});assert.ok(!nodes.some(n=>text(n)==='Continue with ID'));
 nodes=render({isVerified:true,verificationType:'selfie',status:'verified',upgradeStatus:'review_needed'});assert.ok(nodes.some(n=>text(n)==='Manage verification on website'));
 console.log('PASS: native success rendering, review controls, absence of split-flow ID action and verified upgrade access. Mocked native components; no phone/visual check.');
}finally{globalThis.fetch=originalFetch;delete globalThis.screenStatus;delete globalThis.browserVisits;unlinkSync(output);}
