//! Medição: a cada 5 s olha o app em foco, o tempo sem teclado/mouse, a música e os agentes de IA;
//! a cada minuto fecha o minuto e manda para o banco. Se estiver sem internet, guarda e manda depois.
use crate::classify::{classify, Config};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Default, Serialize)]
pub struct Live { pub app: String, pub cat: String, pub idle: bool, pub agents: u32, pub music: bool, pub estado: String, pub conectado: bool, pub erro: Option<String>, pub pendentes: usize }

#[derive(Debug, Clone, Serialize)]
struct MinuteOut { m: String, app: String, cat: &'static str, agents: u32, music: bool, productive_weight: f64, base_weight: f64, ia_fraction: f64 }

#[derive(Default)]
struct ExecutionTime { productive: f64, base: f64, ia: f64 }
impl ExecutionTime {
    fn sample(&mut self, cat: &str, agents: u32) {
        let base=if ["prod","ia","ref"].contains(&cat) { 1.0 } else { 0.0 };
        let bonus=if ["prod","ia"].contains(&cat) { agents.saturating_sub(1) as f64 * 0.5 } else { 0.0 };
        // One observation represents five seconds, never a whole minute.
        self.base += base / 12.0;
        self.productive += (base+bonus) / 12.0;
        if agents>0 { self.ia += 1.0/12.0; }
    }
}

pub struct Shared { pub saved: crate::config::Saved, pub cfg: Option<Config>, pub cfg_at: Option<Instant>, pub live: Live, pub paused: bool }
pub type State = Arc<Mutex<Shared>>;

fn rpc(base: &str, key: &str, func: &str, body: serde_json::Value) -> Result<serde_json::Value, String> {
    let mut body = body;
    sanitize_json(&mut body);
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

// PostgreSQL jsonb cannot represent U+0000. Clean even previously queued samples.
fn sanitize_json(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::String(s) => s.retain(|c| c != '\0'),
        serde_json::Value::Array(items) => items.iter_mut().for_each(sanitize_json),
        serde_json::Value::Object(items) => items.values_mut().for_each(sanitize_json),
        _ => {}
    }
}

pub fn spawn(state: State) {
    std::thread::spawn(move || {
        let activity = crate::activity::Probe::spawn();
        let media = crate::media::MediaProbe::spawn();
        let browser_activity = crate::browser_activity::BrowserProbe::spawn();
        let mut bucket: HashMap<(String, &'static str), u32> = HashMap::new();
        let (mut music_m, mut agents_m) = (false, 0u32);
        let mut execution = ExecutionTime::default();
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
                let observed = activity.current();
                let music = media.playing();
                let agents = (observed.agents + browser_activity.agents() + crate::hook_activity::agents()).min(20);
                let m = classify(&app, &title, idle, agents, &cfg);
                *bucket.entry((m.app.clone(), m.cat)).or_insert(0) += 1;
                music_m |= music; agents_m = agents_m.max(agents);
                execution.sample(m.cat, agents);
                let mut s = state.lock().unwrap();
                s.live.app = m.app; s.live.cat = m.cat.into(); s.live.idle = m.cat == "idle" || m.cat == "ia"; s.live.agents = agents; s.live.music = music;
            }
            // virou o minuto: fecha com o que apareceu mais vezes
            let now_min = chrono::Utc::now().format("%Y-%m-%dT%H:%M:00Z").to_string();
            if now_min != minute {
                if let Some(((app, cat), _)) = bucket.iter().max_by_key(|(_, n)| **n) {
                    queue.push(MinuteOut { m: minute.clone(), app: app.clone(), cat, agents: agents_m, music: music_m, productive_weight: execution.productive, base_weight: execution.base, ia_fraction: execution.ia });
                    if queue.len() > 1440 { queue.drain(0..queue.len() - 1440); }
                }
                bucket.clear(); music_m = false; agents_m = 0; minute = now_min;
                execution = ExecutionTime::default();
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
            // Send current indicators after historical data so a finished task
            // cannot be resurrected by last minute's maximum agent count.
            let current = state.lock().unwrap().live.clone();
            match rpc(&base, &key, "agent_live", serde_json::json!({"p_token": token, "p_live": {"app": current.app, "cat": current.cat, "idle": current.idle, "agents": current.agents, "music": current.music}})) {
                Ok(v) => {
                    let mut s = state.lock().unwrap();
                    s.paused = v.get("estado").and_then(|x| x.as_str()) == Some("encerrado");
                    if s.paused { s.live.agents = 0; s.live.music = false; }
                }
                Err(e) => { state.lock().unwrap().live.erro = Some(format!("Indicadores ao vivo: {e}")); }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn short_execution_does_not_multiply_the_entire_minute() {
        let mut t=ExecutionTime::default();
        t.sample("prod",3);
        for _ in 0..11 { t.sample("prod",0); }
        assert!((t.productive-13.0/12.0).abs()<0.00001);
        assert!((t.base-1.0).abs()<0.00001);
        assert!((t.ia-1.0/12.0).abs()<0.00001);
    }
    #[test]
    fn removes_postgres_incompatible_null_from_queued_samples() {
        let mut body = serde_json::json!({"p_minutes": [{"app": "Notepad\u{0} 📝", "agents": 0}]});
        sanitize_json(&mut body);
        assert_eq!(body["p_minutes"][0]["app"], "Notepad 📝");
        assert_eq!(body["p_minutes"][0]["agents"], 0);
    }
}
