import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
const code=readFileSync(new URL('../browser-extension/background.js',import.meta.url),'utf8');
function worker(fetcher) {
  let receive,removed;
  const storage={clientPrefix:'1234567890abcdef'};
  const context={crypto:webcrypto,URL,AbortSignal,fetch:fetcher,chrome:{
    storage:{local:{get:async keys=>structuredClone(Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,storage[key]]))),set:async value=>Object.assign(storage,structuredClone(value))}},
    action:{setBadgeText:async()=>{}},runtime:{onMessage:{addListener(fn){receive=fn;}}},
    tabs:{onRemoved:{addListener(fn){removed=fn;}},query:async()=>[],sendMessage:async()=>{}},
    alarms:{create(){},onAlarm:{addListener(){}}}
  }};
  vm.runInNewContext(code,context);
  return {storage,close:()=>removed(1),send:running=>new Promise(resolve=>receive({type:'sample',source:'chatgpt',conversation:'a'.repeat(64),running},{tab:{id:1},url:'https://chatgpt.com/c/private-id'},resolve))};
}
let release;
const gate=new Promise(resolve=>{release=resolve;});
const requests=[];
const ordered=worker(async(url,args)=>{
  requests.push(JSON.parse(args.body));
  if(requests.length===1) await gate;
  return {ok:true,status:200};
});
const start=ordered.send(true),stop=ordered.send(false);
await new Promise(resolve=>setTimeout(resolve,10));
assert.equal(requests.length,1,'stop must wait for the start delivery');
release();await Promise.all([start,stop]);
assert.deepEqual(requests.map(r=>r.running),[true,false]);
assert.deepEqual(Object.keys(requests[0]).sort(),['client','conversation','running','source']);
assert.deepEqual(ordered.storage.recentEvents.map(e=>e.running),[true,false]);
assert.equal(JSON.stringify(ordered.storage.recentEvents).includes('private-id'),false);
assert.equal(JSON.stringify(ordered.storage.recentEvents).includes('a'.repeat(64)),false);
const denied=worker(async()=>({ok:false,status:403}));
await denied.send(true);
assert.equal(denied.storage.connection.status,403);
assert.equal(denied.storage.connection.reason,'http');
assert.equal(denied.storage.recentEvents[0].ok,false);
const offline=worker(async()=>{throw new TypeError('unreachable');});
await offline.send(true);
assert.equal(offline.storage.connection.reason,'network');
console.log('Entrega em ordem, falhas HTTP/rede e diagnóstico sem mensagens/URLs: testes passaram.');
