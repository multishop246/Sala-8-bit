//! Read-only diagnostic of the product's native execution probe and lifecycle hooks.
//! No browser listener, remote requests, prompts, window titles or pairing changes.
#[path="../src/activity.rs"] mod activity;
#[path="../src/hook_activity.rs"] mod hook_activity;
fn main() {
    let probe = activity::Probe::spawn();
    for sample in 0..8 {
        std::thread::sleep(std::time::Duration::from_secs(5));
        println!("{}", serde_json::json!({
            "sample": sample,
            "native_agents": probe.current().agents,
            "hook_agents": hook_activity::agents()
        }));
    }
}
