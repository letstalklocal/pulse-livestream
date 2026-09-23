const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync(require.resolve('../app/stream/[channelId].tsx'), 'utf8');
const ast = ts.createSourceFile('screen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function walk(n) {
  if (ts.isJsxSelfClosingElement(n) && n.tagName.getText(ast) === 'GiftPicker') {
    handler = n.attributes.properties.find(p => p.name?.getText(ast) === 'onSend').initializer.expression.getText(ast);
  }
  ts.forEachChild(n, walk);
}
walk(ast); assert.ok(handler);
const calls=[],closed=[],balances=[],animations=[],errors=[];
const busy={current:false}; let sequence=0;
const scope={user:{uid:1,name:'Viewer'},giftSending:busy,setShowGiftPicker:x=>closed.push(x),
 createGiftRequestKey:()=>String(++sequence),giftRecipient:null,hostUid:2,channelId:'test',
 spendMutation:{mutate:(data,callbacks)=>calls.push({data,callbacks})},
 queryClient:{setQueryData:(key,data)=>balances.push(data.balance),invalidateQueries:()=>{}},
 getGetCoinBalanceQueryKey:()=>[],spawnGift:(...args)=>animations.push(args),
 Haptics:{impactAsync:()=>{},ImpactFeedbackStyle:{Medium:1}},Alert:{alert:(...x)=>errors.push(x)},t:x=>x};
const code=ts.transpileModule(`const send = ${handler};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const send=new Function(...Object.keys(scope),code+';return send;')(...Object.values(scope));
send({name:'Rose',coins:1});send({name:'Lips',coins:99});
assert.equal(calls.length,1,'In-flight gift cannot be submitted again');
calls[0].callbacks.onSuccess({balance:99});calls[0].callbacks.onSettled();
assert.deepEqual(closed,[]);assert.deepEqual(balances,[99]);assert.equal(animations.length,1);
send({name:'Lips',coins:99});assert.equal(calls.length,2);
assert.notEqual(calls[0].data.data.idempotencyKey,calls[1].data.data.idempotencyKey);
calls[1].callbacks.onError();calls[1].callbacks.onSettled();
assert.equal(errors.length,1);assert.equal(busy.current,false);assert.deepEqual(closed,[]);
console.log('PASS: live gift sheet stays open on success/failure, blocks concurrent sends, updates wallet/animation, and permits the next gift.');
