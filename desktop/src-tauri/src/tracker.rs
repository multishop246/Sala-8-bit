//! Medição: a cada 5 s olha o app em foco, o tempo sem teclado/mouse, a música e os agentes de IA;
//! a cada minuto fecha o minuto e manda para o banco. Se estiver sem internet, guarda e manda depois.
use crate::classify::{classify, is_agent_process, is_music_process, Config};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Default, Serialize)]
pub struct Live { pub app: String, pub cat: String, pub idle: bool, pub agents: u32, pub music: bool, pub estado: String, pub conectado: bool, pub erro: Option<String>, pub pendentes: usize }

#[derive(Debug, Clone, Serialize)]
struct MinuteOut { m: String, app: String, cat: &'static str, agents: u32, music: bool }

pub struct Shared { pub saved: crate::config::Saved, pub cfg: Option<Config>, pub cfg_at: Option<Instant>, pub live: Live, pub paused: bool }
pub type State = Arc<Mutex<Shared>>;

fn rpc(base: &str, key: &str, func: &str, body: serde_json::Value) -> Result<serde_json::Value, String> {
    let url = format!("{}/rest/v1/rpc/{}", base.trim_end_matches('/'), func);
    match ureq::post(&url).set("apikey", key).set("Authorization", &format!("Bearer {key}")).set("Content-Type", "application/json")
        .timeout(Duration::from_secs(15)).send_json(body) {
        Ok(r) => r.into_json::<serde_json::Value>().map_err(|e| e.to_string()),
        Err(ureq::Error::Status(code, r)) => {
            let t = r.into_string().unwrap_or_default();
            let msg = serde_json::from_str::<serde_json::Value>(&t).ok().and_then(|v| v.get("message").and_then(|m| m.as_str()).map(String::from)).unwrap_or(t);
            Err(format!("{code}: {msg}"))
        }
        Err(e) => Err(format!("sem conexão ({e})")),
    }
}

pub fn spawn(state: State) {
    std::thread::spawn(move || {
        let mut sys = sysinfo::System::new();
        let mut bucket: HashMap<(String, &'static str), u32> = HashMap::new();
        let (mut music_m, mut agents_m) = (false, 0u32);
        let mut minute = chrono::Utc::now().format("%Y-%m-%dT%H:%M:00Z").to_string();
        let mut queue: Vec<MinuteOut> = Vec::new();
        let mut last_send = Instant::now() - Duration::from_secs(120);
        loop {
            std::thread::sleep(Duration::from_secs(5));
            let (saved, cfg, cfg_old, paused) = {
                let s = state.lock().unwrap();
                (s.saved.clone(), s.cfg.clone(), s.cfg_at.map(|t| t.elapsed() > Duration::from_secs(600)).unwrap_or(true), s.paused)
            };
            let (Some(base), Some(key), Some(token)) = (saved.supabase_url.clone(), saved.anon_key.clone(), saved.token.clone()) else {
                state.lock().unwrap().live.conectado = false; continue;
            };
            // configuração (apps das funções, sites, ociosidade): busca a cada 10 min
            if cfg.is_none() || cfg_old {
                match rpc(&base, &key, "agent_config", serde_json::json!({ "p_token": token })) {
                    Ok(v) => { let c: Config = serde_json::from_value(v).unwrap_or_default(); let mut s = state.lock().unwrap(); s.cfg = Some(c); s.cfg_at = Some(Instant::now()); s.live.erro = None; }
                    Err(e) => { let mut s = state.lock().unwrap(); s.live.erro = Some(e); s.live.conectado = false; if s.cfg.is_none() { continue; } }
                }
            }
            let cfg = state.lock().unwrap().cfg.clone().unwrap_or_default();
            // amostra
            if !paused {
                let idle = user_idle::UserIdle::get_time().map(|t| t.as_seconds()).unwrap_or(0);
                let (app, title) = match active_win_pos_rs::get_active_window() { Ok(w) => (if w.app_name.is_empty() { w.process_path.to_string_lossy().to_string() } else { w.app_name }, w.title), Err(_) => ("—".into(), String::new()) };
                sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
                let mut agents = 0u32; let mut music = false;
                for p in sys.processes().values() {
                    let name = p.name().to_string_lossy().to_string();
                    let cmd = p.cmd().iter().map(|c| c.to_string_lossy()).collect::<Vec<_>>().join(" ");
                    if is_agent_process(&name, &cmd) { agents += 1; }
                    if is_music_process(&name) { music = true; }
                }
                let agents = agents.min(20);
                let m = classify(&app, &title, idle, agents, &cfg);
                *bucket.entry((m.app.clone(), m.cat)).or_insert(0) += 1;
                music_m |= music || m.music_hint; agents_m = agents_m.max(agents);
                let mut s = state.lock().unwrap();
                s.live.app = m.app; s.live.cat = m.cat.into(); s.live.idle = m.cat == "idle" || m.cat == "ia"; s.live.agents = agents; s.live.music = music || m.music_hint;
            }
            // virou o minuto: fecha com o que apareceu mais vezes
            let now_min = chrono::Utc::now().format("%Y-%m-%dT%H:%M:00Z").to_string();
            if now_min != minute {
                if let Some(((app, cat), _)) = bucket.iter().max_by_key(|(_, n)| **n) {
                    queue.push(MinuteOut { m: minute.clone(), app: app.clone(), cat, agents: agents_m, music: music_m });
                    if queue.len() > 1440 { queue.drain(0..queue.len() - 1440); }
                }
                bucket.clear(); music_m = false; agents_m = 0; minute = now_min;
            }
            // envia a cada minuto (ou só um "estou aqui" se não houver minutos)
            if last_send.elapsed() >= Duration::from_secs(60) {
                last_send = Instant::now();
                let batch: Vec<MinuteOut> = queue.iter().take(240).cloned().collect();
                match rpc(&base, &key, "agent_report", serde_json::json!({ "p_token": token, "p_minutes": batch })) {
                    Ok(v) => {
                        queue.drain(0..batch.len());
                        let estado = v.get("estado").and_then(|e| e.as_str()).unwrap_or("").to_string();
                        let mut s = state.lock().unwrap();
                        s.paused = estado == "encerrado"; s.live.estado = estado; s.live.conectado = true; s.live.erro = None; s.live.pendentes = queue.len();
                    }
                    Err(e) => {
                        let mut s = state.lock().unwrap(); s.live.conectado = false; s.live.pendentes = queue.len();
                        if e.contains("não autorizado") { s.saved.token = None; }
                        s.live.erro = Some(e);
                    }
                }
            }
        }
    });
}
