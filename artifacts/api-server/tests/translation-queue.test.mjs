import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
const { code } = transformSync(readFileSync(new URL('../../mobile/utils/translationQueue.ts', import.meta.url),'utf8'), { loader:'ts',format:'cjs' });
const setup = () => { const module={exports:{}};new Function('module','exports',code)(module,module.exports);return module.exports.queueTranslation; };
const flush = async () => { for(let i=0;i<8;i++) await Promise.resolve(); };
test('limits concurrent requests and cancels a queued message without sending it',async()=>{
 const queue=setup(), release=[], started=[];
 const controls=Array.from({length:6},()=>new AbortController());
 const results=controls.map((control,i)=>queue(control.signal,()=>new Promise(resolve=>{started.push(i);release.push(resolve);})).catch(()=> 'cancelled'));
 await flush();assert.deepEqual(started,[0,1,2,3]);
 controls[4].abort();assert.equal(await results[4],'cancelled');
 release.shift()('ok');await flush();assert.deepEqual(started,[0,1,2,3,5]);
 release.forEach(resolve=>resolve('ok'));await Promise.all(results);
});
test('a failing request releases its slot',async()=>{
 const queue=setup();const controls=Array.from({length:5},()=>new AbortController());
 const results=controls.map((c,i)=>queue(c.signal,async()=>{if(i===0)throw Error('network');return i;}).catch(()=>-1));
 assert.deepEqual(await Promise.all(results),[-1,1,2,3,4]);
});
