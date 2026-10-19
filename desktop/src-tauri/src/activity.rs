//! Positive execution signals from local accessibility controls, never process presence.
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Clone, Default, serde::Deserialize)]
pub struct Activity { pub agents: u32 }
pub struct Probe(Arc<Mutex<Option<(Instant, Activity)>>>);
impl Probe {
    pub fn spawn() -> Self {
        let state = Arc::new(Mutex::new(None));
        #[cfg(target_os = "windows")]
        {
            let shared = Arc::clone(&state);
            std::thread::spawn(move || {
                use std::io::{BufRead, BufReader};
                use std::os::windows::process::CommandExt;
                use std::process::{Command, Stdio};
                loop {
                    if let Ok(mut child) = Command::new("powershell.exe")
                        .args(["-NoProfile", "-NonInteractive", "-Command", include_str!("activity.ps1")])
                        .creation_flags(0x08000000).stdin(Stdio::null()).stderr(Stdio::null()).stdout(Stdio::piped()).spawn() {
                        if let Some(stdout) = child.stdout.take() {
                            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                                if let Ok(value) = serde_json::from_str::<Activity>(&line) {
                                    *shared.lock().unwrap() = Some((Instant::now(), value));
                                }
                            }
                        }
                        let _ = child.wait();
                    }
                    std::thread::sleep(Duration::from_secs(10));
                }
            });
        }
        Self(state)
    }
    pub fn current(&self) -> Activity {
        self.0.lock().unwrap().as_ref().filter(|(at, _)| at.elapsed() < Duration::from_secs(12))
            .map(|(_, value)| value.clone()).unwrap_or_default()
    }
    pub fn sample_age_seconds(&self) -> Option<u64> {
        self.0.lock().unwrap().as_ref().map(|(at, _)| at.elapsed().as_secs())
    }
}
