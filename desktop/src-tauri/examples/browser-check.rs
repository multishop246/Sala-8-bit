//! Temporary local diagnostic. No Supabase connection or message contents.
#[path = "../src/browser_activity.rs"] mod browser_activity;
fn main() {
    std::env::set_var("SALA_ACTIVITY_DIAGNOSTIC","1");
    let probe=browser_activity::BrowserProbe::spawn(|_,_|{});
    println!("Receptor temporario: 127.0.0.1:43187 (10 minutos)");
    let mut previous=None;
    for _ in 0..300 {
        std::thread::sleep(std::time::Duration::from_secs(2));
        let current=(probe.samples(),probe.agents());
        if previous!=Some(current) {
            println!("abas_conectadas={}, conversas_executando={}",current.0,current.1);
            previous=Some(current);
        }
    }
}
