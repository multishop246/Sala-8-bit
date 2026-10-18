import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const code=readFileSync(new URL('../browser-extension/popup.js',import.meta.url),'utf8');
const version=JSON.parse(readFileSync(new URL('../browser-extension/manifest.json',import.meta.url),'utf8')).version;
async function popup(connected) {
  const elements=new Map();
  const element=id=>{if(!elements.has(id)) elements.set(id,{hidden:true,addEventListener(type,fn){this[type]=fn;}});return elements.get(id);};
  const context={document:{getElementById:element},setInterval(){},chrome:{runtime:{getManifest:()=>({version})},storage:{local:{get:async()=>({connection:{ok:true,at:Date.now(),status:200},recentEvents:[]})}},tabs:{query:async()=>[{id:1}],sendMessage:async()=>{if(!connected) throw Error('no receiver');return {version,running:true};}}}};
  vm.runInNewContext(code,context);
  await new Promise(resolve=>setTimeout(resolve,0));
  await element('check').click();
  return element;
}
const failed=await popup(false);
assert.equal(failed('version').textContent,`Versão ${version}.`);
assert.equal(failed('copy').hidden,false);
assert.equal(JSON.parse(failed('diagnostic').value).tabConnected,false);
assert.match(failed('execution').textContent,/Ctrl\+R/);
const active=await popup(true);
assert.equal(active('execution').textContent,'Execução detectada nesta aba.');
assert.equal(JSON.parse(active('diagnostic').value).running,true);
console.log('Painel: versão automática, diagnóstico copiável sem conexão e execução detectada passaram.');
