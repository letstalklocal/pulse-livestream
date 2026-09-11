// Collect app-owned interface copy only. This script never makes network calls.
const ts=require('typescript'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function files(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap(x=>x.isDirectory()?files(path.join(d,x.name)):/\.tsx?$/.test(x.name)?[path.join(d,x.name)]:[])}
const keys=new Set(JSON.parse(fs.readFileSync(path.join(root,'i18n/source-strings.json'),'utf8')));
for(const file of ['app','components','hooks','utils','constants'].flatMap(d=>files(path.join(root,d)))){
 if(/Frames|defaultGiftSound|momentGiftAssets/.test(file))continue;
 const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),99,true,/tsx$/.test(file)?4:3);
 function literal(n){if(n&&ts.isConditionalExpression(n)){literal(n.whenTrue);literal(n.whenFalse);return}if(n&&(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))&&/[A-Za-z]{2}/.test(n.text))keys.add(n.text)}
 function walk(n){
  if(ts.isCallExpression(n)){
   const name=n.expression.getText(ast);
   if(name==='t')literal(n.arguments[0]);
   if(['button','field','row'].includes(name)){literal(n.arguments[0]);if(name==='row')literal(n.arguments[1])}
  }
  if(ts.isPropertyAssignment(n)&&['label','title','description','detail'].includes(n.name.getText(ast)))literal(n.initializer);
  if(ts.isArrayLiteralExpression(n)&&n.elements.length===2&&ts.isStringLiteral(n.elements[0])&&ts.isStringLiteral(n.elements[1])&&/^[A-Z]/.test(n.elements[1].text))literal(n.elements[1]);
  if(ts.isNewExpression(n)&&n.expression.getText(ast)==='Error')literal(n.arguments?.[0]);
  ts.forEachChild(n,walk);
 }walk(ast);
}
for(const s of ['App language','Phone language ({v0})','Changes the app interface. Chat translation has its own language setting.','Tap a gift to send it live','Art','Talk','MUSIC','GAMING','TALK','ART','DANCE','OTHER','Day','Week','Month','Year','My Vault','Moments','Account','Password','Connected accounts','Email address','Delete account','Yesterday','yourself','None','Everyone','Friends','Discover','Following','Music','Gaming','Dance','Chat','Sports','Lifestyle','New posts','Harassment or bullying','Spam or scam','Sexual content','Violence or threats','Child safety','Other'])keys.add(s);
const list=[...keys].sort();
fs.writeFileSync(path.join(root,'i18n/source-strings.json'),JSON.stringify(list,null,2)+'\n');
const existing=JSON.parse(fs.readFileSync(path.join(root,'i18n/locales/en.json'),'utf8'));
fs.writeFileSync(path.join(root,'i18n/locales/en.json'),JSON.stringify(Object.fromEntries(list.map(k=>[k,existing[k]??k])),null,2)+'\n');
fs.writeFileSync(path.join(root,'i18n/manifest.json'),JSON.stringify({schemaVersion:1,catalogVersion:1,defaultLanguage:'en',languages:['en','es','pt-BR','ar','de','fr','zh-CN','hi','id','ja'],keyPolicy:'Source keys are stable identifiers. Edit values, not keys.',terminology:'terminology.json'},null,2)+'\n');
console.log(JSON.stringify({strings:list.length,characters:list.join('').length}));
