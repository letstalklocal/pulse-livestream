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
const pending={current:0}; let sequence=0;
const scope={user:{uid:1,name:'Viewer'},pendingGiftPayments:pending,setShowGiftPicker:x=>closed.push(x),
 createGiftRequestKey:()=>String(++sequence),giftRecipient:null,hostUid:2,channelId:'test',
 spendMutation:{mutateAsync:data=>new Promise((resolve,reject)=>calls.push({data,resolve,reject}))},
 queryClient:{setQueryData:(key,data)=>balances.push(data.balance),invalidateQueries:()=>{}},
 getGetCoinBalanceQueryKey:()=>[],spawnGift:(...args)=>animations.push(args),
 refreshGiftCatalog:async()=>{},giftFromSnapshot:()=>null,
 Haptics:{impactAsync:()=>{},ImpactFeedbackStyle:{Medium:1}},Alert:{alert:(...x)=>errors.push(x)},t:x=>x};
const code=ts.transpileModule(`const send = ${handler};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const send=new Function(...Object.keys(scope),code+';return send;')(...Object.values(scope));
async function test() {
  const taps=Array.from({length:5},()=>send({name:'Rose',coins:1}));
  assert.equal(calls.length,5,'all five rapid live taps start payments immediately');
  assert.equal(new Set(calls.map(call=>call.data.data.idempotencyKey)).size,5);
  assert.equal(pending.current,5);
  for(const index of [4,1,3,0,2]) calls[index].resolve({balance:99-index,combo:{id:'combo',count:index+1,totalCoins:index+1}});
  await Promise.all(taps);
  assert.equal(animations.length,5,'every overlapping purchase keeps its own success handler');
  assert.equal(animations.some(args=>args[4].count===5),true);
  assert.equal(balances.length,5);assert.equal(pending.current,0);assert.deepEqual(closed,[]);
  const failure=send({name:'Lips',coins:99});calls[5].reject(new Error('insufficient'));await failure;
  assert.equal(errors.length,1);assert.equal(animations.length,5);assert.equal(pending.current,0);assert.deepEqual(closed,[]);
  console.log('PASS: five concurrent live gift taps, independent keys/results, out-of-order responses, wallet updates, open sheet and payment failure. Device tapping remains pending.');
}
test().catch(error=>{console.error(error);process.exitCode=1;});
