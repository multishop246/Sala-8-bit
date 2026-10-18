// Generate reviewable local plugins. Does not install or trust anything.
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('ai-hooks');
const script=fs.readFileSync(path.join(root,'hook.ps1'),'utf8');
for (const source of ['codex','claude-code']) {
  const dir=path.join(root,source);
  fs.mkdirSync(path.join(dir,'hooks'),{recursive:true});
  fs.writeFileSync(path.join(dir,'hook.ps1'),script);
  const variable=source==='codex'?'${PLUGIN_ROOT}':'${CLAUDE_PLUGIN_ROOT}';
  const command=`powershell.exe -NoProfile -NonInteractive -File "${variable}/hook.ps1" -Source ${source}`;
  const events=['SessionStart','UserPromptSubmit','PreToolUse','PostToolUse','PermissionRequest','Stop','SessionEnd'];
  events.push(source==='codex'?'Interrupt':'StopFailure');
  const hooks=Object.fromEntries(events.map(event=>[event,[{hooks:[{type:'command',command,timeout:source==='codex' && ['Interrupt','SessionEnd'].includes(event)?3:5}]}]]));
  if (source==='claude-code') hooks.Notification=[{matcher:'idle_prompt|agent_needs_input|agent_completed|permission_prompt|elicitation_dialog',hooks:[{type:'command',command,timeout:5}]}];
  fs.writeFileSync(path.join(dir,'hooks','hooks.json'),JSON.stringify({hooks},null,2)+'\n');
  const manifest={name:'sala-8-bit-activity',version:'0.5.2',description:'Indicador local de tarefas em execução, sem conteúdo das conversas'};
  if (source==='codex') {
    manifest.extensions={'com.openai':{hooks:'./hooks/hooks.json'}};
    fs.writeFileSync(path.join(dir,'plugin.json'),JSON.stringify(manifest,null,2)+'\n');
  } else {
    fs.mkdirSync(path.join(dir,'.claude-plugin'),{recursive:true});
    fs.writeFileSync(path.join(dir,'.claude-plugin','plugin.json'),JSON.stringify(manifest,null,2)+'\n');
  }
}
console.log('Plugins preparados em ai-hooks/codex e ai-hooks/claude-code. Nenhuma configuração pessoal alterada.');
