//! Bundled setup: no Python, ZIP download, browser policy changes or hook trust bypass.
use std::path::{Path, PathBuf};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

fn root() -> Result<PathBuf,String> {
    std::env::var_os("LOCALAPPDATA").map(|p|PathBuf::from(p).join("Sala8bit").join("integrations"))
        .ok_or_else(||"Configuração integrada disponível no Windows.".into())
}
pub fn prepare() -> Result<PathBuf,String> {
    let root=root()?;
    let assets=[
        ("browser/manifest.json",include_str!("../../../browser-extension/manifest.json")),
        ("browser/background.js",include_str!("../../../browser-extension/background.js")),
        ("browser/content.js",include_str!("../../../browser-extension/content.js")),
        ("browser/popup.html",include_str!("../../../browser-extension/popup.html")),
        ("browser/popup.js",include_str!("../../../browser-extension/popup.js")),
        ("hook.ps1",include_str!("../../../ai-hooks/hook.ps1")),
    ];
    for (name,content) in assets { let p=root.join(name); std::fs::create_dir_all(p.parent().unwrap()).map_err(|e|e.to_string())?; std::fs::write(p,content).map_err(|e|e.to_string())?; }
    // Keep the previously used command paths so updates do not create needless
    // hook trust changes for people who already approved this connector.
    for source in ["codex","claude-code"] {
        let folder=root.parent().unwrap().join("connectors").join(source);
        std::fs::create_dir_all(&folder).map_err(|e|e.to_string())?;
        std::fs::write(folder.join("hook.ps1"),include_str!("../../../ai-hooks/hook.ps1")).map_err(|e|e.to_string())?;
    }
    Ok(root)
}
pub fn open(app:&AppHandle)->Result<(),String> {
    if let Some(w)=app.get_webview_window("integrations") { w.show().map_err(|e|e.to_string())?; return w.set_focus().map_err(|e|e.to_string()); }
    WebviewWindowBuilder::new(app,"integrations",WebviewUrl::App("integrations.html".into()))
        .title("Sala 8-bit · Conexões de IA").inner_size(760.0,730.0).min_inner_size(540.0,560.0)
        .build().map_err(|e|e.to_string())?;
    Ok(())
}
fn local(window:&WebviewWindow)->Result<(),String> {
    if window.label()!="integrations" { return Err("Use a janela Conexões de IA.".into()); }
    Ok(())
}

fn merge_hooks(current:&mut Value, source:&str, script:&Path)->Result<(),String> {
    let object=current.as_object_mut().ok_or("Configuração existente inválida; nenhum arquivo foi substituído.")?;
    let hooks=object.entry("hooks").or_insert_with(||json!({})).as_object_mut().ok_or("Lista de conectores existente inválida.")?;
    let command=format!("powershell.exe -NoProfile -NonInteractive -File \"{}\" -Source {source}",script.to_string_lossy().replace('\\',"/"));
    let mut events=vec!["SessionStart","UserPromptSubmit","PreToolUse","PostToolUse","PermissionRequest","Stop","SessionEnd"];
    if source=="codex" {events.push("Interrupt");} else { events.extend(["StopFailure","Notification","PostToolUseFailure"]); }
    for event in events {
        let groups=hooks.entry(event).or_insert_with(||json!([])).as_array_mut().ok_or("Evento existente inválido.")?;
        for group in groups.iter_mut() {
            if let Some(handlers)=group.get_mut("hooks").and_then(Value::as_array_mut) {
                handlers.retain(|h| !h.get("command").and_then(Value::as_str).map(|s| {
                    let normalized=s.replace('\\',"/").to_lowercase();
                    normalized.contains("sala8bit/") && normalized.ends_with(&format!("-source {source}"))
                }).unwrap_or(false));
            }
        }
        groups.retain(|g|g.get("hooks").and_then(Value::as_array).map(|h|!h.is_empty()).unwrap_or(true));
        let mut handler=json!({"type":"command","command":command,"timeout":if event=="SessionEnd"||event=="Interrupt" {3} else {5}});
        if source=="claude-code" {handler["shell"]=json!("powershell");}
        let mut group=json!({"hooks":[handler]});
        if event=="Notification" {group["matcher"]=json!("idle_prompt|agent_needs_input|agent_completed|permission_prompt|elicitation_dialog");}
        groups.push(group);
    }
    Ok(())
}

#[tauri::command]
pub fn install_ai_hooks(window:WebviewWindow)->Result<String,String> {
    local(&window)?;
    let root=prepare()?;
    let home=std::env::var_os("USERPROFILE").map(PathBuf::from).ok_or("Pasta do usuário indisponível.")?;
    // Validate both files before writing either. Keep unrelated preferences and hooks.
    let mut plans=Vec::new();
    for (source,relative) in [("codex",".codex/hooks.json"),("claude-code",".claude/settings.json")] {
        let path=home.join(relative);
        let old=if path.exists(){Some(std::fs::read(&path).map_err(|e|e.to_string())?)}else{None};
        let mut current=if let Some(bytes)=&old {serde_json::from_slice::<Value>(bytes.strip_prefix(&[239,187,191]).unwrap_or(bytes)).map_err(|_|format!("{relative} não contém JSON válido; arquivo preservado."))?}else{json!({})};
        let script=root.parent().unwrap().join("connectors").join(source).join("hook.ps1");
        merge_hooks(&mut current,source,&script)?;
        plans.push((path,old,serde_json::to_vec_pretty(&current).map_err(|e|e.to_string())?));
    }
    let stamp=chrono::Utc::now().format("%Y%m%d-%H%M%S-%f");
    for (path,old,new) in plans {
        std::fs::create_dir_all(path.parent().unwrap()).map_err(|e|e.to_string())?;
        if let Some(old)=old {std::fs::write(path.with_extension(format!("json.sala8bit-backup-{stamp}")),old).map_err(|e|e.to_string())?;}
        // JSON files are small; write a completed sibling before replacing.
        let temp=path.with_extension("sala8bit-new");
        std::fs::write(&temp,new).map_err(|e|e.to_string())?;
        std::fs::rename(&temp,&path).map_err(|e|e.to_string())?;
    }
    Ok("Conectores preparados. Reinicie as IAs. No Codex, revise e autorize os conectores em /hooks. As permissões de confiança foram preservadas.".into())
}
#[tauri::command]
pub fn show_extension_folder(app:AppHandle,window:WebviewWindow)->Result<String,String> {
    local(&window)?;
    let folder=prepare()?.join("browser").to_string_lossy().to_string();
    app.opener().open_path(folder.clone(),None::<&str>).map_err(|e|e.to_string())?;
    Ok(folder)
}
#[tauri::command]
pub fn integration_status(window:WebviewWindow,st:tauri::State<crate::St>)->Result<Value,String> {
    local(&window)?;
    let state=st.lock().unwrap();
    Ok(json!({"version":env!("CARGO_PKG_VERSION"),"paired":state.saved.token.is_some(),"connected":state.live.conectado,
        "native":state.live.native_agents,"browser":state.live.browser_agents,"hooks":state.live.hook_agents,
        "native_sample_age":state.live.native_sample_age,"total":state.live.agents,"paused":state.paused,
        "extension_folder":root()?.join("browser").to_string_lossy()}))
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn setup_preserves_unrelated_hooks_and_is_idempotent() {
        let mut v=json!({"permissions":{"ask":["Bash"]},"hooks":{"Stop":[{"hooks":[{"type":"command","command":"other.exe"}]}]}});
        merge_hooks(&mut v,"codex",Path::new("C:/Users/Test/Sala8bit/integrations/hook.ps1")).unwrap();
        let first=v.clone(); merge_hooks(&mut v,"codex",Path::new("C:/Users/Test/Sala8bit/integrations/hook.ps1")).unwrap();
        assert_eq!(first,v); assert_eq!(v["hooks"]["Stop"].as_array().unwrap().len(),2);
        assert_eq!(v["permissions"]["ask"][0],"Bash"); assert!(v.get("trusted_hooks").is_none());
    }
}
