import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const root=fileURLToPath(new URL('../../mobile/',import.meta.url));
const out=fileURLToPath(new URL(`.signup-${randomUUID()}.cjs`,import.meta.url));
const mocks={
 react:`let slots=[],index=0,effects=[];export const createElement=(type,props,...children)=>({type,props:{...props,children}});export default {createElement};export const useSyncExternalStore=(subscribe,snapshot)=>snapshot();export function useState(initial){const i=index++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v]}export function useRef(initial){const [ref]=useState({current:initial});return ref}export function useEffect(fn,deps){const i=index++;if(!slots[i]||deps.some((v,j)=>v!==slots[i][j])){slots[i]=deps;effects.push(fn)}}export function render(Component){index=0;effects=[];const tree=Component();effects.forEach(fn=>fn());return tree}export function reset(){slots=[];index=0;effects=[]}`,
 'react/jsx-runtime':`export const jsx=(type,props)=>({type,props:{...props,children:[props.children]}});export const jsxs=jsx;export const Fragment='Fragment';`,
 'react-native':`export const View='View',Text='Text',TouchableOpacity='TouchableOpacity',Pressable='Pressable',ScrollView='ScrollView',StatusBar='StatusBar',TextInput='TextInput',KeyboardAvoidingView='KeyboardAvoidingView',ActivityIndicator='ActivityIndicator';export const Keyboard={dismiss:()=>{}},BackHandler={addEventListener:()=>({remove:()=>{}})};export const links=[];export const Linking={openURL:async url=>links.push(url)},Alert={alert:()=>{}};export const Platform={OS:'android'},StyleSheet={create:s=>s};`,
 'react-native-keyboard-controller':`export const KeyboardAwareScrollView='KeyboardAwareScrollView';`,
 'react-native-safe-area-context':`export const useSafeAreaInsets=()=>({top:24,bottom:24});`,
 '@expo/vector-icons':`export const Ionicons='Icon';`,
 '@/hooks/useColors':`export const useColors=()=>({background:'#000',foreground:'#fff',mutedForeground:'#aaa',primary:'#a00',card:'#222',border:'#444'});`,
 '@react-native-async-storage/async-storage':`export default {getItem:async()=>null,setItem:async()=>{}};`,
 'expo-router':`export const navigation=[];export const router={canGoBack:()=>true,push:path=>navigation.push(['push',path]),replace:path=>navigation.push(['replace',path]),back:()=>navigation.push(['back'])};export const useRouter=()=>router;export const Link='Link';`,
 '@clerk/expo/experimental':`export const useSSO=()=>({startSSOFlow:async()=>({createdSessionId:null,authSessionResult:{type:'cancel'}})});`,
 'expo-auth-session':`export const makeRedirectUri=()=> 'mobile://sso-callback';`,
 'expo-web-browser':`export const maybeCompleteAuthSession=()=>{};`,
 '@clerk/expo':`export const auth={isSignedIn:false,isLoaded:true};export const calls=[];export const state={fetchStatus:'idle',errors:null};export const signUp={status:'needs_identifier',unverifiedFields:[],missingFields:[],password:async data=>{calls.push(['password',data]);return {error:state.passwordError}},verifications:{sendEmailCode:async()=>calls.push(['sendEmailCode']),verifyEmailCode:async data=>{calls.push(['verifyEmailCode',data]);signUp.status='complete'}},finalize:async({navigate})=>{calls.push(['finalize']);navigate()}};export const useAuth=()=>auth;export const useSignUp=()=>({...state,signUp});`,
};
let originalDateTimeFormat;
try {
 await build({stdin:{contents:`export {default as Guest} from './components/SignedOutProfile';export {default as Options} from './app/(auth)/sign-up';export {default as Email} from './app/(auth)/sign-up-email';export * from './i18n';export {render,reset} from 'react';export {navigation,router} from 'expo-router';export {auth,calls,state,signUp} from '@clerk/expo';export {links} from 'react-native';`,resolveDir:root},bundle:true,platform:'node',format:'cjs',jsx:'automatic',outfile:out,logLevel:'silent',plugins:[{name:'native-mocks',setup(b){b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'mock'}:a.path==='@/i18n'?{path:root+'i18n/index.ts'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path]}))}}]});
 originalDateTimeFormat=Intl.DateTimeFormat;
 Intl.DateTimeFormat=function(locale,options){return new originalDateTimeFormat(locale??'es-MX',options)};
 const m=createRequire(import.meta.url)(out);
 await m.initializeAppLanguage();
 Intl.DateTimeFormat=originalDateTimeFormat;
 const nodes=t=>!t||typeof t!=='object'?[]:typeof t.type==='function'?[t,...nodes(t.type(t.props))]:[t,...(t.props?.children??[]).flat(Infinity).flatMap(nodes)];
 let tree=m.render(m.Options);
 const find=predicate=>nodes(tree).find(predicate);
 const byId=id=>find(n=>n.props.testID===id);
 assert.equal(m.useAppLanguage().preference,'device');
 assert.equal(byId('signup-email').props.accessibilityLabel,'Registrarse con correo electrónico','First-time signup follows detected Spanish without a saved preference');
 const google=byId('signup-google');assert.equal(google.props.disabled,false);assert.equal(google.props.accessibilityState.disabled,false);assert.equal(typeof google.props.onPress,'function');assert.equal(byId('signup-phone'),undefined);
 assert.equal(byId('signup-apple').props.disabled,false);assert.deepEqual(nodes(tree).filter(n=>n.type==='TouchableOpacity'&&['signup-google','signup-apple','signup-phone','signup-email'].includes(n.props.testID)).map(n=>n.props.testID),['signup-google','signup-apple','signup-email']);
 byId('signup-email').props.onPress();assert.deepEqual(m.navigation.pop(),['push','/(auth)/sign-up-email']);
 assert.equal(find(n=>n.type==='Link').props.href,'/(auth)/sign-in');
 m.router.canGoBack=()=>false;find(n=>n.props.accessibilityLabel===m.t('Back')).props.onPress();assert.deepEqual(m.navigation.pop(),['replace','/(auth)/sign-in']);
 await m.setAppLanguage('ar');tree=m.render(m.Options);assert.equal(byId('signup-email').props.accessibilityLabel,'إنشاء حساب بالبريد الإلكتروني');
 assert.ok(nodes(tree).some(n=>n.type==='Text'&&n.props.style?.flat(Infinity).some(s=>s?.writingDirection==='rtl')));
 await m.setAppLanguage('en');m.reset();tree=m.render(m.Guest);
 assert.ok(nodes(tree).some(n=>n.type==='Text'&&n.props.accessibilityRole==='header'&&n.props.children.flat(Infinity).includes('Sign In')));
 assert.deepEqual(nodes(tree).filter(n=>n.type==='TouchableOpacity'&&['signin-google','signin-apple','signin-email'].includes(n.props.testID)).map(n=>n.props.testID),['signin-google','signin-apple','signin-email']);
 byId('signin-email').props.onPress();assert.deepEqual(m.navigation.pop(),['push','/(auth)/sign-in']);
 byId('signin-signup').props.onPress();assert.deepEqual(m.navigation.pop(),['push','/(auth)/sign-up']);
 await m.setAppLanguage('es');tree=m.render(m.Guest);assert.equal(byId('signin-email').props.accessibilityLabel,'Iniciar sesión con correo electrónico');
 await m.setAppLanguage('en');m.reset();tree=m.render(m.Email);
 const input=label=>find(n=>n.type==='TextInput'&&n.props.placeholder===label);
 const submit=()=>find(n=>n.type==='TouchableOpacity'&&nodes(n).some(child=>child.type==='Text'&&child.props.children.flat(Infinity).some(text=>text==='Create account'||text==='Continue')));
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
 assert.equal(submit().props.disabled,false,'Matching credentials can continue');
 assert.equal(byId('birthday-day'),undefined,'Birthday is on step two only');
 await submit().props.onPress();tree=m.render(m.Email);
 assert.equal(m.calls.length,0,'Continue does not create a Clerk account');
 assert.equal(input('Email address'),undefined,'Credentials are hidden on step two');
 assert.equal(submit().props.disabled,true,'Birthday and terms are also required');
 assert.equal(byId('signup-terms-checkbox').props.accessibilityState.checked,false);
 await byId('signup-terms-link').props.onPress();assert.ok(m.links.at(-1).endsWith('/api/site/terms'));
 assert.equal(byId('signup-terms-checkbox').props.accessibilityState.checked,false,'Reading terms does not imply agreement');
 byId('birthday-day').props.onChangeText('28');byId('birthday-month').props.onChangeText('02');byId('birthday-year').props.onChangeText('2015');
 byId('signup-terms-checkbox').props.onPress();tree=m.render(m.Email);
 assert.equal(submit().props.disabled,true,'Underage signup is blocked');await submit().props.onPress();assert.equal(m.calls.length,0);
 byId('birthday-year').props.onChangeText('9999');tree=m.render(m.Email);assert.equal(submit().props.disabled,true,'Future birthday is blocked');
 byId('birthday-year').props.onChangeText('1990');byId('birthday-day').props.onChangeText('30');tree=m.render(m.Email);assert.equal(submit().props.disabled,true,'Invalid calendar date is blocked');
 byId('birthday-day').props.onChangeText('28');tree=m.render(m.Email);assert.equal(submit().props.disabled,false);
 byId('signup-terms-checkbox').props.onPress();tree=m.render(m.Email);assert.equal(submit().props.disabled,true,'Agreement can be withdrawn before signup');
 byId('signup-terms-checkbox').props.onPress();tree=m.render(m.Email);
 assert.equal(submit().props.disabled,false);
 find(n=>n.props.accessibilityLabel==='Back').props.onPress();tree=m.render(m.Email);
 assert.equal(input('Email address').props.value,'signup-fixture@example.invalid','Back preserves credentials');
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
 await submit().props.onPress();tree=m.render(m.Email);
 assert.equal(byId('birthday-year').props.value,'1990','Returning to step two preserves birthday');
 assert.equal(byId('signup-terms-checkbox').props.accessibilityState.checked,true,'Returning preserves agreement');
 for(const [language] of m.APP_LANGUAGES){
  await m.setAppLanguage(language);tree=m.render(m.Email);
  assert.equal(byId('birthday-day').props.accessibilityLabel,m.t('Day'));
  assert.equal(byId('signup-terms-checkbox').props.accessibilityLabel,m.t('I agree to the Terms of Service.'));
  assert.equal(byId('birthday-year').props.value,'1990','Language changes preserve the birthday');
  assert.equal(byId('signup-terms-checkbox').props.accessibilityState.checked,true,'Language changes preserve explicit agreement');
  if(language==='ar')assert.equal(m.localizedTextStyle().writingDirection,'rtl');
 }
 await m.setAppLanguage('en');tree=m.render(m.Email);
 m.state.fetchStatus='fetching';tree=m.render(m.Email);
 const fetching=find(n=>n.type==='TouchableOpacity'&&nodes(n).some(child=>child.type==='ActivityIndicator'));
 assert.equal(fetching.props.disabled,true);await fetching.props.onPress();assert.equal(m.calls.length,0);
 m.state.fetchStatus='idle';tree=m.render(m.Email);
 m.state.passwordError={message:'Fixture rejection'};await submit().props.onPress();assert.equal(m.calls.filter(c=>c[0]==='sendEmailCode').length,0,'Failed password creation does not send a verification code');
 tree=m.render(m.Email);assert.ok(input('Email address'),'Clerk rejection returns to editable credentials');
 m.state.passwordError=null;await submit().props.onPress();tree=m.render(m.Email);await submit().props.onPress();assert.equal(m.calls.at(-1)[0],'sendEmailCode');
 assert.deepEqual(m.calls.find(c=>c[0]==='password')[1],{emailAddress:'signup-fixture@example.invalid',password:'fixture-only-password',unsafeMetadata:{pulseOnboarding:{dateOfBirth:'1990-02-28',termsAccepted:true,termsVersion:'pulse-terms-preview-2026-09-16'}}});
 m.signUp.status='missing_requirements';m.signUp.unverifiedFields=['email_address'];m.signUp.missingFields=[];tree=m.render(m.Email);
 input('Enter 6-digit code').props.onChangeText('123456');tree=m.render(m.Email);
 const verify=find(n=>n.type==='TouchableOpacity'&&nodes(n).some(child=>child.type==='Text'&&child.props.children.flat(Infinity).includes('Verify email')));
 await verify.props.onPress();assert.deepEqual(m.calls.at(-2),['verifyEmailCode',{code:'123456'}]);assert.equal(m.calls.at(-1)[0],'finalize');assert.deepEqual(m.navigation.pop(),['replace','/(tabs)']);
 m.reset();m.auth.isSignedIn=true;tree=m.render(m.Options);assert.deepEqual(m.navigation.pop(),['replace','/(tabs)/profile']);
 console.log('PASS: two-step signup with no early account creation, back/value preservation and error recovery, detected-language signup choices, Arabic text direction, Google/Apple/Email ordering, removed Phone, guest profile routes, email routing, safe back navigation, sign-in link, required/exact password confirmation, birthday/18+ checks, unchecked terms/link and signup metadata, blocked submissions, visibility and language changes, existing email-code/finalization flow, and signed-in redirect. React/native/Clerk are mocked; no account or email is created.');
} finally {if(originalDateTimeFormat)Intl.DateTimeFormat=originalDateTimeFormat;try{unlinkSync(out)}catch{}}
