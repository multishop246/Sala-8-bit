"""Package local review artifacts; never installs or publishes them."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'desktop/src-tauri/tauri.conf.json').read_text())['version']
extension = json.loads((root / 'browser-extension/manifest.json').read_text())['version']
output = root.parent / f'Sala-8-bit-Testes-{version}'
output.mkdir(exist_ok=True)
installer = root / f'desktop/src-tauri/target/release/bundle/nsis/Sala 8-bit Testes_{version}_x64-setup.exe'
if not installer.is_file():
    raise SystemExit('Compile the matching Windows installer first.')
shutil.copy2(installer, output / installer.name)

def archive(destination, entries):
    with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as target:
        for file, name in entries:
            target.write(file, name)

archive(output / f'extensao-navegadores-{extension}.zip',
        ((p, p.relative_to(root / 'browser-extension')) for p in (root / 'browser-extension').rglob('*') if p.is_file()))
archive(output / 'conectores-codex-claude.zip',
        ((p, p.relative_to(root)) for p in (root / 'ai-hooks').rglob('*') if p.is_file()))
files = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=root).decode().split('\0')
# Only repository files selected by Git. Never collect home configuration or caches.
selected = sorted(set(f for f in files if f and (root / f).is_file() and
                      not f.endswith('.tsbuildinfo') and
                      not (Path(f).name.startswith('.env') and Path(f).name != '.env.example')))
archive(output / 'fontes-e-migracoes.zip', ((root / f, f) for f in selected))
(output / 'LEIA-PRIMEIRO.md').write_text(f'''# Sala 8-bit {version} — pacote local de testes

Extensão {extension}. ChatGPT e Gemini no Opera GX tiveram início e conclusão entregues com HTTP 200. Um teste simultâneo registrou duas execuções, 10 segundos de bônus e retorno a zero. Houve oscilação intermediária de detecção, descrita no documento de validação. Spotify também registrou reprodução e pausa no monitor local.

Este pacote não foi publicado em produção. O instalador Sala 8-bit Testes usa configuração separada da edição original. O site e as oito migrações estão preparados no projeto Supabase de testes. Endereço do escritório: https://sala-8-bit-3kj7-git-correcoes-app-teste-ai-masters7.vercel.app . Entre com e-mail e código dentro do aplicativo. Mantenha uma única edição do monitor aberta: ambas usam a porta local 43187. O monitor descartável foi encerrado.

Arquivos: instalador Windows, extensão para carregar sem compactação após extrair, conectores opcionais e fontes completas com migrações. O pacote não contém configurações pessoais dos conectores. Os conectores deste computador já foram instalados anteriormente com autorização; não é necessário reinstalá-los para este teste.

O pareamento remoto real, os indicadores de IA e áudio e a animação de fone foram observados na prévia. O usuário confirmou que o indicador desliga ao pausar. Claude de desktop com janela restaurada completou o ciclo nativo 0 → 1 → 0 com amostras válidas, separado do Codex concorrente; a prévia mostrou duas execuções e 1,5×. AI Studio e Flow tiveram início e conclusão entregues com HTTP 200 no Opera GX. Claude Code, outros navegadores e todos os modos minimizados não têm validação universal. Áudio pode incluir jogos e vídeos. Consulte docs/VALIDACAO-LOCAL-0.5.3.md nas fontes para evidências e pendências. A descrição em docs/ATIVIDADE-IA-0.5.2.md é histórica.
''', encoding='utf-8')
checks = []
for file in sorted(output.iterdir()):
    if file.is_file() and file.name != 'SHA256SUMS.txt':
        checks.append(f'{hashlib.sha256(file.read_bytes()).hexdigest()}  {file.name}')
(output / 'SHA256SUMS.txt').write_text('\n'.join(checks) + '\n', encoding='utf-8')
bundle = Path(str(output) + '.zip')
archive(bundle, ((p, p.relative_to(output)) for p in output.rglob('*') if p.is_file()))
print(bundle)
