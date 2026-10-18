const records = new Map();
const pending = new Map();
let diagnosticQueue = Promise.resolve();
const endpoint = 'http://127.0.0.1:43187/activity';
const allowed = new Set(['chatgpt.com','chat.openai.com','gemini.google.com','aistudio.google.com','labs.google','flow.google.com','claude.ai']);
const clientPrefix = chrome.storage.local.get('clientPrefix').then(async value => {
  if (value.clientPrefix) return value.clientPrefix;
  const prefix = crypto.randomUUID().replaceAll('-','').slice(0,16);
  await chrome.storage.local.set({clientPrefix:prefix});
  return prefix;
});
async function clientId(tabId) { return `${await clientPrefix}-${tabId}`; }
async function publish(tabId, value) {
  const previous = records.get(tabId);
  if (previous && previous.conversation !== value.conversation) {
    await post({...previous, client:await clientId(tabId), running:false});
  }
  records.set(tabId, value);
  await post({...value, client:await clientId(tabId)});
}
function enqueue(tabId,value) {
  const next=(pending.get(tabId)||Promise.resolve()).catch(()=>{}).then(async()=>{
    if(value) await publish(tabId,value);
    else {
      const previous=records.get(tabId);
      if(previous) await post({...previous,client:await clientId(tabId),running:false});
      records.delete(tabId);
    }
  });
  pending.set(tabId,next);
  next.finally(()=>{if(pending.get(tabId)===next) pending.delete(tabId);}).catch(()=>{});
  return next;
}
function saveDiagnostic(value,connection) {
  diagnosticQueue=diagnosticQueue.catch(()=>{}).then(async()=>{
    const {recentEvents=[]}=await chrome.storage.local.get('recentEvents');
    const event={at:Date.now(),source:value.source,running:value.running,ok:connection.ok,status:connection.status||0,reason:connection.reason||''};
    const last=recentEvents.at(-1);
    if(!last || ['source','running','ok','status','reason'].some(key=>last[key]!==event[key])) recentEvents.push(event);
    await chrome.storage.local.set({connection,recentEvents:recentEvents.slice(-20)});
  });
  return diagnosticQueue;
}
async function post(value) {
  let status=0;
  try {
    const response = await fetch(endpoint, {method:'POST',headers:{'Content-Type':'application/json','X-Sala-Activity':'1'},body:JSON.stringify(value),signal:AbortSignal.timeout(2000)});
    status=response.status;
    if (!response.ok) throw new Error('bridge');
    await saveDiagnostic(value,{ok:true,at:Date.now(),status});
    await chrome.action.setBadgeText({text:''});
  } catch(error) {
    await saveDiagnostic(value,{ok:false,at:Date.now(),status,reason:status?'http':error.name==='TimeoutError'?'timeout':'network'});
    await chrome.action.setBadgeText({text:'!'});
  }
}
chrome.runtime.onMessage.addListener((value,sender,reply) => {
  if (value.type !== 'sample' || !sender.tab || !allowed.has(new URL(sender.url).hostname)) return;
  if (!/^[a-f0-9]{64}$/.test(value.conversation) || typeof value.running !== 'boolean') return;
  enqueue(sender.tab.id,{source:value.source,conversation:value.conversation,running:value.running}).then(()=>reply({ok:true}));
  return true;
});
chrome.tabs.onRemoved.addListener(tabId => {
  enqueue(tabId,null).catch(()=>{});
});
chrome.alarms.create('refresh', {periodInMinutes:0.5});
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== 'refresh') return;
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try { await chrome.tabs.sendMessage(tab.id,{type:'poll'}); } catch { /* Unsupported/discarded tabs expire in the desktop. */ }
  }
});
