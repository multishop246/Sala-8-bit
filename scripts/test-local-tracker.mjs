// Run after mock-supabase.mjs and the tracker-check Rust example.
// Fixtures go ONLY to localhost and the disposable database, never production.
import assert from 'node:assert/strict';
const base='http://127.0.0.1:5999';
const origin='chrome-extension://dnlepjhhfeiedffhpeblklljgabcocpi';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const setup=await fetch(base+'/_setup').then(r=>r.json());
const metric=()=>fetch(base+'/_metrics').then(r=>r.json());
async function signal(client,running) {
  const response=await fetch('http://127.0.0.1:43187/activity',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Sala-Activity':'1'},body:JSON.stringify({source:'chatgpt',client:`local-fixture-${client}`,conversation:(client==='1'?'a':'b').repeat(64),running})});
  assert.equal(response.status,200);
}
async function expectAgents(expected) {
  const started=Date.now();
  while(Date.now()-started<25000) {
    const result=await metric();
    if(result.live.live_received && result.live.agents===expected) {console.log(`PASS real tracker → RPC → database: ${expected} active`);return;}
    await sleep(500);
  }
  throw new Error('Live count did not reach '+expected);
}
try {
  await signal('1',false);await signal('2',false);await expectAgents(0);
  await signal('1',true);await expectAgents(1);
  await signal('2',true);await expectAgents(2);
  await signal('1',false);await signal('2',false);await expectAgents(0);
  // Explicit historical fixture: 3 simultaneous agents for 5 seconds of a
  // productive minute, rather than erroneously doubling the entire minute.
  const response=await fetch(base+'/rest/v1/rpc/agent_report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_token:setup.token,p_minutes:[{m:new Date(Date.now()-3*60000).toISOString(),app:'Teste de integração',cat:'prod',agents:3,music:false,productive_weight:13/12,base_weight:1,ia_fraction:1/12}]})});
  assert.equal(response.status,200);assert.equal((await response.json()).gravados,1);
  const after=await metric();
  assert.ok(after.history.bonus_minutes>=1/12-0.00001);
  assert.equal(after.live.agents,0,'history must not resurrect a completed task');
  console.log('PASS historical fractional bonus through HTTP; live remains zero');
  console.log('Controlled local integration passed. Real browser execution remains a separate check.');
} finally {
  await signal('1',false).catch(()=>{});await signal('2',false).catch(()=>{});
}
