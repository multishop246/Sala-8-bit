//! Configuração guardada no computador (pasta de dados do app).
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Saved {
    /// endereço do escritório (o site da empresa)
    pub office_url: Option<String>,
    /// dados para o app mandar os minutos (preenchidos automaticamente pelo site)
    pub supabase_url: Option<String>,
    pub anon_key: Option<String>,
    pub token: Option<String>,
    /// pasta escolhida para os relatórios
    pub report_folder: Option<String>,
}

pub fn path(dir: &PathBuf) -> PathBuf { dir.join("config.json") }

pub fn load(dir: &PathBuf) -> Saved {
    std::fs::read_to_string(path(dir)).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}
pub fn save(dir: &PathBuf, c: &Saved) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    std::fs::write(path(dir), serde_json::to_string_pretty(c).unwrap_or_default())
}
