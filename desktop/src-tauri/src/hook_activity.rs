//! Lifecycle state emitted by optional, user-installed Codex / Claude Code hooks.
//! No transcripts are read. PID + process start time prevents stale state after exit.
use std::collections::HashSet;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(target_os = "windows")]
fn process_start(pid: u32) -> Option<u64> {
    use windows::Win32::Foundation::{CloseHandle, FILETIME};
    use windows::Win32::System::Threading::{GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
    // Codex's worker may be inaccessible to a full process enumeration. The
    // limited Windows handle is sufficient to verify the PID's creation time.
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok()?;
    let mut creation = FILETIME::default();
    let mut exit = FILETIME::default();
    let mut kernel = FILETIME::default();
    let mut user = FILETIME::default();
    let result = unsafe { GetProcessTimes(handle, &mut creation, &mut exit, &mut kernel, &mut user) };
    let _ = unsafe { CloseHandle(handle) };
    result.ok()?;
    let ticks = ((creation.dwHighDateTime as u64) << 32) | creation.dwLowDateTime as u64;
    ticks.checked_div(10_000_000)?.checked_sub(11_644_473_600)
}

#[cfg(not(target_os = "windows"))]
fn process_start(pid: u32) -> Option<u64> {
    let mut system = sysinfo::System::new();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    system.process(sysinfo::Pid::from_u32(pid)).map(|p| p.start_time())
}

#[derive(Clone, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct Signal { source: String, conversation: String, running: bool, pid: u32, started: u64, at: u64 }
impl Signal {
    fn active(&self, now: u64, process_start: Option<u64>) -> bool {
        ["codex", "claude-code"].contains(&self.source.as_str())
            && self.conversation.len()==64 && self.conversation.chars().all(|c|c.is_ascii_hexdigit())
            && self.running && self.pid>0 && self.started>0 && process_start==Some(self.started)
            && self.at>=self.started && self.at<=now+5 && now.saturating_sub(self.at)<86400
            // Claude Code does not emit Stop on user interruption. Expire an
            // unconfirmed state rather than multiplying an idle session all day.
            && (self.source!="claude-code" || now.saturating_sub(self.at)<75)
    }
}
fn file_ids() -> HashSet<(String,String)> {
    let Some(local)=std::env::var_os("LOCALAPPDATA") else { return HashSet::new(); };
    let folder=std::path::PathBuf::from(local).join("Sala8bit").join("activity");
    #[cfg(debug_assertions)]
    let folder=std::env::var_os("SALA_ACTIVITY_HOOKS_DIR").map(std::path::PathBuf::from).unwrap_or(folder);
    let Ok(files)=std::fs::read_dir(folder) else { return HashSet::new(); };
    let now=SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    let mut active=HashSet::new();
    for entry in files.flatten().take(512) {
        if entry.path().extension().and_then(|x|x.to_str())!=Some("json") { continue; }
        if !entry.metadata().map(|m|m.is_file() && m.len()<=2048).unwrap_or(false) { continue; }
        let Ok(bytes)=std::fs::read(entry.path()) else { continue; };
        let Ok(signal)=serde_json::from_slice::<Signal>(&bytes) else { continue; };
        if !signal.running { continue; }
        let start=process_start(signal.pid);
        if signal.active(now,start) { active.insert((signal.source,signal.conversation)); }
    }
    active
}

// Kept for the standalone activity-check example, which has no receiver thread.
pub fn agents() -> u32 { file_ids().len().min(20) as u32 }

pub struct HookProbe(Arc<Mutex<HashMap<(String,String),Signal>>>);
impl HookProbe {
    pub fn spawn(on_state: impl Fn(Option<u32>,bool)+Send+'static) -> Self {
        let state=Arc::new(Mutex::new(HashMap::new()));
        let shared=Arc::clone(&state);
        std::thread::spawn(move || {
            let listener=match std::net::TcpListener::bind("127.0.0.1:43188") {
                Ok(listener)=>{on_state(None,true); listener},
                Err(_)=>{on_state(None,false); return;}
            };
            for mut stream in listener.incoming().flatten() {
                let _=stream.set_read_timeout(Some(Duration::from_millis(750)));
                let _=stream.set_write_timeout(Some(Duration::from_millis(750)));
                let status=handle_hook(&mut stream,&shared);
                if status==200 { on_state(Some(Self::count(&shared)),true); }
                let response=format!("HTTP/1.1 {status} OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                let _=stream.write_all(response.as_bytes());
            }
        });
        Self(state)
    }
    fn count(state:&Arc<Mutex<HashMap<(String,String),Signal>>>) -> u32 {
        let now=SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
        let mut ids=file_ids();
        let signals:Vec<_>=state.lock().unwrap().values().cloned().collect();
        for signal in signals {
            let key=(signal.source.clone(),signal.conversation.clone());
            if signal.active(now,process_start(signal.pid)) { ids.insert(key); }
            else { ids.remove(&key); }
        }
        ids.len().min(20) as u32
    }
    pub fn agents(&self)->u32 { Self::count(&self.0) }
}

fn handle_hook(stream:&mut impl Read,state:&Arc<Mutex<HashMap<(String,String),Signal>>>) -> u16 {
    let mut bytes=Vec::new();
    let mut buf=[0u8;1024];
    let header_end;
    loop {
        let Ok(n)=stream.read(&mut buf) else {return 403};
        if n==0 || bytes.len()+n>4096 {return 403}
        bytes.extend_from_slice(&buf[..n]);
        if let Some(index)=bytes.windows(4).position(|s|s==b"\r\n\r\n") {header_end=index+4;break}
    }
    let Ok(header)=std::str::from_utf8(&bytes[..header_end]) else {return 403};
    let lines:Vec<_>=header.lines().collect();
    let field=|name:&str| lines.iter().skip(1).filter_map(|l|l.split_once(':')).find(|(key,_)|key.eq_ignore_ascii_case(name)).map(|(_,v)|v.trim());
    if lines.first()!=Some(&"POST /hook HTTP/1.1") || field("X-Sala-Hook")!=Some("1")
        || field("Content-Type")!=Some("application/json") || field("Origin").is_some() {return 403}
    let Some(length)=field("Content-Length").and_then(|v|v.parse::<usize>().ok()).filter(|n|*n<=2048) else {return 403};
    while bytes.len()<header_end+length {
        let Ok(n)=stream.read(&mut buf) else {return 403};
        if n==0 || bytes.len()+n>4096 {return 403}
        bytes.extend_from_slice(&buf[..n]);
    }
    let Ok(signal)=serde_json::from_slice::<Signal>(&bytes[header_end..header_end+length]) else {return 403};
    let now=SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    if !["codex","claude-code"].contains(&signal.source.as_str()) || signal.conversation.len()!=64
        || !signal.conversation.chars().all(|c|c.is_ascii_hexdigit()) || signal.pid==0 || signal.started==0
        || signal.at<signal.started || signal.at>now+5 || now.saturating_sub(signal.at)>75
        || process_start(signal.pid)!=Some(signal.started) {return 403}
    let mut signals=state.lock().unwrap();
    signals.retain(|_,s| s.running && s.active(now,process_start(s.pid)));
    if signals.len()>=512 && !signals.contains_key(&(signal.source.clone(),signal.conversation.clone())) {return 403}
    signals.insert((signal.source.clone(),signal.conversation.clone()),signal);
    200
}

pub fn codex_status() -> serde_json::Value {
    let Some(local)=std::env::var_os("LOCALAPPDATA") else { return serde_json::json!({"received":false,"error":"LOCALAPPDATA indisponível"}); };
    let folder=std::path::PathBuf::from(local).join("Sala8bit").join("activity");
    let files=match std::fs::read_dir(&folder) {
        Ok(files)=>files,
        Err(e)=>return serde_json::json!({"received":false,"folder":folder,"error":e.to_string()}),
    };
    let now=SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    let mut seen=0;
    let mut valid=0;
    let latest=files.flatten().take(512).filter_map(|entry| {
        seen+=1;
        if entry.path().extension().and_then(|x|x.to_str())!=Some("json") { return None; }
        if !entry.metadata().map(|m|m.is_file() && m.len()<=2048).unwrap_or(false) { return None; }
        let signal=serde_json::from_slice::<Signal>(&std::fs::read(entry.path()).ok()?).ok()?;
        valid+=1;
        (signal.source=="codex" && signal.at<=now+5).then_some(signal)
    }).max_by_key(|s|s.at);
    let Some(signal)=latest else { return serde_json::json!({"received":false,"folder":folder,"files_seen":seen,"valid_signals":valid,"now":now}); };
    let start=process_start(signal.pid);
    serde_json::json!({"received":true,"age_seconds":now.saturating_sub(signal.at),
        "running":signal.running,"process_verified":start==Some(signal.started),
        "counted":signal.active(now,start)})
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn lifecycle_not_process_presence_controls_count() {
        let mut s=Signal{source:"codex".into(),conversation:"a".repeat(64),running:false,pid:42,started:100,at:110};
        assert!(!s.active(120,Some(100)));
        s.running=true; assert!(s.active(120,Some(100)));
        assert!(s.active(3600,Some(100))); // long command, no arbitrary 75-second expiry
        assert!(!s.active(120,None)); // app closed or crashed
        assert!(!s.active(120,Some(115))); // PID reused
        s.source="claude-code".into(); assert!(!s.active(3600,Some(100)));
        s.running=false; assert!(!s.active(120,Some(100)));
    }
    #[cfg(target_os = "windows")]
    #[test] fn limited_process_query_identifies_current_process() {
        let expected=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
        let actual=process_start(std::process::id()).expect("current process must be queryable");
        assert!(actual<=expected && expected-actual<60);
    }
    #[test] fn loopback_hook_counts_only_live_execution() {
        let state=Arc::new(Mutex::new(HashMap::new()));
        let now=SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        let pid=std::process::id();
        let started=process_start(pid).unwrap();
        let request=|running:bool,origin:bool| {
            let body=serde_json::json!({"source":"codex","conversation":"a".repeat(64),
                "running":running,"pid":pid,"started":started,"at":now}).to_string();
            let extra=if origin {"Origin: https://example.com\r\n"} else {""};
            format!("POST /hook HTTP/1.1\r\nContent-Type: application/json\r\nX-Sala-Hook: 1\r\n{extra}Content-Length: {}\r\n\r\n{body}",body.len())
        };
        assert_eq!(handle_hook(&mut std::io::Cursor::new(request(true,true).into_bytes()),&state),403);
        assert_eq!(handle_hook(&mut std::io::Cursor::new(request(true,false).into_bytes()),&state),200);
        assert_eq!(state.lock().unwrap().values().filter(|s|s.running).count(),1);
        assert_eq!(handle_hook(&mut std::io::Cursor::new(request(false,false).into_bytes()),&state),200);
        assert_eq!(state.lock().unwrap().values().filter(|s|s.running).count(),0);
    }
}
