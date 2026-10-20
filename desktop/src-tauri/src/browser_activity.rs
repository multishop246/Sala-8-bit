//! Loopback-only input from our extension. No URLs, titles or prompts are accepted.
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use std::io::{Read, Write};

const ORIGIN: &str = "chrome-extension://dnlepjhhfeiedffhpeblklljgabcocpi";
const TTL: Duration = Duration::from_secs(75);
#[derive(Clone, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct Signal { source: String, client: String, conversation: String, running: bool }
impl Signal {
    fn valid(&self) -> bool {
        ["chatgpt","claude","gemini","aistudio","flow","claude-code"].contains(&self.source.as_str())
            && !self.client.is_empty() && self.client.len() <= 32 && self.client.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
            && self.conversation.len() == 64 && self.conversation.chars().all(|c| c.is_ascii_hexdigit())
    }
}
#[derive(Default)]
struct Registry(HashMap<(String,String),(Instant,Signal)>);
impl Registry {
    fn update(&mut self, value: Signal, now: Instant) {
        self.0.retain(|_,(at,_)| now.duration_since(*at) < TTL);
        #[cfg(debug_assertions)]
        let changed=self.0.get(&(value.source.clone(),value.client.clone())).map(|(_,s)|s.running)!=Some(value.running);
        if self.0.len() < 512 || self.0.contains_key(&(value.source.clone(),value.client.clone())) {
            self.0.insert((value.source.clone(),value.client.clone()),(now,value));
        }
        #[cfg(debug_assertions)]
        if changed && std::env::var_os("SALA_ACTIVITY_DIAGNOSTIC").is_some() {
            println!("evento: conversas_executando={}",self.count(now));
        }
    }
    fn count(&self, now: Instant) -> u32 {
        self.0.values().filter(|(at,s)| now.duration_since(*at)<TTL && s.running)
            .map(|(_,s)| (&s.source,&s.conversation)).collect::<HashSet<_>>().len().min(20) as u32
    }
}
pub struct BrowserProbe(Arc<Mutex<Registry>>);
impl BrowserProbe {
    pub fn spawn(on_state: impl Fn(Option<u32>, bool) + Send + 'static) -> Self {
        let state = Arc::new(Mutex::new(Registry::default()));
        let shared = Arc::clone(&state);
        std::thread::spawn(move || {
            let listener=match std::net::TcpListener::bind("127.0.0.1:43187") {
                Ok(listener)=> { on_state(None,true); listener },
                Err(error)=> { on_state(None,false); eprintln!("Sala 8-bit: local extension receiver unavailable: {error}"); return; }
            };
            for mut stream in listener.incoming().flatten() {
                let _ = stream.set_read_timeout(Some(Duration::from_millis(750)));
                let _ = stream.set_write_timeout(Some(Duration::from_millis(750)));
                let status = handle(&mut stream,&shared);
                if status==200 {
                    let count=shared.lock().unwrap().count(Instant::now());
                    on_state(Some(count),true);
                }
                let text = if status==204 { "No Content" } else if status==200 { "OK" } else { "Forbidden" };
                let response = format!("HTTP/1.1 {status} {text}\r\nAccess-Control-Allow-Origin: {ORIGIN}\r\nVary: Origin\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, X-Sala-Activity\r\nAccess-Control-Allow-Private-Network: true\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                let _ = stream.write_all(response.as_bytes());
            }
        });
        Self(state)
    }
    pub fn agents(&self) -> u32 { self.0.lock().unwrap().count(Instant::now()) }
    #[cfg(debug_assertions)]
    pub fn samples(&self) -> usize {
        self.0.lock().unwrap().0.values().filter(|(at,_)|at.elapsed()<TTL).count()
    }
}
fn handle(stream: &mut impl Read, state: &Arc<Mutex<Registry>>) -> u16 {
    let mut bytes = Vec::new();
    let mut buf = [0u8;1024];
    let header_end;
    loop {
        let Ok(n) = stream.read(&mut buf) else { return 403; };
        if n==0 || bytes.len()+n>8192 { return 403; }
        bytes.extend_from_slice(&buf[..n]);
        if let Some(index) = bytes.windows(4).position(|s|s==b"\r\n\r\n") { header_end=index+4; break; }
    }
    let Ok(header) = std::str::from_utf8(&bytes[..header_end]) else { return 403; };
    let lines: Vec<_> = header.lines().collect();
    let field = |name:&str| lines.iter().skip(1).filter_map(|l|l.split_once(':')).find(|(key,_)| key.eq_ignore_ascii_case(name)).map(|(_,v)|v.trim());
    if field("Origin") != Some(ORIGIN) { return 403; }
    if lines.first()==Some(&"OPTIONS /activity HTTP/1.1") { return 204; }
    if lines.first()!=Some(&"POST /activity HTTP/1.1") || field("X-Sala-Activity")!=Some("1") || field("Content-Type")!=Some("application/json") { return 403; }
    let Some(length) = field("Content-Length").and_then(|v|v.parse::<usize>().ok()).filter(|n|*n<=2048) else { return 403; };
    while bytes.len()<header_end+length {
        let Ok(n)=stream.read(&mut buf) else { return 403; };
        if n==0 || bytes.len()+n>8192 { return 403; }
        bytes.extend_from_slice(&buf[..n]);
    }
    let Ok(value)=serde_json::from_slice::<Signal>(&bytes[header_end..header_end+length]) else { return 403; };
    if !value.valid() { return 403; }
    state.lock().unwrap().update(value,Instant::now());
    200
}
#[cfg(test)]
mod tests {
    use super::*;
    fn signal(client:&str,id:char,running:bool)->Signal { Signal{source:"chatgpt".into(),client:client.into(),conversation:id.to_string().repeat(64),running} }
    #[test] fn execution_is_per_conversation_not_per_tab_or_open_app() {
        let now=Instant::now(); let mut r=Registry::default();
        r.update(signal("1",'a',false),now); assert_eq!(r.count(now),0);
        r.update(signal("1",'a',true),now); r.update(signal("2",'a',true),now); assert_eq!(r.count(now),1);
        r.update(signal("3",'b',true),now); assert_eq!(r.count(now),2);
        r.update(signal("1",'a',false),now); r.update(signal("2",'a',false),now); assert_eq!(r.count(now),1);
        assert_eq!(r.count(now+Duration::from_secs(76)),0);
    }
    #[test] fn rejects_websites_and_message_content() {
        let state=Arc::new(Mutex::new(Registry::default()));
        let mut request=std::io::Cursor::new(b"POST /activity HTTP/1.1\r\nOrigin: https://example.com\r\nContent-Length: 0\r\n\r\n");
        assert_eq!(handle(&mut request,&state),403);
        assert!(serde_json::from_str::<Signal>(r#"{"source":"chatgpt","client":"1","conversation":"a","running":true,"prompt":"private"}"#).is_err());
    }
}
