import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const root=fileURLToPath(new URL('../../mobile/',import.meta.url));
const output=fileURLToPath(new URL(`.signup-sync-${randomUUID()}.cjs`,import.meta.url));
const mocks={
 react:`let slots=[],index=0,effects=[];export const createElement=(type,props,...children)=>({type,props:{...props,children}});export default {createElement};export const createContext=value=>({Provider:'Provider',value});export const useContext=ctx=>ctx.value;export function useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v]}export function useRef(value){const i=index++;return slots[i]??(slots[i]={current:value})}export function useCallback(fn,deps){const i=index++;if(!slots[i]||deps.some((v,j)=>v!==slots[i].deps[j]))slots[i]={deps,value:fn};return slots[i].value}export function useEffect(fn,deps){const i=index++;if(!slots[i]||deps.some((v,j)=>v!==slots[i].deps[j])){const previous=slots[i];slots[i]={deps};effects.push(()=>{previous?.cleanup?.();slots[i].cleanup=fn()})}}export function render(Component){index=0;effects=[];const tree=Component({children:null});effects.forEach(fn=>fn());return tree.props.value}export function reset(){slots.forEach(slot=>slot?.cleanup?.());slots=[];index=0;effects=[]}`,
 'react/jsx-runtime':`export const jsx=(type,props)=>({type,props});export const jsxs=jsx;`,
 'react-native':`export const AppState={addEventListener:()=>({remove(){}})};`,
 '@tanstack/react-query':`const client={invalidateQueries:async()=>{}};export const useQueryClient=()=>client;`,
 '@react-native-async-storage/async-storage':`export const storage=new Map();export default {getItem:async key=>storage.get(key)??null,setItem:async(key,value)=>{storage.set(key,value)},removeItem:async key=>storage.delete(key)};`,
 '@clerk/expo':`export const clerk={isSignedIn:true,isLoaded:true,user:null,tokenVersion:1};export const useAuth=()=>{const id=clerk.user?.id,version=clerk.tokenVersion;return {...clerk,getToken:async()=>id?'fixture-'+id+(version>1?'-v'+version:''):null}};export const useUser=()=>({user:clerk.user});`,
};
const nativeFetch=globalThis.fetch;
try {
 await build({stdin:{contents:`export {AuthProvider} from './context/AuthContext';export {render,reset} from 'react';export {clerk} from '@clerk/expo';export {storage} from '@react-native-async-storage/async-storage';`,resolveDir:root},outfile:output,bundle:true,platform:'node',format:'cjs',jsx:'transform',logLevel:'silent',plugins:[{name:'auth-mocks',setup(b){b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path]}));}}]});
 const m=createRequire(import.meta.url)(output);
 const declarations={dateOfBirth:'1990-02-28',termsAccepted:true,termsVersion:'pulse-terms-preview-2026-09-16'};
 const account=id=>({id,fullName:'Clerk name',unsafeMetadata:{pulseOnboarding:declarations},imageUrl:'https://example.invalid/avatar'});
 const profile=(id,uid=12345)=>({uid,clerkId:id,name:'Saved Pulse name',bio:'Saved bio',followersCount:0,followingCount:0});
 const calls=[];let response;let countryCalls=0;
 globalThis.fetch=async(url,options={})=>{
  if(String(url).endsWith('/api/location/country')){countryCalls++;return Response.json({countryCode:null,country:null});}
  if(String(url).endsWith('/api/users/clerk-sync')){calls.push({headers:options.headers,body:JSON.parse(options.body)});return response(url,options);}
  throw new Error('Unexpected network request');
 };
 const flush=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
 m.clerk.user=account('first');response=async()=>Response.json({user:profile('first')});
 m.render(m.AuthProvider);await flush();let value=m.render(m.AuthProvider);await flush();
 assert.equal(value.user.clerkId,'first');assert.equal(value.isSignedIn,true);
 assert.equal(calls[0].headers.Authorization,'Bearer fixture-first');assert.deepEqual(calls[0].body.onboarding,declarations);
 assert.ok(!m.storage.get('@pulse_user_v2:first').includes('dateOfBirth'),'Birthday is not copied into the cached public profile');
 // Clerk Expo returns a new token function each render. Settled auth must not
 // resync the account or refresh country solely because that function changed.
 const settledCalls=calls.length,settledCountryCalls=countryCalls;
 for(let i=0;i<12;i++){
  value=m.render(m.AuthProvider);await flush();
  assert.equal(calls.length,settledCalls,'An ordinary render must not restart account sync');
  assert.equal(countryCalls,settledCountryCalls,'An ordinary render must not restart country refresh');
  assert.equal(value.isLoaded,true);assert.equal(value.user.clerkId,'first');
 }
 // Stabilizing the wrapper must still use the latest token callback.
 m.clerk.tokenVersion=2;value=m.render(m.AuthProvider);await flush();
 assert.equal(calls.length,settledCalls,'A refreshed token callback alone must not start sync');
 assert.equal(await value.completeSignup(),true);
 assert.equal(calls.at(-1).headers.Authorization,'Bearer fixture-first-v2');
 m.clerk.tokenVersion=1;
 // A user arriving from an interrupted or future signup method gets the common gate.
 m.clerk.user={...account('second'),unsafeMetadata:{}};
 response=async()=>Response.json({code:'ONBOARDING_REQUIRED',error:'Complete your birthday and agree to the Terms of Service.'},{status:422});
 m.render(m.AuthProvider);await flush();value=m.render(m.AuthProvider);
 assert.equal(value.user,null);assert.equal(value.onboardingRequired,true);assert.equal(value.isSignedIn,false);
 response=async()=>Response.json({user:profile('second',23456)});
 assert.equal(await value.completeSignup(declarations),true);value=m.render(m.AuthProvider);await flush();
 assert.equal(value.onboardingRequired,false);assert.equal(value.user.clerkId,'second');assert.deepEqual(calls.at(-1).body.onboarding,declarations);
 // Stale account responses cannot replace the next account's profile or eligibility.
 let releaseFirst;m.clerk.user=account('slow');response=()=>new Promise(resolve=>{releaseFirst=resolve;});
 m.render(m.AuthProvider);await flush();assert.equal(typeof releaseFirst,'function');
 m.clerk.user=account('latest');response=async()=>Response.json({user:profile('latest',34567)});
 m.render(m.AuthProvider);await flush();value=m.render(m.AuthProvider);await flush();
 releaseFirst(Response.json({user:profile('slow',45678)}));await flush();value=m.render(m.AuthProvider);
 assert.equal(value.user.clerkId,'latest');assert.equal(value.onboardingRequired,false);
 // An unavailable API preserves a previously cached account; a rejection does not.
 m.storage.set('@pulse_user_v2:cached',JSON.stringify(profile('cached',56789)));
 m.clerk.user=account('cached');response=async()=>{throw new Error('offline fixture');};
 m.render(m.AuthProvider);await flush();value=m.render(m.AuthProvider);await flush();
 assert.equal(value.user.clerkId,'cached');assert.equal(value.isSignedIn,true);assert.ok(value.syncError);
 response=async()=>Response.json({code:'ONBOARDING_REQUIRED',error:'Complete your birthday and agree to the Terms of Service.'},{status:422});
 await value.completeSignup();value=m.render(m.AuthProvider);
 assert.equal(value.user,null);assert.equal(value.onboardingRequired,true);assert.equal(m.storage.has('@pulse_user_v2:cached'),false);
 m.clerk.isSignedIn=false;m.clerk.user=null;m.render(m.AuthProvider);value=m.render(m.AuthProvider);
 assert.equal(value.user,null);assert.equal(value.syncError,null);assert.equal(value.onboardingRequired,false);
 console.log('PASS: unstable Clerk callback render regression, latest-token use, authenticated declaration sync, signup recovery, explicit server rejection, per-account cache privacy, stale-response isolation, offline cached profile and sign-out cleanup. Clerk/native/storage are mocked; no real account or network call.');
} finally {globalThis.fetch=nativeFetch;try{unlinkSync(output)}catch{}}
