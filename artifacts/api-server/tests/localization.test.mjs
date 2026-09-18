import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync, unlinkSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const require=createRequire(import.meta.url);
const ts=require('../../mobile/node_modules/typescript');
const root=fileURLToPath(new URL('../../mobile/',import.meta.url));
const out=fileURLToPath(new URL(`.i18n-${randomUUID()}.cjs`,import.meta.url));
try {
 await build({stdin:{contents:`export * from './i18n';export * from './i18n/core';export * from './i18n/validate';export {formatLastSeen} from './utils/lastSeen';export {storage} from '@react-native-async-storage/async-storage';`,resolveDir:root},bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent',plugins:[{name:'native',setup(b){
  b.onResolve({filter:/^(react|@react-native-async-storage\/async-storage)$/},a=>({path:a.path,namespace:'mock'}));
  b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='react'?`export const useSyncExternalStore=(subscribe,snapshot)=>snapshot();`:`export const storage={values:new Map([['pulse:translation:123','unchanged']]),writes:[],fail:false};export default {getItem:async key=>storage.values.get(key)??null,setItem:async(key,value)=>{if(storage.fail)throw new Error('disk unavailable');storage.writes.push([key,value]);storage.values.set(key,value)}};`}));
 }}]});
 const m=require(out);
 assert.equal(m.resolveAppLanguage('es-MX'),'es');assert.equal(m.resolveAppLanguage('pt-PT'),'pt-BR');
 assert.equal(m.resolveAppLanguage('ar-SA'),'ar');assert.equal(m.resolveAppLanguage('zh-Hans-SG'),'zh-CN');
 assert.equal(m.resolveAppLanguage('zh-Hant-TW'),'en');assert.equal(m.resolveAppLanguage('xx'),'en');
 assert.equal(m.translateText({'Hello {v0}':'Hola {v0}'},'Hello {v0}',{v0:'<b>$& {v1}</b>'}),'Hola <b>$& {v1}</b>');
 assert.equal(m.translateText({},'Count {v0}',{v0:0}),'Count 0');assert.equal(m.translateText({},'Missing'),'Missing');
 assert.equal(m.translateText({},'{v0}',{v0:null}),'');assert.equal(m.translateText({},'{v0}',{v0:false}),'');
 assert.equal(m.translateText({},'toString'),'toString');
 const source={'Send {v0} coins for Crown in Party':'Send {v0} coins for Crown in Party'};
 assert.deepEqual(m.validateCatalog(source,{'Send {v0} coins for Crown in Party':'Envía {v0} monedas por Crown en Party'}),[]);
 assert.ok(m.validateCatalog(source,{'Send {v0} coins for Crown in Party':'Envía monedas por Corona'}).length>=2);
 await m.initializeAppLanguage();await m.setAppLanguage('en');
 const english=m.useAppLanguage();assert.equal(english.t('Cancel'),'Cancel');
 await m.setAppLanguage('es');assert.equal(m.useAppLanguage().t('Cancel'),'Cancelar');
 assert.notEqual(m.useAppLanguage().t,english.t,'Compiler sees a new language-bound translator');
 assert.equal(english.t('Cancel'),'Cancel');
 assert.equal(m.t('Crown'),'Crown');assert.equal(m.t('LIVE'),'LIVE');assert.equal(m.t('Party'),'Party');
 assert.equal(m.t('Moments'),'Momentos');assert.equal(m.t('My Vault'),'Bóveda multimedia');
 m.storage.fail=true;await assert.rejects(m.setAppLanguage('de'));assert.equal(m.useAppLanguage().language,'es');
 m.storage.fail=false;await Promise.all([m.setAppLanguage('fr'),m.setAppLanguage('de')]);assert.equal(m.useAppLanguage().language,'de');
 assert.equal(m.storage.values.get('pulse:translation:123'),'unchanged');assert.ok(m.storage.writes.every(([key])=>key==='pulse:app-language'));
 await m.setAppLanguage('ar');assert.equal(m.localizedTextStyle().writingDirection,'rtl');assert.equal(m.appLocale(),'ar');
 await assert.rejects(m.setAppLanguage('not-a-language'));
 const now=1_000_000_000;
 assert.equal(m.formatLastSeen(now,now),'Last Seen just now');assert.equal(m.formatLastSeen(now-60000,now),'Last Seen 1 min ago');
 assert.equal(m.formatLastSeen(now-10*60000,now),'Last Seen 10 mins ago');assert.equal(m.formatLastSeen(now-3600000,now),'Last Seen 1 hour ago');
 const arabic=m.formatLastSeen(now-2*3600000,now,'ar',(key,v)=>v.v0??key);
 assert.equal(arabic,new Intl.RelativeTimeFormat('ar',{numeric:'always'}).format(-2,'hour'));
 const stableAttributes=new Set(['key','value','onChangeText','editable','secureTextEntry','href','name','testID','keyboardType']);
 const stableFields=new Set(['amount','giftName','idempotencyKey','recipientUid','channelId','publishCameraTrack','publishMicrophoneTrack']);
 const printer=ts.createPrinter({removeComments:true});
 const signatures=(file,source)=>{
  const a=ts.createSourceFile(file,source,99,true,4),result=[];
  function walk(n){
   // Direct live-menu actions intentionally lose their decorative navigation chevrons.
   if(file.endsWith('/app/go-live.tsx')&&ts.isJsxAttribute(n)&&n.name.getText(a)==='name'&&n.initializer?.text==='chevron-forward')return;
   // Both battle segments remain mounted for the approved smooth retreat.
   if(file.endsWith('/components/PartyStage.tsx')&&ts.isJsxAttribute(n)&&((n.name.getText(a)==='key'&&n.initializer?.getText(a)==='{side}')||(n.name.getText(a)==='testID'&&n.initializer?.getText(a).includes('battle-score-tip'))))return;
   // Approved centered winner avatar uses the server-selected participant's identity.
   if(file.endsWith('/components/PartyStage.tsx')&&ts.isJsxAttribute(n)&&n.name.getText(a)==='name'&&n.initializer?.getText(a)==='{winner.name}')return;
   // Approved score marker is additive; its real/test mapping is checked in party-window tests.
   if(file.endsWith('/components/PartyStage.tsx')&&ts.isJsxAttribute(n)&&n.name.getText(a)==='testID'&&['battle-score-marker','battle-score-mine','battle-score-peer','battle-score-tip','battle-score-flow','battle-countdown','battle-result','battle-winner-avatar','battle-score-tie'].includes(n.initializer?.text))return;
   // User-approved additive live reactions; existing stream controls remain compared.
   if((file.endsWith('/stream/[channelId].tsx')||file.endsWith('/app/go-live.tsx'))&&ts.isJsxSelfClosingElement(n)&&['LiveReactions','ReactionFavoritesChooser'].includes(n.tagName.getText(a)))return;
   // The user approved this additional confirmation control; signup-flow tests cover its behavior.
   if(file.endsWith('/(auth)/sign-up.tsx')&&ts.isJsxElement(n)&&n.openingElement.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(a)==='testID'&&p.initializer?.text==='confirm-password-field'))return;
   // Approved two-step signup remounts the scroller to reset its position; form state stays in the screen.
   if(file.endsWith('/(auth)/sign-up-email.tsx')&&ts.isJsxAttribute(n)&&n.name.getText(a)==='key'&&n.initializer?.getText(a)==='{step}'&&n.parent.parent.tagName?.getText(a)==='KeyboardAwareScrollViewCompat')return;
   // Google signup is now implemented in a shared component; dedicated OAuth tests cover it.
   if(file.endsWith('/(auth)/sign-up.tsx')&&ts.isJsxElement(n)&&n.openingElement.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(a)==='testID'&&p.initializer?.text==='signup-google'))return;
   if(file.endsWith('/app/_layout.tsx')&&ts.isJsxAttribute(n)&&n.name.getText(a)==='name'&&n.initializer?.text==='sso-callback')return;
   // User removed the Phone placeholder and replaced only the signed-out profile branch.
   if(file.endsWith('/(auth)/sign-up.tsx')&&ts.isJsxElement(n)&&n.openingElement.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(a)==='testID'&&p.initializer?.text==='signup-phone'))return;
   if(file.endsWith('/(tabs)/profile.tsx')&&ts.isIfStatement(n)&&n.expression.getText(a)==='!user')return;
   // Approved additive birthday/terms fields; their behavior is covered by signup-flow tests.
   if(file.endsWith('/(auth)/sign-up-email.tsx')&&ts.isJsxSelfClosingElement(n)&&n.tagName.getText(a)==='SignupEligibilityFields')return;
   // Approved additive account entry; keep comparing every existing account control.
   if(file.endsWith('/account.tsx')&&ts.isJsxElement(n)&&n.openingElement.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(a)==='testID'&&p.initializer?.text==='age-verification-entry'))return;
   // Approved Discover username-search button and route; preserve all prior controls.
   if(file.endsWith('/(tabs)/index.tsx')&&ts.isJsxElement(n)&&n.openingElement.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(a)==='testID'&&p.initializer?.text==='discover-user-search'))return;
   if(file.endsWith('/app/_layout.tsx')&&ts.isJsxAttribute(n)&&n.name.getText(a)==='name'&&n.initializer?.text==='search-users')return;
   // Approved additive purchase/General routes; continue comparing every prior route.
   if(file.endsWith('/app/_layout.tsx')&&ts.isJsxAttribute(n)&&n.name.getText(a)==='name'&&['coin-store','subscriptions','general'].includes(n.initializer?.text))return;
   // The explicitly registered verification route removes Expo's default header, as approved.
   if(file.endsWith('/app/_layout.tsx')&&ts.isJsxAttribute(n)&&n.name.getText(a)==='name'&&n.initializer?.text==='verification')return;
   if(file.endsWith('/app/verification.tsx')&&ts.isJsxAttribute(n)&&n.name.getText(a)==='name'&&n.initializer?.text==='chevron-back')return;
   // The new signup route is intentional; compare the existing email form after its move.
   if(file.endsWith('/(auth)/_layout.tsx')&&ts.isJsxAttribute(n)&&n.name.getText(a)==='name'&&n.initializer?.text==='sign-up-email')return;
   // Approved coin-card redesign replaces the decorative ellipse with gold SVG artwork.
   if(file.endsWith('/components/CoinStoreContent.tsx')&&ts.isJsxAttribute(n)&&n.name.getText(a)==='name'&&n.initializer?.text==='ellipse')return;
   // Approved move of the existing Refresh action to the coin-store header icon.
   if(file.endsWith('/components/CoinStoreContent.tsx')&&ts.isJsxAttribute(n)&&n.name.getText(a)==='name'&&n.initializer?.text==='refresh')return;
   // Approved viewer menu reorder moves Report above Share; these decorative icon names may move.
   if(file.endsWith('/stream/[channelId].tsx')&&ts.isJsxAttribute(n)&&n.name.getText(a)==='name'&&['flag-outline','share-outline'].includes(n.initializer?.text))return;
   // User-approved viewer exit button, Premium badge and missing-avatar icon.
   // These additive header controls are separate from localization preservation.
   if(file.endsWith('/stream/[channelId].tsx')&&ts.isJsxElement(n)&&n.openingElement.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(a)==='testID'&&['viewer-exit-live','viewer-premium-badge','viewer-choose-reaction'].includes(p.initializer?.text)))return;
   if(file.endsWith('/stream/[channelId].tsx')&&ts.isJsxAttribute(n)&&n.name.getText(a)==='name'&&n.initializer?.text==='person')return;
   if(ts.isJsxAttribute(n)&&stableAttributes.has(n.name.getText(a)))result.push(printer.printNode(ts.EmitHint.Unspecified,n,a));
   if(ts.isPropertyAssignment(n)&&stableFields.has(n.name.getText(a)))result.push(printer.printNode(ts.EmitHint.Unspecified,n,a));
   ts.forEachChild(n,walk);
  }walk(a);return result;
 };
 const paths=execFileSync('git',['diff','--name-only'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(p=>/^artifacts\/mobile\/(app|components)\/.*\.tsx$/.test(p)&&!p.endsWith('/settings.tsx'));
 for(const path of paths){
  if(['artifacts/mobile/components/SignupEligibilityFields.tsx','artifacts/mobile/components/CompleteSignup.tsx'].includes(path))continue;
  // Approved replacement by the unified sheet is covered by live-viewers-sheet.test.cjs,
  // including search, moderation actions and preventing cached host-roster disclosure.
  if(['artifacts/mobile/components/ViewerManagementSheet.tsx','artifacts/mobile/components/GiftLeaderboard.tsx'].includes(path))continue;
  const before=execFileSync('git',['show',`HEAD:${path}`],{cwd:root,encoding:'utf8'});
  // Both signup routes now exist in HEAD; compare each screen against its own baseline.
  const currentPath=path;
  const after=readFileSync(root+currentPath.replace('artifacts/mobile/',''),'utf8');
  assert.deepEqual(signatures(path,after),signatures(path,before),`Behavioral attributes and payment/media identifiers changed in ${path}`);
 }
 const settings=readFileSync(root+'app/settings.tsx','utf8');assert.match(settings,/key=\{item\.label\}/);
 const dm=readFileSync(root+'app/dm/[peerId].tsx','utf8');assert.match(dm,/placeholder=\{t\("Type\.\.\."\)\}/);assert.match(dm,/text=\{item\.text\}/);
 const gifts=readFileSync(root+'components/GiftPicker.tsx','utf8');assert.match(gifts,/>\{gift\.name\}</);assert.doesNotMatch(gifts,/t\(gift\.name\)/);
 const files=readdirSync(root+'i18n/locales');const en=JSON.parse(readFileSync(root+'i18n/locales/en.json','utf8'));
 for(const file of files){const catalog=JSON.parse(readFileSync(root+'i18n/locales/'+file,'utf8'));assert.deepEqual(m.validateCatalog(en,catalog,true),[],file)}
 const missing=files.filter(file=>Object.keys(JSON.parse(readFileSync(root+'i18n/locales/'+file,'utf8'))).length<Object.keys(en).length);
 console.log('PASS: language resolution, literal interpolation, protected terms, English fallback, saved preference isolation/failures/ordering, compiler reactivity, Arabic text/relative time, and unchanged behavioral attributes/payment IDs/media settings. Native layout and device input are not exercised.');
 assert.deepEqual(missing,[],'Every language must cover the complete interface catalog');
 const manifest=JSON.parse(readFileSync(root+'i18n/manifest.json','utf8'));
 assert.deepEqual(files.sort(),manifest.languages.map(code=>code+'.json').sort());
 assert.deepEqual(JSON.parse(readFileSync(root+'i18n/source-strings.json','utf8')),Object.keys(en));
 for(const [code] of m.APP_LANGUAGES){await m.setAppLanguage(code);const catalog=JSON.parse(readFileSync(root+'i18n/locales/'+code+'.json','utf8'));assert.equal(m.useAppLanguage().t('App language'),catalog['App language']);assert.equal(m.t('Moments'),catalog.Moments);assert.equal(m.t('My Vault'),catalog['My Vault']);}
 console.log(`PASS: all ${files.length} bundled languages cover ${Object.keys(en).length} interface strings with exact placeholders and protected terms; language switching uses the real catalogs.`);
}finally{try{unlinkSync(out)}catch{}}
