//! Sala 8-bit para Windows e macOS: abre o escritório da empresa numa janela própria e,
//! em segundo plano (ícone perto do relógio), mede o tempo como descrito na tela de privacidade.
mod classify;
mod config;
mod tracker;
mod activity;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tracker::{Live, Shared};

type St = Arc<Mutex<Shared>>;

fn dir(app: &AppHandle) -> PathBuf { app.path().app_config_dir().unwrap_or_else(|_| PathBuf::from(".")) }
fn persist(app: &AppHandle, st: &St) { let s = st.lock().unwrap(); let _ = config::save(&dir(app), &s.saved); }

/// origem permitida: o escritório, o Supabase e o login do Google; o resto abre no navegador
fn allowed(office: &Option<String>, u: &url::Url) -> bool {
    if u.scheme() == "tauri" || u.host_str() == Some("tauri.localhost") || u.scheme() == "about" || u.scheme() == "data" || u.scheme() == "blob" { return true; }
    let host = u.host_str().unwrap_or("");
    if let Some(o) = office.as_ref().and_then(|o| url::Url::parse(o).ok()) { if o.host_str() == Some(host) { return true; } }
    host.ends_with(".supabase.co") || host == "localhost" || host == "127.0.0.1"
}

fn open_main(app: &AppHandle, st: &St) -> tauri::Result<()> {
    let office = st.lock().unwrap().saved.office_url.clone();
    if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.set_focus(); return Ok(()); }
    let url = match office.as_ref().and_then(|o| url::Url::parse(o).ok()) { Some(u) => WebviewUrl::External(u), None => WebviewUrl::App("index.html".into()) };
    let st2 = st.clone();
    let handle = app.clone();
    WebviewWindowBuilder::new(app, "main", url)
        .title("Sala 8-bit").inner_size(1360.0, 880.0).min_inner_size(380.0, 600.0)
        .on_navigation(move |u| {
            let office = st2.lock().unwrap().saved.office_url.clone();
            if allowed(&office, u) { true } else {
                let _ = tauri_plugin_opener::OpenerExt::opener(&handle).open_url(u.as_str(), None::<&str>);
                false
            }
        })
        .build()?;
    Ok(())
}

// ---------------------------------------------------------------- comandos chamados pelo site
#[derive(serde::Serialize)]
struct Info { versao: String, plataforma: String, aparelho: String, pareado: bool, escritorio: Option<String>, pasta: Option<String>, agora: Live }

#[tauri::command]
fn agent_info(st: State<St>) -> Info {
    let s = st.lock().unwrap();
    Info {
        versao: env!("CARGO_PKG_VERSION").into(), plataforma: std::env::consts::OS.into(),
        aparelho: gethostname::gethostname().to_string_lossy().chars().take(60).collect(),
        pareado: s.saved.token.is_some(), escritorio: s.saved.office_url.clone(),
        pasta: s.saved.report_folder.clone().or_else(|| s.cfg.as_ref().and_then(|c| c.pasta_relatorios.clone())), agora: s.live.clone(),
    }
}

#[tauri::command]
fn set_office_url(app: AppHandle, st: State<St>, url: String) -> Result<(), String> {
    let u = url::Url::parse(url.trim()).map_err(|_| "Endereço inválido. Use algo como https://sala.suaempresa.com.br".to_string())?;
    if u.scheme() != "https" && u.host_str() != Some("localhost") { return Err("Use um endereço que comece com https://".into()); }
    let origin = format!("{}://{}{}", u.scheme(), u.host_str().unwrap_or(""), u.port().map(|p| format!(":{p}")).unwrap_or_default());
    st.lock().unwrap().saved.office_url = Some(origin.clone());
    persist(&app, &st);
    if let Some(w) = app.get_webview_window("main") { w.navigate(url::Url::parse(&origin).unwrap()).map_err(|e| e.to_string())?; }
    Ok(())
}

#[tauri::command]
fn change_office(app: AppHandle, st: State<St>) -> Result<(), String> {
    { let mut s = st.lock().unwrap(); s.saved.office_url = None; s.saved.token = None; s.cfg = None; }
    persist(&app, &st);
    if let Some(w) = app.get_webview_window("main") { let _ = w.close(); }
    open_main(&app, &st).map_err(|e| e.to_string())
}

#[tauri::command]
fn agent_pair(app: AppHandle, st: State<St>, supabase_url: String, anon_key: String, token: String) -> Result<(), String> {
    { let mut s = st.lock().unwrap(); s.saved.supabase_url = Some(supabase_url); s.saved.anon_key = Some(anon_key); s.saved.token = Some(token); s.cfg = None; s.paused = false; }
    persist(&app, &st);
    Ok(())
}

#[tauri::command]
fn agent_unpair(app: AppHandle, st: State<St>) {
    { let mut s = st.lock().unwrap(); s.saved.token = None; s.cfg = None; }
    persist(&app, &st);
}

#[tauri::command]
async fn choose_folder(app: AppHandle, st: State<'_, St>) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().set_title("Pasta dos relatórios do dia").pick_folder(move |f| { let _ = tx.send(f); });
    let picked = rx.recv().map_err(|e| e.to_string())?;
    let path = picked.and_then(|p| p.into_path().ok()).map(|p| p.to_string_lossy().to_string());
    if let Some(p) = &path { st.lock().unwrap().saved.report_folder = Some(p.clone()); persist(&app, &st); }
    Ok(path)
}

#[tauri::command]
fn save_report(st: State<St>, filename: String, bytes: Vec<u8>) -> Result<String, String> {
    let folder = {
        let s = st.lock().unwrap();
        s.saved.report_folder.clone().or_else(|| s.cfg.as_ref().and_then(|c| c.pasta_relatorios.clone()))
    }.ok_or("Escolha a pasta dos relatórios primeiro.")?;
    let safe: String = filename.chars().filter(|c| !"\\/:*?\"<>|".contains(*c)).collect();
    if !safe.to_lowercase().ends_with(".pdf") { return Err("Nome de arquivo inválido.".into()); }
    std::fs::create_dir_all(&folder).map_err(|e| format!("Não deu para usar a pasta: {e}"))?;
    let path = PathBuf::from(&folder).join(safe);
    std::fs::write(&path, bytes).map_err(|e| format!("Não deu para salvar: {e}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| { let s: State<St> = app.state(); let _ = open_main(app, &s); }))
        .setup(|app| {
            let saved = config::load(&dir(app.handle()));
            let st: St = Arc::new(Mutex::new(Shared { saved, cfg: None, cfg_at: None, live: Live::default(), paused: false }));
            app.manage(st.clone());
            tracker::spawn(st.clone());
            // ícone perto do relógio: o app continua medindo com a janela fechada
            let open = MenuItem::with_id(app, "abrir", "Abrir o escritório", true, None::<&str>)?;
            let change = MenuItem::with_id(app, "trocar", "Trocar de escritório", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "sair", "Sair do Sala 8-bit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &change, &quit])?;
            let st_t = st.clone();
            TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().expect("ícone"))
                .tooltip("Sala 8-bit")
                .menu(&menu)
                .on_menu_event(move |app, e| match e.id.as_ref() {
                    "abrir" => { let _ = open_main(app, &st_t); }
                    "trocar" => { let s: State<St> = app.state(); let _ = change_office(app.clone(), s); }
                    "sair" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            open_main(app.handle(), &st)?;
            Ok(())
        })
        .on_window_event(|w, e| {
            // fechar a janela só esconde: a medição continua até "Sair" no ícone
            if let tauri::WindowEvent::CloseRequested { api, .. } = e { api.prevent_close(); let _ = w.hide(); }
        })
        .invoke_handler(tauri::generate_handler![agent_info, set_office_url, change_office, agent_pair, agent_unpair, choose_folder, save_report])
        .run(tauri::generate_context!())
        .expect("erro ao abrir o Sala 8-bit");
}
