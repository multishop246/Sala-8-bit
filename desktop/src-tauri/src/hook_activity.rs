//! Lifecycle state emitted by optional, user-installed Codex / Claude Code hooks.
//! No transcripts are read. PID + process start time prevents stale state after exit.
use std::collections::HashSet;
use std::time::{SystemTime, UNIX_EPOCH};

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
    let mut system=sysinfo::System::new();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let mut active=HashSet::new();
    for entry in files.flatten().take(512) {
        if entry.path().extension().and_then(|x|x.to_str())!=Some("json") { continue; }
        if !entry.metadata().map(|m|m.is_file() && m.len()<=2048).unwrap_or(false) { continue; }
        let Ok(bytes)=std::fs::read(entry.path()) else { continue; };
        let Ok(signal)=serde_json::from_slice::<Signal>(&bytes) else { continue; };
        let start=system.process(sysinfo::Pid::from_u32(signal.pid)).map(|p|p.start_time());
        if signal.active(now,start) { active.insert((signal.source,signal.conversation)); }
    }
    active.len().min(20) as u32
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
}
