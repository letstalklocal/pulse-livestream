const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync(require.resolve('../components/ReactionFavoritesChooser.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const slots=[];let cursor=0,chosen=[],saved=[],cancelled=0,fail=false;
const defaults=['❤️','🔥','👏','😂','😍','🎉','👍','🙌'];
const prefs={favorites:defaults,data:{emojis:defaults,customized:false},signedIn:true,isPending:false,isError:false,save:{isPending:false,async mutateAsync(emojis){if(fail)throw Error('offline');prefs.favorites=[...emojis];prefs.data={emojis:[...emojis],customized:true};return prefs.data;}}};
const react={useRef(value){const i=cursor++;return slots[i]??={current:value};},useEffect(){cursor++;},createElement:(type,props,...children)=>({type,props:props??{},children}),useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>slots[i]=v];}};
const api={};vm.runInNewContext(code,{exports:api,require(name){
 if(name==='react')return react;
 if(name==='react-native')return {ActivityIndicator:'ActivityIndicator',Keyboard:{dismiss(){}},Pressable:'Pressable',Text:'Text',View:'View',StyleSheet:{create:x=>x}};
 if(name==='@/i18n')return {t:x=>x,localizedTextStyle:()=>({})};
 if(name==='./ReactionEmojiChooser')return {ReactionEmojiChooser:'Chooser'};
 throw Error(name);
}});
const render=()=>{cursor=0;return api.ReactionFavoritesChooser({preferences:prefs,selected:'❤️',onChoose:e=>chosen.push(e),onSaved:(e,active)=>saved.push({emojis:e,active}),onCancel:()=>cancelled++});};
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...n.children.flatMap(nodes)];
const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(''):n?.children?text(n.children):'';
const button=(tree,label)=>nodes(tree).find(n=>n.type==='Pressable'&&(text(n)===label||n.props.accessibilityLabel===label));
(async()=>{
 let tree=render();assert.equal(nodes(tree).filter(n=>n.type==='Pressable'&&n.props.accessibilityLabel).length,8);assert.equal(button(tree,'❤️').props.accessibilityState.selected,true);
 button(tree,'🔥').props.onPress();assert.equal(chosen.length,0,'Choosing a favorite waits for Done');tree=render();button(tree,'Done').props.onPress();assert.equal(chosen.at(-1),'🔥','Done returns the active favorite');tree=render();
 button(tree,'Change Favorite').props.onPress();tree=render();assert.equal(tree.type,'Chooser');tree.props.onChoose('👩🏽‍💻');tree=render();assert.ok(button(tree,'👩🏽‍💻'));assert.equal(saved.length,0,'Edits stay local until Done');
 button(tree,'Done').props.onPress();await new Promise(setImmediate);tree=render();assert.equal(saved[0].emojis.length,8);assert.equal(saved[0].active,'👩🏽‍💻');assert.ok(saved[0].emojis.includes('👩🏽‍💻'));assert.ok(button(tree,'Change Favorite'));
 assert.equal(new Set(api.replaceFavorite(defaults,0,'🔥')).size,8,'Existing favorite swaps instead of duplicating');
 assert.equal(button(tree,'Cancel'),undefined,'Done is the only return action');assert.ok(prefs.favorites.includes('👩🏽‍💻'),'Saved favorites remain available');
 prefs.data=undefined;prefs.isError=true;tree=render();assert.equal(button(tree,'Pick favorites'),undefined,'Loading failure cannot overwrite account defaults');
 console.log('PASS: eight defaults, heart selection, pick/change same editor, atomic replacement/swap, Done persistence, failure/cancel preservation and load guard.');
})().catch(error=>{console.error(error);process.exit(1);});
