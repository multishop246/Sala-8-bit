const version=chrome.runtime.getManifest().version;
document.getElementById('version').textContent=`Versão ${version}.`;
chrome.storage.local.get('connection').then(({connection}) => {
  document.getElementById('state').textContent = connection?.ok && Date.now()-connection.at<75000
    ? 'Conectado ao aplicativo de computador.' : 'Sem conexão recente. Abra a nova versão do Sala 8-bit e uma aba de IA compatível.';
});
async function check(show=false) {
  try {
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    const value=await chrome.tabs.sendMessage(tab.id,{type:'diagnostic'});
    if (!value || value.version!==version) throw new Error('reload');
    document.getElementById('execution').textContent=value.running?'Execução detectada nesta aba.':'Nenhuma execução detectada nesta aba.';
    const field=document.getElementById('diagnostic');
    const {connection,recentEvents=[]}=await chrome.storage.local.get(['connection','recentEvents']);
    field.value=JSON.stringify({...value,delivery:connection||null,recentEvents},null,2);
    if(show) {field.hidden=false; document.getElementById('copy').hidden=false;}
  } catch {
    document.getElementById('execution').textContent='Esta aba não está conectada à extensão. Feche este painel, recarregue a aba da IA (Ctrl+R) e abra o painel novamente.';
    const {connection,recentEvents=[]}=await chrome.storage.local.get(['connection','recentEvents']);
    document.getElementById('diagnostic').value=JSON.stringify({version,tabConnected:false,reason:'reload-tab',delivery:connection||null,recentEvents},null,2);
    if(show) {document.getElementById('diagnostic').hidden=false;document.getElementById('copy').hidden=false;}
  }
}
document.getElementById('check').addEventListener('click',()=>check(true));
document.getElementById('copy').addEventListener('click',async()=>{
  try {await navigator.clipboard.writeText(document.getElementById('diagnostic').value); document.getElementById('copy').textContent='Diagnóstico copiado';}
  catch {document.getElementById('diagnostic').focus(); document.getElementById('diagnostic').select();}
});
check();
setInterval(()=>check(),1000);
