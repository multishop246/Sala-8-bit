//! Classificação do minuto, feita no computador. O título da janela é usado só aqui
//! para saber a categoria da página e nunca sai do computador.
use serde::Deserialize;

#[derive(Debug, Clone, Default, Deserialize)]
pub struct Config {
    #[serde(default)] pub apps_trabalho: Vec<String>,
    #[serde(default)] pub apps_ia: Vec<String>,
    #[serde(default)] pub apps_comunicacao: Vec<String>,
    #[serde(default)] pub sites_trabalho: Vec<String>,
    #[serde(default)] pub sites_referencia: Vec<String>,
    #[serde(default)] pub sites_email: Vec<String>,
    #[serde(default = "default_idle")] pub ociosidade_min: u64,
    #[serde(default)] pub pasta_relatorios: Option<String>,
}
fn default_idle() -> u64 { 5 }

pub const WEB: &str = "Navegando na internet";
const BROWSERS: &[&str] = &["chrome", "google chrome", "msedge", "microsoft edge", "firefox", "safari", "brave", "brave browser", "opera", "opera gx", "operagx", "arc", "vivaldi", "chromium"];
const MUSIC_TITLES: &[&str] = &["youtube music", "spotify", "deezer", "soundcloud", "tidal", "apple music"];

/// minúsculas e sem acentos, para comparar nomes
pub fn norm(s: &str) -> String {
    s.to_lowercase().chars().map(|c| match c {
        'á' | 'à' | 'â' | 'ã' | 'ä' => 'a', 'é' | 'è' | 'ê' | 'ë' => 'e', 'í' | 'ì' | 'î' | 'ï' => 'i',
        'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o', 'ú' | 'ù' | 'û' | 'ü' => 'u', 'ç' => 'c', _ => c,
    }).collect()
}
fn has_any(hay: &str, list: &[String]) -> bool {
    let h = norm(hay);
    list.iter().any(|w| { let w = norm(w.trim()); !w.is_empty() && h.contains(&w) })
}
/// nome do app para mostrar na sala (sem ".exe" e sem caminho)
pub fn display_name(app: &str) -> String {
    let clean: String = app.chars().filter(|c| !c.is_control()).collect();
    let app = clean.as_str();
    let a = app.rsplit(['/', '\\']).next().unwrap_or(app);
    let a = a.strip_suffix(".exe").or_else(|| a.strip_suffix(".EXE")).unwrap_or(a);
    let a = a.strip_suffix(".app").unwrap_or(a);
    let a = a.trim();
    if a.is_empty() { "—".into() } else { a.chars().take(60).collect() }
}
pub fn is_browser(app: &str) -> bool {
    let a = norm(&display_name(app));
    BROWSERS.iter().any(|b| a == *b || a.starts_with(&format!("{b} ")))
}

#[derive(Debug, Clone, PartialEq)]
pub struct Minute { pub app: String, pub cat: &'static str, pub music_hint: bool }

/// app = nome do app em foco; title = título da janela (só local); idle_secs = sem teclado/mouse; agents = agentes de IA rodando
pub fn classify(app: &str, title: &str, idle_secs: u64, agents: u32, cfg: &Config) -> Minute {
    let browser = is_browser(app);
    let shown = if browser { WEB.to_string() } else { display_name(app) };
    let music_hint = browser && MUSIC_TITLES.iter().any(|m| norm(title).contains(m));
    if idle_secs >= cfg.ociosidade_min.max(1) * 60 {
        return Minute { app: shown, cat: if agents > 0 { "ia" } else { "idle" }, music_hint };
    }
    let cat = if browser {
        if has_any(title, &cfg.sites_email) { "com" }
        else if has_any(title, &cfg.apps_ia) || has_any(title, &cfg.sites_trabalho) || has_any(title, &cfg.apps_trabalho) { "prod" }
        else if has_any(title, &cfg.sites_referencia) { "ref" }
        else { "prod" }
    } else if norm(app).contains("sala 8-bit") { "com" }
    else if matches!(norm(&display_name(app)).as_str(), "notepad" | "bloco de notas" | "windows notepad" | "notepad++") { "prod" }
    else if has_any(app, &cfg.apps_ia) || has_any(app, &cfg.apps_trabalho) { "prod" }
    else if has_any(app, &cfg.apps_comunicacao) { "com" }
    else { "dis" };
    Minute { app: shown, cat, music_hint }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn cfg() -> Config {
        Config {
            apps_trabalho: vec!["Figma".into(), "Photoshop".into(), "Premiere Pro".into()],
            apps_ia: vec!["ChatGPT".into(), "Claude".into()],
            apps_comunicacao: vec!["Slack".into(), "WhatsApp".into()],
            sites_trabalho: vec!["Google Ads".into(), "Meta Business".into()],
            sites_referencia: vec!["Pinterest".into(), "YouTube".into()],
            sites_email: vec!["Gmail".into()],
            ociosidade_min: 5, ..Default::default()
        }
    }
    #[test] fn apps_das_funcoes() {
        assert_eq!(classify("Figma.exe", "Projeto X", 0, 0, &cfg()).cat, "prod");
        assert_eq!(classify("Adobe Photoshop 2025", "doc.psd", 0, 0, &cfg()).cat, "prod");
        assert_eq!(classify("Adobe Photoshop 2025", "", 0, 0, &cfg()).app, "Adobe Photoshop 2025");
    }
    #[test] fn navegador_nunca_mostra_o_site() {
        let m = classify("Google Chrome", "Pinterest - ideias de embalagem", 0, 0, &cfg());
        assert_eq!(m.app, WEB); assert_eq!(m.cat, "ref");
        assert_eq!(classify("msedge.exe", "Campanhas - Google Ads", 0, 0, &cfg()).cat, "prod");
        assert_eq!(classify("firefox", "Caixa de entrada - Gmail", 0, 0, &cfg()).cat, "com");
        assert_eq!(classify("Safari", "Notícias do dia", 0, 0, &cfg()).cat, "prod");
        assert_eq!(classify("Arc", "ChatGPT", 0, 0, &cfg()).cat, "prod");
    }
    #[test] fn ociosidade_e_ia() {
        assert_eq!(classify("Figma", "", 400, 0, &cfg()).cat, "idle");
        assert_eq!(classify("Figma", "", 400, 2, &cfg()).cat, "ia");
        assert_eq!(classify("Figma", "", 200, 0, &cfg()).cat, "prod");
    }
    #[test] fn comunicacao_e_distracao() {
        assert_eq!(classify("Slack", "", 0, 0, &cfg()).cat, "com");
        assert_eq!(classify("Sala 8-bit", "", 0, 0, &cfg()).cat, "com");
        assert_eq!(classify("Steam", "", 0, 0, &cfg()).cat, "dis");
    }
    #[test] fn acentos() { assert!(has_any("Gerenciador de Anúncios", &["gerenciador de anuncios".into()])); }
    #[test] fn agentes_e_musica() {
        assert!(classify("Google Chrome", "Música - YouTube Music", 0, 0, &cfg()).music_hint);
    }
    #[test] fn notes_browser_and_windows_nulls() {
        assert_eq!(display_name("Notepad.exe\0\0"), "Notepad");
        assert_eq!(classify("Notepad.exe\0", "anotacoes", 0, 0, &cfg()).cat, "prod");
        assert_eq!(classify("opera.exe", "Pesquisa", 0, 0, &cfg()).cat, "prod");
        assert_eq!(classify("OperaGX.exe", "Pesquisa", 0, 0, &cfg()).app, WEB);
        assert_eq!(classify("Codex.exe", "Codex", 400, 0, &cfg()).cat, "idle");
    }
}
