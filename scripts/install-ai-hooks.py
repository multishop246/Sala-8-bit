"""Install previously authorized lifecycle adapters; never edits hook trust."""
from pathlib import Path
import json, os, shutil, datetime

root=Path(__file__).resolve().parents[1]
local=Path(os.environ['LOCALAPPDATA'])/'Sala8bit'/'connectors'
stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
for source,settings in [('codex',Path.home()/'.codex'/'hooks.json'),('claude-code',Path.home()/'.claude'/'settings.json')]:
    folder=local/source
    folder.mkdir(parents=True,exist_ok=True)
    shutil.copy2(root/'ai-hooks'/'hook.ps1',folder/'hook.ps1')
    template=json.loads((root/'ai-hooks'/source/'hooks'/'hooks.json').read_text(encoding='utf-8'))
    current=json.loads(settings.read_text(encoding='utf-8-sig')) if settings.exists() else {}
    hooks=current.setdefault('hooks',{})
    changed=False
    for event,groups in template['hooks'].items():
        command=f'powershell.exe -NoProfile -NonInteractive -File "{(folder/"hook.ps1").as_posix()}" -Source {source}'
        for group in groups:
            for handler in group['hooks']:
                handler['command']=command
                if source=='claude-code': handler['shell']='powershell'
        existing=hooks.setdefault(event,[])
        # Replace only our own adapter, preserving all unrelated hooks/settings.
        others=[]
        for group in existing:
            remaining=[h for h in group.get('hooks',[]) if not (h.get('command','').endswith(f'-Source {source}') and 'Sala8bit/connectors/' in h.get('command',''))]
            if remaining: others.append({**group,'hooks':remaining})
        merged=others+groups
        if merged!=existing: hooks[event]=merged; changed=True
    if changed:
        settings.parent.mkdir(parents=True,exist_ok=True)
        if settings.exists(): shutil.copy2(settings,settings.with_name(settings.name+'.sala8bit-backup-'+stamp))
        temp=settings.with_name(settings.name+'.sala8bit-tmp')
        temp.write_text(json.dumps(current,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        os.replace(temp,settings)
    print(f'{source}: configuration prepared; {len(template["hooks"])} events; trust unchanged.')
