// Os comandos do app viram permissões ("allow-agent-info" etc.), liberadas em capabilities/main.json
// só para a janela do escritório.
const COMMANDS: &[&str] = &["agent_info", "set_office_url", "change_office", "agent_pair", "agent_unpair", "choose_folder", "save_report"];
fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(COMMANDS))).expect("erro no build do Tauri");
}
