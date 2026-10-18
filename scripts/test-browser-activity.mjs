import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import assert from 'node:assert/strict';
const code=readFileSync(new URL('../browser-extension/content.js',import.meta.url),'utf8');
async function sample(labels,host='chatgpt.com',withDiagnostic=false) {
  const messages=[];
  let listener;
  const buttons=labels.map(value=>{
    const item=typeof value==='string'?{label:value}:value;
    const testId=item.testId || (item.stopTestId?'stop-button':'');
    return {outsideComposer:!!item.outsideComposer,disabled:!!item.disabled,getClientRects:()=>item.hidden?[]:[{}],
      matches:selector=>selector==='button.ctrl-enter-submits'?!!item.studioRun:!!testId && selector.includes(`"${testId}"`),
      getAttribute:name=>({'aria-label':item.label,'data-testid':testId,'aria-disabled':item.ariaDisabled?'true':null}[name]??null),
      querySelectorAll:selector=>selector==='span'?(item.spans||[]).map(textContent=>({textContent})):selector==='svg path' && item.path?[{getAttribute:name=>name==='d'?item.path:null}]:[]};
  });
  const composer={getClientRects:()=>[{}],querySelectorAll:()=>buttons.filter(b=>!b.outsideComposer)};
  const stale={getClientRects:()=>[{}],querySelectorAll:()=>[]};
  const editors=[stale,composer].map(c=>({closest:()=>c,get value(){throw new Error('prompt must not be read');}}));
  const context={location:{hostname:host,origin:`https://${host}`,pathname:'/c/private-id'},crypto:webcrypto,TextEncoder,
    document:{documentElement:{},querySelectorAll:selector=>selector==='button'?buttons:selector.startsWith('[id=') && host!=='aistudio.google.com'?editors:[],getElementById:()=>editors[0]},
    MutationObserver:class{observe(){}},chrome:{runtime:{sendMessage:async value=>messages.push(value),onMessage:{addListener(fn){listener=fn;}}}},setInterval(){},setTimeout};
  vm.runInNewContext(code,context);
  for (let i=0;i<100 && !messages.length;i++) await new Promise(resolve=>setTimeout(resolve,5));
  assert.ok(messages.length,'a página deve produzir uma amostra');
  if(withDiagnostic) {let value;listener({type:'diagnostic'},{},reply=>{value=reply;});return value;}
  return messages[0];
}
assert.equal((await sample([])).running,false);
assert.equal((await sample(['Send message','New chat'])).running,false);
const active=await sample(['Stop generating','Stop generating']);
assert.equal(active.running,true);
assert.deepEqual(Object.keys(active).sort(),['conversation','running','source','type']);
assert.match(active.conversation,/^[a-f0-9]{64}$/);
assert.equal(JSON.stringify(active).includes('private-id'),false);
assert.equal((await sample(['Parar de gerar'],'gemini.google.com')).source,'gemini');
assert.equal((await sample([{label:'Stop generating',disabled:true}])).running,false);
assert.equal((await sample([{label:'Stop generating',hidden:true}])).running,false);
assert.equal((await sample([{label:'',stopTestId:true}])).running,true);
assert.equal((await sample([{testId:'composer-stop-button'}])).running,true);
assert.equal((await sample([{testId:'composer-submit-button'}])).running,false);
assert.equal((await sample([{label:'Stop streaming',ariaDisabled:true}])).running,false);
for(const label of ['Parar transmissão','Interromper transmissão','Parar de responder']) assert.equal((await sample([label])).running,true);
const diagnostic=await sample([{testId:'composer-stop-button'}],'chatgpt.com',true);
assert.equal(diagnostic.running,true);
assert.equal(diagnostic.version,'0.5.10');
assert.equal(JSON.stringify(diagnostic).includes('private-id'),false);
assert.deepEqual(Object.keys(diagnostic).sort(),['composerFound','controlHistory','controls','running','service','version']);
assert.equal(diagnostic.controlHistory.length,1);
assert.equal('signature' in diagnostic.controlHistory[0],false);
// Exact control captured during a real ChatGPT response in Opera GX.
const square='M4.5 5.75C4.5 5.05964 5.05964 4.5 5.75 4.5H14.25C14.9404 4.5 15.5 5.05964 15.5 5.75V14.25C15.5 14.9404 14.9404 15.5 14.25 15.5H5.75C5.05964 15.5 4.5 14.9404 4.5 14.25V5.75Z';
const captured={label:'Parar',path:square};
assert.equal((await sample([captured])).running,true);
assert.equal((await sample([{...captured,label:'Stop'}])).running,true);
for(const change of [{disabled:true},{hidden:true},{ariaDisabled:true},{outsideComposer:true},{path:'M0 0L1 1Z'},{label:'Iniciar conversa por voz'}]) {
  assert.equal((await sample([{...captured,...change}])).running,false);
}
assert.equal((await sample(['Parar'])).running,false);
assert.equal((await sample([captured],'claude.ai')).running,false);
assert.equal((await sample([{label:'Enviar',path:'M0 0L1 1Z'}, {label:'Iniciar conversa por voz'}])).running,false);
for (const [host,source] of [['claude.ai','claude'],['labs.google','flow'],['flow.google.com','flow'],['aistudio.google.com','aistudio'],['chat.openai.com','chatgpt']]) {
  assert.equal((await sample([],host)).source,source);
}
const manifest=JSON.parse(readFileSync(new URL('../browser-extension/manifest.json',import.meta.url),'utf8'));
assert.ok(manifest.content_scripts.some(s=>s.matches.includes('https://flow.google.com/*')));
console.log('Verificações de execução, controles ocultos, serviços e privacidade da extensão passaram.');
const studioDiagnostic=await sample([{studioRun:true,spans:['Run','Ctrl']},{label:'Conta do Google: private@example.com'}],'aistudio.google.com',true);
assert.equal(studioDiagnostic.composerFound,false);
assert.equal(studioDiagnostic.running,false,'diagnostic capture must not imply execution');
assert.equal(studioDiagnostic.controls.length,1);
assert.equal(studioDiagnostic.controls[0].executionLabel,'Run');
assert.equal(JSON.stringify(studioDiagnostic).includes('private@example.com'),false);
const studioControl={studioRun:true,spans:['progress_activity','Stop']};
assert.equal((await sample([studioControl],'aistudio.google.com')).running,true);
for(const change of [{disabled:true},{hidden:true},{ariaDisabled:true},{studioRun:false},{spans:['Run','Ctrl']}])
  assert.equal((await sample([{...studioControl,...change}],'aistudio.google.com')).running,false);
assert.equal((await sample([studioControl],'claude.ai')).running,false);
