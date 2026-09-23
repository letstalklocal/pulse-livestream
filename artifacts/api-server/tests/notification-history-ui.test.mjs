import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

// Execute the actual screen with a lightweight native harness. Device layout is separate.
let state = null, fail = false, calls = [], navigations = [];
const item = { id: 7, category: 'messages', title: 'New message', body: 'Hello', route: '/dm/9', createdAt: 100, read: false };
const history = {
 userId: 'account-a', notifications: [item], unreadCount: 1,
 refetch: async () => {}, fetchNextPage: async () => {},
 change: { mutate: x => calls.push(x), mutateAsync: async x => { calls.push(x); if(fail) throw Error('offline'); }, reset() {} },
};
const element = (type, props, ...children) => ({type,props:{...props,children}});
const native = Object.fromEntries(['ActivityIndicator','FlatList','Text','TouchableOpacity','View'].map(x=>[x,x]));
const modules = {
 react: { createElement: element, useCallback: x=>x, useState: ()=>[state,x=>state=x] },
 'react-native': {...native,Platform:{OS:'ios'}},
 '@expo/vector-icons': {Ionicons:'Ionicons'},
 'expo-router': {Redirect:'Redirect',useFocusEffect:()=>{},useRouter:()=>({push:x=>navigations.push(x),back:()=>{}})},
 'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:20,bottom:20})},
 '@/hooks/useColors':{useColors:()=>({})},
 '@/i18n':{useAppLanguage:()=>({t:x=>x,localizedTextStyle:()=>({}),appLocale:()=> 'en'})},
 '@/hooks/useNotificationHistory':{useNotificationHistory:()=>history},
 '@/components/CreatorVideoSheet':{CreatorVideoSheet:'CreatorVideoSheet'},
};
const source=readFileSync(new URL('../../mobile/app/notifications.tsx',import.meta.url),'utf8');
const {code}=transformSync(source,{loader:'tsx',format:'cjs',jsx:'transform'});
const mod={exports:{}};
new Function('require','module','exports',code)(name=>{assert.ok(modules[name],name);return modules[name]},mod,mod.exports);
const render=mod.exports.default;
function nodes(tree){return !tree || typeof tree!=='object'?[]:[tree,...(tree.props?.children??[]).flat(Infinity).flatMap(nodes)]}
let tree=render();
const list=nodes(tree).find(x=>x.type==='FlatList');
const row=list.props.renderItem({item});
const buttons=nodes(row).filter(x=>x.type==='TouchableOpacity');
buttons[0].props.onPress(); await new Promise(resolve=>setImmediate(resolve));
assert.deepEqual(calls.pop(),{id:7,action:'read'});
assert.deepEqual(navigations,['/dm/9']);
fail=true; buttons[0].props.onPress(); await new Promise(resolve=>setImmediate(resolve));
assert.equal(navigations.length,1,'failed read does not claim success/navigate');
fail=false;
buttons[1].props.onPress(); assert.deepEqual(calls.pop(),{id:7,action:'delete'});
const clear=nodes(tree).find(x=>x.type==='TouchableOpacity'&&nodes(x).some(n=>n.type==='Text'&&n.props.children.includes('Clear all')));
clear.props.onPress(); assert.deepEqual(calls.pop(),{action:'clear'});
const videoRow=list.props.renderItem({item:{...item,category:'videoProcessing'}});
nodes(videoRow).find(x=>x.type==='TouchableOpacity').props.onPress(); await new Promise(resolve=>setImmediate(resolve));
assert.equal(state,'account-a');
assert.ok(nodes(render()).some(x=>x.type==='CreatorVideoSheet'));
history.userId='account-b';assert.ok(!nodes(render()).some(x=>x.type==='CreatorVideoSheet'),'switching accounts hides old video sheet');
history.userId=null; assert.equal(render().type,'Redirect');
console.log('History UI passed: read/open, failed action, delete, clear, direct video-sheet navigation, account isolation and sign-in guard. Native visuals not exercised.');
