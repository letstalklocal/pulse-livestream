import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const root=fileURLToPath(new URL('../../mobile/',import.meta.url));
const out=fileURLToPath(new URL(`.signup-${randomUUID()}.cjs`,import.meta.url));
const mocks={
 react:`let slots=[],index=0,effects=[];export const createElement=(type,props,...children)=>({type,props:{...props,children}});export default {createElement};export const useSyncExternalStore=(subscribe,snapshot)=>snapshot();export function useState(initial){const i=index++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v]}export function useEffect(fn,deps){const i=index++;if(!slots[i]||deps.some((v,j)=>v!==slots[i][j])){slots[i]=deps;effects.push(fn)}}export function render(Component){index=0;effects=[];const tree=Component();effects.forEach(fn=>fn());return tree}export function reset(){slots=[];index=0;effects=[]}`,
 'react/jsx-runtime':`export const jsx=(type,props)=>({type,props:{...props,children:[props.children]}});export const jsxs=jsx;`,
 'react-native':`export const View='View',Text='Text',TouchableOpacity='TouchableOpacity',Pressable='Pressable',ScrollView='ScrollView',StatusBar='StatusBar',TextInput='TextInput',KeyboardAvoidingView='KeyboardAvoidingView',ActivityIndicator='ActivityIndicator';export const Platform={OS:'android'},StyleSheet={create:s=>s};`,
 'react-native-safe-area-context':`export const useSafeAreaInsets=()=>({top:24,bottom:24});`,
 '@expo/vector-icons':`export const Ionicons='Icon';`,
 '@/hooks/useColors':`export const useColors=()=>({background:'#000',foreground:'#fff',mutedForeground:'#aaa',primary:'#a00',card:'#222',border:'#444'});`,
 '@react-native-async-storage/async-storage':`export default {getItem:async()=>null,setItem:async()=>{}};`,
 'expo-router':`export const navigation=[];export const router={canGoBack:()=>true,push:path=>navigation.push(['push',path]),replace:path=>navigation.push(['replace',path]),back:()=>navigation.push(['back'])};export const useRouter=()=>router;export const Link='Link';`,
 '@clerk/expo':`export const auth={isSignedIn:false};export const calls=[];export const state={fetchStatus:'idle',errors:null};export const signUp={status:'needs_identifier',unverifiedFields:[],missingFields:[],password:async data=>{calls.push(['password',data]);return {error:state.passwordError}},verifications:{sendEmailCode:async()=>calls.push(['sendEmailCode']),verifyEmailCode:async data=>{calls.push(['verifyEmailCode',data]);signUp.status='complete'}},finalize:async({navigate})=>{calls.push(['finalize']);navigate()}};export const useAuth=()=>auth;export const useSignUp=()=>({...state,signUp});`,
};
let originalDateTimeFormat;
try {
 await build({stdin:{contents:`export {default as Options} from './app/(auth)/sign-up';export {default as Email} from './app/(auth)/sign-up-email';export * from './i18n';export {render,reset} from 'react';export {navigation,router} from 'expo-router';export {auth,calls,state,signUp} from '@clerk/expo';`,resolveDir:root},bundle:true,platform:'node',format:'cjs',jsx:'transform',outfile:out,logLevel:'silent',plugins:[{name:'native-mocks',setup(b){b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'mock'}:a.path==='@/i18n'?{path:root+'i18n/index.ts'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path]}))}}]});
 originalDateTimeFormat=Intl.DateTimeFormat;
 Intl.DateTimeFormat=function(locale,options){return new originalDateTimeFormat(locale??'es-MX',options)};
 const m=createRequire(import.meta.url)(out);
 await m.initializeAppLanguage();
 Intl.DateTimeFormat=originalDateTimeFormat;
 const nodes=t=>!t||typeof t!=='object'?[]:[t,...(t.props?.children??[]).flat(Infinity).flatMap(nodes)];
 let tree=m.render(m.Options);
 const find=predicate=>nodes(tree).find(predicate);
 const byId=id=>find(n=>n.props.testID===id);
 assert.equal(m.useAppLanguage().preference,'device');
 assert.equal(byId('signup-email').props.accessibilityLabel,'Registrarse con correo electrónico','First-time signup follows detected Spanish without a saved preference');
 const google=byId('signup-google');assert.equal(google.props.disabled,true);assert.equal(google.props.accessibilityState.disabled,true);assert.equal(google.props.onPress,undefined);assert.equal(google.props.accessibilityHint,'Próximamente');
 byId('signup-email').props.onPress();assert.deepEqual(m.navigation.pop(),['push','/(auth)/sign-up-email']);
 assert.equal(find(n=>n.type==='Link').props.href,'/(auth)/sign-in');
 m.router.canGoBack=()=>false;find(n=>n.props.accessibilityLabel===m.t('Back')).props.onPress();assert.deepEqual(m.navigation.pop(),['replace','/(auth)/sign-in']);
 await m.setAppLanguage('ar');tree=m.render(m.Options);assert.equal(byId('signup-email').props.accessibilityLabel,'إنشاء حساب بالبريد الإلكتروني');
 assert.ok(nodes(tree).some(n=>n.type==='Text'&&n.props.style?.flat(Infinity).some(s=>s?.writingDirection==='rtl')));
 await m.setAppLanguage('en');m.reset();tree=m.render(m.Email);
 const input=label=>find(n=>n.type==='TextInput'&&n.props.placeholder===label);
 const submit=()=>find(n=>n.type==='TouchableOpacity'&&nodes(n).some(child=>child.type==='Text'&&child.props.children.flat(Infinity).includes('Create account')));
 assert.equal(submit().props.disabled,true);
 input('Email address').props.onChangeText('signup-fixture@example.invalid');input('Password').props.onChangeText('fixture-only-password');
 tree=m.render(m.Email);assert.equal(submit().props.disabled,true,'Confirmation is required');
 await submit().props.onPress();assert.equal(m.calls.length,0,'Direct submission cannot bypass empty confirmation');
 const mismatch="Passwords don't match.";
 input('Confirm password').props.onChangeText('fixture-only-password ');tree=m.render(m.Email);
 assert.equal(submit().props.disabled,true,'Passwords must match exactly, without trimming');
 assert.ok(nodes(tree).some(n=>n.type==='Text'&&n.props.children.flat(Infinity).includes(mismatch)));
 await submit().props.onPress();assert.equal(m.calls.length,0,'Mismatch never reaches Clerk');
 input('Confirm password').props.onChangeText('fixture-only-password');tree=m.render(m.Email);
 assert.equal(submit().props.disabled,false);
 assert.equal(input('Confirm password').props.secureTextEntry,true);
 find(n=>n.props.accessibilityLabel==='Show password').props.onPress();tree=m.render(m.Email);
 assert.equal(input('Confirm password').props.secureTextEntry,false);assert.equal(input('Confirm password').props.value,'fixture-only-password');
 assert.equal(input('Password').props.secureTextEntry,true,'Confirmation visibility is independent');
 find(n=>n.props.accessibilityLabel==='Hide password').props.onPress();tree=m.render(m.Email);
 assert.equal(input('Confirm password').props.secureTextEntry,true);
 input('Password').props.onChangeText('changed-password');tree=m.render(m.Email);
 assert.equal(submit().props.disabled,true,'Changing the original password revalidates confirmation');
 input('Password').props.onChangeText('fixture-only-password');tree=m.render(m.Email);
 assert.equal(submit().props.disabled,false);
 assert.equal(nodes(tree).some(n=>n.type==='Text'&&n.props.children.flat(Infinity).includes(mismatch)),false,'Matching clears feedback');
 await m.setAppLanguage('es');tree=m.render(m.Email);
 assert.equal(input('Confirmar contraseña').props.value,'fixture-only-password','Language change retains confirmation');
 await m.setAppLanguage('en');tree=m.render(m.Email);
 m.state.fetchStatus='fetching';tree=m.render(m.Email);
 const fetching=find(n=>n.type==='TouchableOpacity'&&nodes(n).some(child=>child.type==='ActivityIndicator'));
 assert.equal(fetching.props.disabled,true);await fetching.props.onPress();assert.equal(m.calls.length,0);
 m.state.fetchStatus='idle';tree=m.render(m.Email);
 m.state.passwordError={message:'Fixture rejection'};await submit().props.onPress();assert.equal(m.calls.filter(c=>c[0]==='sendEmailCode').length,0,'Failed password creation does not send a verification code');
 m.state.passwordError=null;await submit().props.onPress();assert.equal(m.calls.at(-1)[0],'sendEmailCode');
 assert.deepEqual(m.calls.find(c=>c[0]==='password')[1],{emailAddress:'signup-fixture@example.invalid',password:'fixture-only-password'});
 m.signUp.status='missing_requirements';m.signUp.unverifiedFields=['email_address'];m.signUp.missingFields=[];tree=m.render(m.Email);
 input('Enter 6-digit code').props.onChangeText('123456');tree=m.render(m.Email);
 const verify=find(n=>n.type==='TouchableOpacity'&&nodes(n).some(child=>child.type==='Text'&&child.props.children.flat(Infinity).includes('Verify email')));
 await verify.props.onPress();assert.deepEqual(m.calls.at(-2),['verifyEmailCode',{code:'123456'}]);assert.equal(m.calls.at(-1)[0],'finalize');assert.deepEqual(m.navigation.pop(),['replace','/(tabs)']);
 m.reset();m.auth.isSignedIn=true;tree=m.render(m.Options);assert.deepEqual(m.navigation.pop(),['replace','/(tabs)/profile']);
 console.log('PASS: detected-language signup choices, Arabic text direction, disabled Google, email routing, safe back navigation, sign-in link, required/exact password confirmation, blocked submissions, visibility and language changes, existing email-code/finalization flow, and signed-in redirect. React/native/Clerk are mocked; no account or email is created.');
} finally {if(originalDateTimeFormat)Intl.DateTimeFormat=originalDateTimeFormat;try{unlinkSync(out)}catch{}}
