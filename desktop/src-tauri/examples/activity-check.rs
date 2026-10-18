//! Read-only diagnostic of the product's native execution probe and lifecycle hooks.
//! No browser listener, remote requests, prompts, window titles or pairing changes.
#[path="../src/activity.rs"] mod activity;
#[path="../src/hook_activity.rs"] mod hook_activity;
fn main() {
    let probe = activity::Probe::spawn();
    let samples = std::env::args().nth(1).and_then(|s|s.parse::<u32>().ok()).unwrap_or(8).clamp(1,36);
    for sample in 0..samples {
        std::thread::sleep(std::time::Duration::from_secs(5));
        #[cfg(debug_assertions)]
        let sample_age = probe.sample_age_seconds();
        #[cfg(not(debug_assertions))]
        let sample_age: Option<u64> = None;
        println!("{}", serde_json::json!({
            "sample": sample,
            "native_agents": probe.current().agents,
            "native_sample_age_seconds": sample_age,
            "hook_agents": hook_activity::agents()
        }));
    }
}
