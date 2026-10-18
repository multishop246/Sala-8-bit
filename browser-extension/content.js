// Only inspect execution controls. Never read message bodies, inputs or prompts.
(() => {
  const host = location.hostname;
  const source = host.includes('claude') ? 'claude' : host.includes('gemini') ? 'gemini'
    : host.includes('aistudio') ? 'aistudio' : host === 'labs.google' ? 'flow' : 'chatgpt';
  const stopLabels = /^(stop generating|stop response|stop streaming|stop generation|stop thinking|parar de gerar|parar geração|parar a geração|parar resposta|parar de responder|parar transmissão|interromper transmissão|interromper geração|interromper resposta|cancel generation|cancelar geração)$/i;
  const visible = b => !b.disabled && b.getAttribute('aria-disabled') !== 'true' && b.getClientRects().length > 0;
  const executing = b => visible(b) && (b.matches('[data-testid="stop-button"], [data-testid="composer-stop-button"]') || stopLabels.test((b.getAttribute('aria-label') || '').trim()) || stopLabels.test((b.getAttribute('title') || '').trim()));
  function findComposers() {
    const candidates = [...document.querySelectorAll('[data-testid="composer"], [data-type="unified-composer"]')];
    for (const input of document.querySelectorAll('[id="prompt-textarea"], [contenteditable="true"][role="textbox"]')) {
      // ChatGPT can leave an old editor mounted when navigating conversations.
      // Include every editor's form rather than trusting the first duplicate ID.
      const form=input.closest('form');
      const unified=input.closest('[data-type="unified-composer"]');
      if(form) candidates.push(form);
      if(unified) candidates.push(unified);
      if(!form && !unified && input.parentElement?.parentElement) candidates.push(input.parentElement.parentElement);
    }
    return [...new Set(candidates)].filter(c=>c.getClientRects().length>0);
  }
  // Observed in the user's ChatGPT composer: the unlabeled test ID was replaced
  // by localized "Parar" and this rounded square. Do not accept generic audio Stop.
  const chatgptStopPath = 'M4.5 5.75C4.5 5.05964 5.05964 4.5 5.75 4.5H14.25C14.9404 4.5 15.5 5.05964 15.5 5.75V14.25C15.5 14.9404 14.9404 15.5 14.25 15.5H5.75C5.05964 15.5 4.5 14.9404 4.5 14.25V5.75Z';
  // Observed AI Studio run control: no aria-label; its own span says Stop.
  const studioRunControl = b => source === 'aistudio' && b.matches('button.ctrl-enter-submits');
  const studioStop = b => studioRunControl(b) && visible(b) &&
    [...b.querySelectorAll('span')].some(s=>/^(stop|parar|interromper)$/i.test((s.textContent||'').trim()));
  function runningNow() {
    if ([...document.querySelectorAll('button')].some(b=>executing(b)||studioStop(b))) return true;
    if (source !== 'chatgpt') return false;
    return findComposers().flatMap(c=>[...c.querySelectorAll('button')]).some(b =>
      visible(b) && /^(parar|stop)$/i.test((b.getAttribute('aria-label') || '').trim()) &&
      [...b.querySelectorAll('svg path')].some(p => (p.getAttribute('d') || '').trim() === chatgptStopPath));
  }
  const controlHistory = [];
  function diagnostic() {
    const composers = findComposers();
    // AI Studio may use a textarea outside the composer structures above.
    // Capture control metadata even when detection fails; never inspect prompts.
    const controls = composers.length ? [...new Set(composers.flatMap(c=>[...c.querySelectorAll('button')]))].slice(0,20) : [...document.querySelectorAll('button')].filter(b=>executing(b)||studioRunControl(b)).slice(0,20);
    const attributes = (element,names) => Object.fromEntries(names.map(name=>[name,(element.getAttribute(name)||'').slice(0,100)]));
    // This diagnostic stays in the popup. No textContent, values, URLs or prompts.
    return {version:'0.5.9',service:source,running:runningNow(),composerFound:composers.length>0,controls:controls.map(b=>({
      ...attributes(b,['aria-label','title','data-testid','aria-disabled','id','data-state','mattooltip','data-mat-icon-name']),disabled:!!b.disabled,visible:!!visible(b),
      executionLabel:studioRunControl(b)?[...b.querySelectorAll('span')].map(s=>(s.textContent||'').trim()).find(t=>/^(stop|parar|interromper|run|executar)$/i.test(t))||'':'',
      materialIcons:[...b.querySelectorAll('mat-icon, span.material-symbols-outlined')].slice(0,4).map(i=>{
        const name=(i.textContent||'').trim();
        return /^(stop|stop_circle|cancel|close|play_arrow|send|pause|progress_activity)$/i.test(name)?name:'';
      }),
      icons:[...b.querySelectorAll('svg use')].slice(0,4).map(u=>{
        const ref=u.getAttribute('href')||u.getAttribute('xlink:href')||'';
        return /^#[a-zA-Z0-9_-]{1,100}$/.test(ref)?ref:'';
      }),
      rectangles:[...b.querySelectorAll('svg rect')].slice(0,4).map(r=>attributes(r,['x','y','width','height','rx','fill','stroke'])),
      paths:[...b.querySelectorAll('svg path')].slice(0,4).map(p=>{
        const d=p.getAttribute('d')||'';
        return /^[MmLlHhVvCcSsQqTtAaZzEe0-9.,+\-\s]+$/.test(d)?d.slice(0,1200):'';
      })
    }))};
  }
  function captureControls() {
    const value=diagnostic();
    const signature=JSON.stringify(value.controls);
    if(controlHistory.at(-1)?.signature!==signature) {
      controlHistory.push({at:Date.now(),running:value.running,controls:value.controls,signature});
      if(controlHistory.length>8) controlHistory.shift();
    }
  }
  let previous = '', scheduled = false, sending = false;
  async function sample(force = false) {
    if (sending) return;
    sending = true;
    try {
      captureControls();
      // One conversation can expose several stop controls: count it once.
      const running = runningNow();
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(location.origin + location.pathname));
      const conversation = [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
      const key = `${conversation}:${running}`;
      if (force || key !== previous) {
        await chrome.runtime.sendMessage({type:'sample', source, conversation, running});
        previous = key;
      }
    } catch { previous = ''; } finally { sending = false; }
  }
  new MutationObserver(() => {
    if (!scheduled) { scheduled = true; setTimeout(() => { scheduled = false; sample(); }, 250); }
  }).observe(document.documentElement, {childList:true, subtree:true, attributes:true, attributeFilter:['aria-label','title','disabled','aria-disabled','data-testid','data-state','style','class','d','width','height']});
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message.type === 'poll') { sample(true).finally(() => reply({ok:true})); return true; }
    if (message.type === 'diagnostic') { reply({...diagnostic(),controlHistory:controlHistory.map(({signature,...value})=>value)}); }
  });
  setInterval(() => sample(true), 15000);
  sample(true);
})();
