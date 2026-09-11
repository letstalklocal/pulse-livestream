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
 assert.equal(m.t('Moments'),'Momentos');assert.equal(m.t('My Vault'),'Mi bóveda');
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
   if(ts.isJsxAttribute(n)&&stableAttributes.has(n.name.getText(a)))result.push(printer.printNode(ts.EmitHint.Unspecified,n,a));
   if(ts.isPropertyAssignment(n)&&stableFields.has(n.name.getText(a)))result.push(printer.printNode(ts.EmitHint.Unspecified,n,a));
   ts.forEachChild(n,walk);
  }walk(a);return result;
 };
 const paths=execFileSync('git',['diff','--name-only'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(p=>/^artifacts\/mobile\/(app|components)\/.*\.tsx$/.test(p)&&!p.endsWith('/settings.tsx'));
 for(const path of paths){
  const before=execFileSync('git',['show',`HEAD:${path}`],{cwd:root,encoding:'utf8'});
  const after=readFileSync(root+path.replace('artifacts/mobile/',''),'utf8');
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
