//! Lifecycle state emitted by optional, user-installed Codex / Claude Code hooks.
//! No transcripts are read. PID + process start time prevents stale state after exit.
use std::collections::HashSet;
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

#[derive(serde::Deserialize)]
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
pub fn agents() -> u32 {
    let Some(local)=std::env::var_os("LOCALAPPDATA") else { return 0; };
    let folder=std::path::PathBuf::from(local).join("Sala8bit").join("activity");
    #[cfg(debug_assertions)]
    let folder=std::env::var_os("SALA_ACTIVITY_HOOKS_DIR").map(std::path::PathBuf::from).unwrap_or(folder);
    let Ok(files)=std::fs::read_dir(folder) else { return 0; };
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
    active.len().min(20) as u32
}

pub fn codex_status() -> serde_json::Value {
    let Some(local)=std::env::var_os("LOCALAPPDATA") else { return serde_json::json!({"received":false}); };
    let folder=std::path::PathBuf::from(local).join("Sala8bit").join("activity");
    let Ok(files)=std::fs::read_dir(folder) else { return serde_json::json!({"received":false}); };
    let now=SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    let latest=files.flatten().take(512).filter_map(|entry| {
        if entry.path().extension().and_then(|x|x.to_str())!=Some("json") { return None; }
        if !entry.metadata().map(|m|m.is_file() && m.len()<=2048).unwrap_or(false) { return None; }
        let signal=serde_json::from_slice::<Signal>(&std::fs::read(entry.path()).ok()?).ok()?;
        (signal.source=="codex" && signal.at<=now+5).then_some(signal)
    }).max_by_key(|s|s.at);
    let Some(signal)=latest else { return serde_json::json!({"received":false}); };
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
}
