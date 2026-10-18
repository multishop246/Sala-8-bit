//! The real tracker against a disposable local database. Never changes pairing.
#[path="../src/classify.rs"] mod classify;
#[path="../src/config.rs"] mod config;
#[path="../src/activity.rs"] mod activity;
#[path="../src/media.rs"] mod media;
#[path="../src/browser_activity.rs"] mod browser_activity;
#[path="../src/hook_activity.rs"] mod hook_activity;
#[path="../src/tracker.rs"] mod tracker;
use std::io::Write;
fn main() {
    // Isolate hook fixtures from the real Codex conversation running this test.
    // Only this process and its test children see the alternate directory.
    std::env::set_var("SALA_ACTIVITY_HOOKS_DIR",std::env::current_dir().unwrap().join(".tools/test-localdata/Sala8bit/activity"));
    let setup:serde_json::Value=ureq::get("http://127.0.0.1:5999/_setup").call().expect("Start the local mock database first").into_json().unwrap();
    let state=std::sync::Arc::new(std::sync::Mutex::new(tracker::Shared{
        saved:config::Saved{supabase_url:Some("http://127.0.0.1:5999".into()),anon_key:Some("local-test-only".into()),token:Some(setup["token"].as_str().unwrap().into()),..Default::default()},
        cfg:None,cfg_at:None,live:tracker::Live::default(),paused:false
    }));
    tracker::spawn(state.clone());
    let mut output=std::fs::OpenOptions::new().create(true).append(true).open(".tools/end-to-end.log").unwrap();
    let mut previous=String::new();
    println!("Real tracker + disposable database active until stopped. No production pairing changed.");
    loop {
        std::thread::sleep(std::time::Duration::from_secs(1));
        let live=state.lock().unwrap().live.clone();
        let result=serde_json::json!({"agents":live.agents,"music":live.music,"connected":live.conectado,"error":live.erro}).to_string();
        if result!=previous {
            let line=format!("{} {}",chrono::Utc::now().to_rfc3339(),result);
            println!("{line}");writeln!(output,"{line}").unwrap();let _=output.flush();previous=result;
        }
    }
}
